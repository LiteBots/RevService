/* RevMi 2.1.0 — logowanie (hasło / PIN / Face ID), kod 2FA, wymuszona konfiguracja 2FA, blokada PIN-em */
import { api, esc, icon, tile, toast, busy, local, avatar, S, VERSION } from './core.js';

const FEATS = [
  ['trend', 'mint', 'Prognoza zarobków', 'tydzień i miesiąc'],
  ['route', 'cyan', 'Trasy i GPS', 'ekipy w terenie'],
  ['layers', 'indigo', 'Pakiety B2B', 'limity i faktury'],
  ['shield', 'violet', 'Face ID i 2FA', 'bezpieczne konto']
];

const brand = (title, text) => `
  <div class="auth-brand">
    <img class="bg-mark" src="/revmi/icons/logo-mark.png" alt="">
    <div class="logo"><img src="/revmi/icons/brand.png" alt="RevSerwis"><div><div class="wordmark">Rev<b>Serwis</b></div><small>RevMi <span class="pro">PRO</span></small></div></div>
    <div>
      <span class="pill mint" style="margin-bottom:20px">${icon('bolt', 'sm')} RevMi PRO ${VERSION.slice(0, 3)}</span>
      <h1>${title}</h1><p>${text}</p>
      <div class="auth-feats hide-m">${FEATS.map(([i, c, a, b]) => `<div>${tile(i, c)}<div><b class="small">${a}</b><small>${b}</small></div></div>`).join('')}</div>
    </div>
    <p class="auth-foot hide-m">© ${new Date().getFullYear()} RevSerwis · Słupsk · v${VERSION}</p>
  </div>`;

function screen(root, card, { title = 'Cała firma<br>w <em>jednym miejscu.</em>', text = 'Zlecenia, grafik, ekipy w terenie, finanse i pakiety B2B. Dla biura i dla ekipy, na komputerze i w telefonie.' } = {}) {
  root.innerHTML = `<div class="auth">${brand(title, text)}<div class="auth-form"><div class="auth-card"><img class="app-icon" src="/revmi/icons/brand.png" alt="">${card}</div></div></div>`;
  return root.querySelector('.auth-card');
}

/* ------------------------------------------------------------------ */
/* Klucze dostępu (WebAuthn) — bez zewnętrznych bibliotek              */
/* ------------------------------------------------------------------ */

const b64u = {
  toBuf: s => { const p = s.replace(/-/g, '+').replace(/_/g, '/'); const bin = atob(p + '='.repeat((4 - (p.length % 4)) % 4)); return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer; },
  from: buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
};
export const passkeysSupported = () => Boolean(window.PublicKeyCredential && navigator.credentials?.get) && window.isSecureContext;

const credJson = cred => ({
  id: cred.id,
  rawId: b64u.from(cred.rawId),
  type: cred.type,
  clientExtensionResults: cred.getClientExtensionResults?.() || {},
  authenticatorAttachment: cred.authenticatorAttachment || undefined,
  response: Object.fromEntries(Object.entries({
    clientDataJSON: cred.response.clientDataJSON,
    attestationObject: cred.response.attestationObject,
    authenticatorData: cred.response.authenticatorData,
    signature: cred.response.signature,
    userHandle: cred.response.userHandle
  }).filter(([, v]) => v).map(([k, v]) => [k, b64u.from(v)]).concat(cred.response.getTransports ? [['transports', cred.response.getTransports()]] : []))
});

const niceError = e => (e?.name === 'NotAllowedError' ? new Error('Anulowano albo upłynął czas na potwierdzenie') : e?.name === 'InvalidStateError' ? new Error('Ten klucz jest już dodany na tym urządzeniu') : e);

/** Logowanie Face ID / Touch ID / Windows Hello. */
export async function passkeyLogin() {
  const { options } = await api('/v2/passkey/login/options', { method: 'POST', body: {} });
  let cred;
  try {
    cred = await navigator.credentials.get({ publicKey: { ...options, challenge: b64u.toBuf(options.challenge), allowCredentials: (options.allowCredentials || []).map(c => ({ ...c, id: b64u.toBuf(c.id) })) } });
  } catch (e) { throw niceError(e); }
  return api('/v2/passkey/login/verify', { method: 'POST', body: { response: credJson(cred) } });
}

/** Dodanie klucza na tym urządzeniu (po zalogowaniu). */
export async function passkeyRegister(label = '') {
  const { options } = await api('/v2/passkey/register/options', { method: 'POST', body: {} });
  let cred;
  try {
    cred = await navigator.credentials.create({ publicKey: {
      ...options,
      challenge: b64u.toBuf(options.challenge),
      user: { ...options.user, id: b64u.toBuf(options.user.id) },
      excludeCredentials: (options.excludeCredentials || []).map(c => ({ ...c, id: b64u.toBuf(c.id) }))
    } });
  } catch (e) { throw niceError(e); }
  const r = await api('/v2/passkey/register/verify', { method: 'POST', body: { response: credJson(cred), label } });
  local.set('hasPasskey', true);
  return r;
}

/** Ekran logowania. Po sukcesie wywołuje done(result). */
export function loginScreen(root, done) {
  let mode = local.get('loginMode', 'password');
  const pk = passkeysSupported();
  const passkeyBtn = pk ? `<div class="or">albo</div><button class="btn lg block" type="button" data-passkey>${icon('face')} Zaloguj Face ID / Touch ID</button>` : '';
  const render = () => {
    const card = screen(root, mode === 'password' ? `
      <h2>Zaloguj się</h2>
      <p class="sub">Witaj ponownie w panelu RevMi.</p>
      <div class="seg" style="display:flex"><button class="on" style="flex:1" type="button">E-mail lub telefon</button><button style="flex:1" type="button" data-mode="pin">PIN</button></div>
      <form class="col" id="f" autocomplete="on">
        <label class="field"><span>E-mail lub telefon</span><input class="input" name="login" autocomplete="username webauthn" inputmode="email" required value="${esc(local.get('lastLogin', ''))}"></label>
        <label class="field"><span>Hasło</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary lg block" type="submit">Zaloguj się ${icon('right')}</button>
      </form>
      ${passkeyBtn}
      <p class="small muted" style="text-align:center">Nie pamiętasz hasła? Zapytaj biuro.</p>
    ` : `
      <h2>Logowanie PIN-em</h2>
      <p class="sub">Główny PIN właściciela albo PIN pracownika (4–8 cyfr).</p>
      <div class="seg" style="display:flex"><button style="flex:1" type="button" data-mode="password">E-mail lub telefon</button><button class="on" style="flex:1" type="button">PIN</button></div>
      <form class="col" id="f">
        <label class="field"><span>PIN</span><input class="input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="one-time-code" required style="font-size:22px;letter-spacing:.4em;text-align:center"></label>
        <button class="btn primary lg block" type="submit">Dalej ${icon('right')}</button>
      </form>
      ${passkeyBtn}
    `);
    card.querySelector('[data-mode]').addEventListener('click', e => { mode = e.currentTarget.dataset.mode; local.set('loginMode', mode); render(); });
    card.querySelector('[data-passkey]')?.addEventListener('click', e => busy(e.currentTarget, async () => done(await passkeyLogin())));
    const form = card.querySelector('#f');
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const btn = form.querySelector('button[type=submit]');
      await busy(btn, async () => {
        const fd = Object.fromEntries(new FormData(form));
        const r = mode === 'password'
          ? await api('/v2/login', { method: 'POST', body: { login: fd.login, password: fd.password } })
          : await api('/login', { method: 'POST', body: { pin: fd.pin } });
        if (mode === 'password') local.set('lastLogin', fd.login);
        if (r.need2fa) return twoFactorScreen(root, r.name, done);
        done(r);
      });
    });
    setTimeout(() => form.querySelector('input:not([value]), input[value=""]')?.focus() || form.querySelector('input[type=password]')?.focus(), 50);
  };
  render();
}

/** Drugi krok: 6 cyfr z aplikacji uwierzytelniającej. */
export function twoFactorScreen(root, name, done) {
  const card = screen(root, `
    <div class="steps"><span class="on">✓ Dane logowania</span><span class="on">2 Kod 2FA</span></div>
    <h2>Weryfikacja dwuetapowa</h2>
    <p class="sub">${esc(name || '')} — wpisz 6 cyfr z Google Authenticator / Authy.</p>
    ${codeInputs()}
    <button class="btn primary lg block" data-go>Zaloguj się</button>
    <button class="link-btn small" data-back>${icon('left', 'sm')} Wróć do logowania</button>`);
  const read = wireCode(card, () => card.querySelector('[data-go]').click());
  card.querySelector('[data-back]').addEventListener('click', () => api('/logout', { method: 'POST' }).finally(() => loginScreen(root, done)));
  card.querySelector('[data-go]').addEventListener('click', e => busy(e.currentTarget, async () => {
    const code = read();
    if (code.length !== 6) throw new Error('Wpisz 6 cyfr');
    const r = await api('/login/2fa', { method: 'POST', body: { code } });
    done(r);
  }));
}

/** Administrator bez 2FA: musi je skonfigurować, zanim zobaczy dane firmy. */
export function forceTwoFactorSetup(root, me, done) {
  const card = screen(root, `
    <div class="steps"><span class="on">✓ Zalogowano</span><span class="on">2 Włącz 2FA</span></div>
    <h2>Zabezpiecz konto administratora</h2>
    <p class="sub">Konto z dostępem do finansów i danych klientów wymaga logowania dwuetapowego.</p>
    <ol class="small" style="margin:0;padding-left:18px;display:grid;gap:6px;color:var(--text-2)">
      <li>Zainstaluj Google Authenticator, Microsoft Authenticator albo Authy.</li>
      <li>Zeskanuj kod QR (albo wpisz klucz ręcznie).</li>
      <li>Wpisz 6 cyfr z aplikacji.</li>
    </ol>
    <div class="col" id="qrWrap" style="align-items:center"><div class="skeleton" style="width:204px;height:204px;min-height:0"></div></div>
    ${codeInputs()}
    <button class="btn primary lg block" data-go>Włącz 2FA i przejdź dalej</button>
    <button class="link-btn small" data-out>${icon('logout', 'sm')} Wyloguj</button>`, { title: 'Bezpieczeństwo<br>przede wszystkim.', text: `Cześć, ${esc(me?.name || '')}. Jeden raz skonfigurujesz 2FA i gotowe.` });
  const read = wireCode(card, () => card.querySelector('[data-go]').click());
  card.querySelector('[data-out]').addEventListener('click', () => api('/logout', { method: 'POST' }).finally(() => location.reload()));
  api('/v92/2fa/setup', { method: 'POST' }).then(async r => {
    const wrap = card.querySelector('#qrWrap');
    wrap.innerHTML = `<div class="qr-box" id="qr"></div><div class="small muted" style="text-align:center">Klucz: <code style="user-select:all;word-break:break-all;color:var(--text)">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</code></div>`;
    try { await loadQr(); new window.QRCode(card.querySelector('#qr'), { text: r.otpauth, width: 180, height: 180 }); } catch { card.querySelector('#qr').remove(); }
  }).catch(e => toast(e.message, 'err'));
  card.querySelector('[data-go]').addEventListener('click', e => busy(e.currentTarget, async () => {
    const code = read();
    if (code.length !== 6) throw new Error('Wpisz 6 cyfr z aplikacji');
    await api('/v92/2fa/enable', { method: 'POST', body: { code } });
    toast('2FA włączone — konto zabezpieczone', 'ok');
    done();
  }));
}

export const loadQr = () => (window.QRCode ? Promise.resolve() : new Promise((resolve, reject) => {
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
  s.onload = resolve;
  s.onerror = reject;
  document.head.appendChild(s);
}));

const codeInputs = () => `<input class="input code-input" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" placeholder="••••••" aria-label="Kod z aplikacji">`;

/** Jedno pole na 6 cyfr — działa z autouzupełnianiem kodu i wklejaniem. */
function wireCode(root, submit) {
  const input = root.querySelector('.code-input');
  input.addEventListener('input', () => {
    input.value = input.value.replace(/\D/g, '').slice(0, 6);
    if (input.value.length === 6) submit();
  });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  setTimeout(() => input.focus(), 50);
  return () => input.value;
}

/* ------------------------------------------------------------------ */
/* Blokada PIN-em po bezczynności                                      */
/* ------------------------------------------------------------------ */

let lockEl = null;

export function showLock(onUnlocked) {
  if (lockEl) return;
  const me = S.me || {};
  let pin = '';
  lockEl = document.createElement('div');
  lockEl.className = 'lock';
  lockEl.innerHTML = `
    ${avatar(me.name, me.color)}
    <div style="font-size:20px;font-weight:800;margin-top:6px">Cześć, ${esc(String(me.name || '').split(' ')[0])}</div>
    <div class="muted small">Wpisz PIN, aby odblokować</div>
    <div class="pin-dots">${'<i></i>'.repeat(4)}</div>
    <div class="keypad">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => `<button data-k="${n}">${n}</button>`).join('')}<button class="txt" data-ok>OK</button><button data-k="0">0</button><button class="txt" data-del>Usuń</button></div>
    ${me.passkeys && passkeysSupported() ? `<button class="btn" data-pk style="margin-top:16px">${icon("face")} Odblokuj Face ID / Touch ID</button>` : ""}
    <button class="link-btn small" data-out style="margin-top:14px">Nie Ty? Zaloguj się innym kontem</button>
    <img src="/revmi/icons/brand.png" alt="RevSerwis" style="position:absolute;top:calc(22px + var(--safe-top));left:22px;width:36px;height:36px;border-radius:10px">`;
  document.body.appendChild(lockEl);
  const dots = lockEl.querySelector('.pin-dots');
  const paint = () => { const n = Math.max(4, pin.length); dots.innerHTML = Array.from({ length: n }, (_, i) => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join(''); };
  const submit = async () => {
    if (pin.length < 4) return;
    try {
      await api('/v2/unlock', { method: 'POST', body: { pin } });
      lockEl.remove();
      lockEl = null;
      local.set('lastActive', Date.now());
      onUnlocked?.();
    } catch (error) {
      if (error.data?.loggedOut) return location.reload();
      pin = '';
      paint();
      dots.classList.remove('shake'); void dots.offsetWidth; dots.classList.add('shake');
      toast(error.message, 'err');
    }
  };
  lockEl.addEventListener('click', e => {
    const k = e.target.closest('[data-k]');
    if (k && pin.length < 8) { pin += k.dataset.k; paint(); if (pin.length === 8) submit(); }
    if (e.target.closest('[data-del]')) { pin = pin.slice(0, -1); paint(); }
    if (e.target.closest('[data-ok]')) submit();
    if (e.target.closest('[data-out]')) api('/logout', { method: 'POST' }).finally(() => location.reload());
    const pkBtn = e.target.closest('[data-pk]');
    if (pkBtn) busy(pkBtn, async () => {
      const r = await passkeyLogin();
      // Inne konto niż zablokowane → pełne przeładowanie z nowym kontem
      if ((r.employeeId || null) !== (me.employeeId || null) || r.role !== me.role) return location.reload();
      lockEl.remove();
      lockEl = null;
      local.set('lastActive', Date.now());
      onUnlocked?.();
    });
  });
  const onKey = e => {
    if (!lockEl) return document.removeEventListener('keydown', onKey);
    if (/^\d$/.test(e.key) && pin.length < 8) { pin += e.key; paint(); }
    else if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint(); }
    else if (e.key === 'Enter') submit();
  };
  document.addEventListener('keydown', onKey);
}

export const isLocked = () => Boolean(lockEl);
