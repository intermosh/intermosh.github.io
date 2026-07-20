/* ai-shared.js — Shared AI utilities for ES module workers.
   Provides text sanitization (e5-small tokenizer safe) and vector math.
   
   Used by: ai-worker.js
   NOT used by: sentiment-worker.js (has its own tokenizer-specific
   sanitizeText for robertuito BPE — do NOT unify). */

export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return ' ';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')   // control chars
    .replace(/[\u200B-\u200D\uFEFF]/g, '')                   // zero-width, BOM
    .replace(/[\uD800-\uDFFF]/g, '')                         // surrogate pairs rotos
    .replace(/[\uE000-\uF8FF]/g, '')                         // private use area
    .replace(/[\uFFFE\uFFFF]/g, '')                          // non-characters
    .replace(/[\u{10000}-\u{10FFFF}]/gu, c => {              // chars fuera BMP: mantener solo CJK comun + latin extendido
      const cp = c.codePointAt(0);
      if (cp >= 0x10000 && cp <= 0x2FFFF) return c;
      return '';
    })
    .trim() || ' ';
}

export function dot(a, b) {
  if (!a || !b) return 0;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function cosineSim(a, b) {
  if (!a || !b) return 0;
  const d = dot(a, b);
  const na = Math.sqrt(a.reduce((s, x) => s + x * x, 0));
  const nb = Math.sqrt(b.reduce((s, x) => s + x * x, 0));
  return d / (na * nb || 1);
}