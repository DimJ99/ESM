// Offline support. The shell is precached on install so the app opens offline.
const VERSION = 'esm-v4';
const SHELL = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest',
  'js/app.js', 'js/engine.js', 'js/store.js', 'js/verbs.js',
  'icons/icon.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

// Own files: network first so updates show up right away, cache when offline.
// Fonts: cache first (they never change).
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const sameOrigin = new URL(e.request.url).origin === location.origin;
  const put = res => {
    if (res.ok || res.type === 'opaque') {
      const copy = res.clone();
      caches.open(VERSION).then(c => c.put(e.request, copy));
    }
    return res;
  };
  e.respondWith(sameOrigin
    ? fetch(e.request).then(put).catch(() => caches.match(e.request, { ignoreSearch: true }))
    : caches.match(e.request).then(hit => hit || fetch(e.request).then(put)));
});
