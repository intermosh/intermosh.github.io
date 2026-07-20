/* ai-worker.js — Motor de análisis de embeddings para ScriptLab
   Modelo: Xenova/multilingual-e5-small (norma L2 habilitada → dot = coseno) */

import { sanitizeText, dot, cosineSim } from './ai-shared.js';

let extractor = null;
let mode = 'basic';

async function loadExtractor() {
  if (extractor) return extractor;
  const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2');
  env.useBrowserCache = true;
  env.allowRemoteModels = true;
  extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
    device: 'wasm',
    progress_callback: p => postMessage({
      type: 'PROGRESS',
      message: p.status === 'progress'
        ? 'Descargando modelo: ' + Math.round(p.progress || 0) + '%'
        : 'Preparando modelo local\u2026'
    })
  });
  return extractor;
}

/* Genera embeddings para un array de {id, text}.
   - Sanitiza cada texto para evitar token IDs fuera de rango.
   - Trunca a 512 tokens (límite de e5-small).
   - Si falla un batch, reintenta uno por uno para no perder todo. */
async function embedTexts(texts) {
  const model = await loadExtractor();
  const results = [];
  const BATCH = 8;
  const OPTS = { pooling: 'mean', normalize: true, truncation: true, max_length: 512 };

  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    const safe = batch.map(t => sanitizeText(t.text));
    try {
      const output = await model(safe, OPTS);
      const vectors = output.tolist();
      batch.forEach((t, j) => results.push({ id: t.id, embedding: vectors[j] }));
    } catch (_) {
      /* Batch falló — procesar uno por uno */
      for (let j = 0; j < batch.length; j++) {
        try {
          const output = await model([safe[j]], OPTS);
          const vectors = output.tolist();
          results.push({ id: batch[j].id, embedding: vectors[0] });
        } catch (__) {
          results.push({ id: batch[j].id, embedding: null });
        }
      }
    }
  }
  return results;
}

/* ---------- handlers por tipo de mensaje ---------- */

/* EMBED — con normalización contra baseline del propio guion.
   El modelo e5-small produce cosenos altos (0.7-0.95) para texto del
   mismo idioma. Los valores crudos NO son porcentajes de alineación.
   Se normaliza contra la distribución pairwise del guion para obtener
   señales comparativas reales. */
async function handleEmbed(data) {
  const texts = [
    { id: 'title', text: data.texts.find(t => t.id === 'title')?.text || '', role: 'title' },
    { id: 'promise', text: data.texts.find(t => t.id === 'promise')?.text || '', role: 'promise' },
    ...data.texts.filter(t => t.role === 'block')
  ];
  const hookItem = data.texts.find(t => t.id === 'hook');
  if (hookItem) texts.push({ id: 'hook', text: hookItem.text, role: 'hook' });

  const embedded = await embedTexts(texts);
  const map = Object.fromEntries(embedded.map(e => [e.id, e.embedding]));

  const blocks = data.texts.filter(x => x.role === 'block');

  /* 1. Pairwise cosine entre todos los bloques → baseline */
  const allSims = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const s = dot(map[blocks[i].id], map[blocks[j].id]);
      if (s > 0) allSims.push(s);
    }
  }
  const avgSim = allSims.length ? allSims.reduce((a, b) => a + b, 0) / allSims.length : 0.5;
  const maxSim = allSims.length ? Math.max(...allSims) : 1;
  const minSim = allSims.length ? Math.min(...allSims) : 0;
  const range = maxSim - minSim || 0.01;

  /* 2. Hook-Promesa: normalizado contra distribución pairwise
     raw = cosine(hook, promise)
     normalized = (raw - avgSim) / range → 0 significa "igual que promedio",
     1 significa "máxima similitud observada", negativo significa "menos"
     Se clamp a [0,1] y se escala a porcentaje. */
  const rawAlignment = dot(map.hook, map.promise);
  const normalizedAlignment = Math.max(0, Math.min(1, (rawAlignment - avgSim) / range));

  /* 3. Hook-Título: mismo tratamiento */
  const rawTitleAlign = dot(map.hook, map.title);
  const normalizedTitleAlign = Math.max(0, Math.min(1, (rawTitleAlign - avgSim) / range));

  /* 4. Redundancia: similitud promedio entre bloques consecutivos,
     normalizada contra la baseline. 0 = totalmente diferentes,
     1 = todos los bloques dicen lo mismo. */
  const adj = [];
  for (let i = 1; i < blocks.length; i++) {
    adj.push(dot(map[blocks[i - 1].id], map[blocks[i].id]));
  }
  const avgAdj = adj.length ? adj.reduce((a, b) => a + b, 0) / adj.length : 0;
  /* Redundancia = qué tan cerca del máximo están los consecutivos.
     Si avgAdj ≈ maxSim → los bloques son muy repetitivos. */
  const rawRedundancy = adj.length ? Math.max(...adj) : 0;
  const normalizedRedundancy = Math.max(0, Math.min(1, (avgAdj - minSim) / range));

  return {
    type: 'EMBED_RESULT',
    requestId: data.requestId,
    cacheId: data.cacheId,
    alignment: normalizedAlignment,
    alignmentRaw: rawAlignment,
    titleAlignment: normalizedTitleAlign,
    redundancy: normalizedRedundancy,
    redundancyRaw: rawRedundancy,
    baseline: { avgSim, maxSim, minSim, pairCount: allSims.length },
    confidence: 0.72
  };
}

/* ACTUALIZACIÓN 1 — Resumen extractivo (oraciones clave) */
async function handleExtractKeySentences(data) {
  const { sentences, topN = 5 } = data;
  const allTexts = [
    { id: '__full__', text: data.fullText || '' },
    ...sentences.map((s, i) => ({ id: 's' + i, text: s }))
  ];
  const embedded = await embedTexts(allTexts);
  const map = Object.fromEntries(embedded.map(e => [e.id, e.embedding]));
  const fullEmb = map['__full__'];

  const scored = sentences.map((s, i) => ({
    index: i,
    text: s,
    score: cosineSim(fullEmb, map['s' + i])
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topN);
  top.sort((a, b) => a.index - b.index); // restaurar orden original

  return { type: 'EXTRACT_KEY_RESULT', requestId: data.requestId, sentences: top };
}

/* ACTUALIZACIÓN 2 — Redundancia global (detección de repetición semántica) */
async function handleRedundancy(data) {
  const { blocks, threshold = 0.85 } = data;
  const texts = blocks.map((b, i) => ({ id: 'b' + i, text: b }));
  const embedded = await embedTexts(texts);
  const vecs = embedded.map(e => e.embedding);

  const n = vecs.length;
  const matrix = [];
  let totalSim = 0;
  let pairs = 0;
  const redundant = [];

  for (let i = 0; i < n; i++) {
    matrix[i] = [];
    for (let j = i + 1; j < n; j++) {
      const sim = dot(vecs[i], vecs[j]);
      matrix[i][j] = sim;
      totalSim += sim;
      pairs++;
      if (sim > threshold && i !== j) {
        redundant.push({ i, j, similarity: sim, textA: blocks[i], textB: blocks[j] });
      }
    }
  }

  const globalIndex = pairs > 0 ? totalSim / pairs : 0;
  const density = Math.max(0, Math.min(1, 1 - globalIndex));

  return {
    type: 'REDUNDANCY_RESULT',
    requestId: data.requestId,
    redundantPairs: redundant.sort((a, b) => b.similarity - a.similarity),
    globalIndex,
    density,
    totalBlocks: n,
    totalPairs: pairs,
    redundantCount: redundant.length
  };
}

/* ACTUALIZACIÓN 3 — Densidad temática por minuto */
async function handleDensity(data) {
  const { segments, fullText } = data;
  const allTexts = [
    { id: '__global__', text: fullText || segments.map(s => s.text).join(' ') },
    ...segments.map((s, i) => ({ id: 'seg' + i, text: s.text }))
  ];
  const embedded = await embedTexts(allTexts);
  const map = Object.fromEntries(embedded.map(e => [e.id, e.embedding]));
  const globalEmb = map['__global__'];

  const n = segments.length;
  const globalSims = [];
  const transitionSims = [];

  for (let i = 0; i < n; i++) {
    const simGlobal = dot(map['seg' + i], globalEmb);
    globalSims.push(simGlobal);
    if (i > 0) {
      transitionSims.push(dot(map['seg' + i - 1], map['seg' + i]));
    }
  }

  const avgGlobalSim = globalSims.length ? globalSims.reduce((a, b) => a + b, 0) / globalSims.length : 0;
  const avgTransition = transitionSims.length ? transitionSims.reduce((a, b) => a + b, 0) / transitionSims.length : 0;
  const density = Math.max(0, 1 - avgGlobalSim);

  /* Estimación de temas por minuto */
  const estimatedMinutes = Math.max(1, n);
  const topicsPerMinute = density * 2.5; // escala heurística

  /* Identificar cambios temáticos */
  const changes = [];
  for (let i = 0; i < transitionSims.length; i++) {
    if (transitionSims[i] < avgTransition - 0.1) {
      changes.push({ afterSegment: i + 1, similarity: transitionSims[i] });
    }
  }

  return {
    type: 'DENSITY_RESULT',
    requestId: data.requestId,
    globalSims,
    transitionSims,
    density,
    avgGlobalSim,
    avgTransition,
    topicsPerMinute: Math.round(topicsPerMinute * 10) / 10,
    segments: segments.map((s, i) => ({
      index: i,
      label: s.label || 'Segmento ' + (i + 1),
      globalSim: globalSims[i]
    })),
    changes,
    totalSegments: n
  };
}

/* ACTUALIZACIÓN 5 — Detección de huecos con temas predefinidos */
/* Huecos: umbral relativo en vez de fijo.
   El modelo e5-small produce cosenos altos (0.6-0.93) para cualquier
   par de texto en español. Un umbral fijo de 0.55 marca todo como
   "cubierto". En su lugar, se usa un umbral adaptativo:
   threshold = media - 1 desviación estándar de los best-match.
   Solo quedan como "hueco" los temas significativamente más débiles
   que el resto. */
async function handleGaps(data) {
  const { blocks, topics } = data;
  const blockTexts = blocks.map((b, i) => ({ id: 'b' + i, text: b }));
  const topicTexts = topics.map((t, i) => ({ id: 't' + i, text: t.text }));

  const allTexts = [...blockTexts, ...topicTexts];
  const embedded = await embedTexts(allTexts);
  const map = Object.fromEntries(embedded.map(e => [e.id, e.embedding]));

  /* Paso 1: calcular best-match similarity para cada tema */
  const bestMatches = [];
  for (let i = 0; i < topics.length; i++) {
    let maxSim = 0;
    let bestBlock = -1;
    for (let j = 0; j < blocks.length; j++) {
      const s = dot(map['t' + i], map['b' + j]);
      if (s > maxSim) { maxSim = s; bestBlock = j; }
    }
    bestMatches.push({ topic: topics[i].label || topics[i].text, maxSimilarity: maxSim, bestBlock });
  }

  /* Paso 2: calcular umbral adaptativo = media - 1σ */
  const sims = bestMatches.map(m => m.maxSimilarity);
  const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
  const variance = sims.reduce((s, v) => s + (v - mean) ** 2, 0) / sims.length;
  const std = Math.sqrt(variance);
  const adaptiveThreshold = Math.max(0.3, mean - std); /* nunca más bajo que 0.3 */

  /* Paso 3: clasificar usando el umbral adaptativo */
  const gaps = [];
  const covered = [];
  for (const item of bestMatches) {
    if (item.maxSimilarity < adaptiveThreshold) {
      gaps.push(item);
    } else {
      covered.push(item);
    }
  }

  /* Paso 4: ordenar gaps por similitud ascendente (más débil primero) */
  gaps.sort((a, b) => a.maxSimilarity - b.maxSimilarity);

  return {
    type: 'GAPS_RESULT',
    requestId: data.requestId,
    gaps,
    covered,
    totalTopics: topics.length,
    gapCount: gaps.length,
    adaptiveThreshold: Math.round(adaptiveThreshold * 100) / 100,
    baselineMean: Math.round(mean * 100) / 100,
    baselineStd: Math.round(std * 100) / 100
  };
}

/* ---------- dispatcher principal ---------- */
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'INIT') {
      mode = data.mode || 'basic';
      if (mode === 'embeddings') {
        postMessage({ type: 'PROGRESS', message: 'Cargando motor IA local\u2026' });
        await loadExtractor();
      }
      postMessage({ type: 'READY', mode });
      return;
    }

    /* Todas las operaciones de embeddings requieren modo embeddings */
    if (mode !== 'embeddings') {
      postMessage({ type: 'ERROR', requestId: data.requestId, message: 'Modo embeddings no activo. Activá el modo AI primero.' });
      return;
    }

    let result;
    switch (data.type) {
      case 'EMBED':
        result = await handleEmbed(data);
        break;
      case 'EXTRACT_KEY_SENTENCES':
        result = await handleExtractKeySentences(data);
        break;
      case 'COMPUTE_REDUNDANCY':
        result = await handleRedundancy(data);
        break;
      case 'COMPUTE_DENSITY':
        result = await handleDensity(data);
        break;

      case 'DETECT_GAPS':
        result = await handleGaps(data);
        break;

      default:
        postMessage({ type: 'ERROR', requestId: data.requestId, message: 'Tipo de mensaje desconocido: ' + data.type });
        return;
    }
    postMessage(result);
  } catch (error) {
    postMessage({ type: 'ERROR', requestId: data.requestId, message: error.message || 'Error desconocido en worker' });
  }
};