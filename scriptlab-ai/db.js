/* db.js — IndexedDB persistence layer for ScriptLab.
   CRUD operations, legacy migration, and content hashing for cache keys. */

let database;

function openDB() {
  if (database) return Promise.resolve(database);
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('scriptlab-ai', 3);
    r.onupgradeneeded = () => {
      const d = r.result;
      ['projects', 'snapshots', 'calibrations', 'settings', 'analysisCache', 'modelRegistry']
        .forEach(n => { if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); });
    };
    r.onsuccess = () => { database = r.result; resolve(database); };
    r.onerror = () => reject(r.error);
  });
}

async function put(store, value) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store, 'readwrite').objectStore(store).put(value);
    r.onsuccess = () => resolve(value);
    r.onerror = () => reject(r.error);
  });
}

async function get(store, id) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store, 'readonly').objectStore(store).get(id);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function all(store) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store, 'readonly').objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

async function del(store, id) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const r = d.transaction(store, 'readwrite').objectStore(store).delete(id);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error);
  });
}

async function migrateLegacy() {
  if (localStorage.getItem('scriptlab-idb-migrated')) return;
  const raw = localStorage.getItem('scriptlab-ai-project-v1');
  if (raw) try {
    const rawProject = JSON.parse(raw), meta = rawProject.project || rawProject;
    await put('projects', { ...meta, id: 'active', blocks: Array.isArray(rawProject.blocks) ? rawProject.blocks : [], updatedAt: Date.now() });
  } catch (error) { console.warn('No se pudo migrar proyecto anterior', error); }
  localStorage.setItem('scriptlab-idb-migrated', '1');
}

/* FNV-1a hash para claves de cache de análisis */
function contentHash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) { h ^= value.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}