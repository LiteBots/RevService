/* RevMi 2.1.0 — rdzeń: API, stan, router, ikony, okna, formularze, formatowanie */

export const VERSION = '2.1.0';

/* ------------------------------------------------------------------ */
/* Stan aplikacji                                                      */
/* ------------------------------------------------------------------ */

export const S = {
  me: null,          // /api/v2/me
  data: null,        // /api/data (zlecenia, zespół, flota, klienci…)
  badges: {},
  hooks: {}          // app.js: onUnauthorized, on2faSetup, refreshBadges
};

export const OFFICE_ROLES = ['admin', 'dispatcher', 'manager', 'accountant'];
export const isOffice = () => OFFICE_ROLES.includes(S.me?.role);
export const isAdmin = () => S.me?.role === 'admin';
export const can = perm => {
  const p = S.me?.perms || [];
  return p.includes('*') || p.includes(perm) || p.includes(perm + ':read');
};
export const canWrite = perm => { const p = S.me?.perms || []; return p.includes('*') || p.includes(perm); };

/* ------------------------------------------------------------------ */
/* API                                                                 */
/* ------------------------------------------------------------------ */

export async function api(path, { method = 'GET', body, raw = false, signal } = {}) {
  let res;
  try {
    res = await fetch('/api' + path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json', 'X-Requested-With': 'RevMi' } : { 'X-Requested-With': 'RevMi' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new Error(navigator.onLine ? 'Brak połączenia z serwerem' : 'Jesteś offline — spróbuj ponownie po odzyskaniu zasięgu');
  }
  if (raw) return res;
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && !path.startsWith('/login') && !path.startsWith('/v2/login') && !path.startsWith('/v2/unlock')) S.hooks.onUnauthorized?.(data);
  if (res.status === 403 && data.need2faSetup) S.hooks.on2faSetup?.();
  if (!res.ok || data.success === false) {
    const error = new Error(data.message || `Błąd ${res.status}`);
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

/** Ponowne pobranie danych startowych (po zmianach w zleceniach, zespole itp.). */
export async function reloadData() {
  S.data = await api('/data');
  return S.data;
}

/* ------------------------------------------------------------------ */
/* Formatowanie                                                        */
/* ------------------------------------------------------------------ */

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const nf = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 2 });
export const money = v => nf.format(Math.round(Number(v) || 0)) + ' zł';
export const money2 = v => nf2.format(Number(v) || 0) + ' zł';
export const num = v => nf.format(Number(v) || 0);
export const pad = n => String(n).padStart(2, '0');
export const dayKey = d => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
export const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
export const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const startOfWeek = d => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
export const fmtTime = d => (d ? new Date(d).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '');
export const fmtDate = d => (d ? new Date(d).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
export const fmtDay = d => (d ? new Date(d).toLocaleDateString('pl-PL', { weekday: 'short', day: 'numeric', month: 'short' }) : '');
export const fmtDayLong = d => new Date(d).toLocaleDateString('pl-PL', { weekday: 'long', day: 'numeric', month: 'long' });
export const fmtDateTime = d => (d ? `${fmtDay(d)}, ${fmtTime(d)}` : '—');
export const minutesLabel = m => { const h = Math.floor((m || 0) / 60); const r = Math.round((m || 0) % 60); return h ? `${h} h ${pad(r)} min` : `${r} min`; };
export const hhmmss = ms => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`; };
export function relDay(d) {
  const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);
  if (diff === 0) return 'dziś';
  if (diff === 1) return 'jutro';
  if (diff === -1) return 'wczoraj';
  if (diff > 1 && diff < 7) return new Date(d).toLocaleDateString('pl-PL', { weekday: 'long' });
  return fmtDate(d);
}
export function ago(d) {
  const s = (Date.now() - new Date(d)) / 1000;
  if (s < 60) return 'przed chwilą';
  if (s < 3600) return `${Math.floor(s / 60)} min temu`;
  if (s < 86400) return `${Math.floor(s / 3600)} h temu`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} dni temu`;
  return fmtDate(d);
}
export const plural = (n, one, few, many) => `${n} ${n === 1 ? one : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? few : many}`;
export const initials = name => String(name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(s => s[0]).join('').toUpperCase();
export const avatar = (name, color, cls = '') => `<span class="avatar ${cls}" style="background:${esc(color || '#03F0BA')}" title="${esc(name)}">${esc(initials(name))}</span>`;
export const taskAmount = t => Number(t.finalPrice ?? t.price) || 0;
export const taskPlace = t => t.address || [t.addressFrom, t.addressTo].filter(Boolean).join(' → ');

export const STATUS = {
  new: { label: 'Nowa wycena', cls: 'amber' },
  quoted: { label: 'Wycenione', cls: 'violet' },
  planned: { label: 'Zaplanowane', cls: 'blue' },
  progress: { label: 'W realizacji', cls: 'mint' },
  completed: { label: 'Zakończone', cls: '' },
  cancelled: { label: 'Anulowane', cls: 'red' }
};
export const statusPill = s => `<span class="pill ${STATUS[s]?.cls || ''}">${esc(STATUS[s]?.label || s)}</span>`;
export const PAY = { unpaid: { label: 'Nieopłacone', cls: 'amber' }, partial: { label: 'Częściowo', cls: 'amber' }, paid: { label: 'Opłacone', cls: 'mint' } };

export const employeeColor = id => S.data?.employees?.find(e => String(e._id) === String(id))?.color || '#03F0BA';
export const employeeName = id => S.data?.employees?.find(e => String(e._id) === String(id))?.name || '';
export const workersAvatars = (t, max = 4) => {
  const w = (t.workers || []).slice(0, max);
  return w.length ? `<span class="avatars">${w.map(x => avatar(x.name, employeeColor(x.employee), 'sm')).join('')}</span>` : '';
};

/* ------------------------------------------------------------------ */
/* Ikony (SVG, 24×24, obrys)                                           */
/* ------------------------------------------------------------------ */

const P = {
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>',
  inbox: '<path d="M3 13l3-8h12l3 8v6a1 1 0 01-1 1H4a1 1 0 01-1-1zM3 13h5l1 3h6l1-3h5"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21c0-4 3-7 7-7s7 3 7 7M17 4a4 4 0 010 8M22 21c0-3-2-6-5-7"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/>',
  tag: '<path d="M3 3h8l10 10-8 8L3 11z"/><circle cx="7.5" cy="7.5" r="1.5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  box: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10"/>',
  truck: '<path d="M2 6h12v10H2zM14 9h4l4 4v3h-8"/><circle cx="6" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
  note: '<path d="M5 3h10l4 4v14H5zM14 3v5h5M8 12h8M8 16h5"/>',
  spark: '<path d="M12 3l2.2 5.8L20 11l-5.8 2.2L12 19l-2.2-5.8L4 11l5.8-2.2z"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  bell: '<path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  phone: '<path d="M5 3h4l2 5-2.5 1.5a11 11 0 005 5L15 12l5 2v4a2 2 0 01-2 2A16 16 0 013 5a2 2 0 012-2"/>',
  map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14"/>',
  nav: '<path d="M3 11l18-8-8 18-2-8z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  wallet: '<rect x="2" y="6" width="20" height="14" rx="2"/><path d="M2 10h20M16 15h2"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 01-10 0zM7 6H4a3 3 0 003 4M17 6h3a3 3 0 01-3 4"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 00-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 005.4-5.4l-2.5 2.5-2.4-.6-.6-2.4z"/>',
  logout: '<path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/>',
  lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 018 0v4"/>',
  shield: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 011 1v11a1 1 0 01-1 1H4a1 1 0 01-1-1V8a1 1 0 011-1z"/><circle cx="12" cy="13" r="4"/>',
  send: '<path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16zM14 6l4 4"/>',
  more: '<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  refresh: '<path d="M20 11a8 8 0 10-2.3 5.7M20 4v7h-7"/>',
  play: '<path d="M7 4l13 8-13 8z"/>',
  pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z"/>',
  stop: '<rect x="5" y="5" width="14" height="14" rx="2"/>',
  pin: '<path d="M12 22s7-6.5 7-12a7 7 0 00-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="10" r="2.5"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>',
  moon: '<path d="M21 13A9 9 0 1111 3a7 7 0 0010 10z"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  alert: '<path d="M12 3l10 18H2zM12 10v5M12 18h.01"/>',
  file: '<path d="M6 2h9l5 5v15H6zM14 2v6h6"/>',
  swap: '<path d="M7 7h13l-4-4M17 17H4l4 4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H15a3.5 3.5 0 000-7H9a3.5 3.5 0 010-7h6.5"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 00-2-2H5a2 2 0 00-2 2v9a2 2 0 002 2h3"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  sms: '<path d="M4 5h16v11H9l-5 4zM8 10h.01M12 10h.01M16 10h.01"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5"/>',
  move: '<path d="M3 9.5L12 4l9 5.5M5 8.5V19h14V8.5M9.5 19v-6h5v6"/>',
  leaf: '<path d="M5 19C5 10 11 5 20 5c0 9-5 15-14 15M5 19l7-7"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"/>',
  drop: '<path d="M12 3s6.5 6.5 6.5 11a6.5 6.5 0 01-13 0C5.5 9.5 12 3 12 3z"/>',
  hammer: '<path d="M14 6l4 4M4 20l9-9M11 4l7 7 2-2-7-7z"/>',
  warehouse: '<path d="M3 20V9l9-5 9 5v11M7 20v-7h10v7M7 16h10"/>',
  bus: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3M8 14.5h.01M16 14.5h.01"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4.5"/><path d="M12 12h.01"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  trend: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
  car: '<path d="M5 16v-5l2-5h10l2 5v5M3 16h18v3.5H3zM7.5 13.5h.01M16.5 13.5h.01M5 11h14"/>',
  key: '<circle cx="15" cy="9" r="5"/><path d="M11.5 12.5L3 21M6 18l2 2M8.5 15.5l2 2"/>',
  face: '<path d="M4 8V6a2 2 0 012-2h2M16 4h2a2 2 0 012 2v2M20 16v2a2 2 0 01-2 2h-2M8 20H6a2 2 0 01-2-2v-2M9 9.5v1M15 9.5v1M12 9.5V13h-1M9.5 15.5a3.5 3.5 0 005 0"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  euro: '<path d="M18 7a6 6 0 100 10M4 10h10M4 14h10"/>',
  filter: '<path d="M3 5h18l-7 8.5V19l-4 2v-7.5z"/>'
};
export const icon = (name, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${P[name] || P.more}</svg>`;

/** Kolorowy kafelek z ikoną (styl RevMi PRO). color: mint|blue|violet|orange|pink|amber|cyan|red|lime|indigo|teal|slate */
export const tile = (name, color = 'mint', cls = '') => `<span class="tile c-${color} ${cls}">${icon(name)}</span>`;

/** Usługi: ikona i kolor po nazwie (pole Task.type bywa dowolnym tekstem, więc dopasowanie po słowach). */
const SERVICES = [
  [/przeprow/i, 'move', 'blue'], [/opróżn|oprozn|wywóz|wywoz|utyliz|gruz|odpad|kontener/i, 'trash', 'orange'],
  [/odśnie|odsnie|śnieg|snieg|zim/i, 'snow', 'cyan'], [/ogr[oó]d|działk|dzialk|kosz|wycink|zieleń/i, 'leaf', 'lime'],
  [/myci|ciśnien|cisnien|elewac|kostk/i, 'drop', 'indigo'], [/sprząt|sprzat|czyszcz/i, 'spark', 'pink'],
  [/rozbi[oó]r|wyburz|ziemne|kopar/i, 'hammer', 'red'], [/magazyn/i, 'warehouse', 'amber'],
  [/przewóz osób|przewoz osob|bus/i, 'bus', 'violet'], [/transport|przewóz|przewoz/i, 'truck', 'violet'],
  [/pakiet|abonament|firm/i, 'layers', 'indigo'], [/oględzin|ogledzin|wycen/i, 'eye', 'amber']
];
export function serviceOf(type) {
  const hit = SERVICES.find(([re]) => re.test(String(type || '')));
  return hit ? { icon: hit[1], color: hit[2] } : { icon: 'list', color: 'slate' };
}
export const serviceTile = (type, cls = '') => { const s = serviceOf(type); return tile(s.icon, s.color, cls); };
/** Kolor usługi jako zmienne CSS (--a/--b) — do bloków w grafiku i kart. */
export const serviceClass = type => 'c-' + serviceOf(type).color;

/* ------------------------------------------------------------------ */
/* DOM                                                                  */
/* ------------------------------------------------------------------ */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export function on(root, event, selector, handler) {
  root.addEventListener(event, e => {
    const target = e.target.closest(selector);
    if (target && root.contains(target)) handler(e, target);
  });
}
export const debounce = (fn, ms = 250) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/** Przycisk w stanie ładowania na czas akcji; błędy jako toast. */
export async function busy(btn, fn) {
  if (btn) btn.classList.add('loading');
  try { return await fn(); }
  catch (error) { toast(error.message, 'err'); return undefined; }
  finally { if (btn) btn.classList.remove('loading'); }
}

/* ------------------------------------------------------------------ */
/* Toasty, okna, potwierdzenia                                         */
/* ------------------------------------------------------------------ */

export function toast(message, type = '') {
  let box = $('.toasts');
  if (!box) { box = document.createElement('div'); box.className = 'toasts'; document.body.appendChild(box); }
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = `${type === 'ok' ? icon('check', 'sm') : type === 'err' ? icon('alert', 'sm') : ''}<span>${esc(message)}</span>`;
  box.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, type === 'err' ? 4600 : 2800);
}

/**
 * Okno (na telefonie arkusz od dołu). `body` = HTML, `onMount(el, close)` podpina zdarzenia.
 * Zwraca funkcję zamykającą.
 */
export function modal({ title, body = '', foot = '', wide = false, onMount, onClose }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h3>${esc(title)}</h3><button class="icon-btn" data-close aria-label="Zamknij">${icon('x')}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  overlay.addEventListener('click', e => { if (e.target === overlay || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(overlay);
  onMount?.(overlay.querySelector('.modal'), close);
  setTimeout(() => overlay.querySelector('input:not([type=hidden]):not([type=checkbox]), textarea, select')?.focus(), 60);
  return close;
}

export function confirmBox(text, { ok = 'Tak', danger = false, title = 'Potwierdź' } = {}) {
  return new Promise(resolve => {
    let done = false;
    const close = modal({
      title,
      body: `<p>${esc(text)}</p>`,
      foot: `<button class="btn ghost" data-close>Anuluj</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`,
      onMount: (el, c) => el.querySelector('[data-ok]').addEventListener('click', () => { done = true; resolve(true); c(); }),
      onClose: () => { if (!done) resolve(false); }
    });
    return close;
  });
}

export function lightbox(src) {
  const el = document.createElement('div');
  el.className = 'lightbox';
  el.innerHTML = `<img src="${esc(src)}" alt="">`;
  el.addEventListener('click', () => el.remove());
  document.body.appendChild(el);
}

/* ------------------------------------------------------------------ */
/* Formularze                                                          */
/* ------------------------------------------------------------------ */

/**
 * Pole formularza. f = { name, label, type: text|number|date|datetime|time|select|textarea|checkbox|switch|email|tel|password|color,
 *   value, options: [[value, label]], placeholder, required, full, hint, min, max, step }
 */
export function fieldHtml(f) {
  const v = f.value ?? '';
  const attrs = `name="${esc(f.name)}" ${f.required ? 'required' : ''} ${f.placeholder ? `placeholder="${esc(f.placeholder)}"` : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.max !== undefined ? `max="${f.max}"` : ''} ${f.step !== undefined ? `step="${f.step}"` : ''} ${f.autocomplete ? `autocomplete="${f.autocomplete}"` : ''}`;
  let control;
  if (f.type === 'select') {
    control = `<select class="input" ${attrs}>${(f.options || []).map(([val, label]) => `<option value="${esc(val)}" ${String(val) === String(v) ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select>`;
  } else if (f.type === 'textarea') {
    control = `<textarea class="input" ${attrs} rows="${f.rows || 3}">${esc(v)}</textarea>`;
  } else if (f.type === 'checkbox') {
    return `<label class="check ${f.full ? 'full' : ''}"><input type="checkbox" name="${esc(f.name)}" ${v ? 'checked' : ''}><span>${esc(f.label)}</span></label>`;
  } else if (f.type === 'switch') {
    return `<label class="row between ${f.full ? 'full' : ''}" style="cursor:pointer"><span><b>${esc(f.label)}</b>${f.hint ? `<br><span class="small muted">${esc(f.hint)}</span>` : ''}</span><span class="switch"><input type="checkbox" name="${esc(f.name)}" ${v ? 'checked' : ''}><i></i></span></label>`;
  } else {
    const type = f.type === 'datetime' ? 'datetime-local' : f.type || 'text';
    const val = f.type === 'datetime' && v ? toLocalInput(v) : f.type === 'date' && v ? dayKey(v) : v;
    control = `<input class="input" type="${type}" ${attrs} value="${esc(val)}" ${type === 'number' ? 'inputmode="decimal"' : ''}>`;
  }
  return `<label class="field ${f.full ? 'full' : ''}"><span>${esc(f.label)}${f.required ? ' *' : ''}</span>${control}${f.hint ? `<span class="tiny muted" style="font-weight:500">${esc(f.hint)}</span>` : ''}</label>`;
}
export const toLocalInput = d => { const x = new Date(d); return `${dayKey(x)}T${pad(x.getHours())}:${pad(x.getMinutes())}`; };

/** Odczyt formularza: liczby jako Number (puste = ''), pola wyboru jako true/false. */
export function readForm(root) {
  const out = {};
  for (const el of root.querySelectorAll('[name]')) {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'number') out[el.name] = el.value === '' ? '' : Number(el.value);
    else if (el.type === 'datetime-local') out[el.name] = el.value ? new Date(el.value).toISOString() : '';
    else out[el.name] = el.value.trim();
  }
  return out;
}

/** Okno z formularzem. onSubmit(values) może rzucić błąd — wtedy okno zostaje otwarte. */
export function formModal({ title, fields, submit = 'Zapisz', wide = false, intro = '', extraFoot = '', onSubmit, onMount }) {
  return modal({
    title, wide,
    body: `${intro}<form class="form-grid" novalidate>${fields.map(fieldHtml).join('')}<button type="submit" hidden></button></form>`,
    foot: `${extraFoot}<button class="btn ghost" data-close>Anuluj</button><button class="btn primary" data-submit>${esc(submit)}</button>`,
    onMount: (el, close) => {
      const form = el.querySelector('form');
      const btn = el.querySelector('[data-submit]');
      const go = async e => {
        e?.preventDefault();
        const values = readForm(form);
        const missing = fields.filter(f => f.required && (values[f.name] === '' || values[f.name] === undefined));
        if (missing.length) { toast(`Uzupełnij: ${missing.map(f => f.label).join(', ')}`, 'err'); return; }
        await busy(btn, async () => { const r = await onSubmit(values, el); if (r !== false) close(); });
      };
      form.addEventListener('submit', go);
      btn.addEventListener('click', go);
      onMount?.(el, close);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Zdjęcia                                                             */
/* ------------------------------------------------------------------ */

/** Pomniejsza zdjęcie w przeglądarce (JPEG, dłuższy bok `max`) → data URL. */
export function compressImage(file, max = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Nie można odczytać zdjęcia')); };
    img.src = url;
  });
}

export function pickPhotos({ multiple = true, camera = false } = {}) {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = multiple;
    if (camera) input.capture = 'environment';
    input.onchange = async () => {
      const files = [...input.files].slice(0, 10);
      const out = [];
      for (const f of files) { try { out.push(await compressImage(f)); } catch { /* pomijamy */ } }
      resolve(out);
    };
    input.click();
  });
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

export function parseHash(hash = location.hash) {
  const clean = hash.replace(/^#\/?/, '');
  const [path, query = ''] = clean.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || '', params: parts.slice(1), query: Object.fromEntries(new URLSearchParams(query)) };
}
export const go = path => { location.hash = '#/' + String(path).replace(/^#?\/?/, ''); };

/* Ustawienia na tym urządzeniu (bez danych wrażliwych) */
export const local = {
  get(key, fallback = null) { try { const v = localStorage.getItem('revmi2.' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; } },
  set(key, value) { try { localStorage.setItem('revmi2.' + key, JSON.stringify(value)); } catch { /* tryb prywatny */ } }
};

export const emptyState = (title, text = '', ico = 'inbox') => `<div class="empty">${icon(ico)}<b>${esc(title)}</b>${esc(text)}</div>`;
export const skeleton = (n = 3, h = 110) => Array.from({ length: n }, () => `<div class="skeleton" style="min-height:${h}px"></div>`).join('');
