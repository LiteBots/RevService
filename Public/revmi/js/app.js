/* RevMi 2.0.0 — start aplikacji, powłoka (menu biura / pasek ekipy), router, paleta poleceń, blokada */
import { S, api, reloadData, esc, icon, toast, modal, parseHash, go, local, isOffice, can, avatar, $, $$, VERSION, debounce, taskPlace, fmtDay, fmtTime } from './core.js';
import { loginScreen, twoFactorScreen, forceTwoFactorSetup, showLock, isLocked } from './auth.js';

const root = document.getElementById('app');

/* ------------------------------------------------------------------ */
/* Menu                                                                */
/* ------------------------------------------------------------------ */

const OFFICE_NAV = [
  { group: 'Praca' },
  { route: '', view: 'pulpit', label: 'Pulpit', icon: 'home', perm: 'dashboard' },
  { route: 'zlecenia', label: 'Zlecenia', icon: 'list', perm: 'tasks' },
  { route: 'wyceny', label: 'Wyceny', icon: 'inbox', perm: 'tasks', badge: 'wyceny' },
  { route: 'grafik', label: 'Grafik', icon: 'calendar', perm: 'dispatch', badge: 'grafik' },
  { route: 'skrzynka', label: 'Skrzynka', icon: 'mail', perm: 'sales', badge: 'skrzynka' },
  { route: 'czat', label: 'Czat ekipy', icon: 'chat', badge: 'czat' },
  { group: 'Sprzedaż' },
  { route: 'klienci', label: 'Klienci', icon: 'user', perm: 'clients' },
  { route: 'pakiety', label: 'Pakiety firm', icon: 'tag', perm: 'sales' },
  { group: 'Firma' },
  { route: 'zespol', label: 'Zespół', icon: 'users', perm: 'team', badge: 'urlopy' },
  { route: 'finanse', label: 'Finanse', icon: 'chart', perm: 'finance' },
  { route: 'magazyn', label: 'Magazyn', icon: 'box', perm: 'storage' },
  { route: 'flota', label: 'Flota', icon: 'truck', perm: 'fleet' },
  { group: 'Narzędzia' },
  { route: 'notatnik', label: 'Notatnik', icon: 'note' },
  { route: 'asystent', label: 'Asystent AI', icon: 'spark', perm: 'assistant' },
  { route: 'ustawienia', label: 'Ustawienia', icon: 'settings', bottom: true }
];

const WORKER_NAV = [
  { group: 'Mój dzień' },
  { route: '', view: 'dzien', label: 'Mój dzień', icon: 'home', tab: true },
  { route: 'trasa', label: 'Trasa', icon: 'route', tab: true },
  { route: 'czat', label: 'Czat', icon: 'chat', badge: 'czat', tab: true },
  { route: 'czas', label: 'Czas pracy', short: 'Czas', icon: 'clock', tab: true },
  { group: 'Moje' },
  { route: 'zarobki', label: 'Zarobki', icon: 'wallet' },
  { route: 'wiecej', label: 'Więcej', icon: 'menu', tab: true, badge: 'grafik' },
  { route: 'notatnik', label: 'Notatnik', icon: 'note' },
  { route: 'ustawienia', label: 'Ustawienia', icon: 'settings', bottom: true }
];

const nav = () => (isOffice() ? OFFICE_NAV : WORKER_NAV).filter(n => n.group || !n.perm || can(n.perm));

/** Nazwa trasy → moduł widoku (z aliasami starych linków z powiadomień 9.2). */
function resolve(route) {
  const { name, params, query } = route;
  const office = isOffice();
  const alias = {
    '': office ? 'pulpit' : 'dzien', pulpit: office ? 'pulpit' : 'dzien', wiadomosci: 'skrzynka', 'czat-klienci': 'skrzynka', kalendarz: 'zlecenia',
    urlopy: office ? ['zespol', 'urlopy'] : ['wiecej', 'urlopy'],
    usterki: office ? ['flota', 'usterki'] : ['wiecej', 'usterki'],
    ranking: office ? ['zespol', 'ranking'] : ['wiecej', 'ranking'],
    'czas-pracy': office ? ['zespol', 'czas'] : 'czas',
    trasa: office ? 'grafik' : 'trasa', mapa: 'grafik', rozliczenia: ['zespol', 'rozliczenia'], statystyki: 'finanse', analityka: 'finanse', naleznosci: ['finanse', 'naleznosci'],
    'flota-koszty': 'flota', oddzialy: ['zespol', 'oddzialy'], bezpieczenstwo: ['ustawienia', 'bezpieczenstwo'], integracje: ['ustawienia', 'integracje'], dziennik: ['ustawienia', 'dziennik']
  }[name];
  if (Array.isArray(alias)) return { view: alias[0], params: [alias[1], ...params], query };
  const view = alias || name;
  const known = ['pulpit', 'dzien', 'zlecenia', 'wyceny', 'grafik', 'skrzynka', 'czat', 'klienci', 'pakiety', 'zespol', 'finanse', 'magazyn', 'flota', 'notatnik', 'asystent', 'ustawienia', 'trasa', 'czas', 'zarobki', 'wiecej', 'powiadomienia'];
  return { view: known.includes(view) ? view : (office ? 'pulpit' : 'dzien'), params, query };
}

/* ------------------------------------------------------------------ */
/* Powłoka                                                             */
/* ------------------------------------------------------------------ */

function renderShell() {
  const me = S.me;
  const items = nav();
  const visible = items.filter((n, i) => !n.group || (items[i + 1] && !items[i + 1].group));
  const link = n => `<button class="nav-item" data-route="${n.route}">${icon(n.icon)}<span>${esc(n.label)}</span>${n.badge ? `<span class="count hidden" data-badge="${n.badge}"></span>` : ''}</button>`;
  const tabs = isOffice()
    ? [items.find(n => n.view === 'pulpit') || items.find(n => n.route === 'zlecenia'), items.find(n => n.route === 'zlecenia'), { plus: true }, items.find(n => n.route === 'grafik') || items.find(n => n.route === 'czat'), { route: '__menu', label: 'Menu', icon: 'menu' }].filter(Boolean)
    : WORKER_NAV.filter(n => n.tab);
  root.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="logo"><span><b>Rev</b>Mi</span><small>${VERSION}</small></div>
        ${visible.filter(n => !n.bottom).map(n => (n.group ? `<div class="nav-label">${esc(n.group)}</div>` : link(n))).join('')}
        <div class="spacer"></div>
        ${visible.filter(n => n.bottom).map(link).join('')}
        <div class="me-card" data-route="ustawienia">${avatar(me.name, me.color)}<div class="who"><b>${esc(me.name)}</b><small>${esc(me.roleLabel)}</small></div></div>
      </aside>
      <div class="main">
        <header class="topbar">
          <div class="grow" style="min-width:0"><h1 id="title" class="ellipsis">RevMi</h1><div class="sub ellipsis" id="subtitle"></div></div>
          <div id="topActions" class="row"></div>
          ${isOffice() ? `<button class="search-btn" data-palette>${icon('search', 'sm')}<span>Szukaj lub wpisz polecenie…</span><kbd>Ctrl K</kbd></button>` : ''}
          <button class="icon-btn hide-d" data-palette aria-label="Szukaj">${icon('search')}</button>
          <button class="icon-btn" data-route="powiadomienia" aria-label="Powiadomienia">${icon('bell')}<span class="dot hidden" data-badge-dot="powiadomienia"></span></button>
        </header>
        <main class="view" id="view"></main>
      </div>
    </div>
    <nav class="tabbar">${tabs.map(n => n.plus
      ? `<button data-quick aria-label="Dodaj"><span class="plus">${icon('plus')}</span></button>`
      : `<button data-route="${n.route}">${icon(n.icon)}<span>${esc(n.short || n.label)}</span>${n.badge ? `<span class="count hidden" data-badge="${n.badge}"></span>` : ''}</button>`).join('')}</nav>`;

  root.addEventListener('click', e => {
    const r = e.target.closest('[data-route]');
    if (r) { if (r.dataset.route === '__menu') return openMenuSheet(); go(r.dataset.route); }
    if (e.target.closest('[data-palette]')) openPalette();
    if (e.target.closest('[data-quick]')) openQuickAdd();
  });
}

function setActive(route) {
  const name = route.name === 'pulpit' ? '' : route.name;
  $$('[data-route]').forEach(b => b.classList.toggle('on', b.dataset.route === name && !b.classList.contains('me-card')));
}

function openMenuSheet() {
  const items = nav().filter(n => !n.group);
  modal({
    title: 'Menu',
    body: `<div class="grid g3">${items.map(n => `<button class="card click col" data-go="${n.route}" style="align-items:center;gap:6px;text-align:center">${icon(n.icon, 'lg')}<b class="small">${esc(n.label)}</b>${n.badge && S.badges[n.badge] ? `<span class="pill mint">${S.badges[n.badge]}</span>` : ''}</button>`).join('')}</div>
      <a class="btn ghost block" href="/revmi-9/">${icon('layers')} Moduły dodatkowe (panel klasyczny 9.2)</a>`,
    onMount: (el, close) => el.addEventListener('click', e => { const b = e.target.closest('[data-go]'); if (b) { close(); go(b.dataset.go); } })
  });
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

let cleanup = null;
let renderToken = 0;

const ctx = {
  setTitle(title, sub = '', actions = '') {
    $('#title').textContent = title;
    $('#subtitle').textContent = sub;
    $('#topActions').innerHTML = actions;
    document.title = `${title} · RevMi`;
  }
};

async function route() {
  if (!S.me || isLocked()) return;
  const r = parseHash();
  const { view, params, query } = resolve(r);
  setActive(r);
  if (typeof cleanup === 'function') { try { cleanup(); } catch { /* widok już zamknięty */ } }
  cleanup = null;
  const token = ++renderToken;
  const el = $('#view');
  el.innerHTML = '<div class="skeleton"></div><div class="skeleton" style="min-height:220px"></div>';
  ctx.setTitle('', '');
  window.scrollTo(0, 0);
  try {
    const mod = await import(`./views/${view}.js?v=${VERSION}`);
    if (token !== renderToken) return;
    el.innerHTML = '';
    cleanup = await mod.default(el, { params, query, ctx, view });
  } catch (error) {
    if (token !== renderToken) return;
    console.error(error);
    el.innerHTML = `<div class="card empty">${icon('alert')}<b>Nie udało się otworzyć ekranu</b>${esc(error.message)}<br><br><a class="btn" href="">Odśwież</a></div>`;
  }
}

/* ------------------------------------------------------------------ */
/* Liczniki                                                            */
/* ------------------------------------------------------------------ */

async function refreshBadges() {
  try {
    S.badges = await api('/v2/badges');
    for (const el of $$('[data-badge]')) {
      const n = S.badges[el.dataset.badge] || 0;
      el.textContent = n > 99 ? '99+' : n;
      el.classList.toggle('hidden', !n);
    }
    for (const el of $$('[data-badge-dot]')) el.classList.toggle('hidden', !S.badges[el.dataset.badgeDot]);
    if ('setAppBadge' in navigator) {
      const total = (S.badges.wyceny || 0) + (S.badges.czat || 0) + (S.badges.skrzynka || 0);
      (total ? navigator.setAppBadge(total) : navigator.clearAppBadge()).catch(() => null);
    }
  } catch { /* offline */ }
}
S.hooks.refreshBadges = refreshBadges;

/* ------------------------------------------------------------------ */
/* Paleta poleceń (Ctrl+K) i szybkie dodawanie                         */
/* ------------------------------------------------------------------ */

function openPalette() {
  const actions = [
    ...(isOffice() && can('tasks') ? [{ ico: 'plus', label: 'Nowe zlecenie', run: () => import('./taskform.js').then(m => m.openTaskForm()) }] : []),
    ...(can('clients') ? [{ ico: 'user', label: 'Nowy klient / lead', run: () => go('klienci?nowy=1') }] : []),
    { ico: 'note', label: 'Nowa notatka', run: () => go('notatnik?nowa=1') },
    { ico: 'wrench', label: 'Zgłoś usterkę', run: () => go(isOffice() ? 'flota/usterki?nowa=1' : 'wiecej/usterki?nowa=1') },
    { ico: 'sun', label: 'Przełącz motyw jasny / ciemny', run: toggleTheme },
    ...nav().filter(n => !n.group).map(n => ({ ico: n.icon, label: `Przejdź: ${n.label}`, run: () => go(n.route) }))
  ];
  let sel = 0;
  let results = [];
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `<div class="palette"><input placeholder="Szukaj zleceń, klientów albo wpisz polecenie…" autocomplete="off"><div class="results"></div></div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('input');
  const box = overlay.querySelector('.results');
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  const search = () => {
    const q = input.value.trim().toLowerCase();
    const tasks = (S.data?.tasks || []).filter(t => !q || [t.name, t.clientName, t.clientPhone, t.address, t.number].some(v => String(v || '').toLowerCase().includes(q))).slice(0, q ? 8 : 4)
      .map(t => ({ ico: 'list', label: t.name, sub: `${t.clientName || ''} · ${fmtDay(t.dateStart)} ${fmtTime(t.dateStart)} · ${taskPlace(t)}`, run: () => go('zlecenia/' + t._id) }));
    const clients = (S.data?.clients || []).filter(c => q && [c.name, c.company, c.phone, c.email].some(v => String(v || '').toLowerCase().includes(q))).slice(0, 5)
      .map(c => ({ ico: 'user', label: c.company || c.name, sub: [c.phone, c.email].filter(Boolean).join(' · '), run: () => go('klienci/' + c._id) }));
    const acts = actions.filter(a => !q || a.label.toLowerCase().includes(q)).slice(0, q ? 6 : 8);
    results = [...acts, ...tasks, ...clients];
    sel = 0;
    paint();
  };
  const paint = () => {
    box.innerHTML = results.length ? results.map((r, i) => `<div class="res ${i === sel ? 'on' : ''}" data-i="${i}">${icon(r.ico)}<div class="grow"><b>${esc(r.label)}</b>${r.sub ? `<small class="ellipsis">${esc(r.sub)}</small>` : ''}</div></div>`).join('') : '<div class="empty">Nic nie znaleziono</div>';
  };
  const onKey = e => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown') { sel = Math.min(results.length - 1, sel + 1); paint(); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); paint(); e.preventDefault(); }
    else if (e.key === 'Enter' && results[sel]) { close(); results[sel].run(); }
  };
  overlay.addEventListener('click', e => {
    if (e.target === overlay) return close();
    const r = e.target.closest('[data-i]');
    if (r) { close(); results[Number(r.dataset.i)].run(); }
  });
  input.addEventListener('input', debounce(search, 80));
  document.addEventListener('keydown', onKey);
  search();
  setTimeout(() => input.focus(), 30);
}

function openQuickAdd() {
  const items = [
    ...(can('tasks') ? [['task', 'list', 'Zlecenie']] : []),
    ...(can('clients') ? [['client', 'user', 'Klient / lead']] : []),
    ['note', 'note', 'Notatka'],
    ...(can('finance') ? [['cost', 'wallet', 'Koszt']] : []),
    ['fault', 'wrench', 'Usterka']
  ];
  modal({
    title: 'Dodaj',
    body: `<div class="grid g3">${items.map(([k, ic, label]) => `<button class="card click col" data-k="${k}" style="align-items:center;gap:6px">${icon(ic, 'lg')}<b class="small">${label}</b></button>`).join('')}</div>`,
    onMount: (el, close) => el.addEventListener('click', e => {
      const b = e.target.closest('[data-k]');
      if (!b) return;
      close();
      const k = b.dataset.k;
      if (k === 'task') import('./taskform.js').then(m => m.openTaskForm());
      if (k === 'client') go('klienci?nowy=1');
      if (k === 'note') go('notatnik?nowa=1');
      if (k === 'cost') go('finanse/koszty?nowy=1');
      if (k === 'fault') go(isOffice() ? 'flota/usterki?nowa=1' : 'wiecej/usterki?nowa=1');
    })
  });
}

export function toggleTheme() {
  const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
  if (next === 'light') document.documentElement.dataset.theme = 'light'; else delete document.documentElement.dataset.theme;
  local.set('theme', next);
  document.querySelector('meta[name=theme-color]')?.setAttribute('content', next === 'light' ? '#f4f6f5' : '#0b0c0f');
}

/* ------------------------------------------------------------------ */
/* Powiadomienia push                                                  */
/* ------------------------------------------------------------------ */

export async function enablePush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Ta przeglądarka nie obsługuje powiadomień. Na iPhonie dodaj RevMi do ekranu początkowego (Safari → Udostępnij).');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Powiadomienia są zablokowane w ustawieniach przeglądarki');
  const reg = await navigator.serviceWorker.ready;
  const { publicKey } = await api('/push/public-key');
  const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
  const raw = atob((publicKey + padding).replace(/-/g, '+').replace(/_/g, '/'));
  const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  await api('/push/subscribe', { method: 'POST', body: { subscription: sub.toJSON() } });
}
S.hooks.enablePush = enablePush;
S.hooks.toggleTheme = toggleTheme;

/* ------------------------------------------------------------------ */
/* Blokada po bezczynności                                             */
/* ------------------------------------------------------------------ */

const markActive = debounce(() => local.set('lastActive', Date.now()), 2000);
function lockDue() {
  const minutes = Number(S.me?.lockMinutes || 0);
  if (!minutes || !S.me?.hasPin || S.me.demo) return false;
  const last = Number(local.get('lastActive', 0));
  return last && Date.now() - last > minutes * 60_000;
}
function checkLock() { if (lockDue()) showLock(() => { route(); refreshBadges(); }); }

/* ------------------------------------------------------------------ */
/* Start                                                               */
/* ------------------------------------------------------------------ */

async function enterApp() {
  S.me = await api('/v2/me');
  if (S.me.must2faSetup) return forceTwoFactorSetup(root, S.me, () => location.reload());
  await reloadData();
  renderShell();
  if (lockDue()) showLock(() => { route(); refreshBadges(); });
  else { local.set('lastActive', Date.now()); route(); }
  refreshBadges();
  // Ekipa: automatyczny przyjazd na miejsce zlecenia (gdy trwa praca i jest zgoda na GPS)
  if (!isOffice()) import('./views/czas.js').then(m => m.autoGeo()).catch(() => null);
  setInterval(refreshBadges, 30_000);
  setInterval(() => { if (document.visibilityState === 'visible') reloadData().catch(() => null); }, 120_000);
}

async function boot() {
  S.hooks.onUnauthorized = () => { if (S.me) { S.me = null; location.reload(); } };
  S.hooks.on2faSetup = () => { if (S.me && !S.me.must2faSetup) location.reload(); };
  try {
    const session = await api('/auth/session');
    if (session.need2fa) return twoFactorScreen(root, session.name, () => enterApp());
    if (!session.authenticated) return loginScreen(root, () => enterApp());
    await enterApp();
  } catch (error) {
    root.innerHTML = `<div class="boot"><div class="col" style="align-items:center;text-align:center;padding:24px"><div class="mark"><b>Rev</b>Mi</div><p class="muted">${esc(error.message)}</p><a class="btn primary" href="">Spróbuj ponownie</a></div></div>`;
  }
}

window.addEventListener('hashchange', () => route());
document.addEventListener('pointerdown', markActive, { passive: true });
document.addEventListener('keydown', e => {
  markActive();
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k' && S.me) { e.preventDefault(); openPalette(); }
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && S.me) { checkLock(); refreshBadges(); }
  else if (S.me) local.set('lastActive', Date.now());
});
function offlineBar() {
  let bar = $('.offline-bar');
  if (!navigator.onLine && !bar) { bar = document.createElement('div'); bar.className = 'offline-bar'; bar.textContent = 'Brak zasięgu — zmiany zapiszą się, gdy wróci internet'; document.body.appendChild(bar); }
  if (navigator.onLine && bar) { bar.remove(); toast('Znowu online', 'ok'); refreshBadges(); }
}
window.addEventListener('online', offlineBar);
window.addEventListener('offline', offlineBar);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/revmi/sw.js', { scope: '/revmi/' }).catch(() => null);
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'navigate' && e.data.url) { const u = new URL(e.data.url); location.hash = u.hash || '#/'; }
    if (e.data?.type === 'push') refreshBadges();
  });
}

boot();
