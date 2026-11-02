/* Finanse — przegląd (przychód, koszty, zysk, podatek), budżety oddziałów, należności, koszty i przychody, raporty PDF */
import { donut } from '../charts.js';
import { S, api, esc, money, icon, tile, serviceTile, serviceOf, fmtDate, go, toast, busy, formModal, emptyState, confirmBox, dayKey, plural, canWrite } from '../core.js';

export default async function finanse(el, { params, query, ctx }) {
  const tabs = [['', 'Przegląd'], ['budzety', 'Budżety'], ['naleznosci', 'Należności'], ['koszty', 'Koszty i przychody'], ['raporty', 'Raporty PDF']];
  const tab = tabs.some(t => t[0] === (params[0] || '')) ? params[0] || '' : '';
  ctx.setTitle('Finanse', tabs.find(t => t[0] === tab)[1]);
  el.innerHTML = `<div class="seg">${tabs.map(([k, l]) => `<button data-tab="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div><div class="col" data-part style="gap:14px"></div>`;
  el.querySelector('.seg').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) go('finanse' + (b.dataset.tab ? '/' + b.dataset.tab : '')); });
  const part = el.querySelector('[data-part]');
  if (tab === '') return overview(part);
  if (tab === 'budzety') return budgets(part);
  if (tab === 'naleznosci') return receivables(part);
  if (tab === 'koszty') return ledger(part, query.nowy === '1');
  if (tab === 'raporty') return reports(part);
}

/* ---------- Przegląd ---------- */
async function overview(el) {
  let period = 'month';
  async function draw() {
    const s = await api('/stats?period=' + period);
    const t = s.totals;
    const max = Math.max(1, ...s.months.map(m => Math.max(m.revenue, m.expenses)));
    el.innerHTML = `
      <div class="seg" style="align-self:flex-start"><button data-p="month" class="${period === 'month' ? 'on' : ''}">Ten miesiąc</button><button data-p="year" class="${period === 'year' ? 'on' : ''}">Ten rok</button></div>
      <div class="grid g4">
        <div class="card kpi c-mint"><div class="glow"></div><div class="kpi-top">${tile('trend', 'mint', 'lg')}<div class="label">Przychód</div></div><div class="value">${money(t.revenue)}</div><div class="hint">${plural(t.completed, 'zlecenie', 'zlecenia', 'zleceń')} · śr. ${money(t.avgTicket)}</div></div>
        <div class="card kpi c-orange"><div class="glow"></div><div class="kpi-top">${tile('receipt', 'orange', 'lg')}<div class="label">Koszty</div></div><div class="value">${money(t.expenses)}</div><div class="hint">w tym wypłaty ${money(t.payroll)}</div></div>
        <div class="card kpi c-lime"><div class="glow"></div><div class="kpi-top">${tile('wallet', 'lime', 'lg')}<div class="label">Zysk</div></div><div class="value ${t.profit < 0 ? 'red' : ''}">${money(t.profit)}</div><div class="hint ${t.margin >= 0 ? 'up' : 'down'}">marża ${t.margin}%</div></div>
        <div class="card kpi c-blue"><div class="glow"></div><div class="kpi-top">${tile('euro', 'blue', 'lg')}<div class="label">Podatek (${s.tax.rate}%)</div></div><div class="value">${money(period === 'year' ? s.tax.ytd : s.tax.month)}</div><div class="hint">narastająco w roku: ${money(s.tax.ytd)}</div></div>
      </div>
      <div class="split">
        <div class="card"><div class="card-head">${tile('chart', 'mint', 'sm')}<h3>Przychód i koszty · miesiące</h3><div class="legend"><span><i></i>przychód</span><span><i style="background:var(--amber)"></i>koszty</span></div></div>
          <div class="bars">${s.months.map(m => `<div class="bar" title="${esc(m.label)}: ${money(m.revenue)} / ${money(m.expenses)}"><div style="display:flex;gap:3px;align-items:flex-end;height:100%;width:100%;justify-content:center"><b style="height:${(m.revenue / max) * 100}%;max-width:18px;background:linear-gradient(180deg,#19f5c4,rgba(3,240,186,.2))"></b><b style="height:${(m.expenses / max) * 100}%;max-width:18px;background:linear-gradient(180deg,#ffa25a,rgba(255,94,43,.25))"></b></div><span>${esc(m.label)}</span></div>`).join('')}</div></div>
        <div class="col" style="gap:18px"><div class="card">${servicesDonut(s.services)}</div>
        <div class="card"><div class="card-head">${tile('receipt', 'orange', 'sm')}<h3>Koszty wg kategorii</h3></div>${(() => { const cats = Object.entries(s.categories || {}).sort((a, b) => b[1] - a[1]); const mx = Math.max(1, ...cats.map(c => c[1])); return cats.length ? cats.slice(0, 8).map(([name, total]) => `<div class="hbar"><span class="ellipsis">${esc(name || 'Inne')}</span><span class="track"><i style="width:${(total / mx) * 100}%;background:var(--amber)"></i></span><b class="num">${money(total)}</b></div>`).join('') : '<p class="muted small">Brak kosztów.</p>'; })()}</div></div>
      </div>
      <div class="split">
        <div class="card pad-0"><div class="card-head" style="padding:14px 16px 0"><h3>Rentowność usług</h3></div><div class="table-wrap"><table class="table"><thead><tr><th>Usługa</th><th>Zlecenia</th><th>Przychód</th><th>Marża</th></tr></thead><tbody>${s.services.slice(0, 10).map(r => `<tr><td><span class="row" style="gap:8px">${serviceTile(r.type || r.name, 'xs')}${esc(r.type || r.name || '—')}</span></td><td>${r.count}</td><td class="num">${money(r.revenue)}</td><td><span class="pill ${r.margin >= 35 ? 'mint' : r.margin >= 15 ? 'amber' : 'red'}">${r.margin}%</span></td></tr>`).join('') || '<tr><td colspan="4" class="muted">—</td></tr>'}</tbody></table></div></div>
        <div class="card"><div class="card-head"><h3>Wyceny</h3></div><div class="kpi"><div class="value">${s.quotes.conversion}%</div><div class="hint">skuteczność: ${s.quotes.won} z ${s.quotes.total} zgłoszeń</div></div>${s.revbot?.accuracy !== null && s.revbot?.accuracy !== undefined ? `<p class="small muted" style="margin-top:10px">Trafność wyceny AI: <b style="color:var(--text)">${s.revbot.accuracy}%</b> (w widełkach: ${s.revbot.inRange}%)</p>` : ''}</div>
      </div>`;
  }
  el.addEventListener('click', e => { const p = e.target.closest('[data-p]'); if (p) { period = p.dataset.p; draw(); } });
  await draw();
}

/** Pierścień: udział usług w przychodzie (kolory jak kafelki usług). */
const HEX = { blue: '#5b9bff', orange: '#ff9a4d', cyan: '#4ae3ff', lime: '#b4f25a', indigo: '#7b88ff', pink: '#ff77ba', red: '#ff7a7a', amber: '#ffd34f', violet: '#a77bff', slate: '#7d8794', mint: '#19f5c4', teal: '#38e0c8' };
function servicesDonut(services) {
  const rows = (services || []).filter(r => r.revenue > 0).slice(0, 6);
  const total = rows.reduce((a, r) => a + r.revenue, 0);
  if (!total) return `<div class="card-head">${tile('layers', 'violet', 'sm')}<h3>Przychód wg usług</h3></div><p class="muted small">Brak zakończonych zleceń w okresie.</p>`;
  return `<div class="card-head">${tile('layers', 'violet', 'sm')}<h3>Przychód wg usług</h3></div>
    <div class="row wrap" style="gap:20px">
      <div class="donut-wrap">${donut(rows.map(r => [r.revenue / total, HEX[serviceOf(r.type || r.name).color]]))}<div class="c"><div><b style="font-size:18px">${money(total).replace(' zł', '')}</b><div class="tiny muted">zł</div></div></div></div>
      <div class="grow col" style="gap:8px;min-width:180px">${rows.map(r => `<div class="row">${serviceTile(r.type || r.name, 'sm')}<span class="small grow ellipsis">${esc(r.type || r.name || 'Inne')}</span><b class="small">${Math.round((r.revenue / total) * 100)}%</b></div>`).join('')}</div>
    </div>`;
}

/* ---------- Budżety ---------- */
async function budgets(el) {
  let month = dayKey(new Date()).slice(0, 7);
  let d;
  async function load() { d = await api('/v2/budgets?month=' + month); }
  const branchName = id => (id ? d.branches.find(b => String(b._id) === String(id))?.name || 'Oddział' : 'Cała firma');
  function draw() {
    const label = new Date(month + '-15').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    const groups = new Map();
    for (const b of d.budgets) { const k = String(b.branch || ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(b); }
    el.innerHTML = `
      <div class="row wrap between"><div class="row"><button class="icon-btn" data-m="-1">${icon('left')}</button><b style="text-transform:capitalize">${label}</b><button class="icon-btn" data-m="1">${icon('right')}</button></div>${canWrite('finance') ? `<button class="btn primary sm" data-edit>${icon('edit', 'sm')} Ustaw budżety i cel</button>` : ''}</div>
      <div class="grid g3">
        <div class="card kpi"><div class="label">Wydatki w miesiącu</div><div class="value">${money(d.total)}</div></div>
        <div class="card kpi"><div class="label">Cel przychodu (miesiąc)</div><div class="value">${d.monthlyGoal ? money(d.monthlyGoal) : '—'}</div><div class="hint">widać go na pulpicie</div></div>
        <div class="card kpi"><div class="label">Przekroczone budżety</div><div class="value ${d.budgets.some(b => b.level === 'over') ? 'red' : ''}">${d.budgets.filter(b => b.level === 'over').length}</div><div class="hint">alert push przy 80% i 100%</div></div>
      </div>
      ${d.budgets.length ? [...groups].map(([k, list]) => `<div class="card"><div class="card-head"><h3>${esc(branchName(k))}</h3></div>${list.map(b => `<div style="margin-bottom:12px"><div class="row between"><span>${esc(b.category)}</span><span class="small"><b class="${b.level === 'over' ? 'red' : b.level === 'warn' ? 'amber' : ''}">${money(b.spent)}</b> <span class="muted">z ${money(b.amount)} · ${b.pct}%</span></span></div><div class="progress ${b.level}"><i style="width:${Math.min(100, b.pct)}%"></i></div>${b.level === 'over' ? `<div class="tiny red" style="margin-top:3px">Przekroczono o ${money(-b.left)}</div>` : ''}</div>`).join('')}</div>`).join('') : `<div class="card">${emptyState('Brak budżetów', 'Ustaw miesięczne budżety na paliwo, materiały, utylizację czy wypłaty — dla całej firmy albo oddziału.', 'chart')}</div>`}
      <div class="card"><div class="card-head"><h3>Wydatki wg kategorii budżetu</h3></div>${Object.entries(d.spentByCategory).sort((a, b) => b[1] - a[1]).map(([c, v]) => `<div class="hbar"><span>${esc(c)}</span><span class="track"><i style="width:${(v / Math.max(...Object.values(d.spentByCategory), 1)) * 100}%;background:var(--amber)"></i></span><b class="num">${money(v)}</b></div>`).join('') || '<p class="muted small">Brak wydatków.</p>'}</div>`;
  }
  function edit() {
    const rows = d.budgets.length ? d.budgets.map(b => ({ ...b })) : d.categories.slice(0, 4).map(c => ({ category: c, amount: '', branch: null }));
    const branchOpts = [['', 'Cała firma'], ...d.branches.map(b => [b._id, b.name])];
    const row = (b, i) => `<div class="row" data-row="${i}" style="gap:6px"><select class="input sm" name="category">${d.categories.map(c => `<option ${c === b.category ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><select class="input sm" name="branch">${branchOpts.map(([v, l]) => `<option value="${v}" ${String(v) === String(b.branch || '') ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select><input class="input sm" type="number" name="amount" placeholder="zł" value="${b.amount ?? ''}" style="width:110px"><button class="btn ghost sm" data-rm="${i}">✕</button></div>`;
    formModal({
      title: 'Budżety i cel miesięczny', wide: true,
      fields: [{ name: 'monthlyGoal', label: 'Cel przychodu brutto na miesiąc (zł)', type: 'number', value: d.monthlyGoal || '', min: 0, full: true }],
      intro: '<div class="eyebrow">Budżety miesięczne</div><div class="col" data-rows style="gap:6px"></div><button class="btn ghost sm" data-add-row type="button">' + icon('plus', 'sm') + ' Dodaj budżet</button>',
      onMount: m => {
        const paint = () => { m.querySelector('[data-rows]').innerHTML = rows.map(row).join(''); };
        const sync = () => m.querySelectorAll('[data-row]').forEach(r => { const i = Number(r.dataset.row); rows[i] = { category: r.querySelector('[name=category]').value, branch: r.querySelector('[name=branch]').value || null, amount: r.querySelector('[name=amount]').value }; });
        paint();
        m.addEventListener('click', e => {
          if (e.target.closest('[data-add-row]')) { sync(); rows.push({ category: 'Paliwo', amount: '', branch: null }); paint(); }
          const rm = e.target.closest('[data-rm]');
          if (rm) { sync(); rows.splice(Number(rm.dataset.rm), 1); paint(); }
        });
        m._sync = sync;
      },
      onSubmit: async (v, m) => {
        m._sync();
        await api('/v2/budgets', { method: 'PUT', body: { monthlyGoal: v.monthlyGoal || 0, budgets: rows.filter(r => Number(r.amount) > 0).map(r => ({ ...r, amount: Number(r.amount) })) } });
        toast('Budżety zapisane', 'ok'); await load(); draw();
      }
    });
  }
  el.addEventListener('click', async e => {
    const m = e.target.closest('[data-m]');
    if (m) { const dt = new Date(month + '-15'); dt.setMonth(dt.getMonth() + Number(m.dataset.m)); month = dayKey(dt).slice(0, 7); await load(); return draw(); }
    if (e.target.closest('[data-edit]')) edit();
  });
  await load();
  draw();
}

/* ---------- Należności ---------- */
async function receivables(el) {
  let d;
  async function load() { d = await api('/v92/receivables'); }
  const B = { '0-7': '0–7 dni', '8-30': '8–30 dni', '31-60': '31–60 dni', '60+': 'ponad 60 dni' };
  function draw() {
    el.innerHTML = `
      <div class="grid g4"><div class="card kpi hero"><div class="label">Do zapłaty</div><div class="value">${money(d.total)}</div><div class="hint">${plural(d.items.length, 'zlecenie', 'zlecenia', 'zleceń')}</div></div>${Object.entries(d.buckets).slice(0, 3).map(([k, v]) => `<div class="card kpi"><div class="label">${esc(B[k] || k)}</div><div class="value ${k !== '0-7' ? 'amber' : ''}">${money(v)}</div></div>`).join('')}</div>
      <div class="card pad-0"><div class="table-wrap">${d.items.length ? `<table class="table"><thead><tr><th>Zlecenie</th><th>Klient</th><th>Kwota</th><th class="hide-m">Dni</th><th></th></tr></thead><tbody>${d.items.map(t => `<tr><td class="click" data-go="zlecenia/${t._id}"><b>${esc(t.name)}</b><div class="tiny muted">${fmtDate(t.completedAt)}</div></td><td>${esc(t.clientName || '—')}<div class="tiny muted">${esc(t.clientPhone || '')}</div></td><td><b class="num">${money(t.due)}</b></td><td class="hide-m"><span class="pill ${t.days > 30 ? 'red' : t.days > 7 ? 'amber' : ''}">${t.days} dni</span>${t.paymentReminders?.length ? `<div class="tiny muted">przypomnienia: ${t.paymentReminders.length}</div>` : ''}</td><td style="white-space:nowrap;text-align:right"><button class="btn sm" data-remind="${t._id}">${icon('sms', 'sm')} Przypomnij</button> <button class="btn primary sm" data-paid="${t._id}">Opłacone</button></td></tr>`).join('')}</tbody></table>` : emptyState('Wszystko zapłacone 🎉', '', 'wallet')}</div></div>`;
  }
  el.addEventListener('click', async e => {
    const g = e.target.closest('[data-go]');
    if (g) return go(g.dataset.go);
    const r = e.target.closest('[data-remind]');
    if (r) return busy(r, async () => { const x = await api(`/v92/receivables/${r.dataset.remind}/remind`, { method: 'POST', body: { channel: 'auto' } }); if (x.smsLink) location.href = x.smsLink; else toast('Wysłano przypomnienie', 'ok'); await load(); draw(); });
    const p = e.target.closest('[data-paid]');
    if (p) return busy(p, async () => { await api(`/v92/receivables/${p.dataset.paid}/paid`, { method: 'POST' }); toast('Oznaczono jako opłacone', 'ok'); await load(); draw(); });
  });
  await load();
  draw();
}

/* ---------- Koszty i przychody ---------- */
async function ledger(el, openNew) {
  let month = dayKey(new Date()).slice(0, 7);
  let d;
  async function load() { const from = month + '-01'; const to = new Date(month + '-15'); to.setMonth(to.getMonth() + 1); d = await api(`/finances?from=${from}&to=${dayKey(to).slice(0, 7)}-01`); }
  function draw() {
    const label = new Date(month + '-15').toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    const sum = l => l.reduce((s, x) => s + (x.price || 0), 0);
    el.innerHTML = `
      <div class="row wrap between"><div class="row"><button class="icon-btn" data-m="-1">${icon('left')}</button><b style="text-transform:capitalize">${label}</b><button class="icon-btn" data-m="1">${icon('right')}</button></div><div class="row"><button class="btn sm" data-add="income">${icon('plus', 'sm')} Przychód</button><button class="btn primary sm" data-add="expense">${icon('plus', 'sm')} Koszt</button></div></div>
      <div class="split">
        <div class="card"><div class="card-head"><h3>Koszty</h3><b class="amber">${money(sum(d.expenses))}</b></div>${d.expenses.length ? `<div class="list">${d.expenses.map(x => `<div class="li"><div class="grow"><b>${esc(x.category)}</b><div class="li-sub">${esc(x.desc || '')} · ${fmtDate(x.date)}${x.source === 'task' ? ' · z raportu zlecenia' : x.source === 'payroll' ? ' · rozliczenie' : ''}</div></div><b class="num">${money(x.price)}</b>${x.source === 'manual' || !x.source ? `<button class="btn ghost sm" data-del="expenses/${x._id}">${icon('trash', 'sm')}</button>` : ''}</div>`).join('')}</div>` : '<p class="muted small">Brak kosztów.</p>'}</div>
        <div class="card"><div class="card-head"><h3>Przychody (poza zleceniami)</h3><b class="accent">${money(sum(d.incomes))}</b></div>${d.incomes.length ? `<div class="list">${d.incomes.map(x => `<div class="li"><div class="grow"><b>${esc(x.category)}</b><div class="li-sub">${esc(x.desc || '')} · ${fmtDate(x.date)}</div></div><b class="num">${money(x.price)}</b><button class="btn ghost sm" data-del="incomes/${x._id}">${icon('trash', 'sm')}</button></div>`).join('')}</div>` : '<p class="muted small">Brak.</p>'}
          <hr class="sep" style="margin:12px 0"><div class="eyebrow">Zakończone zlecenia w miesiącu</div><div class="list">${d.completedTasks.slice(0, 12).map(t => `<div class="li click" data-go="zlecenia/${t._id}"><span class="grow ellipsis">${esc(t.name)}</span><b class="num">${money(t.finalPrice ?? t.price)}</b></div>`).join('') || '<p class="muted small">—</p>'}</div></div>
      </div>`;
  }
  function add(kind) {
    formModal({
      title: kind === 'income' ? 'Nowy przychód' : 'Nowy koszt',
      fields: [
        { name: 'price', label: 'Kwota (zł)', type: 'number', required: true, min: 0 },
        { name: 'category', label: 'Kategoria', value: kind === 'income' ? 'Inne' : 'Paliwo', required: true, placeholder: kind === 'income' ? 'np. Skup złomu' : 'Paliwo, Materiały, Utylizacja, Marketing…' },
        { name: 'date', label: 'Data', type: 'date', value: dayKey(new Date()) },
        ...(kind === 'expense' && S.data.branches?.length ? [{ name: 'branch', label: 'Oddział (budżet)', type: 'select', options: [['', 'Cała firma'], ...S.data.branches.map(b => [b._id, b.name])] }] : []),
        ...(kind === 'expense' ? [{ name: 'vehicle', label: 'Pojazd (opcjonalnie)', type: 'select', options: [['', '—'], ...(S.data.fleet || []).map(v => [v._id, `${v.name} ${v.plates}`])] }] : []),
        { name: 'desc', label: 'Opis', full: true }
      ],
      onSubmit: async v => { await api(kind === 'income' ? '/incomes' : '/expenses', { method: 'POST', body: { ...v, branch: v.branch || null, vehicle: v.vehicle || null } }); toast('Zapisano', 'ok'); await load(); draw(); }
    });
  }
  el.addEventListener('click', async e => {
    const m = e.target.closest('[data-m]');
    if (m) { const dt = new Date(month + '-15'); dt.setMonth(dt.getMonth() + Number(m.dataset.m)); month = dayKey(dt).slice(0, 7); await load(); return draw(); }
    const a = e.target.closest('[data-add]');
    if (a) return add(a.dataset.add);
    const g = e.target.closest('[data-go]');
    if (g) return go(g.dataset.go);
    const del = e.target.closest('[data-del]');
    if (del && await confirmBox('Usunąć wpis?', { ok: 'Usuń', danger: true })) return busy(del, async () => { await api('/' + del.dataset.del, { method: 'DELETE' }); await load(); draw(); });
  });
  await load();
  draw();
  if (openNew) add('expense');
}

/* ---------- Raporty PDF ---------- */
async function reports(el) {
  let kind = 'month';
  let offset = -1;
  async function draw() {
    const r = await api(`/v2/reports/data?kind=${kind}&offset=${offset}`);
    el.innerHTML = `
      <div class="row wrap between">
        <div class="row"><div class="seg"><button data-k="week" class="${kind === 'week' ? 'on' : ''}">Tydzień</button><button data-k="month" class="${kind === 'month' ? 'on' : ''}">Miesiąc</button></div><button class="icon-btn" data-o="-1">${icon('left')}</button><b>${esc(r.title)}</b><button class="icon-btn" data-o="1" ${offset >= 0 ? 'disabled' : ''}>${icon('right')}</button></div>
        <div class="row"><a class="btn sm" href="/api/v2/reports/pdf?kind=${kind}&offset=${offset}">${icon('download', 'sm')} Pobierz PDF</a><button class="btn primary sm" data-send>${icon('send', 'sm')} Wyślij e-mailem</button></div>
      </div>
      <div class="grid g4">
        <div class="card kpi hero"><div class="label">Przychód</div><div class="value">${money(r.revenue)}</div></div>
        <div class="card kpi"><div class="label">Koszty</div><div class="value">${money(r.costs)}</div></div>
        <div class="card kpi"><div class="label">Zysk</div><div class="value ${r.profit < 0 ? 'red' : 'accent'}">${money(r.profit)}</div></div>
        <div class="card kpi"><div class="label">Marża</div><div class="value">${r.margin === null ? '—' : r.margin + '%'}</div><div class="hint">${plural(r.counts.completed, 'zlecenie', 'zlecenia', 'zleceń')}</div></div>
      </div>
      <div class="split">
        <div class="card"><div class="card-head"><h3>Przychód wg usług</h3></div>${r.services.map(s => `<div class="hbar"><span class="ellipsis">${esc(s.name)}</span><span class="track"><i style="width:${(s.total / Math.max(...r.services.map(x => x.total), 1)) * 100}%"></i></span><b class="num">${money(s.total)}</b></div>`).join('') || '<p class="muted small">—</p>'}</div>
        <div class="card"><div class="card-head"><h3>Ekipa</h3></div><div class="list">${r.crew.map(c => `<div class="li"><span class="grow">${esc(c.name)}</span><span class="small muted">${plural(c.tasks, 'zlecenie', 'zlecenia', 'zleceń')}${c.hours ? ` · ${c.hours} h` : ''}</span></div>`).join('') || '<p class="muted small">—</p>'}</div></div>
      </div>
      <div class="card"><div class="card-head"><h3>Automatyczna wysyłka</h3><button class="btn ghost sm" data-go-set>Ustawienia ${icon('right', 'sm')}</button></div><p class="small muted">Raport tygodniowy przychodzi w poniedziałek o 7:00, miesięczny 1. dnia miesiąca (także do księgowej). Odbiorców i włączanie zmienisz w Ustawieniach → Raporty.</p></div>`;
  }
  el.addEventListener('click', async e => {
    const k = e.target.closest('[data-k]');
    if (k) { kind = k.dataset.k; offset = -1; return draw(); }
    const o = e.target.closest('[data-o]');
    if (o && !o.disabled) { offset = Math.min(0, offset + Number(o.dataset.o)); return draw(); }
    const s = e.target.closest('[data-send]');
    if (s) return busy(s, async () => { const r = await api('/v2/reports/send', { method: 'POST', body: { kind, offset } }); toast('Wysłano do: ' + r.to.join(', '), 'ok'); });
    if (e.target.closest('[data-go-set]')) go('ustawienia/raporty');
  });
  await draw();
}
