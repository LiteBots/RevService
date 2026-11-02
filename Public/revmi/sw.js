/* RevMi 2.0.0 — service worker: szybki start offline (powłoka aplikacji) + powiadomienia push */
const CACHE = 'revmi-2.0.0';
const SHELL = [
  '/revmi/',
  '/revmi/index.html',
  '/revmi/app.css?v=2.0.0',
  '/revmi/js/app.js?v=2.0.0',
  '/revmi/js/core.js',
  '/revmi/manifest.webmanifest',
  '/revmi/icons/icon-192.png',
  '/revmi/icons/badge-96.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('revmi-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Sieć najpierw (zawsze świeża wersja), pamięć podręczna tylko bez zasięgu. API nigdy z cache.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) return;
  if (!url.pathname.startsWith('/revmi/')) return;
  event.respondWith((async () => {
    try {
      const res = await fetch(event.request);
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(event.request, copy)).catch(() => null); }
      return res;
    } catch {
      const hit = await caches.match(event.request, { ignoreSearch: event.request.mode === 'navigate' });
      return hit || caches.match('/revmi/index.html');
    }
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'RevMi', body: event.data?.text() || '' }; }
  const options = {
    body: data.body || '',
    icon: data.icon || '/revmi/icons/icon-192.png',
    badge: data.badge || '/revmi/icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    timestamp: data.timestamp || Date.now(),
    vibrate: [120, 60, 120],
    data: { url: data.url || '/revmi/', type: data.type }
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(data.title || 'RevMi', options);
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    clients.forEach(c => c.postMessage({ type: 'push', payload: data }));
    if (self.navigator && 'setAppBadge' in self.navigator) {
      const shown = await self.registration.getNotifications();
      self.navigator.setAppBadge(shown.length).catch(() => null);
    }
  })());
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL(event.notification.data?.url || '/revmi/', self.location.origin).href;
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const client = clients.find(c => new URL(c.url).pathname.startsWith('/revmi/'));
    if (client) { await client.focus(); client.postMessage({ type: 'navigate', url: target }); return; }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('pushsubscriptionchange', event => {
  event.waitUntil((async () => {
    try {
      const res = await fetch('/api/push/public-key', { credentials: 'include' });
      const { publicKey } = await res.json();
      const pad = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch('/api/push/subscribe', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ subscription: sub.toJSON() }) });
    } catch { /* użytkownik włączy ponownie w Ustawieniach */ }
  })());
});
