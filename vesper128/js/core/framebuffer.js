/* vesper128 · core/framebuffer — framebuffer lógico 1-bit, fuente bitmap generada
   en runtime, primitivas de dibujo y presentación con curvatura CRT sutil. */

import { clamp } from './util.js';

export const FB = {
  W: 512, H: 342,
  buf: null,
  lit: null, litCtx: null, img: null,
  view: null, vctx: null,
  SCALE: 2,
  font: { size: 11, advance: 7, lineHeight: 13, threshold: 96, weight: 'bold', stack: 'monospace' },
  menuBarH: 20
};

/* matriz Bayer 4×4 → 16 umbrales */
export const BAYER4 = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) * 16));

export function configure(display) {
  const [w, h] = display.resolution || [512, 342];
  FB.W = w; FB.H = h;
  FB.buf = new Uint8Array(w * h);
  FB.lit = document.createElement('canvas');
  FB.lit.width = w; FB.lit.height = h;
  FB.litCtx = FB.lit.getContext('2d', { alpha: false });
  FB.img = FB.litCtx.createImageData(w, h);
  Object.assign(FB.font, display.font || {});
}

export function attach(viewCanvas) {
  FB.view = viewCanvas;
  FB.vctx = viewCanvas.getContext('2d', { alpha: false });
}

export function fitScale(scaleMode = 'integer') {
  const { W, H } = FB;
  let s;
  if (scaleMode === 'fill') s = Math.min(window.innerWidth / W, window.innerHeight / H);
  else s = Math.max(1, Math.floor(Math.min(window.innerWidth / W, window.innerHeight / H)));
  FB.SCALE = s;
  const pw = Math.round(W * s), ph = Math.round(H * s);
  FB.view.width = pw; FB.view.height = ph;
  FB.view.style.width = pw + 'px'; FB.view.style.height = ph + 'px';
  FB.vctx.imageSmoothingEnabled = false;
  return s;
}

/* ---------------- primitivas ---------------- */
export function fbClear(v = 255) { FB.buf.fill(v); }

export function fbPx(x, y, v) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= FB.W || y >= FB.H) return;
  FB.buf[y * FB.W + x] = v;
}

export function plot(x, y, shade) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= FB.W || y >= FB.H) return;
  if (shade === 0.5) { FB.buf[y * FB.W + x] = ((x + y) & 1) ? 255 : 0; return; }
  FB.buf[y * FB.W + x] = (shade * 255 >= BAYER4[(y & 3) * 4 + (x & 3)]) ? 255 : 0;
}

export function fillRect(x, y, w, h, shade = 1) {
  x |= 0; y |= 0; w |= 0; h |= 0;
  const { W, H, buf } = FB;
  const y0 = Math.max(0, y), y1 = Math.min(H, y + h), x0 = Math.max(0, x), x1 = Math.min(W, x + w);
  if (shade >= 0.999) { for (let j = y0; j < y1; j++) buf.fill(255, j * W + x0, j * W + x1); return; }
  if (shade <= 0.001) { for (let j = y0; j < y1; j++) buf.fill(0, j * W + x0, j * W + x1); return; }
  for (let j = y0; j < y1; j++) for (let i = x0; i < x1; i++) plot(i, j, shade);
}

export function strokeRect(x, y, w, h, shade = 0) {
  fillRect(x, y, w, 1, shade); fillRect(x, y + h - 1, w, 1, shade);
  fillRect(x, y, 1, h, shade); fillRect(x + w - 1, y, 1, h, shade);
}
export function fillRound(x, y, w, h, shade) {
  fillRect(x + 2, y, w - 4, h, shade); fillRect(x, y + 2, w, h - 4, shade); fillRect(x + 1, y + 1, w - 2, h - 2, shade);
}
export function strokeRound(x, y, w, h, shade = 0) {
  fillRect(x + 2, y, w - 4, 1, shade); fillRect(x + 2, y + h - 1, w - 4, 1, shade);
  fillRect(x, y + 2, 1, h - 4, shade); fillRect(x + w - 1, y + 2, 1, h - 4, shade);
  const c = shade === 0 ? 0 : 255;
  fbPx(x + 1, y + 1, c); fbPx(x + w - 2, y + 1, c); fbPx(x + 1, y + h - 2, c); fbPx(x + w - 2, y + h - 2, c);
}
export function hline(x0, x1, y, shade = 0) { for (let i = Math.min(x0, x1) | 0; i <= (Math.max(x0, x1) | 0); i++) plot(i, y | 0, shade); }
export function vline(x, y0, y1, shade = 0) { for (let j = Math.min(y0, y1) | 0; j <= (Math.max(y0, y1) | 0); j++) plot(x | 0, j, shade); }
export function line(x0, y0, x1, y1, shade = 0) {
  x0 |= 0; y0 |= 0; x1 |= 0; y1 |= 0;
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  for (;;) { plot(x0, y0, shade); if (x0 === x1 && y0 === y1) break; const e2 = 2 * err; if (e2 >= dy) { err += dy; x0 += sx; } if (e2 <= dx) { err += dx; y0 += sy; } }
}

/* ---------------- fuente bitmap ---------------- */
const GLYPHS = new Map();
function glyph(ch) {
  const f = FB.font;
  const key = ch + '|' + f.size + '|' + f.stack;
  let g = GLYPHS.get(key); if (g) return g;
  const S = 3, H = f.size, BH = f.size + 6;
  const c = document.createElement('canvas');
  c.width = H * S; c.height = BH * S;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff';
  x.font = `${f.weight} ${Math.round(H * 0.92 * S)}px ${f.stack}`;
  x.textBaseline = 'top';
  x.fillText(ch, Math.round(0.5 * S), Math.round(0.5 * S));
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const bits = new Uint8Array(H * BH);
  let minx = H, maxx = -1, miny = BH, maxy = -1;
  for (let j = 0; j < BH; j++) for (let i = 0; i < H; i++) {
    let s = 0;
    for (let dj = 0; dj < S; dj++) for (let di = 0; di < S; di++) s += d[((j * S + dj) * c.width + (i * S + di)) * 4];
    if (s / (S * S) > f.threshold) { bits[j * H + i] = 1; if (i < minx) minx = i; if (i > maxx) maxx = i; if (j < miny) miny = j; if (j > maxy) maxy = j; }
  }
  g = { bits, bw: H, bh: BH, empty: maxx < 0 };
  GLYPHS.set(key, g);
  return g;
}

export function text(str, x, y, shade = 0) {
  str = String(str);
  const adv = FB.font.advance, top = FB.menuBarH - FB.font.size;
  let cx = Math.round(x); const cy = Math.round(y);
  for (let k = 0; k < str.length; k++) {
    const ch = str[k];
    if (ch !== ' ') {
      const g = glyph(ch);
      if (!g.empty) for (let j = 0; j < g.bh; j++) {
        const yy = cy + j;
        if (yy < top - FB.font.size || yy >= FB.H) continue;
        for (let i = 0; i < g.bw; i++) {
          if (!g.bits[j * g.bw + i]) continue;
          const xx = cx + i;
          if (xx < 0 || xx >= FB.W) continue;
          if (shade >= 0.999) FB.buf[yy * FB.W + xx] = 255;
          else if (shade <= 0.001) FB.buf[yy * FB.W + xx] = 0;
          else plot(xx, yy, shade);
        }
      }
    }
    cx += adv;
  }
  return cx;
}

export function textBig(str, x, y, shade = 0, sc = 2) {
  str = String(str);
  let cx = Math.round(x); const cy = Math.round(y);
  for (let k = 0; k < str.length; k++) {
    const ch = str[k];
    if (ch !== ' ') {
      const g = glyph(ch);
      if (!g.empty) for (let j = 0; j < g.bh; j++) for (let i = 0; i < g.bw; i++) {
        if (!g.bits[j * g.bw + i]) continue;
        fillRect(cx + i * sc, cy + j * sc, sc, sc, shade >= 0.5 ? 1 : 0);
      }
    }
    cx += FB.font.advance * sc;
  }
  return cx;
}

export const textW = (str) => String(str).length * FB.font.advance;
export const textC = (str, cx, y, shade = 0) => text(str, Math.round(cx - textW(str) / 2), y, shade);

export function wrap(str, cols) {
  const out = [];
  for (const para of String(str).split('\n')) {
    if (para === '') { out.push(''); continue; }
    let cur = '';
    for (const word of para.split(' ')) {
      if (!cur.length) cur = word;
      else if (cur.length + 1 + word.length <= cols) cur += ' ' + word;
      else { out.push(cur); cur = word; }
      while (cur.length > cols) { out.push(cur.slice(0, cols)); cur = cur.slice(cols); }
    }
    if (cur.length) out.push(cur);
  }
  return out;
}

/* ---------------- iconos ---------------- */
export const ICONS = {};
export function registerIcons(map) { Object.assign(ICONS, map); }

export function drawIcon(name, x, y, scale = 1, invert = false) {
  const rows = ICONS[name]; if (!rows) return;
  x |= 0; y |= 0;
  for (let j = 0; j < rows.length; j++) {
    const row = rows[j];
    for (let i = 0; i < row.length; i++) {
      const c = row[i]; let shade = -1;
      if (c === '#') shade = 0; else if (c === 'o') shade = 1;
      else if (c === '%') shade = 0.5; else if (c === 'd') shade = 0.25; else if (c === 'l') shade = 0.75;
      if (shade < 0) continue;
      if (invert) shade = shade === 0 ? 1 : (shade === 1 ? 0 : 1 - shade);
      if (scale === 1) plot(x + i, y + j, shade);
      else fillRect(x + i * scale, y + j * scale, scale, scale, shade);
    }
  }
}

const CURSOR = ['#.......', '##......', '#o#.....', '#oo#....', '#ooo#...', '#oooo#..', '#ooooo#.', '#oooooo#', '#ooooo##', '#oo##o#.', '#o#.#oo#', '##..#oo#', '#....#oo', '.....##.', '........', '........'];
export function drawCursor(x, y) {
  x |= 0; y |= 0;
  for (let j = 0; j < 14; j++) for (let i = 0; i < 8; i++) {
    const c = CURSOR[j][i];
    if (c === '#') fbPx(x + i, y + j, 0); else if (c === 'o') fbPx(x + i, y + j, 255);
  }
}

/* ---------------- presentación ---------------- */
/* opts: {paper,ink,contrast,lift,noise,flick,curvature,glitch} */
export function present(o) {
  const { W, H, buf, img } = FB;
  const d = img.data;
  const p = o.paper, k = o.ink;
  const lift = o.lift || 0, con = o.contrast == null ? 1 : o.contrast;
  const fl = 1 + (o.flick || 0);
  const noise = (o.noise || 0) * 46;
  for (let i = 0, n = W * H; i < n; i++) {
    let v = buf[i];
    v = (v - 128) * con + 128;
    v = v * (1 - lift) + 255 * lift;
    if (noise > 0) v += (Math.random() * 2 - 1) * noise;
    if (v < 0) v = 0; else if (v > 255) v = 255;
    const t = v * 0.00392156862745098;
    const q = i << 2;
    d[q] = (k[0] + (p[0] - k[0]) * t) * fl;
    d[q + 1] = (k[1] + (p[1] - k[1]) * t) * fl;
    d[q + 2] = (k[2] + (p[2] - k[2]) * t) * fl;
    d[q + 3] = 255;
  }
  FB.litCtx.putImageData(img, 0, 0);

  if (o.glitch > 0 && Math.random() < o.glitch) {
    const n = 1 + ((Math.random() * 3) | 0);
    for (let g = 0; g < n; g++) {
      const y = (Math.random() * H) | 0, hh = 1 + ((Math.random() * 6) | 0);
      const dx = ((Math.random() * 24) | 0) - 12;
      FB.litCtx.drawImage(FB.lit, 0, y, W, hh, dx, y, W, hh);
    }
  }

  const S = FB.SCALE, v = FB.vctx;
  const curv = clamp(o.curvature || 0, 0, 1);
  if (curv <= 0.001) {
    v.drawImage(FB.lit, 0, 0, W, H, 0, 0, W * S, H * S);
  } else {
    // barril por filas: los bordes superior/inferior se comban hacia adentro.
    const kmax = curv * 0.02 * (W / 2);   // ≤2 % del ancho: apenas perceptible
    const cy = (H - 1) / 2;
    for (let y = 0; y < H; y++) {
      const ny = (y - cy) / cy;
      const ins = Math.round(kmax * ny * ny);
      const dw = W - ins * 2;
      if (dw <= 0) continue;
      v.drawImage(FB.lit, 0, y, W, 1, ins * S, y * S, dw * S, S);
    }
  }
}
