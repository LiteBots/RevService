/* RevMi — service worker: powiadomienia push + szybki start offline */
'use strict';

const VERSION = 'revmi-4.0.0';
const SHELL = [
  '/revmi/',
  '/revmi/app.css?v=4.0.0',
  '/assets/divisions.js?v=4.0.0',
  '/revmi/app-core.js?v=4.0.0',
  '/revmi/app-views.js?v=4.0.0',
  '/revmi/app-biz.js?v=4.0.0',
  '/revmi/app-main.js?v=4.0.0',
  '/revmi/manifest.webmanifest',
  '/revmi/icons/icon-192.png',
  '/revmi/icons/mark-256.png',
  '/revmi/icons/badge-96.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(VERSION).then(cache => cache.addAll(SHELL)).catch(() => null));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('revmi-') && k !== VERSION).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

// Pliki panelu: najpierw sieć (zawsze świeża wersja), w razie braku internetu — pamięć.
// API nigdy nie jest cache'owane w service workerze.
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);
  const shellAsset = url.pathname === '/assets/divisions.js';
  if (req.method !== 'GET' || url.origin !== self.location.origin || !(url.pathname.startsWith('/revmi/') || shellAsset)) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(req);
      if (fresh.ok) {
        const cache = await caches.open(VERSION);
        cache.put(req, fresh.clone()).catch(() => null);
      }
      return fresh;
    } catch {
      const cached = await caches.match(req, { ignoreSearch: req.mode === 'navigate' });
      return cached || caches.match('/revmi/') || Response.error();
    }
  })());
});

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'RevMi', body: event.data?.text() || '' }; }
  const title = data.title || 'RevMi';
  const options = {
    body: data.body || '',
    icon: data.icon || '/revmi/icons/icon-192.png',
    badge: data.badge || '/revmi/icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    timestamp: data.timestamp || Date.now(),
    vibrate: [120, 60, 120],
    data: { url: data.url || '/revmi/', type: data.type },
    actions: data.url && data.url.includes('/zlecenia/') ? [{ action: 'open', title: 'Otwórz zlecenie' }]
      : data.url && data.url.includes('/wiadomosci/') ? [{ action: 'open', title: 'Otwórz wiadomość' }]
      : data.url && data.url.includes('/notatnik/') ? [{ action: 'open', title: 'Otwórz notatkę' }] : []
  };
  event.waitUntil((async () => {
    await self.registration.showNotification(title, options);
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
    if (client) {
      await client.focus();
      client.postMessage({ type: 'navigate', url: target });
      return;
    }
    await self.clients.openWindow(target);
  })());
});

self.addEventListener('pushsubscriptionchange', event => {
  // Przeglądarka odnowiła subskrypcję — zgłaszamy nową do serwera (sesja w cookie).
  event.waitUntil((async () => {
    try {
      const res = await fetch('/api/push/public-key', { credentials: 'include' });
      const { publicKey } = await res.json();
      const pad = '='.repeat((4 - (publicKey.length % 4)) % 4);
      const raw = atob((publicKey + pad).replace(/-/g, '+').replace(/_/g, '/'));
      const key = Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch('/api/push/subscribe', {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON() })
      });
    } catch { /* użytkownik włączy ponownie w panelu */ }
  })());
});
