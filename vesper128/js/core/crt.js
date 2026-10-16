/* vesper128 · core/crt — capa de tubo: bloom, viñeta, reflejo, barrido y flicker.
   Todo parametrizado desde display.crt (editable en editor.html). */

import { clamp } from './util.js';
import { FB } from './framebuffer.js';

export const CRT = {
  cfg: {},
  stage: null, bloom: null, bctx: null,
  layers: {},
  frame: 0,
  reduced: false,
  phase: Math.random() * 100,

  attach(stage, bloomCanvas) {
    this.stage = stage;
    this.bloom = bloomCanvas;
    this.bctx = bloomCanvas ? bloomCanvas.getContext('2d') : null;
    this.layers.vignette = stage.querySelector('#vignette');
    this.layers.glass = stage.querySelector('#glass');
    this.layers.roll = stage.querySelector('#roll');
  },

  configure(crt) {
    this.cfg = Object.assign({
      curvature: 0.14, scanlines: 0.14, vignette: 0.5, bloom: 0.09, roll: 0.35,
      flickerBase: 0.010, flickerTension: 0.040, noiseMax: 0.10,
      glitchAbove: 0.72, glitchAmount: 0.22, glow: '#e2dece'
    }, crt || {});
    const c = this.cfg;
    if (this.layers.vignette) this.layers.vignette.style.opacity = clamp(c.vignette, 0, 1);
    if (this.layers.glass) this.layers.glass.style.opacity = 1;
    if (this.layers.roll) { this.layers.roll.style.opacity = clamp(c.roll, 0, 1); }
    if (this.bloom) {
      this.bloom.style.opacity = clamp(c.bloom, 0, 1);
      this.bloom.style.filter = `blur(${Math.round(6 + c.curvature * 4)}px)`;
    }
    if (this.stage) {
      const r = Math.round(4 + c.curvature * 26);
      this.stage.style.borderRadius = r + 'px';
      this.stage.style.setProperty('--glow', c.glow);
      this.stage.style.boxShadow = `0 0 ${Math.round(20 + c.bloom * 160)}px var(--glow)`;
    }
  },

  resize(w, h) {
    if (this.bloom) { this.bloom.width = w; this.bloom.height = h; this.bloom.style.width = w + 'px'; this.bloom.style.height = h + 'px'; }
    // scanlines pre-renderizadas sobre el bloom (baratas): se aplican vía CSS en #stage
    if (this.stage) {
      const s = FB.SCALE;
      const period = Math.max(2, s);
      const dark = clamp(this.cfg.scanlines, 0, 1) * 0.55;
      this.stage.style.setProperty('--scan-period', period + 'px');
      this.stage.style.setProperty('--scan-dark', dark.toFixed(3));
    }
  },

  /** flicker: dos modulaciones lentas + una componente cercana a alfa, amplitud mínima. */
  flick(dt, tension) {
    const c = this.cfg;
    this.phase += dt * 0.001;
    const amp = (c.flickerBase + (c.flickerTension - c.flickerBase) * clamp(tension, 0, 1)) * (this.reduced ? 0.3 : 1);
    const f = Math.sin(this.phase * 7.5) * 0.55 + Math.sin(this.phase * 0.7) * 0.45;
    return f * amp + (Math.random() < 0.004 ? -0.05 : 0);
  },

  glitchChance(tension) {
    const c = this.cfg;
    return tension > c.glitchAbove ? (tension - c.glitchAbove) * c.glitchAmount : 0;
  },
  noise(tension) { return clamp((tension - 0.4) / 0.6, 0, 1) * this.cfg.noiseMax; },

  tick() {
    if (!this.bctx) return;
    this.frame++;
    if ((this.frame & 1) !== 0) return;
    const w = this.bloom.width, h = this.bloom.height;
    if (!w || !h) return;
    this.bctx.clearRect(0, 0, w, h);
    this.bctx.drawImage(FB.lit, 0, 0, FB.W, FB.H, 0, 0, w, h);
  }
};
