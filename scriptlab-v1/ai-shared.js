/* ai-shared.js — Primitivas puras (matemáticas + léxicas) compartidas entre
   el hilo principal y los Web Workers.
   Implementa §13.3 del contrato.
   No importa de ningún módulo. Importable desde main thread y workers. */

/* ============================================================
   Sanitización para embeddings e5-small
   ============================================================ */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return ' ';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')   // control chars
    .replace(/[\u200B-\u200D\uFEFF]/g, '')                       // zero-width, BOM
    .replace(/[\uD800-\uDFFF]/g, '')                             // surrogates rotos
    .replace(/[\uE000-\uF8FF]/g, '')                             // private use area
    .replace(/[\uFFFE\uFFFF]/g, '')                              // non-characters
    .replace(/[\u{10000}-\u{10FFFF}]/gu, c => {                  // fuera de BMP
      const cp = c.codePointAt(0);
      if (cp >= 0x10000 && cp <= 0x2FFFF) return c;              // CJK común + latin extendido
      return '';
    })
    .trim() || ' ';
}

/* ============================================================
   Sanitización agresiva para RoBERTuito (BPE)
   Tokenizador distinto al de e5: NO unificar (lección de v16).
   ============================================================ */
export function sanitizeSentimentText(text) {
  if (!text || typeof text !== 'string') return 'texto';
  const s = text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')   // control chars
    .replace(/[\u200B-\u200D\uFEFF]/g, '')                       // zero-width, BOM
    .replace(/[\uD800-\uDFFF]/g, '')                             // surrogates rotos
    .replace(/[\uE000-\uF8FF]/g, '')                             // private use area
    .replace(/[\uFFFE\uFFFF]/g, '')                              // non-characters
    .trim();
  // We don't remove emojis or other special characters because the model can handle them or ignore them,
  // but we make sure we don't break the tokenizer with corrupted characters.
  return s.length > 0 ? s : 'texto';
}

/* ============================================================
   Álgebra vectorial
   ============================================================ */
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

/* ============================================================
   Conteo de sílabas en español (para Fernández-Huerta)
   ============================================================ */
export function syllables(w) {
  w = (w || '').toLowerCase().replace(/[^a-záéíóúüñ]/g, '');
  if (!w) return 0;
  
  let n = 0;
  let lastWasVowel = false;
  let lastWasStrongOrAccentedWeak = false;
  
  const strongOrAccentedWeak = 'aeoáéóíú';
  const weakUnaccented = 'iuü';
  
  for (const c of w) {
    const isStrong = strongOrAccentedWeak.includes(c);
    const isWeak = weakUnaccented.includes(c);
    const isVowel = isStrong || isWeak;
    
    if (isVowel) {
      if (!lastWasVowel) {
        n++;
      } else if (isStrong && lastWasStrongOrAccentedWeak) {
        // Hiatus: two strong vowels or accented weak vowels separate
        n++;
      }
      lastWasStrongOrAccentedWeak = isStrong;
      lastWasVowel = true;
    } else {
      lastWasVowel = false;
      lastWasStrongOrAccentedWeak = false;
    }
  }
  return Math.max(1, n);
}

/* ============================================================
   Conteos léxicos
   ============================================================ */
export function wordCount(text) {
  return (text || '').trim().match(/[\p{L}\p{N}'''-]+/gu)?.length || 0;
}

export function sentenceCount(text) {
  return (text || '').split(/[.!?]+/).filter(s => s.trim()).length || 1;
}

/* ============================================================
   Fórmula de legibilidad de Fernández-Huerta (1959)
   Adaptación española del Flesch Reading Ease (Flesch, 1948).
   Fuente: Fernández Huerta, J. (1959). "Medidas sencillas de
   lecturabilidad." Consigna, 214, 29-32.
   Constantes 206.84, 60, 1.02 directas de la publicación original.
   ============================================================ */
export function fernandezHuerta(text) {
  const ws = (text || '').match(/[\p{L}]+/gu) || [];
  const ss = sentenceCount(text);
  if (!ws.length) return 0;
  const syllableRatio = ws.reduce((n, w) => n + syllables(w), 0) / ws.length;
  const wordsPerSentence = ws.length / ss;
  return Math.max(0, Math.min(100, 206.84 - 60 * syllableRatio - 1.02 * wordsPerSentence));
}

/* ============================================================
   Estimación de duración en segundos según WPM
   ============================================================ */
export function durationInSeconds(text, wpm = 150) {
  return Math.round(wordCount(text) / (wpm || 150) * 60);
}

/* ============================================================
   Solapamiento léxico (palabras ≥4 letras)
   ============================================================ */
export function overlap(a, b) {
  const x = new Set((a || '').toLowerCase().match(/[\p{L}]{4,}/gu) || []);
  const y = new Set((b || '').toLowerCase().match(/[\p{L}]{4,}/gu) || []);
  return [...x].some(w => y.has(w));
}
