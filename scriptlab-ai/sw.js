/* sw.js — Service Worker for ScriptLab offline PWA.
   CACHE version must match ?v= query strings in index.html.
   Source of truth: version.js (const VERSION = 18). */
const CACHE = 'scriptlab-v18';
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './db.js',
  './store.js',
  './state.js',
  './scoring.js',
  './render.js',
  './workers.js',
  './analysis-ui.js',
  './export-import.js',
  './main.js',
  './version.js',
  './ai-shared.js',
  './diagnostics.js',
  './ai-worker.js',
  './sentiment-worker.js',
  './retention-worker.js'
  /* ner-worker.js: NOT cached. Feature not wired yet. See ner-worker.js header. */
];

self.addEventListener('install', event =>
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting()))
);

self.addEventListener('activate', event =>
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()))
);

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(cached => cached || fetch(event.request)).catch(() => new Response('Recurso no disponible offline', { status: 503, statusText: 'Offline' }))
  );
});