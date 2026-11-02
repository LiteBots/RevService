/* Zlecenia — lista dzień po dniu, tablica (przeciąganie między etapami) i kalendarz miesiąca */
import { S, api, esc, money, icon, fmtTime, fmtDayLong, relDay, go, statusPill, emptyState, reloadData, toast, local, isOffice, can, taskAmount, taskPlace, workersAvatars, startOfDay, addDays, dayKey, STATUS, PAY, plural } from '../core.js';

export default async function zlecenia(el, { params, query, ctx }) {
  if (params[0]) return (await import('./zlecenie.js')).default(el, { id: params[0], ctx, query });

  let mode = query.widok || local.get('tasksMode', 'lista');
  let filter = { q: '', status: query.status || 'active', branch: '', period: query.okres || 'all', month: startOfDay(new Date()) };
  const office = isOffice();
  ctx.setTitle('Zlecenia', '', office && can('tasks') ? `<button class="btn primary sm" data-new>${icon('plus', 'sm')} <span class="hide-m">Nowe zlecenie</span></button>` : '');
  document.querySelector('[data-new]')?.addEventListener('click', () => import('../taskform.js').then(m => m.openTaskForm()));
  reloadData().then(() => draw()).catch(() => null);

  el.innerHTML = `
    <div class="row wrap between">
      <div class="seg" data-mode>${[['lista', 'Lista'], ['tablica', 'Tablica'], ['kalendarz', 'Kalendarz']].map(([k, l]) => `<button data-m="${k}" class="${mode === k ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row wrap" style="gap:8px">
        <input class="input sm" data-q placeholder="Szukaj: klient, adres, numer…" style="width:220px">
        <select class="input sm" data-status style="width:auto">
          <option value="active">Aktywne</option><option value="all">Wszystkie</option>
          ${Object.entries(STATUS).filter(([k]) => office || !['new', 'quoted'].includes(k)).map(([k, s]) => `<option value="${k}" ${filter.status === k ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <select class="input sm" data-period style="width:auto">
          <option value="all">Każdy termin</option><option value="dzis">Dziś</option><option value="tydzien" ${filter.period === 'tydzien' ? 'selected' : ''}>Ten tydzień</option><option value="miesiac" ${filter.period === 'miesiac' ? 'selected' : ''}>Ten miesiąc</option><option value="past">Minione</option>
        </select>
        ${S.data.branches?.length > 1 || (S.data.branches?.length && office) ? `<select class="input sm" data-branch style="width:auto"><option value="">Wszystkie oddziały</option><option value="none">Ekipa główna</option>${S.data.branches.map(b => `<option value="${b._id}">${esc(b.name)}</option>`).join('')}</select>` : ''}
      </div>
    </div>
    <div data-body></div>`;

  const body = el.querySelector('[data-body]');

  function filtered() {
    const now = new Date();
    const today = startOfDay(now);
    const weekStart = addDays(today, -((today.getDay() + 6) % 7));
    const q = filter.q.toLowerCase();
    return (S.data.tasks || []).filter(t => {
      if (filter.status === 'active' && !['new', 'quoted', 'planned', 'progress'].includes(t.status)) return false;
      if (!['active', 'all'].includes(filter.status) && t.status !== filter.status) return false;
      if (filter.branch === 'none' && t.branch) return false;
      if (filter.branch && filter.branch !== 'none' && String(t.branch) !== filter.branch) return false;
      const d = new Date(t.dateStart);
      if (filter.period === 'dzis' && startOfDay(d).getTime() !== today.getTime()) return false;
      if (filter.period === 'tydzien' && (d < weekStart || d >= addDays(weekStart, 7))) return false;
      if (filter.period === 'miesiac' && (d.getMonth() !== now.getMonth() || d.getFullYear() !== now.getFullYear())) return false;
      if (filter.period === 'past' && d >= today) return false;
      if (q && ![t.name, t.clientName, t.clientPhone, t.address, t.addressFrom, t.addressTo, t.number, t.type].some(v => String(v || '').toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function drawList(tasks) {
    if (!tasks.length) return `<div class="card">${emptyState('Brak zleceń', 'Zmień filtry albo dodaj nowe zlecenie.', 'list')}</div>`;
    const sorted = [...tasks].sort((a, b) => (filter.period === 'past' ? new Date(b.dateStart) - new Date(a.dateStart) : new Date(a.dateStart) - new Date(b.dateStart)));
    const groups = new Map();
    for (const t of sorted) { const k = dayKey(t.dateStart); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); }
    const total = tasks.filter(t => ['planned', 'progress', 'completed'].includes(t.status)).reduce((s, t) => s + taskAmount(t), 0);
    return `<div class="row between small muted"><span>${plural(tasks.length, 'zlecenie', 'zlecenia', 'zleceń')}</span>${office ? `<span>Razem: <b style="color:var(--text)">${money(total)}</b></span>` : ''}</div>
      ${[...groups].map(([k, list]) => `<div class="card">
        <div class="card-head"><h3 style="text-transform:capitalize">${relDay(k + 'T12:00:00')} · <span class="muted" style="font-weight:600">${fmtDayLong(k + 'T12:00:00')}</span></h3>${office ? `<span class="small muted">${money(list.reduce((s, t) => s + taskAmount(t), 0))}</span>` : ''}</div>
        <div class="list">${list.map(t => `<div class="li click" data-open="${t._id}">
          <span class="time">${fmtTime(t.dateStart)}</span>
          <div class="grow"><div class="row" style="gap:8px"><span class="li-title ellipsis">${esc(t.name)}</span>${t.priority === 'high' ? '<span class="pill red">Pilne</span>' : ''}${t.packageSub ? '<span class="pill violet">Pakiet</span>' : ''}</div>
          <div class="li-sub ellipsis">${esc([t.clientName, taskPlace(t)].filter(Boolean).join(' · '))}</div></div>
          ${workersAvatars(t) || (['planned', 'progress'].includes(t.status) ? '<span class="pill amber hide-m">Brak ekipy</span>' : '')}
          <span class="hide-m">${statusPill(t.status)}</span>
          ${office ? `<b class="num hide-m" style="width:90px;text-align:right">${taskAmount(t) ? money(taskAmount(t)) : '—'}</b>` : ''}
        </div>`).join('')}</div></div>`).join('')}`;
  }

  const COLS = office ? ['quoted', 'planned', 'progress', 'completed'] : ['planned', 'progress', 'completed'];
  function drawBoard(tasks) {
    const recent = addDays(new Date(), -14);
    return `<div class="board" style="grid-template-columns:repeat(${COLS.length},minmax(230px,1fr))">${COLS.map(st => {
      const list = tasks.filter(t => t.status === st && (st !== 'completed' || new Date(t.completedAt || t.dateStart) >= recent)).sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));
      return `<div class="board-col" data-col="${st}"><h3>${STATUS[st].label} <span>${list.length}</span></h3>
        ${list.map(t => `<div class="tcard" draggable="true" data-open="${t._id}" data-id="${t._id}">
          <div class="t">${esc(t.name)}</div>
          <div class="s">${relDay(t.dateStart)} ${fmtTime(t.dateStart)} · ${esc(taskPlace(t) || t.clientName || '')}</div>
          ${t.aiEstimate?.low ? `<div class="ai-box">✦ AI: ${money(t.aiEstimate.low)} – ${money(t.aiEstimate.high)}</div>` : ''}
          <div class="foot">${workersAvatars(t) || (st === 'planned' ? '<span class="pill amber">Brak ekipy</span>' : '<span></span>')}${office ? `<span class="price">${taskAmount(t) ? money(taskAmount(t)) : '—'}</span>` : ''}</div>
          ${st === 'completed' && office ? `<span class="pill ${PAY[t.paymentStatus]?.cls || ''}">${PAY[t.paymentStatus]?.label || ''}</span>` : ''}
        </div>`).join('') || '<div class="muted small" style="text-align:center;padding:14px">—</div>'}
      </div>`;
    }).join('')}</div>`;
  }

  function drawCalendar(tasks) {
    const m = filter.month;
    const first = new Date(m.getFullYear(), m.getMonth(), 1);
    const start = addDays(first, -((first.getDay() + 6) % 7));
    const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
    const byDay = new Map();
    for (const t of tasks) { const k = dayKey(t.dateStart); if (!byDay.has(k)) byDay.set(k, []); byDay.get(k).push(t); }
    const today = dayKey(new Date());
    return `<div class="card">
      <div class="card-head"><button class="icon-btn" data-month="-1">${icon('left')}</button><h3 style="text-transform:capitalize">${m.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' })}</h3><button class="icon-btn" data-month="1">${icon('right')}</button></div>
      <div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:4px">
        ${['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'].map(d => `<div class="tiny muted b" style="text-align:center;padding:4px">${d}</div>`).join('')}
        ${days.map(d => { const k = dayKey(d); const list = (byDay.get(k) || []).sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart)); const other = d.getMonth() !== m.getMonth(); return `<div style="min-height:92px;border-radius:10px;padding:5px;background:${k === today ? 'var(--accent-soft)' : 'var(--bg-2)'};opacity:${other ? 0.45 : 1};display:flex;flex-direction:column;gap:3px;min-width:0">
          <span class="tiny b ${k === today ? 'accent' : 'muted'}">${d.getDate()}</span>
          ${list.slice(0, 3).map(t => `<div class="job ${t.status === 'completed' ? 'done' : t.status === 'quoted' ? 'violet' : t.status === 'planned' ? 'blue' : ''} ellipsis" data-open="${t._id}" style="cursor:pointer">${fmtTime(t.dateStart)} ${esc(t.name)}</div>`).join('')}
          ${list.length > 3 ? `<span class="tiny muted">+${list.length - 3} więcej</span>` : ''}
        </div>`; }).join('')}
      </div></div>`;
  }

  function draw() {
    const tasks = filtered();
    body.innerHTML = mode === 'tablica' ? drawBoard(tasks) : mode === 'kalendarz' ? drawCalendar(filter.status === 'active' ? (S.data.tasks || []).filter(t => t.status !== 'cancelled' && (office || t.status !== 'new')) : tasks) : drawList(tasks);
    const n = tasks.length;
    ctx.setTitle('Zlecenia', `${plural(n, 'zlecenie', 'zlecenia', 'zleceń')} w widoku`, document.getElementById('topActions').innerHTML);
    document.querySelector('[data-new]')?.addEventListener('click', () => import('../taskform.js').then(m => m.openTaskForm()));
  }

  el.addEventListener('click', e => {
    const m = e.target.closest('[data-m]');
    if (m) { mode = m.dataset.m; local.set('tasksMode', mode); el.querySelectorAll('[data-m]').forEach(b => b.classList.toggle('on', b === m)); return draw(); }
    const mon = e.target.closest('[data-month]');
    if (mon) { filter.month = new Date(filter.month.getFullYear(), filter.month.getMonth() + Number(mon.dataset.month), 1); return draw(); }
    const o = e.target.closest('[data-open]');
    if (o) go('zlecenia/' + o.dataset.open);
  });
  el.querySelector('[data-q]').addEventListener('input', e => { filter.q = e.target.value; draw(); });
  el.querySelector('[data-status]').addEventListener('change', e => { filter.status = e.target.value; draw(); });
  el.querySelector('[data-period]').addEventListener('change', e => { filter.period = e.target.value; draw(); });
  el.querySelector('[data-branch]')?.addEventListener('change', e => { filter.branch = e.target.value; draw(); });

  // Tablica: przeciąganie między etapami
  let dragId = null;
  el.addEventListener('dragstart', e => { const c = e.target.closest('.tcard'); if (c) { dragId = c.dataset.id; c.classList.add('dragging'); } });
  el.addEventListener('dragend', e => { e.target.closest('.tcard')?.classList.remove('dragging'); el.querySelectorAll('.board-col').forEach(c => c.classList.remove('drop')); });
  el.addEventListener('dragover', e => { const col = e.target.closest('.board-col'); if (col && dragId) { e.preventDefault(); el.querySelectorAll('.board-col').forEach(c => c.classList.toggle('drop', c === col)); } });
  el.addEventListener('drop', async e => {
    const col = e.target.closest('.board-col');
    if (!col || !dragId) return;
    e.preventDefault();
    const id = dragId;
    dragId = null;
    const status = col.dataset.col;
    const task = S.data.tasks.find(t => String(t._id) === id);
    if (!task || task.status === status) return draw();
    if (status === 'completed') { go(`zlecenia/${id}?zakoncz=1`); return; }
    try {
      await api(`/tasks/${id}/status`, { method: 'PATCH', body: { status } });
      task.status = status;
      toast(`${task.name}: ${STATUS[status].label}`, 'ok');
      draw();
      reloadData().catch(() => null);
    } catch (error) { toast(error.message, 'err'); draw(); }
  });

  draw();
}
