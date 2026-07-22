/* ai-worker.js — Motor de embeddings para ScriptLab v4.
   Implementa §13.9 (ai-worker), §6.1, §7.2, §7.4, §7.5 del contrato.
   Modelo: Xenova/multilingual-e5-small (ONNX cuantizado, ~118 MB).
   Carga transformers.js vía import map (CDN esm.sh, decisión D6).

   REGLA DE ORO: este worker computa, NO genera texto (§1.2). */

// transformers.js se carga con import() DINÁMICO dentro de init(), no estático.
// Razón: el import estático cross-origin en module Workers falla al cargar el
// worker entero en Chromium (filename/lineno vacíos en onerror, sin mensaje).
// El import dinámico es lazy y capturable. Patrón usado en v16 (software base).
import { sanitizeText, dot, cosineSim } from './ai-shared.js';

// transformers.js — patrón copiado EXACTO del software base (v18) que funciona hoy.
// Lecciones (5 intentos):
//   1. import map del documento padre → Chromium no lo hereda en module Workers.
//   2. import estático desde URL → Chromium rechaza el worker al cargar.
//   3. jsdelivr .mjs con path explícito → build Node (importa fs/path/url) → crash.
//   4. esm.sh → polyfilla Node pero el CDN de HF bloquea CORS.
//   5. ✅ Bare URL sin path (v3.7.2) + allowRemoteModels=true + device:'wasm' → FUNCIONA.
// La bare URL deja que jsdelivr resuelva vía el campo "browser" del package.json
// (build browser-ready con polyfills), no el .mjs crudo de Node.
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';
const MAX_TOKENS = 512;
const TOKEN_CHARS = 4; // estimación: ~4 chars por token para español/inglés
const MAX_CHARS = MAX_TOKENS * TOKEN_CHARS;

let extractor = null;

/* ============================================================
   loadExtractor — carga el modelo lazy al primer uso.
   Patrón del software base v18 (comprobado funcionando).
   ============================================================ */
async function loadExtractor() {
  if (extractor) return extractor;
  const { pipeline, env } = await import(TRANSFORMERS_URL);
  env.useBrowserCache = true;
  env.allowRemoteModels = true;
  extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
    device: 'wasm',
    progress_callback: (p) => {
      self.postMessage({
        type: 'PROGRESS',
        message: p.status === 'progress'
          ? 'Descargando modelo: ' + Math.round(p.progress || 0) + '%'
          : 'Preparando modelo local…'
      });
    }
  });
  return extractor;
}

/* ============================================================
   splitIntoChunks — divide texto en fragmentos ≤ MAX_CHARS,
   respetando límites de oración. Un texto corto devuelve 1 chunk.
   ============================================================ */
function splitIntoChunks(text) {
  if (text.length <= MAX_CHARS) return [text];

  // Separar por oraciones, preservando el delimitador
  const sentences = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = '';

  for (const sentence of sentences) {
    if (current.length + sentence.length <= MAX_CHARS) {
      current += sentence;
    } else {
      if (current.trim()) chunks.push(current.trim());
      // Si una oración sola excede MAX_CHARS, partir por palabras
      if (sentence.length > MAX_CHARS) {
        const words = sentence.split(/(\s+)/);
        let wordChunk = '';
        for (const word of words) {
          if (wordChunk.length + word.length <= MAX_CHARS) {
            wordChunk += word;
          } else {
            if (wordChunk.trim()) chunks.push(wordChunk.trim());
            wordChunk = word;
          }
        }
        current = wordChunk;
      } else {
        current = sentence;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text.slice(0, MAX_CHARS)];
}

/* ============================================================
   aggregateEmbeddings — promedio ponderado por longitud de texto,
   con normalización L2 posterior. Devuelve un único vector.
   ============================================================ */
function aggregateEmbeddings(embeddings, weights) {
  if (embeddings.length === 0) return null;
  if (embeddings.length === 1) return embeddings[0];
  const dim = embeddings[0].length;
  const result = new Array(dim).fill(0);
  let totalWeight = 0;
  for (let i = 0; i < embeddings.length; i++) {
    const w = weights ? weights[i] : 1;
    for (let d = 0; d < dim; d++) result[d] += embeddings[i][d] * w;
    totalWeight += w;
  }
  for (let d = 0; d < dim; d++) result[d] /= (totalWeight || 1);
  // L2 normalize
  const norm = Math.sqrt(result.reduce((s, x) => s + x * x, 0)) || 1;
  return result.map(x => x / norm);
}

/* ============================================================
   embedTexts — embedde una lista de {id, text} con chunking +
   batching + retry. Los textos largos se dividen en fragmentos,
   se procesan por separado y se agregan con promedio ponderado.
   ============================================================ */
async function embedTexts(texts) {
  const model = await loadExtractor();
  const OPTS = { pooling: 'mean', normalize: true, truncation: true, max_length: MAX_TOKENS };

  // Pre-chunk: expandir textos largos en fragmentos
  const entries = []; // {origIdx, chunkIdx, chunkText, charWeight}
  for (let i = 0; i < texts.length; i++) {
    const chunks = splitIntoChunks(texts[i].text);
    for (let c = 0; c < chunks.length; c++) {
      entries.push({ origIdx: i, chunkIdx: c, chunkText: chunks[c], charWeight: chunks[c].length });
    }
  }

  // Embed all chunks con batching + retry
  const chunkEmbeddings = new Array(entries.length).fill(null);
  const BATCH = 8;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    const safe = batch.map(t => 'query: ' + sanitizeText(t.chunkText));
    try {
      const output = await model(safe, OPTS);
      const vectors = output.tolist();
      batch.forEach((t, j) => { chunkEmbeddings[i + j] = vectors[j]; });
    } catch (_) {
      for (let j = 0; j < batch.length; j++) {
        try {
          const output = await model(['query: ' + sanitizeText(batch[j].chunkText)], OPTS);
          const vectors = output.tolist();
          chunkEmbeddings[i + j] = vectors[0];
        } catch (__) {
          chunkEmbeddings[i + j] = null;
        }
      }
    }
  }

  // Agregar: por cada texto original, promediar sus chunks
  const results = [];
  const grouped = new Map();
  for (let i = 0; i < entries.length; i++) {
    const origIdx = entries[i].origIdx;
    if (!grouped.has(origIdx)) grouped.set(origIdx, { embeddings: [], weights: [], chunkCount: 0, successfulChunks: 0 });
    const g = grouped.get(origIdx);
    g.chunkCount++;
    if (chunkEmbeddings[i]) {
      g.embeddings.push(chunkEmbeddings[i]);
      g.weights.push(entries[i].charWeight);
      g.successfulChunks++;
    }
  }

  for (let i = 0; i < texts.length; i++) {
    const g = grouped.get(i);
    if (!g || g.embeddings.length === 0) {
      results.push({ id: texts[i].id, embedding: null, chunkCount: g?.chunkCount || 0, successfulChunks: 0, coverage: 0 });
    } else {
      results.push({
        id: texts[i].id,
        embedding: aggregateEmbeddings(g.embeddings, g.weights),
        chunkCount: g.chunkCount,
        successfulChunks: g.successfulChunks,
        coverage: Math.round((g.successfulChunks / g.chunkCount) * 100) / 100
      });
    }
  }
  return results;
}

/* ============================================================
   embedAll — wrapper simple que devuelve solo los embeddings.
   ============================================================ */
async function embedAll(rawTexts) {
  const wrapped = rawTexts.map((t, i) => ({ id: 't' + i, text: t }));
  const embedded = await embedTexts(wrapped);
  return embedded.map(e => e.embedding);
}

/* ============================================================
   INIT — dispara la carga del modelo (lazy a través de loadExtractor).
   ============================================================ */
async function init(revision) {
  await loadExtractor();
  self.postMessage({ type: 'READY' });
}

/* ============================================================
   EMBED (tier 1, push) — alineación hook↔promesa + baseline pairwise
   Devuelve: { alignment, alignmentRaw, redundancy, baseline:{avgSim,maxSim,pairCount} }
   ============================================================ */
async function embed({ requestId, cacheId, texts }) {
  // texts: [{id, text, role: 'title'|'promise'|'block'|'hook'}]
  // Usar embedTexts directamente para obtener metadata de chunks
  const wrapped = texts.map(t => ({ id: t.id, text: t.text }));
  const embedResults = await embedTexts(wrapped);
  const embMap = {};
  let totalChunks = 0, successfulChunks = 0, failedChunks = 0;
  embedResults.forEach((e, i) => {
    embMap[texts[i].id] = e.embedding;
    totalChunks += e.chunkCount;
    successfulChunks += e.successfulChunks;
    if (e.embedding === null) failedChunks++;
  });

  // --- Baseline pairwise sobre los bloques ---
  const blockEntries = texts.filter(t => t.role === 'block');
  const blockEmbs = blockEntries.map(b => embMap[b.id]);
  let pairCount = 0;
  let sumSim = 0;
  let maxSim = 0;
  for (let i = 0; i < blockEmbs.length; i++) {
    for (let j = i + 1; j < blockEmbs.length; j++) {
      const s = dot(blockEmbs[i], blockEmbs[j]); // L2-normalizados → dot = coseno
      sumSim += s;
      pairCount++;
      if (s > maxSim) maxSim = s;
    }
  }
  const avgSim = pairCount > 0 ? sumSim / pairCount : 0;

  // --- Alineación hook↔promesa ---
  const hookEmb = embMap['hook'];
  const promiseEmb = embMap['promise'];
  let alignmentRaw = 0;
  if (hookEmb && promiseEmb) alignmentRaw = dot(hookEmb, promiseEmb);

  // Normalización de alignment al baseline: "qué tan alineado es hook-promesa
  // relativo a la distribución pairwise del guion". clamp [0,1].
  // [Normalización INFERENCIAL — design choice, no validado externamente]
  let alignment;
  if (pairCount > 0 && maxSim > avgSim) {
    alignment = clamp01((alignmentRaw - avgSim) / (maxSim - avgSim));
  } else if (pairCount > 0) {
    alignment = alignmentRaw > avgSim ? 1 : 0;
  } else {
    alignment = clamp01(alignmentRaw); // sin baseline, raw directo
  }

  // Redundancia: avgSim como fracción de maxSim ("qué tan uniforme es el
  // espacio semántico del guion"). Mayor = más redundante.
  // [Definición INFERENCIAL — proxy de redundancia para tier 1]
  const redundancy = (pairCount > 0 && maxSim > 0) ? avgSim / maxSim : 0;

  self.postMessage({
    type: 'EMBED_RESULT',
    requestId,
    cacheId,
    alignment,
    alignmentRaw,
    redundancy,
    baseline: { avgSim, maxSim, pairCount },
    processing: {
      totalBlocks: texts.length,
      totalChunks,
      successfulChunks,
      failedChunks,
      truncatedBlocks: 0, // ya no hay truncado silencioso
      model: 'Xenova/multilingual-e5-small',
      modelLimitTokens: MAX_TOKENS
    }
  });
}

/* ============================================================
   EXTRACT_KEY_SENTENCES (tier 2) — oraciones más representativas
   vs el centroide del guion. Top-N por similitud coseno.
   ============================================================ */
async function extractKeySentences({ requestId, sentences, fullText, topN }) {
  if (sentences.length === 0) {
    self.postMessage({ type: 'EXTRACT_RESULT', requestId, sentences: [] });
    return;
  }
  const sentenceEmbs = await embedAll(sentences);
  const [centroidEmb] = await embedAll([fullText]);
  const scored = sentences.map((text, i) => ({
    text,
    score: dot(sentenceEmbs[i], centroidEmb) // L2-norm → dot = coseno
  }));
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, Math.min(topN, scored.length));
  self.postMessage({ type: 'EXTRACT_RESULT', requestId, sentences: top });
}

/* ============================================================
   COMPUTE_REDUNDANCY (tier 2) — pairwise con separación de contrastes.
   "Redundante" = mismo tema (alta sim) + mismo tono (Δvalencia baja).
   "Contraste"   = mismo tema + tono opuesto (Δvalencia alta) → estructura válida.
   ============================================================ */
async function computeRedundancy({ requestId, blocks, blockIds, threshold, valenceMap }) {
  const embs = await embedAll(blocks);

  const redundantPairs = [];
  const contrastPairs = [];
  let sumSim = 0, pairCount = 0, maxSim = 0;

  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const sim = dot(embs[i], embs[j]);
      sumSim += sim; pairCount++;
      if (sim > maxSim) maxSim = sim;

      if (sim >= threshold) {
        const vi = valenceMap?.[blockIds[i]] ?? 0;
        const vj = valenceMap?.[blockIds[j]] ?? 0;
        const valenceDiff = Math.abs(vi - vj);
        const pair = {
          textA: blocks[i], textB: blocks[j],
          similarity: sim, rawSimilarity: sim
        };
        // Umbral contraste: Δvalencia ≥ 0.50 = tono opuesto (§7.6.1 banda medio).
        // [INFERIDO de VADER — cambio significativo de tono]
        if (valenceDiff >= 0.50) {
          contrastPairs.push({ ...pair, valenceDiff });
        } else {
          redundantPairs.push(pair);
        }
      }
    }
  }

  const avgSim = pairCount > 0 ? sumSim / pairCount : 0;
  const density = (pairCount > 0 && maxSim > 0) ? avgSim / maxSim : 0;

  self.postMessage({
    type: 'REDUNDANCY_RESULT',
    requestId,
    density,
    redundantCount: redundantPairs.length,
    contrastCount: contrastPairs.length,
    redundantPairs,
    contrastPairs,
    baseline: { avgSim, maxSim }
  });
}

/* ============================================================
   COMPUTE_DENSITY (tier 2) — temas/minuto.
   Segmentos de 1 min (wpm palabras). Similitud de cada segmento
   con el global. Detección de cambios temáticos entre segmentos consecutivos.
   ============================================================ */
async function computeDensity({ requestId, segments, fullText }) {
  if (segments.length === 0) {
    self.postMessage({ type: 'DENSITY_RESULT', requestId, topicsPerMinute: 0, density: 0, totalSegments: 0, avgGlobalSim: 0, segments: [], changes: [] });
    return;
  }
  const segEmbs = await embedAll(segments.map(s => s.text));
  const [globalEmb] = await embedAll([fullText]);
  const segScored = segments.map((s, i) => ({
    label: s.label,
    globalSim: dot(segEmbs[i], globalEmb)
  }));
  const avgGlobalSim = segScored.reduce((a, s) => a + s.globalSim, 0) / segScored.length;

  // Cambios temáticos: similitud entre segmentos consecutivos por debajo de
  // la media de las transiciones menos una desviación estándar. Así el umbral
  // se adapta al guion y no queda bloqueado por la similitud global.
  const transitions = [];
  for (let i = 1; i < segEmbs.length; i++) {
    transitions.push({ afterSegment: i - 1, similarity: dot(segEmbs[i - 1], segEmbs[i]) });
  }
  const transitionMean = transitions.length
    ? transitions.reduce((sum, t) => sum + t.similarity, 0) / transitions.length
    : avgGlobalSim;
  const transitionVariance = transitions.length
    ? transitions.reduce((sum, t) => sum + (t.similarity - transitionMean) ** 2, 0) / transitions.length
    : 0;
  const adaptiveThreshold = transitionMean - Math.sqrt(transitionVariance);
  const changes = transitions.filter(t => t.similarity < adaptiveThreshold);

  // Un guion con contenido tiene al menos un tema. Antes se calculaban solo
  // los cambios; por eso el resultado quedaba en 0 cuando no había un corte.
  // Los segmentos son ventanas aproximadas de un minuto según splitIntoSegments.
  const topicCount = changes.length + 1;
  const topicsPerMinute = segments.length > 0 ? topicCount / segments.length : 0;
  const density = avgGlobalSim;

  self.postMessage({
    type: 'DENSITY_RESULT',
    requestId,
    topicsPerMinute: Math.round(topicsPerMinute * 10) / 10,
    density,
    totalSegments: segments.length,
    avgGlobalSim,
    adaptiveThreshold,
    topicCount,
    segments: segScored,
    changes
  });
}

/* ============================================================
   DETECT_GAPS (tier 2) — cobertura semántica contra centroides.
   Cada tema: centroide de sus oraciones ejemplo. Umbral adaptativo:
   media−σ de la distribución de mejores matches. [Adaptativo, INFERIDO]
   ============================================================ */
async function detectGaps({ requestId, blocks, topics }) {
  // topics: [{label, examples: string[]}] (los semánticos)
  const blockEmbs = await embedAll(blocks);

  // Centroides: promedio L2-normalizado de los embeddings de los ejemplos de cada tema.
  const topicData = [];
  for (const topic of topics) {
    if (!topic.examples || topic.examples.length === 0) continue;
    const exEmbs = await embedAll(topic.examples);
    const dim = exEmbs[0].length;
    const centroid = new Array(dim).fill(0);
    for (const e of exEmbs) for (let d = 0; d < dim; d++) centroid[d] += e[d];
    for (let d = 0; d < dim; d++) centroid[d] /= exEmbs.length;
    // normalizar el centroide
    const norm = Math.sqrt(centroid.reduce((s, x) => s + x * x, 0)) || 1;
    const centroidNorm = centroid.map(x => x / norm);
    topicData.push({ label: topic.label, centroid: centroidNorm });
  }

  // Mejor match de cada tema contra los bloques
  const matches = topicData.map(td => {
    let best = 0, bestBlock = 0;
    blockEmbs.forEach((be, i) => {
      const s = dot(be, td.centroid);
      if (s > best) { best = s; bestBlock = i; }
    });
    return { topic: td.label, maxSimilarity: best, bestBlock };
  });

  // Umbral adaptativo: media − σ de las mejores similitudes.
  const mean = matches.reduce((a, m) => a + m.maxSimilarity, 0) / (matches.length || 1);
  const variance = matches.reduce((s, m) => s + (m.maxSimilarity - mean) ** 2, 0) / (matches.length || 1);
  const std = Math.sqrt(variance);
  const adaptiveThreshold = mean - std;

  const gaps = matches.filter(m => m.maxSimilarity < adaptiveThreshold);
  const covered = matches.filter(m => m.maxSimilarity >= adaptiveThreshold);

  self.postMessage({
    type: 'GAPS_RESULT',
    requestId,
    gaps,
    covered,
    adaptiveThreshold,
    baselineMean: mean,
    baselineStd: std
  });
}

/* ============================================================
   Helpers
   ============================================================ */
function clamp01(x) { return Math.max(0, Math.min(1, x)); }

/* ============================================================
   Router de mensajes
   ============================================================ */
self.onmessage = async ({ data }) => {
  try {
    switch (data.type) {
      case 'INIT':
        await init(data.revision);
        break;
      case 'EMBED':
        await embed(data);
        break;
      case 'EXTRACT_KEY_SENTENCES':
        await extractKeySentences(data);
        break;
      case 'COMPUTE_REDUNDANCY':
        await computeRedundancy(data);
        break;
      case 'COMPUTE_DENSITY':
        await computeDensity(data);
        break;
      case 'DETECT_GAPS':
        await detectGaps(data);
        break;
      default:
        self.postMessage({ type: 'ERROR', requestId: data.requestId, message: 'Tipo desconocido: ' + data.type });
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', requestId: data.requestId, message: error.message || 'Error en ai-worker' });
  }
};
