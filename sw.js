const CACHE = 'chaseline-v3';
const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/style.css',
  './js/profile.js',
  './js/skills.js',
  './js/tracks.js',
  './js/physics.js',
  './js/rig.js',
  './js/audio.js',
  './js/render.js',
  './js/ai.js',
  './js/net.js',
  './js/game.js',
  './vendor/peerjs.min.js',
  './vendor/mqtt.min.js',
  './fonts/BarlowCondensed-Regular.ttf',
  './fonts/BarlowCondensed-Medium.ttf',
  './fonts/BarlowCondensed-SemiBold.ttf',
  './fonts/BarlowCondensed-Bold.ttf',
  './fonts/BarlowCondensed-ExtraBold.ttf',
  './fonts/OFL.txt',
  './icons/icon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  event.respondWith(
    fetch(req).then((res) => {
      if (res && res.status === 200 && req.url.startsWith(self.location.origin)) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(req, copy));
      }
      return res;
    }).catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html')))
  );
});
