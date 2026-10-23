/* RevSerwis 9.0 — panel klienta /konto (SPA na hashach).
   Logowanie e-mail + hasło, zlecenia ze śledzeniem, nowe zlecenie, RevStorage, abonamenty, zakupy (RevOutlet, RevPowrót),
   panele B2B (hotele i pensjonaty, biura nieruchomości — gdy administrator nada dostęp), ustawienia i dane. */
'use strict';

(function () {
  const RV = window.RV;
  const { esc, $, $$ } = RV;
  const root = () => $('#kontoApp');
  const S = { me: null, dash: null };

  const STATUS = {
    new: ['Przyjęte', 'muted', 'fa-inbox'], quoted: ['Wycena gotowa', 'amber', 'fa-file-invoice-dollar'], planned: ['Zaplanowane', 'blue', 'fa-calendar-check'],
    progress: ['W realizacji', 'mint', 'fa-truck-fast'], completed: ['Zakończone', 'mint', 'fa-circle-check'], cancelled: ['Anulowane', 'red', 'fa-ban']
  };
  const badge = s => `<span class="pt-badge ${STATUS[s]?.[1] || ''}">${esc(STATUS[s]?.[0] || s)}</span>`;
  const PAY = { unpaid: ['Do zapłaty', 'amber'], partial: ['Częściowo opłacone', 'amber'], paid: ['Opłacone', 'mint'] };
  const SUB = { pending: ['Czeka na aktywację', 'amber'], active: ['Aktywny', 'mint'], paused: ['Wstrzymany', 'muted'], cancelled: ['Zakończony', 'red'] };
  const ORDER = { new: ['Nowa', 'amber'], confirmed: ['Potwierdzona', 'blue'], completed: ['Zrealizowana', 'mint'], cancelled: ['Anulowana', 'red'] };
  const tag = ([l, t] = ['—', '']) => `<span class="pt-badge ${t}">${esc(l)}</span>`;
  const initials = n => String(n || '?').trim().split(/\s+/).slice(0, 2).map(p => p[0] || '').join('').toUpperCase();
  const range = e => (!e ? '' : e.low === e.high ? RV.money(e.low) : `${RV.money(e.low)} – ${RV.money(e.high)}`);
  const empty = (icon, title, text, action = '') => `<div class="pt-empty"><i class="fa-solid ${icon}"></i><h3>${esc(title)}</h3><p>${esc(text)}</p>${action ? `<p style="margin-top:14px">${action}</p>` : ''}</div>`;
  const has = k => (S.me?.access || []).includes(k);

  /* ------------------------------------------------------------------ */
  /* Logowanie / rejestracja / reset (9.0.1 — układ dzielony, kroki)      */
  /* ------------------------------------------------------------------ */

  const TYPES = [
    { key: 'person', icon: 'fa-user', title: 'Osoba prywatna', text: 'Przeprowadzka, opróżnianie, transport, ogród — dla domu.' },
    { key: 'company', icon: 'fa-building', title: 'Firma', text: 'Faktury VAT, stałe zlecenia, obsługa obiektu.' },
    { key: 'hotel', icon: 'fa-hotel', title: 'Hotel / pensjonat', text: 'Stałe trasy, dostawy, zestawienia do faktury.', tag: 'Panel B2B' },
    { key: 'partner', icon: 'fa-handshake', title: 'Biuro nieruchomości', text: 'Polecaj klientów i zarabiaj prowizję.', tag: 'Panel B2B' },
    { key: 'developer', icon: 'fa-city', title: 'Deweloper', text: 'Przeprowadzki dla nabywców Twoich mieszkań.', tag: 'Panel B2B' }
  ];
  const B2B_TYPES = ['hotel', 'partner', 'developer'];
  const B2B_NAMES = { hotel: 'panel dla hoteli i pensjonatów', partner: 'portal partnera', developer: 'panel dewelopera' };
  const DOMAINS = ['gmail.com', 'wp.pl', 'o2.pl', 'onet.pl', 'interia.pl', 'op.pl', 'poczta.onet.pl', 'outlook.com', 'hotmail.com', 'icloud.com', 'yahoo.com', 'tlen.pl', 'gazeta.pl', 'vp.pl'];

  /** Podpowiedź literówki w domenie e-maila (np. gmial.com → gmail.com). */
  function emailSuggest(v) {
    const m = String(v || '').trim().toLowerCase().match(/^([^@\s]+)@([^@\s]+)$/);
    if (!m || DOMAINS.includes(m[2])) return '';
    const dist = (a, b) => {
      const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
      for (let j = 1; j <= b.length; j++) d[0][j] = j;
      for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      return d[a.length][b.length];
    };
    const best = DOMAINS.map(dm => [dm, dist(m[2], dm)]).sort((x, y) => x[1] - y[1])[0];
    return best && best[1] > 0 && best[1] <= 2 ? `${m[1]}@${best[0]}` : '';
  }

  function pwCheck(v) {
    const r = { len: v.length >= 8, letter: /[A-Za-ząćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(v), digit: /\d/.test(v), extra: v.length >= 12 || /[^A-Za-z0-9ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/.test(v) };
    const score = !v ? 0 : (r.len && r.letter && r.digit) ? (r.extra ? 4 : 3) : (r.len || (r.letter && r.digit)) ? 2 : 1;
    return { ...r, score, ok: r.len && r.letter && r.digit };
  }

  const input = ({ id, name, type = 'text', icon, label, placeholder = '', value = '', auto = 'off', extra = '', right = '', hint = '' }) => `<div class="ka-field">
      <label for="${id}"><span>${label}</span>${right}</label>
      <div class="ka-input"><i class="fa-solid ${icon} lead" aria-hidden="true"></i><input id="${id}" name="${name}" type="${type}" placeholder="${esc(placeholder)}" value="${esc(value)}" autocomplete="${auto}" ${extra}>${type === 'password' ? `<button type="button" class="ka-eye" data-eye="${id}" aria-label="Pokaż hasło"><i class="fa-solid fa-eye"></i></button>` : ''}</div>
      <div class="ka-hint" id="${id}Hint" aria-live="polite">${hint}</div></div>`;

  function brandPanel(mode) {
    const reg = mode === 'register';
    return `<aside class="ka-brand">
      <a class="ka-logo" href="index.html"><img src="assets/brand/revserwis-mark.png" alt="" width="38" height="38"><span>Rev<b>Serwis</b></span></a>
      <div><h2>${reg ? 'Załóż konto i <span>miej wszystko pod ręką</span>' : 'Twoje zlecenia <span>w jednym miejscu</span>'}</h2></div>
      <p class="ka-hide-m">${reg ? 'Zamawiasz, śledzisz i zarządzasz usługami RevSerwis bez dzwonienia — z telefonu albo komputera.' : 'Zaloguj się, żeby sprawdzić status zlecenia, wycenę, termin i zdjęcia z realizacji.'}</p>
      <ul class="ka-feats">
        <li><i class="fa-solid fa-location-crosshairs"></i><span><strong>Śledzenie jak u kuriera</strong><small>Wycena → termin → ekipa w drodze → gotowe</small></span></li>
        <li><i class="fa-solid fa-file-invoice-dollar"></i><span><strong>Akceptacja wyceny jednym kliknięciem</strong><small>Bez maili i telefonów w tę i z powrotem</small></span></li>
        <li><i class="fa-solid fa-box-archive"></i><span><strong>RevStorage i abonamenty</strong><small>Twoje rzeczy w magazynie, wizyty, odśnieżanie</small></span></li>
        <li><i class="fa-solid fa-clock-rotate-left"></i><span><strong>Historia i „zamów ponownie”</strong><small>Zdjęcia przed/po, płatności, oceny</small></span></li>
      </ul>
      <div class="ka-preview" aria-hidden="true">
        <div class="ka-preview-head"><span><i class="fa-solid fa-truck-fast" style="color:var(--rv-accent)"></i> Przeprowadzka · RV-8F3A21</span><small>W realizacji</small></div>
        <div class="ka-mini"><span class="on"></span><span class="on"></span><span class="on"></span><span class="now"></span><span></span></div>
        <div class="ka-preview-row"><span>Ekipa: Piotr, Marek</span><span>Przyjazd ok. <b>10:40</b></span></div>
      </div>
      <div class="ka-trust"><span><b>★★★★★</b> 5,0 w Google</span><span><i class="fa-solid fa-lock" style="color:var(--rv-accent)"></i> Hasło szyfrowane</span><span><i class="fa-solid fa-phone" style="color:var(--rv-accent)"></i> 735 396 534</span></div>
    </aside>`;
  }

  function authView(mode = 'login', notice = '', opts = {}) {
    document.title = (mode === 'register' ? 'Załóż konto' : mode === 'forgot' ? 'Reset hasła' : mode === 'reset' ? 'Nowe hasło' : 'Logowanie') + ' · RevSerwis';
    const reset = new URLSearchParams(location.search).get('reset');
    if (reset) mode = 'reset';
    const r = root();
    r.className = 'ka-wrap';
    r.innerHTML = `<div class="ka">${brandPanel(mode)}<section class="ka-main" id="kaMain"></section></div>`;
    const main = $('#kaMain', r);
    const switcher = active => `<div class="ka-switch ${active === 'register' ? 'reg' : ''}" role="tablist"><span class="pill"></span><button type="button" role="tab" data-mode="login" class="${active === 'login' ? 'on' : ''}" aria-selected="${active === 'login'}">Logowanie</button><button type="button" role="tab" data-mode="register" class="${active === 'register' ? 'on' : ''}" aria-selected="${active === 'register'}">Załóż konto</button></div>`;
    const noticeHtml = notice ? `<div class="ka-notice ${opts.error ? 'err' : ''}"><i class="fa-solid ${opts.error ? 'fa-circle-exclamation' : 'fa-circle-check'}"></i><span>${notice}</span></div>` : '';
    const errBox = '<div class="ka-notice err" data-err hidden role="alert"><i class="fa-solid fa-circle-exclamation"></i><span></span></div>';
    const showErr = (msg) => { const b = $('[data-err]', main); if (!b) return RV.toast(msg, 'error'); $('span', b).textContent = msg; b.hidden = !msg; };
    const busy = (btn, on, label) => { btn.disabled = on; if (on) { btn.dataset.l = btn.innerHTML; btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> ${label}`; } else if (btn.dataset.l) btn.innerHTML = btn.dataset.l; };

    const bindCommon = () => {
      $$('[data-mode]', main).forEach(b => b.addEventListener('click', () => authView(b.dataset.mode)));
      $$('[data-eye]', main).forEach(b => b.addEventListener('click', () => {
        const i = $('#' + b.dataset.eye, main);
        const show = i.type === 'password';
        i.type = show ? 'text' : 'password';
        b.innerHTML = `<i class="fa-solid ${show ? 'fa-eye-slash' : 'fa-eye'}"></i>`;
        b.setAttribute('aria-label', show ? 'Ukryj hasło' : 'Pokaż hasło');
      }));
      $$('input[type=password]', main).forEach(i => {
        const hint = $('#' + i.id + 'Hint', main);
        const caps = e => { if (!hint || !e.getModifierState) return; const on = e.getModifierState('CapsLock'); if (on) { hint.className = 'ka-hint warn'; hint.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> Włączony Caps Lock'; } else if (hint.dataset.caps !== undefined || hint.textContent.includes('Caps')) { hint.className = 'ka-hint'; hint.textContent = ''; } };
        i.addEventListener('keyup', caps);
        i.addEventListener('keydown', caps);
      });
      $$('input[type=email]', main).forEach(i => {
        const hint = $('#' + i.id + 'Hint', main);
        const check = () => {
          const s = emailSuggest(i.value);
          if (s) { hint.className = 'ka-hint warn'; hint.innerHTML = `Czy chodziło o <button type="button">${esc(s)}</button>?`; $('button', hint).addEventListener('click', () => { i.value = s; hint.textContent = ''; hint.className = 'ka-hint'; i.focus(); }); }
          else { hint.textContent = ''; hint.className = 'ka-hint'; }
        };
        i.addEventListener('blur', check);
      });
      setTimeout(() => main.querySelector('input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not(.pt-hp)')?.focus(), 60);
    };

    /* ---------- Logowanie ---------- */
    if (mode === 'login') {
      main.innerHTML = `${switcher('login')}<div class="ka-anim" style="display:grid;gap:18px">
        <div><h1>Witaj ponownie</h1><p class="ka-sub" style="margin-top:4px">Zaloguj się do panelu klienta RevSerwis.</p></div>
        ${noticeHtml}
        <form class="ka-form" id="kaForm" novalidate>
          ${input({ id: 'lgEmail', name: 'email', type: 'email', icon: 'fa-envelope', label: 'E-mail', placeholder: 'jan@przyklad.pl', value: opts.email || '', auto: 'email', extra: 'required inputmode="email"' })}
          ${input({ id: 'lgPass', name: 'password', type: 'password', icon: 'fa-lock', label: 'Hasło', placeholder: '••••••••', auto: 'current-password', extra: 'required', right: '<button type="button" class="ka-link" data-mode="forgot">Nie pamiętasz?</button>' })}
          <label class="ka-check plain"><input type="checkbox" name="remember" checked><span>Nie wylogowuj mnie na tym urządzeniu</span></label>
          ${errBox}
          <div class="ka-actions"><button class="rv-button" type="submit">Zaloguj się <i class="fa-solid fa-arrow-right"></i></button></div>
        </form>
        <div class="ka-sep">albo</div>
        <div class="ka-alt"><a href="wycena.html"><i class="fa-solid fa-bolt" style="color:var(--rv-accent)"></i> Wycena bez konta</a><a class="wa" href="https://wa.me/48735396534" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a></div>
        <p class="ka-foot">Nie masz konta? <button type="button" data-mode="register">Załóż je w minutę</button></p></div>`;
      bindCommon();
      const form = $('#kaForm', main);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        showErr('');
        if (!form.email.value.trim() || !form.password.value) { showErr('Podaj e-mail i hasło.'); return; }
        const btn = form.querySelector('[type=submit]');
        busy(btn, true, 'Logowanie…');
        try {
          const res = await RV.api('/api/konto/login', { method: 'POST', body: { email: form.email.value.trim(), password: form.password.value, remember: form.remember.checked } });
          S.me = res.account;
          start();
        } catch (err) { showErr(err.message); $('#lgPass', main).closest('.ka-input').classList.add('bad'); busy(btn, false); }
      });
      return;
    }

    /* ---------- Rejestracja (3 kroki) ---------- */
    if (mode === 'register') {
      const st = opts.state || { step: 1, type: 'person', data: {} };
      const rid = st.rid || (st.rid = RV.rid());
      const isCo = () => st.type !== 'person';
      const steps = ['Typ konta', 'Dane', 'Hasło'];
      const stepsBar = () => `<div class="ka-steps" aria-label="Krok ${st.step} z 3">${steps.map((l, i) => `${i ? `<span class="ln ${st.step > i ? 'done' : ''}"></span>` : ''}<span class="ka-step ${st.step === i + 1 ? 'on' : st.step > i + 1 ? 'done' : ''}"><b>${st.step > i + 1 ? '<i class="fa-solid fa-check"></i>' : i + 1}</b><span>${l}</span></span>`).join('')}</div>`;
      const save = () => { const f = $('#kaForm', main); if (f) for (const el of f.elements) if (el.name && el.type !== 'checkbox') st.data[el.name] = el.value; };
      const go = n => { save(); st.step = n; authView('register', '', { state: st }); };

      let body = '';
      if (st.step === 1) {
        body = `<div><h1>Kim jesteś?</h1><p class="ka-sub" style="margin-top:4px">Dopasujemy panel do Ciebie. Zmienisz to później w ustawieniach.</p></div>
          <div class="ka-types" role="radiogroup">${TYPES.map(t => `<button type="button" class="ka-type ${st.type === t.key ? 'on' : ''}" role="radio" aria-checked="${st.type === t.key}" data-type="${t.key}"><i class="fa-solid ${t.icon}"></i><strong>${t.title}</strong><small>${t.text}</small>${t.tag ? `<span class="tag">${t.tag}</span>` : ''}</button>`).join('')}</div>
          ${B2B_TYPES.includes(st.type) ? '<div class="ka-notice"><i class="fa-solid fa-circle-info"></i><span>Panel B2B włączamy po krótkiej weryfikacji — zwykle tego samego dnia roboczego. Do tego czasu masz pełny panel klienta.</span></div>' : ''}
          <form id="kaForm" class="ka-form"><div class="ka-actions"><button class="rv-button" type="submit">Dalej <i class="fa-solid fa-arrow-right"></i></button></div></form>`;
      } else if (st.step === 2) {
        const d = st.data;
        body = `<div><h1>${isCo() ? 'Dane firmy' : 'Twoje dane'}</h1><p class="ka-sub" style="margin-top:4px">Potrzebujemy ich do kontaktu w sprawie zleceń.</p></div>
          <form id="kaForm" class="ka-form" novalidate>
            ${isCo() ? `<div class="ka-row">${input({ id: 'rgCo', name: 'company', icon: 'fa-building', label: st.type === 'hotel' ? 'Nazwa hotelu / firmy' : st.type === 'partner' ? 'Nazwa biura' : st.type === 'developer' ? 'Nazwa dewelopera' : 'Nazwa firmy', value: d.company || '', auto: 'organization', extra: 'required minlength="2"' })}${input({ id: 'rgNip', name: 'nip', icon: 'fa-hashtag', label: 'NIP <small style="color:var(--rv-muted);font-weight:600">(opcjonalnie)</small>', placeholder: '000-000-00-00', value: d.nip || '', extra: 'inputmode="numeric"' })}</div>` : ''}
            ${input({ id: 'rgName', name: 'name', icon: 'fa-user', label: isCo() ? 'Imię i nazwisko osoby kontaktowej' : 'Imię i nazwisko', placeholder: 'Jan Kowalski', value: d.name || '', auto: 'name', extra: 'required minlength="2"' })}
            <div class="ka-row">
              ${input({ id: 'rgEmail', name: 'email', type: 'email', icon: 'fa-envelope', label: 'E-mail', placeholder: 'jan@przyklad.pl', value: d.email || '', auto: 'email', extra: 'required inputmode="email"', hint: 'Na ten adres wyślemy link potwierdzający.' })}
              ${input({ id: 'rgPhone', name: 'phone', type: 'tel', icon: 'fa-phone', label: 'Telefon', placeholder: '600 000 000', value: d.phone || '', auto: 'tel', extra: 'inputmode="tel"', hint: 'Zadzwonimy przed przyjazdem ekipy.' })}
            </div>
            <input class="pt-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
            ${errBox}
            <div class="ka-actions"><button type="button" class="ka-back" data-back><i class="fa-solid fa-arrow-left"></i></button><button class="rv-button" type="submit">Dalej <i class="fa-solid fa-arrow-right"></i></button></div>
          </form>`;
      } else {
        body = `<div><h1>Ustaw hasło</h1><p class="ka-sub" style="margin-top:4px">Ostatni krok. Konto: <strong style="color:#fff">${esc(st.data.email)}</strong></p></div>
          <form id="kaForm" class="ka-form" novalidate>
            ${input({ id: 'rgPass', name: 'password', type: 'password', icon: 'fa-lock', label: 'Hasło', placeholder: 'Min. 8 znaków', auto: 'new-password', extra: 'required minlength="8"' })}
            <div class="ka-meter" id="kaMeter" data-s="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>
            <ul class="ka-reqs" id="kaReqs"><li data-r="len"><i class="fa-solid fa-circle"></i>Min. 8 znaków</li><li data-r="letter"><i class="fa-solid fa-circle"></i>Litera</li><li data-r="digit"><i class="fa-solid fa-circle"></i>Cyfra</li><li data-r="extra"><i class="fa-solid fa-circle"></i>Znak specjalny lub 12+ (zalecane)</li></ul>
            ${input({ id: 'rgPass2', name: 'password2', type: 'password', icon: 'fa-lock', label: 'Powtórz hasło', auto: 'new-password', extra: 'required' })}
            <label class="ka-check"><input type="checkbox" name="consent" required><span>Akceptuję zasady konta i <a href="polityka-prywatnosci.html" target="_blank">politykę prywatności</a>. <small style="color:var(--rv-muted)">(wymagane)</small></span></label>
            <label class="ka-check"><input type="checkbox" name="marketing"><span>Chcę dostawać okazje z RevOutlet i informacje o wolnych kursach RevPowrót. <small style="color:var(--rv-muted)">(opcjonalnie, możesz zrezygnować w panelu)</small></span></label>
            ${errBox}
            <div class="ka-actions"><button type="button" class="ka-back" data-back><i class="fa-solid fa-arrow-left"></i></button><button class="rv-button" type="submit">Załóż konto <i class="fa-solid fa-check"></i></button></div>
          </form>`;
      }
      main.innerHTML = `${switcher('register')}${stepsBar()}<div class="ka-anim" style="display:grid;gap:18px">${noticeHtml}${body}<p class="ka-foot">Masz już konto? <button type="button" data-mode="login">Zaloguj się</button></p></div>`;
      bindCommon();
      $$('[data-type]', main).forEach(b => b.addEventListener('click', () => { st.type = b.dataset.type; authView('register', '', { state: st }); }));
      $('[data-back]', main)?.addEventListener('click', () => go(st.step - 1));
      const form = $('#kaForm', main);

      if (st.step === 3) {
        const pass = $('#rgPass', main);
        const upd = () => {
          const c = pwCheck(pass.value);
          $('#kaMeter', main).dataset.s = c.score;
          $$('#kaReqs li', main).forEach(li => { const ok = c[li.dataset.r]; li.classList.toggle('ok', ok); $('i', li).className = 'fa-solid ' + (ok ? 'fa-circle-check' : 'fa-circle'); });
          pass.closest('.ka-input').classList.toggle('ok', c.ok);
        };
        pass.addEventListener('input', upd);
        $('#rgPass2', main).addEventListener('input', e => { const ok = e.target.value && e.target.value === pass.value; e.target.closest('.ka-input').classList.toggle('ok', ok); e.target.closest('.ka-input').classList.toggle('bad', Boolean(e.target.value) && !ok && e.target.value.length >= pass.value.length); });
      }

      form.addEventListener('submit', async e => {
        e.preventDefault();
        showErr('');
        if (st.step === 1) return go(2);
        if (st.step === 2) {
          save();
          const d = st.data;
          if (isCo() && (d.company || '').trim().length < 2) return showErr('Podaj nazwę firmy.');
          if ((d.name || '').trim().length < 2) return showErr('Podaj imię i nazwisko.');
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((d.email || '').trim())) return showErr('Podaj prawidłowy adres e-mail.');
          if (d.nip && !/^([A-Za-z]{2})?[\d\s-]{10,13}$/.test(d.nip.trim())) return showErr('NIP powinien mieć 10 cyfr.');
          if (d.website) return showErr('Nie udało się — odśwież stronę.');
          return go(3);
        }
        const c = pwCheck(form.password.value);
        if (!c.ok) return showErr('Hasło musi mieć min. 8 znaków, literę i cyfrę.');
        if (form.password.value !== form.password2.value) return showErr('Hasła nie są takie same.');
        if (!form.consent.checked) return showErr('Zaakceptuj zasady konta i politykę prywatności.');
        const btn = form.querySelector('[type=submit]');
        busy(btn, true, 'Zakładam konto…');
        const d = st.data;
        try {
          const res = await RV.api('/api/konto/register', { method: 'POST', body: {
            requestId: rid, kind: isCo() ? 'company' : 'person', b2bRequest: B2B_TYPES.includes(st.type) ? st.type : undefined,
            name: d.name, company: isCo() ? d.company : '', nip: isCo() ? d.nip : '', email: d.email.trim(), phone: d.phone, password: form.password.value,
            consent: true, marketing: form.marketing.checked
          } });
          S.me = res.account;
          registered(res, st);
        } catch (err) {
          busy(btn, false);
          if (err.status === 409) { authView('login', esc(err.message), { error: true, email: d.email }); return; }
          if (/e-mail|telefon|NIP|nazw|imię/i.test(err.message)) { st.step = 2; authView('register', esc(err.message), { state: st, error: true }); return; }
          showErr(err.message);
        }
      });
      return;
    }

    /* ---------- Reset hasła ---------- */
    if (mode === 'forgot') {
      main.innerHTML = `<div class="ka-anim" style="display:grid;gap:18px">
        <button type="button" class="ka-link" data-mode="login" style="justify-self:start"><i class="fa-solid fa-arrow-left"></i> Wróć do logowania</button>
        <div><h1>Nie pamiętasz hasła?</h1><p class="ka-sub" style="margin-top:4px">Podaj e-mail konta — wyślemy link do ustawienia nowego hasła (ważny 1 godzinę).</p></div>
        ${noticeHtml}
        <form class="ka-form" id="kaForm" novalidate>${input({ id: 'fgEmail', name: 'email', type: 'email', icon: 'fa-envelope', label: 'E-mail', placeholder: 'jan@przyklad.pl', auto: 'email', extra: 'required' })}${errBox}
          <div class="ka-actions"><button class="rv-button" type="submit">Wyślij link <i class="fa-solid fa-paper-plane"></i></button></div></form>
        <p class="ka-foot">Nie masz dostępu do skrzynki? Zadzwoń: <a href="tel:+48735396534">735 396 534</a></p></div>`;
      bindCommon();
      const form = $('#kaForm', main);
      form.addEventListener('submit', async e => {
        e.preventDefault();
        if (!form.email.value.trim()) return showErr('Podaj e-mail.');
        const btn = form.querySelector('[type=submit]');
        busy(btn, true, 'Wysyłam…');
        try {
          const res = await RV.api('/api/konto/forgot', { method: 'POST', body: { email: form.email.value.trim() } });
          main.innerHTML = `<div class="ka-done ka-anim"><div class="big"><i class="fa-solid fa-envelope-open-text"></i></div><h1>Sprawdź skrzynkę</h1><p>${esc(res.message)}</p><button class="rv-button" type="button" data-mode="login">Wróć do logowania</button></div>`;
          bindCommon();
        } catch (err) { busy(btn, false); showErr(err.message); }
      });
      return;
    }

    /* ---------- Nowe hasło z linku ---------- */
    main.innerHTML = `<div class="ka-anim" style="display:grid;gap:18px"><div><h1>Ustaw nowe hasło</h1><p class="ka-sub" style="margin-top:4px">Po zapisaniu od razu Cię zalogujemy.</p></div>
      <form class="ka-form" id="kaForm" novalidate>${input({ id: 'rsPass', name: 'password', type: 'password', icon: 'fa-lock', label: 'Nowe hasło', placeholder: 'Min. 8 znaków', auto: 'new-password', extra: 'required' })}
        <div class="ka-meter" id="kaMeter" data-s="0" aria-hidden="true"><span></span><span></span><span></span><span></span></div>${errBox}
        <div class="ka-actions"><button class="rv-button" type="submit">Zapisz i zaloguj <i class="fa-solid fa-arrow-right"></i></button></div></form></div>`;
    bindCommon();
    const form = $('#kaForm', main);
    $('#rsPass', main).addEventListener('input', e => { $('#kaMeter', main).dataset.s = pwCheck(e.target.value).score; });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      if (!pwCheck(form.password.value).ok) return showErr('Hasło musi mieć min. 8 znaków, literę i cyfrę.');
      const btn = form.querySelector('[type=submit]');
      busy(btn, true, 'Zapisuję…');
      try {
        const res = await RV.api('/api/konto/reset', { method: 'POST', body: { token: reset, password: form.password.value } });
        history.replaceState(null, '', '/konto');
        S.me = res.account;
        RV.toast('Hasło zmienione.');
        start();
      } catch (err) { busy(btn, false); showErr(err.message); }
    });
  }

  /** Ekran po rejestracji: potwierdzenie e-maila + przejście do panelu. */
  function registered(res, st) {
    const main = $('#kaMain');
    const b2b = B2B_TYPES.includes(st.type);
    main.innerHTML = `<div class="ka-done ka-anim"><div class="big"><i class="fa-solid fa-circle-check"></i></div>
      <h1>Konto gotowe, ${esc(String(S.me.name).split(' ')[0])}!</h1>
      <p>${res.verificationSent ? `Wysłaliśmy link na <strong style="color:#fff">${esc(S.me.email)}</strong>. Potwierdź adres, a w panelu pojawią się też zlecenia zgłoszone wcześniej na ten e-mail.` : 'Możesz od razu korzystać z panelu.'}</p>
      ${b2b ? `<div class="ka-notice" style="text-align:left"><i class="fa-solid fa-hourglass-half"></i><span>Prośba o ${B2B_NAMES[st.type]} jest u nas. Damy znać e-mailem, gdy go włączymy.</span></div>` : ''}
      <button class="rv-button" type="button" id="kaGo" style="min-width:240px;justify-content:center">Przejdź do panelu <i class="fa-solid fa-arrow-right"></i></button></div>`;
    $('#kaGo', main).addEventListener('click', start);
  }

  /* ------------------------------------------------------------------ */
  /* Szkielet panelu i router                                            */
  /* ------------------------------------------------------------------ */

  function nav(active) {
    const c = S.dash?.stats || {};
    const items = [
      ['grp', 'Moje konto'],
      ['', 'fa-gauge-high', 'Pulpit'],
      ['zlecenia', 'fa-clipboard-list', 'Zlecenia', c.awaitingAcceptance || 0],
      ['nowe', 'fa-plus', 'Zamów usługę'],
      ['magazyn', 'fa-box-archive', 'RevStorage'],
      ['abonamenty', 'fa-rotate', 'Abonamenty'],
      ['zakupy', 'fa-bag-shopping', 'Outlet i kursy'],
      ...(has('hotel') || has('partner') || has('developer') ? [['grp', 'Dla firm (B2B)']] : []),
      ...(has('developer') ? [['deweloper', 'fa-city', 'Panel dewelopera']] : []),
      ...(has('hotel') ? [['hotel', 'fa-hotel', 'Hotel / pensjonat']] : []),
      ...(has('partner') ? [['partner', 'fa-handshake', 'Portal partnera', c.referralsOpen || 0]] : []),
      ['grp', 'Ustawienia'],
      ['ustawienia', 'fa-gear', 'Profil i dane']
    ];
    return items.map(([r, icon, label, count]) => r === 'grp'
      ? `<div class="grp">${esc(icon)}</div>`
      : `<a href="#/${r}" class="${active === r ? 'on' : ''}"><i class="fa-solid ${icon}"></i>${esc(label)}${count ? `<span class="count">${count}</span>` : ''}</a>`).join('') +
      '<a href="#" data-logout><i class="fa-solid fa-arrow-right-from-bracket"></i>Wyloguj</a>';
  }

  function shell() {
    const r = root();
    r.className = 'v4-wrap kt-app';
    r.innerHTML = `<aside class="kt-side"><div class="kt-me"><div class="kt-avatar">${esc(initials(S.me.name))}</div><div style="min-width:0"><strong>${esc(S.me.company || S.me.name)}</strong><small>${esc(S.me.email)}</small></div></div><nav class="kt-nav" id="ktNav"></nav></aside><section class="kt-main" id="ktView" tabindex="-1"></section>`;
  }

  function parse() {
    const raw = location.hash.replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const alias = { outlet: 'zakupy', powrot: 'zakupy', zamowienia: 'zlecenia' };
    return { name: alias[parts[0]] || parts[0] || '', id: parts[1] || null, query: new URLSearchParams(query) };
  }

  async function route() {
    if (!S.me) return;
    if (!$('#ktView')) shell();
    const { name, id, query } = parse();
    const view = VIEWS[name] || VIEWS[''];
    if (view.access && !has(view.access)) { location.hash = '#/'; return; }
    $('#ktNav').innerHTML = nav(name in VIEWS ? name : '');
    $('[data-logout]', $('#ktNav')).addEventListener('click', e => { e.preventDefault(); logout(); });
    const el = $('#ktView');
    el.innerHTML = '<div class="pt-skel" style="height:120px;margin-bottom:12px"></div><div class="pt-skel"></div>';
    document.title = `${view.title} · Moje konto · RevSerwis`;
    try {
      await view.render(el, { id, query });
    } catch (e) {
      if (e.status === 401) { S.me = null; authView('login', 'Sesja wygasła — zaloguj się ponownie.'); return; }
      el.innerHTML = empty('fa-triangle-exclamation', 'Nie udało się wczytać', e.message, '<button class="pt-btn" onclick="location.reload()">Odśwież</button>');
    }
    if (window.innerWidth < 980) el.scrollIntoView({ block: 'start' });
  }

  async function logout() {
    await RV.api('/api/konto/logout', { method: 'POST' }).catch(() => null);
    S.me = null;
    S.dash = null;
    history.replaceState(null, '', '/konto');
    authView('login', 'Wylogowano.');
  }

  const head = (title, sub, actions = '') => `<div class="kt-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="pt-btn-row">${actions}</div>` : ''}</div>`;

  const orderRow = t => `<a class="kt-row" href="#/zlecenia/${esc(t.id)}">
      <div class="ic"><i class="fa-solid ${STATUS[t.status]?.[2] || 'fa-clipboard'}"></i></div>
      <div style="min-width:0"><strong>${esc(t.name)}</strong><small>${esc(t.number)} · ${t.dateStart ? RV.when(t.dateStart) : 'zgłoszono ' + RV.day(t.createdAt)}${t.address || t.addressTo ? ' · ' + esc(t.address || t.addressFrom + ' → ' + t.addressTo) : ''}</small></div>
      <div class="end">${t.chatUnread ? `<span class="pt-badge mint"><i class="fa-solid fa-comment"></i> ${t.chatUnread}</span>` : ''}${badge(t.status)}${t.canAccept ? '<span class="pt-badge amber">Zaakceptuj wycenę</span>' : t.finalPrice ? `<small>${RV.money(t.finalPrice)}</small>` : t.estimate ? `<small>${range(t.estimate)}</small>` : ''}</div></a>`;

  /* ------------------------------------------------------------------ */
  /* Widoki                                                              */
  /* ------------------------------------------------------------------ */
  const VIEWS = {};

  VIEWS[''] = {
    title: 'Pulpit',
    async render(el) {
      const d = (S.dash = await RV.api('/api/konto/dashboard'));
      $('#ktNav').innerHTML = nav('');
      $('[data-logout]', $('#ktNav')).addEventListener('click', e => { e.preventDefault(); logout(); });
      const s = d.stats;
      el.innerHTML = `${head(`Cześć, ${S.me.name.split(' ')[0]}!`, 'Tu śledzisz zlecenia, zamawiasz usługi i zarządzasz abonamentami.', '<a class="pt-btn primary" href="#/nowe"><i class="fa-solid fa-plus"></i> Zamów usługę</a>')}
        ${!d.emailVerified ? `<div class="kt-banner"><span><i class="fa-solid fa-envelope"></i> Potwierdź adres e-mail — wtedy pokażemy też zlecenia zgłoszone wcześniej na <strong>${esc(S.me.email)}</strong>.</span><button class="pt-btn sm" data-resend>Wyślij link ponownie</button></div>` : ''}
        ${s.awaitingAcceptance ? `<div class="kt-banner" style="background:var(--rv-accent-soft);border-color:rgba(3,240,186,.3);color:#d1fae5"><span><i class="fa-solid fa-file-invoice-dollar"></i> Masz ${s.awaitingAcceptance} ${s.awaitingAcceptance === 1 ? 'wycenę' : 'wyceny'} do akceptacji.</span><a class="pt-btn sm primary" href="#/zlecenia">Zobacz</a></div>` : ''}
        <div class="kt-stats">
          <div class="kt-stat"><small>W toku</small><strong>${s.active}</strong></div>
          <div class="kt-stat"><small>Zrealizowane</small><strong>${s.completed}</strong></div>
          <div class="kt-stat"><small>Wydane łącznie</small><strong>${RV.money(s.spent)}</strong></div>
          <div class="kt-stat"><small>W magazynie</small><strong>${s.storage} ${s.storage === 1 ? 'pozycja' : 'poz.'}</strong></div>
        </div>
        ${d.upcoming ? `<div class="pt-card" style="margin-bottom:16px;display:flex;gap:16px;align-items:center;flex-wrap:wrap"><div class="pt-icon" style="margin:0"><i class="fa-solid fa-calendar-day"></i></div><div style="flex:1;min-width:200px"><small class="pt-muted">Najbliższy termin</small><h3 style="margin:2px 0">${esc(d.upcoming.name)}</h3><p>${RV.when(d.upcoming.dateStart)}${d.upcoming.crew.length ? ' · ekipa: ' + esc(d.upcoming.crew.join(', ')) : ''}</p></div><a class="pt-btn" href="#/zlecenia/${esc(d.upcoming.id)}">Śledź <i class="fa-solid fa-location-crosshairs"></i></a></div>` : ''}
        ${d.nextVisit ? `<div class="pt-card" style="margin-bottom:16px"><small class="pt-muted">Następna wizyta abonamentowa</small><h3 style="margin:2px 0">${esc(d.nextVisit.plan)}</h3><p>${RV.when(d.nextVisit.date)}</p></div>` : ''}
        <h2 class="kt-section-title"><i class="fa-solid fa-clipboard-list" style="color:var(--rv-accent)"></i> Aktywne zlecenia</h2>
        <div class="kt-list">${d.active.length ? d.active.map(orderRow).join('') : empty('fa-clipboard-check', 'Brak aktywnych zleceń', 'Zamów usługę — wycenę zobaczysz tutaj.', '<a class="rv-button" href="#/nowe">Zamów usługę</a>')}</div>
        ${d.recent.length ? `<h2 class="kt-section-title"><i class="fa-solid fa-clock-rotate-left" style="color:var(--rv-accent)"></i> Ostatnio zrealizowane</h2><div class="kt-list">${d.recent.map(orderRow).join('')}</div>` : ''}
        <h2 class="kt-section-title"><i class="fa-solid fa-compass" style="color:var(--rv-accent)"></i> Przydatne</h2>
        <div class="pt-grid">
          <a class="pt-card" href="outlet.html" style="text-decoration:none"><div class="pt-icon"><i class="fa-solid fa-couch"></i></div><h3>RevOutlet</h3><p>Meble i AGD z drugiej ręki — z dowozem.</p></a>
          <a class="pt-card" href="powrot.html" style="text-decoration:none"><div class="pt-icon"><i class="fa-solid fa-route"></i></div><h3>RevPowrót</h3><p>Wolne miejsce w busie wracającym z trasy — taniej.</p></a>
          <a class="pt-card" href="#/abonamenty" style="text-decoration:none"><div class="pt-icon"><i class="fa-solid fa-rotate"></i></div><h3>Abonamenty</h3><p>Odśnieżanie, ogród, obsługa obiektu — bez dzwonienia.</p></a>
        </div>`;
      $('[data-resend]', el)?.addEventListener('click', async e => {
        e.target.disabled = true;
        try { const r = await RV.api('/api/konto/verify/resend', { method: 'POST' }); RV.toast(r.message); } catch (err) { RV.toast(err.message, 'error'); e.target.disabled = false; }
      });
    }
  };

  /* ---------- Zlecenia ---------- */
  VIEWS.zlecenia = {
    title: 'Zlecenia',
    async render(el, { id }) {
      if (id) return orderDetail(el, id);
      const { orders } = await RV.api('/api/konto/orders');
      let filter = 'active';
      const groups = { active: o => ['new', 'quoted', 'planned', 'progress'].includes(o.status), completed: o => o.status === 'completed', cancelled: o => o.status === 'cancelled', all: () => true };
      const draw = () => {
        const list = orders.filter(groups[filter]);
        el.innerHTML = `${head('Zlecenia', `${orders.length} ${orders.length === 1 ? 'zlecenie' : 'zleceń'} w historii`, '<a class="pt-btn primary" href="#/nowe"><i class="fa-solid fa-plus"></i> Zamów usługę</a>')}
          <div class="kt-filters">${[['active', 'W toku'], ['completed', 'Zrealizowane'], ['cancelled', 'Anulowane'], ['all', 'Wszystkie']].map(([k, l]) => `<button class="pt-chip ${filter === k ? 'on' : ''}" data-f="${k}">${l}<small>${orders.filter(groups[k]).length}</small></button>`).join('')}</div>
          <div class="kt-list">${list.length ? list.map(orderRow).join('') : empty('fa-clipboard', 'Pusto', filter === 'active' ? 'Nie masz zleceń w toku.' : 'Brak zleceń w tej grupie.')}</div>
          ${filter === 'completed' && list.length ? paymentsTable(list) : ''}`;
        $$('[data-f]', el).forEach(b => b.addEventListener('click', () => { filter = b.dataset.f; draw(); }));
      };
      draw();
    }
  };

  function paymentsTable(list) {
    const rows = list.filter(o => o.finalPrice);
    if (!rows.length) return '';
    return `<h2 class="kt-section-title"><i class="fa-solid fa-receipt" style="color:var(--rv-accent)"></i> Płatności</h2><div class="pt-card kt-scroll" style="padding:8px 14px"><table class="kt-table"><thead><tr><th>Zlecenie</th><th>Data</th><th>Status</th><th class="num">Kwota</th></tr></thead><tbody>
      ${rows.map(o => `<tr><td>${esc(o.number)}<div class="pt-small pt-muted">${esc(o.name)}</div></td><td>${RV.day(o.completedAt)}</td><td>${tag(PAY[o.paymentStatus])}</td><td class="num">${RV.money(o.finalPrice)}</td></tr>`).join('')}
      </tbody></table><p class="pt-small pt-muted">Faktury VAT wysyłamy e-mailem. Potrzebujesz duplikatu? Napisz: kontakt@revserwis.pl.</p></div>`;
  }

  async function orderDetail(el, id) {
    const { order: o } = await RV.api('/api/konto/orders/' + encodeURIComponent(id));
    const step = s => `<div class="kt-step ${s.done ? 'done' : ''} ${s.current ? 'current' : ''} ${s.key === 'cancelled' ? 'cancel' : ''}"><div class="kt-dot"><i class="fa-solid ${s.done ? (s.key === 'cancelled' ? 'fa-xmark' : 'fa-check') : s.icon}"></i></div><div><strong>${esc(s.label)}</strong>${s.at ? `<small>${RV.when(s.at)}</small>` : ''}</div></div>`;
    const where = o.address || [o.addressFrom, o.addressTo].filter(Boolean).join(' → ');
    el.innerHTML = `${head(o.name, `${esc(o.number)} · zgłoszono ${RV.day(o.createdAt)}`, '<a class="pt-btn" href="#/zlecenia"><i class="fa-solid fa-arrow-left"></i> Wszystkie</a>')}
      <div class="kt-detail">
        <div style="display:grid;gap:16px">
          <div class="pt-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:12px"><h3 style="margin:0">Śledzenie</h3>${badge(o.status)}</div>
            <div class="kt-track">${o.timeline.map(step).join('')}</div>
            ${o.trackingNote ? `<div class="kt-banner" style="margin:16px 0 0;background:var(--rv-accent-soft);border-color:rgba(3,240,186,.3);color:#d1fae5"><span><i class="fa-solid fa-circle-info"></i> ${esc(o.trackingNote)}</span></div>` : ''}
            ${o.etaAt ? `<p style="margin:14px 0 0;color:#fff"><i class="fa-solid fa-truck-fast" style="color:var(--rv-accent)"></i> Przewidywany przyjazd: <strong>${RV.when(o.etaAt)}</strong></p>` : ''}
            ${o.cancelRequested ? '<p class="pt-small" style="color:#fcd34d;margin:14px 0 0"><i class="fa-solid fa-hourglass-half"></i> Prośba o anulowanie wysłana — oddzwonimy.</p>' : ''}
          </div>
          ${o.description ? `<div class="pt-card"><h3>Opis zlecenia</h3><p style="white-space:pre-wrap">${esc(o.description)}</p></div>` : ''}
          ${o.photos.length ? `<div class="pt-card"><h3>Zdjęcia z realizacji</h3><div class="kt-photos" style="margin-top:10px">${o.photos.map(p => `<a href="/api/konto/orders/${esc(o.id)}/media/${esc(p.id)}" target="_blank" rel="noopener"><img loading="lazy" src="/api/konto/orders/${esc(o.id)}/media/${esc(p.id)}" alt=""><span>${p.kind === 'before' ? 'Przed' : 'Po'}</span></a>`).join('')}</div></div>` : ''}
          ${o.status === 'completed' ? rateBox(o) : ''}
        </div>
        <div style="display:grid;gap:16px">
          <div class="pt-card">
            ${o.finalPrice ? `<small class="pt-muted">Kwota</small><div class="kt-price">${RV.money(o.finalPrice)}</div><p style="margin:4px 0 12px">${tag(PAY[o.paymentStatus])}</p>`
              : o.estimate ? `<small class="pt-muted">${o.estimate.preliminary ? 'Wstępna wycena RevBot' : 'Wycena'}</small><div class="kt-price">${range(o.estimate)}</div><p class="pt-small" style="margin:4px 0 12px">${o.estimate.preliminary ? 'Cena orientacyjna — potwierdzimy ją po kontakcie.' : o.accepted ? '<span style="color:var(--rv-accent)"><i class="fa-solid fa-check"></i> Zaakceptowana — ustalamy termin</span>' : 'Cena może się zmienić, jeśli zakres będzie inny niż w zgłoszeniu.'}</p>`
              : '<small class="pt-muted">Wycena</small><p style="margin:4px 0 12px">Przygotowujemy wycenę — zwykle w ciągu kilku godzin w dni robocze.</p>'}
            <dl class="kt-kv">
              ${o.dateStart ? `<dt>Termin</dt><dd>${RV.when(o.dateStart)}</dd>` : o.preferredDate ? `<dt>Twój termin</dt><dd>${esc(o.preferredDate)}</dd>` : ''}
              ${where ? `<dt>Adres</dt><dd>${esc(where)}</dd>` : ''}
              ${o.crew.length ? `<dt>Ekipa</dt><dd>${esc(o.crew.join(', '))}</dd>` : ''}
              ${o.vehicle ? `<dt>Pojazd</dt><dd>${esc(o.vehicle)}</dd>` : ''}
              <dt>Rodzaj</dt><dd>${o.quoteType === 'onsite' ? 'Wycena z oględzinami' : esc(o.type || 'Usługa')}</dd>
              ${o.addons.length ? `<dt>Dodatki</dt><dd>${o.addons.map(a => esc(a.name) + (a.qty > 1 ? ' × ' + a.qty : '') + (a.total != null ? ` <span class="pt-muted">(${RV.money(a.total)})</span>` : ' <span class="pt-muted">(w wycenie)</span>')).join('<br>')}</dd>` : ''}
            </dl>
            <div class="pt-btn-row" style="margin-top:16px">
              ${o.canAccept ? '<button class="pt-btn primary" data-accept><i class="fa-solid fa-check"></i> Akceptuję wycenę</button>' : ''}
              ${o.canCancel ? `<button class="pt-btn danger" data-cancel><i class="fa-solid fa-ban"></i> ${o.status === 'planned' ? 'Poproś o anulowanie' : 'Anuluj'}</button>` : ''}
              ${['completed', 'cancelled'].includes(o.status) ? '<button class="pt-btn" data-repeat><i class="fa-solid fa-rotate-right"></i> Zamów ponownie</button>' : ''}
            </div>
          </div>
          <div class="pt-card kc-card" id="kcCard"><div class="kc-head"><h3 style="margin:0"><i class="fa-solid fa-comments" style="color:var(--rv-accent)"></i> Wiadomości</h3><span class="pt-small pt-muted">odpowiadamy zwykle w ciągu godziny</span></div>
            <div class="kc-list" id="kcList" aria-live="polite"><div class="pt-muted pt-small">Wczytuję…</div></div>
            ${o.canChat ? `<form class="kc-form" id="kcForm" novalidate><button type="button" class="kc-att" data-att aria-label="Dodaj zdjęcie"><i class="fa-solid fa-camera"></i></button><textarea name="text" rows="1" maxlength="2000" placeholder="Napisz do ekipy lub biura…" aria-label="Wiadomość"></textarea><button class="kc-send" type="submit" aria-label="Wyślij"><i class="fa-solid fa-paper-plane"></i></button></form><div class="kc-preview" id="kcPreview" hidden></div>` : '<p class="pt-small pt-muted" style="margin:8px 0 0">Zlecenie anulowane — w razie pytań zadzwoń.</p>'}
            <div class="pt-btn-row" style="margin-top:12px"><a class="pt-btn sm" href="tel:+48735396534"><i class="fa-solid fa-phone"></i> 735 396 534</a><a class="pt-btn sm" target="_blank" rel="noopener" href="https://wa.me/48735396534?text=${encodeURIComponent('Dzień dobry, pytanie o zlecenie ' + o.number)}"><i class="fa-brands fa-whatsapp"></i> WhatsApp</a></div></div>
        </div>
      </div>`;
    const reload = () => orderDetail(el, id);
    $('[data-accept]', el)?.addEventListener('click', async e => {
      e.target.disabled = true;
      try { await RV.api(`/api/konto/orders/${encodeURIComponent(o.id)}/accept`, { method: 'POST' }); RV.toast('Dziękujemy! Zadzwonimy, żeby ustalić termin.'); reload(); } catch (err) { RV.toast(err.message, 'error'); e.target.disabled = false; }
    });
    $('[data-cancel]', el)?.addEventListener('click', () => {
      const d = RV.dialog(o.status === 'planned' ? 'Prośba o anulowanie' : 'Anulować zgłoszenie?', `<form class="pt-form" style="grid-template-columns:1fr" novalidate>
        <p class="pt-muted" style="margin:0">${o.status === 'planned' ? 'Termin jest już zarezerwowany dla Ciebie — oddzwonimy, żeby to potwierdzić.' : 'Zgłoszenie zostanie anulowane.'}</p>
        <div class="pt-field"><label for="cnR">Powód (opcjonalnie)</label><input id="cnR" name="reason" maxlength="500"></div>
        <div class="pt-error" role="alert"></div><button class="pt-btn danger" type="submit">${o.status === 'planned' ? 'Wyślij prośbę' : 'Anuluj zgłoszenie'}</button></form>`);
      const f = $('form', d);
      f.addEventListener('submit', ev => { ev.preventDefault(); RV.submit(f, async () => { await RV.api(`/api/konto/orders/${encodeURIComponent(o.id)}/cancel`, { method: 'POST', body: RV.formData(f) }); d.close(); RV.toast('Zapisane.'); reload(); }); });
    });
    $('[data-repeat]', el)?.addEventListener('click', async e => {
      e.target.disabled = true;
      try { const r = await RV.api(`/api/konto/orders/${encodeURIComponent(o.id)}/repeat`, { method: 'POST' }); RV.toast('Nowe zgłoszenie wysłane — przygotujemy wycenę.'); location.hash = '#/zlecenia/' + r.order.id; } catch (err) { RV.toast(err.message, 'error'); e.target.disabled = false; }
    });
    bindRate(el, o, reload);
    bindChat(el, o);
  }

  /* ---------- Czat w zleceniu ---------- */
  let chatTimer = null;
  function bindChat(el, o) {
    clearInterval(chatTimer);
    const list = $('#kcList', el);
    if (!list) return;
    const url = `/api/konto/orders/${encodeURIComponent(o.id)}/messages`;
    let lastCount = -1;
    let photo = null;
    const render = msgs => {
      if (msgs.length === lastCount) return;
      lastCount = msgs.length;
      list.innerHTML = msgs.length ? msgs.map(m => `<div class="kc-msg ${m.from === 'client' ? 'me' : ''}"><div class="kc-bubble">${m.text ? `<p>${esc(m.text).replace(/\n/g, '<br>')}</p>` : ''}${m.hasPhoto ? `<a href="${url}/${esc(m.id)}/photo" target="_blank" rel="noopener"><img src="${url}/${esc(m.id)}/photo" alt="Zdjęcie" loading="lazy"></a>` : ''}</div><small>${m.from === 'client' ? 'Ty' : esc(m.authorName)} · ${RV.when(m.createdAt)}</small></div>`).join('')
        : '<div class="kc-empty"><i class="fa-regular fa-comments"></i><span>Masz pytanie o to zlecenie? Napisz — odpowie biuro albo ekipa, która je realizuje.</span></div>';
      list.scrollTop = list.scrollHeight;
    };
    const load = () => RV.api(url).then(r => render(r.messages)).catch(() => null);
    load();
    chatTimer = setInterval(() => { if (!document.body.contains(list)) { clearInterval(chatTimer); return; } if (!document.hidden) load(); }, 15000);
    const form = $('#kcForm', el);
    if (!form) return;
    const ta = form.text;
    ta.addEventListener('input', () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'; });
    ta.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && window.innerWidth > 700) { e.preventDefault(); form.requestSubmit(); } });
    const prev = $('#kcPreview', el);
    $('[data-att]', form).addEventListener('click', async () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.addEventListener('change', async () => {
        const [p] = await RV.readPhotos(inp.files, 1);
        photo = p || null;
        prev.hidden = !photo;
        prev.innerHTML = photo ? `<img src="${photo}" alt=""><button type="button" aria-label="Usuń zdjęcie">✕</button>` : '';
        $('button', prev)?.addEventListener('click', () => { photo = null; prev.hidden = true; prev.innerHTML = ''; });
      });
      inp.click();
    });
    form.addEventListener('submit', async e => {
      e.preventDefault();
      const text = ta.value.trim();
      if (!text && !photo) return;
      const btn = $('.kc-send', form);
      btn.disabled = true;
      try {
        await RV.api(url, { method: 'POST', body: { text, photo } });
        ta.value = ''; ta.style.height = ''; photo = null; prev.hidden = true; prev.innerHTML = '';
        lastCount = -1;
        await load();
      } catch (err) { RV.toast(err.message, 'error'); }
      btn.disabled = false;
      ta.focus();
    });
  }

  function rateBox(o) {
    if (!o.canRate) return o.rating ? `<div class="pt-card"><h3>Twoja ocena</h3><p style="color:#fbbf24;font-size:20px">${'★'.repeat(o.rating)}${'☆'.repeat(5 - o.rating)}</p>${o.feedback ? `<p>${esc(o.feedback)}</p>` : ''}</div>` : '';
    return `<div class="pt-card"><h3>Jak nam poszło?</h3><form id="rateForm" class="pt-form" style="grid-template-columns:1fr;margin-top:10px" novalidate>
      <div class="kt-stars" role="radiogroup" aria-label="Ocena">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-star="${n}" aria-label="${n} na 5">★</button>`).join('')}</div>
      <div class="pt-field"><label for="rtF">Komentarz (opcjonalnie)</label><textarea id="rtF" name="feedback" maxlength="1500"></textarea></div>
      <div class="pt-error" role="alert"></div><button class="pt-btn primary" type="submit" style="justify-self:start">Wyślij ocenę</button></form></div>`;
  }

  function bindRate(el, o, reload) {
    const f = $('#rateForm', el);
    if (!f) return;
    let rating = 0;
    $$('[data-star]', f).forEach(b => b.addEventListener('click', () => { rating = Number(b.dataset.star); $$('[data-star]', f).forEach(x => x.classList.toggle('on', Number(x.dataset.star) <= rating)); }));
    f.addEventListener('submit', e => {
      e.preventDefault();
      if (!rating) { RV.toast('Wybierz liczbę gwiazdek.', 'error'); return; }
      RV.submit(f, async () => {
        const r = await RV.api(`/api/konto/orders/${encodeURIComponent(o.id)}/rate`, { method: 'POST', body: { rating, feedback: f.feedback.value } });
        if (r.googleReviewUrl) {
          RV.dialog('Dziękujemy!', `<p style="color:#c4c8cf;line-height:1.6">Cieszymy się, że jesteś zadowolony/a. Czy możesz zostawić krótką opinię w Google? To bardzo pomaga małej firmie.</p><p style="margin-top:14px"><a class="rv-button" href="${esc(r.googleReviewUrl)}" target="_blank" rel="noopener">Dodaj opinię w Google <i class="fa-solid fa-arrow-up-right-from-square"></i></a></p>`);
        } else RV.toast('Dziękujemy za ocenę!');
        reload();
      });
    });
  }

  /* ---------- Nowe zlecenie ---------- */
  VIEWS.nowe = {
    title: 'Zamów usługę',
    async render(el) {
      const cat = window.RV_DIVISIONS || { divisions: [] };
      const groups = cat.divisions.map(d => `<optgroup label="${esc(d.name)} — ${esc(d.tagline || '')}">${(d.services || []).map(s => `<option value="${esc(d.slug + '|' + s)}">${esc(s)}</option>`).join('')}</optgroup>`).join('');
      const rid = RV.rid();
      el.innerHTML = `${head('Zamów usługę', 'Opisz, czego potrzebujesz — przygotujemy wycenę, a status zobaczysz w zakładce „Zlecenia”.')}
        <form id="noForm" class="pt-form pt-card" novalidate style="padding:24px">
          <div class="pt-field full"><label for="noSrv">Usługa</label><select id="noSrv" name="srv" required><option value="">— wybierz usługę —</option>${groups}<option value="|Inne">Coś innego — opiszę</option></select></div>
          <div class="pt-field full"><span class="pt-label">Rodzaj wyceny</span><div class="pt-options">
            <label class="pt-option"><input type="radio" name="quoteType" value="free" checked><span><i class="fa-solid fa-arrows-left-right"></i> Bezpłatne widełki (ze zdjęć)</span></label>
            <label class="pt-option"><input type="radio" name="quoteType" value="onsite"><span><i class="fa-solid fa-location-dot"></i> Dokładna wycena z dojazdem (płatna)</span></label></div></div>
          <div class="pt-field"><label for="noAddr">Adres</label><input id="noAddr" name="address" required minlength="3" autocomplete="street-address" value="${esc([S.me.address, S.me.city].filter(Boolean).join(', '))}" placeholder="Miasto, ulica, numer"></div>
          <div class="pt-field"><label for="noTo">Adres docelowy (przeprowadzka / transport)</label><input id="noTo" name="addressTo" placeholder="opcjonalnie"></div>
          <div class="pt-field"><label for="noDate">Preferowany termin</label><input id="noDate" name="date" type="date" min="${RV.todayISO()}"></div>
          <div class="pt-field"><label for="noPhone">Telefon do kontaktu</label><input id="noPhone" name="phone" type="tel" value="${esc(S.me.phone || '')}" autocomplete="tel"></div>
          <label class="pt-check full"><input type="checkbox" name="dateFlexible"><span>Termin jest elastyczny (± kilka dni) — może być taniej</span></label>
          <div class="pt-field full"><label for="noDesc">Opis</label><textarea id="noDesc" name="description" required minlength="10" placeholder="Co trzeba zrobić? Ile rzeczy, które piętro, czy jest winda, dostęp dla busa…"></textarea></div>
          <div class="pt-field full" id="noAddonsWrap" hidden><span class="pt-label">Dodatki <span class="pt-muted" style="font-weight:600">(opcjonalnie)</span></span><div class="ko-addons" id="noAddons"></div><div class="ko-sum" id="noAddonsSum"></div></div>
          <div class="pt-field full"><span class="pt-label">Zdjęcia (do 6) — dzięki nim wycena jest dokładniejsza</span><div class="pt-photos-pick" id="noPhotos"></div></div>
          <input class="pt-hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
          <div class="pt-error full" role="alert"></div>
          <button class="rv-button full" type="submit">Wyślij zgłoszenie <i class="fa-solid fa-arrow-right"></i></button>
          <p class="pt-small pt-muted full" style="margin:0">Zgłoszenie nie rezerwuje terminu — potwierdzimy go po kontakcie. Szybszą wstępną wycenę AI dostaniesz też w <a href="wycena.html" style="color:var(--rv-accent)">wycenie online RevBot</a>.</p>
        </form>`;
      const picker = RV.photoPicker($('#noPhotos', el), 6);
      const form = $('#noForm', el);
      const chosen = new Map();
      let catalog = [];
      const sumAddons = () => {
        let total = 0; let quote = false;
        for (const [id, qty] of chosen) { const a = catalog.find(x => x.id === id); if (!a) continue; if (a.price == null) quote = true; else total += a.price * qty; }
        $('#noAddonsSum', el).innerHTML = chosen.size ? `Wybrane dodatki: <strong>${chosen.size}</strong>${total ? ` · <strong style="color:var(--rv-accent)">+${RV.money(total)}</strong>` : ''}${quote ? ' <span class="pt-muted">+ pozycje wyceniane indywidualnie</span>' : ''}` : '';
      };
      const loadAddons = async division => {
        try { catalog = (await RV.api('/api/dodatki' + (division ? '?division=' + encodeURIComponent(division) : ''))).addons; } catch { catalog = []; }
        for (const id of [...chosen.keys()]) if (!catalog.some(a => a.id === id)) chosen.delete(id);
        $('#noAddonsWrap', el).hidden = !catalog.length;
        $('#noAddons', el).innerHTML = catalog.map(a => `<div class="ko-addon ${chosen.has(a.id) ? 'on' : ''}" data-ad="${esc(a.id)}"><button type="button" class="ko-tog" aria-pressed="${chosen.has(a.id)}"><i class="fa-solid ${esc(a.icon || 'fa-plus')}"></i><span><strong>${esc(a.name)}</strong>${a.description ? `<small>${esc(a.description)}</small>` : ''}</span><em>${a.price == null ? 'w wycenie' : RV.money(a.price) + (a.unit && a.unit !== 'usł.' ? ' / ' + esc(a.unit) : '')}</em></button>${a.allowQty ? `<label class="ko-qty"><span>Ilość</span><input type="number" min="1" max="${a.maxQty || 20}" value="${chosen.get(a.id) || 1}" inputmode="numeric"></label>` : ''}</div>`).join('');
        $$('.ko-addon', el).forEach(box => {
          const id = box.dataset.ad;
          $('.ko-tog', box).addEventListener('click', () => { if (chosen.has(id)) chosen.delete(id); else chosen.set(id, Number($('input', box)?.value) || 1); box.classList.toggle('on', chosen.has(id)); $('.ko-tog', box).setAttribute('aria-pressed', chosen.has(id)); sumAddons(); });
          $('input', box)?.addEventListener('input', e => { const max = Number(e.target.max) || 20; const v = Math.min(Math.max(Math.round(Number(e.target.value) || 1), 1), max); if (chosen.has(id)) chosen.set(id, v); sumAddons(); });
        });
        sumAddons();
      };
      form.srv.addEventListener('change', () => loadAddons(String(form.srv.value || '').split('|')[0]));
      loadAddons('');
      form.addEventListener('submit', e => {
        e.preventDefault();
        RV.submit(form, async () => {
          const d = RV.formData(form);
          const [division, service] = String(d.srv || '').split('|');
          if (!service) throw new Error('Wybierz usługę.');
          const r = await RV.api('/api/konto/orders', { method: 'POST', body: { requestId: rid, division, service, quoteType: d.quoteType, address: d.address, addressTo: d.addressTo, date: d.date || null, dateFlexible: d.dateFlexible, phone: d.phone, description: d.description, photos: picker.get(), website: d.website, addons: [...chosen].map(([id, qty]) => ({ id, qty })) } });
          RV.toast('Zgłoszenie wysłane — ' + r.order.number);
          location.hash = '#/zlecenia/' + r.order.id;
        });
      });
    }
  };

  /* ---------- RevStorage ---------- */
  VIEWS.magazyn = {
    title: 'RevStorage',
    async render(el) {
      const d = await RV.api('/api/konto/storage');
      const active = d.items.filter(i => i.status !== 'released');
      const SST = { reserved: ['Rezerwacja', 'blue'], stored: ['W magazynie', 'mint'], released: ['Wydane', 'muted'] };
      el.innerHTML = `${head('RevStorage — moje rzeczy w magazynie', 'Sprawdź, co przechowujemy, i zamów dowóz wybranych rzeczy.', active.length ? '<button class="pt-btn primary" data-pickup><i class="fa-solid fa-truck-ramp-box"></i> Zamów dowóz / odbiór</button>' : '')}
        ${d.items.length ? `<div class="kt-stats">
          <div class="kt-stat"><small>Pozycje</small><strong>${d.summary.items}</strong></div>
          <div class="kt-stat"><small>Objętość</small><strong>${d.summary.volume} m³</strong></div>
          <div class="kt-stat"><small>Opłata miesięczna</small><strong>${RV.money(d.summary.monthly)}</strong></div>
          <div class="kt-stat"><small>Umowa do</small><strong>${d.summary.nextEnd ? RV.day(d.summary.nextEnd) : 'bezterminowo'}</strong></div></div>
          <div class="kt-list">${d.items.map(i => `<div class="pt-card" style="display:grid;gap:10px">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong style="color:#fff;font-size:16px">${esc(i.description)}</strong><div class="pt-small pt-muted">${esc(i.number)}${i.unit ? ' · miejsce: ' + esc(i.unit) : ''}${i.volume ? ' · ' + i.volume + ' m³' : ''} · od ${RV.day(i.startDate)}</div></div>${tag(SST[i.status])}</div>
            ${i.inventory ? `<details><summary class="pt-small" style="cursor:pointer;color:var(--rv-accent)">Spis rzeczy</summary><p style="white-space:pre-wrap;margin-top:8px">${esc(i.inventory)}</p></details>` : ''}
            ${i.photoCount ? `<div class="kt-photos">${Array.from({ length: i.photoCount }, (_, n) => `<a href="/api/konto/storage/${esc(i.id)}/photos/${n}" target="_blank" rel="noopener"><img loading="lazy" src="/api/konto/storage/${esc(i.id)}/photos/${n}" alt=""></a>`).join('')}</div>` : ''}
          </div>`).join('')}</div>
          ${d.requests.length ? `<h2 class="kt-section-title">Moje zamówienia dowozu</h2><div class="kt-list">${d.requests.map(orderRow).join('')}</div>` : ''}`
        : empty('fa-box-archive', 'Nie przechowujemy jeszcze Twoich rzeczy', 'Remont, przeprowadzka, przerwa między mieszkaniami? Odbierzemy rzeczy, spiszemy je ze zdjęciami i dowieziemy, kiedy zechcesz.', '<a class="rv-button" href="#/nowe">Zamów magazynowanie</a>')}`;
      $('[data-pickup]', el)?.addEventListener('click', () => pickup(active));
    }
  };

  function pickup(items) {
    const rid = RV.rid();
    const d = RV.dialog('Dowóz lub odbiór z magazynu', `<form class="pt-form" novalidate>
      <div class="pt-field full"><span class="pt-label">Które rzeczy?</span><div class="pt-options">${items.map(i => `<label class="pt-option"><input type="checkbox" name="items" value="${esc(i.id)}" data-group="1" checked><span>${esc(i.description)}</span></label>`).join('')}</div></div>
      <div class="pt-field full"><span class="pt-label">Sposób</span><div class="pt-options"><label class="pt-option"><input type="radio" name="mode" value="delivery" checked><span><i class="fa-solid fa-truck"></i> Dowóz pod adres</span></label><label class="pt-option"><input type="radio" name="mode" value="pickup"><span><i class="fa-solid fa-person-walking"></i> Odbiorę sam/a</span></label></div></div>
      <div class="pt-field full" data-addr><label for="pkA">Adres dostawy</label><input id="pkA" name="address" required value="${esc([S.me.address, S.me.city].filter(Boolean).join(', '))}"></div>
      <div class="pt-field"><label for="pkD">Termin</label><input id="pkD" name="date" type="date" required min="${RV.todayISO(1)}"></div>
      <div class="pt-field"><label for="pkN">Uwagi</label><input id="pkN" name="note" placeholder="np. 3 piętro, winda"></div>
      <div class="pt-error full" role="alert"></div><button class="rv-button full" type="submit">Zamów</button></form>`);
    const f = $('form', d);
    $$('input[name=mode]', f).forEach(r => r.addEventListener('change', () => { const del = f.mode.value === 'delivery'; $('[data-addr]', f).hidden = !del; f.address.required = del; }));
    f.addEventListener('submit', e => {
      e.preventDefault();
      RV.submit(f, async () => {
        const data = RV.formData(f);
        if (!data.items.length) throw new Error('Wybierz rzeczy.');
        const r = await RV.api('/api/konto/storage/request', { method: 'POST', body: { ...data, requestId: rid } });
        d.close();
        RV.toast('Zamówione — ' + r.order.number);
        location.hash = '#/zlecenia/' + r.order.id;
      });
    });
  }

  /* ---------- Abonamenty ---------- */
  VIEWS.abonamenty = {
    title: 'Abonamenty',
    async render(el, { query }) {
      const d = await RV.api('/api/konto/subscriptions');
      const P = RV.PERIOD || { month: '/ mies.', season: '/ sezon', year: '/ rok' };
      const mine = d.subscriptions;
      el.innerHTML = `${head('Abonamenty', 'Stała opieka bez dzwonienia — wizyty planujemy za Ciebie.')}
        ${mine.length ? `<div class="kt-list">${mine.map(s => `<div class="pt-card" style="display:grid;gap:10px">
          <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong style="color:#fff;font-size:17px">${esc(s.planName)}</strong><div class="pt-small pt-muted">${esc(s.number)} · ${esc(s.address)}</div></div><div>${tag(SUB[s.status])}${s.pauseRequestedAt ? ' <span class="pt-badge amber">Prośba o wstrzymanie</span>' : ''}</div></div>
          <div class="rp-row"><span><i class="fa-solid fa-coins"></i>${RV.money(s.price)} ${P[s.billingPeriod] || ''}</span>${s.nextVisit ? `<span><i class="fa-regular fa-calendar"></i>następna wizyta: ${RV.when(s.nextVisit)}</span>` : ''}${s.activatedAt ? `<span><i class="fa-solid fa-play"></i>od ${RV.day(s.activatedAt)}</span>` : ''}</div>
          ${s.visits.length ? `<details><summary class="pt-small" style="cursor:pointer;color:var(--rv-accent)">Wizyty (${s.visits.length})</summary><div class="kt-scroll"><table class="kt-table" style="margin-top:8px"><tbody>${s.visits.map(v => `<tr><td>${RV.when(v.date)}</td><td>${v.status === 'done' ? '<span class="pt-badge mint">Wykonana</span>' : v.status === 'skipped' ? '<span class="pt-badge muted">Pominięta</span>' : '<span class="pt-badge blue">Zaplanowana</span>'}</td><td class="pt-muted">${esc(v.note || '')}</td></tr>`).join('')}</tbody></table></div></details>` : ''}
          ${s.status !== 'cancelled' ? `<div class="pt-btn-row">${s.status === 'active' && !s.pauseRequestedAt ? `<button class="pt-btn sm" data-sub="pause" data-id="${esc(s.id)}">Wstrzymaj</button>` : ''}${s.status === 'paused' ? `<button class="pt-btn sm" data-sub="resume" data-id="${esc(s.id)}">Wznów</button>` : ''}<button class="pt-btn sm danger" data-sub="cancel" data-id="${esc(s.id)}">${s.status === 'pending' ? 'Anuluj zgłoszenie' : 'Zrezygnuj'}</button></div>` : ''}
        </div>`).join('')}</div>` : ''}
        <h2 class="kt-section-title"><i class="fa-solid fa-rotate" style="color:var(--rv-accent)"></i> ${mine.length ? 'Dodaj kolejny abonament' : 'Wybierz abonament'}</h2>
        ${d.plans.length ? `<div class="pt-grid">${d.plans.filter(p => p.audience === 'all' || p.audience === S.me.kind).map(p => `<div class="pt-card pl-card ${p.highlight ? 'hl' : ''}" id="plan-${esc(p._id)}">
            <div><span class="pt-badge">${esc(p.divisionName || 'RevSerwis')}</span></div><h3>${esc(p.name)}</h3><p>${esc(p.tagline || '')}</p>
            <div class="pl-price" style="font-size:26px">${RV.money(p.price)} <small>${P[p.billingPeriod] || ''}</small></div>
            <ul class="pl-list">${(p.features || []).slice(0, 5).map(f => `<li><i class="fa-solid fa-check"></i><span>${esc(f)}</span></li>`).join('')}</ul>
            <button class="pt-btn ${p.highlight ? 'primary' : ''}" data-plan="${esc(p._id)}">Wybieram</button></div>`).join('')}</div>`
          : empty('fa-rotate', 'Abonamenty wkrótce', 'Cennik abonamentów przygotowujemy. Zadzwoń, a ustalimy stałą opiekę indywidualnie.', '<a class="pt-btn" href="tel:+48735396534">735 396 534</a>')}`;
      $$('[data-sub]', el).forEach(b => b.addEventListener('click', async () => {
        const action = b.dataset.sub;
        const reason = action === 'cancel' ? prompt('Dlaczego rezygnujesz? (opcjonalnie)') : '';
        if (reason === null) return;
        b.disabled = true;
        try { await RV.api(`/api/konto/subscriptions/${encodeURIComponent(b.dataset.id)}/${action}`, { method: 'POST', body: { reason } }); RV.toast(action === 'cancel' ? 'Zapisane. Potwierdzimy rezygnację.' : 'Prośba wysłana.'); VIEWS.abonamenty.render(el, { query: new URLSearchParams() }); } catch (e) { RV.toast(e.message, 'error'); b.disabled = false; }
      }));
      $$('[data-plan]', el).forEach(b => b.addEventListener('click', () => subscribe(d.plans.find(p => p._id === b.dataset.plan), el)));
      const wanted = query.get('plan');
      if (wanted) { const p = d.plans.find(x => x._id === wanted); if (p) { history.replaceState(null, '', '#/abonamenty'); subscribe(p, el); } }
    }
  };

  function subscribe(p, el) {
    const d = RV.dialog(p.name, `<form class="pt-form" novalidate>
      <p class="full pt-muted" style="margin:0">${RV.money(p.price)} ${RV.PERIOD?.[p.billingPeriod] || ''}${p.season ? ' · sezon ' + esc(p.season) : ''}. Aktywujemy abonament po krótkiej rozmowie — zadzwonimy, żeby potwierdzić zakres.</p>
      <div class="pt-field full"><label for="sbA">Adres obiektu / posesji</label><input id="sbA" name="address" required minlength="3" value="${esc([S.me.address, S.me.city].filter(Boolean).join(', '))}"></div>
      <div class="pt-field"><label for="sbArea">Zakres / powierzchnia</label><input id="sbArea" name="area" placeholder="np. podjazd 60 m², ogród 400 m²"></div>
      <div class="pt-field"><label for="sbS">Od kiedy</label><input id="sbS" name="startDate" type="date" min="${RV.todayISO()}"></div>
      <div class="pt-field full"><label for="sbN">Uwagi</label><textarea id="sbN" name="note" placeholder="Dojazd, brama, klucze, godziny…"></textarea></div>
      <label class="pt-check full"><input type="checkbox" name="consent" required><span>Rozumiem, że abonament zostanie aktywowany po potwierdzeniu przez RevSerwis, a płatność jest cykliczna. Mogę zrezygnować w panelu.</span></label>
      <div class="pt-error full" role="alert"></div><button class="rv-button full" type="submit">Zamawiam abonament</button></form>`);
    const f = $('form', d);
    f.addEventListener('submit', e => {
      e.preventDefault();
      RV.submit(f, async () => {
        await RV.api('/api/konto/subscriptions', { method: 'POST', body: { ...RV.formData(f), plan: p._id } });
        d.close();
        RV.toast('Dziękujemy! Zadzwonimy, żeby aktywować abonament.');
        VIEWS.abonamenty.render(el, { query: new URLSearchParams() });
      });
    });
  }

  /* ---------- Outlet i kursy ---------- */
  VIEWS.zakupy = {
    title: 'Outlet i kursy',
    async render(el) {
      const [o, b] = await Promise.all([RV.api('/api/konto/outlet-orders'), RV.api('/api/konto/bookings')]);
      el.innerHTML = `${head('RevOutlet i RevPowrót', 'Twoje rezerwacje rzeczy z outletu i miejsc w kursach powrotnych.', '<a class="pt-btn" href="outlet.html"><i class="fa-solid fa-couch"></i> RevOutlet</a><a class="pt-btn" href="powrot.html"><i class="fa-solid fa-route"></i> RevPowrót</a>')}
        <h2 class="kt-section-title"><i class="fa-solid fa-couch" style="color:var(--rv-accent)"></i> RevOutlet</h2>
        <div class="kt-list">${o.orders.length ? o.orders.map(x => `<div class="kt-row"><div class="ic"><i class="fa-solid fa-couch"></i></div><div><strong>${esc(x.itemTitle)}</strong><small>${esc(x.number)} · ${RV.day(x.createdAt)} · ${x.delivery === 'delivery' ? 'dowóz' : 'odbiór osobisty'}</small></div><div class="end">${tag(ORDER[x.status])}<small>${RV.money(x.price + (x.deliveryPrice || 0))}</small></div></div>`).join('')
          : empty('fa-couch', 'Brak rezerwacji', 'Meble i AGD z drugiej ręki — sprawdzone, z dowozem.', '<a class="pt-btn" href="outlet.html">Przeglądaj RevOutlet</a>')}</div>
        <h2 class="kt-section-title"><i class="fa-solid fa-route" style="color:var(--rv-accent)"></i> RevPowrót</h2>
        <div class="kt-list">${b.bookings.length ? b.bookings.map(x => `<div class="kt-row"><div class="ic"><i class="fa-solid fa-route"></i></div><div><strong>${x.trip ? esc(x.trip.from + ' → ' + x.trip.to) : 'Kurs'}</strong><small>${esc(x.number)} · ${x.trip ? RV.dayShort(x.trip.date) : ''} · ${x.volumeM3} m³</small></div><div class="end">${tag(ORDER[x.status])}<small>${RV.money(x.price)}</small></div></div>`).join('')
          : empty('fa-route', 'Brak rezerwacji', 'Wolne miejsce w busie wracającym z trasy — taniej niż osobny transport.', '<a class="pt-btn" href="powrot.html">Zobacz kursy</a>')}</div>`;
    }
  };

  /* ---------- Panel hotelu ---------- */
  VIEWS.hotel = {
    title: 'Hotel / pensjonat',
    access: 'hotel',
    async render(el) {
      const d = await RV.api('/api/b2b/hotel/overview');
      const C = window.RV_PORTAL || {};
      const W = C.weekdays || ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
      const props = new Map(d.properties.map(p => [p._id, p]));
      el.innerHTML = `${head(S.me.hotel?.companyName || 'Panel hotelu', 'Obiekty, stałe trasy i zamówienia dla Twojego hotelu lub pensjonatu.', `<button class="pt-btn primary" data-order ${d.properties.length ? '' : 'disabled'}><i class="fa-solid fa-plus"></i> Jednorazowe zamówienie</button>`)}
        <div class="kt-stats">
          <div class="kt-stat"><small>Obiekty</small><strong>${d.stats.properties}</strong></div>
          <div class="kt-stat"><small>Aktywne trasy</small><strong>${d.stats.activeRoutes}${d.stats.pendingRoutes ? ` <span class="pt-badge amber" style="font-size:11px">+${d.stats.pendingRoutes} do akceptacji</span>` : ''}</strong></div>
          <div class="kt-stat"><small>Najbliższe 7 dni</small><strong>${d.stats.next7}</strong></div>
          <div class="kt-stat"><small>W tym miesiącu</small><strong>${RV.money(d.stats.monthValue)}</strong></div></div>
        <h2 class="kt-section-title"><i class="fa-solid fa-hotel" style="color:var(--rv-accent)"></i> Obiekty <button class="pt-btn sm" data-prop style="margin-left:auto"><i class="fa-solid fa-plus"></i> Dodaj obiekt</button></h2>
        ${d.properties.length ? `<div class="pt-grid">${d.properties.map(p => `<div class="pt-card"><div style="display:flex;justify-content:space-between;gap:8px"><h3>${esc(p.name)}</h3><button class="pt-btn sm" data-prop="${esc(p._id)}" aria-label="Edytuj"><i class="fa-solid fa-pen"></i></button></div><p>${esc(p.address)}</p><p class="pt-small" style="margin-top:6px">${p.rooms ? p.rooms + ' pokoi · ' : ''}${esc(p.contactName || '')} ${esc(p.contactPhone || '')}</p></div>`).join('')}</div>`
          : empty('fa-hotel', 'Dodaj pierwszy obiekt', 'Hotel, pensjonat, apartamenty — z adresem i osobą kontaktową. Potem ustawisz stałe trasy.', '<button class="rv-button" data-prop>Dodaj obiekt</button>')}
        <h2 class="kt-section-title"><i class="fa-solid fa-repeat" style="color:var(--rv-accent)"></i> Stałe trasy <button class="pt-btn sm" data-route style="margin-left:auto" ${d.properties.length ? '' : 'disabled'}><i class="fa-solid fa-plus"></i> Nowa trasa</button></h2>
        <p class="pt-small pt-muted" style="margin:-4px 0 12px">Np. pościel do pralni w poniedziałki i czwartki o 9:00. Po akceptacji przez RevSerwis zlecenia tworzą się same na 2 tygodnie do przodu.</p>
        ${d.routes.length ? `<div class="kt-list">${d.routes.map(r => `<div class="pt-card" style="display:grid;gap:10px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong style="color:#fff">${esc(r.service)}</strong><div class="pt-small pt-muted">${esc(r.propertyName)} · godz. ${esc(r.time)}${r.pricePerRun ? ' · ' + RV.money(r.pricePerRun) + ' / kurs' : ''}</div></div><div>${!r.approved ? '<span class="pt-badge amber">Czeka na akceptację</span>' : r.active ? '<span class="pt-badge mint">Aktywna</span>' : '<span class="pt-badge muted">Wstrzymana</span>'}</div></div>
            <div class="kt-week">${W.map((w, i) => `<span class="${r.weekdays.includes(i + 1) ? 'on' : ''}">${esc(w)}</span>`).join('')}</div>
            ${r.description ? `<p class="pt-small">${esc(r.description)}</p>` : ''}
            <div class="pt-btn-row"><button class="pt-btn sm" data-toggle="${esc(r.id)}" data-active="${r.active ? '1' : '0'}">${r.active ? 'Wstrzymaj' : 'Wznów'}</button><button class="pt-btn sm" data-route="${esc(r.id)}">Edytuj</button><button class="pt-btn sm danger" data-rdel="${esc(r.id)}">Usuń</button></div></div>`).join('')}</div>`
          : empty('fa-repeat', 'Brak stałych tras', 'Ustaw powtarzalne kursy — nie musisz dzwonić za każdym razem.')}
        <h2 class="kt-section-title"><i class="fa-solid fa-calendar-days" style="color:var(--rv-accent)"></i> Nadchodzące</h2>
        <div class="kt-list">${d.upcoming.length ? d.upcoming.map(orderRow).join('') : empty('fa-calendar', 'Nic zaplanowanego', 'Zlecenia ze stałych tras i zamówień pojawią się tutaj.')}</div>
        <h2 class="kt-section-title"><i class="fa-solid fa-file-invoice" style="color:var(--rv-accent)"></i> Zestawienie miesięczne</h2>
        <div class="pt-card"><div class="pt-toolbar" style="margin-bottom:8px"><div class="pt-field"><input type="month" id="htMonth" value="${new Date().toISOString().slice(0, 7)}" aria-label="Miesiąc"></div><button class="pt-btn sm" data-print><i class="fa-solid fa-print"></i> Drukuj</button></div><div id="htSummary" class="kt-scroll"></div></div>`;

      const reload = () => VIEWS.hotel.render(el);
      $$('[data-prop]', el).forEach(b => b.addEventListener('click', () => propertyForm(props.get(b.dataset.prop) || null, reload)));
      $$('[data-route]', el).forEach(b => b.addEventListener('click', () => routeForm(d.routes.find(r => r.id === b.dataset.route) || null, d.properties, C, reload)));
      $('[data-order]', el)?.addEventListener('click', () => hotelOrder(d.properties, C, reload));
      $$('[data-toggle]', el).forEach(b => b.addEventListener('click', async () => { try { await RV.api('/api/b2b/hotel/routes/' + encodeURIComponent(b.dataset.toggle), { method: 'PUT', body: { active: b.dataset.active !== '1' } }); reload(); } catch (e) { RV.toast(e.message, 'error'); } }));
      $$('[data-rdel]', el).forEach(b => b.addEventListener('click', async () => { if (!confirm('Usunąć stałą trasę? Zaplanowane już zlecenia zostaną.')) return; try { await RV.api('/api/b2b/hotel/routes/' + encodeURIComponent(b.dataset.rdel), { method: 'DELETE' }); reload(); } catch (e) { RV.toast(e.message, 'error'); } }));
      const loadSummary = async () => {
        const s = await RV.api('/api/b2b/hotel/summary?month=' + encodeURIComponent($('#htMonth', el).value));
        $('#htSummary', el).innerHTML = s.rows.length ? `<table class="kt-table"><thead><tr><th>Data</th><th>Zlecenie</th><th>Obiekt</th><th>Usługa</th><th class="num">Kwota</th></tr></thead><tbody>${s.rows.map(r => `<tr><td>${RV.day(r.date)}</td><td>${esc(r.number)}</td><td>${esc(r.property)}</td><td>${esc(r.service)}</td><td class="num">${RV.money(r.value)}</td></tr>`).join('')}</tbody><tfoot><tr><th colspan="4">Razem</th><th class="num">${RV.money(s.total)}</th></tr></tfoot></table>` : '<p class="pt-muted">Brak zrealizowanych zleceń w tym miesiącu.</p>';
      };
      $('#htMonth', el).addEventListener('change', () => loadSummary().catch(e => RV.toast(e.message, 'error')));
      $('[data-print]', el).addEventListener('click', () => window.print());
      loadSummary().catch(() => null);
    }
  };

  function propertyForm(p, done) {
    const d = RV.dialog(p ? 'Edytuj obiekt' : 'Nowy obiekt', `<form class="pt-form" novalidate>
      <div class="pt-field full"><label for="hpN">Nazwa</label><input id="hpN" name="name" required minlength="2" value="${esc(p?.name || '')}" placeholder="np. Pensjonat Bryza"></div>
      <div class="pt-field full"><label for="hpA">Adres</label><input id="hpA" name="address" required minlength="3" value="${esc(p?.address || '')}"></div>
      <div class="pt-field"><label for="hpR">Liczba pokoi</label><input id="hpR" name="rooms" type="number" min="0" value="${esc(p?.rooms ?? '')}"></div>
      <div class="pt-field"><label for="hpC">Osoba kontaktowa</label><input id="hpC" name="contactName" value="${esc(p?.contactName || '')}"></div>
      <div class="pt-field"><label for="hpP">Telefon na miejscu</label><input id="hpP" name="contactPhone" type="tel" value="${esc(p?.contactPhone || '')}"></div>
      <div class="pt-field full"><label for="hpAc">Dojazd, klucze, rampa</label><textarea id="hpAc" name="accessNotes">${esc(p?.accessNotes || '')}</textarea></div>
      <div class="pt-error full" role="alert"></div>
      <div class="pt-btn-row full">${p ? '<button class="pt-btn danger" type="button" data-del>Usuń obiekt</button>' : ''}<button class="rv-button" type="submit" style="margin-left:auto">Zapisz</button></div></form>`);
    const f = $('form', d);
    f.addEventListener('submit', e => { e.preventDefault(); RV.submit(f, async () => { const body = RV.formData(f); await RV.api('/api/b2b/hotel/properties' + (p ? '/' + encodeURIComponent(p._id) : ''), { method: p ? 'PUT' : 'POST', body }); d.close(); done(); }); });
    $('[data-del]', f)?.addEventListener('click', async () => { if (!confirm('Usunąć obiekt i wstrzymać jego stałe trasy?')) return; try { await RV.api('/api/b2b/hotel/properties/' + encodeURIComponent(p._id), { method: 'DELETE' }); d.close(); done(); } catch (e) { RV.toast(e.message, 'error'); } });
  }

  function routeForm(r, properties, C, done) {
    const W = C.weekdays || ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'];
    const d = RV.dialog(r ? 'Edytuj stałą trasę' : 'Nowa stała trasa', `<form class="pt-form" novalidate>
      <div class="pt-field"><label for="hrP">Obiekt</label><select id="hrP" name="property" required>${properties.map(p => `<option value="${esc(p._id)}" ${r?.property === p._id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div>
      <div class="pt-field"><label for="hrS">Usługa</label><select id="hrS" name="service">${RV.opts(C.hotelServices || ['Inne'], r?.service)}</select></div>
      <div class="pt-field full"><span class="pt-label">Dni tygodnia</span><div class="pt-options">${W.map((w, i) => `<label class="pt-option"><input type="checkbox" name="weekdays" value="${i + 1}" data-group="1" ${r?.weekdays?.includes(i + 1) ? 'checked' : ''}><span>${esc(w)}</span></label>`).join('')}</div></div>
      <div class="pt-field"><label for="hrT">Godzina</label><input id="hrT" name="time" type="time" required value="${esc(r?.time || '09:00')}"></div>
      <div class="pt-field"><label for="hrE">Do kiedy (opcjonalnie)</label><input id="hrE" name="endDate" type="date" value="${r?.endDate ? String(r.endDate).slice(0, 10) : ''}"></div>
      <div class="pt-field full"><label for="hrD">Opis</label><textarea id="hrD" name="description" required minlength="3" placeholder="np. odbiór brudnej pościeli z magazynku przy recepcji, dowóz czystej z pralni">${esc(r?.description || '')}</textarea></div>
      <p class="pt-small pt-muted full" style="margin:0">${r?.approved ? 'Zmiana dni, godziny lub usługi wymaga ponownej akceptacji przez RevSerwis.' : 'Trasę zaakceptujemy i wycenimy — dostaniesz e-mail.'}</p>
      <div class="pt-error full" role="alert"></div><button class="rv-button full" type="submit">Zapisz trasę</button></form>`);
    const f = $('form', d);
    f.addEventListener('submit', e => {
      e.preventDefault();
      RV.submit(f, async () => {
        const body = RV.formData(f);
        body.weekdays = (body.weekdays || []).map(Number);
        if (!body.weekdays.length) throw new Error('Wybierz przynajmniej jeden dzień.');
        if (!body.endDate) body.endDate = null;
        await RV.api('/api/b2b/hotel/routes' + (r ? '/' + encodeURIComponent(r.id) : ''), { method: r ? 'PUT' : 'POST', body });
        d.close();
        RV.toast(r ? 'Zapisane.' : 'Trasa wysłana do akceptacji.');
        done();
      });
    });
  }

  function hotelOrder(properties, C, done) {
    const rid = RV.rid();
    const d = RV.dialog('Jednorazowe zamówienie', `<form class="pt-form" novalidate>
      <div class="pt-field"><label for="hoP">Obiekt</label><select id="hoP" name="property" required>${properties.map(p => `<option value="${esc(p._id)}">${esc(p.name)}</option>`).join('')}</select></div>
      <div class="pt-field"><label for="hoS">Usługa</label><select id="hoS" name="service">${RV.opts(C.hotelServices || ['Inne'])}</select></div>
      <div class="pt-field"><label for="hoD">Data</label><input id="hoD" name="date" type="date" required min="${RV.todayISO()}"></div>
      <div class="pt-field"><label for="hoT">Godzina (opcjonalnie)</label><input id="hoT" name="time" type="time"></div>
      <div class="pt-field full"><label for="hoDs">Opis</label><textarea id="hoDs" name="description" required minlength="3"></textarea></div>
      <label class="pt-check full"><input type="checkbox" name="urgent"><span>Pilne</span></label>
      <div class="pt-error full" role="alert"></div><button class="rv-button full" type="submit">Zamów</button></form>`);
    const f = $('form', d);
    f.addEventListener('submit', e => { e.preventDefault(); RV.submit(f, async () => { const body = RV.formData(f); if (!body.time) delete body.time; await RV.api('/api/b2b/hotel/orders', { method: 'POST', body: { ...body, requestId: rid } }); d.close(); RV.toast('Zamówienie przyjęte.'); done(); }); });
  }

  /* ---------- Portal partnera ---------- */
  VIEWS.partner = {
    title: 'Portal partnera',
    access: 'partner',
    async render(el) {
      const d = await RV.api('/api/b2b/partner/overview');
      const RS = { new: 'amber', contacted: 'blue', planned: 'blue', completed: 'mint', lost: 'muted' };
      el.innerHTML = `${head(S.me.partner?.agencyName || 'Portal partnera', `Poleć klienta — zajmiemy się przeprowadzką, opróżnieniem lub przygotowaniem mieszkania. Twoja prowizja: <strong style="color:var(--rv-accent)">${d.commissionPct}%</strong> wartości zrealizowanego zlecenia.`, '<button class="pt-btn primary" data-ref><i class="fa-solid fa-user-plus"></i> Poleć klienta</button>')}
        <div class="kt-stats">
          <div class="kt-stat"><small>Polecenia</small><strong>${d.stats.total}</strong></div>
          <div class="kt-stat"><small>Zrealizowane</small><strong>${d.stats.completed} <span class="pt-small pt-muted">(${d.stats.conversion}%)</span></strong></div>
          <div class="kt-stat"><small>Prowizja do wypłaty</small><strong>${RV.money(d.stats.commissionPending)}</strong></div>
          <div class="kt-stat"><small>Wypłacono</small><strong>${RV.money(d.stats.commissionPaid)}</strong></div></div>
        <div class="kt-list">${d.referrals.length ? d.referrals.map(r => `<div class="pt-card" style="display:grid;gap:8px">
            <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong style="color:#fff">${esc(r.clientName)}</strong><div class="pt-small pt-muted">${esc(r.number)} · ${RV.day(r.createdAt)} · ${esc(r.propertyAddress)}</div></div><span class="pt-badge ${RS[r.status] || ''}">${esc(r.statusLabel)}</span></div>
            <div class="pt-small">${esc(r.services.join(' · '))}</div>
            ${r.statusNote ? `<div class="pt-small" style="color:#c4c8cf"><i class="fa-solid fa-comment" style="color:var(--rv-accent)"></i> ${esc(r.statusNote)}</div>` : ''}
            ${r.status === 'completed' ? `<div class="rp-row"><span>Wartość: <strong style="color:#fff">${RV.money(r.orderValue || 0)}</strong></span><span>Prowizja ${r.commissionPct}%: <strong style="color:var(--rv-accent)">${RV.money(r.commissionAmount)}</strong></span><span class="pt-badge ${r.commissionStatus === 'paid' ? 'mint' : 'amber'}">${esc(r.commissionLabel)}</span></div>` : ''}
          </div>`).join('') : empty('fa-handshake', 'Brak poleceń', 'Twój klient kupił lub sprzedał mieszkanie? Poleć nas — zadzwonimy do niego w ciągu jednego dnia roboczego.', '<button class="rv-button" data-ref>Poleć pierwszego klienta</button>')}</div>`;
      $$('[data-ref]', el).forEach(b => b.addEventListener('click', () => referralForm(d.services, () => VIEWS.partner.render(el))));
    }
  };

  function referralForm(services, done) {
    const rid = RV.rid();
    const d = RV.dialog('Poleć klienta', `<form class="pt-form" novalidate>
      <div class="pt-field"><label for="rfN">Imię i nazwisko klienta</label><input id="rfN" name="clientName" required minlength="2"></div>
      <div class="pt-field"><label for="rfP">Telefon klienta</label><input id="rfP" name="clientPhone" type="tel" required></div>
      <div class="pt-field full"><label for="rfE">E-mail klienta (opcjonalnie)</label><input id="rfE" name="clientEmail" type="email"></div>
      <div class="pt-field full"><span class="pt-label">Czego potrzebuje?</span><div class="pt-options">${services.map(s => `<label class="pt-option"><input type="checkbox" name="services" value="${esc(s)}" data-group="1"><span>${esc(s)}</span></label>`).join('')}</div></div>
      <div class="pt-field"><label for="rfA">Adres nieruchomości</label><input id="rfA" name="propertyAddress" required minlength="3"></div>
      <div class="pt-field"><label for="rfT">Adres docelowy (przeprowadzka)</label><input id="rfT" name="targetAddress"></div>
      <div class="pt-field"><label for="rfD">Preferowany termin</label><input id="rfD" name="preferredDate" type="date" min="${RV.todayISO()}"></div>
      <div class="pt-field"><label for="rfL">Link do ogłoszenia</label><input id="rfL" name="listingUrl" type="url" placeholder="https://"></div>
      <div class="pt-field full"><label for="rfNo">Uwagi</label><textarea id="rfNo" name="notes" placeholder="Metraż, piętro, termin wydania kluczy, co zostaje w mieszkaniu…"></textarea></div>
      <label class="pt-check full"><input type="checkbox" name="clientConsent" required><span>Klient zgodził się, żeby RevSerwis skontaktował się z nim w tej sprawie.</span></label>
      <div class="pt-error full" role="alert"></div><button class="rv-button full" type="submit">Wyślij polecenie</button></form>`);
    const f = $('form', d);
    f.addEventListener('submit', e => {
      e.preventDefault();
      RV.submit(f, async () => {
        const body = RV.formData(f);
        if (!body.services?.length) throw new Error('Wybierz przynajmniej jedną usługę.');
        if (!body.preferredDate) body.preferredDate = null;
        const r = await RV.api('/api/b2b/partner/referrals', { method: 'POST', body: { ...body, requestId: rid } });
        d.close();
        RV.toast('Dziękujemy! Polecenie ' + r.referral.number + ' przyjęte.');
        done();
      });
    });
  }

  /* ---------- Panel dewelopera ---------- */
  VIEWS.deweloper = {
    title: 'Panel dewelopera',
    access: 'developer',
    async render(el) {
      const d = await RV.api('/api/b2b/developer/overview');
      const LS = { new: 'amber', contacted: 'blue', planned: 'blue', completed: 'mint', lost: 'muted' };
      const invName = id => d.investments.find(i => i._id === id)?.name || '—';
      el.innerHTML = `${head(S.me.company || 'Panel dewelopera', 'Zaoferuj nabywcom przeprowadzkę, sprzątanie i montaż mebli przy odbiorze kluczy. Każda inwestycja ma własny link i kod dla nabywców.', `<button class="pt-btn primary" data-inv><i class="fa-solid fa-plus"></i> Nowa inwestycja</button>`)}
        <div class="kt-stats">
          <div class="kt-stat"><small>Inwestycje</small><strong>${d.stats.investments}</strong></div>
          <div class="kt-stat"><small>Zgłoszenia nabywców</small><strong>${d.stats.leads}</strong></div>
          <div class="kt-stat"><small>Sami przez link</small><strong>${d.stats.self}</strong></div>
          <div class="kt-stat"><small>Zrealizowane</small><strong>${d.stats.completed}</strong></div></div>
        <h2 class="kt-section-title"><i class="fa-solid fa-city" style="color:var(--rv-accent)"></i> Inwestycje</h2>
        ${d.investments.length ? `<div class="pt-grid">${d.investments.map(i => `<div class="pt-card kd-inv ${i.active ? '' : 'off'}">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:flex-start"><div><h3>${esc(i.name)}</h3><p>${esc(i.city)} · ${esc(i.address)}</p></div><button class="pt-btn sm" data-inv="${esc(i._id)}" aria-label="Edytuj"><i class="fa-solid fa-pen"></i></button></div>
            <div class="kd-code"><div><small>Kod dla nabywców</small><strong>${esc(i.code)}</strong></div><button class="pt-btn sm" data-copy="${esc(location.origin + i.link)}"><i class="fa-solid fa-link"></i> Kopiuj link</button></div>
            <div class="rp-row"><span><i class="fa-solid fa-users"></i>${i.leads} zgłoszeń</span><span><i class="fa-solid fa-eye"></i>${i.visits || 0} wejść</span>${i.discountPct ? `<span class="pt-badge mint">−${i.discountPct}% dla nabywców</span>` : ''}${i.handoverFrom ? `<span><i class="fa-solid fa-key"></i>odbiory od ${RV.day(i.handoverFrom)}</span>` : ''}</div>
            <div class="pt-btn-row"><button class="pt-btn sm primary" data-lead="${esc(i._id)}"><i class="fa-solid fa-user-plus"></i> Dodaj nabywcę</button><a class="pt-btn sm" href="${esc(i.link)}" target="_blank" rel="noopener"><i class="fa-solid fa-arrow-up-right-from-square"></i> Strona dla nabywców</a></div></div>`).join('')}</div>`
          : empty('fa-city', 'Dodaj pierwszą inwestycję', 'Dostaniesz link i kod, które przekażesz nabywcom razem z dokumentami odbioru — zgłoszą się sami albo dodasz ich tutaj.', '<button class="rv-button" data-inv>Dodaj inwestycję</button>')}
        <h2 class="kt-section-title"><i class="fa-solid fa-people-carry-box" style="color:var(--rv-accent)"></i> Nabywcy</h2>
        <div class="kt-list">${d.leads.length ? d.leads.map(l => `<div class="pt-card" style="display:grid;gap:6px"><div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap"><div><strong style="color:#fff">${esc(l.name)}</strong>${l.unit ? ` <span class="pt-muted">· lok. ${esc(l.unit)}</span>` : ''}<div class="pt-small pt-muted">${esc(l.number)} · ${esc(invName(l.investment))} · ${RV.day(l.createdAt)}${l.via === 'buyer' ? ' · zgłosił się sam' : ''}</div></div><span class="pt-badge ${LS[l.status] || ''}">${esc(l.statusLabel)}</span></div><div class="pt-small">${esc(l.services.join(' · '))}${l.moveDate ? ` · przeprowadzka ${RV.day(l.moveDate)}` : ''}</div></div>`).join('')
          : empty('fa-people-carry-box', 'Brak zgłoszeń', 'Przekaż nabywcom link do strony inwestycji albo dodaj ich ręcznie.')}</div>`;
      const reload = () => VIEWS.deweloper.render(el);
      $$('[data-inv]', el).forEach(b => b.addEventListener('click', () => investmentForm(d.investments.find(i => i._id === b.dataset.inv) || null, reload)));
      $$('[data-lead]', el).forEach(b => b.addEventListener('click', () => devLeadForm(d.investments.find(i => i._id === b.dataset.lead), d.services, reload)));
      $$('[data-copy]', el).forEach(b => b.addEventListener('click', async () => { try { await navigator.clipboard.writeText(b.dataset.copy); RV.toast('Skopiowano link: ' + b.dataset.copy); } catch { prompt('Skopiuj link:', b.dataset.copy); } }));
    }
  };

  function investmentForm(i, done) {
    const d = RV.dialog(i ? 'Edytuj inwestycję' : 'Nowa inwestycja', `<form class="pt-form" novalidate>
      <div class="pt-field full"><label for="ivN">Nazwa</label><input id="ivN" name="name" required value="${esc(i?.name || '')}" placeholder="np. Osiedle Zielone, etap II"></div>
      <div class="pt-field"><label for="ivC">Miasto</label><input id="ivC" name="city" required value="${esc(i?.city || '')}"></div>
      <div class="pt-field"><label for="ivA">Adres</label><input id="ivA" name="address" required value="${esc(i?.address || '')}"></div>
      <div class="pt-field"><label for="ivU">Liczba lokali</label><input id="ivU" name="units" type="number" min="0" value="${esc(i?.units ?? '')}"></div>
      <div class="pt-field"><label for="ivF">Odbiory od</label><input id="ivF" name="handoverFrom" type="date" value="${i?.handoverFrom ? String(i.handoverFrom).slice(0, 10) : ''}"></div>
      <div class="pt-field"><label for="ivT">Odbiory do</label><input id="ivT" name="handoverTo" type="date" value="${i?.handoverTo ? String(i.handoverTo).slice(0, 10) : ''}"></div>
      <div class="pt-field full"><label for="ivO">Informacja dla nabywców (na ich stronie)</label><input id="ivO" name="buyerOffer" maxlength="300" value="${esc(i?.buyerOffer || '')}" placeholder="np. Gratulujemy zakupu! Skorzystaj z oferty partnera przy przeprowadzce."></div>
      ${i ? `<label class="pt-check full"><input type="checkbox" name="active" ${i.active ? 'checked' : ''}><span>Aktywna (link działa)</span></label>` : ''}
      <p class="pt-small pt-muted full" style="margin:0">Rabat dla nabywców ustala z Tobą RevSerwis — pojawi się automatycznie na ich stronie.</p>
      <div class="pt-error full" role="alert"></div><button class="rv-button full" type="submit">Zapisz</button></form>`);
    const f = $('form', d);
    f.addEventListener('submit', e => { e.preventDefault(); RV.submit(f, async () => { const body = RV.formData(f); for (const k of ['handoverFrom', 'handoverTo']) if (!body[k]) body[k] = null; if (!i) body.active = true; await RV.api('/api/b2b/developer/investments' + (i ? '/' + encodeURIComponent(i._id) : ''), { method: i ? 'PUT' : 'POST', body }); d.close(); RV.toast('Zapisano'); done(); }); });
  }

  function devLeadForm(inv, services, done) {
    const rid = RV.rid();
    const d = RV.dialog('Nabywca — ' + inv.name, `<form class="pt-form" novalidate>
      <div class="pt-field"><label for="dlN">Imię i nazwisko</label><input id="dlN" name="name" required></div>
      <div class="pt-field"><label for="dlP">Telefon</label><input id="dlP" name="phone" type="tel" required></div>
      <div class="pt-field"><label for="dlE">E-mail</label><input id="dlE" name="email" type="email"></div>
      <div class="pt-field"><label for="dlU">Lokal</label><input id="dlU" name="unit" placeholder="np. B/12"></div>
      <div class="pt-field"><label for="dlH">Odbiór kluczy</label><input id="dlH" name="handoverDate" type="date"></div>
      <div class="pt-field"><label for="dlM">Planowana przeprowadzka</label><input id="dlM" name="moveDate" type="date" min="${RV.todayISO()}"></div>
      <div class="pt-field full"><label for="dlF">Skąd się przeprowadza</label><input id="dlF" name="fromAddress"></div>
      <div class="pt-field full"><span class="pt-label">Czego potrzebuje?</span><div class="pt-options">${services.map(s => `<label class="pt-option"><input type="checkbox" name="services" value="${esc(s)}" data-group="1"><span>${esc(s)}</span></label>`).join('')}</div></div>
      <div class="pt-field full"><label for="dlNo">Uwagi</label><textarea id="dlNo" name="notes"></textarea></div>
      <label class="pt-check full"><input type="checkbox" name="buyerConsent" required><span>Nabywca zgodził się, żeby RevSerwis skontaktował się z nim w tej sprawie.</span></label>
      <div class="pt-error full" role="alert"></div><button class="rv-button full" type="submit">Wyślij do RevSerwis</button></form>`);
    const f = $('form', d);
    f.addEventListener('submit', e => { e.preventDefault(); RV.submit(f, async () => { const body = RV.formData(f); if (!body.services?.length) throw new Error('Wybierz usługę.'); for (const k of ['handoverDate', 'moveDate']) if (!body[k]) body[k] = null; await RV.api('/api/b2b/developer/leads', { method: 'POST', body: { ...body, investment: inv._id, requestId: rid } }); d.close(); RV.toast('Dziękujemy — zadzwonimy do nabywcy.'); done(); }); });
  }

  /* ---------- Ustawienia ---------- */
  VIEWS.ustawienia = {
    title: 'Profil i dane',
    async render(el) {
      const m = S.me;
      el.innerHTML = `${head('Profil i dane', 'Dane kontaktowe, powiadomienia, hasło i Twoje dane osobowe.')}
        <div class="pt-grid cols-2" style="align-items:start">
          <form id="pfForm" class="pt-form pt-card" novalidate style="padding:22px">
            <h3 class="full" style="margin:0">Dane</h3>
            <div class="pt-field full"><label for="pfN">Imię i nazwisko</label><input id="pfN" name="name" required value="${esc(m.name)}"></div>
            ${m.kind === 'company' ? `<div class="pt-field"><label for="pfC">Firma</label><input id="pfC" name="company" value="${esc(m.company)}"></div><div class="pt-field"><label for="pfNip">NIP</label><input id="pfNip" name="nip" value="${esc(m.nip)}"></div>` : ''}
            <div class="pt-field"><label for="pfP">Telefon</label><input id="pfP" name="phone" type="tel" value="${esc(m.phone)}"></div>
            <div class="pt-field"><label>E-mail</label><input value="${esc(m.email)}" disabled></div>
            <div class="pt-field full"><label for="pfA">Adres (domyślny w zamówieniach)</label><input id="pfA" name="address" value="${esc(m.address)}" autocomplete="street-address"></div>
            <div class="pt-field"><label for="pfPc">Kod pocztowy</label><input id="pfPc" name="postalCode" value="${esc(m.postalCode)}" placeholder="76-200"></div>
            <div class="pt-field"><label for="pfCi">Miasto</label><input id="pfCi" name="city" value="${esc(m.city)}"></div>
            ${m.kind === 'company' ? `<div class="pt-field full"><label for="pfIe">E-mail do faktur</label><input id="pfIe" name="invoiceEmail" type="email" value="${esc(m.invoiceEmail)}"></div>` : ''}
            <h3 class="full" style="margin:8px 0 0">Powiadomienia</h3>
            <label class="pt-check full"><input type="checkbox" name="notifyEmail" ${m.notifyEmail ? 'checked' : ''}><span>E-mail o zmianie statusu zlecenia (wycena, termin, zakończenie)</span></label>
            <label class="pt-check full"><input type="checkbox" name="notifySms" ${m.notifySms ? 'checked' : ''}><span>SMS w sprawie moich zleceń (np. potwierdzenie terminu, prośba o opinię)</span></label>
            <label class="pt-check full"><input type="checkbox" name="marketingConsent" ${m.marketingConsent ? 'checked' : ''}><span>Promocje: RevOutlet, wolne kursy RevPowrót</span></label>
            <div class="pt-error full" role="alert"></div><button class="rv-button full" type="submit">Zapisz</button>
          </form>
          <div style="display:grid;gap:16px">
            <form id="pwForm" class="pt-form pt-card" novalidate style="padding:22px;grid-template-columns:1fr">
              <h3 style="margin:0">Zmiana hasła</h3>
              <div class="pt-field"><label for="pwC">Obecne hasło</label><input id="pwC" name="current" type="password" required autocomplete="current-password"></div>
              <div class="pt-field"><label for="pwN">Nowe hasło</label><input id="pwN" name="next" type="password" required minlength="8" autocomplete="new-password"></div>
              <div class="pt-error" role="alert"></div><button class="pt-btn primary" type="submit" style="justify-self:start">Zmień hasło</button>
            </form>
            <div class="pt-card"><h3>Konto</h3>
              <dl class="kt-kv" style="margin:10px 0 14px"><dt>Typ</dt><dd>${m.kind === 'company' ? 'Firma' : 'Osoba prywatna'}</dd><dt>E-mail</dt><dd>${m.emailVerified ? '<span style="color:var(--rv-accent)">potwierdzony</span>' : '<span style="color:#fcd34d">niepotwierdzony</span>'}</dd><dt>Od</dt><dd>${RV.day(m.createdAt)}</dd>
                <dt>Panele B2B</dt><dd>${m.access.length ? m.access.map(a => ({ hotel: 'Hotel / pensjonat', partner: 'Portal partnera', developer: 'Panel dewelopera' })[a] || a).join(', ') : 'brak — <a href="kontakt.html" style="color:var(--rv-accent)">zapytaj o współpracę</a>'}</dd></dl>
              <div class="pt-btn-row"><a class="pt-btn" href="/api/konto/export"><i class="fa-solid fa-download"></i> Pobierz moje dane</a><button class="pt-btn danger" data-delete ${m.deletionRequestedAt ? 'disabled' : ''}>${m.deletionRequestedAt ? 'Prośba o usunięcie wysłana' : 'Usuń konto'}</button></div></div>
          </div></div>`;
      const pf = $('#pfForm', el);
      pf.addEventListener('submit', e => { e.preventDefault(); RV.submit(pf, async () => { const r = await RV.api('/api/konto/profile', { method: 'PUT', body: RV.formData(pf) }); S.me = r.account; RV.toast('Zapisane.'); shell(); route(); }); });
      const pw = $('#pwForm', el);
      pw.addEventListener('submit', e => { e.preventDefault(); RV.submit(pw, async () => { await RV.api('/api/konto/password', { method: 'POST', body: RV.formData(pw) }); pw.reset(); RV.toast('Hasło zmienione.'); }); });
      $('[data-delete]', el)?.addEventListener('click', async e => {
        if (!confirm('Wysłać prośbę o usunięcie konta? Zlecenia i faktury przechowujemy zgodnie z prawem, ale konto i dostęp do panelu znikną.')) return;
        try { const r = await RV.api('/api/konto/delete-request', { method: 'POST' }); RV.toast(r.message); e.target.disabled = true; } catch (err) { RV.toast(err.message, 'error'); }
      });
    }
  };

  /* ------------------------------------------------------------------ */
  /* Start                                                               */
  /* ------------------------------------------------------------------ */

  async function verifyFromLink() {
    const token = new URLSearchParams(location.search).get('weryfikacja');
    if (!token) return '';
    history.replaceState(null, '', '/konto' + location.hash);
    try { const r = await RV.api('/api/konto/verify', { method: 'POST', body: { token } }); return r.message; } catch (e) { return e.message; }
  }

  function start() {
    root().innerHTML = '';
    shell();
    if (!location.hash || location.hash === '#') location.hash = '#/'; else route();
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const notice = await verifyFromLink();
    const me = await RV.loadMe();
    if (new URLSearchParams(location.search).get('reset')) { authView('reset'); return; }
    if (!me) { authView(location.hash.includes('rejestracja') ? 'register' : 'login', esc(notice)); return; }
    S.me = me;
    if (notice) RV.toast(notice);
    start();
  });
  window.addEventListener('hashchange', () => { if (S.me) route(); });
})();
