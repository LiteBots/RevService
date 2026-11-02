/* Zespół — pracownicy i dostęp (hasło, PIN, 2FA), rozliczenia, urlopy, czas pracy (GPS), ranking, oddziały */
import { S, api, esc, money, icon, avatar, fmtDate, fmtTime, ago, go, toast, busy, formModal, emptyState, confirmBox, reloadData, minutesLabel, dayKey, addDays, startOfWeek, isAdmin, can, canWrite, plural } from '../core.js';
import { leavesPart, rankingPart } from '../parts.js';

const ROLES = [['worker', 'Pracownik'], ['dispatcher', 'Dyspozytor'], ['manager', 'Kierownik oddziału'], ['accountant', 'Księgowa'], ['admin', 'Administrator']];
const ROLE_L = Object.fromEntries(ROLES);
const UNIT = [['hour', 'za godzinę'], ['task', 'za zlecenie'], ['day', 'za dzień']];
const KIND = { pay: 'Wypłata', bonus: 'Premia', advance: 'Zaliczka', deduction: 'Potrącenie' };

export default async function zespol(el, { params, ctx }) {
  const tabs = [
    ['', 'Pracownicy'],
    ...(can('payroll') ? [['rozliczenia', 'Rozliczenia']] : []),
    ...(can('leaves') || can('team') ? [['urlopy', 'Urlopy']] : []),
    ...(can('dispatch') || can('payroll') ? [['czas', 'Czas pracy']] : []),
    ['ranking', 'Ranking'],
    ...(isAdmin() ? [['oddzialy', 'Oddziały']] : [])
  ];
  const tab = tabs.some(t => t[0] === (params[0] || '')) ? params[0] || '' : '';
  ctx.setTitle('Zespół', tabs.find(t => t[0] === tab)[1]);
  el.innerHTML = `<div class="seg">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}${k === 'urlopy' && S.badges.urlopy ? `<span class="count">${S.badges.urlopy}</span>` : ''}</button>`).join('')}</div><div class="col" data-part style="gap:14px"></div>`;
  el.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go('zespol' + (b.dataset.tab ? '/' + b.dataset.tab : '')); });
  const part = el.querySelector('[data-part]');
  if (tab === '') return people(part, ctx);
  if (tab === 'rozliczenia') return payroll(part);
  if (tab === 'urlopy') return leavesPart(part);
  if (tab === 'czas') return timeAdmin(part);
  if (tab === 'ranking') return rankingPart(part);
  if (tab === 'oddzialy') return branches(part);
}

/* ---------- Pracownicy ---------- */
async function people(el, ctx) {
  let access = null;
  async function load() {
    await reloadData();
    access = isAdmin() ? (await api('/v2/employees/access').catch(() => null))?.employees || null : null;
  }
  const accOf = id => access?.find(a => String(a._id) === String(id));
  function draw() {
    const list = S.data.employees || [];
    ctx.setTitle('Zespół', plural(list.length, 'osoba', 'osoby', 'osób'), canWrite('team') || isAdmin() ? `<button class="btn primary sm" data-new>${icon('plus', 'sm')} <span class="hide-m">Pracownik</span></button>` : '');
    document.querySelector('[data-new]')?.addEventListener('click', () => edit());
    el.innerHTML = `<div class="card pad-0"><div class="table-wrap"><table class="table"><thead><tr><th>Osoba</th><th class="hide-m">Rola</th><th class="hide-m">Stawka</th><th>Logowanie</th><th class="hide-m">Ostatnio</th></tr></thead><tbody>
      ${list.map(e => { const a = accOf(e._id); return `<tr class="click" data-e="${e._id}"><td><div class="row">${avatar(e.name, e.color)}<div><b>${esc(e.name)}</b>${e.isOwner ? ' <span class="pill mint">Właściciel</span>' : ''}<div class="tiny muted">${esc([e.role, S.data.branches?.find(b => String(b._id) === String(e.branch))?.name].filter(Boolean).join(' · '))}</div></div></div></td>
        <td class="hide-m">${esc(ROLE_L[e.systemRole] || e.systemRole)}</td>
        <td class="hide-m">${e.payRate ? `${money(e.payRate)} ${UNIT.find(u => u[0] === e.payRateUnit)?.[1] || ''}` : e.hourlyRate ? `${money(e.hourlyRate)} / h` : '—'}</td>
        <td>${a ? `${a.hasPassword ? '<span class="pill mint">Hasło</span> ' : ''}${a.hasPin ? '<span class="pill">PIN</span> ' : ''}${a.totpEnabled ? '<span class="pill blue">2FA</span>' : ''}${a.locked ? ' <span class="pill red">Zablokowane</span>' : ''}${!a.hasPassword && !a.hasPin ? '<span class="pill amber">Brak dostępu</span>' : ''}` : '<span class="muted small">—</span>'}</td>
        <td class="hide-m small muted">${a?.lastSeenAt ? ago(a.lastSeenAt) : '—'}</td></tr>`; }).join('')}
    </tbody></table></div></div>
    ${isAdmin() ? '<p class="small muted">Kliknij osobę, żeby ustawić rolę, stawkę, hasło logowania, PIN do odblokowania aplikacji albo zresetować 2FA.</p>' : ''}`;
  }
  function edit(e = {}) {
    const a = accOf(e._id) || {};
    formModal({
      title: e._id ? e.name : 'Nowy pracownik', wide: true,
      fields: [
        { name: 'name', label: 'Imię i nazwisko', value: e.name, required: true },
        { name: 'role', label: 'Stanowisko', value: e.role || 'Pomocnik', placeholder: 'Kierowca, pomocnik…' },
        { name: 'systemRole', label: 'Uprawnienia w aplikacji', type: 'select', value: e.systemRole || 'worker', options: ROLES },
        { name: 'branch', label: 'Oddział', type: 'select', value: e.branch || '', options: [['', 'Ekipa główna'], ...(S.data.branches || []).map(b => [b._id, b.name])] },
        { name: 'phone', label: 'Telefon (login)', type: 'tel', value: e.phone },
        { name: 'email', label: 'E-mail (login)', type: 'email', value: e.email },
        { name: 'payRate', label: 'Stawka (zł)', type: 'number', value: e.payRate || '', min: 0 },
        { name: 'payRateUnit', label: 'Za', type: 'select', value: e.payRateUnit || 'hour', options: UNIT },
        { name: 'color', label: 'Kolor w grafiku', type: 'color', value: e.color || '#03F0BA' },
        ...(isAdmin() ? [
          { name: 'password', label: e._id && a.hasPassword ? 'Nowe hasło (puste = bez zmian)' : 'Hasło logowania (min. 8 znaków, litery i cyfry)', type: 'password', autocomplete: 'new-password' },
          { name: 'pin', label: e._id ? 'Nowy PIN (puste = bez zmian)' : 'PIN (4–8 cyfr) — szybkie odblokowanie', type: 'password', autocomplete: 'new-password' }
        ] : [])
      ],
      extraFoot: e._id && isAdmin() && !e.isOwner ? `<button class="btn danger" data-deact>${icon('trash', 'sm')} Dezaktywuj</button>${a.totpEnabled ? '<button class="btn" data-reset2fa>Reset 2FA</button>' : ''}${a.locked ? '<button class="btn" data-unlock>Odblokuj</button>' : ''}<button class="btn ghost" data-earn>Zarobki</button><span class="grow"></span>` : (e._id ? '<button class="btn ghost" data-earn>Zarobki</button><span class="grow"></span>' : ''),
      onSubmit: async v => {
        const body = { name: v.name, role: v.role, systemRole: v.systemRole, branch: v.branch || null, phone: v.phone, email: v.email, payRate: v.payRate || 0, payRateUnit: v.payRateUnit, color: v.color };
        if (!e._id && v.pin) body.pin = v.pin;
        const r = await api(e._id ? '/employees/' + e._id : '/employees', { method: e._id ? 'PUT' : 'POST', body });
        const id = e._id || r.employee?._id;
        if (isAdmin() && id && (v.password || (e._id && v.pin))) await api(`/v2/employees/${id}/access`, { method: 'PUT', body: { ...(v.password ? { password: v.password } : {}), ...(e._id && v.pin ? { pin: v.pin } : {}) } });
        toast('Zapisano', 'ok'); await load(); draw();
      },
      onMount: (m, close) => {
        m.querySelector('[data-deact]')?.addEventListener('click', async ev => { if (!await confirmBox(`Dezaktywować ${e.name}? Straci dostęp do aplikacji, historia zostaje.`, { ok: 'Dezaktywuj', danger: true })) return; await busy(ev.target, async () => { await api('/employees/' + e._id, { method: 'DELETE' }); close(); toast('Dezaktywowano', 'ok'); await load(); draw(); }); });
        m.querySelector('[data-reset2fa]')?.addEventListener('click', ev => busy(ev.target, async () => { await api('/v92/2fa/reset/' + e._id, { method: 'POST' }); toast('2FA zresetowane', 'ok'); close(); await load(); draw(); }));
        m.querySelector('[data-unlock]')?.addEventListener('click', ev => busy(ev.target, async () => { await api(`/v2/employees/${e._id}/access`, { method: 'PUT', body: { unlock: true } }); toast('Odblokowano', 'ok'); close(); await load(); draw(); }));
        m.querySelector('[data-earn]')?.addEventListener('click', () => { close(); go('zarobki?osoba=' + e._id); });
      }
    });
  }
  el.addEventListener('click', ev => { const r = ev.target.closest('[data-e]'); if (r && (isAdmin() || canWrite('team'))) edit(S.data.employees.find(x => String(x._id) === r.dataset.e)); });
  await load();
  draw();
}

/* ---------- Rozliczenia ---------- */
async function payroll(el) {
  let d;
  async function load() { d = await api('/payroll'); }
  function draw() {
    el.innerHTML = `
      <div class="grid g3"><div class="card hero kpi"><div class="label">Do wypłaty łącznie</div><div class="value">${money(d.total)}</div><div class="hint">nierozliczone pozycje</div></div></div>
      <div class="card pad-0"><div class="table-wrap"><table class="table"><thead><tr><th>Pracownik</th><th class="hide-m">Pozycje</th><th>Saldo</th><th></th></tr></thead><tbody>
        ${d.employees.map(e => `<tr><td><div class="row">${avatar(e.name, e.color, 'sm')}<b>${esc(e.name)}</b></div></td><td class="hide-m small">${e.open.map(p => `<div>${KIND[p.kind]}: ${money(p.amount)} <span class="muted">· ${esc(p.description || '')}</span> <a href="#" data-delp="${p._id}" class="muted">✕</a></div>`).join('') || '<span class="muted">—</span>'}</td>
          <td><b class="num ${e.balance < 0 ? 'red' : ''}">${money(e.balance)}</b></td>
          <td style="text-align:right;white-space:nowrap"><button class="btn sm" data-add="${e._id}">${icon('plus', 'sm')}</button> ${e.balance ? `<button class="btn primary sm" data-settle="${e._id}">Rozlicz</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div></div>
      <div class="card"><div class="card-head"><h3>Historia rozliczeń</h3></div>${d.history.length ? `<div class="list">${d.history.slice(0, 30).map(p => `<div class="li"><div class="grow"><b>${esc(p.employeeName)}</b> · ${KIND[p.kind]}<div class="li-sub">${esc(p.description || '')} · rozliczono ${fmtDate(p.settledAt)}</div></div><b class="num">${money(p.amount)}</b></div>`).join('')}</div>` : '<p class="muted small">—</p>'}</div>`;
  }
  el.addEventListener('click', async e => {
    const add = e.target.closest('[data-add]');
    if (add) return formModal({ title: 'Dodaj pozycję', fields: [{ name: 'kind', label: 'Rodzaj', type: 'select', options: Object.entries(KIND) }, { name: 'amount', label: 'Kwota (zł)', type: 'number', required: true, min: 0 }, { name: 'description', label: 'Opis', full: true }], onSubmit: async v => { await api('/payroll', { method: 'POST', body: { ...v, employee: add.dataset.add } }); await load(); draw(); } });
    const st = e.target.closest('[data-settle]');
    if (st) { const emp = d.employees.find(x => String(x._id) === st.dataset.settle); if (!await confirmBox(`Rozliczyć ${emp.name}: ${money(emp.balance)}? Kwota trafi do kosztów firmy.`, { ok: 'Rozlicz' })) return; return busy(st, async () => { await api('/payroll/settle/' + st.dataset.settle, { method: 'POST' }); toast('Rozliczono', 'ok'); await load(); draw(); }); }
    const del = e.target.closest('[data-delp]');
    if (del) { e.preventDefault(); await api('/payroll/' + del.dataset.delp, { method: 'DELETE' }); await load(); draw(); }
  });
  await load();
  draw();
}

/* ---------- Czas pracy (biuro) ---------- */
async function timeAdmin(el) {
  let from = startOfWeek(new Date());
  async function draw() {
    const d = await api(`/v2/time/admin?from=${dayKey(from)}&to=${dayKey(addDays(from, 7))}`);
    el.innerHTML = `
      <div class="row wrap between"><div class="row"><button class="icon-btn" data-w="-1">${icon('left')}</button><b>${fmtDate(from)} – ${fmtDate(addDays(from, 6))}</b><button class="icon-btn" data-w="1">${icon('right')}</button></div>
      <a class="btn sm" href="/api/v2/time/export.csv?month=${dayKey(from).slice(0, 7)}">${icon('download', 'sm')} Eksport miesiąca (CSV)</a></div>
      <div class="card"><div class="card-head"><h3>Teraz w pracy</h3><span class="pill mint">${d.live.length}</span></div>${d.live.length ? `<div class="list">${d.live.map(e => `<div class="li"><span class="status-chip ${e.state === 'working' ? 'on' : 'pause'}">${e.state === 'working' ? '●' : '❚❚'}</span><div class="grow"><b>${esc(e.employeeName)}</b><div class="li-sub">od ${fmtTime(e.startedAt)} · ${minutesLabel(e.minutes)}${e.lastEvent?.taskName ? ` · ${e.lastEvent.type === 'arrive' ? '📍 na miejscu: ' : ''}${esc(e.lastEvent.taskName)}` : ''}</div></div>${e.lastEvent?.lat ? `<a class="btn ghost sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${e.lastEvent.lat},${e.lastEvent.lon}">${icon('pin', 'sm')}</a>` : ''}<button class="btn ghost sm" data-stop="${e._id}">Zakończ za niego</button></div>`).join('')}</div>` : '<p class="muted small">Nikt teraz nie liczy czasu pracy.</p>'}</div>
      <div class="card"><div class="card-head"><h3>Suma godzin w tygodniu</h3></div>${d.employees.map(e => `<div class="hbar"><span class="ellipsis">${esc(e.name)}</span><span class="track"><i style="width:${Math.min(100, (e.minutes / (50 * 60)) * 100)}%;background:${esc(e.color || 'var(--accent)')}"></i></span><b class="num">${minutesLabel(e.minutes)}</b></div>`).join('')}</div>
      <div class="card pad-0"><div class="table-wrap">${d.entries.length ? `<table class="table"><thead><tr><th>Dzień</th><th>Osoba</th><th>Start</th><th>Godziny</th><th class="hide-m">Przerwy</th><th class="hide-m">Zdarzenia</th></tr></thead><tbody>${d.entries.map(e => `<tr><td>${esc(e.day)}</td><td>${esc(e.employeeName)}</td><td>${fmtTime(e.startedAt)}</td><td><b>${minutesLabel(e.minutes)}</b>${e.state !== 'off' ? ' <span class="pill mint">trwa</span>' : ''}</td><td class="hide-m">${e.breakMinutes ? minutesLabel(e.breakMinutes) : '—'}</td><td class="hide-m small muted">${e.events.filter(x => x.type === 'arrive').map(x => '📍 ' + esc(x.taskName || '') + ' ' + fmtTime(x.at)).join(', ')}</td></tr>`).join('')}</tbody></table>` : emptyState('Brak wpisów w tym tygodniu', 'Ekipa włącza licznik w zakładce „Czas pracy” w telefonie.', 'clock')}</div></div>`;
  }
  el.addEventListener('click', async e => {
    const w = e.target.closest('[data-w]');
    if (w) { from = addDays(from, 7 * Number(w.dataset.w)); return draw(); }
    const s = e.target.closest('[data-stop]');
    if (s) {
      const t = prompt('Godzina zakończenia (np. 16:30)', fmtTime(new Date()));
      if (!t || !/^\d{1,2}:\d{2}$/.test(t)) return;
      const [h, m] = t.split(':').map(Number);
      const at = new Date(); at.setHours(h, m, 0, 0);
      await busy(s, async () => { await api('/v2/time/admin/' + s.dataset.stop, { method: 'PUT', body: { stopAt: at.toISOString() } }); toast('Zakończono licznik', 'ok'); draw(); });
    }
  });
  await draw();
}

/* ---------- Oddziały ---------- */
async function branches(el) {
  let list = [];
  async function load() { list = (await api('/branches')).branches || []; }
  function draw() {
    el.innerHTML = `<div class="row between"><span class="small muted">Oddział = osobna ekipa, bus i zlecenia. Pracownik oddziału widzi tylko swoje zlecenia.</span><button class="btn primary sm" data-new>${icon('plus', 'sm')} Oddział</button></div>
      <div class="grid g3">${list.map(b => `<div class="card click" data-b="${b._id}"><div class="row"><span class="dot" style="background:${esc(b.color)};width:12px;height:12px"></span><b>${esc(b.name)}</b></div><div class="small muted" style="margin-top:6px">${esc([b.city, b.specialty].filter(Boolean).join(' · '))}</div><div class="small" style="margin-top:8px">Sprzęt przed wyjazdem: ${b.equipment?.length ? esc(b.equipment.join(', ')) : '—'}</div></div>`).join('') || emptyState('Brak oddziałów', '', 'layers')}</div>`;
  }
  function edit(b = {}) {
    formModal({
      title: b._id ? b.name : 'Nowy oddział',
      fields: [
        { name: 'name', label: 'Nazwa', value: b.name, required: true },
        { name: 'city', label: 'Miasto', value: b.city },
        { name: 'specialty', label: 'Specjalizacja', value: b.specialty, full: true },
        { name: 'color', label: 'Kolor', type: 'color', value: b.color || '#03F0BA' },
        { name: 'minPhotos', label: 'Min. zdjęć przy zakończeniu', type: 'number', value: b.minPhotos ?? 1, min: 0, max: 10 },
        { name: 'equipment', label: 'Sprzęt przed wyjazdem (jedna rzecz w linii)', type: 'textarea', value: (b.equipment || []).join('\n'), full: true }
      ],
      extraFoot: b._id ? `<button class="btn danger" data-del>${icon('trash', 'sm')}</button><span class="grow"></span>` : '',
      onSubmit: async v => { await api(b._id ? '/branches/' + b._id : '/branches', { method: b._id ? 'PUT' : 'POST', body: { ...v, equipment: v.equipment.split('\n').map(s => s.trim()).filter(Boolean) } }); toast('Zapisano', 'ok'); await load(); draw(); reloadData().catch(() => null); },
      onMount: (m, close) => m.querySelector('[data-del]')?.addEventListener('click', async ev => { if (!await confirmBox(`Usunąć oddział ${b.name}?`, { ok: 'Usuń', danger: true })) return; await busy(ev.target, async () => { await api('/branches/' + b._id, { method: 'DELETE' }); close(); await load(); draw(); }); })
    });
  }
  el.addEventListener('click', e => { if (e.target.closest('[data-new]')) return edit(); const b = e.target.closest('[data-b]'); if (b) edit(list.find(x => String(x._id) === b.dataset.b)); });
  await load();
  draw();
}
