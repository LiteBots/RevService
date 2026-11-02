/* RevMi 2.0.0 — logowanie (hasło / PIN), kod 2FA, wymuszona konfiguracja 2FA, blokada PIN-em */
import { api, esc, icon, toast, busy, local, avatar, S, VERSION } from './core.js';

const brand = (title, text) => `
  <div class="auth-brand">
    <div class="logo"><b>Rev</b>Mi<small>${VERSION}</small></div>
    <div><h1>${title}</h1><p>${text}</p></div>
    <p class="small muted">revserwis.pl · aplikacja ekipy RevSerwis</p>
  </div>`;

function screen(root, card, { title = 'Cała firma<br>w jednym miejscu.', text = 'Zlecenia, grafik, ekipa i finanse RevSerwis — na komputerze i w telefonie.' } = {}) {
  root.innerHTML = `<div class="auth">${brand(title, text)}<div class="auth-form"><div class="auth-card">${card}</div></div></div>`;
  return root.querySelector('.auth-card');
}

/** Ekran logowania. Po sukcesie wywołuje done(result). */
export function loginScreen(root, done) {
  let mode = local.get('loginMode', 'password');
  const render = () => {
    const card = screen(root, mode === 'password' ? `
      <h2>Zaloguj się</h2>
      <p class="sub">E-mail lub numer telefonu i hasło.</p>
      <form class="col" id="f" autocomplete="on">
        <label class="field"><span>E-mail lub telefon</span><input class="input" name="login" autocomplete="username" inputmode="email" required value="${esc(local.get('lastLogin', ''))}"></label>
        <label class="field"><span>Hasło</span><input class="input" name="password" type="password" autocomplete="current-password" required></label>
        <button class="btn primary lg block" type="submit">Zaloguj się</button>
      </form>
      <div class="row between small"><button class="link-btn" data-mode="pin">${icon('grid', 'sm')} Zaloguj PIN-em</button><span class="muted">Nie pamiętasz hasła? Zapytaj biuro.</span></div>
    ` : `
      <h2>Logowanie PIN-em</h2>
      <p class="sub">Główny PIN właściciela albo PIN pracownika (4–8 cyfr).</p>
      <form class="col" id="f">
        <label class="field"><span>PIN</span><input class="input" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="8" autocomplete="one-time-code" required style="font-size:22px;letter-spacing:.4em;text-align:center"></label>
        <button class="btn primary lg block" type="submit">Dalej</button>
      </form>
      <button class="link-btn small" data-mode="password">${icon('mail', 'sm')} Zaloguj e-mailem lub telefonem</button>
    `);
    card.querySelector('[data-mode]').addEventListener('click', e => { mode = e.currentTarget.dataset.mode; local.set('loginMode', mode); render(); });
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
    <button class="link-btn small" data-out style="margin-top:18px">Nie Ty? Zaloguj się innym kontem</button>`;
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
