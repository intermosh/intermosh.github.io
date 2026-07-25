/* sentiment-worker.js — Análisis de sentimiento (arco emocional).
   ENGINE combined-1.0: wrapper delgado (patrón D3); la lógica pura vive en
   sentiment-engine.js (testeable en Node).
   Modelo: Xenova/robertuito-sentiment-analysis (ONNX cuantizado, ~95 MB).
   Base: pysentimiento/robertuito-sentiment-analysis (RoBERTuito, español).
   REGLA DE ORO: computa, NO genera texto (§1.2). */

import { sanitizeSentimentText } from './ai-shared.js';
import { chunkTextForSentiment, buildSentimentResult } from './sentiment-engine.js';

const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

let classifier = null;

/* ============================================================
   INIT — carga el modelo, reporta progreso y READY
   ============================================================ */
async function init() {
  if (classifier) { self.postMessage({ type: 'READY' }); return; }
  self.postMessage({ type: 'PROGRESS', message: 'Cargando sentimiento…' });

  const { pipeline, env } = await import(TRANSFORMERS_URL);
  env.useBrowserCache = true;
  env.allowRemoteModels = true;

  classifier = await pipeline('text-classification', 'Xenova/robertuito-sentiment-analysis', {
    device: 'wasm',
    progress_callback: (p) => {
      self.postMessage({
        type: 'PROGRESS',
        message: p.status === 'progress'
          ? 'Descargando sentimiento: ' + Math.round(p.progress || 0) + '%'
          : 'Preparando sentimiento…'
      });
    }
  });

  self.postMessage({ type: 'READY' });
}

/* ============================================================
   Convierte salida del modelo {label, score} → valencia [-1, 1]
   ============================================================ */
function toValence(result) {
  const r = Array.isArray(result) ? result[0] : result;
  const label = (r && r.label || 'NEU').toUpperCase();
  const score = r && typeof r.score === 'number' ? r.score : 0;
  if (label === 'POS') return score;
  if (label === 'NEG') return -score;
  return 0; // NEU
}

/* ============================================================
   classifyWithRetry — batch con retry uno-por-uno (defensa contra el
   bug "Cannot convert undefined to a BigInt" de transformers.js).
   Devuelve valencias alineadas o null por texto fallido.
   ============================================================ */
async function classifyWithRetry(texts) {
  const results = new Array(texts.length).fill(null);
  const BATCH = 8;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    try {
      const out = await classifier(batch);
      const arr = Array.isArray(out) ? out : [out];
      arr.forEach((r, j) => { results[i + j] = toValence(r); });
    } catch (_) {
      for (let j = 0; j < batch.length; j++) {
        try {
          const out = await classifier([batch[j]]);
          const arr = Array.isArray(out) ? out : [out];
          results[i + j] = toValence(arr[0]);
        } catch (__) {
          results[i + j] = null; // este texto no se pudo clasificar
        }
      }
    }
  }
  return results;
}

/* ============================================================
   SENTIMENT — elegibilidad → chunks (rescue arena, con pesos) →
   clasificación → buildSentimentResult (N/D ≠ 0, missing no se fabrica).
   ============================================================ */
async function sentiment({ requestId, texts, blockIds, blockIndices, blockTypes }) {
  // Elegibles: sanitizados y con algo analizable (sin puntos fantasma 'texto')
  const entries = [];
  let skippedShort = 0;
  for (let i = 0; i < texts.length; i++) {
    const t = sanitizeSentimentText(texts[i]);
    if (t.length >= 4) {
      entries.push({ blockId: blockIds[i], blockIndex: blockIndices[i], blockType: blockTypes[i], text: t });
    } else {
      skippedShort++;
    }
  }

  if (!entries.length) {
    self.postMessage({
      type: 'SENTIMENT_RESULT', requestId,
      sentimentArc: [], engagementScore: 0, emotionalMomentum: 0, tonalJumps: [],
      processing: { totalBlocks: texts.length, eligibleBlocks: 0, successfulBlocks: 0, failedBlocks: 0, skippedShort }
    });
    return;
  }

  // Expandir a chunks (bloques largos) preservando peso por palabras
  const jobs = []; // {entryIdx, text, words}
  entries.forEach((e, i) => {
    const chunks = chunkTextForSentiment(e.text);
    chunks.forEach(c => jobs.push({ entryIdx: i, text: c.text, words: c.words }));
  });

  const vals = await classifyWithRetry(jobs.map(j => j.text));

  // Reagrupar por entrada
  const outcomes = entries.map(() => ({ chunks: [] }));
  jobs.forEach((j, k) => {
    if (vals[k] !== null) outcomes[j.entryIdx].chunks.push({ valence: vals[k], words: j.words });
  });

  const result = buildSentimentResult({ entries, outcomes });
  result.type = 'SENTIMENT_RESULT';
  result.requestId = requestId;
  result.processing.totalBlocks = texts.length;
  result.processing.skippedShort = skippedShort;
  self.postMessage(result);
}

/* ============================================================
   Router de mensajes
   ============================================================ */
self.onmessage = async ({ data }) => {
  try {
    switch (data.type) {
      case 'INIT': await init(); break;
      case 'SENTIMENT': await sentiment(data); break;
    }
  } catch (e) {
    self.postMessage({ type: 'ERROR', message: e.message || 'Error desconocido en sentiment' });
  }
};
