/* sw.js — Service Worker de ScriptLab V1.0.0a
   La app es 100% local: este SW cachea la shell para que funcione offline.
   Estrategia network-first con fallback a cache (asi una actualizacion del
   repo nunca queda servida vieja: si hay red, gana la red).
   Los modelos de IA (~110 MB) NO pasan por aca: los guarda Cache Storage del
   navegador vía Transformers.js, sin interferencia de este SW. */

const VERSION = 'scriptlab-v1.0.0a';
const SHELL = [
  './',
  './index.html',
  './scriptlab.html',
  './metricas.html',
  './favicon.svg',
  './css/styles.css',
  './js/ai-shared.js',
  './js/ai-worker.js',
  './js/db.js',
  './js/diagnostics.js',
  './js/export-import.js',
  './js/main.js',
  './js/render.js',
  './js/retention-engine.js',
  './js/retention-worker.js',
  './js/scoring.js',
  './js/sentiment-engine.js',
  './js/sentiment-worker.js',
  './js/state.js',
  './js/workers.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(VERSION)
      .then(cache => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // Solo same-origin: CDNs (Transformers.js, modelos) van directo a la red
  // con su propio cacheo; meterlos aca podria duplicar ~110 MB.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then(cache => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./scriptlab.html')))
  );
});
