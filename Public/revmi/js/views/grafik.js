/* Grafik ekip — osoby × dni, przeciąganie zleceń, urlopy, dyspozycyjność, konflikty, prośby o zamianę zmian */
import { S, api, esc, icon, fmtTime, dayKey, addDays, startOfWeek, go, toast, busy, avatar, money, reloadData, emptyState, fmtDay, plural, taskAmount, modal, fieldHtml, readForm } from '../core.js';

export default async function grafik(el, { ctx, query }) {
  let from = startOfWeek(query.od ? new Date(query.od) : new Date());
  let branch = '';
  let data;
  let avail = [];
  let swaps = [];

  async function load() {
    const q = `from=${dayKey(from)}&days=7${branch ? '&branch=' + branch : ''}`;
    [data, avail, swaps] = await Promise.all([
      api('/v92/dispatch?' + q),
      api(`/v2/availability?from=${dayKey(from)}&to=${dayKey(addDays(from, 7))}`).then(r => r.availability).catch(() => []),
      api('/v2/swaps').then(r => r.swaps.filter(s => s.status === 'pending')).catch(() => [])
    ]);
  }

  const days = () => Array.from({ length: 7 }, (_, i) => addDays(from, i));
  const conflictIds = () => new Set((data.conflicts || []).flatMap(c => c.tasks || []));

  function cellTasks(empId, day) {
    const k = dayKey(day);
    return data.tasks.filter(t => dayKey(t.dateStart) === k && (empId ? (t.workers || []).some(w => String(w.employee) === empId) : !(t.workers || []).length)).sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));
  }
  const leaveOf = (empId, day) => data.leaves.find(l => String(l.employee) === empId && new Date(l.from) <= day && new Date(l.to) >= new Date(dayKey(day) + 'T00:00:00'));
  const availOf = (empId, day) => avail.find(a => String(a.employee) === empId && a.day === dayKey(day));
  const job = (t, conflicts) => `<div class="job ${t.status === 'completed' ? 'done' : t.status === 'quoted' ? 'violet' : t.status === 'planned' ? 'blue' : ''}" draggable="true" data-task="${t._id}" style="${conflicts.has(String(t._id)) ? 'box-shadow:inset 0 0 0 1px var(--red)' : ''}">${fmtTime(t.dateStart)} ${esc(t.name)}<small>${esc(t.address || t.clientName || '')}${taskAmount(t) ? ' · ' + money(taskAmount(t)) : ''}</small></div>`;

  function draw() {
    const ds = days();
    const today = dayKey(new Date());
    const conflicts = conflictIds();
    const hours = id => Math.round(data.tasks.filter(t => (t.workers || []).some(w => String(w.employee) === id)).reduce((s, t) => s + (t.dateEnd ? (new Date(t.dateEnd) - new Date(t.dateStart)) / 3600000 : 4), 0));
    const unassigned = ds.some(d => cellTasks(null, d).length);
    ctx.setTitle('Grafik', `${fmtDay(ds[0])} – ${fmtDay(ds[6])} · ${plural(data.tasks.length, 'zlecenie', 'zlecenia', 'zleceń')}${data.conflicts?.length ? ` · ${data.conflicts.length} konflikt(y)` : ''}`);
    el.innerHTML = `
      <div class="row wrap between">
        <div class="row"><button class="icon-btn" data-week="-1">${icon('left')}</button><button class="btn sm" data-week="0">Ten tydzień</button><button class="icon-btn" data-week="1">${icon('right')}</button></div>
        <div class="row wrap">
          ${S.data.branches?.length ? `<select class="input sm" data-branch style="width:auto"><option value="">Wszystkie oddziały</option><option value="none" ${branch === 'none' ? 'selected' : ''}>Ekipa główna</option>${S.data.branches.map(b => `<option value="${b._id}" ${branch === String(b._id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
          <span class="legend hide-m"><span><i style="background:var(--blue)"></i>zaplanowane</span><span><i></i>w toku</span><span><i style="background:var(--violet)"></i>wycenione</span></span>
        </div>
      </div>
      ${swaps.length ? `<div class="card warn"><div class="card-head"><h3>${icon('swap', 'sm')} Prośby o zamianę zmiany</h3></div><div class="list">${swaps.map(s => `<div class="li"><div class="grow"><div class="b">${esc(s.fromName)} ${s.toName ? `⇄ ${esc(s.toName)}` : ''} · ${esc(s.taskName)}</div><div class="li-sub">${fmtDay(s.taskDate)} ${fmtTime(s.taskDate)}${s.reason ? ` · „${esc(s.reason)}”` : ''}${s.to ? ` · ${s.peerStatus === 'accepted' ? '<span class="accent">kolega się zgodził</span>' : s.peerStatus === 'declined' ? '<span class="red">kolega odmówił</span>' : 'czeka na kolegę'}` : ' · bez zastępcy'}</div></div><button class="btn primary sm" data-swap-ok="${s._id}">Zatwierdź</button><button class="btn ghost sm" data-swap-no="${s._id}">Odrzuć</button></div>`).join('')}</div></div>` : ''}
      <div class="card" style="overflow-x:auto;padding:12px">
        <div class="sched" style="grid-template-columns:150px repeat(7,minmax(108px,1fr))">
          <div></div>${ds.map(d => `<div class="hd ${dayKey(d) === today ? 'today' : ''}">${d.toLocaleDateString('pl-PL', { weekday: 'short' }).toUpperCase()}<b>${d.getDate()}</b></div>`).join('')}
          ${data.employees.map(e => `<div class="who">${avatar(e.name, e.color, 'sm')}<div class="ellipsis">${esc(e.name.split(' ')[0])} ${esc((e.name.split(' ')[1] || '').slice(0, 1))}.<small>${hours(String(e._id))} h w tygodniu</small></div></div>${ds.map(d => {
            const leave = leaveOf(String(e._id), d);
            const av = availOf(String(e._id), d);
            const list = cellTasks(String(e._id), d);
            const cls = leave ? 'leave' : av?.status === 'unavailable' ? 'unav' : '';
            return `<div class="cell ${cls}" data-cell="${e._id}|${dayKey(d)}" title="${av?.note ? esc(av.note) : ''}">${leave ? `<span class="tag-leave">${leave.status === 'pending' ? 'urlop?' : 'urlop'}</span>` : ''}${av?.status === 'unavailable' && !leave ? '<span class="tag-leave red">niedostępny</span>' : av?.status === 'partial' ? `<span class="tiny amber b">${esc(av.note || 'częściowo')}</span>` : ''}${list.map(t => job(t, conflicts)).join('')}<button class="add" data-add="${e._id}|${dayKey(d)}">+ zlecenie</button></div>`;
          }).join('')}`).join('')}
          ${unassigned ? `<div class="who"><span class="avatar sm" style="background:var(--amber)">!</span><div>Bez ekipy<small>do przypisania</small></div></div>${ds.map(d => `<div class="cell" data-cell="|${dayKey(d)}">${cellTasks(null, d).map(t => job(t, conflicts)).join('')}</div>`).join('')}` : ''}
        </div>
      </div>
      ${data.unscheduled?.length ? `<div class="card"><div class="card-head"><h3>Do zaplanowania</h3><span class="small muted">Przeciągnij na osobę i dzień</span></div><div class="row wrap">${data.unscheduled.map(t => `<div class="job violet" draggable="true" data-task="${t._id}" style="max-width:240px">${esc(t.name)}<small>${esc(t.clientName || '')}${t.clientPreferredDate ? ' · ' + esc(t.clientPreferredDate) : ''}</small></div>`).join('')}</div></div>` : ''}
      ${!data.employees.length ? `<div class="card">${emptyState('Brak pracowników', 'Dodaj ekipę w zakładce Zespół.', 'users')}</div>` : ''}`;
  }

  let drag = null;
  el.addEventListener('dragstart', e => {
    const j = e.target.closest('[data-task]');
    if (!j) return;
    const cell = j.closest('[data-cell]');
    drag = { task: j.dataset.task, fromEmp: cell ? cell.dataset.cell.split('|')[0] : null };
    e.dataTransfer.effectAllowed = 'move';
  });
  el.addEventListener('dragover', e => { const c = e.target.closest('[data-cell]'); if (c && drag) { e.preventDefault(); el.querySelectorAll('.cell.drop').forEach(x => x.classList.remove('drop')); c.classList.add('drop'); } });
  el.addEventListener('dragend', () => el.querySelectorAll('.cell.drop').forEach(x => x.classList.remove('drop')));
  el.addEventListener('drop', async e => {
    const c = e.target.closest('[data-cell]');
    if (!c || !drag) return;
    e.preventDefault();
    const [emp, date] = c.dataset.cell.split('|');
    const t = data.tasks.find(x => String(x._id) === drag.task) || data.unscheduled.find(x => String(x._id) === drag.task);
    const current = (t?.workers || []).map(w => String(w.employee)).filter(Boolean);
    let ids = current.filter(id => id !== drag.fromEmp);
    if (emp && !ids.includes(emp)) ids.push(emp);
    if (!emp) ids = [];
    const body = { taskId: drag.task, date, employeeIds: ids, plan: true };
    drag = null;
    try {
      const r = await api('/v92/dispatch/move', { method: 'POST', body });
      toast(r.conflicts?.length ? 'Przeniesiono — uwaga: konflikt w grafiku' : 'Przeniesiono w grafiku', r.conflicts?.length ? 'err' : 'ok');
      await load(); draw();
      reloadData().catch(() => null);
    } catch (error) { toast(error.message, 'err'); }
  });

  el.addEventListener('click', async e => {
    const w = e.target.closest('[data-week]');
    if (w) { from = w.dataset.week === '0' ? startOfWeek(new Date()) : addDays(from, 7 * Number(w.dataset.week)); await load(); return draw(); }
    const add = e.target.closest('[data-add]');
    if (add) {
      const [emp, date] = add.dataset.add.split('|');
      const d = new Date(date + 'T08:00:00');
      const m = await import('../taskform.js');
      const saved = await m.openTaskForm(undefined, { dateStart: d, workers: emp ? [{ employee: emp }] : [] });
      if (saved) { await load(); draw(); }
      return;
    }
    const job = e.target.closest('[data-task]');
    if (job && !e.target.closest('[data-add]')) return go('zlecenia/' + job.dataset.task);
    const ok = e.target.closest('[data-swap-ok]');
    const no = e.target.closest('[data-swap-no]');
    if (ok || no) {
      const s = swaps.find(x => String(x._id) === (ok || no).dataset[ok ? 'swapOk' : 'swapNo']);
      if (ok && !s.to) {
        return modal({
          title: 'Kto przejmie zlecenie?',
          body: fieldHtml({ name: 'to', label: 'Pracownik', type: 'select', options: S.data.employees.filter(x => String(x._id) !== String(s.from)).map(x => [x._id, x.name]) }),
          foot: '<button class="btn ghost" data-close>Anuluj</button><button class="btn primary" data-go>Zatwierdź</button>',
          onMount: (m, close) => m.querySelector('[data-go]').addEventListener('click', ev => busy(ev.currentTarget, async () => { await api(`/v2/swaps/${s._id}/decide`, { method: 'POST', body: { approve: true, to: readForm(m).to } }); close(); toast('Zamiana zatwierdzona', 'ok'); await load(); draw(); S.hooks.refreshBadges?.(); }))
        });
      }
      await busy(ok || no, async () => {
        await api(`/v2/swaps/${s._id}/decide`, { method: 'POST', body: { approve: Boolean(ok) } });
        toast(ok ? 'Zamiana zatwierdzona' : 'Zamiana odrzucona', 'ok');
        await load(); draw(); S.hooks.refreshBadges?.();
      });
    }
  });
  el.addEventListener('change', async e => { if (e.target.matches('[data-branch]')) { branch = e.target.value; await load(); draw(); } });

  await load();
  draw();
}
