/* vesper128 · editor/preview — vista previa real del tubo dentro del editor:
   reutiliza el framebuffer, la paleta y las capas CRT del motor, así lo que se
   ve es exactamente lo que hará index.html. */

import { FB, configure, attach, fbClear, fillRect, strokeRect, hline, vline, text, textC, textW, drawIcon, registerIcons, present } from '../core/framebuffer.js';
import { CRT } from '../core/crt.js';
import { SPRITES } from '../core/icons.js';
import { sampleActs, clamp } from '../core/util.js';
import { Store } from './store.js';

export const Preview = {
  stage: null, view: null, bloom: null,
  tension: 0.12,
  showWindow: true,
  scale: 1,
  lastRes: '',
  running: false,

  init(stage) {
    this.stage = stage;
    this.view = stage.querySelector('#view');
    this.bloom = stage.querySelector('#bloom');
    registerIcons(SPRITES);
    const custom = Store.get('sprites', null);
    if (custom) registerIcons(custom);
    attach(this.view);
    CRT.attach(stage, this.bloom);
    this.apply();
    this.configureCRT();
    if (!this.running) { this.running = true; const loop = () => { this.frame(); requestAnimationFrame(loop); }; loop(); }
    Store.subscribe((what) => { if (what === 'load' || what === 'display' || what === 'sprites') this.apply(); });
  },

  apply() {
    const disp = Store.get('display', {}) || {};
    const resKey = JSON.stringify(disp.resolution || [512, 342]) + JSON.stringify(disp.font || {});
    if (resKey !== this.lastRes) { configure(disp); this.lastRes = resKey; }
    else { FB.W = (disp.resolution || [512, 342])[0]; FB.H = (disp.resolution || [512, 342])[1]; }
    const custom = Store.get('sprites', null);
    if (custom) registerIcons(custom);
    this.sizeCanvas();
    this.configureCRT();
  },

  sizeCanvas() {
    const host = this.stage.parentElement;
    const avail = Math.max(160, (host ? host.clientWidth : 520) - 8);
    this.scale = Math.max(0.35, Math.min(2, avail / FB.W));
    const w = Math.round(FB.W * this.scale), h = Math.round(FB.H * this.scale);
    for (const c of [this.view, this.bloom]) {
      c.width = w; c.height = h; c.style.width = w + 'px'; c.style.height = h + 'px';
    }
    FB.vctx = this.view.getContext('2d', { alpha: false });
    FB.vctx.imageSmoothingEnabled = false;
    FB.SCALE = this.scale;
    FB.lit.width = FB.W; FB.lit.height = FB.H;
    FB.img = FB.litCtx.createImageData(FB.W, FB.H);
    CRT.resize(w, h);
    this.stage.style.width = w + 'px';
    this.stage.style.height = h + 'px';
  },

  configureCRT() {
    CRT.configure(Store.get('display.crt', {}));
  },

  frame() {
    const t = clamp(this.tension, 0, 1);
    fbClear(255);
    // trama de escritorio
    for (let y = FB.menuBarH; y < FB.H; y++) for (let x = 0; x < FB.W; x++) if (((x + y) & 1) === 0) FB.buf[y * FB.W + x] = 0;

    // iconos de ejemplo
    const names = ['disk', 'folder', 'trash'];
    names.forEach((n, i) => {
      const x = FB.W - 54, y = FB.menuBarH + 16 + i * 50;
      drawIcon(n, x, y, 1);
      text(n.toUpperCase(), x - 4, y + 34, 0);
    });

    // barra de menú
    fillRect(0, 0, FB.W, FB.menuBarH, 1);
    hline(0, FB.W - 1, FB.menuBarH - 1, 0);
    drawIcon(Store.get('display.logo', 'logo') || 'logo', 7, 5, 1);
    let mx = 26;
    ['Archivo', 'Edición', 'Especial'].forEach(l => { text(l, mx + 5, 5, 0); mx += textW(l) + 14; });
    text('03:14', FB.W - textW('03:14') - 8, 5, 0);

    // ventana de ejemplo (para juzgar legibilidad y envoltura)
    if (this.showWindow) {
      const wx = 40, wy = FB.menuBarH + 24, ww = Math.min(300, FB.W - 130), wh = 150;
      fillRect(wx, wy, ww, wh, 1);
      strokeRect(wx, wy, ww, wh, 0);
      strokeRect(wx + 1, wy + 1, ww - 2, wh - 2, 0);
      fillRect(wx + 2, wy + 2, ww - 4, 13, 1);
      for (let i = wx + 22; i < wx + ww - 22; i += 2) vline(i, wy + 3, wy + 13, 0);
      fillRect(wx + 22, wy + 2, ww - 44, 13, 1);
      textC('CUADERNO.TXT', wx + ww / 2, wy + 3, 0);
      strokeRect(wx + 6, wy + 4, 9, 8, 0);
      strokeRect(wx + ww - 15, wy + 4, 9, 8, 0);
      const cols = Math.max(8, Math.floor((ww - 14) / FB.font.advance));
      const sample = 'El patrón no se repite. Responde. Cuando dejo de escribir, el renglón siguiente ya está escrito.';
      const words = sample.split(' ');
      let line = '', ly = wy + 22;
      words.forEach(wd => {
        if ((line + ' ' + wd).trim().length > cols) { text(line.trim(), wx + 6, ly, 0); line = wd; ly += FB.font.lineHeight; }
        else line += ' ' + wd;
      });
      if (line.trim()) text(line.trim(), wx + 6, ly, 0);
      text('curvatura ' + (Store.get('display.crt.curvature', 0)).toFixed(3) + '  ·  tensión ' + t.toFixed(2), wx + 6, wy + wh - 16, 0.45);
    }

    const pal = sampleActs(Store.get('display.palette.acts', []), t, ['paper', 'ink', 'contrast', 'lift']);
    present({
      paper: pal.paper || [214, 200, 168],
      ink: pal.ink || [10, 10, 11],
      contrast: pal.contrast == null ? 1 : pal.contrast,
      lift: pal.lift || 0,
      noise: CRT.noise(t),
      flick: CRT.flick(16, t),
      curvature: Store.get('display.crt.curvature', 0),
      glitch: CRT.glitchChance(t)
    });
    CRT.tick();
  }
};
