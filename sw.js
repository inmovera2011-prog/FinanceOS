const CACHE = 'financeos-v2';
const ASSETS = [
  '/FinanceOS/',
  '/FinanceOS/index.html',
  '/FinanceOS/css/styles.css',
  '/FinanceOS/js/auth.js',
  '/FinanceOS/js/constants.js',
  '/FinanceOS/js/db.js',
  '/FinanceOS/js/voice.js',
  '/FinanceOS/js/firebase-config.js',
  '/FinanceOS/manifest.json',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => new Response('Offline', {status:503})))
  );
});
