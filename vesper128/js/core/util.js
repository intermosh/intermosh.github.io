/* vesper128 · core/util — matemáticas y aleatoriedad mínimas. Sin dependencias. */

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const rnd = (a = 1, b = 0) => b + Math.random() * (a - b);
export const rndi = (n) => (Math.random() * n) | 0;
export const pick = (arr) => arr[(Math.random() * arr.length) | 0];
export const chance = (p) => Math.random() < p;
export const now = () => performance.now();

/** RNG con semilla (mulberry32) para contenido determinista cuando se quiera. */
export function seeded(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Interpola una lista de actos [{t, ...vals}] en un escalar x. */
export function sampleActs(acts, x, keys) {
  if (!acts || !acts.length) return {};
  const out = {};
  let i = 0;
  while (i < acts.length - 1 && acts[i + 1].t <= x) i++;
  const a = acts[i], b = acts[Math.min(i + 1, acts.length - 1)];
  const span = (b.t - a.t) || 1;
  const t = smooth(clamp((x - a.t) / span, 0, 1));
  for (const k of keys) {
    const av = a[k], bv = b[k];
    if (av == null || bv == null) { out[k] = av != null ? av : bv; continue; }
    if (Array.isArray(av)) out[k] = av.map((v, j) => lerp(v, bv[j] ?? v, t));
    else if (typeof av === 'number') out[k] = lerp(av, bv, t);
    else out[k] = t < 0.5 ? av : bv;
  }
  return out;
}

/** Profundiza un get por ruta "a.b.c". */
export function getPath(obj, path, dflt) {
  let cur = obj;
  for (const p of String(path).split('.')) {
    if (cur == null) return dflt;
    cur = cur[p];
  }
  return cur === undefined ? dflt : cur;
}

export function setPath(obj, path, value) {
  const parts = String(path).split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

export const uid = (prefix = 'id') =>
  `${prefix}_${Math.random().toString(36).slice(2, 8)}${Date.now().toString(36).slice(-3)}`;

export function download(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 200);
}
