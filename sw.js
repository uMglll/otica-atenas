// Service worker da Ótica Atenas: só mostra uma página amigável quando não há internet.
// Não guarda o site em cache, então as atualizações aparecem na hora.
const CACHE = 'atenas-offline-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll([OFFLINE, '/logo.svg'])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  if (e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(OFFLINE)));
});
