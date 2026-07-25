/* ai-shared.js — Primitivas puras (matemáticas + léxicas) compartidas entre
   el hilo principal y los Web Workers.
   Implementa §13.3 del contrato.
   No importa de ningún módulo. Importable desde main thread y workers.

   ENGINE combined-1.0 (base mimo + rescates arena):
   - syllables(): reescrita por GRUPOS vocálicos delimitados por consonantes
     (bug P0 mimo: fusionaba vocales de sílabas distintas descartando
     consonantes; arena era aprox. RAE salvo triptongos — se rescató su
     semántica y se agregaron triptongos, vocal 'y' y acento por grupo).
   - fernandezHuerta(): null si hay <3 palabras (los callers deciden);
     sin piso 0 (el valor crudo negativo es información, no se oculta).
   - sanitizeSentimentText(): conserva emojis/latin extendido (arena), control
     a espacio (mimo), sin fallback 'texto' (fabricaba puntos fantasma).
   - sanitizeText(): se eliminó el branch '>BMP' (código muerto en ambos
     builds: la clase U+D800-DFFF ya eliminaba los pares antes). */

/* ============================================================
   Sanitización para embeddings e5-small.
   COMBINED nota: [U+D800-DFFF] sin flag u elimina TODOS los surrogates —
   también los pares válidos (emojis). Es el comportamiento que ambos
   builds tenían en la práctica para embeddings; se conserva por
   compatibilidad semántica con el modelo e5.
   ============================================================ */
export function sanitizeText(text) {
  if (!text || typeof text !== 'string') return ' ';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')   // control chars
    .replace(/[\u200B-\u200D\uFEFF]/g, '')                       // zero-width, BOM
    .replace(/[\uD800-\uDFFF]/g, '')                             // surrogates (todos, ver nota)
    .replace(/[\uE000-\uF8FF]/g, '')                             // private use area
    .replace(/[\uFFFE\uFFFF]/g, '')                              // non-characters
    .trim() || ' ';
}

/* ============================================================
   Sanitización para RoBERTuito (BPE, sentimiento)
   COMBINED: rescate de arena (NO eliminar emojis ni latin extendido —
   robertuito se entrenó con redes sociales y los maneja) + de mimo
   (controles a espacio, colapso de whitespace).
   La flag 'u' en la clase de surrogates hace que solo se eliminen los
   SUELTOS (un par válido es un único code point astral y no matchea).
   Sin fallback 'texto': '' significa "no analizable" y los callers filtran.
   ============================================================ */
export function sanitizeSentimentText(text) {
  if (!text || typeof text !== 'string') return '';
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g, ' ')  // controles a espacio (mimo)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')                                   // zero-width, BOM (arena)
    .replace(/[\uD800-\uDFFF]/gu, '')                                        // surrogates sueltos (flag u)
    .replace(/[\uE000-\uF8FF]/g, '')                                         // private use
    .replace(/[\uFFFE\uFFFF]/g, '')                                          // non-characters
    .replace(/\s+/g, ' ')
    .trim();
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
   COMBINED — algoritmo por GRUPOS vocálicos:
   1. Las consonantes separan sílabas mecánicamente: cada run maximal de
      vocales es UN grupo candidato (bug P0 mimo: ignoraba consonantes y
      fusionaba vocales ajenas — productividad daba 3 en vez de 5,
      continuo 2 en vez de 3).
   2. Reglas RAE mecánicas dentro del grupo:
      - Dos abiertas = hiato (po-e-te, ca-os)
      - Cerrada tónica = hiato (dí-a, re-ír, pa-ís, Ra-úl, tí-o)
      - Cerrada átona + abierta = diptongo aunque la abierta sea tónica
        (tier-ra, a-gua, can-ción, mur-cié-la-go, e-xá-men)
      - Abierta + cerrada átona = diptongo (vai-na, bue-no, lim-piáis)
      - iu / ui átonas = diptongo (viu-da, rui-do, ciu-dad)
      - Triptongo: cerrada+abierta+cerrada sin tónicas, grupo de 3 = 1
        (guau, buey, lim-piáis)
   - 'y' se trata como vocal cerrada (rey, es-toy, le-yes).
   Suite de verificación en tests/run-tests.mjs.
   ============================================================ */
export function syllables(w) {
  w = (w || '').toLowerCase().normalize('NFC');
  if (!w) return 0;
  const CLOSED = 'iuüy';
  const OPEN = 'aeoáéó';
  const isVowel = ch => CLOSED.includes(ch) || OPEN.includes(ch) || ch === 'í' || ch === 'ú';

  // 1. Runs de vocales separados por consonantes
  const groups = [];
  let cur = '';
  for (const ch of w) {
    if (isVowel(ch)) cur += ch;
    else if (cur) { groups.push(cur); cur = ''; }
  }
  if (cur) groups.push(cur);
  if (!groups.length) return 1;

  const isClosed = c => CLOSED.includes(c);
  const isStressed = c => 'áéíóú'.includes(c);
  const isDiphthong = (a, b) => {
    if (!isClosed(a) && !isClosed(b)) return false;   // dos abiertas = hiato
    if (isClosed(a) && isStressed(a)) return false;    // cerrada tónica 1ª (í-a)
    if (isClosed(b) && isStressed(b)) return false;    // cerrada tónica 2ª (e-ír)
    return true;                                        // todo lo demás = diptongo
  };

  let n = 0;
  for (const g of groups) {
    const chars = [...g];
    if (chars.length === 1) { n += 1; continue; }
    // Triptongo estricto: cerrada+abierta+cerrada, ninguna tónica = 1
    if (chars.length === 3 &&
        isClosed(chars[0]) && !isClosed(chars[1]) && isClosed(chars[2]) &&
        !chars.some(isStressed)) { n += 1; continue; }
    let i = 0;
    while (i < chars.length) {
      n += 1;
      if (i + 1 < chars.length && isDiphthong(chars[i], chars[i + 1])) { i += 2; continue; }
      i += 1;
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
   COMBINED: null = datos insuficientes (<3 palabras). Sin piso 0:
   el FH crudo puede ser negativo (texto muy difícil); mostrar 0
   ocultaba el diagnóstico (bug arena: "FH=0" en guiones dificilísimos).
   ============================================================ */
export function fernandezHuerta(text) {
  const ws = (text || '').match(/[\p{L}]+/gu) || [];
  const ss = sentenceCount(text);
  if (ws.length < 3) return null; // datos insuficientes: los callers deciden
  const syllableRatio = ws.reduce((n, w) => n + syllables(w), 0) / ws.length;
  const wordsPerSentence = ws.length / ss;
  return Math.min(100, 206.84 - 60 * syllableRatio - 1.02 * wordsPerSentence);
}

/* ============================================================
   Estimación de duración en segundos según WPM
   ============================================================ */
export function durationInSeconds(text, wpm = 150) {
  if (!wpm || wpm <= 0) return 0;
  return Math.round(wordCount(text) / wpm * 60);
}

/* ============================================================
   Solapamiento léxico (palabras ≥4 letras)
   ============================================================ */
export function overlap(a, b) {
  const x = new Set((a || '').toLowerCase().match(/[\p{L}]{4,}/gu) || []);
  const y = new Set((b || '').toLowerCase().match(/[\p{L}]{4,}/gu) || []);
  return [...x].some(w => y.has(w));
}
