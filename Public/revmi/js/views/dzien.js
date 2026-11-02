/* Mój dzień (pracownik) — następne zlecenie na górze, nawigacja, sprzęt przed wyjazdem, start / koniec jednym kciukiem */
import { S, api, esc, icon, fmtTime, fmtDayLong, go, toast, busy, emptyState, reloadData, taskPlace, plural, minutesLabel, addDays, dayKey, relDay, statusPill } from '../core.js';

export default async function dzien(el, { ctx }) {
  const first = String(S.me.name || '').split(' ')[0];
  ctx.setTitle('Mój dzień', fmtDayLong(new Date()));

  const [route, time, swaps] = await Promise.all([
    api('/v92/my-route'),
    api('/v2/time/me').catch(() => null),
    api('/v2/swaps').catch(() => ({ swaps: [] }))
  ]);
  await reloadData().catch(() => null);
  const tasks = route.tasks || [];
  const next = tasks.find(t => String(t._id) === String(route.next)) || null;
  const full = id => S.data.tasks.find(t => String(t._id) === String(id)) || {};
  const tomorrow = (S.data.tasks || []).filter(t => dayKey(t.dateStart) === dayKey(addDays(new Date(), 1)) && (t.workers || []).some(w => String(w.employee) === String(S.me.selfId))).sort((a, b) => new Date(a.dateStart) - new Date(b.dateStart));
  const forMe = (swaps.swaps || []).filter(s => String(s.to) === String(S.me.selfId) && s.peerStatus === 'pending' && s.status === 'pending');
  ctx.setTitle(`Cześć, ${first}`, `${fmtDayLong(new Date())} · ${plural(tasks.length, 'zlecenie', 'zlecenia', 'zleceń')}`);

  function draw() {
    const nt = next ? full(next._id) : null;
    const before = (nt?.checklist || []).filter(i => i.phase === 'before');
    const state = time?.entry?.state || 'off';
    el.innerHTML = `
      <div class="card row between click" data-go="czas">
        <div class="row"><span class="status-chip ${state === 'working' ? 'on' : state === 'paused' ? 'pause' : ''}">${state === 'working' ? '● W pracy' : state === 'paused' ? '❚❚ Przerwa' : 'Poza pracą'}</span>
        <span class="small muted">${state === 'off' ? 'Rozpocznij dzień, żeby liczyć czas' : `od ${fmtTime(time.entry.startedAt)} · ${minutesLabel(time.entry.minutes)}`}</span></div>
        ${state === 'off' ? `<button class="btn primary sm" data-start-day>${icon('play', 'sm')} Zaczynam pracę</button>` : icon('right')}
      </div>

      ${forMe.map(s => `<div class="card warn"><b>⇄ ${esc(s.fromName)} prosi, żebyś przejął zlecenie</b><p class="small muted" style="margin:4px 0 10px">${esc(s.taskName)} · ${relDay(s.taskDate)} ${fmtTime(s.taskDate)}${s.reason ? ` · „${esc(s.reason)}”` : ''}</p><div class="row"><button class="btn primary sm" data-peer="${s._id}|1">Zgadzam się</button><button class="btn sm" data-peer="${s._id}|0">Nie mogę</button></div></div>`).join('')}

      ${next ? `<div class="next-card">
        <div class="eyebrow">${next.status === 'progress' ? 'W TRAKCIE' : 'NASTĘPNE'} · ${fmtTime(next.dateStart)}</div>
        <h2>${esc(next.name)}</h2>
        <div class="meta">${esc(taskPlace(next) || '')}</div>
        <div class="meta">${esc([next.clientName, (nt.workers || []).filter(w => String(w.employee) !== String(S.me.selfId)).map(w => 'z ' + w.name.split(' ')[0]).join(', '), nt.car].filter(Boolean).join(' · '))}</div>
        <div class="acts"><a class="btn dark" href="${esc(next.navUrl)}" target="_blank" rel="noopener">${icon('nav', 'sm')} Nawiguj</a>${next.clientPhone ? `<a class="btn" href="tel:${esc(next.clientPhone)}">${icon('phone', 'sm')} Zadzwoń</a>` : ''}<button class="btn" data-go="zlecenia/${next._id}">Szczegóły</button></div>
      </div>
      ${before.length ? `<div class="card"><div class="card-head"><h3>Sprzęt przed wyjazdem</h3><span class="small accent">${before.filter(i => i.done).length}/${before.length}</span></div><div class="list">${before.map(i => `<label class="li" style="cursor:pointer"><input type="checkbox" data-check="${nt._id}|${i._id}" ${i.done ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)"><span class="${i.done ? 'muted' : ''}">${esc(i.text)}</span></label>`).join('')}</div></div>` : ''}
      ${next.status === 'planned' ? `<button class="btn primary lg block" data-begin="${next._id}">${icon('play')} Rozpocznij zlecenie</button>` : `<button class="btn primary lg block" data-go="zlecenia/${next._id}?zakoncz=1">${icon('check')} Zakończ zlecenie</button>`}
      ` : `<div class="card">${emptyState(tasks.length ? 'Wszystko zrobione na dziś 🎉' : 'Dziś bez zleceń', tasks.length ? 'Dobra robota!' : 'Sprawdź grafik na kolejne dni.', 'check')}</div>`}

      ${tasks.length > 1 ? `<div class="card"><div class="card-head"><h3>Plan dnia</h3>${route.km ? `<span class="small muted">${route.km} km · ok. ${minutesLabel(route.minutes)} jazdy</span>` : ''}</div><div class="list">${tasks.map(t => `<div class="li click" data-go="zlecenia/${t._id}"><span class="time">${fmtTime(t.dateStart)}</span><div class="grow"><div class="li-title ellipsis ${t.status === 'completed' ? 'muted' : ''}">${esc(t.name)}</div><div class="li-sub ellipsis">${esc(taskPlace(t))}</div></div>${statusPill(t.status)}</div>`).join('')}</div></div>` : ''}

      ${tomorrow.length ? `<div class="card"><div class="card-head"><h3>Jutro</h3></div><div class="list">${tomorrow.map(t => `<div class="li click" data-go="zlecenia/${t._id}"><span class="time">${fmtTime(t.dateStart)}</span><div class="grow"><div class="li-title ellipsis">${esc(t.name)}</div><div class="li-sub ellipsis">${esc(taskPlace(t))}</div></div></div>`).join('')}</div></div>` : ''}`;
  }

  el.addEventListener('click', async e => {
    const g = e.target.closest('[data-go]');
    if (g && !e.target.closest('button[data-start-day]')) return go(g.dataset.go);
    const sd = e.target.closest('[data-start-day]');
    if (sd) {
      e.stopPropagation();
      return busy(sd, async () => {
        const pos = await import('./czas.js').then(m => m.position()).catch(() => null);
        const r = await api('/v2/time/event', { method: 'POST', body: { type: 'start', ...(pos || {}) } });
        time.entry = r.entry;
        toast('Miłej pracy! Czas pracy liczy się od teraz', 'ok');
        draw();
      });
    }
    const b = e.target.closest('[data-begin]');
    if (b) return busy(b, async () => { await api(`/tasks/${b.dataset.begin}/status`, { method: 'PATCH', body: { status: 'progress' } }); toast('Zlecenie rozpoczęte', 'ok'); go('zlecenia/' + b.dataset.begin); });
    const p = e.target.closest('[data-peer]');
    if (p) { const [id, ok] = p.dataset.peer.split('|'); return busy(p, async () => { await api(`/v2/swaps/${id}/peer`, { method: 'POST', body: { accept: ok === '1' } }); toast(ok === '1' ? 'Dzięki! Biuro zatwierdzi zamianę' : 'Odmówiono', 'ok'); p.closest('.card').remove(); }); }
  });
  el.addEventListener('change', async e => {
    const c = e.target.closest('[data-check]');
    if (!c) return;
    const [task, item] = c.dataset.check.split('|');
    try { await api(`/tasks/${task}/checklist/${item}`, { method: 'PATCH', body: { done: c.checked } }); await reloadData(); draw(); } catch (error) { toast(error.message, 'err'); c.checked = !c.checked; }
  });

  draw();
}
