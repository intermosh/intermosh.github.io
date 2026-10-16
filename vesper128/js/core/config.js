/* vesper128 · core/config — carga y acceso a data/game.json (fuente única de verdad).
   El motor no contiene narrativa ni efectos: todo proviene de este archivo,
   compartido con editor.html. */

import { getPath, setPath } from './util.js';

const DEFAULTS = {
  meta: { workingName: 'vesper128', version: '0.0.1', title: '' },
  runtime: { narrative: true, effects: true },
  display: {
    resolution: [512, 342],
    scaleMode: 'fill',   // 'fill' = ocupa todo el espacio · 'integer' = escala entera centrada
    logo: 'logo',
    font: { size: 11, advance: 7, lineHeight: 13, threshold: 96, weight: 'bold', stack: '"DejaVu Sans Mono","Liberation Mono","Menlo","Consolas","Courier New",monospace' },
    palette: {
      acts: [
        { t: 0.00, paper: [214, 200, 168], ink: [10, 10, 11], contrast: 1.06, lift: 0.000 },
        { t: 0.30, paper: [203, 202, 199], ink: [10, 10, 11], contrast: 1.03, lift: 0.010 },
        { t: 0.62, paper: [190, 196, 203], ink: [16, 16, 18], contrast: 0.98, lift: 0.035 },
        { t: 1.00, paper: [176, 190, 206], ink: [26, 27, 30], contrast: 0.90, lift: 0.075 }
      ]
    },
    crt: {
      curvature: 0.14,      // 0 = plano · 1 = tubo pronunciado. Default: apenas perceptible.
      scanlines: 0.14,
      vignette: 0.50,
      bloom: 0.09,
      roll: 0.35,
      flickerBase: 0.010,
      flickerTension: 0.040,
      noiseMax: 0.10,
      glitchAbove: 0.72,
      glitchAmount: 0.22,
      glow: '#e2dece'
    }
  },
  audio: {
    master: 0.85,
    layers: {
      sub: { freqs: [18.97, 19.4], gain: [0.02, 0.30], harmonic: { freq: 37.94, gain: [0.004, 0.035] } },
      mains: { freqs: [50, 100, 150], gain: [0.030, 0.012] },
      flyback: { freq: 15625, gain: [0.0035, 0.010] },
      bed: { filter: [300, 2100], gain: [0.012, 0.055] },
      cluster: { freqs: [110, 116.5, 164.8], gain: [0, 0.055], start: 0.32 },
      tinnitus: { freq: 12400, drift: 900, gain: [0, 0.0045], start: 0.50 },
      whisper: { formants: [520, 1180, 2450], gain: [0, 0.030], start: 0.62 }
    }
  },
  clock: { base: [1994, 10, 2, 3, 14, 7], frozen: true, mode: 'owner', drift: 0 },
  desktop: { pattern: 'checker' },
  apps: {},
  ending: { title: 'COPIAR', text: '', buttons: ['Copiar'], copyLabel: 'COPIANDO', offLabel: 'SE APAGA' },
  boot: { warn: { lines: [], button: 'ENCENDER', reduced: 'modo reducido (menos parpadeo)' }, post: { lines: [] }, happy: { icon: 'happy', wrongIcon: 'happyWrong', label: '', duration: 2200 }, post2: { lines: [] } },
  fs: { desktop: [], nodes: {} },
  docs: {},
  sounds: [],
  menus: { base: [], extra: [] },
  dialogs: { invitados: [] },
  subliminal: { words: [], frames: 2, contrast: 0.44 },
  anomalies: { intervalBase: 26000, intervalMin: 9000, pool: [] },
  story: { enabled: true, nodes: [], edges: [] }
};

export const Config = {
  raw: null,
  url: 'data/game.json',
  loaded: false,
  error: null,

  async load(url) {
    this.url = url || this.url;
    try {
      const res = await fetch(this.url, { cache: 'no-store' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      this.raw = await res.json();
      this.loaded = true;
    } catch (e) {
      this.error = e;
      this.raw = JSON.parse(JSON.stringify(DEFAULTS));
      this.loaded = false;
    }
    return this;
  },

  /** get con ruta y default de DEFAULTS */
  get(path, dflt) {
    const v = getPath(this.raw, path, undefined);
    if (v !== undefined) return v;
    return getPath(DEFAULTS, path, dflt);
  },
  set(path, value) { setPath(this.raw, path, value); },
  all() { return this.raw; },

  /** mezcla profunda de defaults + archivo (para edición/validación) */
  merged() {
    const merge = (a, b) => {
      if (Array.isArray(a) || Array.isArray(b)) return b !== undefined ? b : a;
      if (typeof a === 'object' && a && typeof b === 'object' && b) {
        const out = { ...a };
        for (const k of Object.keys(b)) out[k] = merge(a[k], b[k]);
        return out;
      }
      return b !== undefined ? b : a;
    };
    return merge(JSON.parse(JSON.stringify(DEFAULTS)), this.raw || {});
  }
};

export { DEFAULTS };
