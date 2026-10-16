/* vesper128 · os/desktop — iconos del escritorio, trama de fondo, atenuación
   periférica y racimos de pareidolia. El juego agrega/quita iconos vía API. */

import { clamp } from '../core/util.js';
import { FB, fillRect, plot, drawIcon, text, textW } from '../core/framebuffer.js';

export const Desktop = {
  icons: [],
  clusters: [],
  pat: null,

  buildPattern() {
    const { W, H } = FB;
    this.pat = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) this.pat[y * W + x] = ((x + y) & 1) ? 255 : 0;
  },

  addIcon(o) {
    if (this.icons.find(i => i.id === o.id)) return null;
    const ic = Object.assign({ id: o.id, name: o.name || o.id, icon: o.icon || 'doc', x: 0, y: 0, visible: true, sel: false, fixed: false, keep: false, fade: 0, node: o.node || null }, o);
    this.icons.push(ic);
    this.layout();
    return ic;
  },
  removeIcon(id) {
    const i = this.icons.findIndex(i => i.id === id);
    if (i >= 0) { this.icons.splice(i, 1); this.layout(); }
  },
  icon(id) { return this.icons.find(i => i.id === id); },

  layout() {
    let y = FB.menuBarH + 16;
    for (const ic of this.icons) {
      if (!ic.visible || ic.fixed || ic.keep) continue;
      ic.x = FB.W - 54; ic.y = y; y += 50;
    }
    for (const ic of this.icons) if (ic.fixed) { ic.x = FB.W - 54; ic.y = FB.H - 58; }
  },

  addCluster(c) { this.clusters.push(Object.assign({ r: 40, a: 0, life: 26000 }, c)); },

  tick(dt, cursor) {
    for (const ic of this.icons) {
      if (ic.fade > 0) { ic.fade -= dt / 9000; if (ic.fade < 0) ic.fade = 0; }
      if (cursor && Math.hypot(ic.x - cursor.x, ic.y - cursor.y) < 70) ic.fade = 0;
    }
    for (let i = this.clusters.length - 1; i >= 0; i--) {
      const c = this.clusters[i];
      c.life -= dt;
      c.a = clamp(Math.min(c.a + dt / 9000, (c.life > 6000 ? 1 : c.life / 6000)), 0, 1);
      if (c.life <= 0) this.clusters.splice(i, 1);
    }
  },

  draw(cursor, dragging) {
    FB.buf.set(this.pat);
    // racimos de pareidolia
    for (const c of this.clusters) {
      const a = c.a * 0.5;
      for (let y = Math.max(FB.menuBarH, c.y - c.r); y < Math.min(FB.H, c.y + c.r); y++) {
        for (let x = Math.max(0, c.x - c.r); x < Math.min(FB.W, c.x + 2 * c.r); x++) {
          const d = Math.hypot(x - c.x, (y - c.y) * 1.35);
          if (d > c.r) continue;
          const s = (1 - d / c.r) * a;
          if (s > 0.18) plot(x, y, clamp(0.5 - s, 0, 1));
        }
      }
    }
    for (const ic of this.icons) {
      if (!ic.visible) continue;
      drawIcon(ic.icon, ic.x, ic.y, 1);
      const tw = textW(ic.name);
      const tx = Math.round(ic.x + 16 - tw / 2), ty = ic.y + 34;
      if (ic.sel) { fillRect(tx - 2, ty - 1, tw + 4, FB.font.size + 2, 0); text(ic.name, tx, ty, 1); }
      else text(ic.name, tx, ty, 0);
      if (ic.fade > 0) this.applyFade(ic.x - 2, ic.y - 2, 36, 50, ic.fade);
    }
    if (dragging) drawIcon(dragging.icon, Math.round(cursor.x - 16), Math.round(cursor.y - 16), 1);
  },

  applyFade(x, y, w, h, amt) {
    const thr = amt * 255;
    for (let j = Math.max(FB.menuBarH, y); j < Math.min(FB.H, y + h); j++)
      for (let i = Math.max(0, x); i < Math.min(FB.W, x + w); i++) {
        const idx = j * FB.W + i;
        if (FB.buf[idx] < thr) FB.buf[idx] = this.pat[idx];
      }
  }
};
