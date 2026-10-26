/* RevMi 9.2 — praca w terenie i biuro:
   grafik ekip (przeciąganie), mapa dnia z trasą, „moja trasa” z nawigacją do następnego, start zlecenia = stoper,
   „Jedziemy” + pozycja ekipy dla klienta, urlopy, należności z przypomnieniami, automatyzacje, asystent RevBot,
   koszty floty, czas pracy, bezpieczeństwo (2FA), integracje (R2, Google, Claude), dziennik zmian. */
'use strict';

(function () {
  const RM = window.RM;
  const { esc, $, $$ } = RM;
  const S = RM.state;
  const views = RM.views;
  const ui = (S.ui.v11 = S.ui.v11 || { gFrom: '', gDays: 7, mapDay: '', mapEmp: '', recvBucket: '', astTab: 'ask', astHistory: [], fleetTab: 'cars', auditActor: '' });
  S.v92 = S.v92 || { leavesPending: 0 };
  const isoDay = d => { const x = new Date(d); return new Date(x.getTime() - x.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  const day = v => (v ? RM.fmt.date.format(new Date(v)) : '—');
  const when = v => (v ? RM.fmt.full.format(new Date(v)) : '—');
  const hm = v => (v ? RM.fmt.time.format(new Date(v)) : '');
  const h1 = v => String(Math.round((Number(v) || 0) * 100) / 100).replace('.', ',');
  const kpi = (label, value, sub = '', tone = '') => `<div class="card kpi" ${tone ? `style="--tone:var(--${tone})"` : ''}><div class="kpi-label">${esc(label)}</div><div class="kpi-value">${value}</div>${sub ? `<div class="kpi-sub">${sub}</div>` : ''}</div>`;
  const seg = (items, active, attr) => `<div class="segmented">${items.map(([k, l, n]) => `<button type="button" class="${active === k ? 'active' : ''}" data-${attr}="${esc(k)}">${esc(l)}${n ? `<span class="n">${n}</span>` : ''}</button>`).join('')}</div>`;
  const head = (title, sub, actions = '') => `<div class="page-head"><div><h1>${esc(title)}</h1>${sub ? `<p>${sub}</p>` : ''}</div>${actions ? `<div class="btn-row">${actions}</div>` : ''}</div>`;
  const emptyBox = (icon, title, text) => `<div class="empty"><i class="fa-solid ${icon}"></i><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
  const plural = (n, a, b, c) => (n === 1 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14) ? b : c);

  if (!document.getElementById('v11css')) {
    const st = document.createElement('style');
    st.id = 'v11css';
    st.textContent = `
      .offline-queue{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom));z-index:60;border:0;border-radius:99px;padding:9px 16px;background:#f59e0b;color:#1a1204;font-weight:800;font-size:13px;box-shadow:0 8px 24px rgba(0,0,0,.35);display:flex;gap:8px;align-items:center}
      .offline-queue[hidden]{display:none}
      .toast.queued{border-color:rgba(245,158,11,.5)}.toast.queued i{color:#f59e0b}
      .login-card.totp .pin-dots span{width:14px;height:14px}
      .fld{border:1px solid var(--line);border-radius:14px;padding:12px;display:grid;gap:10px;background:var(--surface)}
      .fld-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
      .fld-timer{font:800 26px/1 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.5px;color:var(--text)}
      .fld-timer.run{color:var(--accent)}
      .fld-dot{width:9px;height:9px;border-radius:50%;background:var(--muted);display:inline-block}
      .fld-dot.on{background:var(--accent);box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 25%,transparent);animation:fldp 1.6s infinite}
      @keyframes fldp{50%{box-shadow:0 0 0 8px transparent}}
      .gb-wrap{overflow:auto;border:1px solid var(--line);border-radius:14px;background:var(--surface);max-height:calc(100vh - 240px)}
      .gb{display:grid;min-width:max-content}
      .gb > div{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:6px;min-height:64px}
      .gb .gh{position:sticky;top:0;z-index:2;background:var(--surface-2,#17191d);min-height:auto;font-size:12px;font-weight:800;text-align:center;padding:8px 6px}
      .gb .gh.today{color:var(--accent)}
      .gb .gp{position:sticky;left:0;z-index:1;background:var(--surface-2,#17191d);display:flex;gap:8px;align-items:center;font-size:13px;font-weight:700;width:170px}
      .gb .gp small{display:block;font-weight:500;color:var(--muted);font-size:11px}
      .gb .gc{width:150px;display:flex;flex-direction:column;gap:4px;transition:background .15s}
      .gb .gc.over{background:color-mix(in srgb,var(--accent) 14%,transparent)}
      .gb .gc.leave{background:repeating-linear-gradient(135deg,transparent 0 8px,rgba(245,158,11,.10) 8px 16px)}
      .gb .gc .lv{font-size:10.5px;color:#f59e0b;font-weight:800;text-transform:uppercase}
      .gchip{display:block;text-align:left;border:1px solid var(--line-2);border-left:3px solid var(--accent);background:var(--bg,#0d0e11);color:var(--text);border-radius:9px;padding:5px 7px;font-size:11.5px;line-height:1.3;cursor:grab;width:100%}
      .gchip b{display:block;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .gchip.conf{border-color:#f87171;border-left-color:#f87171;background:rgba(248,113,113,.08)}
      .gchip.st-progress{border-left-color:#60a5fa}.gchip.st-quoted{border-left-color:#f59e0b}.gchip.st-completed{opacity:.55}
      .gchip.dragging{opacity:.4}
      .gb-side{display:grid;gap:6px;max-height:calc(100vh - 240px);overflow:auto}
      .gb-layout{display:grid;grid-template-columns:1fr 240px;gap:14px}
      @media(max-width:1100px){.gb-layout{grid-template-columns:1fr}.gb-side{max-height:none}}
      .map-layout{display:grid;grid-template-columns:1fr 360px;gap:14px}
      @media(max-width:1000px){.map-layout{grid-template-columns:1fr}}
      .map-box{height:calc(100vh - 230px);min-height:380px;border-radius:14px;overflow:hidden;border:1px solid var(--line);background:#0b1220}
      .stop{display:grid;grid-template-columns:30px 1fr auto;gap:10px;align-items:center;padding:10px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
      .stop .n{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:var(--accent);color:#04110d;font-weight:900;font-size:13px}
      .stop.done{opacity:.55}.stop.done .n{background:var(--muted)}
      .stop.next{border-color:var(--accent);box-shadow:0 0 0 2px color-mix(in srgb,var(--accent) 30%,transparent)}
      .mk{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;background:#03f0ba;color:#04121c;font-weight:900;border:2px solid #04121c;font-size:13px}
      .mk.base{background:#fff}.mk.crew{background:#60a5fa;color:#fff}
      .big-nav{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;padding:16px;border-radius:16px;background:var(--accent);color:#04110d;font-weight:900;font-size:17px;text-decoration:none}
      .rv-table{width:100%;border-collapse:collapse;font-size:13.5px}
      .rv-table th{text-align:left;font-size:11.5px;color:var(--muted);font-weight:700;padding:8px;border-bottom:1px solid var(--line)}
      .rv-table td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top}
      .rv-table td.num,.rv-table th.num{text-align:right;white-space:nowrap}
      .ast-chat{display:flex;flex-direction:column;gap:10px;min-height:200px;max-height:calc(100vh - 360px);overflow:auto;padding:4px}
      .ast-m{max-width:88%;padding:10px 13px;border-radius:14px;white-space:pre-wrap;line-height:1.5;font-size:14px}
      .ast-m.u{align-self:flex-end;background:var(--accent);color:#04110d;border-bottom-right-radius:4px}
      .ast-m.a{align-self:flex-start;background:var(--surface-3,#23262c);border-bottom-left-radius:4px}
      .ast-sug{display:flex;gap:6px;flex-wrap:wrap}
      .ast-sug button{border:1px solid var(--line-2);background:var(--surface);color:var(--text);border-radius:99px;padding:6px 11px;font-size:12.5px}
      .rem{display:flex;gap:8px;align-items:center;font-size:12.5px;padding:4px 0}
      .rem i{width:14px}.rem.danger{color:#f87171}.rem.warn{color:#f59e0b}.rem.info{color:var(--muted)}
      .int-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}
      .int-card{display:grid;gap:10px;align-content:start}
      .int-card h3{display:flex;gap:10px;align-items:center;margin:0;font-size:15px}
      .ok-dot{width:10px;height:10px;border-radius:50%;background:#f87171;display:inline-block}.ok-dot.on{background:var(--accent)}
      .qr-box{background:#fff;padding:12px;border-radius:12px;display:inline-block}
      .code-in{font:800 24px/1 ui-monospace,monospace;letter-spacing:6px;text-align:center;width:180px;height:50px;border-radius:12px;border:1px solid var(--line-2);background:var(--bg,#0d0e11);color:var(--text)}
      .lv-row{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}
      .pill{font-size:11px;font-weight:800;border-radius:99px;padding:3px 8px;background:var(--surface-3,#23262c)}
      .pill.ok{background:rgba(3,240,186,.15);color:var(--accent)}.pill.no{background:rgba(248,113,113,.15);color:#f87171}.pill.wait{background:rgba(245,158,11,.15);color:#f59e0b}`;
    document.head.appendChild(st);
  }

  /* ================================================================== */
  /* Leaflet (mapy) — ładowane tylko przy wejściu na mapę                */
  /* ================================================================== */
  RM.leaflet = () => {
    if (window.L) return Promise.resolve(window.L);
    return new Promise((resolve, reject) => {
      const css = document.createElement('link');
      css.rel = 'stylesheet';
      css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(css);
      const js = document.createElement('script');
      js.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
      js.onload = () => resolve(window.L);
      js.onerror = () => reject(new Error('Nie udało się wczytać mapy (brak internetu?)'));
      document.head.appendChild(js);
    });
  };
  const tiles = L => L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
  const numIcon = (L, n, cls = '') => L.divIcon({ className: '', html: `<div class="mk ${cls}">${n}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });

  /* ================================================================== */
  /* Zlecenie: start = stoper, „Jedziemy”, udostępnianie pozycji         */
  /* ================================================================== */
  const workedMs = log => (log || []).reduce((s, x) => { const a = new Date(x.start).getTime(); const b = x.end ? new Date(x.end).getTime() : Date.now(); return s + (b > a ? b - a : 0); }, 0);
  const running = log => (log || []).some(x => x.start && !x.end);
  const clock = ms => { const s = Math.floor(ms / 1000); return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; };

  /* Pozycja ekipy: wysyłana co ~60 s, gdy zlecenie jest „w drodze” lub w realizacji i aplikacja jest otwarta. */
  const share = (RM.share = RM.share || { task: null, watch: null, last: 0 });
  RM.shareLocation = (taskId, on = true) => {
    if (!navigator.geolocation) return false;
    if (share.watch != null) { navigator.geolocation.clearWatch(share.watch); share.watch = null; }
    share.task = on ? taskId : null;
    try { if (on) localStorage.setItem('rm.share', taskId); else localStorage.removeItem('rm.share'); } catch { /* ignore */ }
    if (!on) return true;
    share.watch = navigator.geolocation.watchPosition(p => {
      if (Date.now() - share.last < 55_000) return;
      share.last = Date.now();
      RM.api(`/api/tasks/${share.task}/location`, { method: 'POST', body: { lat: p.coords.latitude, lon: p.coords.longitude, accuracy: p.coords.accuracy } })
        .then(r => { if (r.ignored) RM.shareLocation(null, false); }).catch(() => null);
    }, () => null, { enableHighAccuracy: false, maximumAge: 30_000, timeout: 20_000 });
    return true;
  };
  document.addEventListener('DOMContentLoaded', () => { try { const id = localStorage.getItem('rm.share'); if (id) setTimeout(() => RM.state.me && RM.shareLocation(id, true), 3000); } catch { /* ignore */ } });

  const here = () => new Promise(resolve => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(p => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }), () => resolve(null), { timeout: 8000, maximumAge: 60_000 });
  });
  const etaFrom = (a, b) => {
    if (!a || !b || !Number.isFinite(b.lat)) return null;
    const R = 6371; const r = x => (x * Math.PI) / 180;
    const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lon - a.lon) / 2) ** 2;
    return Math.max(3, Math.round(((2 * R * Math.asin(Math.sqrt(h)) * 1.3) / 45) * 60));
  };

  let timerTick = null;
  RM.fieldSection = (t, canWork) => {
    if (!['planned', 'progress', 'completed'].includes(t.status)) return '';
    const log = t.workLog || [];
    if (t.status === 'completed' && !log.length) return '';
    const run = running(log);
    const sharing = share.task === RM.id(t);
    const enRoute = t.onTheWayAt && Date.now() - new Date(t.onTheWayAt).getTime() < 12 * 3600_000;
    return `<div class="section"><div class="fld">
      <div class="fld-row" style="justify-content:space-between">
        <div><small class="muted">Czas pracy${t.startedAt ? ` · start ${esc(hm(t.startedAt))}${t.startedBy ? ' (' + esc(t.startedBy) + ')' : ''}` : ''}</small>
          <div class="fld-row"><span class="fld-dot ${run ? 'on' : ''}"></span><span class="fld-timer ${run ? 'run' : ''}" data-timer>${clock(workedMs(log))}</span>${log.length > 1 ? `<span class="muted small">${log.length} odcinki</span>` : ''}</div></div>
        ${canWork && t.status === 'progress' ? `<button class="btn ${run ? '' : 'primary'}" data-timer-act="${run ? 'pause' : 'resume'}"><i class="fa-solid ${run ? 'fa-pause' : 'fa-play'}"></i> ${run ? 'Przerwa' : 'Wznów'}</button>` : ''}
      </div>
      ${t.status === 'planned' && !log.length ? '<p class="muted small" style="margin:0"><i class="fa-solid fa-circle-info"></i> „Rozpocznij” uruchamia stoper — przy zakończeniu godziny wpiszą się same.</p>' : ''}
      ${canWork && ['planned', 'progress'].includes(t.status) ? `<div class="fld-row">
        ${t.status === 'planned' ? `<button class="btn ${enRoute ? '' : 'primary'}" data-onway><i class="fa-solid fa-truck-fast"></i> ${enRoute ? 'W drodze · wyślij ponownie' : 'Jedziemy — powiadom klienta'}</button>` : ''}
        <button class="btn sm" data-share><i class="fa-solid fa-location-crosshairs"></i> ${sharing ? 'Wyłącz udostępnianie pozycji' : 'Udostępniaj pozycję klientowi'}</button>
      </div>${sharing ? '<p class="muted small" style="margin:0"><span class="fld-dot on"></span> Klient widzi ekipę na mapie w panelu (dokładność ok. 50 m), dopóki zlecenie trwa.</p>' : ''}` : ''}
    </div></div>`;
  };

  RM.bindField = (drawer, t, onUpdate) => {
    clearInterval(timerTick);
    const tEl = $('[data-timer]', drawer);
    if (tEl && running(t.workLog)) timerTick = setInterval(() => { if (!document.body.contains(tEl)) return clearInterval(timerTick); tEl.textContent = clock(workedMs(t.workLog)); }, 1000);
    $('[data-timer-act]', drawer)?.addEventListener('click', async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const r = await RM.api(`/api/tasks/${RM.id(t)}/timer`, { method: 'POST', body: { action: b.dataset.timerAct }, label: 'Stoper' });
        onUpdate({ ...t, workLog: r.workLog });
      } catch (err) { RM.fail(err); b.disabled = false; }
    });
    $('[data-onway]', drawer)?.addEventListener('click', async e => {
      const b = e.currentTarget;
      b.disabled = true;
      try {
        const pos = await here();
        const eta = etaFrom(pos, t.geo);
        const r = await RM.api(`/api/tasks/${RM.id(t)}/on-the-way`, { method: 'POST', body: { etaMinutes: eta }, label: 'Jedziemy' });
        if (pos) RM.api(`/api/tasks/${RM.id(t)}/location`, { method: 'POST', body: pos }).catch(() => null);
        RM.shareLocation(RM.id(t), true);
        RM.toast(eta ? `Klient powiadomiony — przyjazd ok. ${eta} min` : 'Klient powiadomiony, że jedziecie');
        onUpdate({ ...t, onTheWayAt: r.onTheWayAt, etaAt: r.etaAt });
      } catch (err) { RM.fail(err); b.disabled = false; }
    });
    $('[data-share]', drawer)?.addEventListener('click', () => {
      const on = share.task !== RM.id(t);
      if (!RM.shareLocation(RM.id(t), on)) return RM.toast('Ten telefon nie udostępnia lokalizacji', 'error');
      RM.toast(on ? 'Udostępniam pozycję (co minutę)' : 'Wyłączono udostępnianie');
      onUpdate({ ...t });
    });
  };

  // Rozpoczęcie zlecenia od razu włącza udostępnianie pozycji, zakończenie — wyłącza.
  // (app-main.js ładuje się po tym pliku — opakowujemy po wczytaniu wszystkich skryptów)
  document.addEventListener('DOMContentLoaded', () => {
    const origSetStatus = RM.setStatus;
    if (!origSetStatus || origSetStatus.v11) return;
    RM.setStatus = async (task, status) => {
      const u = await origSetStatus(task, status);
      if (u && status === 'progress' && S.settings?.liveLocationEnabled !== false) RM.shareLocation(RM.id(u), true);
      if (u && ['completed', 'cancelled'].includes(status) && share.task === RM.id(u)) RM.shareLocation(null, false);
      return u;
    };
    RM.setStatus.v11 = true;
  });

  /* ================================================================== */
  /* GRAFIK EKIP (dispatch board)                                        */
  /* ================================================================== */
  views.grafik = {
    title: 'Grafik ekip',
    admin: true,
    async render(el) {
      if (!el.querySelector('.v11-gb')) el.innerHTML = '<div class="skeleton"></div>';
      const from = ui.gFrom || isoDay(RM.startOfDay(new Date()));
      const days = ui.gDays;
      const d = await RM.api(`/api/v92/dispatch?from=${from}&days=${days}`);
      const dates = Array.from({ length: days }, (_, i) => isoDay(addDays(new Date(from + 'T12:00:00'), i)));
      const conflictTasks = new Set(d.conflicts.flatMap(c => c.tasks));
      const rows = [...d.employees.map(e => ({ id: RM.id(e), name: e.name, sub: e.role, color: e.color })), { id: '', name: 'Bez przypisania', sub: 'przeciągnij na osobę' }];
      const inCell = (row, date) => d.tasks.filter(t => isoDay(t.dateStart) === date && (row.id ? (t.workers || []).some(w => String(w.employee) === row.id) : !(t.workers || []).some(w => w.employee)));
      const leaveOf = (row, date) => row.id && d.leaves.find(l => String(l.employee) === row.id && isoDay(l.from) <= date && isoDay(l.to) >= date);
      const chip = t => `<button type="button" class="gchip st-${esc(t.status)} ${conflictTasks.has(RM.id(t)) ? 'conf' : ''}" draggable="true" data-gtask="${esc(RM.id(t))}" title="${esc(t.name)} · ${esc(RM.place(t))}"><b>${esc(hm(t.dateStart))} ${esc(t.name)}</b>${esc(t.clientName || '')}${t.car ? ` · <i class="fa-solid fa-truck"></i> ${esc(String(t.car).split(' (')[0])}` : ''}</button>`;
      const today = isoDay(new Date());
      const cols = `170px repeat(${days}, 150px)`;
      el.innerHTML = `<div class="v11-gb">
        ${head('Grafik ekip', 'Przeciągnij zlecenie na inny dzień lub osobę. Czerwone = konflikt (ta sama osoba/bus w dwóch miejscach albo urlop).',
          `<button class="btn" data-gnav="-7"><i class="fa-solid fa-chevron-left"></i></button><button class="btn" data-gnav="0">Dziś</button><button class="btn" data-gnav="7"><i class="fa-solid fa-chevron-right"></i></button>${seg([['7', 'Tydzień'], ['14', '2 tyg.']], String(days), 'gdays')}`)}
        ${d.conflicts.length ? `<div class="card" style="padding:12px 14px;margin-bottom:12px;border-color:rgba(248,113,113,.45)"><b style="color:#f87171"><i class="fa-solid fa-triangle-exclamation"></i> Konflikty: ${d.conflicts.length}</b><div class="small" style="margin-top:6px;display:grid;gap:3px">${d.conflicts.slice(0, 8).map(c => {
          const tt = c.tasks.map(id => d.tasks.find(x => RM.id(x) === id)).filter(Boolean);
          return `<span>${c.kind === 'leave' ? `<i class="fa-solid fa-umbrella-beach"></i> ${esc(c.name)} ma urlop` : c.kind === 'vehicle' ? '<i class="fa-solid fa-truck"></i> Ten sam pojazd' : `<i class="fa-solid fa-user"></i> ${esc(c.name)} w dwóch miejscach`}: ${tt.map(x => `<a href="#/zlecenia/${esc(RM.id(x))}">${esc(x.number)} ${esc(hm(x.dateStart))}</a>`).join(', ')}</span>`;
        }).join('')}</div></div>` : ''}
        <div class="gb-layout">
          <div class="gb-wrap"><div class="gb" style="grid-template-columns:${cols}">
            <div class="gh gp" style="z-index:3">Osoba</div>${dates.map(x => `<div class="gh ${x === today ? 'today' : ''}">${esc(new Date(x + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'numeric' }))}</div>`).join('')}
            ${rows.map(r => `<div class="gp"><span class="avatar sm" style="${r.color ? `color:${esc(r.color)}` : ''}">${esc(RM.initials(r.name))}</span><span>${esc(r.name)}<small>${esc(r.sub || '')}</small></span></div>${dates.map(x => {
              const lv = leaveOf(r, x);
              return `<div class="gc ${lv ? 'leave' : ''}" data-drop="${esc(r.id)}|${x}">${lv ? `<span class="lv">${esc({ vacation: 'Urlop', sick: 'L4', unavailable: 'Niedostępny', other: 'Nieobecny' }[lv.kind] || 'Urlop')}${lv.status === 'pending' ? ' (wniosek)' : ''}</span>` : ''}${inCell(r, x).map(chip).join('')}</div>`;
            }).join('')}`).join('')}
          </div></div>
          <aside><h3 style="margin:0 0 8px;font-size:14px">Do zaplanowania (${d.unscheduled.length})</h3><div class="gb-side">${d.unscheduled.map(t => `<button type="button" class="gchip st-${esc(t.status)}" draggable="true" data-gtask="${esc(RM.id(t))}" data-plan="1"><b>${esc(t.name)}</b>${esc(t.clientName || '')}${t.clientPreferredDate ? `<br><span class="muted">klient: ${esc(t.clientPreferredDate)}</span>` : ''}</button>`).join('') || '<p class="muted small">Wszystko zaplanowane.</p>'}</div></aside>
        </div></div>`;
      const rerender = () => views.grafik.render(el);
      $$('[data-gnav]', el).forEach(b => b.addEventListener('click', () => { const n = Number(b.dataset.gnav); ui.gFrom = n ? isoDay(addDays(new Date(from + 'T12:00:00'), n)) : ''; rerender(); }));
      $$('[data-gdays]', el).forEach(b => b.addEventListener('click', () => { ui.gDays = Number(b.dataset.gdays); rerender(); }));

      let drag = null;
      $$('[data-gtask]', el).forEach(c => {
        c.addEventListener('dragstart', e => { const cell = c.closest('[data-drop]'); drag = { id: c.dataset.gtask, from: cell ? cell.dataset.drop.split('|')[0] : null, plan: Boolean(c.dataset.plan) }; c.classList.add('dragging'); e.dataTransfer.setData('text/plain', c.dataset.gtask); e.dataTransfer.effectAllowed = 'move'; });
        c.addEventListener('dragend', () => c.classList.remove('dragging'));
        c.addEventListener('click', () => { if (!drag) moveForm(c.dataset.gtask, Boolean(c.dataset.plan), d, rerender); });
      });
      $$('[data-drop]', el).forEach(cell => {
        cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('over'); });
        cell.addEventListener('dragleave', () => cell.classList.remove('over'));
        cell.addEventListener('drop', async e => {
          e.preventDefault();
          cell.classList.remove('over');
          if (!drag) return;
          const [emp, date] = cell.dataset.drop.split('|');
          const task = d.tasks.find(x => RM.id(x) === drag.id) || d.unscheduled.find(x => RM.id(x) === drag.id);
          const body = { taskId: drag.id, date, plan: drag.plan };
          if (emp && emp !== drag.from) {
            const ids = (task?.workers || []).map(w => String(w.employee)).filter(Boolean).filter(id => id !== drag.from);
            body.employeeIds = [...new Set([...ids, emp])];
          }
          if (drag.plan && !task?.dateStart) body.time = '08:00';
          drag = null;
          try {
            const r = await RM.api('/api/v92/dispatch/move', { method: 'POST', body });
            RM.upsertTask(r.task);
            RM.toast(r.conflicts.length ? 'Przeniesiono — uwaga: konflikt w grafiku' : 'Przeniesiono', r.conflicts.length ? 'error' : 'ok');
            rerender();
          } catch (err) { RM.fail(err); }
          setTimeout(() => { drag = null; }, 0);
        });
      });
    }
  };

  /** Przeniesienie bez przeciągania (telefon): dzień, godzina, ekipa, pojazd. */
  function moveForm(id, plan, d, done) {
    const t = d.tasks.find(x => RM.id(x) === id) || d.unscheduled.find(x => RM.id(x) === id);
    if (!t) return;
    const dt = t.dateStart ? new Date(t.dateStart) : new Date();
    RM.form({
      title: plan ? 'Zaplanuj zlecenie' : 'Przenieś w grafiku', subtitle: `${t.number || ''} · ${t.name}`,
      values: { date: isoDay(dt), time: `${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`, employeeIds: (t.workers || []).map(w => String(w.employee)).filter(Boolean), vehicle: t.vehicle ? String(t.vehicle) : '' },
      fields: [
        { name: 'date', label: 'Dzień', type: 'date', required: true },
        { name: 'time', label: 'Godzina', type: 'time', required: true },
        { name: 'employeeIds', label: 'Ekipa', type: 'picks', full: true, options: d.employees.map(e => ({ value: RM.id(e), label: e.name, avatar: true, color: e.color })) },
        { name: 'vehicle', label: 'Pojazd', type: 'select', full: true, options: [['', '— bez pojazdu —'], ...d.fleet.map(v => [RM.id(v), `${v.name} (${v.plates})`])] }
      ],
      submitLabel: plan ? 'Zaplanuj' : 'Zapisz',
      danger: { label: 'Otwórz zlecenie', confirm: 'Otworzyć szczegóły zlecenia?', action: async () => RM.openTask(id) },
      async onSubmit(v) {
        const r = await RM.api('/api/v92/dispatch/move', { method: 'POST', body: { taskId: id, date: v.date, time: v.time, employeeIds: v.employeeIds, vehicle: v.vehicle, plan } });
        RM.upsertTask(r.task);
        if (r.conflicts.length) RM.toast('Zapisano — uwaga: konflikt w grafiku', 'error'); else RM.toast('Zapisano');
        done();
      }
    });
  }

  /* ================================================================== */
  /* MAPA DNIA (biuro) i MOJA TRASA (ekipa)                              */
  /* ================================================================== */
  let mapObj = null;
  views.mapa = {
    title: 'Mapa dnia',
    admin: true,
    async render(el) {
      const dayStr = ui.mapDay || isoDay(new Date());
      el.innerHTML = `${head('Mapa dnia', 'Zlecenia na mapie w najkrótszej kolejności objazdu (start i powrót do bazy). Niebieskie punkty — ekipy na żywo.',
        `<input type="date" id="mapDay" value="${dayStr}" class="btn" style="height:38px"><select id="mapEmp" class="btn" style="height:38px"><option value="">Wszystkie osoby</option>${S.employees.map(e => `<option value="${esc(RM.id(e))}" ${ui.mapEmp === RM.id(e) ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select>`)}
        <div class="map-layout"><div class="map-box" id="dayMap"></div><div id="mapList"><div class="skeleton"></div></div></div>`;
      $('#mapDay', el).addEventListener('change', e => { ui.mapDay = e.target.value; views.mapa.render(el); });
      $('#mapEmp', el).addEventListener('change', e => { ui.mapEmp = e.target.value; views.mapa.render(el); });
      let L;
      try { L = await RM.leaflet(); } catch (err) { $('#dayMap', el).innerHTML = `<div class="empty"><p>${esc(err.message)}</p></div>`; }
      const d = await RM.api(`/api/v92/route?day=${dayStr}${ui.mapEmp ? '&employee=' + ui.mapEmp : ''}`);
      const byId = new Map(d.tasks.map(t => [RM.id(t), t]));
      const ordered = d.order.map(id => byId.get(id)).filter(Boolean);
      const rest = d.tasks.filter(t => !d.order.includes(RM.id(t)));
      $('#mapList', el).innerHTML = `<div class="kpis" style="grid-template-columns:repeat(3,1fr)">${kpi('Zlecenia', d.tasks.length)}${kpi('Trasa', h1(d.km) + ' km', `ok. ${Math.floor(d.minutes / 60)} h ${d.minutes % 60} min jazdy`)}${kpi('Oszczędność', d.plannedKm > d.km ? h1(d.plannedKm - d.km) + ' km' : '—', 'vs kolejność godzin', 'blue')}</div>
        <div style="display:grid;gap:8px;margin-top:12px">${ordered.map((t, i) => stopHtml(t, i + 1)).join('')}${rest.map(t => stopHtml(t, '?')).join('')}</div>
        ${d.missing.length ? `<p class="muted small"><i class="fa-solid fa-circle-info"></i> ${d.missing.length} ${plural(d.missing.length, 'adres', 'adresy', 'adresów')} bez współrzędnych — popraw adres w zleceniu.</p>` : ''}
        ${!d.tasks.length ? emptyBox('fa-map', 'Brak zleceń tego dnia', '') : ''}`;
      bindStops($('#mapList', el));
      if (!L) return;
      if (mapObj) { try { mapObj.remove(); } catch { /* ignore */ } }
      const map = (mapObj = L.map($('#dayMap', el)).setView([d.base.lat, d.base.lon], 10));
      tiles(L).addTo(map);
      const pts = [[d.base.lat, d.base.lon]];
      L.marker([d.base.lat, d.base.lon], { icon: numIcon(L, '<i class="fa-solid fa-house"></i>', 'base') }).addTo(map).bindPopup('Baza: ' + esc(d.base.name));
      ordered.forEach((t, i) => {
        pts.push([t.geo.lat, t.geo.lon]);
        L.marker([t.geo.lat, t.geo.lon], { icon: numIcon(L, i + 1) }).addTo(map).bindPopup(`<b>${esc(hm(t.dateStart))} ${esc(t.name)}</b><br>${esc(RM.place(t))}<br><a href="#/zlecenia/${esc(RM.id(t))}">Otwórz</a>`);
      });
      if (ordered.length) L.polyline([...pts, [d.base.lat, d.base.lon]], { color: '#03f0ba', weight: 3, opacity: 0.75, dashArray: '6 6' }).addTo(map);
      for (const c of d.crews) {
        const t = byId.get(c.task);
        L.marker([c.lat, c.lon], { icon: numIcon(L, '<i class="fa-solid fa-truck"></i>', 'crew') }).addTo(map).bindPopup(`Ekipa: ${esc(c.by || '')}<br>${esc(t?.name || '')}<br>${esc(RM.ago(c.at))}`);
        pts.push([c.lat, c.lon]);
      }
      if (pts.length > 1) map.fitBounds(pts, { padding: [30, 30] });
    }
  };

  const stopHtml = (t, n, next = false) => `<div class="stop ${t.status === 'completed' ? 'done' : ''} ${next ? 'next' : ''}"><span class="n">${n}</span>
    <div style="min-width:0"><b style="display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(hm(t.dateStart))} · ${esc(t.name)}</b><span class="muted small">${esc(RM.place(t) || 'brak adresu')}</span>${t.workers?.length ? `<div class="muted small">${esc(t.workers.map(w => w.name).join(', '))}</div>` : ''}</div>
    <div class="btn-row" style="flex-wrap:nowrap">${t.navUrl ? `<a class="icon-btn" href="${esc(t.navUrl)}" target="_blank" rel="noopener" title="Nawiguj"><i class="fa-solid fa-diamond-turn-right"></i></a>` : ''}<button class="icon-btn" data-open="${esc(RM.id(t))}" title="Szczegóły"><i class="fa-solid fa-chevron-right"></i></button></div></div>`;
  const bindStops = box => $$('[data-open]', box).forEach(b => b.addEventListener('click', () => RM.openTask(b.dataset.open)));

  views.trasa = {
    title: 'Moja trasa',
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v92/my-route');
      const next = d.tasks.find(t => RM.id(t) === d.next);
      el.innerHTML = `${head('Moja trasa', `Dziś ${d.tasks.length} ${plural(d.tasks.length, 'zlecenie', 'zlecenia', 'zleceń')} · ok. ${h1(d.km)} km jazdy w najkrótszej kolejności.`)}
        ${next ? `<a class="big-nav" href="${esc(next.navUrl)}" target="_blank" rel="noopener"><i class="fa-solid fa-diamond-turn-right"></i> Nawiguj do następnego: ${esc(next.name)}</a>
          <div class="btn-row" style="margin:10px 0 16px">${next.clientPhone ? `<a class="btn" href="${esc(RM.telUrl(next.clientPhone))}"><i class="fa-solid fa-phone"></i> Zadzwoń do klienta</a>` : ''}<button class="btn" data-open="${esc(RM.id(next))}"><i class="fa-solid fa-clipboard-list"></i> Szczegóły</button></div>` : ''}
        <div style="display:grid;gap:8px">${d.tasks.map((t, i) => stopHtml(t, i + 1, RM.id(t) === d.next)).join('') || emptyBox('fa-mug-hot', 'Dziś bez zleceń', 'Odpocznij albo sprawdź kalendarz.')}</div>`;
      bindStops(el);
    }
  };

  /* ================================================================== */
  /* URLOPY I DOSTĘPNOŚĆ                                                 */
  /* ================================================================== */
  const LEAVE_ST = { pending: ['Wniosek', 'wait'], approved: ['Zatwierdzony', 'ok'], rejected: ['Odrzucony', 'no'] };
  views.urlopy = {
    title: 'Urlopy',
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v92/leaves');
      S.v92.leavesPending = d.pending || 0;
      const row = l => `<div class="lv-row"><div><b>${esc(l.employeeName)}</b> · ${esc(d.kinds[l.kind] || l.kind)} <span class="pill ${LEAVE_ST[l.status][1]}">${LEAVE_ST[l.status][0]}</span>
          <div class="muted small">${esc(day(l.from))} – ${esc(day(l.to))}${l.note ? ' · ' + esc(l.note) : ''}${l.decidedBy ? ` · decyzja: ${esc(l.decidedBy)}` : ''}</div></div>
        <div class="btn-row">${d.manage && l.status !== 'approved' ? `<button class="btn sm primary" data-lv="${esc(RM.id(l))}|approved"><i class="fa-solid fa-check"></i></button>` : ''}${d.manage && l.status !== 'rejected' ? `<button class="btn sm" data-lv="${esc(RM.id(l))}|rejected"><i class="fa-solid fa-xmark"></i></button>` : ''}${d.manage || l.status === 'pending' ? `<button class="btn sm" data-lvdel="${esc(RM.id(l))}" title="Usuń"><i class="fa-solid fa-trash"></i></button>` : ''}</div></div>`;
      const pending = d.leaves.filter(l => l.status === 'pending');
      const other = d.leaves.filter(l => l.status !== 'pending');
      el.innerHTML = `${head('Urlopy i dostępność', d.manage ? 'Wnioski ekipy, urlopy i niedostępność. Zatwierdzony urlop pojawia się w grafiku, a przypisanie na ten dzień jest oznaczane jako konflikt.' : 'Zgłoś urlop lub dzień, w którym nie możesz pracować — biuro dostanie powiadomienie.',
        `<button class="btn primary" data-lvadd><i class="fa-solid fa-plus"></i> ${d.manage ? 'Dodaj urlop' : 'Zgłoś urlop'}</button>`)}
        ${pending.length ? `<h3 style="font-size:14px">Do decyzji (${pending.length})</h3><div style="display:grid;gap:8px;margin-bottom:18px">${pending.map(row).join('')}</div>` : ''}
        <h3 style="font-size:14px">${d.manage ? 'Wszystkie' : 'Moje'}</h3><div style="display:grid;gap:8px">${other.map(row).join('') || '<p class="muted small">Brak wpisów.</p>'}</div>`;
      const rerender = () => views.urlopy.render(el);
      $('[data-lvadd]', el).addEventListener('click', () => RM.form({
        title: d.manage ? 'Dodaj urlop / nieobecność' : 'Zgłoś urlop',
        values: { kind: 'vacation', from: isoDay(addDays(new Date(), 1)), to: isoDay(addDays(new Date(), 1)), employee: RM.selfId() },
        fields: [
          ...(d.manage ? [{ name: 'employee', label: 'Pracownik', type: 'select', full: true, required: true, options: S.employees.map(e => [RM.id(e), e.name]) }] : []),
          { name: 'kind', label: 'Rodzaj', type: 'select', options: Object.entries(d.kinds) },
          { name: 'from', label: 'Od', type: 'date', required: true }, { name: 'to', label: 'Do', type: 'date', required: true },
          { name: 'note', label: 'Uwagi', full: true, maxlength: 500 }
        ],
        async onSubmit(v) {
          const r = await RM.api('/api/v92/leaves', { method: 'POST', body: v, label: 'Urlop' });
          RM.toast(r.clashes?.length ? `Zapisano — uwaga: ${r.clashes.length} ${plural(r.clashes.length, 'zlecenie', 'zlecenia', 'zleceń')} w tym czasie` : d.manage ? 'Zapisano' : 'Wniosek wysłany', r.clashes?.length ? 'error' : 'ok');
          rerender();
        }
      }));
      $$('[data-lv]', el).forEach(b => b.addEventListener('click', async () => { const [id, status] = b.dataset.lv.split('|'); try { await RM.api(`/api/v92/leaves/admin/${id}`, { method: 'PATCH', body: { status } }); rerender(); } catch (e) { RM.fail(e); } }));
      $$('[data-lvdel]', el).forEach(b => b.addEventListener('click', async () => { if (!await RM.confirm('Usunąć wpis?', { ok: 'Usuń' })) return; try { await RM.api(`/api/v92/leaves/${b.dataset.lvdel}`, { method: 'DELETE' }); rerender(); } catch (e) { RM.fail(e); } }));
    }
  };

  /* ================================================================== */
  /* NALEŻNOŚCI                                                          */
  /* ================================================================== */
  views.naleznosci = {
    title: 'Należności',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v92/receivables');
      const buckets = ['0–7 dni', '8–30 dni', '31–60 dni', 'ponad 60 dni'];
      const list = ui.recvBucket ? d.items.filter(t => t.bucket === ui.recvBucket) : d.items;
      el.innerHTML = `${head('Należności', 'Zakończone zlecenia, które nie są jeszcze opłacone — od najstarszych. Przypomnienie wyślesz SMS-em lub e-mailem jednym kliknięciem.',
        RM.isOwnerAdmin() ? `<button class="btn" data-recvset><i class="fa-solid fa-gear"></i> Automatyczne przypomnienia: <b>${d.settings.auto ? 'wł.' : 'wył.'}</b></button>` : '')}
        <div class="kpis">${kpi('Razem do zapłaty', esc(RM.money(d.total)), `${d.items.length} ${plural(d.items.length, 'zlecenie', 'zlecenia', 'zleceń')}`)}${buckets.map((b, i) => kpi(b, esc(RM.money(d.buckets[b] || 0)), '', ['', 'blue', 'orange', 'red'][i] || '')).join('')}</div>
        <div style="margin:4px 0 12px">${seg([['', 'Wszystkie'], ...buckets.map(b => [b, b])], ui.recvBucket, 'rb')}</div>
        ${list.length ? `<div class="card" style="padding:4px 10px;overflow:auto"><table class="rv-table"><thead><tr><th>Zlecenie</th><th>Klient</th><th>Zakończone</th><th>Przypomnienia</th><th class="num">Do zapłaty</th><th></th></tr></thead><tbody>
          ${list.map(t => `<tr><td><a href="#/zlecenia/${esc(RM.id(t))}">${esc(t.number)}</a><div class="muted small">${esc(t.name)}</div></td>
            <td>${esc(t.clientName || '—')}<div class="muted small">${esc(t.clientPhone || '')}${t.clientEmail ? ' · ' + esc(t.clientEmail) : ''}</div></td>
            <td>${esc(day(t.completedAt))}<div class="small" style="color:${t.days > 30 ? '#f87171' : t.days > 7 ? '#f59e0b' : 'var(--muted)'}">${t.days} dni</div></td>
            <td class="small">${(t.paymentReminders || []).length ? `${t.paymentReminders.length}× · ostatnie ${esc(RM.ago(t.paymentReminders[t.paymentReminders.length - 1].at))}` : '<span class="muted">brak</span>'}${t.nextAuto && d.settings.auto ? '<div class="muted">auto dziś</div>' : ''}</td>
            <td class="num"><b>${esc(RM.money(t.due))}</b>${t.paymentStatus === 'partial' ? '<div class="muted small">częściowo</div>' : ''}</td>
            <td class="num"><div class="btn-row" style="justify-content:flex-end;flex-wrap:nowrap">${t.clientPhone ? `<button class="btn sm" data-rem="${esc(RM.id(t))}|sms" title="SMS"><i class="fa-solid fa-comment-sms"></i></button>` : ''}${t.clientEmail ? `<button class="btn sm" data-rem="${esc(RM.id(t))}|email" title="E-mail"><i class="fa-solid fa-envelope"></i></button>` : ''}<button class="btn sm primary" data-paid="${esc(RM.id(t))}" title="Opłacone"><i class="fa-solid fa-check"></i></button></div></td></tr>`).join('')}
          </tbody></table></div>` : emptyBox('fa-face-smile', 'Wszystko opłacone', 'Brak zaległych płatności.')}`;
      const rerender = () => views.naleznosci.render(el);
      $$('[data-rb]', el).forEach(b => b.addEventListener('click', () => { ui.recvBucket = b.dataset.rb; rerender(); }));
      $$('[data-rem]', el).forEach(b => b.addEventListener('click', async () => {
        const [id, channel] = b.dataset.rem.split('|');
        b.disabled = true;
        try {
          const r = await RM.api(`/api/v92/receivables/${id}/remind`, { method: 'POST', body: { channel } });
          if (r.link) { if (await RM.confirm('Bramka SMS nie jest skonfigurowana — otworzyć gotowego SMS-a w telefonie?', { ok: 'Otwórz SMS', danger: false })) location.href = r.link; }
          else RM.toast(channel === 'email' ? 'Wysłano e-mail z przypomnieniem' : 'Wysłano SMS z przypomnieniem');
          rerender();
        } catch (e) { RM.fail(e); b.disabled = false; }
      }));
      $$('[data-paid]', el).forEach(b => b.addEventListener('click', async () => {
        try { await RM.api(`/api/v92/receivables/${b.dataset.paid}/paid`, { method: 'POST', body: {} }); const t = RM.task(b.dataset.paid); if (t) t.paymentStatus = 'paid'; RM.toast('Oznaczono jako opłacone'); rerender(); } catch (e) { RM.fail(e); }
      }));
      $('[data-recvset]', el)?.addEventListener('click', () => RM.form({
        title: 'Automatyczne przypomnienia o płatności', subtitle: 'Wysyłane raz dziennie między 9:00 a 19:00 — e-mailem (gdy klient ma adres) albo SMS-em przez bramkę.',
        values: { receivablesAutoRemind: d.settings.auto, receivablesFirstDays: d.settings.firstDays, receivablesEveryDays: d.settings.everyDays, receivablesMaxReminders: d.settings.max },
        fields: [
          { name: 'receivablesAutoRemind', label: 'Włącz automatyczne przypomnienia', type: 'switch', full: true },
          { name: 'receivablesFirstDays', label: 'Pierwsze po (dniach od zakończenia)', type: 'number', min: 1, max: 90 },
          { name: 'receivablesEveryDays', label: 'Kolejne co (dni)', type: 'number', min: 1, max: 60 },
          { name: 'receivablesMaxReminders', label: 'Maksymalnie przypomnień', type: 'number', min: 1, max: 10 }
        ],
        async onSubmit(v) { await RM.api('/api/settings', { method: 'PUT', body: v }); RM.toast('Zapisano'); rerender(); }
      }));
    }
  };

  /* ================================================================== */
  /* AUTOMATYZACJE                                                       */
  /* ================================================================== */
  const RULE_TEMPLATES = [
    { name: 'Wycena bez odpowiedzi 48 h → SMS', trigger: 'quote_stale', hours: 48, action: 'sms_client', message: 'Dzień dobry, czy wycena {numer} od {firma} jest aktualna? Chętnie odpowiemy na pytania: {telefon}.' },
    { name: 'Nowe zgłoszenie bez wyceny 4 h → biuro', trigger: 'new_request_unanswered', hours: 4, action: 'notify_admins', message: '{nazwa} — {klient} czeka na wycenę.' },
    { name: 'Dzień przed zleceniem → SMS', trigger: 'task_tomorrow', hours: 24, action: 'sms_client', message: 'Przypominamy: {firma} przyjeżdża {termin}. W razie zmian prosimy o telefon: {telefon}.' },
    { name: 'Nieopłacone 14 dni → wysoki priorytet', trigger: 'unpaid_after', hours: 336, action: 'set_priority_high', message: '' },
    { name: 'Po zakończeniu 2 dni → e-mail z podziękowaniem', trigger: 'task_completed', hours: 48, action: 'email_client', message: 'Dziękujemy za skorzystanie z usług {firma}! Jeśli coś możemy poprawić — odpisz na tego maila.' }
  ];
  views.automatyzacje = {
    title: 'Automatyzacje',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v92/rules');
      el.innerHTML = `${head('Automatyzacje „jeśli → to”', 'Reguły sprawdzane co 15 minut. Każda działa raz na zlecenie. W treści możesz użyć: {numer}, {klient}, {nazwa}, {termin}, {kwota}, {firma}, {telefon}.',
        `<button class="btn" data-rrun><i class="fa-solid fa-play"></i> Uruchom teraz</button><button class="btn primary" data-radd><i class="fa-solid fa-plus"></i> Nowa reguła</button>`)}
        <div style="display:grid;gap:10px">${d.rules.map(r => `<div class="card" style="padding:14px;display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center">
          <div><b>${esc(r.name)}</b> ${r.enabled ? '<span class="pill ok">aktywna</span>' : '<span class="pill">wyłączona</span>'}
            <div class="small" style="margin-top:4px"><i class="fa-solid fa-bolt" style="color:var(--accent)"></i> Jeśli: ${esc(d.triggers[r.trigger])} <b>(${r.hours} h)</b>${r.division ? ' · ' + esc(RM.divName(r.division)) : ''} → ${esc(d.actions[r.action])}</div>
            ${r.message ? `<div class="muted small" style="margin-top:3px">„${esc(r.message)}”</div>` : ''}<div class="muted small">Uruchomiona ${r.runCount}× ${r.lastRunAt ? '· ostatnio ' + esc(RM.ago(r.lastRunAt)) : ''}</div></div>
          <button class="btn sm" data-redit="${esc(RM.id(r))}"><i class="fa-solid fa-pen"></i></button></div>`).join('') || `<div class="card" style="padding:16px"><p style="margin:0 0 10px">Brak reguł. Zacznij od gotowego szablonu:</p><div class="ast-sug">${RULE_TEMPLATES.map((t, i) => `<button data-rtpl="${i}">${esc(t.name)}</button>`).join('')}</div></div>`}</div>
        ${d.rules.length ? `<p class="muted small" style="margin-top:14px">Szablony: ${RULE_TEMPLATES.map((t, i) => `<button class="link" data-rtpl="${i}">${esc(t.name)}</button>`).join(' · ')}</p>` : ''}`;
      const rerender = () => views.automatyzacje.render(el);
      const form = (r = {}) => RM.form({
        title: r._id ? 'Edytuj regułę' : 'Nowa reguła',
        values: { enabled: true, hours: 48, ...r },
        fields: [
          { name: 'name', label: 'Nazwa', required: true, full: true, maxlength: 140 },
          { name: 'trigger', label: 'Jeśli', type: 'select', full: true, options: Object.entries(d.triggers) },
          { name: 'hours', label: 'X (godzin)', type: 'number', min: 0, max: 2160, required: true },
          { name: 'division', label: 'Tylko dział', type: 'select', options: RM.divOptions('— wszystkie —') },
          { name: 'action', label: 'To', type: 'select', full: true, options: Object.entries(d.actions) },
          { name: 'message', label: 'Treść (SMS / e-mail / notatka / powiadomienie)', type: 'textarea', full: true, maxlength: 600 },
          { name: 'enabled', label: 'Aktywna', type: 'switch', full: true }
        ],
        danger: r._id ? { label: 'Usuń', confirm: 'Usunąć regułę?', action: async () => { await RM.api('/api/v92/rules/' + r._id, { method: 'DELETE' }); rerender(); } } : null,
        async onSubmit(v) { await RM.api('/api/v92/rules' + (r._id ? '/' + r._id : ''), { method: r._id ? 'PUT' : 'POST', body: v }); RM.toast('Zapisano'); rerender(); }
      });
      $('[data-radd]', el).addEventListener('click', () => form());
      $$('[data-redit]', el).forEach(b => b.addEventListener('click', () => form(d.rules.find(r => RM.id(r) === b.dataset.redit))));
      $$('[data-rtpl]', el).forEach(b => b.addEventListener('click', () => form({ ...RULE_TEMPLATES[Number(b.dataset.rtpl)] })));
      $('[data-rrun]', el).addEventListener('click', async () => { try { const r = await RM.api('/api/v92/rules/run', { method: 'POST', body: {} }); RM.toast(`Sprawdzono ${r.rules} reguł · wykonano ${r.fired} akcji`); rerender(); } catch (e) { RM.fail(e); } });
    }
  };

  /* ================================================================== */
  /* ASYSTENT REVBOT                                                     */
  /* ================================================================== */
  views.asystent = {
    title: 'Asystent RevBot',
    admin: true,
    async render(el) {
      const tab = ui.astTab;
      const chats = S.tasks.filter(t => t.account && t.lastChatAt).sort((a, b) => new Date(b.lastChatAt) - new Date(a.lastChatAt)).slice(0, 40);
      el.innerHTML = `${head('Asystent RevBot', 'Pytania o dane firmy, odpowiedzi do klientów i szkice ofert — przygotowane przez Claude na podstawie Twoich danych.')}
        <div style="margin-bottom:12px">${seg([['ask', 'Pytaj o dane'], ['reply', 'Odpowiedź klientowi'], ['offer', 'Szkic oferty'], ['receipt', 'Paragon → koszt']], tab, 'astab')}</div>
        <div class="card" style="padding:16px" id="astBox">${tab === 'ask' ? `<div class="ast-chat" id="astChat">${ui.astHistory.map(m => `<div class="ast-m ${m.role === 'user' ? 'u' : 'a'}">${esc(m.text)}</div>`).join('') || '<p class="muted small">Zapytaj np.:</p>'}</div>
            ${ui.astHistory.length ? '' : `<div class="ast-sug" style="margin:8px 0">${['Ile zarobiliśmy w tym miesiącu na przeprowadzkach?', 'Którzy klienci zalegają z płatnością najdłużej?', 'Co mamy zaplanowane na jutro i kto jedzie?', 'Porównaj przychód z ostatnich 3 miesięcy', 'Który dział ma najlepszą średnią wartość zlecenia?'].map(q => `<button data-q="${esc(q)}">${esc(q)}</button>`).join('')}</div>`}
            <form id="astForm" class="chat-form-v10" style="display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:10px"><textarea name="q" rows="2" maxlength="1500" placeholder="Zadaj pytanie o zlecenia, klientów, finanse…" style="border-radius:12px;border:1px solid var(--line-2);background:var(--surface);color:var(--text);padding:10px;font:inherit"></textarea><button class="btn primary"><i class="fa-solid fa-paper-plane"></i></button></form>
            ${ui.astHistory.length ? '<button class="link" data-astclear style="margin-top:6px">Nowa rozmowa</button>' : ''}`
          : tab === 'reply' ? `<div class="form-grid"><div class="field full"><label>Zlecenie z czatem</label><select id="astTask">${chats.map(t => `<option value="${esc(RM.id(t))}">${esc(t.number)} · ${esc(t.clientName || t.name)}${t.chatUnreadStaff ? ` (${t.chatUnreadStaff} nowe)` : ''}</option>`).join('') || '<option value="">Brak rozmów z klientami</option>'}</select></div>
              <div class="field full"><label>Wskazówka (opcjonalnie)</label><input id="astHint" maxlength="500" placeholder="np. termin przesuwamy na czwartek, cena bez zmian"></div></div>
              <button class="btn primary" data-reply ${chats.length ? '' : 'disabled'}><i class="fa-solid fa-wand-magic-sparkles"></i> Zaproponuj odpowiedź</button>
              <div id="astOut" style="margin-top:12px"></div>`
          : tab === 'offer' ? `<div class="field full"><label>Opis od klienta (z rozmowy, maila, SMS)</label><textarea id="astText" rows="6" maxlength="4000" placeholder="np. Przeprowadzka z mieszkania 3 pokoje, 2 piętro bez windy w Słupsku do domu w Ustce, szafa trzydrzwiowa, pianino, 20 kartonów, termin 15 listopada…" style="width:100%;border-radius:12px;border:1px solid var(--line-2);background:var(--surface);color:var(--text);padding:10px;font:inherit"></textarea></div>
              <button class="btn primary" data-offer style="margin-top:10px"><i class="fa-solid fa-file-invoice-dollar"></i> Przygotuj szkic oferty</button><div id="astOut" style="margin-top:12px"></div>`
          : `<p class="muted" style="margin-top:0">Zrób zdjęcie paragonu lub faktury — RevBot odczyta kwotę, datę i kategorię${RM.can('finance', true) ? ' i zapisze koszt' : ''}.</p>
              <div class="form-grid"><div class="field"><label>Pojazd (dla paliwa)</label><select id="astVeh"><option value="">—</option>${S.fleet.map(v => `<option value="${esc(RM.id(v))}">${esc(v.name)} (${esc(v.plates)})</option>`).join('')}</select></div></div>
              <button class="btn primary" data-receipt2><i class="fa-solid fa-camera"></i> Zrób zdjęcie / wybierz plik</button><div id="astOut" style="margin-top:12px"></div>`}
        </div>`;
      const rerender = () => views.asystent.render(el);
      $$('[data-astab]', el).forEach(b => b.addEventListener('click', () => { ui.astTab = b.dataset.astab; rerender(); }));
      const ask = async q => {
        if (!q.trim()) return;
        ui.astHistory.push({ role: 'user', text: q });
        ui.astHistory.push({ role: 'assistant', text: '…' });
        rerender();
        try {
          const r = await RM.api('/api/v92/assistant/ask', { method: 'POST', body: { question: q, history: ui.astHistory.slice(0, -2) } });
          ui.astHistory[ui.astHistory.length - 1].text = r.answer;
        } catch (e) { ui.astHistory[ui.astHistory.length - 1].text = '⚠ ' + e.message; }
        rerender();
        setTimeout(() => { const c = $('#astChat'); if (c) c.scrollTop = c.scrollHeight; }, 30);
      };
      $('#astForm', el)?.addEventListener('submit', e => { e.preventDefault(); ask(e.target.elements.q.value); });
      $$('[data-q]', el).forEach(b => b.addEventListener('click', () => ask(b.dataset.q)));
      $('[data-astclear]', el)?.addEventListener('click', () => { ui.astHistory = []; rerender(); });
      $('[data-reply]', el)?.addEventListener('click', async e => {
        const b = e.currentTarget; const id = $('#astTask', el).value;
        b.disabled = true; $('#astOut', el).innerHTML = '<div class="skeleton" style="height:80px"></div>';
        try {
          const r = await RM.api('/api/v92/assistant/reply', { method: 'POST', body: { taskId: id, hint: $('#astHint', el).value } });
          $('#astOut', el).innerHTML = `<textarea id="astReply" rows="5" style="width:100%;border-radius:12px;border:1px solid var(--line-2);background:var(--surface);color:var(--text);padding:10px;font:inherit">${esc(r.reply)}</textarea>
            <div class="btn-row" style="margin-top:8px"><button class="btn primary" data-send><i class="fa-solid fa-paper-plane"></i> Wyślij klientowi</button><button class="btn" data-copy><i class="fa-solid fa-copy"></i> Kopiuj</button><a class="btn" href="#/zlecenia/${esc(id)}">Otwórz zlecenie</a></div>`;
          $('[data-copy]', el).addEventListener('click', () => navigator.clipboard?.writeText($('#astReply').value).then(() => RM.toast('Skopiowano')));
          $('[data-send]', el).addEventListener('click', async () => { try { await RM.api(`/api/tasks/${id}/messages`, { method: 'POST', body: { text: $('#astReply').value } }); RM.toast('Wysłano'); $('#astOut', el).innerHTML = ''; } catch (err) { RM.fail(err); } });
        } catch (err) { $('#astOut', el).innerHTML = `<p style="color:#f87171">${esc(err.message)}</p>`; }
        b.disabled = false;
      });
      $('[data-offer]', el)?.addEventListener('click', async e => {
        const b = e.currentTarget; const text = $('#astText', el).value;
        b.disabled = true; $('#astOut', el).innerHTML = '<div class="skeleton" style="height:120px"></div>';
        try {
          const { offer } = await RM.api('/api/v92/assistant/offer', { method: 'POST', body: { text } });
          const net = offer.items.reduce((s, i) => s + i.qty * i.price, 0);
          $('#astOut', el).innerHTML = `<h3 style="margin:0 0 8px">${esc(offer.title)}</h3><table class="rv-table"><thead><tr><th>Pozycja</th><th class="num">Ilość</th><th class="num">Cena</th><th class="num">Wartość</th></tr></thead><tbody>${offer.items.map(i => `<tr><td>${esc(i.name)}</td><td class="num">${h1(i.qty)} ${esc(i.unit)}</td><td class="num">${esc(RM.money(i.price))}</td><td class="num">${esc(RM.money(i.qty * i.price))}</td></tr>`).join('')}<tr><td colspan="3"><b>Razem netto</b></td><td class="num"><b>${esc(RM.money(net))}</b></td></tr></tbody></table>
            ${offer.notes ? `<p class="muted small" style="white-space:pre-wrap">${esc(offer.notes)}</p>` : ''}<div class="btn-row"><button class="btn primary" data-mkoffer><i class="fa-solid fa-file-circle-plus"></i> Utwórz ofertę (szkic)</button></div>`;
          $('[data-mkoffer]', el).addEventListener('click', async () => {
            try { await RM.api('/api/offers', { method: 'POST', body: { title: offer.title.slice(0, 160), items: offer.items.map(i => ({ ...i, vatRate: 8 })), notes: offer.notes.slice(0, 3000), status: 'draft' } }); RM.toast('Utworzono szkic oferty'); } catch (err) { RM.fail(err); }
          });
        } catch (err) { $('#astOut', el).innerHTML = `<p style="color:#f87171">${esc(err.message)}</p>`; }
        b.disabled = false;
      });
      $('[data-receipt2]', el)?.addEventListener('click', async e => {
        const [photo] = await RM.pickPhotos(1);
        if (!photo) return;
        const b = e.currentTarget; b.disabled = true;
        $('#astOut', el).innerHTML = '<div class="skeleton" style="height:80px"></div>';
        try {
          const r = await RM.api('/api/v92/receipts/scan', { method: 'POST', body: { photo, save: RM.can('finance', true), vehicle: $('#astVeh', el).value } });
          const x = r.receipt;
          $('#astOut', el).innerHTML = x.readable ? `<div class="card" style="padding:12px"><b>${esc(x.vendor)}</b> · ${esc(x.date || '')}<div style="font-size:22px;font-weight:900;margin:6px 0">${esc(RM.money(x.total))}</div><div class="small">Kategoria: ${esc(x.category)}${x.vat ? ` · VAT ${esc(RM.money(x.vat))}` : ''}${x.liters ? ` · ${h1(x.liters)} l` : ''}</div><div class="muted small">${esc(x.description)}</div>${r.expense ? '<p class="small" style="color:var(--accent);margin:8px 0 0"><i class="fa-solid fa-check"></i> Zapisano w kosztach</p>' : ''}</div>` : '<p style="color:#f87171">Nie udało się odczytać paragonu.</p>';
        } catch (err) { $('#astOut', el).innerHTML = `<p style="color:#f87171">${esc(err.message)}</p>`; }
        b.disabled = false;
      });
    }
  };

  /* ================================================================== */
  /* KOSZTY FLOTY                                                        */
  /* ================================================================== */
  const REPAIR_LABELS = { service: 'Serwis', repair: 'Naprawa', tyres: 'Opony', inspection: 'Przegląd', insurance: 'Ubezpieczenie OC/AC', other: 'Inne' };
  const TYRES = { '': '—', summer: 'Letnie', winter: 'Zimowe', allseason: 'Całoroczne' };
  views['flota-koszty'] = {
    title: 'Koszty floty',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v92/fleet/costs?months=6');
      const write = RM.can('fleet', true);
      const tab = ui.fleetTab;
      const vname = id => { const v = d.vehicles.find(x => String(x._id) === String(id)); return v ? `${v.name} (${v.plates})` : '—'; };
      el.innerHTML = `${head('Koszty floty', 'Koszt na km z tankowań i napraw (ostatnie 6 miesięcy), spalanie, terminy OC, przeglądów, serwisu i opon.',
        write ? '<button class="btn" data-repair><i class="fa-solid fa-wrench"></i> Naprawa / serwis</button><button class="btn primary" data-fuel><i class="fa-solid fa-gas-pump"></i> Tankowanie</button>' : '')}
        <div style="margin-bottom:12px">${seg([['cars', 'Pojazdy'], ['fuel', 'Tankowania', d.fuel.length], ['repairs', 'Naprawy', d.repairs.length]], tab, 'ftab')}</div>
        ${tab === 'cars' ? `<div class="int-grid">${d.vehicles.map(v => `<div class="card int-card" style="padding:16px"><h3><i class="fa-solid fa-truck" style="color:var(--accent)"></i> ${esc(v.name)} <span class="muted small">${esc(v.plates)}</span></h3>
            <div class="kpis" style="grid-template-columns:repeat(2,1fr);margin:0">${kpi('Koszt / km', v.costPerKm != null ? esc(RM.money(v.costPerKm)) : '—', v.km ? `${v.km} km z tankowań` : 'dodaj przebieg przy tankowaniu')}${kpi('Spalanie', v.per100 ? h1(v.per100) + ' l/100' : '—', `${v.liters} l · ${esc(RM.money(v.fuelCost))}`, 'blue')}</div>
            <div class="small">Naprawy i serwis: <b>${esc(RM.money(v.repairCost))}</b> · inne koszty z wydatków: ${esc(RM.money(v.otherCosts))} · przebieg ${v.mileage ? v.mileage.toLocaleString('pl-PL') + ' km' : '—'}</div>
            <div>${v.reminders.length ? v.reminders.map(r => `<div class="rem ${r.level}"><i class="fa-solid ${r.level === 'danger' ? 'fa-circle-exclamation' : r.level === 'warn' ? 'fa-triangle-exclamation' : 'fa-circle-info'}"></i>${esc(r.label)}${r.left != null ? ` — ${r.left < 0 ? 'po terminie ' + -r.left + ' dni' : 'za ' + r.left + ' dni'}` : ''}</div>`).join('') : '<div class="rem info"><i class="fa-solid fa-check"></i> Terminy w porządku</div>'}</div>
            <div class="small muted">OC: ${esc(day(v.insuranceUntil))} · przegląd: ${esc(day(v.inspectionUntil))} · serwis: ${esc(day(v.nextServiceDate))} · opony: ${esc(TYRES[v.tyreSeason] || '—')}</div>
            ${write ? `<div class="btn-row"><button class="btn sm" data-tyres="${esc(v._id)}"><i class="fa-solid fa-circle-dot"></i> Opony</button><button class="btn sm" data-fuel="${esc(v._id)}"><i class="fa-solid fa-gas-pump"></i></button><button class="btn sm" data-repair="${esc(v._id)}"><i class="fa-solid fa-wrench"></i></button></div>` : ''}</div>`).join('') || emptyBox('fa-truck', 'Brak pojazdów', 'Dodaj pojazdy w zakładce Flota.')}</div>`
        : tab === 'fuel' ? `<div class="card" style="padding:4px 10px;overflow:auto"><table class="rv-table"><thead><tr><th>Data</th><th>Pojazd</th><th class="num">Litry</th><th class="num">Kwota</th><th class="num">Przebieg</th><th>Kto</th><th></th></tr></thead><tbody>${d.fuel.map(f => `<tr><td>${esc(day(f.date))}</td><td>${esc(vname(f.vehicle))}</td><td class="num">${h1(f.liters)}</td><td class="num">${esc(RM.money(f.price))}</td><td class="num">${f.mileage ? f.mileage.toLocaleString('pl-PL') : '—'}</td><td class="small">${esc(f.by)}</td><td class="num">${write ? `<button class="btn sm" data-delfuel="${esc(f._id)}"><i class="fa-solid fa-trash"></i></button>` : ''}</td></tr>`).join('') || '<tr><td colspan="7" class="muted">Brak tankowań.</td></tr>'}</tbody></table></div>`
        : `<div class="card" style="padding:4px 10px;overflow:auto"><table class="rv-table"><thead><tr><th>Data</th><th>Pojazd</th><th>Rodzaj</th><th>Opis</th><th class="num">Kwota</th><th></th></tr></thead><tbody>${d.repairs.map(r => `<tr><td>${esc(day(r.date))}</td><td>${esc(vname(r.vehicle))}</td><td>${esc(REPAIR_LABELS[r.kind] || r.kind)}</td><td class="small">${esc(r.description)}${r.workshop ? ` · ${esc(r.workshop)}` : ''}</td><td class="num">${esc(RM.money(r.price))}</td><td class="num">${write ? `<button class="btn sm" data-delrep="${esc(r._id)}"><i class="fa-solid fa-trash"></i></button>` : ''}</td></tr>`).join('') || '<tr><td colspan="6" class="muted">Brak wpisów.</td></tr>'}</tbody></table></div>`}`;
      const rerender = () => views['flota-koszty'].render(el);
      $$('[data-ftab]', el).forEach(b => b.addEventListener('click', () => { ui.fleetTab = b.dataset.ftab; rerender(); }));
      const vOpts = d.vehicles.map(v => [String(v._id), `${v.name} (${v.plates})`]);
      $$('[data-fuel]', el).forEach(b => b.addEventListener('click', () => RM.fuelForm(b.dataset.fuel, rerender, vOpts)));
      $$('[data-repair]', el).forEach(b => b.addEventListener('click', () => RM.form({
        title: 'Naprawa / serwis / termin', values: { vehicle: b.dataset.repair || vOpts[0]?.[0], kind: 'service', date: isoDay(new Date()) },
        fields: [
          { name: 'vehicle', label: 'Pojazd', type: 'select', full: true, options: vOpts, required: true },
          { name: 'kind', label: 'Rodzaj', type: 'select', options: Object.entries(REPAIR_LABELS) }, { name: 'date', label: 'Data', type: 'date' },
          { name: 'description', label: 'Opis', full: true, maxlength: 1000 }, { name: 'workshop', label: 'Warsztat' },
          { name: 'price', label: 'Koszt (zł)', type: 'number', min: 0, step: '0.01' }, { name: 'mileage', label: 'Przebieg (km)', type: 'number', min: 0 },
          { name: 'nextDate', label: 'Następny termin (przegląd / OC / serwis)', type: 'date', hint: 'Aktualizuje termin w pojeździe' },
          { name: 'nextMileage', label: 'Następny serwis przy (km)', type: 'number', min: 0 },
          { name: 'tyreSeason', label: 'Założone opony (dla „Opony”)', type: 'select', options: Object.entries(TYRES) }
        ],
        async onSubmit(v) { await RM.api('/api/v92/repairs', { method: 'POST', body: v }); RM.toast('Zapisano — koszt dodany do wydatków'); rerender(); }
      })));
      $$('[data-tyres]', el).forEach(b => b.addEventListener('click', () => RM.form({
        title: 'Opony w pojeździe', values: { tyreSeason: d.vehicles.find(v => String(v._id) === b.dataset.tyres)?.tyreSeason || '' },
        fields: [{ name: 'tyreSeason', label: 'Aktualnie założone', type: 'select', full: true, options: Object.entries(TYRES), hint: 'Przypomnimy o wymianie na zimowe (X–XI) i letnie (IV–V).' }],
        async onSubmit(v) { await RM.api(`/api/v92/fleet/${b.dataset.tyres}/tyres`, { method: 'PUT', body: v }); rerender(); }
      })));
      $$('[data-delfuel]', el).forEach(b => b.addEventListener('click', async () => { if (await RM.confirm('Usunąć tankowanie (i koszt)?', { ok: 'Usuń' })) { await RM.api('/api/v92/fuel/' + b.dataset.delfuel, { method: 'DELETE' }).catch(RM.fail); rerender(); } }));
      $$('[data-delrep]', el).forEach(b => b.addEventListener('click', async () => { if (await RM.confirm('Usunąć wpis (i koszt)?', { ok: 'Usuń' })) { await RM.api('/api/v92/repairs/' + b.dataset.delrep, { method: 'DELETE' }).catch(RM.fail); rerender(); } }));
    }
  };

  /** Tankowanie — także z telefonu ekipy (Moja trasa / Więcej). */
  RM.fuelForm = (vehicle, done, vOpts = S.fleet.map(v => [RM.id(v), `${v.name} (${v.plates})`])) => RM.form({
    title: 'Tankowanie', values: { vehicle: vehicle || vOpts[0]?.[0], date: isoDay(new Date()), full: true },
    fields: [
      { name: 'vehicle', label: 'Pojazd', type: 'select', full: true, options: vOpts, required: true },
      { name: 'price', label: 'Kwota (zł)', type: 'number', min: 0, step: '0.01', required: true, inputmode: 'decimal' },
      { name: 'liters', label: 'Litry', type: 'number', min: 0, step: '0.01', required: true, inputmode: 'decimal' },
      { name: 'mileage', label: 'Przebieg (km)', type: 'number', min: 0, inputmode: 'numeric', hint: 'Potrzebny do kosztu na km i spalania' },
      { name: 'date', label: 'Data', type: 'date' }, { name: 'station', label: 'Stacja' },
      { name: 'full', label: 'Do pełna', type: 'switch' }
    ],
    async onSubmit(v) { await RM.api(RM.can('fleet', true) ? '/api/v92/fuel' : '/api/v92/crew/fuel', { method: 'POST', body: v, label: 'Tankowanie' }); RM.toast('Zapisano tankowanie'); done?.(); }
  });

  /* ================================================================== */
  /* CZAS PRACY (stoper)                                                 */
  /* ================================================================== */
  views['czas-pracy'] = {
    title: 'Czas pracy',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v92/dispatch/hours?from=' + isoDay(addDays(new Date(), -30)));
      const max = Math.max(1, ...d.people.map(p => p.hours));
      el.innerHTML = `${head('Czas pracy', 'Ostatnie 30 dni ze stopera (start zlecenia → zakończenie, bez przerw). Przydatne do rozliczeń godzinowych.')}
        <div class="card" style="padding:14px;display:grid;gap:10px;margin-bottom:14px">${d.people.map(p => `<div style="display:grid;grid-template-columns:160px 1fr 110px;gap:10px;align-items:center"><b>${esc(p.name)}</b><div class="an-bar"><i style="width:${(p.hours / max) * 100}%"></i></div><span class="num">${h1(p.hours)} h · ${p.tasks} zl.</span></div>`).join('') || '<p class="muted small" style="margin:0">Brak danych ze stopera — pojawią się po rozpoczęciu zleceń w aplikacji.</p>'}</div>
        ${d.tasks.length ? `<div class="card" style="padding:4px 10px;overflow:auto"><table class="rv-table"><thead><tr><th>Zlecenie</th><th class="num">Stoper</th><th class="num">Wpisane</th></tr></thead><tbody>${d.tasks.map(t => `<tr><td><a href="#/zlecenia/${esc(t._id)}">${esc(t.number)}</a> ${esc(t.name)}</td><td class="num">${h1(t.hours)} h</td><td class="num">${t.declared != null ? h1(t.declared) + ' h' : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
    }
  };

  /* ================================================================== */
  /* BEZPIECZEŃSTWO (2FA, role)                                          */
  /* ================================================================== */
  const loadQr = () => (window.QRCode ? Promise.resolve() : new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  }));
  views.bezpieczenstwo = {
    title: 'Bezpieczeństwo',
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const [st, roles, integ] = await Promise.all([
        RM.api('/api/v92/2fa'), RM.api('/api/v92/roles'),
        RM.isOwnerAdmin() ? RM.api('/api/v92/integrations').catch(() => null) : null
      ]);
      el.innerHTML = `${head('Bezpieczeństwo', 'Logowanie dwuetapowe (2FA) chroni konto, nawet gdy ktoś pozna PIN.')}
        ${S.me.must2faSetup && !st.enabled ? '<div class="card" style="padding:12px 14px;margin-bottom:12px;border-color:rgba(245,158,11,.5)"><b style="color:#f59e0b"><i class="fa-solid fa-triangle-exclamation"></i> Administrator wymaga 2FA — włącz je poniżej.</b></div>' : ''}
        <div class="int-grid">
          <div class="card int-card" style="padding:16px"><h3><span class="ok-dot ${st.enabled ? 'on' : ''}"></span> Logowanie dwuetapowe (2FA)</h3>
            <p class="muted small" style="margin:0">Po PIN-ie aplikacja poprosi o 6-cyfrowy kod z Google Authenticator, Microsoft Authenticator lub Authy.</p>
            <div id="tfBox">${st.enabled ? '<p style="margin:0;color:var(--accent)"><i class="fa-solid fa-shield-halved"></i> Włączone</p><button class="btn" data-tfoff>Wyłącz 2FA</button>' : '<button class="btn primary" data-tfon><i class="fa-solid fa-qrcode"></i> Włącz 2FA</button>'}</div></div>
          ${RM.isOwnerAdmin() && integ ? `<div class="card int-card" style="padding:16px"><h3><i class="fa-solid fa-user-shield" style="color:var(--accent)"></i> Wymagaj 2FA od administratorów</h3>
            <p class="muted small" style="margin:0">Najpierw włącz 2FA na swoim koncie. Administratorzy bez 2FA zobaczą prośbę o włączenie.</p>
            <label class="toggle-line"><span class="switch"><input type="checkbox" id="req2fa" ${integ.security.require2faForAdmins ? 'checked' : ''}><span></span></span> Wymagaj</label></div>` : ''}
          <div class="card int-card" style="padding:16px"><h3><i class="fa-solid fa-id-badge" style="color:var(--accent)"></i> Twoja rola: ${esc(RM.ROLE_LABELS[RM.role()] || RM.role())}</h3>
            <div style="display:grid;gap:8px">${roles.roles.map(r => `<div class="small"><b>${esc(r.label)}</b><div class="muted">${esc(r.hint)}</div></div>`).join('')}</div>
            ${RM.isOwnerAdmin() ? '<p class="muted small" style="margin:0">Rolę zmienisz w Zespół → edycja pracownika → Uprawnienia.</p>' : ''}</div>
        </div>
        ${RM.isOwnerAdmin() ? `<h3 style="font-size:14px;margin-top:18px">2FA w zespole</h3><div class="card" style="padding:4px 10px"><table class="rv-table"><tbody>${S.employees.filter(e => !e.isOwner).map(e => `<tr><td>${esc(e.name)}</td><td class="small">${esc(RM.ROLE_LABELS[e.systemRole] || 'Pracownik')}</td><td>${e.totpEnabled ? '<span class="pill ok">2FA</span>' : '<span class="pill">bez 2FA</span>'}</td><td class="num">${e.totpEnabled ? `<button class="btn sm" data-tfreset="${esc(RM.id(e))}">Resetuj (zgubiony telefon)</button>` : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
      const rerender = () => views.bezpieczenstwo.render(el);
      $('[data-tfon]', el)?.addEventListener('click', async () => {
        try {
          const r = await RM.api('/api/v92/2fa/setup', { method: 'POST', body: {} });
          $('#tfBox', el).innerHTML = `<ol class="small" style="margin:0;padding-left:18px;display:grid;gap:6px"><li>Zainstaluj aplikację (Google Authenticator / Authy).</li><li>Zeskanuj kod QR albo wpisz klucz ręcznie.</li><li>Wpisz 6 cyfr z aplikacji.</li></ol>
            <div class="qr-box" id="qr"></div><div class="small">Klucz: <code style="user-select:all;word-break:break-all">${esc(r.secret.replace(/(.{4})/g, '$1 ').trim())}</code></div>
            <div class="fld-row"><input class="code-in" id="tfCode" inputmode="numeric" maxlength="6" autocomplete="one-time-code" placeholder="000000"><button class="btn primary" data-tfconfirm>Potwierdź</button></div>`;
          try { await loadQr(); new window.QRCode($('#qr', el), { text: r.otpauth, width: 180, height: 180 }); } catch { $('#qr', el).remove(); }
          $('#tfCode', el).focus();
          $('[data-tfconfirm]', el).addEventListener('click', async () => {
            try { await RM.api('/api/v92/2fa/enable', { method: 'POST', body: { code: $('#tfCode', el).value } }); S.me.must2faSetup = false; RM.toast('2FA włączone'); rerender(); } catch (e) { RM.fail(e); }
          });
        } catch (e) { RM.fail(e); }
      });
      $('[data-tfoff]', el)?.addEventListener('click', () => RM.form({
        title: 'Wyłącz 2FA', fields: [{ name: 'code', label: 'Kod z aplikacji', full: true, required: true, inputmode: 'numeric', maxlength: 6 }], submitLabel: 'Wyłącz',
        async onSubmit(v) { await RM.api('/api/v92/2fa/disable', { method: 'POST', body: v }); RM.toast('2FA wyłączone'); rerender(); }
      }));
      $('#req2fa', el)?.addEventListener('change', async e => {
        try { await RM.api('/api/settings', { method: 'PUT', body: { require2faForAdmins: e.target.checked } }); RM.toast('Zapisano'); } catch (err) { e.target.checked = !e.target.checked; RM.fail(err); }
      });
      $$('[data-tfreset]', el).forEach(b => b.addEventListener('click', async () => {
        if (!await RM.confirm('Zresetować 2FA? Pracownik zaloguje się samym PIN-em i ustawi 2FA od nowa.', { ok: 'Resetuj' })) return;
        try { await RM.api('/api/v92/2fa/reset/' + b.dataset.tfreset, { method: 'POST', body: {} }); const e = RM.employee(b.dataset.tfreset); if (e) e.totpEnabled = false; RM.toast('Zresetowano'); rerender(); } catch (err) { RM.fail(err); }
      }));
    }
  };

  /* ================================================================== */
  /* INTEGRACJE                                                          */
  /* ================================================================== */
  views.integracje = {
    title: 'Integracje',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v92/integrations');
      const s = S.settings || {};
      const card = (ok, icon, title, body) => `<div class="card int-card" style="padding:16px"><h3><span class="ok-dot ${ok ? 'on' : ''}"></span><i class="fa-solid ${icon}" style="color:var(--accent)"></i> ${title}</h3>${body}</div>`;
      el.innerHTML = `${head('Integracje', 'Stan połączeń i konfiguracja. Klucze API ustawiasz w zmiennych środowiskowych serwera (Render → Environment).')}
        <div class="int-grid">
          ${card(d.google.ok || d.manual.count != null, 'fa-star', 'Opinie Google (na stronie)', `<div style="font-size:26px;font-weight:900">${String(d.reviews.rating).replace('.', ',')} ★ · ${d.reviews.count} ${plural(d.reviews.count, 'opinia', 'opinie', 'opinii')}</div>
            <div class="muted small">Źródło: ${{ google: 'Google na żywo', manual: 'ręcznie', static: 'stała wartość ze strony' }[d.reviews.source]}${d.google.live?.updatedAt ? ' · odświeżone ' + esc(RM.ago(d.google.live.updatedAt)) : ''}${d.google.live?.error ? `<br><span style="color:#f87171">${esc(d.google.live.error)}</span>` : ''}</div>
            ${d.google.ok ? '' : '<p class="small" style="margin:0">Aby liczba aktualizowała się sama, ustaw <code>GOOGLE_PLACES_API_KEY</code> (Google Cloud → Places API (New)). Do tego czasu możesz wpisać wartości ręcznie.</p>'}
            <div class="btn-row">${d.google.ok ? '<button class="btn sm primary" data-revref><i class="fa-solid fa-rotate"></i> Odśwież teraz</button>' : ''}<button class="btn sm" data-revset><i class="fa-solid fa-pen"></i> Place ID / ręcznie</button></div>`)}
          ${card(d.storage.ok, 'fa-cloud', 'Zdjęcia — Cloudflare R2 / S3', `<div class="small">W bazie: <b>${d.storage.inDb}</b> · w chmurze: <b>${d.storage.inBucket}</b></div>
            ${d.storage.ok ? '' : '<p class="small" style="margin:0">Ustaw <code>S3_ENDPOINT</code>, <code>S3_BUCKET</code>, <code>S3_ACCESS_KEY_ID</code>, <code>S3_SECRET_ACCESS_KEY</code> — nowe zdjęcia trafią do R2, a baza przestanie rosnąć.</p>'}
            ${d.storage.migration.running ? `<p class="small" style="margin:0"><i class="fa-solid fa-spinner fa-spin"></i> Przenoszę… ${d.storage.migration.moved}</p>` : d.storage.migration.finishedAt ? `<p class="small" style="margin:0">Ostatnia migracja: ${d.storage.migration.moved} zdjęć${d.storage.migration.error ? ` · <span style="color:#f87171">${esc(d.storage.migration.error)}</span>` : ''}</p>` : ''}
            ${d.storage.ok ? `<div class="btn-row"><button class="btn sm" data-s3test>Test połączenia</button>${d.storage.inDb ? `<button class="btn sm primary" data-s3mig>Przenieś ${d.storage.inDb} zdjęć do R2</button>` : ''}</div>` : ''}`)}
          ${card(d.claude.ok, 'fa-robot', 'Claude API (RevBot, asystent, OCR)', `<div class="small">Model: <code>${esc(d.claude.model)}</code></div>${d.claude.ok ? '<p class="small muted" style="margin:0">Gdy pojawi się „credit balance is too low” — doładuj konto w console.anthropic.com → Plans &amp; Billing.</p>' : '<p class="small" style="margin:0">Ustaw <code>ANTHROPIC_API_KEY</code>.</p>'}`)}
          ${card(d.mail.ok, 'fa-envelope', 'E-mail', `<div class="small">Dostawca: <b>${esc(d.mail.provider)}</b></div><p class="small muted" style="margin:0">Resend wymaga zweryfikowanej domeny (resend.com/domains → rekordy DNS).</p>`)}
          ${card(d.sms.ok, 'fa-comment-sms', 'SMS', `<div class="small">Dostawca: <b>${esc(d.sms.provider)}</b></div>${d.sms.ok ? '' : '<p class="small" style="margin:0">Bez bramki SMS-y otwierają się w telefonie do ręcznego wysłania (<code>SMSAPI_TOKEN</code>).</p>'}`)}
          ${card(s.morningSummaryEnabled !== false, 'fa-sun', 'Poranne podsumowanie (push)', `<p class="small" style="margin:0">Codziennie o wybranej godzinie: każdy dostaje swój plan dnia, biuro — przegląd (zlecenia, wyceny, należności, urlopy, flota).</p>
            <div class="btn-row"><button class="btn sm" data-morning><i class="fa-solid fa-gear"></i> Ustaw (${s.morningSummaryEnabled === false ? 'wył.' : 'godz. ' + (s.morningSummaryHour ?? 7) + ':00'})</button><button class="btn sm" data-mtest>Wyślij mi teraz</button></div>`)}
        </div>`;
      const rerender = () => views.integracje.render(el);
      $('[data-revref]', el)?.addEventListener('click', async e => { e.currentTarget.disabled = true; try { const r = await RM.api('/api/v92/reviews/refresh', { method: 'POST', body: {} }); RM.toast(r.ok ? `Google: ${r.current.count} ${plural(r.current.count, 'opinia', 'opinie', 'opinii')}, ${r.current.rating}` : r.error, r.ok ? 'ok' : 'error'); rerender(); } catch (err) { RM.fail(err); } });
      $('[data-revset]', el).addEventListener('click', () => RM.form({
        title: 'Opinie Google', subtitle: 'Place ID znajdziemy sami po numerze CID z linku do opinii. Wartości ręczne mają pierwszeństwo — zostaw puste, aby używać Google.',
        values: { googlePlaceId: d.google.placeId, reviewsManualRating: d.manual.rating, reviewsManualCount: d.manual.count },
        fields: [{ name: 'googlePlaceId', label: 'Google Place ID', full: true, placeholder: 'ChIJ…' }, { name: 'reviewsManualRating', label: 'Ocena ręcznie', type: 'number', min: 1, max: 5, step: '0.1' }, { name: 'reviewsManualCount', label: 'Liczba opinii ręcznie', type: 'number', min: 0 }],
        async onSubmit(v) { await RM.api('/api/settings', { method: 'PUT', body: v }); RM.toast('Zapisano — strona pokaże nowe wartości w ciągu kilku minut'); rerender(); }
      }));
      $('[data-s3test]', el)?.addEventListener('click', async () => { const r = await RM.api('/api/v92/storage/test', { method: 'POST', body: {} }).catch(e => ({ ok: false, error: e.message })); RM.toast(r.ok ? 'R2/S3 działa' : r.error, r.ok ? 'ok' : 'error'); });
      $('[data-s3mig]', el)?.addEventListener('click', async () => { try { await RM.api('/api/v92/storage/migrate', { method: 'POST', body: {} }); RM.toast('Migracja rozpoczęta — działa w tle'); setTimeout(rerender, 1500); } catch (e) { RM.fail(e); } });
      $('[data-morning]', el).addEventListener('click', () => RM.form({
        title: 'Poranne podsumowanie', values: { morningSummaryEnabled: s.morningSummaryEnabled !== false, morningSummaryHour: s.morningSummaryHour ?? 7 },
        fields: [{ name: 'morningSummaryEnabled', label: 'Wysyłaj codziennie', type: 'switch', full: true }, { name: 'morningSummaryHour', label: 'Godzina', type: 'number', min: 4, max: 12 }],
        async onSubmit(v) { await RM.api('/api/settings', { method: 'PUT', body: v }); Object.assign(S.settings, v); RM.toast('Zapisano'); rerender(); }
      }));
      $('[data-mtest]', el).addEventListener('click', async () => { try { const r = await RM.api('/api/v92/morning/test', { method: 'POST', body: {} }); RM.toast(r.sent ? 'Wysłano — sprawdź powiadomienia' : 'Brak treści do wysłania'); RM.refreshNotifications?.(); } catch (e) { RM.fail(e); } });
    }
  };

  /* ================================================================== */
  /* DZIENNIK ZMIAN                                                      */
  /* ================================================================== */
  const METHOD = { POST: ['dodanie', 'fa-plus'], PUT: ['zmiana', 'fa-pen'], PATCH: ['zmiana', 'fa-pen'], DELETE: ['usunięcie', 'fa-trash'] };
  views.dziennik = {
    title: 'Dziennik zmian',
    admin: true,
    async render(el) {
      el.innerHTML = '<div class="skeleton"></div>';
      const d = await RM.api('/api/v92/audit?limit=200' + (ui.auditActor ? '&actor=' + encodeURIComponent(ui.auditActor) : ''));
      el.innerHTML = `${head('Dziennik zmian', 'Kto, co i kiedy zmienił w RevMi (ostatnie 365 dni). Bez treści zdjęć i PIN-ów.',
        `<select id="auActor" class="btn" style="height:38px"><option value="">Wszyscy</option>${d.actors.map(a => `<option value="${esc(a._id)}" ${ui.auditActor === a._id ? 'selected' : ''}>${esc(a.name || a._id)} (${a.n})</option>`).join('')}</select>`)}
        <div class="card" style="padding:4px 10px;overflow:auto"><table class="rv-table"><thead><tr><th>Kiedy</th><th>Kto</th><th>Co</th><th>Szczegóły</th></tr></thead><tbody>
        ${d.items.map(a => `<tr><td class="small" style="white-space:nowrap">${esc(when(a.at))}</td><td>${esc(a.actor)}<div class="muted small">${esc(RM.ROLE_LABELS[a.role] || a.role)}</div></td>
          <td><i class="fa-solid ${(METHOD[a.method] || ['', 'fa-circle'])[1]}" style="color:var(--accent)"></i> ${esc(a.entity || 'Inne')} · ${esc((METHOD[a.method] || [a.method])[0])}${a.entity === 'Zlecenie' && a.entityId ? ` <a href="#/zlecenia/${esc(a.entityId)}">otwórz</a>` : ''}${a.status >= 400 ? ` <span class="pill no">${a.status}</span>` : ''}</td>
          <td class="small"><code style="font-size:11px">${esc(a.path.replace(/^\/api/, ''))}</code>${a.summary ? `<div class="muted">${esc(a.summary)}</div>` : ''}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Brak wpisów.</td></tr>'}
        </tbody></table></div>`;
      $('#auActor', el).addEventListener('change', e => { ui.auditActor = e.target.value; views.dziennik.render(el); });
    }
  };

  /* Liczniki w menu (urlopy do decyzji) — przy starcie i co 5 minut */
  async function counts() {
    if (!S.me) return;
    try { const d = await RM.api('/api/v92/leaves'); S.v92.leavesPending = d.pending || 0; } catch { /* offline */ }
  }
  setTimeout(counts, 5000);
  setInterval(counts, 5 * 60_000);
})();
