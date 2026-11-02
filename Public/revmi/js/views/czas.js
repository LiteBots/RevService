/* Czas pracy (pracownik) — start / przerwa / koniec z pozycją GPS, automatyczny przyjazd na miejsce zlecenia */
import { S, api, esc, icon, fmtTime, toast, busy, minutesLabel, hhmmss, dayKey, addDays, startOfWeek } from '../core.js';

/** Jednorazowa pozycja (gdy jest zgoda i przeglądarka pozwala). */
export function position({ timeout = 8000 } = {}) {
  return new Promise(resolve => {
    if (!S.me?.gpsConsent || !S.me?.gpsEnabled || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout, maximumAge: 30_000 }
    );
  });
}

const dist = (a, b) => {
  const R = 6371000; const r = x => (x * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};

/* Automatyczny przyjazd / wyjazd (geofence) — działa, gdy aplikacja jest otwarta i trwa praca. */
let watchId = null;
let geoState = { tasks: [], inside: new Set(), lastSent: 0, radius: 150 };
export async function autoGeo() {
  if (watchId !== null || !navigator.geolocation) return;
  const t = await api('/v2/time/me').catch(() => null);
  if (!t || !t.gpsConsent || !t.gpsEnabled || !t.entry || t.entry.state === 'off') return;
  geoState.tasks = t.tasks.filter(x => x.geo);
  geoState.radius = t.geofenceMeters || 150;
  for (const ev of t.entry.events || []) if (ev.type === 'arrive' && ev.task) geoState.inside.add(String(ev.task));
  if (!geoState.tasks.length) return;
  watchId = navigator.geolocation.watchPosition(async p => {
    if (Date.now() - geoState.lastSent < 45_000) return;
    const pos = { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy };
    for (const task of geoState.tasks) {
      const d = dist(pos, task.geo);
      const id = String(task._id);
      if (d <= geoState.radius + Math.min(pos.accuracy || 0, 100) && !geoState.inside.has(id)) {
        geoState.inside.add(id); geoState.lastSent = Date.now();
        await api('/v2/time/event', { method: 'POST', body: { type: 'arrive', task: id, auto: true, ...pos } }).catch(() => null);
        toast(`📍 Na miejscu: ${task.name}`, 'ok');
      } else if (d > geoState.radius * 3 && geoState.inside.has(id)) {
        geoState.inside.delete(id); geoState.lastSent = Date.now();
        await api('/v2/time/event', { method: 'POST', body: { type: 'leave', task: id, auto: true, ...pos } }).catch(() => null);
      }
    }
  }, () => null, { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 });
}
export function stopGeo() { if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; } }

/** Kafelek mapy OpenStreetMap z pinezką (bez zewnętrznych skryptów). */
function mapTile(lat, lon, zoom = 16) {
  const n = 2 ** zoom;
  const x = ((lon + 180) / 360) * n;
  const latRad = (lat * Math.PI) / 180;
  const y = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const tx = Math.floor(x); const ty = Math.floor(y);
  const tiles = [];
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) tiles.push(`<img src="https://a.tile.openstreetmap.org/${zoom}/${tx + dx}/${ty + dy}.png" alt="" style="position:absolute;width:256px;height:256px;left:${(dx + 1) * 256}px;top:${(dy + 1) * 256}px">`);
  const px = 256 + (x - tx) * 256; const py = 256 + (y - ty) * 256;
  return `<div class="map-box"><div style="position:absolute;left:50%;top:50%;width:768px;height:768px;transform:translate(${-px}px,${-py}px)">${tiles.join('')}</div>
    <div style="position:absolute;left:50%;top:50%;width:18px;height:18px;margin:-9px;border-radius:50%;background:var(--accent);box-shadow:0 0 0 7px rgba(3,240,186,.3)"></div>
    <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}" target="_blank" rel="noopener" class="tiny" style="position:absolute;right:6px;bottom:4px;background:rgba(0,0,0,.6);color:#fff;padding:1px 6px;border-radius:6px">© OpenStreetMap</a></div>`;
}

export default async function czas(el, { ctx }) {
  ctx.setTitle('Czas pracy', 'Liczy się sam — start, przerwy i koniec');
  let d = await api('/v2/time/me');
  let tick = null;
  const labels = { start: 'Start pracy', pause: 'Przerwa', resume: 'Powrót z przerwy', stop: 'Koniec pracy', arrive: 'Przyjazd', leave: 'Wyjazd' };

  function draw() {
    const e = d.entry;
    const state = e?.state || 'off';
    const lastPos = [...(e?.events || [])].reverse().find(x => Number.isFinite(x.lat));
    const ws = startOfWeek(new Date());
    const week = Array.from({ length: 7 }, (_, i) => { const k = dayKey(addDays(ws, i)); return { k, m: d.week.find(w => w.day === k)?.minutes || 0, label: addDays(ws, i).toLocaleDateString('pl-PL', { weekday: 'short' }) }; });
    const maxM = Math.max(480, ...week.map(w => w.m));
    el.innerHTML = `
      ${d.gpsEnabled && !d.gpsConsent ? `<div class="card warn"><b>${icon('pin', 'sm')} Włącz lokalizację w czasie pracy</b><p class="small muted" style="margin:6px 0 10px">Przyjazd i wyjazd z miejsca zlecenia zapiszą się same. Pozycja jest zapisywana tylko przy rozpoczęciu, przerwie i końcu pracy oraz przy dojeździe na zlecenie — nigdy po godzinach.</p><button class="btn primary sm" data-consent>Zgadzam się</button></div>` : ''}
      ${lastPos ? mapTile(lastPos.lat, lastPos.lon) : ''}
      <div class="card ${state === 'working' ? 'hero' : ''}" style="text-align:center">
        <span class="status-chip ${state === 'working' ? 'on' : state === 'paused' ? 'pause' : ''}">${state === 'working' ? '● W pracy' : state === 'paused' ? '❚❚ Przerwa' : 'Poza pracą'}</span>
        <div class="big-timer" data-timer style="margin:10px 0 2px">${hhmmss((e?.minutes || 0) * 60000)}</div>
        <div class="small muted">${e?.startedAt ? `od ${fmtTime(e.startedAt)}${e.breakMinutes ? ` · przerwy ${minutesLabel(e.breakMinutes)}` : ''}` : 'Kliknij „Zaczynam pracę”, gdy ruszasz'}</div>
        <div class="row" style="margin-top:16px;gap:8px">
          ${state === 'off' ? `<button class="btn primary lg block" data-ev="start">${icon('play')} Zaczynam pracę</button>` : ''}
          ${state === 'working' ? `<button class="btn lg" style="flex:1" data-ev="pause">${icon('pause')} Przerwa</button><button class="btn primary lg" style="flex:1.4" data-ev="stop">${icon('stop')} Kończę pracę</button>` : ''}
          ${state === 'paused' ? `<button class="btn primary lg" style="flex:1.4" data-ev="resume">${icon('play')} Wracam</button><button class="btn lg" style="flex:1" data-ev="stop">${icon('stop')} Koniec</button>` : ''}
        </div>
      </div>
      ${state !== 'off' && d.tasks.length ? `<div class="card"><div class="card-head"><h3>Dzisiejsze zlecenia</h3><span class="small muted">przyjazd zapisze się sam${d.gpsConsent ? '' : ' (po włączeniu lokalizacji)'}</span></div><div class="list">${d.tasks.map(t => {
        const arrived = (e?.events || []).find(x => x.type === 'arrive' && String(x.task) === String(t._id));
        return `<div class="li"><span class="time">${fmtTime(t.dateStart)}</span><div class="grow"><div class="li-title ellipsis">${esc(t.name)}</div><div class="li-sub ellipsis">${esc(t.place)}</div></div>${arrived ? `<span class="pill mint">📍 ${fmtTime(arrived.at)}</span>` : `<button class="btn sm" data-arrive="${t._id}">Jestem na miejscu</button>`}</div>`;
      }).join('')}</div></div>` : ''}
      <div class="card"><div class="card-head"><h3>Dziś</h3></div>
        <div class="timeline">${(e?.events || []).map(x => `<div class="tl"><i style="background:${x.type === 'stop' ? 'var(--muted-2)' : x.type === 'pause' ? 'var(--amber)' : 'var(--accent)'}"></i><div class="grow"><b>${fmtTime(x.at)}</b> ${labels[x.type]}${x.taskName ? ` · ${esc(x.taskName)}` : ''} ${x.auto ? '<span class="muted small">· automatycznie</span>' : ''}${Number.isFinite(x.lat) ? ' <span class="muted small">· GPS</span>' : ''}</div></div>`).join('') || '<p class="muted small">Brak wpisów.</p>'}</div>
      </div>
      <div class="card"><div class="card-head"><h3>Ten tydzień</h3><span class="pill mint">${minutesLabel(d.weekMinutes)}</span></div>
        <div class="bars" style="height:120px">${week.map(w => `<div class="bar ${w.k === dayKey(new Date()) ? 'now' : ''}"><b style="height:${Math.max(2, (w.m / maxM) * 100)}%;${w.m ? '' : 'opacity:.25'}"></b><span>${w.label}</span></div>`).join('')}</div>
      </div>`;
    clearInterval(tick);
    if (state === 'working') {
      const base = Date.now() - (e.minutes || 0) * 60000;
      tick = setInterval(() => { const t = el.querySelector('[data-timer]'); if (t) t.textContent = hhmmss(Date.now() - base); }, 1000);
    }
  }

  el.addEventListener('click', async ev => {
    const b = ev.target.closest('[data-ev]');
    if (b) return busy(b, async () => {
      const pos = await position();
      const r = await api('/v2/time/event', { method: 'POST', body: { type: b.dataset.ev, ...(pos || {}) } });
      d = await api('/v2/time/me');
      d.entry = r.entry;
      toast({ start: 'Miłej pracy!', pause: 'Przerwa — odpocznij', resume: 'Wracamy do pracy', stop: `Koniec pracy · ${minutesLabel(r.entry.minutes)}` }[b.dataset.ev], 'ok');
      if (b.dataset.ev === 'stop') stopGeo(); else autoGeo();
      draw();
    });
    const a = ev.target.closest('[data-arrive]');
    if (a) return busy(a, async () => { const pos = await position(); await api('/v2/time/event', { method: 'POST', body: { type: 'arrive', task: a.dataset.arrive, ...(pos || {}) } }); d = await api('/v2/time/me'); draw(); });
    const c = ev.target.closest('[data-consent]');
    if (c) return busy(c, async () => {
      await api('/v2/me/gps-consent', { method: 'POST', body: { consent: true } });
      S.me.gpsConsent = true;
      await position({ timeout: 15000 });
      d = await api('/v2/time/me');
      toast('Lokalizacja w czasie pracy włączona', 'ok');
      draw();
    });
  });

  draw();
  return () => clearInterval(tick);
}
