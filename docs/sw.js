'use strict';
// Verhoog VERSION bij elke release, dan haalt de telefoon de nieuwe bestanden op.
const VERSION = 'ct-2026-09-28-3';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'scan.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png'];
const CDN = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com', 'images.openfoodfacts.org'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== 'ct-cdn').map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // App zelf: eerst het netwerk (altijd de nieuwste versie), offline uit de cache.
  if (url.origin === self.location.origin) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
    return;
  }

  // Bibliotheken, lettertype en productfoto's veranderen niet: uit de cache.
  if (CDN.includes(url.hostname)) {
    e.respondWith(caches.open('ct-cdn').then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
  }
  // Open Food Facts-API: gewoon via het netwerk.
});
