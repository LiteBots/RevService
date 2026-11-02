/* Ustawienia — konto, bezpieczeństwo (2FA, urządzenia), firma, pulpit, SMS, raporty, ranking, GPS, moduły, dziennik zmian */
import { S, api, esc, icon, tile, go, toast, busy, fieldHtml, readForm, formModal, emptyState, fmtDateTime, ago, isAdmin, avatar, local, VERSION, confirmBox } from '../core.js';
import { loadQr, passkeysSupported, passkeyRegister } from '../auth.js';

export default async function ustawienia(el, { params, ctx }) {
  const tabs = [
    ['', 'Konto'], ['bezpieczenstwo', 'Bezpieczeństwo'],
    ...(isAdmin() ? [['firma', 'Firma'], ['pulpit', 'Pulpit i finanse'], ['sms', 'SMS do klientów'], ['raporty', 'Raporty'], ['ekipa', 'Ekipa i GPS'], ['moduly', 'Moduły'], ['dziennik', 'Dziennik zmian']] : [])
  ];
  const tab = tabs.some(t => t[0] === (params[0] || '')) ? params[0] || '' : '';
  ctx.setTitle('Ustawienia', tabs.find(t => t[0] === tab)[1]);
  el.innerHTML = `<div class="seg">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="col" data-part style="gap:14px;max-width:860px"></div>`;
  el.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go('ustawienia' + (b.dataset.tab ? '/' + b.dataset.tab : '')); });
  const part = el.querySelector('[data-part]');
  const map = { '': account, bezpieczenstwo: security, firma: company, pulpit: dashboardSettings, sms: smsSettings, raporty: reportSettings, ekipa: crewSettings, moduly: modules, dziennik: audit };
  return map[tab](part);
}

/** Karta formularza z przyciskiem „Zapisz”. */
function settingsCard(title, fields, onSave, intro = '') {
  const id = 'f' + Math.random().toString(36).slice(2, 8);
  return { html: `<div class="card"><div class="card-head"><h3>${esc(title)}</h3></div>${intro}<form class="form-grid" id="${id}">${fields.map(fieldHtml).join('')}</form><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="btn primary" data-save="${id}">Zapisz</button></div></div>`, id, onSave };
}
function mount(el, cards) {
  el.innerHTML = cards.map(c => (typeof c === 'string' ? c : c.html)).join('');
  for (const c of cards.filter(x => typeof x !== 'string')) {
    el.querySelector(`[data-save="${c.id}"]`).addEventListener('click', e => busy(e.currentTarget, async () => { await c.onSave(readForm(el.querySelector('#' + c.id))); toast('Zapisano', 'ok'); }));
  }
}

/* ---------- Konto ---------- */
async function account(el) {
  const me = await api('/v2/me');
  const light = document.documentElement.dataset.theme === 'light';
  el.innerHTML = `
    <div class="card row">${avatar(me.name, me.color, 'lg')}<div class="grow"><b style="font-size:16px">${esc(me.name)}</b><div class="small muted">${esc(me.roleLabel)}${me.email ? ' · ' + esc(me.email) : ''}${me.phone ? ' · ' + esc(me.phone) : ''}</div></div></div>
    <div class="card"><div class="card-head"><h3>Wygląd</h3></div>
      <label class="row between" style="cursor:pointer"><span><b>Jasny motyw</b><br><span class="small muted">Domyślnie RevMi jest ciemny (styl RevSerwis)</span></span><span class="switch"><input type="checkbox" data-theme ${light ? 'checked' : ''}><i></i></span></label></div>
    <div class="card"><div class="card-head"><h3>Powiadomienia push</h3><span class="pill ${'Notification' in window && Notification.permission === 'granted' ? 'mint' : ''}">${'Notification' in window ? ({ granted: 'Włączone', denied: 'Zablokowane', default: 'Wyłączone' })[Notification.permission] : 'Niedostępne'}</span></div>
      <p class="small muted">Nowe zlecenia, przypisania, zmiany w grafiku, czat ekipy i przypomnienia. Na iPhonie: Safari → Udostępnij → „Do ekranu początkowego”, potem włącz tutaj.</p>
      <div class="row" style="margin-top:10px"><button class="btn primary sm" data-push>${icon('bell', 'sm')} Włącz na tym urządzeniu</button><button class="btn sm" data-test>Wyślij test</button></div></div>
    <div class="card"><div class="card-head"><h3>Logowanie hasłem</h3><span class="pill ${me.hasPassword ? 'mint' : 'amber'}">${me.hasPassword ? 'Ustawione' : 'Brak hasła'}</span></div>
      <p class="small muted">Logujesz się e-mailem lub numerem telefonu i hasłem. PIN służy do szybkiego odblokowania aplikacji po ${me.lockMinutes || 15} min bezczynności.</p>
      <form class="form-grid" data-pw style="margin-top:10px">
        ${me.hasPassword ? fieldHtml({ name: 'current', label: 'Obecne hasło', type: 'password', autocomplete: 'current-password', full: true }) : ''}
        ${fieldHtml({ name: 'email', label: 'E-mail do logowania', type: 'email', value: me.email, autocomplete: 'username' })}
        ${fieldHtml({ name: 'password', label: 'Nowe hasło (min. 8 znaków, litery i cyfry)', type: 'password', autocomplete: 'new-password' })}
      </form><div class="row" style="justify-content:flex-end;margin-top:10px"><button class="btn primary" data-pw-save>Zapisz hasło</button></div></div>
    <div class="card"><div class="card-head"><h3>Panel klasyczny 9.2</h3></div><p class="small muted">RevOutlet, RevPowrót, newsletter, rekrutacja, sortownia, dodatki, deweloperzy, hotele, partnerzy, abonamenty 9.0, oferty i RevBot nadal działają w poprzednim panelu.</p><a class="btn sm" href="/revmi-9/" style="margin-top:10px">${icon('layers', 'sm')} Otwórz moduły dodatkowe</a></div>
    <button class="btn danger" data-logout>${icon('logout', 'sm')} Wyloguj</button>
    <p class="tiny muted" style="text-align:center">RevMi ${VERSION} · RevSerwis</p>`;
  el.addEventListener('change', e => { if (e.target.matches('[data-theme]')) S.hooks.toggleTheme(); });
  el.addEventListener('click', async e => {
    const p = e.target.closest('[data-push]');
    if (p) return busy(p, async () => { await S.hooks.enablePush(); toast('Powiadomienia włączone', 'ok'); account(el); });
    const t = e.target.closest('[data-test]');
    if (t) return busy(t, async () => { const r = await api('/push/test', { method: 'POST' }); toast(r.sent ? 'Wysłano test — sprawdź telefon' : 'Brak urządzeń z włączonymi powiadomieniami', r.sent ? 'ok' : 'err'); });
    const s = e.target.closest('[data-pw-save]');
    if (s) return busy(s, async () => { const v = readForm(el.querySelector('[data-pw]')); await api('/v2/me/password', { method: 'POST', body: v }); toast('Hasło zapisane — możesz logować się e-mailem lub telefonem', 'ok'); account(el); });
    if (e.target.closest('[data-logout]')) { await api('/logout', { method: 'POST' }).catch(() => null); local.set('lastActive', 0); location.reload(); }
  });
}

/* ---------- Bezpieczeństwo ---------- */
async function security(el) {
  const [tf, mine, all, pk] = await Promise.all([api('/v92/2fa'), api('/v2/sessions'), isAdmin() ? api('/v2/sessions?all=1') : Promise.resolve(null), api('/v2/passkeys').catch(() => ({ passkeys: [] }))]);
  const row = (s, canKill) => `<div class="li">${icon(/iPhone|Android/.test(s.device) ? 'phone' : 'grid', 'sm')}<div class="grow"><b>${esc(s.device)}</b>${s.current ? ' <span class="pill mint">To urządzenie</span>' : ''}<div class="li-sub">${esc(s.name)} · ${s.method === 'password' ? 'hasło' : s.method === '2fa' ? 'hasło/PIN + 2FA' : s.method === 'passkey' ? 'Face ID / klucz' : 'PIN'} · aktywne ${ago(s.lastSeenAt)} · ${esc(s.ip || '')}</div></div>${canKill && !s.current ? `<button class="btn ghost sm" data-kill="${s._id}">Wyloguj</button>` : ''}</div>`;
  el.innerHTML = `
    <div class="card"><div class="card-head">${tile("face", "violet", "sm")}<h3>Face ID / Touch ID</h3><span class="pill ${pk.passkeys.length ? "mint" : ""}">${pk.passkeys.length ? pk.passkeys.length + " " + (pk.passkeys.length === 1 ? "klucz" : "klucze") : "Brak"}</span></div>
      <p class="small muted">Logowanie i odblokowanie aplikacji odciskiem palca lub twarzą, bez wpisywania hasła. Klucz dostępu zostaje na tym urządzeniu (albo w pęku kluczy iCloud / menedżerze haseł Google).</p>
      ${pk.passkeys.length ? `<div class="list" style="margin-top:8px">${pk.passkeys.map(k => `<div class="li">${icon("key", "sm")}<div class="grow"><b>${esc(k.label || "Klucz dostępu")}</b><div class="li-sub">dodany ${fmtDateTime(k.createdAt)}${k.lastUsedAt ? " · użyty " + ago(k.lastUsedAt) : ""}${k.backedUp ? " · synchronizowany" : ""}</div></div><button class="btn ghost sm" data-pk-del="${k._id}">Usuń</button></div>`).join("")}</div>` : ""}
      <div style="margin-top:10px">${passkeysSupported() ? `<button class="btn primary sm" data-pk-add>${icon("plus", "sm")} Dodaj Face ID na tym urządzeniu</button>` : `<p class="small muted">Ta przeglądarka nie obsługuje kluczy dostępu (wymagane HTTPS i aktualny system).</p>`}</div></div>
    <div class="card"><div class="card-head">${tile("shield", "teal", "sm")}<h3>Logowanie dwuetapowe (2FA)</h3><span class="pill ${tf.enabled ? 'mint' : 'amber'}">${tf.enabled ? 'Włączone' : 'Wyłączone'}</span></div>
      <p class="small muted">${S.me.role === 'admin' ? 'Dla administratorów 2FA jest obowiązkowe.' : 'Dodatkowe zabezpieczenie: kod z Google Authenticator przy logowaniu.'}</p>
      <div data-tf style="margin-top:10px">${tf.enabled ? (S.me.role === 'admin' ? '<p class="small accent">✓ Konto zabezpieczone</p>' : '<button class="btn sm" data-tf-off>Wyłącz 2FA</button>') : '<button class="btn primary sm" data-tf-on>Włącz 2FA</button>'}</div></div>
    <div class="card"><div class="card-head"><h3>Moje urządzenia</h3>${mine.sessions.length > 1 ? '<button class="btn sm" data-others>Wyloguj pozostałe</button>' : ''}</div><div class="list">${mine.sessions.map(s => row(s, true)).join('') || '<p class="muted small">—</p>'}</div></div>
    ${all ? `<div class="card"><div class="card-head"><h3>Wszystkie aktywne sesje w firmie</h3><span class="pill">${all.sessions.length}</span></div><div class="list">${all.sessions.filter(s => !s.mine).map(s => row(s, true)).join('') || '<p class="muted small">Brak innych sesji.</p>'}</div><p class="tiny muted" style="margin-top:8px">Logowanie z nowego urządzenia wysyła powiadomienie do właściciela konta (i administratorów przy kontach admina).</p></div>` : ''}`;
  // onclick (nie addEventListener): ekran odświeża się po każdej zmianie, bez dublowania obsługi
  el.onclick = async e => {
    const pa = e.target.closest('[data-pk-add]');
    if (pa) return busy(pa, async () => { await passkeyRegister(); toast('Dodano Face ID — możesz się nim logować', 'ok'); S.me.passkeys = (S.me.passkeys || 0) + 1; security(el); });
    const pd = e.target.closest('[data-pk-del]');
    if (pd) { if (await confirmBox('Usunąć ten klucz dostępu? Na tym urządzeniu trzeba będzie logować się hasłem lub PIN-em.', { ok: 'Usuń', danger: true })) await busy(pd, async () => { await api('/v2/passkeys/' + pd.dataset.pkDel, { method: 'DELETE' }); toast('Usunięto klucz', 'ok'); security(el); }); return; }
    const k = e.target.closest('[data-kill]');
    if (k) return busy(k, async () => { await api('/v2/sessions/' + k.dataset.kill, { method: 'DELETE' }); toast('Wylogowano urządzenie', 'ok'); security(el); });
    const o = e.target.closest('[data-others]');
    if (o) return busy(o, async () => { const r = await api('/v2/sessions/logout-others', { method: 'POST' }); toast(`Wylogowano urządzeń: ${r.count}`, 'ok'); security(el); });
    if (e.target.closest('[data-tf-on]')) {
      const r = await api('/v92/2fa/setup', { method: 'POST' });
      const box = el.querySelector('[data-tf]');
      box.innerHTML = `<div class="col" style="align-items:flex-start"><div class="qr-box" id="qr"></div><div class="small muted">Klucz: <code style="user-select:all">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</code></div><div class="row"><input class="input code-input" style="width:220px" maxlength="6" inputmode="numeric" placeholder="••••••" data-code><button class="btn primary" data-tf-ok>Włącz</button></div></div>`;
      try { await loadQr(); new window.QRCode(box.querySelector('#qr'), { text: r.otpauth, width: 170, height: 170 }); } catch { box.querySelector('#qr').remove(); }
      return;
    }
    const ok = e.target.closest('[data-tf-ok]');
    if (ok) return busy(ok, async () => { await api('/v92/2fa/enable', { method: 'POST', body: { code: el.querySelector('[data-code]').value } }); toast('2FA włączone', 'ok'); security(el); });
    if (e.target.closest('[data-tf-off]')) {
      formModal({ title: 'Wyłącz 2FA', fields: [{ name: 'code', label: 'Kod z aplikacji', required: true, full: true }], submit: 'Wyłącz', onSubmit: async v => { await api('/v92/2fa/disable', { method: 'POST', body: v }); security(el); } });
    }
  };
}

/* ---------- Firma (ustawienia 9.2) ---------- */
async function company(el) {
  const { settings: s } = await api('/settings');
  const save = async v => { await api('/settings', { method: 'PUT', body: v }); };
  mount(el, [
    settingsCard('Dane firmy', [
      { name: 'companyName', label: 'Nazwa', value: s.companyName },
      { name: 'companyPhone', label: 'Telefon', value: s.companyPhone },
      { name: 'companyEmail', label: 'E-mail', value: s.companyEmail },
      { name: 'companyNip', label: 'NIP', value: s.companyNip },
      { name: 'companyAddress', label: 'Adres', value: s.companyAddress, full: true },
      { name: 'companyBank', label: 'Konto bankowe', value: s.companyBank, full: true },
      { name: 'googleReviewUrl', label: 'Link do opinii Google', value: s.googleReviewUrl, full: true }
    ], save),
    settingsCard('Zakończenie zlecenia', [
      { name: 'requireCompletionPhotos', label: 'Wymagaj zdjęć z realizacji', type: 'switch', value: s.requireCompletionPhotos, full: true },
      { name: 'requireCostReport', label: 'Wymagaj raportu kosztów (paliwo, materiały, utylizacja)', type: 'switch', value: s.requireCostReport, full: true },
      { name: 'requireBeforeChecklist', label: 'Wymagaj odhaczenia sprzętu przed startem', type: 'switch', value: s.requireBeforeChecklist, full: true }
    ], save),
    settingsCard('Powiadomienia i przypomnienia', [
      { name: 'notifyNewQuote', label: 'Nowa wycena z formularza', type: 'switch', value: s.notifyNewQuote, full: true },
      { name: 'notifyNewTask', label: 'Nowe zlecenie w planie (cały zespół)', type: 'switch', value: s.notifyNewTask, full: true },
      { name: 'notifyAssignment', label: 'Przypisanie do zlecenia', type: 'switch', value: s.notifyAssignment, full: true },
      { name: 'reminderFirstHours', label: 'Pierwsze przypomnienie (h przed)', type: 'number', value: s.reminderFirstHours, min: 2 },
      { name: 'reminderSecondHours', label: 'Drugie przypomnienie (h przed)', type: 'number', value: s.reminderSecondHours, min: 1 },
      { name: 'morningSummaryEnabled', label: 'Poranne podsumowanie dnia (push)', type: 'switch', value: s.morningSummaryEnabled, full: true },
      { name: 'morningSummaryHour', label: 'Godzina podsumowania', type: 'number', value: s.morningSummaryHour, min: 4, max: 12 }
    ], save),
    settingsCard('Podatek', [
      { name: 'taxRate', label: 'Stawka (%)', type: 'number', value: s.taxRate, min: 0, max: 100 },
      { name: 'taxThreshold', label: 'Próg (zł)', type: 'number', value: s.taxThreshold, min: 0 },
      { name: 'taxUpperRate', label: 'Stawka powyżej progu (%)', type: 'number', value: s.taxUpperRate, min: 0, max: 100 }
    ], save)
  ]);
}

/* ---------- Ustawienia 2.0 ---------- */
async function v2(el, build) {
  const r = await api('/v2/settings');
  const save = async v => { await api('/v2/settings', { method: 'PUT', body: v }); };
  mount(el, build(r.settings, save, r));
}

const dashboardSettings = el => v2(el, (s, save) => [
  settingsCard('Prognoza przychodu na pulpicie', [
    { name: 'pricesAreGross', label: 'Ceny w zleceniach są brutto', type: 'switch', value: s.pricesAreGross, hint: 'Wyłącz, jeśli wpisujecie ceny netto — pulpit doliczy VAT', full: true },
    { name: 'vatRate', label: 'VAT do doliczenia (%)', type: 'number', value: s.vatRate, min: 0, max: 30 },
    { name: 'monthlyGoal', label: 'Cel przychodu brutto na miesiąc (zł)', type: 'number', value: s.monthlyGoal || '', min: 0 },
    { name: 'weeklyGoal', label: 'Cel na tydzień (zł, puste = z celu miesięcznego)', type: 'number', value: s.weeklyGoal || '', min: 0 }
  ], save, '<p class="small muted" style="margin-bottom:10px">„Zarobimy w tym tygodniu / miesiącu” = suma zleceń zaplanowanych, w realizacji i zakończonych w danym okresie (bez wycen i anulowanych).</p>'),
  '<div class="card"><div class="card-head"><h3>Budżety</h3></div><p class="small muted">Budżety kosztów dla firmy i oddziałów ustawisz w Finanse → Budżety.</p><a class="btn sm" href="#/finanse/budzety" style="margin-top:10px">Przejdź do budżetów</a></div>'
]);

const smsSettings = el => v2(el, (s, save, r) => [
  `<div class="card ${r.sms.provider === 'smsapi' ? '' : 'warn'}"><b>Bramka SMS: ${r.sms.provider === 'smsapi' ? '✓ SMSAPI skonfigurowane' : 'nie skonfigurowana'}</b><p class="small muted" style="margin-top:4px">${r.sms.provider === 'smsapi' ? 'SMS-y wysyłają się automatycznie.' : 'Ustaw SMSAPI_TOKEN w Railway. Do tego czasu przyciski SMS otwierają gotową wiadomość w telefonie, a automatyczne przypomnienia są wstrzymane.'}</p></div>`,
  settingsCard('Przypomnienie dzień przed (z potwierdzeniem terminu)', [
    { name: 'smsReminderEnabled', label: 'Wysyłaj automatycznie', type: 'switch', value: s.smsReminderEnabled, full: true },
    { name: 'smsReminderHour', label: 'Godzina wysyłki', type: 'number', value: s.smsReminderHour, min: 8, max: 21 },
    { name: 'smsReminderTemplate', label: 'Treść', type: 'textarea', value: s.smsReminderTemplate, full: true, hint: 'Zmienne: {data} {godzina} {usluga} {adres} {ekipa} {link} — link prowadzi do potwierdzenia lub zmiany terminu' }
  ], save),
  settingsCard('„Ekipa jedzie”', [
    { name: 'smsOnTheWayTemplate', label: 'Treść', type: 'textarea', value: s.smsOnTheWayTemplate, full: true, hint: 'Wysyłana, gdy ekipa kliknie „Jedziemy” i zaznaczy SMS. Zmienne jak wyżej; {godzina} = przewidywany przyjazd' }
  ], save)
]);

const reportSettings = el => v2(el, (s, save, r) => [
  `<div class="card ${r.mail.configured ? '' : 'warn'}"><b>Poczta: ${r.mail.configured ? '✓ ' + esc(r.mail.provider) : 'nie skonfigurowana'}</b><p class="small muted" style="margin-top:4px">${r.mail.configured ? 'Raporty PDF wyjdą automatycznie.' : 'Ustaw RESEND_API_KEY albo SMTP w Railway — bez tego raporty można tylko pobrać.'}</p></div>`,
  settingsCard('Raporty PDF na e-mail', [
    { name: 'reportWeekly', label: 'Tygodniowy — poniedziałek 7:00', type: 'switch', value: s.reportWeekly, full: true },
    { name: 'reportMonthly', label: 'Miesięczny — 1. dnia miesiąca (także do księgowej)', type: 'switch', value: s.reportMonthly, full: true },
    { name: 'reportRecipients', label: 'Odbiorcy (po przecinku)', value: (s.reportRecipients || []).join(', '), full: true, hint: 'Puste = e-mail firmy z ustawień' }
  ], v => save({ ...v, reportRecipients: v.reportRecipients.split(',').map(x => x.trim()).filter(Boolean) }))
]);

const crewSettings = el => v2(el, (s, save) => [
  settingsCard('Ranking ekipy — punkty', [
    { name: 'rating5', label: 'Ocena 5★', type: 'number', value: s.rankingPoints.rating5 },
    { name: 'rating4', label: 'Ocena 4★', type: 'number', value: s.rankingPoints.rating4 },
    { name: 'onTime', label: 'Przyjazd na czas', type: 'number', value: s.rankingPoints.onTime },
    { name: 'fullReport', label: 'Pełny raport', type: 'number', value: s.rankingPoints.fullReport },
    { name: 'complaint', label: 'Reklamacja', type: 'number', value: s.rankingPoints.complaint },
    { name: 'rankingBonus', label: 'Nagroda miesiąca (widzi ekipa)', value: s.rankingBonus, full: true, placeholder: 'np. 300 zł premii dla zwycięzcy' }
  ], v => save({ rankingPoints: { rating5: v.rating5, rating4: v.rating4, onTime: v.onTime, fullReport: v.fullReport, complaint: v.complaint }, rankingBonus: v.rankingBonus })),
  settingsCard('Czas pracy, GPS i blokada', [
    { name: 'gpsEnabled', label: 'Czas pracy z lokalizacją GPS (za zgodą pracownika)', type: 'switch', value: s.gpsEnabled, full: true },
    { name: 'geofenceMeters', label: 'Promień „na miejscu” (m)', type: 'number', value: s.geofenceMeters, min: 50, max: 1000 },
    { name: 'lockMinutes', label: 'Blokada PIN-em po bezczynności (min, 0 = wył.)', type: 'number', value: s.lockMinutes, min: 0, max: 240 },
    { name: 'newDeviceAlerts', label: 'Powiadomienie o logowaniu z nowego urządzenia', type: 'switch', value: s.newDeviceAlerts, full: true }
  ], save)
]);

const modules = el => v2(el, (s, save) => {
  const M = [['outlet', 'RevOutlet'], ['powrot', 'RevPowrót'], ['newsletter', 'Newsletter'], ['rekrutacja', 'Rekrutacja'], ['sortownia', 'Sortownia'], ['dodatki', 'Dodatki'], ['deweloperzy', 'Deweloperzy'], ['hotele', 'Hotele (B2B)'], ['partnerzy', 'Partnerzy (B2B)'], ['abonamenty', 'Abonamenty 9.0']];
  return [
    settingsCard('Moduły dodatkowe (panel klasyczny 9.2)', M.map(([k, l]) => ({ name: k, label: l, type: 'switch', value: s.modules[k] !== false, full: true })), v => save({ modules: v }),
      '<p class="small muted" style="margin-bottom:10px">Te moduły nadal działają w panelu klasycznym pod <a href="/revmi-9/">/revmi-9/</a>. Wyłączone moduły znikną z menu „Moduły dodatkowe”. Dane zostają w bazie.</p>')
  ];
});

/* ---------- Dziennik zmian ---------- */
async function audit(el) {
  const r = await api('/v92/audit?limit=200');
  el.innerHTML = `<div class="card pad-0"><div class="table-wrap">${r.items.length ? `<table class="table"><thead><tr><th>Kiedy</th><th>Kto</th><th>Co</th></tr></thead><tbody>${r.items.map(a => `<tr><td class="small muted" style="white-space:nowrap">${fmtDateTime(a.at)}</td><td>${esc(a.actor)}</td><td class="small">${esc(a.summary || `${a.method} ${a.path}`)}</td></tr>`).join('')}</tbody></table>` : emptyState('Pusto', '', 'clock')}</div></div>`;
  void confirmBox;
}
