/* vesper128 · editor/store — estado reactivo compartido por todo el editor.
   Un solo objeto de datos (game.json) + el catálogo externo (effects.json). */

import { getPath, setPath, download, uid } from '../core/util.js';

const DEFAULT_DATA = {
  meta: { workingName: 'vesper128', version: '0.0.1', title: '' },
  runtime: { narrative: true, effects: true },
  display: {}, audio: {}, clock: {}, ui: {}, boot: {},
  fs: { desktop: [], nodes: {} }, docs: {}, sounds: [], apps: {},
  menus: { base: [], extra: [] }, dialogs: {}, subliminal: {},
  anomalies: { pool: [] }, ending: {}, story: { enabled: true, nodes: [], edges: [] }
};

export const Store = {
  data: JSON.parse(JSON.stringify(DEFAULT_DATA)),
  catalog: { effects: [], events: [], conditions: [], triggers: [], categories: [], paramTypes: {} },
  dirty: false,
  error: null,
  fileName: 'game.json',
  fileHandle: null,
  sel: { kind: null, id: null },
  view: { panX: 40, panY: 40, zoom: 0.7, grid: true, snap: 20 },
  tab: 'grafo',
  subs: new Set(),

  /* ---------------- reactivo ---------------- */
  subscribe(fn) { this.subs.add(fn); return () => this.subs.delete(fn); },
  notify(what = 'data') { for (const fn of this.subs) { try { fn(what, this); } catch (e) { console.warn('[store]', e); } } },
  touch(what = 'data') { this.dirty = true; this.notify(what); },

  /* ---------------- carga ---------------- */
  async loadDefault(url = 'data/game.json') {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status + ' al cargar ' + url);
    this.adopt(await res.json());
    this.fileName = url.split('/').pop();
  },

  async loadCatalog(url = 'data/effects.json') {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const c = await res.json();
    this.catalog = Object.assign({ effects: [], events: [], conditions: [], triggers: [], categories: [], paramTypes: {} }, c);
  },

  adopt(obj) {
    this.data = mergeDefaults(JSON.parse(JSON.stringify(DEFAULT_DATA)), obj || {});
    this.ensureIds();
    this.dirty = false;
    this.error = null;
    this.notify('load');
  },

  loadFile(file) {
    const r = new FileReader();
    r.onload = () => {
      try {
        this.adopt(JSON.parse(r.result));
        this.fileName = file.name;
      } catch (e) { this.error = 'JSON inválido: ' + e.message; this.notify('error'); }
    };
    r.readAsText(file);
  },

  /** garantiza id estable en nodos y aristas (para selección y guardado) */
  ensureIds() {
    const s = this.data.story || (this.data.story = { nodes: [], edges: [] });
    s.nodes = s.nodes || []; s.edges = s.edges || [];
    s.nodes.forEach((n, i) => { if (!n.id) n.id = 'n_' + (i + 1); if (n.x == null) n.x = 60 + (i % 6) * 200; if (n.y == null) n.y = 60 + Math.floor(i / 6) * 120; });
    s.edges.forEach((e, i) => { if (!e.id) e.id = 'e_' + (i + 1) + '_' + uid('').slice(0, 4); });
  },

  /* ---------------- acceso ---------------- */
  get(path, dflt) { const v = getPath(this.data, path, undefined); return v === undefined ? dflt : v; },
  set(path, value, silent) { setPath(this.data, path, value); if (silent) this.notify('data'); else this.touch('data'); },

  nodes() { return this.get('story.nodes', []); },
  edges() { return this.get('story.edges', []); },
  node(id) { return this.nodes().find(n => n.id === id); },
  edge(id) { return this.edges().find(e => e.id === id); },
  fsNodes() { return this.get('fs.nodes', {}); },

  select(kind, id) { this.sel = { kind, id }; this.notify('sel'); },

  addNode(x, y) {
    const id = this.uniqueId('n');
    const n = {
      id, label: 'Nodo nuevo', type: 'auto', x: Math.round(x), y: Math.round(y),
      trigger: { type: 'auto' }, conditions: [], effects: []
    };
    this.nodes().push(n);
    this.select('node', id);
    this.touch('graph');
    return n;
  },

  removeNode(id) {
    const ns = this.nodes(); const i = ns.findIndex(n => n.id === id);
    if (i >= 0) ns.splice(i, 1);
    const es = this.edges();
    for (let k = es.length - 1; k >= 0; k--) if (es[k].from === id || es[k].to === id) es.splice(k, 1);
    if (this.sel.id === id) this.sel = { kind: null, id: null };
    this.touch('graph');
  },

  addEdge(from, to, cond) {
    if (from === to) return null;
    const ex = this.edges().find(e => e.from === from && e.to === to);
    if (ex) { this.select('edge', ex.id); this.notify('sel'); return ex; }
    const e = { id: 'e_' + uid('').slice(0, 6), from, to };
    if (cond) e.conditions = cond;
    this.edges().push(e);
    this.select('edge', e.id);
    this.touch('graph');
    return e;
  },

  removeEdge(id) {
    const es = this.edges(); const i = es.findIndex(e => e.id === id);
    if (i >= 0) es.splice(i, 1);
    if (this.sel.id === id) this.sel = { kind: null, id: null };
    this.touch('graph');
  },

  uniqueId(prefix) {
    let i = 1; const used = new Set(this.nodes().map(n => n.id));
    while (used.has(prefix + '_' + i)) i++;
    return prefix + '_' + i;
  },

  /* ---------------- catálogo ---------------- */
  effect(id) { return this.catalog.effects.find(e => e.id === id); },
  effectIds() { return this.catalog.effects.map(e => e.id); },
  categories() { return this.catalog.categories || []; },

  addEffectTo(nodeId, effectId) {
    const n = this.node(nodeId); if (!n) return;
    n.effects = n.effects || [];
    const entry = this.effect(effectId) || { params: [] };
    const params = {};
    (entry.params || []).forEach(p => { if (p.default !== null && p.default !== undefined) params[p.key] = p.default; });
    n.effects.push({ effect: effectId, params, enabled: true });
    this.touch('graph');
  },

  /* ---------------- guardado ---------------- */
  async save() {
    const text = JSON.stringify(this.data, null, 2) + '\n';
    if (this.fileHandle && this.fileHandle.createWritable) {
      try {
        const w = await this.fileHandle.createWritable();
        await w.write(text); await w.close();
        this.dirty = false; this.notify('saved'); return true;
      } catch (e) { console.warn('[store] save', e); }
    }
    if (window.showSaveFilePicker) {
      try {
        this.fileHandle = await window.showSaveFilePicker({
          suggestedName: this.fileName,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }]
        });
        const w = await this.fileHandle.createWritable();
        await w.write(text); await w.close();
        this.dirty = false; this.notify('saved'); return true;
      } catch (e) { if (e && e.name === 'AbortError') return false; }
    }
    download(this.fileName, text);
    this.dirty = false; this.notify('saved');
    return true;
  }
};

function mergeDefaults(a, b) {
  const out = { ...a };
  for (const k of Object.keys(b || {})) {
    const av = a[k], bv = b[k];
    if (av && typeof av === 'object' && !Array.isArray(av) && bv && typeof bv === 'object' && !Array.isArray(bv)) out[k] = mergeDefaults(av, bv);
    else out[k] = bv;
  }
  return out;
}

/* ================= validación ================= */
export function validate(Store_) {
  const S = Store_ || Store;
  const out = [];
  const err = (m) => out.push({ level: 'error', msg: m });
  const warn = (m) => out.push({ level: 'warn', msg: m });
  const info = (m) => out.push({ level: 'info', msg: m });

  const nodes = S.nodes(), edges = S.edges();
  const ids = new Set();
  nodes.forEach(n => { if (ids.has(n.id)) err('id de nodo duplicado: ' + n.id); ids.add(n.id); });
  edges.forEach(e => {
    if (!ids.has(e.from)) err('arista ' + e.id + ' sale de un nodo inexistente: ' + e.from);
    if (!ids.has(e.to)) err('arista ' + e.id + ' entra a un nodo inexistente: ' + e.to);
  });

  const known = new Set(S.effectIds());
  const fsn = S.fsNodes();
  const docs = S.get('docs', {});
  const sounds = S.get('sounds', []);
  const flagsDefined = new Set(), flagsUsed = new Set();
  const pathParams = new Set(['node', 'path']);

  const walkEffects = (list, where) => {
    (list || []).forEach((inst, i) => {
      if (!inst || !inst.effect) { err(where + ': efecto #' + (i + 1) + ' sin id'); return; }
      if (known.size && !known.has(inst.effect)) err(where + ': efecto fuera del catálogo → ' + inst.effect);
      const entry = S.effect(inst.effect);
      const p = inst.params || {};
      if (entry) (entry.params || []).forEach(sp => {
        if (sp.type === 'flag' && p[sp.key]) flagsDefined.add(p[sp.key]);
        if ((sp.type === 'node' || pathParams.has(sp.key)) && typeof p[sp.key] === 'string' && p[sp.key] && !fsn[p[sp.key]]) {
          warn(where + ' · ' + inst.effect + ': la ruta "' + p[sp.key] + '" no existe en fs.nodes');
        }
        if (sp.type === 'number' && typeof p[sp.key] === 'number') {
          if (sp.min != null && p[sp.key] < sp.min) warn(where + ' · ' + inst.effect + '.' + sp.key + ' por debajo del mínimo');
          if (sp.max != null && p[sp.key] > sp.max) warn(where + ' · ' + inst.effect + '.' + sp.key + ' por encima del máximo');
        }
      });
      if (entry && entry.macro) entry.macro.forEach(m => walkEffects([m], where + ' (macro ' + inst.effect + ')'));
      if (p && Array.isArray(p.onButton)) p.onButton.forEach((b, bi) => {
        if (b.effect) walkEffects([{ effect: b.effect, params: b.params }], where + ' · rama ' + (bi + 1));
        if (b.effects) walkEffects(b.effects, where + ' · rama ' + (bi + 1));
      });
    });
  };

  nodes.forEach(n => {
    const where = 'nodo ' + n.id;
    if (!n.label) warn(where + ' sin etiqueta');
    if (!n.trigger) warn(where + ' sin disparador');
    (n.conditions || []).forEach(c => { if (c.kind === 'flag' && c.name) flagsUsed.add(c.name); });
    walkEffects(n.effects, where);
  });
  edges.forEach(e => (e.conditions || []).forEach(c => { if (c.kind === 'flag' && c.name) flagsUsed.add(c.name); }));

  // menús
  const menus = (S.get('menus.base', []) || []).concat(S.get('menus.extra', []) || []);
  menus.forEach(m => (m.items || []).forEach(it => {
    if (!it || typeof it === 'string') return;
    if (it.effects) walkEffects(it.effects, 'menú ' + (m.label || m.key || '■'));
    const a = it.action || '';
    if (a.startsWith('open:') && !fsn[a.slice(5)]) warn('menú ' + (m.label || m.key) + ': open:' + a.slice(5) + ' no existe en fs.nodes');
    if (a.startsWith('effect:') && known.size && !known.has(a.slice(7))) err('menú ' + (m.label || m.key) + ': effect:' + a.slice(7) + ' fuera del catálogo');
    if (it.showIf && it.showIf.kind === 'flag') flagsUsed.add(it.showIf.name);
    if (it.needsFlag) flagsUsed.add(it.needsFlag);
  }));

  // anomalías
  (S.get('anomalies.pool', []) || []).forEach(a => {
    if (known.size && !known.has(a.effect)) err('anomalía ' + (a.key || '?') + ': efecto fuera del catálogo → ' + a.effect);
    walkEffects([{ effect: a.effect, params: a.params }], 'anomalía ' + (a.key || '?'));
  });

  // diálogos invitados
  (S.get('dialogs.invitados', []) || []).forEach(d => (d.onButton || []).forEach((b, i) => {
    if (b.effects) walkEffects(b.effects, 'diálogo ' + (d.key || '?') + ' rama ' + (i + 1));
    else if (b.effect) walkEffects([{ effect: b.effect, params: b.params }], 'diálogo ' + (d.key || '?') + ' rama ' + (i + 1));
  }));

  // fs ↔ docs/sounds
  Object.keys(fsn).forEach(k => {
    const n = fsn[k];
    if (n.type === 'doc' && n.doc && !docs[n.doc]) err('fs ' + k + ': documento inexistente → ' + n.doc);
    if (n.type === 'sound') {
      if (n.sound == null || n.sound < 0 || n.sound >= sounds.length) err('fs ' + k + ': índice de sonido fuera de rango → ' + n.sound);
    }
    (n.children || []).forEach(c => {
      const p = k + '/' + c;
      if (!fsn[p]) warn('fs ' + k + ': el hijo "' + c + '" no tiene nodo (' + p + ')');
    });
  });
  (S.get('fs.desktop', []) || []).forEach(d => { if (!fsn[d.node]) err('escritorio: nodo inexistente → ' + d.node); });

  // banderas
  flagsUsed.forEach(f => { if (!flagsDefined.has(f)) info('bandera usada sin efecto que la active: ' + f); });
  flagsDefined.forEach(f => { if (!flagsUsed.has(f)) info('bandera activada que ninguna condición usa: ' + f); });

  // alcance del grafo
  const starts = nodes.filter(n => (n.trigger && n.trigger.type === 'start') || n.type === 'start');
  if (!starts.length) warn('el grafo no tiene nodo de arranque (trigger "start")');
  const reach = new Set();
  const incoming = {};
  edges.forEach(e => { (incoming[e.to] = incoming[e.to] || []).push(e.from); });
  const visit = (id) => { if (reach.has(id)) return; reach.add(id); edges.filter(e => e.from === id).forEach(e => visit(e.to)); };
  starts.forEach(n => visit(n.id));
  nodes.forEach(n => {
    const inc = incoming[n.id] || [];
    if (!inc.length && !starts.includes(n) && (n.trigger || {}).type !== 'start') info('nodo sin aristas entrantes (se activa sólo por su disparador): ' + n.id);
    if (inc.length && !reach.has(n.id)) warn('nodo inalcanzable desde el arranque: ' + n.id);
  });

  // ciclos
  const state = {};
  const dfs = (id, stack) => {
    if (state[id] === 'done') return;
    if (state[id] === 'open') { warn('ciclo en el grafo: ' + stack.concat(id).join(' → ')); return; }
    state[id] = 'open';
    edges.filter(e => e.from === id).forEach(e => dfs(e.to, stack.concat(id)));
    state[id] = 'done';
  };
  nodes.forEach(n => dfs(n.id, []));

  if (!S.catalog.effects || !S.catalog.effects.length) warn('catálogo de efectos vacío (data/effects.json)');
  const curv = S.get('display.crt.curvature', 0);
  if (curv > 0.35) warn('curvatura CRT alta (' + curv + '): se pierde la legibilidad en los bordes');
  return out;
}
