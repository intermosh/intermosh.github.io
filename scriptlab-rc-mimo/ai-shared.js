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
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')                       // control chars
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u2064\uFEFF]/g, '')      // zero-width, bidi
    .replace(/[\uD800-\uDFFF]/g, '')                                     // surrogates sueltos
    .replace(/[\uE000-\uF8FF]/g, '')                                     // private use
    .replace(/[\uFFFE\uFFFF\uFFF0-\uFFFD]/g, '')                         // specials
    .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF\u00C0-\u00FF\u0100-\u017F\u2000-\u206F\u2070-\u209F\u20A0-\u20CF\u2100-\u214F\u2150-\u218F\u2190-\u21FF\u2200-\u22FF\u2300-\u23FF\u2500-\u257F\u2580-\u259F\u25A0-\u25FF\u2600-\u26FF\u2700-\u27BF\u27C0-\u27EF\u2980-\u29FF\u2A00-\u2AFF\u2B00-\u2BFF\u3000-\u303F\uFE00-\uFE0F\uFE10-\uFE1F\uFE30-\uFE4F\uFE50-\uFE6F\uFF00-\uFFEF]/g, ' ') // reemplazar no-latino con espacio en vez de vaciar
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 3 ? s : 'texto';
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
   Reglas implementadas:
   - Hiato: vocal acentuada rompe diptongo (día→2, reír→2, país→2)
   - Cerrada + fuerte acentuada = hiato (camión→3, murciélago→4)
   - Dos fuertes = hiato (idea: e+a)
   - Dos cerradas = hiato (continuo: i+u)
   - Diptongo: cerrada no acentuada + fuerte no acentuada (tierra→2, aire→2)
   - Triptongo: cerrada+fuerte+cerrada sin acento (guau→1, buey→1)
   Limitaciones conocidas:
   - Secuencias de 4+ vocales pueden fallar cuando los límites de sílaba
     dependen de la morfología (murciélago, computadora, continuo, actitud).
   - Para la fórmula de Fernández-Huerta, el error de ±1 sílaba tiene
     impacto menor (<2 puntos FH en textos largos).
   ============================================================ */
export function syllables(w) {
  w = (w || '').toLowerCase();
  const nfd = w.normalize('NFD');
  const closedSet = new Set('iuü');
  const allVowels = new Set('aeiouáéíóúü');

  // Extraer secuencia de vocales con info de acento (NFD: tilde = U+0301)
  const vowelSeq = [];
  for (let idx = 0; idx < nfd.length; idx++) {
    const ch = nfd[idx];
    if (ch === '\u0301') {
      if (vowelSeq.length > 0) vowelSeq[vowelSeq.length - 1].stressed = true;
    } else if (allVowels.has(ch)) {
      vowelSeq.push({ ch, stressed: false });
    }
  }

  if (vowelSeq.length === 0) return 1;

  const isClosed = (v) => closedSet.has(v.ch);

  // ¿2 vocales forman diptongo?
  // Regla española:
  // - Cerrada no acentuada + fuerte = diptongo (ia, ua, au, ai...)
  // - Cerrada acentuada = hiato (día, reír, virtud)
  // - Dos fuertes = hiato (ae, ea, oe...)
  // - Fuerte acentuada siguiente = hiato (camión: i+ó → hiato)
  //     porque el acento de la fuerte "tira" de la cerrada a su sílaba.
  // ¿2 vocales forman diptongo?
  // Regla española:
  // - Cerrada no acentuada + fuerte no acentuada = diptongo (ia, ua, au, ai, ie, ue...)
  // - Cerrada acentuada = hiato (día, reír, virtud)
  // - Dos fuertes = hiato (ae, ea, oe, eo...)
  // - Fuerte acentuada = hiato con cerrada (camión: i+ó, murciélago: i+é)
  // - Dos cerradas = hiato (continuo: i+u, actitud: i+u)
  const isDiphthong = (a, b) => {
    const aC = isClosed(a), bC = isClosed(b);
    // Dos fuertes = hiato (idea: e+a, electricidad: e+i)
    if (!aC && !bC) return false;
    // Dos cerradas = hiato (continuo: i+u, actitud: i+u)
    if (aC && bC) return false;
    // Cerrada acentuada = hiato (día: í+a, reír: e+í)
    if (aC && a.stressed) return false;
    if (bC && b.stressed) return false;
    // Cerrada + fuerte acentuada = hiato (murciélago: i+é, camión: i+ó)
    // La fuerte acentuada "tira" de la cerrada a su sílaba.
    // NOTA: fuerte acentuada + cerrada SÍ es diptongo (tierra: ie, limpiáis: ái).
    if (aC && !bC && b.stressed) return false;
    return true;
  };

  let n = 0;
  let i = 0;

  while (i < vowelSeq.length) {
    n++;
    const remaining = vowelSeq.length - i;

    // Triptongo: solo con exactamente 3 vocales restantes.
    // Patrón: cerrada + fuerte + cerrada, ninguna acentuada.
    // Con 4+ vocales, el triptongo es ambiguo (ej: iuo → i + uo).
    if (remaining === 3) {
      const a = vowelSeq[i], b = vowelSeq[i + 1], c = vowelSeq[i + 2];
      if (isClosed(a) && !a.stressed && !isClosed(b) && !b.stressed && isClosed(c) && !c.stressed) {
        i += 3;
        continue;
      }
    }

    // Diptongo: 2 vocales.
    if (remaining >= 2 && isDiphthong(vowelSeq[i], vowelSeq[i + 1])) {
      // Lookahead: si hay una 3ᵃ vocal fuerte acentuada después del par,
      // el acento "tira" de la cerrada a su sílaba → hiato, no diptongo.
      // Ej: camión (a+i+ó): "ai" no es diptongo porque "ó" roba la "i".
      // No aplica si la 3ᵃ es cerrada (ruido: a+i+u → "ai" sí es diptongo).
      if (remaining >= 3) {
        const after = vowelSeq[i + 2];
        if (!isClosed(after) && after.stressed) {
          // Hiato: no formar diptongo, dejar que la cerrada se resuelva sola
          i++;
          continue;
        }
      }
      i += 2;
      continue;
    }

    i++;
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
  if (ws.length < 3) return 0; // datos insuficientes para lecturabilidad
  const syllableRatio = ws.reduce((n, w) => n + syllables(w), 0) / ws.length;
  const wordsPerSentence = ws.length / ss;
  return Math.max(0, Math.min(100, 206.84 - 60 * syllableRatio - 1.02 * wordsPerSentence));
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
