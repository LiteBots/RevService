/* Mój dzień (pracownik) — zmiana z licznikiem, następne zlecenie z mapą, sprzęt przed wyjazdem, plan dnia na osi czasu */
import { S, api, esc, icon, tile, serviceTile, fmtTime, fmtDayLong, go, toast, busy, emptyState, reloadData, taskPlace, plural, minutesLabel, addDays, dayKey, relDay, pad, avatar, confirmBox } from '../core.js';
import { osmMap } from '../charts.js';

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

  let tick = null;
  const clock = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return [`${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}`, `:${pad(s % 60)}`]; };

  function draw() {
    const nt = next ? full(next._id) : null;
    const before = (nt?.checklist || []).filter(i => i.phase === 'before');
    const entry = time?.entry;
    const state = entry?.state || 'off';
    const [hm, ss] = clock((entry?.minutes || 0) * 60000);
    const mates = nt ? (nt.workers || []).filter(w => String(w.employee) !== String(S.me.selfId)) : [];
    el.innerHTML = `
      <div class="card shift-card">
        <div class="row"><span class="status-chip ${state === 'working' ? 'on' : state === 'paused' ? 'pause' : ''}">${state === 'working' ? '● Na zmianie' : state === 'paused' ? '❚❚ Przerwa' : 'Poza pracą'}${S.me.gpsConsent && state !== 'off' ? ' · GPS' : ''}</span><span class="grow"></span>${entry?.startedAt ? `<span class="small muted">od ${fmtTime(entry.startedAt)}</span>` : ''}</div>
        <div class="big-timer mono" style="text-align:left;margin-top:10px" data-timer>${hm}<span class="muted" style="font-size:26px">${ss}</span></div>
        <div class="row" style="margin-top:12px;gap:10px">${state === 'off'
          ? `<button class="btn primary lg" style="flex:1" data-ev="start">${icon('play')} Zaczynam pracę</button>`
          : `${state === 'working' ? `<button class="btn" style="flex:1" data-ev="pause">${icon('pause')} Przerwa</button>` : `<button class="btn primary" style="flex:1" data-ev="resume">${icon('play')} Wracam</button>`}<button class="btn danger" style="flex:1" data-ev="stop">Zakończ dzień</button>`}</div>
      </div>

      ${forMe.map(s => `<div class="card warn"><div class="card-head">${tile('swap', 'cyan', 'sm')}<h3>${esc(s.fromName)} prosi, żebyś przejął zlecenie</h3></div><p class="small muted" style="margin:-6px 0 10px">${esc(s.taskName)} · ${relDay(s.taskDate)} ${fmtTime(s.taskDate)}${s.reason ? ` · „${esc(s.reason)}”` : ''}</p><div class="row"><button class="btn primary sm" data-peer="${s._id}|1">Zgadzam się</button><button class="btn sm" data-peer="${s._id}|0">Nie mogę</button></div></div>`).join('')}

      ${next ? `<div class="card pad-0">
        ${next.geo?.lat ? `<div style="position:relative">${osmMap([{ lat: next.geo.lat, lon: next.geo.lon, label: '1', color: 'orange' }], { w: 640, h: 160, maxZoom: 14 })}${route.km ? `<span class="pill" style="position:absolute;left:12px;top:12px;z-index:4;background:rgba(10,12,15,.85);color:#eef2f1">${icon('nav', 'sm')} ${route.km} km dziś</span>` : ''}</div>` : ''}
        <div style="padding:16px" class="col">
          <div class="row">${serviceTile(nt.type || next.type, 'lg')}<div class="grow"><div class="small muted">${next.status === 'progress' ? 'W trakcie' : 'Następne'} · ${fmtTime(next.dateStart)}</div><b style="font-size:16px">${esc(next.name)}</b><div class="small muted ellipsis">${esc(taskPlace(next) || '')}</div></div></div>
          ${next.clientName || mates.length ? `<div class="row small muted" style="gap:8px">${next.clientName ? `${icon('user', 'sm')} ${esc(next.clientName)}` : ''}${mates.length ? `<span class="avatars" style="margin-left:auto">${mates.map(w => avatar(w.name, null, 'sm')).join('')}</span>` : ''}</div>` : ''}
          <div class="row" style="gap:8px"><a class="btn primary" style="flex:1.4" href="${esc(next.navUrl)}" target="_blank" rel="noopener">${icon('nav')} Nawiguj</a>${next.clientPhone ? `<a class="icon-btn" href="tel:${esc(next.clientPhone)}" aria-label="Zadzwoń">${icon('phone')}</a>` : ''}<button class="btn" style="flex:1" data-go="zlecenia/${next._id}">Szczegóły</button></div>
        </div>
      </div>
      ${before.length ? `<div class="card"><div class="card-head">${tile('box', 'amber', 'sm')}<h3>Sprzęt przed wyjazdem</h3><span class="small accent">${before.filter(i => i.done).length}/${before.length}</span></div><div class="list">${before.map(i => `<label class="li" style="cursor:pointer"><input type="checkbox" data-check="${nt._id}|${i._id}" ${i.done ? 'checked' : ''} style="width:22px;height:22px;accent-color:var(--accent)"><span class="${i.done ? 'muted' : ''}">${esc(i.text)}</span></label>`).join('')}</div></div>` : ''}
      ${next.status === 'planned' ? `<button class="btn primary lg block" data-begin="${next._id}">${icon('play')} Rozpocznij zlecenie</button>` : `<button class="btn primary lg block" data-go="zlecenia/${next._id}?zakoncz=1">${icon('check')} Zakończ zlecenie</button>`}
      ` : `<div class="card">${emptyState(tasks.length ? 'Wszystko zrobione na dziś 🎉' : 'Dziś bez zleceń', tasks.length ? 'Dobra robota!' : 'Sprawdź grafik na kolejne dni.', 'check')}</div>`}

      ${tasks.length > 1 ? `<div class="card"><div class="card-head">${tile('route', 'cyan', 'sm')}<h3>Plan dnia</h3>${route.km ? `<span class="small muted">${route.km} km · ${minutesLabel(route.minutes)} jazdy</span>` : ''}</div>
        <div class="tl-pro">${tasks.map(t => `<div class="it ${t.status === 'completed' ? 'done' : String(t._id) === String(route.next) ? 'now' : ''}" data-go="zlecenia/${t._id}"><span class="mono small muted">${fmtTime(t.dateStart)}</span><b class="small grow ellipsis ${t.status === 'completed' ? 'muted' : ''}">${esc(t.name)}</b><span class="small ${String(t._id) === String(route.next) ? 'b' : 'muted'}" style="${String(t._id) === String(route.next) ? 'color:#ff9a4d' : ''}">${t.status === 'completed' ? 'zrobione ✓' : String(t._id) === String(route.next) ? 'teraz' : esc(String(taskPlace(t) || '').split(',').pop().trim())}</span></div>`).join('')}</div></div>` : ''}

      ${tomorrow.length ? `<div class="card"><div class="card-head">${tile('calendar', 'violet', 'sm')}<h3>Jutro</h3></div><div class="list">${tomorrow.map(t => `<div class="li click" data-go="zlecenia/${t._id}"><span class="time mono">${fmtTime(t.dateStart)}</span>${serviceTile(t.type, 'sm')}<div class="grow"><div class="li-title ellipsis">${esc(t.name)}</div><div class="li-sub ellipsis">${esc(taskPlace(t))}</div></div></div>`).join('')}</div></div>` : ''}`;

    clearInterval(tick);
    if (state === 'working') {
      const base = Date.now() - (entry.minutes || 0) * 60000;
      tick = setInterval(() => { const t = el.querySelector('[data-timer]'); if (!t) return clearInterval(tick); const [a, b] = clock(Date.now() - base); t.innerHTML = `${a}<span class="muted" style="font-size:26px">${b}</span>`; }, 1000);
    }
  }

  el.addEventListener('click', async e => {
    const ev = e.target.closest('[data-ev]');
    if (ev) {
      if (ev.dataset.ev === 'stop' && !(await confirmBox('Zakończyć dzień pracy? Czas pracy zostanie zapisany.', { ok: 'Zakończ dzień' }))) return;
      return busy(ev, async () => {
        const czas = await import('./czas.js');
        const pos = await czas.position().catch(() => null);
        const r = await api('/v2/time/event', { method: 'POST', body: { type: ev.dataset.ev, ...(pos || {}) } });
        time.entry = r.entry;
        toast({ start: 'Miłej pracy! Czas liczy się od teraz', pause: 'Przerwa — odpocznij', resume: 'Wracamy do pracy', stop: `Koniec pracy · ${minutesLabel(r.entry.minutes)}` }[ev.dataset.ev], 'ok');
        if (ev.dataset.ev === 'stop') czas.stopGeo?.(); else czas.autoGeo?.();
        draw();
      });
    }
    const g = e.target.closest('[data-go]');
    if (g && !e.target.closest('a')) return go(g.dataset.go);
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
  return () => clearInterval(tick);
}
