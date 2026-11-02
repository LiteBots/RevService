/* Grafik ekip — osoby × dni, przeciąganie zleceń, urlopy, dyspozycyjność, konflikty, prośby o zamianę zmian */
import { S, api, esc, icon, tile, serviceTile, serviceClass, fmtTime, taskPlace, minutesLabel, fmtDayLong, dayKey, addDays, startOfWeek, go, toast, busy, avatar, money, reloadData, emptyState, fmtDay, plural, taskAmount, modal, fieldHtml, readForm } from '../core.js';

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
  const job = (t, conflicts) => `<div class="job ${serviceClass(t.type)} ${t.status === 'completed' ? 'done' : ''}" draggable="true" data-task="${t._id}" style="${conflicts.has(String(t._id)) ? 'box-shadow:inset 0 0 0 1.5px var(--red)' : ''}"><div class="jt">${serviceTile(t.type, 'xs')}${fmtTime(t.dateStart)}${t.status === 'quoted' ? ' · wycena' : ''}</div>${esc(t.name)}<small>${esc(t.address || t.clientName || '')}${taskAmount(t) ? ' · ' + money(taskAmount(t)) : ''}</small></div>`;

  function draw() {
    const ds = days();
    const today = dayKey(new Date());
    const conflicts = conflictIds();
    const hours = id => Math.round(data.tasks.filter(t => (t.workers || []).some(w => String(w.employee) === id)).reduce((s, t) => s + (t.dateEnd ? (new Date(t.dateEnd) - new Date(t.dateStart)) / 3600000 : 4), 0));
    const unassigned = ds.some(d => cellTasks(null, d).length);
    ctx.setTitle('Grafik', `${fmtDay(ds[0])} – ${fmtDay(ds[6])} · ${plural(data.tasks.length, 'zlecenie', 'zlecenia', 'zleceń')}${data.conflicts?.length ? ` · ${data.conflicts.length} konflikt(y)` : ''}`);
    const weekValue = data.tasks.filter(t => t.status !== 'quoted').reduce((sum, t) => sum + taskAmount(t), 0);
    const onLeave = new Set(data.leaves.map(l => String(l.employee))).size;
    el.innerHTML = `
      <div class="grid g4 kpi-row">
        <div class="card kpi c-violet"><div class="kpi-top">${tile('calendar', 'violet')}<div class="label">Zlecenia w tygodniu</div></div><div class="value">${data.tasks.length}</div></div>
        <div class="card kpi c-mint"><div class="kpi-top">${tile('trend', 'mint')}<div class="label">Wartość tygodnia</div></div><div class="value">${money(weekValue)}</div></div>
        <div class="card kpi c-${data.conflicts?.length ? 'red' : 'teal'}"><div class="kpi-top">${tile(data.conflicts?.length ? 'alert' : 'check', data.conflicts?.length ? 'red' : 'teal')}<div class="label">Konflikty</div></div><div class="value">${data.conflicts?.length || 0}</div></div>
        <div class="card kpi c-amber"><div class="kpi-top">${tile('sun', 'amber')}<div class="label">Urlopy w tygodniu</div></div><div class="value">${onLeave}</div></div>
      </div>
      <div class="row wrap between">
        <div class="row"><button class="icon-btn" data-week="-1">${icon('left')}</button><button class="btn sm" data-week="0">Dziś</button><button class="icon-btn" data-week="1">${icon('right')}</button><b style="font-size:16px;margin-left:6px">${ds[0].getDate()} – ${ds[6].toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</b></div>
        <div class="row wrap">
          ${S.data.branches?.length ? `<select class="input sm" data-branch style="width:auto"><option value="">Wszystkie oddziały</option><option value="none" ${branch === 'none' ? 'selected' : ''}>Ekipa główna</option>${S.data.branches.map(b => `<option value="${b._id}" ${branch === String(b._id) ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select>` : ''}
          <button class="btn" data-route-plan>${icon('route')} Ułóż trasę dnia</button>
        </div>
      </div>
      ${swaps.length ? `<div class="card warn"><div class="card-head"><h3>${icon('swap', 'sm')} Prośby o zamianę zmiany</h3></div><div class="list">${swaps.map(s => `<div class="li"><div class="grow"><div class="b">${esc(s.fromName)} ${s.toName ? `⇄ ${esc(s.toName)}` : ''} · ${esc(s.taskName)}</div><div class="li-sub">${fmtDay(s.taskDate)} ${fmtTime(s.taskDate)}${s.reason ? ` · „${esc(s.reason)}”` : ''}${s.to ? ` · ${s.peerStatus === 'accepted' ? '<span class="accent">kolega się zgodził</span>' : s.peerStatus === 'declined' ? '<span class="red">kolega odmówił</span>' : 'czeka na kolegę'}` : ' · bez zastępcy'}</div></div><button class="btn primary sm" data-swap-ok="${s._id}">Zatwierdź</button><button class="btn ghost sm" data-swap-no="${s._id}">Odrzuć</button></div>`).join('')}</div></div>` : ''}
      <div class="card" style="overflow-x:auto;padding:12px">
        <div class="sched" style="grid-template-columns:150px repeat(7,minmax(108px,1fr))">
          <div></div>${ds.map(d => { const dt = data.tasks.filter(t => dayKey(t.dateStart) === dayKey(d)); return `<div class="hd ${dayKey(d) === today ? 'today' : ''}">${d.toLocaleDateString('pl-PL', { weekday: 'short' }).toUpperCase()}<b>${d.getDate()}</b>${dt.length ? `<span class="tiny">${dt.length} · ${money(dt.reduce((sum, t) => sum + taskAmount(t), 0))}</span>` : '<span class="tiny">—</span>'}</div>`; }).join('')}
          ${data.employees.map(e => `<div class="who">${avatar(e.name, e.color, 'sm')}<div class="ellipsis">${esc(e.name.split(' ')[0])} ${esc((e.name.split(' ')[1] || '').slice(0, 1))}.<small>${hours(String(e._id))} h w tygodniu</small></div></div>${ds.map(d => {
            const leave = leaveOf(String(e._id), d);
            const av = availOf(String(e._id), d);
            const list = cellTasks(String(e._id), d);
            const cls = leave ? 'leave' : av?.status === 'unavailable' ? 'unav' : '';
            return `<div class="cell ${cls} ${dayKey(d) === today ? 'today' : ''}" data-cell="${e._id}|${dayKey(d)}" title="${av?.note ? esc(av.note) : ''}">${leave ? `<span class="tag-leave">${leave.status === 'pending' ? 'urlop?' : 'urlop'}</span>` : ''}${av?.status === 'unavailable' && !leave ? '<span class="tag-leave red">niedostępny</span>' : av?.status === 'partial' ? `<span class="tiny amber b">${esc(av.note || 'częściowo')}</span>` : ''}${list.map(t => job(t, conflicts)).join('')}<button class="add" data-add="${e._id}|${dayKey(d)}">+ zlecenie</button></div>`;
          }).join('')}`).join('')}
          ${unassigned ? `<div class="who"><span class="avatar sm" style="background:var(--amber)">!</span><div>Bez ekipy<small>do przypisania</small></div></div>${ds.map(d => `<div class="cell" data-cell="|${dayKey(d)}">${cellTasks(null, d).map(t => job(t, conflicts)).join('')}</div>`).join('')}` : ''}
        </div>
      </div>
      ${data.unscheduled?.length ? `<div class="card"><div class="card-head"><h3>Do zaplanowania</h3><span class="small muted">Przeciągnij na osobę i dzień</span></div><div class="row wrap">${data.unscheduled.map(t => `<div class="job ${serviceClass(t.type)}" draggable="true" data-task="${t._id}" style="max-width:240px">${esc(t.name)}<small>${esc(t.clientName || '')}${t.clientPreferredDate ? ' · ' + esc(t.clientPreferredDate) : ''}</small></div>`).join('')}</div></div>` : ''}
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
    if (e.target.closest('[data-route-plan]')) return routePlan();
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

  /** Optymalna kolejność objazdu na wybrany dzień (najkrótsza trasa z bazy, z porównaniem do kolejności godzinowej). */
  function routePlan() {
    const ds = days();
    let day = ds.some(d => dayKey(d) === dayKey(new Date())) ? dayKey(new Date()) : dayKey(ds[0]);
    const close = modal({
      title: 'Ułóż trasę dnia', wide: true,
      body: `<div class="seg">${ds.map(d => `<button data-d="${dayKey(d)}" class="${dayKey(d) === day ? 'on' : ''}">${d.toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric' })}</button>`).join('')}</div><div data-r><div class="skeleton"></div></div>`,
      onMount: m => {
        const show = async () => {
          const box = m.querySelector('[data-r]');
          box.innerHTML = '<div class="skeleton"></div>';
          try {
            const r = await api('/v92/route?day=' + day);
            const byId = new Map(r.tasks.map(t => [String(t._id), t]));
            const ordered = r.order.map(id => byId.get(id)).filter(Boolean);
            const saved = r.plannedKm && r.km ? Math.round((r.plannedKm - r.km) * 10) / 10 : 0;
            box.innerHTML = ordered.length ? `
              <div class="grid g3" style="margin:14px 0">
                <div class="card kpi c-cyan"><div class="label">Trasa po ułożeniu</div><div class="value">${r.km} km</div></div>
                <div class="card kpi c-violet"><div class="label">Czas jazdy</div><div class="value">${minutesLabel(r.minutes)}</div></div>
                <div class="card kpi c-mint"><div class="label">Oszczędność</div><div class="value">${saved > 0 ? saved + ' km' : '—'}</div><div class="hint">vs kolejność godzinowa (${r.plannedKm} km)</div></div>
              </div>
              <div class="tl-pro">${ordered.map((t, i) => `<div class="it ${t.status === 'completed' ? 'done' : ''}" data-open="${t._id}"><b class="mono" style="width:22px">${i + 1}.</b>${serviceTile(t.type || t.division, 'sm')}<div class="grow"><b>${esc(t.name)}</b><div class="li-sub">${fmtTime(t.dateStart)} · ${esc(taskPlace(t))}</div></div>${t.navUrl ? `<a class="icon-btn" href="${esc(t.navUrl)}" target="_blank" rel="noopener" aria-label="Nawiguj">${icon('nav')}</a>` : ''}</div>`).join('')}</div>
              ${r.missing.length ? `<p class="small amber" style="margin-top:12px">${plural(r.missing.length, 'zlecenie', 'zlecenia', 'zleceń')} bez rozpoznanego adresu — nie ma ich w trasie.</p>` : ''}
              <p class="tiny muted" style="margin-top:10px">Start z bazy firmy (${esc(r.base.name || 'Słupsk')}). Kolejność liczona po odległości; godziny zleceń się nie zmieniają.</p>`
              : emptyState('Brak zleceń z adresem tego dnia', 'Dodaj adresy do zleceń, a ułożę najkrótszą trasę.', 'route');
          } catch (error) { box.innerHTML = emptyState('Nie udało się ułożyć trasy', error.message, 'alert'); }
        };
        m.addEventListener('click', e => {
          const b = e.target.closest('[data-d]');
          if (b) { day = b.dataset.d; m.querySelectorAll('[data-d]').forEach(x => x.classList.toggle('on', x === b)); return show(); }
          const o = e.target.closest('[data-open]');
          if (o && !e.target.closest('a')) { close(); go('zlecenia/' + o.dataset.open); }
        });
        show();
      }
    });
  }

  await load();
  draw();
}
