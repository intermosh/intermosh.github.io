/* vesper128 · os/filesystem — sistema de archivos y vistas de ventana construidos
   íntegramente desde game.json (fs / docs / sounds). Sin narrativa embebida:
   las apps narrativas se registran desde la capa de juego vía FS.registerApp.
   FIX: los documentos re-envuelven el texto al ancho actual de la ventana. */

import { clamp } from '../core/util.js';
import { FB, ICONS, fillRect, strokeRect, hline, vline, text, textW, wrap, drawIcon } from '../core/framebuffer.js';
import { Config } from '../core/config.js';
import { Audio } from '../core/audio.js';
import { Events } from '../core/events.js';
import { UI, newWin, closeWin, bringFront, winByTitle, body, addBtn } from './ui.js';
import { Desktop } from './desktop.js';

export const Trash = { items: [] };

const APPS = new Map();

export const FS = {
  nodes: {},
  desktop: [],
  docs: {},
  sounds: [],
  extra: {},            // ítems auto-generados por nodo (p.ej. disco 2)
  registroExtra: [],

  configure(cfg) {
    this.nodes = cfg.nodes || {};
    this.desktop = cfg.desktop || [];
    this.docs = Config.get('docs', {});
    this.sounds = Config.get('sounds', []);
  },

  registerApp(id, openFn) { APPS.set(id, openFn); },

  node(path) { return this.nodes[path]; },
  pathOf(parent, name) { return parent ? parent + '/' + name : name; },

  iconFor(node, name) {
    if (!node) return 'doc';
    if (node.type === 'folder') return node.locked ? 'folderLock' : 'folder';
    if (node.type === 'app') return node.icon || 'app';
    if (node.type === 'sound' || /\.SND$/i.test(name || '')) return 'sound';
    return node.icon || 'doc';
  },

  iconSmall(name, x, y) {
    const rows = ICONS[name] || ICONS.doc;
    if (!rows) return;
    for (let j = 0; j < 16; j++) for (let i = 0; i < 16; i++) {
      const c = rows[j * 2][i * 2];
      if (c === '#') FB.buf[(y + j) * FB.W + (x + i)] = 0;
      else if (c === 'o') FB.buf[(y + j) * FB.W + (x + i)] = 255;
      else if (c === '%') { const idx = (y + j) * FB.W + (x + i); FB.buf[idx] = (((x + i) + (y + j)) & 1) ? 255 : 0; }
      else if (c === 'l') { const idx = (y + j) * FB.W + (x + i); FB.buf[idx] = 190; }
    }
  },

  /* ---------------- escritorio ---------------- */
  buildDesktop() {
    Desktop.icons = [];
    for (const d of this.desktop) {
      const node = this.nodes[d.node];
      if (!node) continue;
      if (node.hidden && !d.force) continue;
      Desktop.addIcon({ id: d.id || d.node, name: node.name || d.node, icon: this.iconFor(node, node.name), node: d.node, fixed: !!d.fixed });
    }
    Desktop.buildPattern();
  },

  reveal(nodeId, asIcon) {
    const node = this.nodes[nodeId];
    if (!node) return;
    node.hidden = false;
    if (asIcon && !Desktop.icon(nodeId)) {
      Desktop.addIcon({ id: nodeId, name: node.name || nodeId, icon: this.iconFor(node, node.name), node: nodeId });
    }
  },
  hide(nodeId) { const n = this.nodes[nodeId]; if (n) n.hidden = true; },

  /* ---------------- apertura genérica ---------------- */
  open(path, opts = {}) {
    const node = this.nodes[path];
    if (!node) { Events.emit('open:unknown', { path }); return null; }
    if (node.hidden) { Events.emit('open:hidden', { path }); }
    switch (node.type) {
      case 'folder': return this.openFolder(path, opts);
      case 'doc': return this.openDoc(path, opts);
      case 'sound': return this.openSound(node.sound != null ? node.sound : 0, Object.assign({ path }, opts), node);
      case 'app': {
        const fn = APPS.get(node.app);
        if (fn) return fn(path, opts, node);
        return this.openList(node.name || path, (node.lines || []).map(l => ({ name: l, size: '' })), Object.assign({ note: node.note }, opts));
      }
      case 'trash': return this.openTrash(opts);
      default: return this.openList(node.name || path, (node.lines || []).map(l => ({ name: l, size: '' })), opts);
    }
  },

  /* ---------------- carpetas ---------------- */
  openFolder(path, opts = {}) {
    const node = this.nodes[path];
    const title = (node && node.name) || path.split('/').pop();
    const ex = winByTitle(title);
    if (ex && !opts.force) { bringFront(ex); return ex; }
    const w = newWin({
      x: opts.x != null ? opts.x : clamp(40 + UI.wins.length * 14, 8, FB.W - 340),
      y: opts.y != null ? opts.y : clamp(34 + UI.wins.length * 12, FB.menuBarH + 4, FB.H - 200),
      w: opts.w || 330, h: opts.h || 210,
      title, kind: 'folder', data: { path, node }, scrollable: true, fx: opts.fx, fy: opts.fy
    });
    w.draw = (win) => this.drawFolder(win);
    w.onTick = () => { };
    Events.emit('open', { path, kind: 'folder' });
    return w;
  },

  folderItems(w) {
    const node = w.data.node;
    let arr = (node && node.children ? node.children.slice() : []);
    const extra = this.extra[w.data.path];
    if (extra) arr = arr.concat(extra);
    if (this.registroExtra.length && node && node.registro) arr = arr.concat(this.registroExtra.map(e => e.name));
    return arr;
  },

  rowAt(w, x, y) {
    const b = body(w);
    if (x < b.x || x > b.x + b.w) return -1;
    if (y < b.y + 18) return -1;
    const r = Math.floor((y - b.y - 20 + w.scrollY) / 22);
    const items = this.folderItems(w);
    return (r >= 0 && r < items.length) ? r : -1;
  },

  drawFolder(w) {
    const b = body(w);
    fillRect(b.x, b.y, b.w, b.h, 1);
    const items = this.folderItems(w);
    w.contentH = items.length * 22 + 22;
    text('NOMBRE', b.x + 26, b.y + 4 - w.scrollY, 0.45);
    text('TAMAÑO', b.x + b.w - 60, b.y + 4 - w.scrollY, 0.45);
    hline(b.x, b.x + b.w - 1, b.y + 16 - w.scrollY, 0.45);
    items.forEach((name, i) => {
      const y = b.y + 20 + i * 22 - w.scrollY;
      if (y < b.y - 24 || y > b.y + b.h) return;
      const p = this.pathOf(w.data.path, name);
      const node = this.nodes[p] || { type: 'doc' };
      if (i === w.selected) fillRect(b.x + 1, y - 3, b.w - 2, 20, 0);
      const sh = i === w.selected ? 1 : 0;
      this.iconSmall(this.iconFor(node, name), b.x + 4, y - 2);
      text(name + (node.locked ? ' ■' : ''), b.x + 26, y + 1, sh);
      const size = node.type === 'folder' ? '--' : (2 + ((name.length * 7) % 30)) + ' K';
      text(size, b.x + b.w - 60, y + 1, sh);
    });
    const fy = b.y + 20 + items.length * 22 + 2 - w.scrollY;
    if (fy > b.y && fy < b.y + b.h) {
      hline(b.x, b.x + b.w - 1, fy, 0.55);
      text(items.length + ' ítems', b.x + 6, fy + 4, 0.45);
    }
  },

  folderOpen(w, idx) {
    const items = this.folderItems(w);
    const name = items[idx];
    if (!name) return;
    const path = this.pathOf(w.data.path, name);
    const node = this.nodes[path];
    const rect = { x: w.x + 16, y: w.y + 20 + idx * 22 };
    if (!node) { Events.emit('open:generated', { path, name }); return; }
    if (node.locked && !node.unlocked) { Events.emit('open:locked', { path, node }); return; }
    Audio.disk('read', 0.7);
    this.open(path, { fx: rect.x, fy: rect.y });
  },

  /* ---------------- documentos (con envoltura adaptativa) ---------------- */
  openDoc(path, opts = {}) {
    const node = this.nodes[path];
    const doc = this.docs[node && node.doc ? node.doc : path.split('/').pop()];
    const title = (node && node.name) || path.split('/').pop();
    const ex = winByTitle(title);
    if (ex && !opts.force) { bringFront(ex); return ex; }
    const w = newWin({
      x: opts.x != null ? opts.x : clamp(30 + UI.wins.length * 16, 6, FB.W - 400),
      y: opts.y != null ? opts.y : clamp(30 + UI.wins.length * 12, FB.menuBarH + 4, FB.H - 240),
      w: opts.w || 380, h: opts.h || 250, title, kind: 'doc',
      data: { path, doc, node, version: 0, shown: doc && doc.grow ? (doc.initial != null ? doc.initial : 3) : Infinity },
      scrollable: true, fx: opts.fx, fy: opts.fy
    });
    w._cols = -1; w._lines = null;
    w.getLines = () => {
      const b = body(w);
      const cols = Math.max(8, Math.floor((b.w - 12) / FB.font.advance));   // ← FIX: ancho actual
      if (w._cols !== cols || w._ver !== w.data.version) {
        w._cols = cols; w._ver = w.data.version;
        w._lines = this.docLines(w.data.doc, w.data.shown, cols);
      }
      return w._lines;
    };
    w.draw = (win) => this.drawDoc(win);
    if (doc && doc.grow) {
      w.onScrollEnd = () => {
        if (w.data.shown < (doc.entries || []).length) {
          w.data.shown++; w.data.version++;
          Audio.disk('read', 0.5);
          Events.emit('doc:grow', { path, shown: w.data.shown, total: doc.entries.length });
        }
      };
    }
    Events.emit('open', { path, kind: 'doc' });
    Events.emit('read', { path, doc: node && node.doc });
    return w;
  },

  docLines(doc, shown, cols) {
    if (!doc) return ['(sin contenido)'];
    if (doc.type === 'cuaderno') {
      const L = [].concat(doc.cover || []);
      const entries = doc.entries || [];
      for (let i = 0; i < Math.min(shown, entries.length); i++) {
        const e = entries[i];
        L.push('— ' + (e.date || '') + ' —');
        (e.lines || []).forEach(t => L.push(t));
        L.push('');
      }
      if (shown < entries.length) L.push('   ·  ·  ·');
      return L.flatMap(l => wrap(l, cols));
    }
    return (doc.lines || []).flatMap(l => wrap(l, cols));
  },

  drawDoc(w) {
    const b = body(w);
    fillRect(b.x, b.y, b.w, b.h, 1);
    const lines = w.getLines();
    w.contentH = lines.length * FB.font.lineHeight + 20;
    const start = Math.floor(w.scrollY / FB.font.lineHeight);
    const y0 = b.y + 6 - (w.scrollY % FB.font.lineHeight);
    for (let i = start; i < lines.length; i++) {
      const y = y0 + (i - start) * FB.font.lineHeight;
      if (y > b.y + b.h) break;
      if (y < b.y - FB.font.lineHeight) continue;
      let s = lines[i];
      if (w.data.doc && w.data.doc.corruptLast && i > lines.length - 10) s = corrupt(s, 0.5);
      text(s, b.x + 6, y, /^={5,}/.test(s) ? 0.45 : 0);
    }
  },

  /* ---------------- sonido ---------------- */
  openSound(id, opts = {}, node) {
    const s = this.sounds[id] || { name: 'SONIDO', meta: [], desc: '', freq: 0, plays: false };
    const title = (node && node.name) || s.name || ('SONIDO ' + id);
    const ex = winByTitle(title);
    if (ex && !opts.force) { bringFront(ex); return ex; }
    const w = newWin({
      x: opts.x != null ? opts.x : 90, y: opts.y != null ? opts.y : 70,
      w: 300, h: 210, title, kind: 'sound', data: { s, playing: false, t: 0 }, fx: opts.fx, fy: opts.fy
    });
    w.draw = (win, now) => this.drawSound(win, now);
    w.onTick = (dt) => { if (w.data.playing) { w.data.t += dt; if (w.data.t > (s.seconds || 9) * 1000) { w.data.playing = false; w.data.t = 0; } } };
    addBtn(w, w.x + 20, w.y + w.h - 30, 92, 18, 'Reproducir', () => {
      if (w.data.playing) return;
      w.data.playing = true; w.data.t = 0;
      if (s.plays) { Audio.playSignal(s.seconds || 9, s.freqs || [18.97, 19.4]); Events.emit('play', { id, path: opts.path }); }
      else { Audio.disk('read', 1.0); Events.emit('play:empty', { id }); }
    }, { def: true });
    addBtn(w, w.x + 124, w.y + w.h - 30, 70, 18, 'Cerrar', () => closeWin(w));
    Events.emit('open', { path: opts.path, kind: 'sound' });
    return w;
  },

  drawSound(w, now) {
    const b = body(w);
    const s = w.data.s;
    fillRect(b.x, b.y, b.w, b.h, 1);
    (s.meta || []).forEach((m, i) => text(m, b.x + 10, b.y + 6 + i * FB.font.lineHeight, i === 0 ? 0 : 0.45));
    const gy = b.y + 6 + (s.meta || []).length * FB.font.lineHeight + 8;
    const gx = b.x + 10, gw = b.w - 20, gh = 66;
    strokeRect(gx, gy, gw, gh, 0);
    fillRect(gx + 1, gy + 1, gw - 2, gh - 2, 1);
    hline(gx + 1, gx + gw - 2, gy + gh / 2, 0.55);
    if (w.data.playing) {
      for (let i = 0; i < gw - 2; i++) {
        const ph = i * 0.14 + w.data.t * 0.011;
        const amp = s.plays ? Math.sin(ph) * (gh * 0.36) * (0.85 + 0.15 * Math.sin(w.data.t * 0.0027)) : Math.random() * 5;
        vline(gx + 1 + i, Math.round(gy + gh / 2 - amp), Math.round(gy + gh / 2 + amp), 0);
      }
      text(s.freq ? String(s.freq).replace('.', ',') + ' Hz' : 'sin componente', gx + 6, gy + gh + 6, 0);
      text((w.data.t / 1000).toFixed(1) + ' s', gx + gw - 44, gy + gh + 6, 0);
    } else {
      for (let i = 0; i < gw - 2; i += 3) FB.buf[(gy + gh / 2) * FB.W + gx + 1 + i] = 0;
      text(s.desc || '', gx + 4, gy + gh + 6, 0.45);
    }
  },

  /* ---------------- papelera / listas ---------------- */
  openTrash(opts = {}) {
    const ex = winByTitle('PAPELERA');
    if (ex && !opts.force) { bringFront(ex); return ex; }
    const w = newWin({ x: FB.W - 250, y: FB.H - 190, w: 240, h: 160, title: 'PAPELERA', kind: 'list', data: {}, fx: FB.W - 40, fy: FB.H - 40 });
    w.draw = (win) => {
      const b = body(w);
      fillRect(b.x, b.y, b.w, b.h, 1);
      if (!Trash.items.length) text('La papelera está vacía.', b.x + 10, b.y + 14, 0.45);
      Trash.items.forEach((n, i) => { this.iconSmall('doc', b.x + 8, b.y + 10 + i * 20 - 3); text(n, b.x + 30, b.y + 10 + i * 20, 0); });
      text(Trash.items.length + ' ítems', b.x + 8, b.y + b.h - 16, 0.45);
    };
    Events.emit('open', { path: 'PAPELERA', kind: 'trash' });
    return w;
  },

  openList(title, rows, opts = {}) {
    const w = newWin({
      x: opts.x != null ? opts.x : clamp(70 + UI.wins.length * 12, 6, FB.W - 320),
      y: opts.y != null ? opts.y : clamp(60 + UI.wins.length * 10, FB.menuBarH + 4, FB.H - 180),
      w: opts.w || 300, h: opts.h || (60 + rows.length * 22), title, kind: 'list', data: { rows, note: opts.note }, fx: opts.fx, fy: opts.fy
    });
    w.draw = (win) => {
      const b = body(w);
      fillRect(b.x, b.y, b.w, b.h, 1);
      w.data.rows.forEach((r, i) => {
        const y = b.y + 10 + i * 22;
        this.iconSmall('doc', b.x + 8, y - 4);
        text(r.name, b.x + 30, y, 0);
        text(String(r.size != null ? r.size : ''), b.x + b.w - 56, y, 0.45);
      });
      if (w.data.note) text(w.data.note, b.x + 8, b.y + b.h - 18, 0.45);
    };
    return w;
  }
};

const GLYPH_NOISE = '▓▒░#%&@*+=~';
export function corrupt(s, amt) {
  let out = '';
  for (const ch of s) {
    if (ch === ' ') { out += ch; continue; }
    out += Math.random() < amt * 0.5 ? GLYPH_NOISE[(Math.random() * GLYPH_NOISE.length) | 0] : ch;
  }
  return out;
}
