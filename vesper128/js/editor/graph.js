/* vesper128 · editor/graph — lienzo del grafo de descubrimientos.
   Arrastrar nodos, conectar puertos, pan/zoom, selección y borrado. */

import { Store } from './store.js';

const COL = {
  bg: '#101014', grid: '#1b1b22', node: '#1a1a21', nodeSel: '#22222c',
  border: '#3a3a46', borderSel: '#e8c07a', text: '#e6e1d6', dim: '#8b8779',
  edge: '#4a4a58', edgeSel: '#e8c07a', accent: '#d8b26a',
  start: '#7fb069', event: '#6a9fd8', auto: '#b58ad8'
};

const NW = 176, NH = 58, PORT_R = 5;

export const Graph = {
  canvas: null, ctx: null, dpr: 1,
  drag: null, link: null, hover: null,
  needsDraw: true,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    this.bind();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    Store.subscribe(() => { this.needsDraw = true; });
    const loop = () => { if (this.needsDraw) { this.needsDraw = false; this.draw(); } requestAnimationFrame(loop); };
    loop();
  },

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(200, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(200, Math.round(r.height * this.dpr));
    this.canvas.style.width = r.width + 'px';
    this.canvas.style.height = r.height + 'px';
    this.needsDraw = true;
  },

  toWorld(px, py) {
    const v = Store.view;
    return { x: (px - v.panX) / v.zoom, y: (py - v.panY) / v.zoom };
  },
  toScreen(wx, wy) {
    const v = Store.view;
    return { x: wx * v.zoom + v.panX, y: wy * v.zoom + v.panY };
  },

  portPos(n, side) {
    return { x: n.x + (side === 'out' ? NW : 0), y: n.y + NH / 2 };
  },

  hitNode(wx, wy) {
    const ns = Store.nodes();
    for (let i = ns.length - 1; i >= 0; i--) {
      const n = ns[i];
      if (wx >= n.x && wx <= n.x + NW && wy >= n.y && wy <= n.y + NH) return n;
    }
    return null;
  },

  hitPort(wx, wy) {
    for (const n of Store.nodes()) {
      for (const side of ['out', 'in']) {
        const p = this.portPos(n, side);
        if (Math.hypot(wx - p.x, wy - p.y) < PORT_R + 4) return { n, side };
      }
    }
    return null;
  },

  hitEdge(wx, wy) {
    let best = null, bd = 8 / Math.max(0.3, Store.view.zoom);
    for (const e of Store.edges()) {
      const a = Store.node(e.from), b = Store.node(e.to);
      if (!a || !b) continue;
      const p0 = this.portPos(a, 'out'), p1 = this.portPos(b, 'in');
      for (let t = 0; t <= 1.001; t += 0.04) {
        const pt = bezier(p0, p1, t);
        const d = Math.hypot(pt.x - wx, pt.y - wy);
        if (d < bd) { bd = d; best = e; }
      }
    }
    return best;
  },

  /* ---------------- interacción ---------------- */
  bind() {
    const c = this.canvas;
    const pos = (ev) => { const r = c.getBoundingClientRect(); return { x: ev.clientX - r.left, y: ev.clientY - r.top }; };

    c.addEventListener('mousedown', (ev) => {
      const p = pos(ev); const w = this.toWorld(p.x, p.y);
      c.focus && c.focus();
      if (ev.button === 1 || ev.shiftKey && !this.hitNode(w.x, w.y)) {
        this.drag = { kind: 'pan', sx: p.x, sy: p.y, px: Store.view.panX, py: Store.view.panY };
        return;
      }
      const port = this.hitPort(w.x, w.y);
      if (port && port.side === 'out') { this.link = { from: port.n.id, x: w.x, y: w.y }; this.needsDraw = true; return; }
      const n = this.hitNode(w.x, w.y);
      if (n) {
        Store.select('node', n.id);
        this.drag = { kind: 'node', id: n.id, dx: w.x - n.x, dy: w.y - n.y, moved: false };
        return;
      }
      const e = this.hitEdge(w.x, w.y);
      if (e) { Store.select('edge', e.id); return; }
      Store.select(null, null);
      this.drag = { kind: 'pan', sx: p.x, sy: p.y, px: Store.view.panX, py: Store.view.panY };
    });

    window.addEventListener('mousemove', (ev) => {
      const p = pos(ev); const w = this.toWorld(p.x, p.y);
      if (this.link) { this.link.x = w.x; this.link.y = w.y; this.link.over = this.hitNode(w.x, w.y); this.needsDraw = true; return; }
      if (this.drag) {
        if (this.drag.kind === 'pan') {
          Store.view.panX = this.drag.px + (p.x - this.drag.sx);
          Store.view.panY = this.drag.py + (p.y - this.drag.sy);
          this.needsDraw = true;
        } else if (this.drag.kind === 'node') {
          const n = Store.node(this.drag.id);
          if (n) {
            let nx = w.x - this.drag.dx, ny = w.y - this.drag.dy;
            if (Store.view.grid && Store.view.snap) { nx = Math.round(nx / Store.view.snap) * Store.view.snap; ny = Math.round(ny / Store.view.snap) * Store.view.snap; }
            n.x = Math.round(nx); n.y = Math.round(ny);
            this.drag.moved = true;
            Store.notify('graph');
          }
        }
        return;
      }
      const hov = this.hitNode(w.x, w.y) || this.hitPort(w.x, w.y) || this.hitEdge(w.x, w.y);
      const cur = this.hitPort(w.x, w.y) ? 'crosshair' : (this.hitNode(w.x, w.y) ? 'grab' : 'default');
      if (c.style.cursor !== cur) c.style.cursor = cur;
      this.hover = hov;
    });

    window.addEventListener('mouseup', (ev) => {
      const p = pos(ev); const w = this.toWorld(p.x, p.y);
      if (this.link) {
        const target = this.hitNode(w.x, w.y);
        if (target && target.id !== this.link.from) Store.addEdge(this.link.from, target.id);
        this.link = null; this.needsDraw = true;
      }
      if (this.drag && this.drag.kind === 'node' && this.drag.moved) Store.touch('graph');
      this.drag = null;
    });

    c.addEventListener('wheel', (ev) => {
      ev.preventDefault();
      const p = pos(ev);
      const v = Store.view;
      const before = this.toWorld(p.x, p.y);
      const k = ev.deltaY < 0 ? 1.12 : 1 / 1.12;
      v.zoom = Math.min(3, Math.max(0.15, v.zoom * k));
      const after = this.toWorld(p.x, p.y);
      v.panX += (after.x - before.x) * v.zoom;
      v.panY += (after.y - before.y) * v.zoom;
      this.needsDraw = true;
    }, { passive: false });

    c.addEventListener('dblclick', (ev) => {
      const p = pos(ev); const w = this.toWorld(p.x, p.y);
      const n = this.hitNode(w.x, w.y);
      if (n) { Store.select('node', n.id); Store.notify('sel'); const el = document.getElementById('ins-label'); if (el) { el.focus(); el.select(); } }
      else this.addNodeHere(w.x, w.y);
    });

    window.addEventListener('keydown', (ev) => {
      if (Store.tab !== 'grafo') return;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return;
      if ((ev.key === 'Delete' || ev.key === 'Backspace') && Store.sel.id) {
        if (Store.sel.kind === 'node') Store.removeNode(Store.sel.id);
        else Store.removeEdge(Store.sel.id);
        ev.preventDefault();
      }
      if (ev.key === 'n' || ev.key === 'N') {
        const c2 = this.canvas.getBoundingClientRect();
        const w = this.toWorld(c2.width / 2, c2.height / 2);
        this.addNodeHere(w.x, w.y);
      }
      if (ev.key === 'f' || ev.key === 'F') this.fit();
    });
  },

  addNodeHere(wx, wy) {
    const n = Store.addNode(wx - NW / 2, wy - NH / 2);
    Store.notify('sel');
    return n;
  },

  fit() {
    const ns = Store.nodes();
    if (!ns.length) return;
    const minX = Math.min(...ns.map(n => n.x)), maxX = Math.max(...ns.map(n => n.x + NW));
    const minY = Math.min(...ns.map(n => n.y)), maxY = Math.max(...ns.map(n => n.y + NH));
    const r = this.canvas.getBoundingClientRect();
    const z = Math.min(2, Math.max(0.15, Math.min((r.width - 80) / (maxX - minX), (r.height - 80) / (maxY - minY))));
    Store.view.zoom = z;
    Store.view.panX = (r.width - (maxX - minX) * z) / 2 - minX * z;
    Store.view.panY = (r.height - (maxY - minY) * z) / 2 - minY * z;
    this.needsDraw = true;
  },

  /** orden automático por capas (BFS desde los nodos de arranque) */
  autoLayout() {
    const ns = Store.nodes(), es = Store.edges();
    const depth = {};
    const inc = {};
    es.forEach(e => { (inc[e.to] = inc[e.to] || []).push(e.from); });
    const queue = ns.filter(n => !inc[n.id] || !inc[n.id].length).map(n => n.id);
    queue.forEach(id => depth[id] = 0);
    let guard = 0;
    while (queue.length && guard++ < 5000) {
      const id = queue.shift();
      es.filter(e => e.from === id).forEach(e => {
        const d = (depth[id] || 0) + 1;
        if (depth[e.to] == null || depth[e.to] < d) { depth[e.to] = d; queue.push(e.to); }
      });
    }
    ns.forEach(n => { if (depth[n.id] == null) depth[n.id] = 0; });
    const byDepth = {};
    ns.forEach(n => { (byDepth[depth[n.id]] = byDepth[depth[n.id]] || []).push(n); });
    Object.keys(byDepth).forEach(d => {
      byDepth[d].forEach((n, i) => { n.x = 60 + (+d) * 230; n.y = 60 + i * 110; });
    });
    Store.touch('graph');
    this.fit();
  },

  /* ---------------- dibujo ---------------- */
  draw() {
    const ctx = this.ctx, c = this.canvas;
    const v = Store.view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = COL.bg;
    ctx.fillRect(0, 0, c.width, c.height);

    // grilla
    if (v.grid) {
      const step = v.snap * v.zoom;
      if (step > 6) {
        ctx.fillStyle = COL.grid;
        const x0 = v.panX % step, y0 = v.panY % step;
        for (let x = x0; x < c.width / this.dpr; x += step) for (let y = y0; y < c.height / this.dpr; y += step) ctx.fillRect(x, y, 1, 1);
      }
    }

    ctx.save();
    ctx.translate(v.panX, v.panY);
    ctx.scale(v.zoom, v.zoom);

    // aristas
    for (const e of Store.edges()) {
      const a = Store.node(e.from), b = Store.node(e.to);
      if (!a || !b) continue;
      const sel = Store.sel.kind === 'edge' && Store.sel.id === e.id;
      drawEdge(ctx, this.portPos(a, 'out'), this.portPos(b, 'in'), sel ? COL.edgeSel : COL.edge, sel, (e.conditions || []).length);
    }

    // enlace en curso
    if (this.link) {
      const a = Store.node(this.link.from);
      if (a) drawEdge(ctx, this.portPos(a, 'out'), { x: this.link.x, y: this.link.y }, COL.accent, true, 0, true);
    }

    // nodos
    for (const n of Store.nodes()) this.drawNode(ctx, n);

    ctx.restore();
  },

  drawNode(ctx, n) {
    const sel = Store.sel.kind === 'node' && Store.sel.id === n.id;
    const hov = this.hover === n || (this.link && this.link.over === n);
    const tc = n.trigger && n.trigger.type === 'start' ? COL.start : ((n.trigger || {}).type === 'event' || n.type === 'event' ? COL.event : COL.auto);

    ctx.fillStyle = sel ? COL.nodeSel : COL.node;
    roundRect(ctx, n.x, n.y, NW, NH, 6); ctx.fill();
    ctx.strokeStyle = sel ? COL.borderSel : (hov ? COL.accent : COL.border);
    ctx.lineWidth = sel ? 2 : 1;
    roundRect(ctx, n.x, n.y, NW, NH, 6); ctx.stroke();

    // franja de tipo
    ctx.fillStyle = tc;
    ctx.fillRect(n.x + 1, n.y + 1, 4, NH - 2);

    ctx.fillStyle = COL.text;
    ctx.font = '600 12px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    const label = String(n.label || n.id);
    ctx.fillText(clip(ctx, label, NW - 18), n.x + 12, n.y + 8);

    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = COL.dim;
    const tr = n.trigger || {};
    const trg = tr.type === 'event' ? '⚡ ' + (tr.event || '?') : tr.type === 'idle' ? '⏳ ' + (tr.ms || 0) + 'ms' : tr.type === 'start' ? '● arranque' : '∞ auto';
    ctx.fillText(clip(ctx, trg, NW - 18), n.x + 12, n.y + 25);

    const nc = (n.conditions || []).length, ne = (n.effects || []).filter(e => e.enabled !== false).length;
    const badges = 'cond ' + nc + '  ·  ef ' + ne + (n.repeat ? '  ·  ↻' : '');
    ctx.fillStyle = ne ? COL.accent : COL.dim;
    ctx.fillText(badges, n.x + 12, n.y + 40);

    // puertos
    for (const side of ['in', 'out']) {
      const p = this.portPos(n, side);
      ctx.beginPath(); ctx.arc(p.x, p.y, PORT_R, 0, Math.PI * 2);
      ctx.fillStyle = side === 'out' ? COL.accent : COL.border;
      ctx.fill();
      ctx.strokeStyle = COL.bg; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }
};

function clip(ctx, s, w) {
  if (ctx.measureText(s).width <= w) return s;
  let out = s;
  while (out.length > 1 && ctx.measureText(out + '…').width > w) out = out.slice(0, -1);
  return out + '…';
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function bezier(p0, p1, t) {
  const dx = Math.max(40, Math.abs(p1.x - p0.x) * 0.5);
  const c0 = { x: p0.x + dx, y: p0.y }, c1 = { x: p1.x - dx, y: p1.y };
  const mt = 1 - t;
  return {
    x: mt * mt * mt * p0.x + 3 * mt * mt * t * c0.x + 3 * mt * t * t * c1.x + t * t * t * p1.x,
    y: mt * mt * mt * p0.y + 3 * mt * mt * t * c0.y + 3 * mt * t * t * c1.y + t * t * t * p1.y
  };
}

function drawEdge(ctx, p0, p1, color, sel, condCount, dashed) {
  const dx = Math.max(40, Math.abs(p1.x - p0.x) * 0.5);
  ctx.beginPath();
  ctx.moveTo(p0.x, p0.y);
  ctx.bezierCurveTo(p0.x + dx, p0.y, p1.x - dx, p1.y, p1.x, p1.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = sel ? 2.4 : 1.4;
  if (dashed) ctx.setLineDash([5, 4]); else ctx.setLineDash([]);
  ctx.stroke();
  ctx.setLineDash([]);

  // punta de flecha
  const t = bezier(p0, p1, 0.985);
  const angle = Math.atan2(p1.y - t.y, p1.x - t.x);
  ctx.save();
  ctx.translate(p1.x, p1.y); ctx.rotate(angle);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, 4.5); ctx.lineTo(-9, -4.5); ctx.closePath();
  ctx.fillStyle = color; ctx.fill();
  ctx.restore();

  if (condCount) {
    const m = bezier(p0, p1, 0.5);
    ctx.font = '10px ui-monospace, Menlo, Consolas, monospace';
    const s = condCount + ' cond.';
    const w = ctx.measureText(s).width + 8;
    ctx.fillStyle = COL.bg; ctx.fillRect(m.x - w / 2, m.y - 8, w, 15);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(m.x - w / 2, m.y - 8, w, 15);
    ctx.fillStyle = sel ? COL.edgeSel : COL.dim;
    ctx.textBaseline = 'top';
    ctx.fillText(s, m.x - w / 2 + 4, m.y - 5);
  }
}
