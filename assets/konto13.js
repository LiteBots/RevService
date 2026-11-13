/* RevSerwis 13 — panel klienta: logowanie numerem telefonu + hasłem, rejestracja, zlecenia z RevMi przypisane do numeru. */
(function () {
  'use strict';
  var app = document.getElementById('kontoApp');
  if (!app) return;
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var API = '/api/konto/telefon';
  var params = new URLSearchParams(location.search);
  var state = { me: null, orders: [], order: null, messages: [], tab: params.get('rejestracja') ? 'register' : 'login', sms: false, codeSent: false, view: 'orders', flash: '' };
  var money = function (n) { return new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 }).format(n) + ' zł'; };
  var dt = function (d, o) { return d ? new Date(d).toLocaleString('pl-PL', o || { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }) : ''; };
  var day = function (d) { return d ? new Date(d).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' }) : ''; };

  if (!document.getElementById('k13css')) {
    var st = document.createElement('style'); st.id = 'k13css';
    st.textContent = [
      '.k-split{display:grid;grid-template-columns:1fr 1fr;min-height:calc(100vh - 77px)}',
      '.k-left{padding:72px 64px;border-right:1px solid var(--line);background:var(--bg2);display:flex;flex-direction:column;justify-content:center}',
      '.k-left h1{font-size:clamp(34px,4vw,48px);font-weight:800;letter-spacing:-.03em}',
      '.k-left .lead{margin:14px 0 30px}',
      '.k-feat{display:flex;flex-direction:column;gap:20px}.k-feat>div{display:flex;gap:16px}',
      '.k-feat i{width:44px;height:44px;border-radius:12px;background:var(--mintSoft);color:var(--mint);display:grid;place-items:center;flex:none}',
      '.k-feat b{display:block}.k-feat span{color:var(--muted);font-size:14.5px}',
      '.k-right{display:grid;place-items:center;padding:56px 24px}',
      '.k-box{width:100%;max-width:430px}',
      '.k-tabs{display:grid;grid-template-columns:1fr 1fr;background:var(--s1);border:1px solid var(--line);border-radius:14px;padding:5px;margin-bottom:26px}',
      '.k-tabs button{padding:11px;border-radius:10px;font:700 15px inherit;font-family:inherit;color:var(--muted);background:none;border:0;cursor:pointer}',
      '.k-tabs button[aria-selected=true]{background:var(--s3);color:var(--text)}',
      '.k-ph{display:flex;align-items:center;border:1px solid var(--line2);border-radius:13px;background:var(--s2)}',
      '.k-ph:focus-within{border-color:var(--mint);box-shadow:0 0 0 4px rgba(3,240,186,.12)}',
      '.k-ph span{padding:0 12px 0 15px;color:var(--muted);font-weight:700;border-right:1px solid var(--line2)}',
      '.k-ph .in{border:0;background:none;box-shadow:none!important}',
      '.k-row{display:flex;justify-content:space-between;gap:12px;font-size:14px;margin:4px 0 20px;color:var(--muted)}',
      '.k-link{color:var(--mint);font-weight:700;background:none;border:0;cursor:pointer;font:inherit;font-weight:700;padding:0}',
      '.k-box .btn{width:100%}',
      '@media(max-width:900px){.k-split{grid-template-columns:1fr}.k-left{padding:36px 20px;border-right:0;border-bottom:1px solid var(--line)}.k-left .k-feat{display:none}.k-right{padding:30px 18px 60px}}',
      '.k-app{display:grid;grid-template-columns:250px 1fr;min-height:calc(100vh - 77px)}',
      '.k-side{border-right:1px solid var(--line);padding:24px 14px;display:flex;flex-direction:column;gap:4px;background:var(--bg2)}',
      '.k-side button,.k-side a{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:12px;font:600 15px inherit;font-family:inherit;color:#cbd0d6;background:none;border:0;cursor:pointer;text-align:left}',
      '.k-side i{width:18px;color:var(--muted)}',
      '.k-side .on{background:var(--s2);color:var(--text)}.k-side .on i{color:var(--mint)}',
      '.k-badge{margin-left:auto;background:var(--mint);color:var(--ink);font-size:11.5px;font-weight:800;padding:2px 7px;border-radius:7px}',
      '.k-me{margin-top:auto;padding:14px;border-top:1px solid var(--line);font-size:13.5px;color:var(--muted)}.k-me b{display:block;color:var(--text);font-size:15px}',
      '.k-main{padding:32px 40px 70px;min-width:0}',
      '@media(max-width:900px){.k-app{grid-template-columns:1fr}.k-side{flex-direction:row;overflow:auto;padding:10px;border-right:0;border-bottom:1px solid var(--line)}.k-side button,.k-side a{white-space:nowrap;padding:10px 12px}.k-me{display:none}.k-main{padding:22px 18px 70px}}',
      '.k-hello h1{font-size:clamp(26px,3vw,34px);font-weight:800}.k-hello p{color:var(--muted);margin:4px 0 24px}',
      '.k-card{background:var(--s1);border:1px solid var(--line);border-radius:22px;padding:24px;margin-bottom:18px}',
      '@media(max-width:640px){.k-card{padding:18px;border-radius:18px}}',
      '.k-ohead{display:flex;justify-content:space-between;align-items:start;gap:16px;flex-wrap:wrap}',
      '.k-ohead small{color:var(--muted);font-weight:700;font-size:13px}.k-ohead h2{font-size:22px;font-weight:800;margin:4px 0}.k-ohead .route{color:#d1d5db;font-weight:600;font-size:15px}',
      '.k-pill{display:inline-flex;align-items:center;gap:8px;padding:8px 13px;border-radius:999px;font-weight:800;font-size:13px;background:var(--s3);color:#d1d5db;white-space:nowrap}',
      '.k-pill.amber{background:rgba(251,191,36,.14);color:var(--amber)}.k-pill.mint{background:var(--mintSoft);color:var(--mint)}.k-pill.blue{background:rgba(96,165,250,.14);color:var(--blue)}.k-pill.red{background:rgba(248,113,113,.12);color:var(--red)}',
      '.k-track{display:grid;grid-template-columns:repeat(5,1fr);margin:28px 0 22px;position:relative}',
      '.k-st{position:relative;text-align:center;font-size:12.5px;font-weight:700;color:var(--dim);padding:0 4px}',
      '.k-st::before{content:"";position:absolute;top:15px;left:-50%;width:100%;height:3px;background:#26292e;z-index:0}',
      '.k-st:first-child::before{display:none}',
      '.k-st.done::before,.k-st.cur::before{background:var(--mint)}',
      '.k-st i{position:relative;z-index:1;width:32px;height:32px;border-radius:50%;display:grid;place-items:center;margin:0 auto 9px;background:#26292e;color:#6b7280;font-size:13px;border:3px solid var(--s1)}',
      '.k-st.done{color:#d1d5db}.k-st.done i{background:var(--mint);color:var(--ink)}',
      '.k-st.cur{color:var(--text)}.k-st.cur i{background:var(--amber);color:#1a1300;box-shadow:0 0 0 6px rgba(251,191,36,.15)}',
      '.k-st small{display:block;font-weight:600;color:var(--dim);margin-top:2px}',
      '@media(max-width:640px){.k-st{font-size:11px}.k-st small{display:none}}',
      '.k-quote{display:grid;grid-template-columns:1fr auto;gap:20px;align-items:center;background:var(--bg2);border:1px solid rgba(3,240,186,.35);border-radius:18px;padding:22px}',
      '@media(max-width:760px){.k-quote{grid-template-columns:1fr}}',
      '.k-price{font-size:38px;font-weight:800;letter-spacing:-.03em}.k-price small{font-size:15px;color:var(--muted);font-weight:600;margin-left:6px}',
      '.k-qmeta{list-style:none;color:#d1d5db;font-size:14px;margin-top:8px;display:flex;gap:16px;flex-wrap:wrap}.k-qmeta i{color:var(--mint);margin-right:6px}',
      '.k-acts{display:flex;flex-direction:column;gap:8px;min-width:220px}',
      '.k-det{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:18px}',
      '@media(max-width:760px){.k-det{grid-template-columns:1fr}}',
      '.k-det .box{background:var(--bg2);border:1px solid var(--line);border-radius:16px;padding:18px}',
      '.k-det h3{font-size:15px;font-weight:800;margin-bottom:10px}',
      '.k-kv{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:14px}.k-kv span{color:var(--muted)}.k-kv b{text-align:right;overflow-wrap:anywhere}',
      '.k-items{font-size:14px;display:flex;flex-direction:column;gap:6px}.k-items div{display:flex;justify-content:space-between;gap:12px}.k-items em{font-style:normal;color:var(--mint);font-size:12.5px;font-weight:800}',
      '.k-list{display:flex;flex-direction:column;gap:10px}',
      '.k-oi{display:flex;gap:14px;align-items:center;padding:14px;border-radius:14px;background:var(--bg2);border:1px solid var(--line);cursor:pointer;text-align:left;width:100%;color:inherit;font:inherit}',
      '.k-oi:hover,.k-oi.on{border-color:var(--line2)}',
      '.k-oi .ic{width:40px;height:40px;border-radius:11px;background:var(--s3);display:grid;place-items:center;color:var(--mint);flex:none}',
      '.k-oi>div{flex:1;min-width:0}.k-oi small{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.k-oi .k-pill{margin-top:6px;font-size:11.5px;padding:4px 9px}',
      '.k-oi b{display:block;font-size:14.5px}.k-oi small{color:var(--muted);font-size:12.5px;font-weight:600}',
      '.k-grid{display:grid;grid-template-columns:1fr 340px;gap:22px;align-items:start}',
      '@media(max-width:1100px){.k-grid{grid-template-columns:1fr}}',
      '.k-chat{display:flex;flex-direction:column;gap:10px;font-size:14px;max-height:360px;overflow:auto}',
      '.k-msg{padding:11px 14px;border-radius:14px;background:var(--s3);max-width:90%}.k-msg.me{align-self:flex-end;background:var(--mintSoft);border:1px solid rgba(3,240,186,.25)}',
      '.k-msg small{display:block;color:var(--dim);font-size:11.5px;margin-top:3px;font-weight:600}.k-msg img{max-width:220px;border-radius:10px;margin-top:6px}',
      '.k-send{display:flex;gap:8px;margin-top:12px}.k-send .in{min-height:46px}',
      '.k-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}.k-photos a{position:relative;aspect-ratio:1;border-radius:12px;overflow:hidden;display:block}.k-photos img{width:100%;height:100%;object-fit:cover}.k-photos span{position:absolute;left:6px;top:6px;font-size:11px;font-weight:800;background:rgba(0,0,0,.7);padding:3px 7px;border-radius:6px}',
      '.k-stars{display:flex;gap:6px}.k-stars button{font-size:28px;background:none;border:0;color:#3a3d43;cursor:pointer}.k-stars button.on{color:var(--amber)}',
      '.k-empty{text-align:center;padding:40px 20px;color:var(--muted)}.k-empty i{font-size:34px;color:var(--mint);margin-bottom:12px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  function api(path, opts) {
    opts = opts || {};
    return fetch(API + path, { method: opts.method || 'GET', credentials: 'same-origin', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, body: opts.body ? JSON.stringify(opts.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok || d.success === false) { var e = new Error(d.message || 'Coś poszło nie tak. Spróbuj ponownie.'); e.status = r.status; throw e; } return d; }); });
  }
  var alertBox = function (type, text) { return text ? '<div class="alert ' + type + '" role="alert" style="margin-bottom:16px"><i class="fa-solid ' + (type === 'err' ? 'fa-triangle-exclamation' : type === 'ok' ? 'fa-check' : 'fa-circle-info') + '"></i><span>' + esc(text) + '</span></div>' : ''; };

  /* ================= logowanie / rejestracja ================= */
  function renderAuth(msg) {
    var t = state.tab;
    var phone = params.get('tel') || '';
    var form;
    if (t === 'login') {
      form = '<form id="kForm" novalidate>' + alertBox('err', msg) + alertBox('ok', state.flash) +
        '<div class="f"><label for="k-phone">Numer telefonu</label><div class="k-ph"><span>+48</span><input class="in" id="k-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="' + esc(phone) + '" placeholder="600 123 456"></div></div>' +
        '<div class="f"><label for="k-pass">Hasło</label><input class="in" id="k-pass" name="password" type="password" autocomplete="current-password" required></div>' +
        '<div class="k-row"><label class="check" style="font-size:14px"><input type="checkbox" name="remember" checked>Zapamiętaj mnie</label><button type="button" class="k-link" data-tab="reset">Nie pamiętam hasła</button></div>' +
        '<button class="btn btn-mint" type="submit">Zaloguj się</button>' +
        '<div class="alert info" style="margin-top:20px"><i class="fa-solid fa-circle-info"></i><span>Pierwszy raz? <button type="button" class="k-link" data-tab="register">Załóż konto</button> tym samym numerem, który podałeś przy zgłoszeniu. Twoje zlecenia od razu pojawią się w panelu.</span></div></form>';
    } else if (t === 'register') {
      form = '<form id="kForm" novalidate>' + alertBox('err', msg) + alertBox('ok', state.flash) +
        '<div class="f"><label for="k-name">Imię</label><input class="in" id="k-name" name="name" autocomplete="given-name" required maxlength="140"></div>' +
        '<div class="f"><label for="k-phone">Numer telefonu</label><div class="k-ph"><span>+48</span><input class="in" id="k-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="' + esc(phone) + '" placeholder="600 123 456"></div></div>' +
        '<div class="f"><label for="k-pass">Hasło (min. 8 znaków, litera i cyfra)</label><input class="in" id="k-pass" name="password" type="password" autocomplete="new-password" required minlength="8"></div>' +
        (state.sms
          ? '<div class="f"><label for="k-code">Kod z SMS-a</label><div style="display:flex;gap:8px"><input class="in" id="k-code" name="code" inputmode="numeric" maxlength="6" placeholder="6 cyfr"><button class="btn btn-ghost" type="button" data-sendcode style="flex:none">' + (state.codeSent ? 'Wyślij ponownie' : 'Wyślij kod') + '</button></div></div>'
          : '<div class="f"><label for="k-nr">Numer zlecenia (potwierdza, że to Twój numer)</label><input class="in" id="k-nr" name="number" maxlength="40" value="' + esc(params.get('nr') || '') + '" placeholder="Z SMS-a albo z ekranu po wysłaniu wyceny"></div>') +
        '<label class="check" style="margin:4px 0 18px"><input type="checkbox" name="consent">Akceptuję <a href="/polityka-prywatnosci.html" target="_blank">politykę prywatności</a></label>' +
        '<button class="btn btn-mint" type="submit">Załóż konto</button>' +
        (state.sms ? '' : '<p class="muted small" style="margin-top:14px">Nie masz jeszcze żadnego zlecenia? <a href="/wycena.html" style="color:var(--mint)">Wyślij wycenę</a>, a numer zlecenia pokażemy od razu po wysłaniu.</p>') + '</form>';
    } else {
      form = '<form id="kForm" novalidate>' + alertBox('err', msg) + alertBox('ok', state.flash) +
        (state.sms
          ? '<div class="f"><label for="k-phone">Numer telefonu</label><div class="k-ph"><span>+48</span><input class="in" id="k-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" required value="' + esc(phone) + '"></div></div>' +
            '<div class="f"><label for="k-code">Kod z SMS-a</label><div style="display:flex;gap:8px"><input class="in" id="k-code" name="code" inputmode="numeric" maxlength="6" placeholder="6 cyfr"><button class="btn btn-ghost" type="button" data-sendcode style="flex:none">' + (state.codeSent ? 'Wyślij ponownie' : 'Wyślij kod') + '</button></div></div>' +
            '<div class="f"><label for="k-pass">Nowe hasło</label><input class="in" id="k-pass" name="password" type="password" autocomplete="new-password" minlength="8" required></div>' +
            '<button class="btn btn-mint" type="submit">Ustaw nowe hasło</button>'
          : '<div class="alert info"><i class="fa-solid fa-phone"></i><span>Zadzwoń pod <a href="tel:+48735396534" style="color:var(--mint)">735 396 534</a>, a ustawimy nowe hasło po potwierdzeniu numeru zlecenia.</span></div>') +
        '<p style="margin-top:16px"><button type="button" class="k-link" data-tab="login">Wróć do logowania</button></p></form>';
    }
    app.innerHTML = '<div class="k-split"><div class="k-left"><h1>Panel klienta</h1><p class="lead">Wszystkie Twoje zlecenia w jednym miejscu, od wyceny po zdjęcia z realizacji.</p><div class="k-feat">' +
      '<div><i class="fa-solid fa-link"></i><div><b>Zlecenia dodają się same</b><span>Każde zgłoszenie z Twoim numerem telefonu, także telefoniczne i z WhatsApp, pojawi się na koncie.</span></div></div>' +
      '<div><i class="fa-solid fa-signal"></i><div><b>Status na bieżąco</b><span>Wycena, termin, ekipa w drodze, zakończenie: widzisz każdy etap.</span></div></div>' +
      '<div><i class="fa-solid fa-circle-check"></i><div><b>Akceptacja jednym kliknięciem</b><span>Przyjmij wycenę albo napisz do nas w czacie zlecenia.</span></div></div>' +
      '<div><i class="fa-solid fa-images"></i><div><b>Zdjęcia przed i po</b><span>Po zakończeniu zobaczysz zdjęcia z realizacji.</span></div></div></div></div>' +
      '<div class="k-right"><div class="k-box">' + (t === 'reset' ? '<h2 style="font-size:24px;font-weight:800;margin-bottom:18px">Nowe hasło</h2>' : '<div class="k-tabs" role="tablist"><button type="button" role="tab" data-tab="login" aria-selected="' + (t === 'login') + '">Logowanie</button><button type="button" role="tab" data-tab="register" aria-selected="' + (t === 'register') + '">Załóż konto</button></div>') + form + '</div></div></div>';
    state.flash = '';
  }

  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    if (b.dataset.tab) { state.tab = b.dataset.tab; state.codeSent = false; return renderAuth(); }
    if (b.hasAttribute('data-sendcode')) {
      var f = document.getElementById('kForm');
      b.disabled = true;
      api('/kod-konto', { method: 'POST', body: { phone: f.phone.value, purpose: state.tab === 'reset' ? 'reset' : 'register' } })
        .then(function (d) { state.codeSent = true; var keep = collect(f); state.flash = d.message; renderAuth(); restore(keep); })
        .catch(function (err) { var keep = collect(f); renderAuth(err.message); restore(keep); });
    }
  });
  var collect = function (f) { var o = {}; Array.prototype.forEach.call(f.elements, function (el) { if (el.name) o[el.name] = el.type === 'checkbox' ? el.checked : el.value; }); return o; };
  var restore = function (o) { var f = document.getElementById('kForm'); if (!f) return; Object.keys(o).forEach(function (k) { var el = f.elements[k]; if (!el) return; if (el.type === 'checkbox') el.checked = o[k]; else el.value = o[k]; }); };

  app.addEventListener('submit', function (e) {
    if (e.target.id !== 'kForm') return;
    e.preventDefault();
    var f = e.target, btn = f.querySelector('[type=submit]'), v = collect(f);
    btn.disabled = true;
    var req = state.tab === 'login' ? api('/logowanie', { method: 'POST', body: { phone: v.phone, password: v.password, remember: v.remember !== false } })
      : state.tab === 'register' ? api('/rejestracja', { method: 'POST', body: { phone: v.phone, password: v.password, name: v.name, code: v.code || undefined, number: v.number || undefined, consent: v.consent === true } })
      : api('/reset', { method: 'POST', body: { phone: v.phone, code: v.code, password: v.password } });
    req.then(function () { history.replaceState(null, '', '/konto'); return boot(); })
      .catch(function (err) { renderAuth(err.message); restore(v); });
  });

  /* ================= panel ================= */
  var STATUS = { new: ['Czeka na wycenę', 'amber', 'fa-hourglass-half'], quoted: ['Wycena do akceptacji', 'amber', 'fa-file-invoice-dollar'], planned: ['Termin potwierdzony', 'blue', 'fa-calendar-check'], progress: ['W realizacji', 'blue', 'fa-truck-fast'], completed: ['Zakończone', 'mint', 'fa-circle-check'], cancelled: ['Anulowane', 'red', 'fa-ban'] };
  var ICON = { 'Przeprowadzka': 'fa-truck-ramp-box', 'Opróżnianie': 'fa-box-open', 'Transport z wniesieniem': 'fa-dolly', 'Odbiór odpadów': 'fa-dumpster', 'Rozbiórki i skuwanie': 'fa-hammer', 'Przewóz osób': 'fa-van-shuttle' };
  var pill = function (o) { var s = STATUS[o.status] || [o.statusLabel, '', 'fa-circle']; var label = o.status === 'quoted' && o.accepted ? 'Wycena zaakceptowana' : s[0]; return '<span class="k-pill ' + s[1] + '"><i class="fa-solid ' + s[2] + '"></i>' + esc(label) + '</span>'; };
  var routeOf = function (o) { return o.addressFrom && o.addressTo ? o.addressFrom + ' → ' + o.addressTo : o.address || o.addressFrom || o.addressTo || ''; };
  var floorTxt = function (f) { return f === null || f === undefined || f === '' ? '' : Number(f) === 0 ? 'parter' : Number(f) < 0 ? f + ' (piwnica)' : f + '. piętro'; };

  function shell(main) {
    var me = state.me || {};
    var active = state.orders.filter(function (o) { return ['new', 'quoted', 'planned', 'progress'].indexOf(o.status) >= 0; }).length;
    app.innerHTML = '<div class="k-app"><nav class="k-side" aria-label="Panel klienta">' +
      '<button type="button" data-view="orders" class="' + (state.view === 'orders' ? 'on' : '') + '"><i class="fa-solid fa-list-check"></i>Moje zlecenia' + (active ? '<span class="k-badge">' + active + '</span>' : '') + '</button>' +
      '<a href="/wycena.html"><i class="fa-solid fa-plus"></i>Nowa wycena</a>' +
      '<button type="button" data-view="settings" class="' + (state.view === 'settings' ? 'on' : '') + '"><i class="fa-solid fa-gear"></i>Ustawienia konta</button>' +
      '<button type="button" data-logout><i class="fa-solid fa-arrow-right-from-bracket"></i>Wyloguj</button>' +
      '<div class="k-me"><b>' + esc(me.account ? me.account.name : 'Klient') + '</b>' + esc(me.phone || '') + '</div></nav><main class="k-main">' + main + '</main></div>';
  }

  function trackHtml(o) {
    if (o.status === 'cancelled') return '<div class="alert err" style="margin:22px 0"><i class="fa-solid fa-ban"></i><span>Zlecenie anulowane. Jeśli to pomyłka, zadzwoń: 735 396 534.</span></div>';
    return '<div class="k-track">' + (o.timeline || []).filter(function (s) { return s.key !== 'cancelled'; }).map(function (s) {
      var cls = s.current ? 'cur' : s.done ? 'done' : '';
      return '<div class="k-st ' + cls + '"><i class="fa-solid ' + (s.done && !s.current ? 'fa-check' : s.icon) + '"></i>' + esc(s.label) + '<small>' + (s.at ? esc(new Date(s.at).toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric' })) : '&nbsp;') + '</small></div>';
    }).join('') + '</div>';
  }

  function quoteHtml(o) {
    if (o.status === 'new') {
      return '<div class="alert info"><i class="fa-solid fa-clock"></i><span>Przygotowujemy wycenę' + (o.quoteDueAt ? ', najpóźniej ' + esc(dt(o.quoteDueAt, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) : ' w ciągu 24 godzin') + '. Dostaniesz SMS, gdy będzie gotowa.</span></div>';
    }
    var e = o.estimate, q = o.quote || {};
    if (!e && o.finalPrice == null) return '';
    var price = o.status === 'completed' && o.finalPrice != null ? money(o.finalPrice) : e ? (e.high && e.high !== e.low ? money(e.low) + ' – ' + money(e.high) : money(e.low)) : '';
    var meta = [];
    if (q.people) meta.push('<li><i class="fa-solid fa-users"></i>' + q.people + ' os.</li>');
    if (o.dateStart && ['planned', 'progress', 'completed'].indexOf(o.status) >= 0) meta.push('<li><i class="fa-regular fa-calendar"></i>' + esc(day(o.dateStart)) + ', ' + esc(new Date(o.dateStart).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })) + '</li>');
    else if (q.proposedDate) meta.push('<li><i class="fa-regular fa-calendar"></i>proponowany termin: ' + esc(q.proposedDate) + '</li>');
    if (o.crew && o.crew.length) meta.push('<li><i class="fa-solid fa-user-group"></i>' + esc(o.crew.join(', ')) + '</li>');
    if (o.vehicle) meta.push('<li><i class="fa-solid fa-truck"></i>' + esc(o.vehicle) + '</li>');
    var acts = '';
    if (o.canAccept) acts += '<button class="btn btn-mint" type="button" data-accept>Akceptuję wycenę</button>';
    if (o.canChat) acts += '<button class="btn btn-ghost btn-sm" type="button" data-scrollchat>Mam pytanie</button>';
    if (o.canCancel) acts += '<button class="btn btn-ghost btn-sm" type="button" data-cancel>' + (o.status === 'planned' ? 'Poproś o anulowanie' : 'Anuluj zgłoszenie') + '</button>';
    return '<div class="k-quote"><div><div class="k-price">' + esc(price) + '<small>' + (o.status === 'completed' ? 'do zapłaty' : 'brutto') + '</small></div>' + (meta.length ? '<ul class="k-qmeta">' + meta.join('') + '</ul>' : '') +
      (q.note ? '<p style="font-size:14px;color:#cfd3d8;margin-top:10px">' + esc(q.note) + '</p>' : '') +
      (q.validUntil && o.status === 'quoted' ? '<p class="muted small" style="margin-top:6px">Wycena ważna do ' + esc(new Date(q.validUntil).toLocaleDateString('pl-PL')) + '.</p>' : '') +
      (o.accepted && o.status === 'quoted' ? '<p style="color:var(--mint);font-weight:700;font-size:14px;margin-top:8px"><i class="fa-solid fa-check"></i> Zaakceptowano. Zadzwonimy, żeby potwierdzić termin.</p>' : '') +
      (o.cancelRequested ? '<p style="color:var(--amber);font-weight:700;font-size:14px;margin-top:8px">Prośba o anulowanie wysłana. Skontaktujemy się.</p>' : '') +
      (o.trackingNote ? '<p style="font-size:14px;margin-top:8px"><i class="fa-solid fa-circle-info" style="color:var(--mint)"></i> ' + esc(o.trackingNote) + '</p>' : '') +
      '</div>' + (acts ? '<div class="k-acts">' + acts + '</div>' : '') + '</div>';
  }

  function formHtml(o) {
    var f = o.form;
    if (!f) return o.description ? '<div class="k-det"><div class="box" style="grid-column:1/-1"><h3>Opis</h3><p style="font-size:14px;white-space:pre-line;color:#d1d5db">' + esc(o.description) + '</p></div></div>' : '';
    var place = function (p) { return p ? [floorTxt(p.floor), p.lift, p.parking ? 'parking ' + p.parking : ''].filter(Boolean).join(', ') : ''; };
    var kv = [];
    if (f.from) kv.push([f.to ? 'Skąd' : 'Adres', f.from.address], [f.to ? 'Załadunek' : 'Dostęp', place(f.from)]);
    if (f.to) kv.push(['Dokąd', f.to.address], ['Rozładunek', place(f.to)]);
    Object.keys(f.answers || {}).forEach(function (k) { var v = f.answers[k]; kv.push([labelOf(f.service, k), Array.isArray(v) ? v.join(', ') : v]); });
    if (f.schedule) kv.push(['Termin', [f.schedule.date ? new Date(f.schedule.date + 'T12:00').toLocaleDateString('pl-PL') : 'do ustalenia', f.schedule.time].filter(Boolean).join(', ')]);
    if (f.extras && f.extras.length) kv.push(['Dodatkowo', f.extras.join(', ')]);
    var left = '<div class="box"><h3>Szczegóły zlecenia</h3><div class="k-kv">' + kv.filter(function (r) { return r[1] !== '' && r[1] != null; }).map(function (r) { return '<span>' + esc(r[0]) + '</span><b>' + esc(r[1]) + '</b>'; }).join('') + '</div></div>';
    var right = '';
    if (f.items && f.items.length) {
      var total = f.items.reduce(function (a, i) { return a + i.qty; }, 0);
      right = '<div class="box"><h3>Lista rzeczy (' + total + ' szt.)</h3><div class="k-items">' + f.items.map(function (i) { return '<div><span>' + (i.room ? '<em>' + esc(i.room) + '</em> ' : '') + esc(i.name) + (i.flags && i.flags.length ? ' <span class="muted">(' + esc(i.flags.join(', ')) + ')</span>' : '') + '</span><b>' + i.qty + '</b></div>'; }).join('') + '</div></div>';
    } else if ((f.waste && f.waste.length) || (f.works && f.works.length)) {
      var list = (f.waste || []).concat(f.works || []);
      right = '<div class="box"><h3>' + (f.waste && f.waste.length ? 'Odpady' : 'Zakres prac') + '</h3><div class="k-items">' + list.map(function (w) { return '<div><span>' + esc(w.name) + (w.note ? ' <span class="muted">— ' + esc(w.note) + '</span>' : '') + '</span><b>' + (w.qty || '?') + ' ' + esc(w.unit) + '</b></div>'; }).join('') + '</div></div>';
    }
    return '<div class="k-det">' + left + right + '</div>' + (f.description ? '<div class="k-det"><div class="box" style="grid-column:1/-1"><h3>Twoje uwagi</h3><p style="font-size:14px;white-space:pre-line;color:#d1d5db">' + esc(f.description) + '</p></div></div>' : '');
  }
  var LABELS = null;
  function labelOf(service, id) {
    if (!LABELS) { LABELS = {}; (window.RevQuoteFormLabels || []).forEach(function (x) { LABELS[x[0]] = x[1]; }); }
    var map = { scope: 'Rodzaj', area: 'Metraż (m²)', boxes: 'Kartony', place: 'Miejsce', purpose: 'Cel', rooms: 'Pomieszczenia', fill: 'Zapełnienie', bags: 'Worki / kartony', pickup: 'Odbiór', weight: 'Najcięższa rzecz (kg)', where: 'Gdzie leżą', volume: 'Ilość', occupied: 'Meble w lokalu', debris: 'Wywóz gruzu', utilities: 'Prąd i woda', passengers: 'Liczba osób', luggage: 'Bagaże', time: 'Godzina', 'return': 'Kurs powrotny', flight: 'Numer lotu' };
    return map[id] || id;
  }

  function photosHtml(o) {
    if (!o.photos || !o.photos.length) return '';
    return '<div class="k-card"><h2 style="font-size:17px;font-weight:800;margin-bottom:12px">Zdjęcia z realizacji</h2><div class="k-photos">' + o.photos.map(function (p) {
      var url = API + '/zlecenia/' + esc(o.id) + '/media/' + esc(p.id);
      return '<a href="' + url + '" target="_blank" rel="noopener"><img loading="lazy" src="' + url + '" alt="Zdjęcie ' + (p.kind === 'before' ? 'przed' : 'po') + '"><span>' + (p.kind === 'before' ? 'Przed' : 'Po') + '</span></a>';
    }).join('') + '</div></div>';
  }

  function rateHtml(o) {
    if (o.canRate) return '<div class="k-card"><h2 style="font-size:17px;font-weight:800;margin-bottom:6px">Jak nam poszło?</h2><p class="muted small" style="margin-bottom:10px">Twoja ocena pomaga nam i innym klientom.</p><div class="k-stars" role="group" aria-label="Ocena">' + [1, 2, 3, 4, 5].map(function (n) { return '<button type="button" data-rate="' + n + '" aria-label="' + n + ' na 5">★</button>'; }).join('') + '</div><textarea class="ta" id="kFeedback" maxlength="1500" placeholder="Komentarz (opcjonalnie)" style="margin-top:10px;min-height:80px"></textarea></div>';
    if (o.rating) return '<div class="k-card"><b>Twoja ocena: <span style="color:var(--amber)">' + '★'.repeat(o.rating) + '</span></b>' + (o.feedback ? '<p class="muted small" style="margin-top:6px">' + esc(o.feedback) + '</p>' : '') + '</div>';
    return '';
  }

  function chatHtml(o) {
    if (!o.canChat && !state.messages.length) return '';
    var msgs = state.messages.map(function (m) {
      var mine = m.from === 'client';
      return '<div class="k-msg' + (mine ? ' me' : '') + '">' + esc(m.text) + (m.hasPhoto ? '<a href="' + API + '/zlecenia/' + esc(o.id) + '/wiadomosci/' + esc(m.id) + '/zdjecie" target="_blank" rel="noopener"><img src="' + API + '/zlecenia/' + esc(o.id) + '/wiadomosci/' + esc(m.id) + '/zdjecie" alt="Zdjęcie"></a>' : '') + '<small>' + esc(mine ? 'Ty' : m.authorName || 'RevSerwis') + ' · ' + esc(dt(m.createdAt)) + '</small></div>';
    }).join('');
    return '<div class="k-card" id="kChat"><h2 style="font-size:17px;font-weight:800;margin-bottom:12px">Wiadomości do zlecenia</h2><div class="k-chat">' + (msgs || '<p class="muted small">Masz pytanie o wycenę albo termin? Napisz tutaj, odpowiemy w godzinach pracy.</p>') + '</div>' +
      (o.canChat ? '<form class="k-send" id="kSend"><label class="sr-only" for="kMsg">Wiadomość</label><input class="in" id="kMsg" maxlength="2000" placeholder="Napisz wiadomość…" autocomplete="off"><button class="btn btn-mint" type="submit" aria-label="Wyślij"><i class="fa-solid fa-paper-plane"></i></button></form>' : '') + '</div>';
  }

  function renderOrders() {
    var me = state.me || {};
    var name = me.account && me.account.name ? me.account.name.split(' ')[0] : '';
    if (!state.orders.length) {
      return shell('<div class="k-hello"><h1>Dzień dobry' + (name ? ', ' + esc(name) : '') + '</h1><p>Numer ' + esc(me.phone) + '</p></div><div class="k-card k-empty"><i class="fa-solid fa-inbox"></i><h2 style="font-size:20px;color:var(--text);margin-bottom:6px">Nie masz jeszcze zleceń</h2><p>Zlecenia zgłoszone na Twój numer pojawią się tu automatycznie, także te ustalone przez telefon.</p><a class="btn btn-mint" style="margin-top:18px" href="/wycena.html">Wyceń zlecenie</a></div>');
    }
    var o = state.order || state.orders[0];
    var toAccept = state.orders.filter(function (x) { return x.canAccept; }).length;
    var main = '<div class="k-hello"><h1>Dzień dobry' + (name ? ', ' + esc(name) : '') + '</h1><p>' + (toAccept ? 'Masz ' + toAccept + ' ' + (toAccept === 1 ? 'wycenę' : 'wyceny') + ' do akceptacji. ' : '') + 'Zleceń na koncie: ' + state.orders.length + '.</p></div>' + alertBox('ok', state.flash) +
      '<div class="k-grid"><div><section class="k-card"><div class="k-ohead"><div><small>' + esc(o.number || '') + ' · zgłoszone ' + esc(dt(o.createdAt, { day: 'numeric', month: 'long' })) + '</small><h2>' + esc(o.type || o.name) + '</h2><div class="route">' + esc(routeOf(o)) + '</div></div>' + pill(o) + '</div>' +
      trackHtml(o) + quoteHtml(o) + formHtml(o) + '</section>' + photosHtml(o) + rateHtml(o) + '</div>' +
      '<aside><section class="k-card"><h2 style="font-size:17px;font-weight:800;margin-bottom:12px">Wszystkie zlecenia</h2><div class="k-list">' + state.orders.map(function (x) {
        return '<button type="button" class="k-oi' + (x.id === o.id ? ' on' : '') + '" data-order="' + esc(x.id) + '"><span class="ic"><i class="fa-solid ' + (ICON[x.type] || 'fa-clipboard-list') + '"></i></span><div><b>' + esc(x.type || x.name) + '</b><small>' + esc(x.number || '') + (routeOf(x) ? ' · ' + esc(routeOf(x).slice(0, 40)) : '') + '</small>' + pill(x) + '</div></button>';
      }).join('') + '</div></section>' + chatHtml(o) + '</aside></div>';
    state.flash = '';
    shell(main);
    var box = app.querySelector('.k-chat'); if (box) box.scrollTop = box.scrollHeight;
  }

  function renderSettings(msg, ok) {
    var a = (state.me && state.me.account) || {};
    shell('<div class="k-hello"><h1>Ustawienia konta</h1><p>Login: ' + esc(state.me.phone) + '</p></div>' + alertBox('err', msg) + alertBox('ok', ok) +
      '<div class="k-grid" style="grid-template-columns:1fr 1fr"><form class="k-card" id="kProfile"><h2 style="font-size:17px;font-weight:800;margin-bottom:14px">Dane</h2><div class="f"><label for="p-name">Imię</label><input class="in" id="p-name" name="name" value="' + esc(a.name || '') + '" maxlength="140" required></div><div class="f"><label for="p-email">E-mail (opcjonalnie)</label><input class="in" id="p-email" name="email" type="email" value="' + esc(a.email || '') + '" maxlength="160"></div><button class="btn btn-mint" type="submit">Zapisz</button></form>' +
      '<form class="k-card" id="kPass"><h2 style="font-size:17px;font-weight:800;margin-bottom:14px">Zmiana hasła</h2><div class="f"><label for="p-cur">Obecne hasło</label><input class="in" id="p-cur" name="current" type="password" autocomplete="current-password" required></div><div class="f"><label for="p-new">Nowe hasło</label><input class="in" id="p-new" name="password" type="password" autocomplete="new-password" minlength="8" required></div><button class="btn btn-mint" type="submit">Zmień hasło</button></form></div>');
  }

  function render() { return state.view === 'settings' ? renderSettings() : renderOrders(); }

  function openOrder(id) {
    return api('/zlecenia/' + id).then(function (d) {
      state.order = d.order;
      state.orders = state.orders.map(function (x) { return x.id === d.order.id ? Object.assign({}, x, d.order) : x; });
      return api('/zlecenia/' + id + '/wiadomosci').then(function (m) { state.messages = m.messages || []; }).catch(function () { state.messages = []; });
    }).then(render);
  }

  app.addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b || !state.me || !state.me.active) return;
    var o = state.order;
    if (b.dataset.view) { state.view = b.dataset.view; return render(); }
    if (b.hasAttribute('data-logout')) return api('/wyloguj', { method: 'POST' }).then(function () { state.me = null; state.tab = 'login'; renderAuth(); });
    if (b.dataset.order) { state.view = 'orders'; return openOrder(b.dataset.order).then(function () { window.scrollTo({ top: 0, behavior: 'smooth' }); }); }
    if (b.hasAttribute('data-accept')) { b.disabled = true; return api('/zlecenia/' + o.id + '/akceptuj', { method: 'POST' }).then(function () { state.flash = 'Dziękujemy! Wycena zaakceptowana. Zadzwonimy, żeby potwierdzić termin.'; return openOrder(o.id); }).catch(function (err) { alert(err.message); b.disabled = false; }); }
    if (b.hasAttribute('data-cancel')) {
      var reason = window.prompt(o.status === 'planned' ? 'Dlaczego chcesz anulować? (zadzwonimy, żeby potwierdzić)' : 'Dlaczego anulujesz zgłoszenie? (opcjonalnie)');
      if (reason === null) return;
      return api('/zlecenia/' + o.id + '/anuluj', { method: 'POST', body: { reason: reason } }).then(function () { state.flash = o.status === 'planned' ? 'Prośba o anulowanie wysłana.' : 'Zgłoszenie anulowane.'; return openOrder(o.id); }).catch(function (err) { alert(err.message); });
    }
    if (b.hasAttribute('data-scrollchat')) { var c = document.getElementById('kChat'); if (c) { c.scrollIntoView({ behavior: 'smooth' }); setTimeout(function () { var i = document.getElementById('kMsg'); if (i) i.focus(); }, 400); } return; }
    if (b.dataset.rate) {
      var fb = (document.getElementById('kFeedback') || {}).value || '';
      return api('/zlecenia/' + o.id + '/ocena', { method: 'POST', body: { rating: Number(b.dataset.rate), feedback: fb } }).then(function (d) {
        state.flash = 'Dziękujemy za ocenę!';
        return openOrder(o.id).then(function () { if (d.googleReviewUrl && window.confirm('Dziękujemy! Czy możesz dodać tę opinię także w Google? To bardzo nam pomaga.')) window.open(d.googleReviewUrl, '_blank', 'noopener'); });
      }).catch(function (err) { alert(err.message); });
    }
  });
  app.addEventListener('mouseover', function (e) { var b = e.target.closest('[data-rate]'); if (!b) return; var n = +b.dataset.rate; app.querySelectorAll('[data-rate]').forEach(function (x) { x.classList.toggle('on', +x.dataset.rate <= n); }); });

  app.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.id === 'kSend') {
      e.preventDefault();
      var inp = document.getElementById('kMsg'), text = inp.value.trim(); if (!text) return;
      inp.disabled = true;
      api('/zlecenia/' + state.order.id + '/wiadomosci', { method: 'POST', body: { text: text } }).then(function (d) { state.messages.push(d.message); render(); var i = document.getElementById('kMsg'); if (i) i.focus(); })
        .catch(function (err) { alert(err.message); inp.disabled = false; });
    }
    if (f.id === 'kProfile') { e.preventDefault(); api('/profil', { method: 'POST', body: { name: f.name.value, email: f.email.value } }).then(function () { state.me.account = Object.assign({}, state.me.account, { name: f.name.value, email: f.email.value }); renderSettings('', 'Zapisano.'); }).catch(function (err) { renderSettings(err.message); }); }
    if (f.id === 'kPass') { e.preventDefault(); api('/haslo', { method: 'POST', body: { current: f.current.value, password: f.password.value } }).then(function () { renderSettings('', 'Hasło zmienione.'); }).catch(function (err) { renderSettings(err.message); }); }
  });

  function boot() {
    app.innerHTML = '<div class="wrap" style="padding:60px 0"><div class="empty-box">Ładujemy panel…</div></div>';
    return api('/konto').then(function (me) {
      state.me = me; state.sms = Boolean(me.sms);
      if (!me.active) return renderAuth();
      return api('/zlecenia').then(function (d) {
        state.orders = d.orders || [];
        var wanted = (location.hash.match(/zlecenia\/([a-f0-9]{24})/) || [])[1];
        var first = wanted || (state.orders.filter(function (x) { return x.canAccept; })[0] || state.orders[0] || {}).id;
        if (first) return openOrder(first);
        render();
      });
    }).catch(function (err) {
      if (err.status === 401) { state.me = null; return renderAuth(); }
      app.innerHTML = '<div class="wrap" style="padding:60px 0">' + alertBox('err', err.message + ' Zadzwoń: 735 396 534.') + '</div>';
    });
  }
  boot();
})();
