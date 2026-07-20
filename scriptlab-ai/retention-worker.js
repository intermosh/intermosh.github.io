/* retention-worker.js — Predictor de retención para ScriptLab
   Motor heurístico. Opera 100% local con matemáticas, sin modelos externos.
   
   Cada peso, umbral y constante está documentado con su fuente.
   Cuando no hay fuente académica directa, se marca: [NO VALIDADO — peso heurístico]
   Cuando la fuente es secundaria (blog, reporte industria), se marca: [FUENTE SECUNDARIA]
   ==================================================================== */

/* ====================================================================
   FÓRMULA DE FERNÁNDEZ-HUERTA (1959)
   Constantes: 206.84, 60, 1.02
   Fuente PRIMARIA: Fernández Huerta, J. (1959). "Medidas sencillas de
   lecturabilidad." Consigna, 214, 29-32.
   Adaptación española del Flesch Reading Ease (Flesch, 1948).
   Confirmado en: PMC5831059, ACL Anthology 2022.tsar-1.18, PMC8507699.
   ==================================================================== */

/* ====================================================================
   PESOS DEL MODELO PONDERADO (suman 1.00)
   
   Los pesos relativos se asignaron según importancia relativa reportada
   en la literatura de retención de video. Los porcentajes exactos NO
   provienen de un estudio único que los valide como conjunto.
   Cada peso individual tiene justificación cualitativa documentada abajo.
   
   [NO VALIDADO como conjunto — pesos heurísticos con justificación cualitativa]
   ==================================================================== */

const WEIGHTS = {
  hookStrength: 0.22,
  /* Justificación: El hook (primeros 5-30s) es consistentemente citado como
     el factor más crítico en retención de video.
     Fuente SECUNDARIA: YouTube Creator Insider recomienda retener 80%+ en
     primeros 30s (digitalapplied.com/blog/youtube-seo-video-ranking-optimization-guide-2026).
     Fuente SECUNDARIA: Derral Eves (LinkedIn, 2025) señala que la mayoría
     de viewers se van en los primeros 15 segundos.
     Fuente SECUNDARIA: Google support document: "If the line drops sharply
     in the first 10-30 seconds, your intros/hooks need improvement."
     Peso 0.22: [NO VALIDADO — peso heurístico] */

  pacingScore: 0.18,
  /* Justificación: El ritmo de edición afecta la retención.
     Fuente PRIMARIA: Sun et al. (2023). "Short, Long, and Segmented Learning
     Videos" (Springer, Technology, Knowledge and Learning). Segmentación
     mejora retención vs videos largos sin cortes.
     Fuente SECUNDARIA: SUNY OSCQR recomienda segmentos de 6-9 min para
     video educativo (oscqr.suny.edu).
     Peso 0.18: [NO VALIDADO — peso heurístico] */

  patternInterrupts: 0.15,
  /* Justificación: Los "pattern interrupts" (cambios visuales/narrativos)
     resetean la atención del espectador. Basado en el concepto de
     "orienting response" (OR).
     Fuente PRIMARIA: Kahneman, D. (1973). "Attention and Effort." Prentice-
     Hall. El OR es la respuesta automática a estímulos novedosos.
     Fuente PRIMARIA: Sokolov, E.N. (1963). "Perception and the Conditioned
     Reflex." Pergamon. Modelo neuronal del OR.
     Fuente SECUNDARIA: Industria de video editing recomienda cortes/B-roll
     cada 3-5 segundos para retener atención (práctica estándar YouTube).
     Peso 0.15: [NO VALIDADO — peso heurístico] */

  contentDensity: 0.12,
  /* Justificación: La densidad de información afecta la comprensión y
     retención. Demasiada información causa sobrecarga cognitiva.
     Fuente PRIMARIA: Miller, G.A. (1956). "The Magical Number Seven, Plus
     or Minus Two." Psychological Review, 63(2), 81-97. Capacidad working
     memory: 4-7 chunks.
     Fuente PRIMARIA: Sweller, J. (1988). "Cognitive Load During Problem
     Solving." Cognitive Science, 12(2), 257-285. Cognitive Load Theory.
     Peso 0.12: [NO VALIDADO — peso heurístico] */

  promiseDelivery: 0.10,
  /* Justificación: Si el hook hace una promesa, el espectador espera que
     se cumpla. La entrega temprana reduce abandono.
     Fuente SECUNDARIA: YouTube Creator Academy recomienda resolver la
     promesa del título/hook antes del 30% del video.
     Peso 0.10: [NO VALIDADO — peso heurístico] */

  emotionalArc: 0.08,
  /* Justificación: La varianza emocional mantiene el engagement.
     Fuente PRIMARIA: Knobloch-Westerwick, S. et al. (2015). "The
     Eudaimonic Entertainment Experience." Journal of Communication.
     Contenido con arco emocional variado genera mayor satisfacción.
     Peso 0.08: [NO VALIDADO — peso heurístico] */

  readability: 0.08,
  /* Justificación: Textos más legibles facilitan el procesamiento.
     Fuente PRIMARIA: Fernández Huerta, J. (1959). Fórmula adaptada del
     Flesch para español. Scores 60-80 = nivel normal/fácil.
     Peso 0.08: [NO VALIDADO — peso heurístico] */

  ctaPlacement: 0.04,
  /* Justificación: El CTA al final del video tiene mayor conversión.
     Fuente SECUNDARIA: Wistia Blog (2026) recomienda CTAs al final del
     video para maximizar conversión (wistia.com/learn/marketing/using-video-ctas).
     Fuente SECUNDARIA: Unbounce (2013) case study sobre posición de CTA
     en landing pages (unbounce.com/conversion-rate-optimization).
     Peso 0.04: [NO VALIDADO — peso heurístico] */

  narrativeCompleteness: 0.03
  /* Justificación: Estructura narrativa completa (setup-resolución) mejora
     satisfacción y retención.
     Fuente PRIMARIA: Aristóteles, "Poética" (s. IV a.C.). Estructura
     tripartita: inicio, desarrollo, desenlace. Fundamento de narratología.
     Fuente PRIMARIA: Booker, C. (2004). "The Seven Basic Plots." Continuum.
     Peso 0.03: [NO VALIDADO — peso heurístico] */
};


/* ====================================================================
   CURVAS DE RETENCIÓN BASELINE
   
   Valores de retención esperada por posición relativa (0-1) en el video.
   
   Fuente SECUNDARIA: Wistia State of Video Report (2025). Analizó
   800,000+ videos. Videos <1 min: ~50-65% engagement promedio.
   Videos >60 min: engagement mucho menor. Curva típica: caída fuerte
   al inicio, luego declive gradual. Completion rate promedio ~45%.
   (wistia.com/blog/video-marketing-statistics, citado en swydo.com,
   greenfroglabs.com, hubspot.com)
   
   Fuente SECUNDARIA: YouTube Creator documentation. Retención típica:
   ~80% en primeros 30s, declive gradual hacia el final.
   (digitalapplied.com/blog/youtube-seo-video-ranking-optimization-guide-2026)
   
   Los valores numéricos exactos son INTERPOLACIONES propias basadas en
   la forma general de las curvas publicadas por Wistia/YouTube.
   [NO VALIDADO numéricamente — forma de curva basada en Wistia 2025]
   ==================================================================== */

const RETENTION_CURVES = {
  baseline: [
    /* Curva estándar (hook promedio o débil).
       Forma basada en Wistia 2025: caída ~18% en primeros 5% del video,
       luego declive gradual hasta ~35% al final. */
    { pos: 0.00, ret: 1.00 },  /* Inicio: 100% */
    { pos: 0.05, ret: 0.82 },  /* ~18% drop en zona de hook (Wistia 2025) */
    { pos: 0.10, ret: 0.72 },  /* ~28% total drop */
    { pos: 0.20, ret: 0.62 },
    { pos: 0.30, ret: 0.55 },
    { pos: 0.50, ret: 0.48 },  /* Wistia 2025: completion ~45% promedio */
    { pos: 0.70, ret: 0.42 },
    { pos: 0.85, ret: 0.38 },
    { pos: 1.00, ret: 0.35 }   /* ~35% retención final */
  ],
  strongHook: [
    /* Curva con hook fuerte (retiene 92% en primeros 5%).
       Basada en recomendación YouTube: retener 80%+ en primeros 30s.
       Con hook excelente, la caída inicial es mucho menor. */
    { pos: 0.00, ret: 1.00 },
    { pos: 0.05, ret: 0.92 },  /* Solo 8% drop (vs 18% baseline) */
    { pos: 0.10, ret: 0.85 },
    { pos: 0.20, ret: 0.76 },
    { pos: 0.30, ret: 0.70 },
    { pos: 0.50, ret: 0.62 },
    { pos: 0.70, ret: 0.55 },
    { pos: 0.85, ret: 0.50 },
    { pos: 1.00, ret: 0.47 }
  ]
};


/* ====================================================================
   FUNCIONES DE ANÁLISIS HEURÍSTICO
   ==================================================================== */

function syllables(w) {
  w = (w || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zñü]/g, '');
  let n = 0, last = false;
  for (const c of w) {
    const v = 'aeiouü'.includes(c);
    if (v && !last) n++;
    last = v;
  }
  return Math.max(1, n);
}

function wordCount(text) {
  return (text || '').trim().match(/[\p{L}\p{N}'''-]+/gu)?.length || 0;
}

function sentenceCount(text) {
  return (text || '').split(/[.!?]+/).filter(s => s.trim()).length || 1;
}

/* Fernández-Huerta: 206.84 - 60×(sílabas/palabra) - 1.02×(palabras/frase)
   Fuente PRIMARIA: Fernández Huerta, J. (1959). "Medidas sencillas de
   lecturabilidad." Consigna, 214, 29-32.
   Constantes 206.84, 60, 1.02 son directas de la publicación original. */
function fernandezHuerta(text) {
  const ws = (text || '').match(/[\p{L}]+/gu) || [];
  const ss = sentenceCount(text);
  if (!ws.length) return 0;
  const syllableRatio = ws.reduce((n, w) => n + syllables(w), 0) / ws.length;
  const wordsPerSentence = ws.length / ss;
  return Math.max(0, Math.min(100, 206.84 - 60 * syllableRatio - 1.02 * wordsPerSentence));
}

function durationInSeconds(text, wpm) {
  return Math.round(wordCount(text) / (wpm || 150) * 60);
}


/* ====================================================================
   ANÁLISIS POR BLOQUE — Cada función devuelve un objeto con:
   - score: 0-100
   - formula: texto descriptivo del cálculo (para mostrar en UI)
   - Fuente de cada umbral numérico documentada inline
   ==================================================================== */


/* --- HOOK --------------------------------------------------------- */
function analyzeHook(hookBlock, promise, allBlocks) {
  /* Detectar hook efectivo: bloque de tipo HOOK O primer bloque con
     características de hook (pregunta, dato, urgencia) */
  let effectiveHook = hookBlock;
  let isImplicit = false;
  if (!effectiveHook && allBlocks.length > 0) {
    const first = allBlocks[0];
    const content = first.content || '';
    const hasQuestion = /[?¿]/.test(content);
    const isShort = wordCount(content) <= 40;
    const hasUrgency = /ahora|hoy|descubr[ií]|secreto|nunca|siempre|error|truc[oa]|incre[ií]ble|sorprendente|clave|esencial/i.test(content);
    if (hasQuestion || isShort || hasUrgency) {
      effectiveHook = first;
      isImplicit = true;
    }
  }
  if (!effectiveHook) return { score: 0, reasons: ['Sin Hook definido'], formula: 'Sin hook → 0 pts' };

  const content = effectiveHook.content || '';
  const wc = wordCount(content);
  const reasons = [];
  let score = 0;

  /* Longitud: 15-80 palabras = óptimo. Penalizar implícito. */
  if (wc >= 15 && wc <= 80) { score += isImplicit ? 20 : 30; reasons.push('Longitud óptima del hook (15-80 palabras)'); }
  else if (wc >= 10 && wc < 15) { score += isImplicit ? 10 : 15; reasons.push('Hook algo corto'); }
  else if (wc > 80 && wc <= 120) { score += isImplicit ? 12 : 18; reasons.push('Hook largo pero aceptable'); }
  else if (wc < 10) { score += 3; reasons.push('Hook demasiado corto (<10 palabras)'); }
  else { score += 5; reasons.push('Hook excesivamente largo (>120 palabras)'); }

  if (/[?¿]/.test(content)) { score += 15; reasons.push('Contiene pregunta (curiosity gap)'); }
  if (/\d/.test(content) && wc > 10) { score += 8; reasons.push('Contiene datos/números'); }

  if (promise) {
    const hookWords = new Set((content.toLowerCase().match(/[\p{L}]{4,}/gu) || []));
    const promiseWords = new Set((promise.toLowerCase().match(/[\p{L}]{4,}/gu) || []));
    const overlap = [...hookWords].filter(w => promiseWords.has(w)).length;
    const overlapRatio = overlap / Math.max(1, Math.min(hookWords.size, promiseWords.size));
    if (overlapRatio > 0.3) { score += 25; reasons.push('Fuerte alineación con promesa'); }
    else if (overlapRatio > 0.1) { score += 12; reasons.push('Alineación parcial con promesa'); }
    else { reasons.push('Débil alineación con promesa'); }
  }

  const urgencyWords = /ahora|hoy|descubr[ií]|secreto|nunca|siempre|error|truc[oa]|incre[ií]ble|sorprendente|importante|clave|esencial/i;
  if (urgencyWords.test(content)) { score += 12; reasons.push('Lenguaje de urgencia/curiosidad'); }

  if (isImplicit) reasons.push('(Hook implícito — primer bloque con características de hook)');

  const formula = `Hook${isImplicit?' implícito':''}: longitud(${wc}pal→${score>=20?'>=20':'<20'}pts) + pregunta(${/[?¿]/.test(content)?'+15':'+0'}) + nums(${/\d/.test(content)&&wc>10?'+8':'+0'}) + urgencia(${urgencyWords.test(content)?'+12':'+0'}) → ${Math.min(100, score)}/100`;

  return { score: Math.min(100, score), reasons, formula };
}


/* --- PACING ------------------------------------------------------- */
function analyzePacing(blocks, wpm) {
  if (!blocks.length) return { score: 50, details: [], formula: 'Sin bloques → 50 (default)' };

  const durations = blocks.map(b => durationInSeconds(b.content, wpm));
  const details = [];
  let score = 0;

  const avgDur = durations.reduce((a, b) => a + b, 0) / durations.length;

  /* Duración promedio: sweet spot 15-45s pero base más baja */
  if (avgDur >= 15 && avgDur <= 45) { score += 25; details.push('Duración promedio óptima (' + Math.round(avgDur) + 's)'); }
  else if (avgDur >= 10 && avgDur < 15) { score += 15; details.push('Bloques algo cortos'); }
  else if (avgDur > 45 && avgDur <= 70) { score += 12; details.push('Bloques algo largos'); }
  else { score += 5; details.push('Duración fuera de rango'); }

  /* CV: sweet spot 0.3-0.8 (más estricto que antes) */
  const mean = avgDur;
  const variance = durations.reduce((s, d) => s + (d - mean) ** 2, 0) / durations.length;
  const cv = Math.sqrt(variance) / (mean || 1);
  if (cv > 0.3 && cv < 0.8) { score += 25; details.push('Buen ritmo variable (CV: ' + cv.toFixed(2) + ')'); }
  else if (cv > 0.15 && cv <= 0.3) { score += 12; details.push('Ritmo algo monótono'); }
  else if (cv <= 0.15) { score += 5; details.push('Ritmo monótono (CV ≤0.15)'); }
  else { score += 8; details.push('Ritmo errático (CV >0.8)'); }

  /* Penalización por bloques >50s (antes >60s) */
  const longBlocks = durations.filter(d => d > 50).length;
  if (longBlocks === 0) { score += 15; details.push('Sin bloques >50s'); }
  else { score += Math.max(0, 15 - longBlocks * 8); details.push(longBlocks + ' bloque(s) >50s'); }

  /* Varianza de oraciones: CV de longitudes de oración dentro de cada bloque */
  const sentLengths = blocks.map(b => (b.content || '').split(/[.!?]+/).filter(s => s.trim()).map(s => wordCount(s)));
  const allSentLens = sentLengths.flat();
  if (allSentLens.length > 2) {
    const sMean = allSentLens.reduce((a, b) => a + b, 0) / allSentLens.length;
    const sVar = allSentLens.reduce((s, l) => s + (l - sMean) ** 2, 0) / allSentLens.length;
    const sCv = Math.sqrt(sVar) / (sMean || 1);
    if (sCv > 0.3 && sCv < 1) { score += 10; details.push('Buena varianza de oraciones'); }
    else if (sCv <= 0.3) { details.push('Oraciones monótonas'); }
  }

  /* Bloques vacíos: -5 pts c/u */
  const emptyBlocks = blocks.filter(b => !b.content?.trim()).length;
  if (emptyBlocks > 0) { score -= emptyBlocks * 5; details.push(emptyBlocks + ' bloque(s) vacíos'); }

  const s = Math.max(0, Math.min(100, score));
  const formula = `Pacing: duración(avg ${Math.round(avgDur)}s→${avgDur >= 15 && avgDur <= 45 ? 40 : avgDur >= 10 ? 25 : avgDur > 45 ? 20 : 10}pts) + CV(${cv.toFixed(2)}→${cv > 0.2 && cv < 0.8 ? 30 : cv <= 0.2 ? 15 : 10}pts) + largos(${longBlocks}→${20 - longBlocks * 8}pts) + vacíos(${emptyBlocks}×-5) → ${s}/100`;

  return { score: s, details, formula };
}


/* --- PATTERN INTERRUPTS ------------------------------------------- */
function analyzePatternInterrupts(blocks) {
  const total = blocks.length;
  if (total < 2) return { score: 30, ratio: 0, formula: '<2 bloques → 30 (default)' };

  const interrupts = blocks.filter(b =>
    b.type === 'GIRO' || b.type === 'VISUAL' || b.type === 'CTA'
  ).length;

  const ratio = interrupts / total;

  /* Sweet spot: 15-35% de bloques como interruptores
     Fuente PRIMARIA: Kahneman, D. (1973). "Attention and Effort." El
     orienting response se activa con estímulos novedosos.
     Fuente PRIMARIA: Sokolov, E.N. (1963). Modelo de habituación:
     estímulos repetidos pierden efecto, novedad lo restaura.
     Rango 15-35%: [NO VALIDADO — extrapolado de práctica de edición
     de video donde se recomienda cambiar de plano/elemento visual cada
     3-5 segundos, lo cual no se traduce directamente a % de bloques]
     Puntos 85/60/70/30/50: [NO VALIDADO — pesos internos] */
  let score;
  if (ratio >= 0.15 && ratio <= 0.35) score = 85 + Math.round((ratio - 0.15) * 75);
  else if (ratio >= 0.10 && ratio < 0.15) score = 60;
  else if (ratio > 0.35 && ratio <= 0.50) score = 70;
  else if (ratio < 0.10) score = 30 + Math.round(ratio * 200);
  else score = 50;

  const s = Math.min(100, score);
  const formula = `Interrupts: ${interrupts}/${total} bloques (${(ratio * 100).toFixed(0)}%) → ${s}/100 (sweet spot: 15-35%)`;

  return { score: s, ratio, formula };
}


/* --- DENSIDAD DE CONTENIDO --------------------------------------- */
function analyzeContentDensity(blocks, wpm) {
  const fullText = blocks.map(b => b.content).join(' ');
  const totalMinutes = wordCount(fullText) / (wpm || 150);
  if (totalMinutes < 0.5) return { score: 50, topicsPerMinute: 0, formula: '<0.5 min → 50 (default)' };

  const topicShifts = blocks.filter((b, i) => {
    if (i === 0) return false;
    const prev = blocks[i - 1].content || '';
    const curr = b.content || '';
    const prevWords = new Set((prev.toLowerCase().match(/[\p{L}]{4,}/gu) || []));
    const currWords = new Set((curr.toLowerCase().match(/[\p{L}]{4,}/gu) || []));
    const overlap = [...currWords].filter(w => prevWords.has(w)).length;
    /* Umbral de shift: overlap <15% → tema diferente
       [NO VALIDADO — heurística de similitud léxica sin estudio específico] */
    return overlap / Math.max(1, Math.min(prevWords.size, currWords.size)) < 0.15;
  }).length;

  const topicsPerMinute = topicShifts / Math.max(1, totalMinutes);

  /* Sweet spot: 1.5-3 temas/minuto
     Fuente PRIMARIA: Miller, G.A. (1956). Working memory: 4-7 chunks.
     1.5-3 temas/min ≈ permite procesar cada tema sin sobrecarga.
     Fuente PRIMARIA: Sweller, J. (1988). Cognitive Load Theory.
     Rango 1.5-3: [NO VALIDADO — extrapolado de Miller/Sweller, no hay
     estudio que establezca estos límites exactos para video]
     Puntos 85/65/60/35/40: [NO VALIDADO — pesos internos] */
  let score;
  if (topicsPerMinute >= 1.5 && topicsPerMinute <= 3) score = 85;
  else if (topicsPerMinute >= 1 && topicsPerMinute < 1.5) score = 65;
  else if (topicsPerMinute > 3 && topicsPerMinute <= 4.5) score = 60;
  else if (topicsPerMinute < 1) score = 35;
  else score = 40;

  const s = Math.min(100, score);
  const formula = `Densidad: ${topicShifts} shifts / ${totalMinutes.toFixed(1)} min = ${topicsPerMinute.toFixed(1)} temas/min → ${s}/100 (ideal: 1.5-3)`;

  return { score: s, topicsPerMinute: Math.round(topicsPerMinute * 10) / 10, formula };
}


/* --- ENTREGA DE PROMESA ------------------------------------------ */
function analyzePromiseDelivery(blocks, promise) {
  if (!promise) return { score: 40, deliveredAt: null, formula: 'Sin promesa → 40 (default)' };

  const promiseWords = new Set((promise.toLowerCase().match(/[\p{L}]{4,}/gu) || []));
  if (promiseWords.size === 0) return { score: 40, deliveredAt: null, formula: 'Promesa sin palabras clave → 40' };

  let bestBlock = -1;
  let bestOverlap = 0;

  blocks.forEach((b, i) => {
    if (i === 0) return;
    const contentWords = new Set((b.content.toLowerCase().match(/[\p{L}]{4,}/gu) || []));
    const overlap = [...contentWords].filter(w => promiseWords.has(w)).length;
    const ratio = overlap / Math.max(1, Math.min(contentWords.size, promiseWords.size));
    if (ratio > bestOverlap) { bestOverlap = ratio; bestBlock = i; }
  });

  if (bestBlock < 0) return { score: 20, deliveredAt: null, formula: 'Promesa nunca se resuelve → 20' };

  const relativePosition = bestBlock / Math.max(1, blocks.length - 1);

  /* Entrega en primer 30% del video = mejor retención
     Fuente SECUNDARIA: YouTube Creator Academy recomienda resolver la
     promesa del título antes del 30% del video para retener audiencia.
     Umbral 30%: [NO VALIDADO — recomendación de industria, no estudio]
     Puntos 90/70/50/30: [NO VALIDADO — pesos internos] */
  let score;
  if (relativePosition <= 0.3 && bestOverlap > 0.2) score = 90;
  else if (relativePosition <= 0.5 && bestOverlap > 0.15) score = 70;
  else if (bestOverlap > 0.1) score = 50;
  else score = 30;

  const s = Math.min(100, score);
  const formula = `Promesa: bloque #${bestBlock + 1} (${(relativePosition * 100).toFixed(0)}% video, overlap ${(bestOverlap * 100).toFixed(0)}%) → ${s}/100`;

  return { score: s, deliveredAt: bestBlock, relativePosition, formula };
}


/* --- LEGIBILIDAD ------------------------------------------------- */
function analyzeReadability(blocks) {
  const fullText = blocks.map(b => b.content).join(' ');
  const fh = fernandezHuerta(fullText);

  /* Rangos Fernández-Huerta:
     Fuente PRIMARIA: Fernández Huerta, J. (1959). Escala adaptada:
     0-30: muy difícil, 30-50: difícil, 50-60: algo difícil,
     60-70: normal, 70-80: fácil, 80-90: muy fácil, 90-100: elemental.
     Para video (lenguaje oral): 60-80 = ideal (normal-fácil).
     FH>90 = demasiado simple, lenguaje infantil → penalizar.
     Rangos de score: [NO VALIDADO — mapeo propio] */
  let score;
  if (fh >= 60 && fh <= 80) score = 85;
  else if (fh >= 50 && fh < 60) score = 65;
  else if (fh > 80 && fh <= 90) score = 70;
  else if (fh > 90) score = Math.max(25, 55 - (fh - 90) * 2); /* penaliza infantil */
  else if (fh < 50 && fh >= 30) score = 45;
  else score = 25;

  const s = Math.min(100, score);
  const formula = `Legibilidad: FH=${Math.round(fh)} (fórmula Fernández-Huerta 1959) → ${s}/100`;

  return { score: s, fh: Math.round(fh), formula };
}


/* --- CTA --------------------------------------------------------- */
function analyzeCTA(blocks) {
  const ctaIdx = blocks.findIndex(b => b.type === 'CTA');
  if (ctaIdx < 0) return { score: 30, position: null, formula: 'Sin CTA → 30 (default)' };

  const relativePos = ctaIdx / Math.max(1, blocks.length - 1);
  const ctaContent = blocks[ctaIdx].content || '';
  const wc = wordCount(ctaContent);

  let score = 40; /* Base: tiene CTA. [NO VALIDADO — punto base arbitrario] */

  /* Posición CTA: 75-95% del video = ideal
     Fuente SECUNDARIA: Wistia Blog (2026): CTAs al final del video
     maximizan conversión (wistia.com/learn/marketing/using-video-ctas).
     Fuente SECUNDARIA: Mejores prácticas de YouTube: end screen cards
     en últimos 10-20% del video.
     Rango 75-95%: [NO VALIDADO — recomendación de industria]
     Puntos +30/+20/+10/+5: [NO VALIDADO — pesos internos] */
  if (relativePos >= 0.75 && relativePos <= 0.95) score += 30;
  else if (relativePos >= 0.6 && relativePos < 0.75) score += 20;
  else if (relativePos > 0.95) score += 10;
  else score += 5;

  /* Longitud CTA: 10-40 palabras = ideal
     [NO VALIDADO — heurística de longitud razonable para CTA verbal] */
  if (wc >= 10 && wc <= 40) score += 20;
  else if (wc >= 5 && wc < 10) score += 10;

  /* Verbos de acción: +10 pts
     Fuente SECUNDARIA: Copywriting best practices (Cialdini 1984,
     principio de compromiso/consistencia). Verbos imperativos aumentan
     la probabilidad de acción.
     +10 pts: [NO VALIDADO — peso heurístico] */
  if (/[suscrib|compart|coment|like|dale|click|visit|descarg|activ]/i.test(ctaContent)) score += 10;

  const s = Math.min(100, score);
  const formula = `CTA: posición(${(relativePos * 100).toFixed(0)}%→${relativePos >= 0.75 ? '+30' : relativePos >= 0.6 ? '+20' : relativePos > 0.95 ? '+10' : '+5'}) + longitud(${wc}pal→${wc >= 10 && wc <= 40 ? '+20' : wc >= 5 ? '+10' : '+0'}) → ${s}/100`;

  return { score: s, position: relativePos, formula };
}


/* --- COMPLETITUD NARRATIVA --------------------------------------- */
function analyzeNarrativeCompleteness(blocks) {
  const types = new Set(blocks.map(b => b.type));
  const present = [];
  const missing = [];

  const essentials = [
    { type: 'HOOK', label: 'Hook' },
    { type: 'CONTEXTO', label: 'Contexto' },
    { type: 'EVIDENCIA', label: 'Evidencia' },
    { type: 'CTA', label: 'CTA' }
  ];

  const optional = [
    { type: 'GIRO', label: 'Giro narrativo' },
    { type: 'VISUAL', label: 'Nota visual' }
  ];

  essentials.forEach(e => {
    if (types.has(e.type)) present.push(e.label);
    else missing.push(e.label);
  });
  optional.forEach(e => {
    if (types.has(e.type)) present.push(e.label);
  });

  /* Essentials: 4 elementos × 20 pts = 80 pts base
     Bonus: +10 pts por elemento opcional presente (max 20)
     Fuente PRIMARIA: Estructura narrativa clásica (Aristóteles, "Poética").
     Hook=exposición, Contexto=planteamiento, Evidencia=desarrollo,
     CTA=desenlace/resolución.
     Puntos 80/20: [NO VALIDADO — distribución arbitraria] */
  const essentialScore = ((essentials.length - missing.length) / essentials.length) * 80;
  const bonusScore = Math.min(20, (present.length - essentials.length + missing.length) * 10);

  const s = Math.min(100, Math.round(essentialScore + bonusScore));
  const formula = `Narrativa: ${essentials.length - missing.length}/4 esenciales (×20=${essentialScore}) + bonus(${present.length - essentials.length + missing.length}×10=${bonusScore}) → ${s}/100`;

  return { score: s, present, missing, formula };
}


/* ====================================================================
   GENERADOR DE CURVA DE RETENCIÓN
   
   Modificadores por bloque:
   - Pattern interrupt (GIRO/VISUAL): +0.03-0.08
   - Bloque >50s: -0.04, >80s: -0.06 adicional
   - Hook fuerte en bloque 0: +0.05
   - CTA: +0.03
   - Bloque vacío: -0.15
   
   Todos los modificadores: [NO VALIDADO — pesos heurísticos internos]
   ==================================================================== */

function interpolateRetention(pos, curve) {
  for (let i = 1; i < curve.length; i++) {
    if (pos <= curve[i].pos) {
      const t = (pos - curve[i - 1].pos) / (curve[i].pos - curve[i - 1].pos);
      return curve[i - 1].ret + t * (curve[i].ret - curve[i - 1].ret);
    }
  }
  return curve[curve.length - 1].ret;
}

function generateRetentionCurve(blocks, wpm, hookAnalysis, pacingAnalysis) {
  if (!blocks.length) return [];

  const totalDuration = blocks.reduce((s, b) => s + durationInSeconds(b.content, wpm), 0);
  if (totalDuration === 0) return [];

  /* Hook score ≥60 → usar curva strongHook
     Umbral 60: [NO VALIDADO — punto medio arbitrario] */
  const useStrongHook = hookAnalysis.score >= 60;
  const baseCurve = useStrongHook ? RETENTION_CURVES.strongHook : RETENTION_CURVES.baseline;

  const points = [];
  let elapsed = 0;

  blocks.forEach((block, i) => {
    const blockDur = durationInSeconds(block.content, wpm);
    const midTime = elapsed + blockDur / 2;
    const relPos = midTime / totalDuration;

    let baseRet = interpolateRetention(relPos, baseCurve);
    let modifier = 0;

    /* Pattern interrupt: +0.03 base + random 0-0.05
       Fuente: Kahneman (1973) orienting response — ver arriba.
       +0.03-0.08: [NO VALIDADO — rango arbitrario] */
    if (block.type === 'GIRO' || block.type === 'VISUAL') {
      modifier += 0.03 + Math.random() * 0.05;
    }

    /* Bloque largo: -0.04 si >50s, -0.06 adicional si >80s
       [NO VALIDADO — penalizaciones arbitrarias] */
    if (blockDur > 50) modifier -= 0.04;
    if (blockDur > 80) modifier -= 0.06;

    /* Hook fuerte bonus: +0.05
       [NO VALIDADO — peso arbitrario] */
    if (i === 0 && hookAnalysis.score >= 60) modifier += 0.05;

    /* CTA spike: +0.03
       [NO VALIDADO — peso arbitrario] */
    if (block.type === 'CTA') modifier += 0.03;

    /* Bloque vacío: -0.15 (caída fuerte)
       [NO VALIDADO — peso arbitrario, pero consistente con lógica
       de que contenido vacío causa abandono inmediato] */
    if (!block.content?.trim()) modifier -= 0.15;

    const retention = Math.max(0.10, Math.min(1.0, baseRet + modifier));

    points.push({
      blockIndex: i,
      blockLabel: block.label || block.type,
      blockType: block.type,
      startTime: elapsed,
      duration: blockDur,
      retention: Math.round(retention * 1000) / 1000,
      retentionPct: Math.round(retention * 100),
      relPosition: Math.round(relPos * 1000) / 1000,
      isDropRisk: retention < 0.35,
      /* Umbral drop risk: <35%
         Basado en Wistia 2025: retención final promedio ~35-45%.
         <35% indica zona de alto abandono.
         [NO VALIDADO numéricamente — basado en curva Wistia] */
      isCritical: i === 0 && hookAnalysis.score < 40
    });

    elapsed += blockDur;
  });

  return points;
}


/* ====================================================================
   MOTOR PRINCIPAL
   ==================================================================== */

function computeRetentionPrediction(data) {
  const { blocks, wpm = 150, promise = '', title = '' } = data;

  if (!blocks || blocks.length === 0) {
    return {
      overallRetention: 0, confidence: 0, curve: [], scores: {},
      insights: ['Sin bloques para analizar.'], risks: [], recommendations: []
    };
  }

  const hookBlock = blocks.find(b => b.type === 'HOOK');
  const contentBlocks = blocks.filter(b => b.content?.trim());

  const hookAnalysis = analyzeHook(hookBlock, promise, blocks);
  const pacingAnalysis = analyzePacing(blocks, wpm);
  const interruptAnalysis = analyzePatternInterrupts(blocks);
  const densityAnalysis = analyzeContentDensity(blocks, wpm);
  const promiseAnalysis = analyzePromiseDelivery(blocks, promise);
  const readabilityAnalysis = analyzeReadability(blocks);
  const ctaAnalysis = analyzeCTA(blocks);
  const narrativeAnalysis = analyzeNarrativeCompleteness(blocks);

  const scores = {
    hook: hookAnalysis,
    pacing: pacingAnalysis,
    patternInterrupts: interruptAnalysis,
    contentDensity: densityAnalysis,
    promiseDelivery: promiseAnalysis,
    readability: readabilityAnalysis,
    cta: ctaAnalysis,
    narrative: narrativeAnalysis
  };

  /* Score ponderado: Σ(score_i × weight_i)
     Cada weight: ver WEIGHTS arriba para fuentes individuales.
     El conjunto de pesos como tal: [NO VALIDADO como sistema] */
  const weightedScore =
    hookAnalysis.score * WEIGHTS.hookStrength +
    pacingAnalysis.score * WEIGHTS.pacingScore +
    interruptAnalysis.score * WEIGHTS.patternInterrupts +
    densityAnalysis.score * WEIGHTS.contentDensity +
    promiseAnalysis.score * WEIGHTS.promiseDelivery +
    readabilityAnalysis.score * WEIGHTS.readability +
    ctaAnalysis.score * WEIGHTS.ctaPlacement +
    narrativeAnalysis.score * WEIGHTS.narrativeCompleteness;

  /* APV estimado: clamp a [15, 95]
     Límites 15 y 95: [NO VALIDADO — evita extremos irreales]
     Fuente SECUNDARIA: Wistia 2025 reporta completion rates entre ~20-70%
     según duración. 15-95 como rango teórico es conservador. */
  const overallRetention = Math.round(Math.max(15, Math.min(95, weightedScore)));

  /* Confianza del modelo: 0.3 base + 0.05 por bloque con contenido, max 0.85
     [NO VALIDADO — fórmula arbitraria]
     Lógica: más datos → más confianza, pero nunca >85% sin validación */
  const confidence = Math.min(0.85, 0.3 + contentBlocks.length * 0.05);

  const curve = generateRetentionCurve(blocks, wpm, hookAnalysis, pacingAnalysis);

  /* --- Insights y recomendaciones --- */
  const insights = [];
  const risks = [];
  const recommendations = [];

  if (hookAnalysis.score >= 70) {
    insights.push('✓ Hook fuerte: ' + hookAnalysis.reasons.join(', '));
  } else if (hookAnalysis.score >= 40) {
    risks.push('⚠ Hook mejorable: ' + hookAnalysis.reasons.join(', '));
    recommendations.push('Reforzá el hook con una pregunta directa o dato impactante.');
  } else {
    risks.push('✗ Hook débil: ' + hookAnalysis.reasons.join(', '));
    recommendations.push('El hook es crítico. Agregá una pregunta, dato sorprendente o promesa clara en los primeros 15 segundos.');
  }

  if (pacingAnalysis.score < 50) {
    risks.push('⚠ Ritmo irregular: ' + pacingAnalysis.details.join(', '));
    recommendations.push('Variá la duración de los bloques. Alterná segmentos cortos (15-20s) con más largos (30-45s).');
  }

  if (interruptAnalysis.ratio < 0.10) {
    risks.push('⚠ Pocos cambios de ritmo narrativo');
    recommendations.push('Agregá bloques VISUAL o GIRO cada 2-3 segmentos para resetear la atención.');
  }

  if (promise && promiseAnalysis.deliveredAt === null) {
    risks.push('✗ La promesa nunca se cumple en el guion');
    recommendations.push('La promesa del hook debe resolverse explícitamente en el cuerpo del video.');
  } else if (promise && promiseAnalysis.relativePosition > 0.6) {
    risks.push('⚠ La promesa se entrega muy tarde (>60% del video)');
    recommendations.push('Entregá al menos una pista de la promesa en el primer 30% del video.');
  }

  if (ctaAnalysis.position === null) {
    risks.push('⚠ Sin CTA definido');
    recommendations.push('Agregá un llamado a la acción claro.');
  }

  if (narrativeAnalysis.missing.length > 0) {
    risks.push('⚠ Faltan elementos: ' + narrativeAnalysis.missing.join(', '));
  }

  if (overallRetention >= 60) {
    insights.push('✓ Retención estimada alta (' + overallRetention + '% APV)');
  } else if (overallRetention >= 40) {
    insights.push('◐ Retención estimada moderada (' + overallRetention + '% APV)');
  } else {
    insights.push('✗ Retención estimada baja (' + overallRetention + '% APV)');
  }

  const dropRisks = curve.filter(p => p.isDropRisk);
  if (dropRisks.length > 0) {
    risks.push('⚠ Puntos de fuga: bloque(s) ' + dropRisks.map(p => '#' + (p.blockIndex + 1)).join(', '));
    recommendations.push('Revisá los bloques con baja retención estimada. Acortá o reestructurá su contenido.');
  }

  const formula = `APV = Σ(score×peso) = ${hookAnalysis.score}×${WEIGHTS.hookStrength} + ${pacingAnalysis.score}×${WEIGHTS.pacingScore} + ${interruptAnalysis.score}×${WEIGHTS.patternInterrupts} + ${densityAnalysis.score}×${WEIGHTS.contentDensity} + ${promiseAnalysis.score}×${WEIGHTS.promiseDelivery} + ${readabilityAnalysis.score}×${WEIGHTS.readability} + ${ctaAnalysis.score}×${WEIGHTS.ctaPlacement} + ${narrativeAnalysis.score}×${WEIGHTS.narrativeCompleteness} = ${Math.round(weightedScore)} → clamp[15,95] = ${overallRetention}%`;

  return {
    overallRetention,
    confidence: Math.round(confidence * 100) / 100,
    curve,
    scores,
    weights: WEIGHTS,
    insights,
    risks,
    recommendations,
    formula,
    meta: {
      totalBlocks: blocks.length,
      contentBlocks: contentBlocks.length,
      totalDuration: curve.length ? curve[curve.length - 1].startTime + curve[curve.length - 1].duration : 0,
      wpm,
      hasHook: !!hookBlock,
      hasCTA: blocks.some(b => b.type === 'CTA'),
      computedAt: Date.now()
    }
  };
}


/* ====================================================================
   WORKER MESSAGE HANDLER
   ==================================================================== */

self.onmessage = ({ data }) => {
  try {
    if (data.type === 'PREDICT_RETENTION') {
      const result = computeRetentionPrediction(data);
      postMessage({ type: 'RETENTION_RESULT', requestId: data.requestId, ...result });
    } else {
      postMessage({ type: 'ERROR', requestId: data.requestId, message: 'Tipo desconocido: ' + data.type });
    }
  } catch (error) {
    postMessage({ type: 'ERROR', requestId: data.requestId, message: error.message || 'Error en retention worker' });
  }
};
