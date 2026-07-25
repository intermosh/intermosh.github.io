/* sentiment-worker.js — Análisis de sentimiento (arco emocional) para ScriptLab v4.
   Implementa §13.9 (sentiment-worker), §6.2, §7.6 + §7.6.1 del contrato.
   Modelo: Xenova/robertuito-sentiment-analysis (ONNX cuantizado, ~95 MB).
   Base: pysentimiento/robertuito-sentiment-analysis (RoBERTuito, español, POS/NEG/NEU).
   Carga transformers.js vía import map (CDN esm.sh, decisión D6).

   REGLA DE ORO: computa, NO genera texto (§1.2). */

// transformers.js con import() DINÁMICO dentro de init() (ver ai-worker.js para justificación).
import { sanitizeSentimentText } from './ai-shared.js';

// transformers.js — patrón copiado del software base (ver ai-worker.js para detalle).
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';

let classifier = null;

// robertuito max_position_embeddings=130 → ~90 palabras español (defensa en profundidad).
// El chunking por oraciones mantiene cada fragmento dentro del límite real del modelo.
const MAX_SENT_WORDS = 90;
// Segundo argumento para classifier() — truncation como defensa adicional.
// max_length=128 deja margen para tokens especiales del tokenizer (CLS, SEP).
const CLASSIFIER_OPTS = { truncation: true, max_length: 128 };

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
   POS: +score, NEG: -score, NEU: 0.
   ============================================================ */
function toValence(result) {
  // result puede ser {label, score} o array (topk). Tomamos el primero.
  const r = Array.isArray(result) ? result[0] : result;
  const label = (r.label || 'NEU').toUpperCase();
  const score = typeof r.score === 'number' ? r.score : 0;
  if (label === 'POS') return score;
  if (label === 'NEG') return -score;
  return 0; // NEU
}

/* ============================================================
   splitIntoSentChunks — divide texto en fragmentos ≤ MAX_SENT_WORDS
   palabras, respetando límites de oración. Replica la lógica de
   splitIntoChunks de ai-worker.js adaptada a palabras en vez de
   caracteres. Un texto corto devuelve 1 chunk.
   ============================================================ */
function splitIntoSentChunks(text) {
  const wordCount = text.split(/\s+/).length;
  if (wordCount <= MAX_SENT_WORDS) return [text];

  // Separar por oraciones, preservando el delimitador
  const sentences = text.match(/[^.!?]+[.!?]+\s*|[^.!?]+$/g) || [text];
  const chunks = [];
  let current = '';
  let currentWords = 0;

  for (const sentence of sentences) {
    const sentenceWords = sentence.trim().split(/\s+/).length;
    if (currentWords + sentenceWords <= MAX_SENT_WORDS) {
      current += sentence;
      currentWords += sentenceWords;
    } else {
      if (current.trim()) chunks.push(current.trim());
      // Si una oración sola excede MAX_SENT_WORDS, partir por palabras
      if (sentenceWords > MAX_SENT_WORDS) {
        const words = sentence.split(/(\s+)/);
        let wordChunk = '';
        let wc = 0;
        for (const word of words) {
          const isSpace = /^\s+$/.test(word);
          if (!isSpace) wc++;
          if (wc > MAX_SENT_WORDS && wordChunk.trim()) {
            chunks.push(wordChunk.trim());
            wordChunk = word;
            wc = isSpace ? 0 : 1;
          } else {
            wordChunk += word;
          }
        }
        current = wordChunk;
        currentWords = current.trim().split(/\s+/).filter(Boolean).length;
      } else {
        current = sentence;
        currentWords = sentenceWords;
      }
    }
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks.length > 0 ? chunks : [text];
}

/* ============================================================
   classifyTexts — clasifica en batches con retry uno-por-uno +
   truncation explícito. Defensa contra el bug "Cannot convert
   undefined to a BigInt" de transformers.js.
   Devuelve resultados alineados con el input; los que fallan → null.
   ============================================================ */
async function classifyTexts(texts) {
  const results = new Array(texts.length).fill(null);
  const BATCH = 8;
  for (let i = 0; i < texts.length; i += BATCH) {
    const batch = texts.slice(i, i + BATCH);
    try {
      const out = await classifier(batch, CLASSIFIER_OPTS);
      const arr = Array.isArray(out) ? out : [out];
      arr.forEach((r, j) => { results[i + j] = r; });
    } catch (_) {
      // Batch falló — procesar uno por uno para no perder todo.
      for (let j = 0; j < batch.length; j++) {
        try {
          const out = await classifier([batch[j]], CLASSIFIER_OPTS);
          const arr = Array.isArray(out) ? out : [out];
          results[i + j] = arr[0];
        } catch (__) {
          results[i + j] = null; // este texto no se pudo clasificar
        }
      }
    }
  }
  return results;
}

/* ============================================================
   SENTIMENT — clasifica cada texto, arma arco + agregados.
   Umbrales de salto tonal §7.6.1 (recalibrados con base VADER):
     detección mínima |Δ| ≥ 0.25; bajo < 0.50; medio < 0.75; alto ≥ 0.75.
   [INFERIDO de VADER (Hutto & Gilbert 2014, ICWSM), escala -4..+4 → -1..+1 ÷4 lineal]
   ============================================================ */
async function sentiment({ requestId, texts, blockIds, blockIndices, blockTypes }) {
  // Saltar textos vacíos/muy cortos (no aparecen en sentimentArc).
  const eligible = [];
  for (let i = 0; i < texts.length; i++) {
    const t = sanitizeSentimentText(texts[i]);
    if (t.length >= 4) eligible.push({ idx: i, text: t });
  }

  if (eligible.length === 0) {
    self.postMessage({
      type: 'SENTIMENT_RESULT', requestId,
      sentimentArc: [], engagementScore: 0, emotionalMomentum: 0, tonalJumps: [],
      processing: { totalBlocks: texts.length, eligibleBlocks: 0, successfulBlocks: 0, failedBlocks: 0 }
    });
    return;
  }

  // Pre-chunk: expandir textos largos en fragmentos ≤ MAX_SENT_WORDS palabras.
  // Replica el patrón de ai-worker.js::embedTexts(): chunk → classify → aggregate.
  const entries = []; // {origIdx, chunkIdx, chunkText, wordWeight}
  for (let i = 0; i < eligible.length; i++) {
    const chunks = splitIntoSentChunks(eligible[i].text);
    for (let c = 0; c < chunks.length; c++) {
      entries.push({ origIdx: i, chunkIdx: c, chunkText: chunks[c], wordWeight: chunks[c].trim().split(/\s+/).length });
    }
  }

  // Clasificar todos los chunks (con defensa BigInt: batches + retry + truncation).
  const chunkResults = await classifyTexts(entries.map(e => e.chunkText));

  // Agregar: por cada bloque elegible, promediar valencias de sus chunks
  // ponderado por cantidad de palabras (textos más largos pesan más).
  const aggregatedValences = new Array(eligible.length).fill(null);
  const chunkCounts = new Array(eligible.length).fill(0);
  const successfulChunkCounts = new Array(eligible.length).fill(0);

  for (let i = 0; i < entries.length; i++) {
    const origIdx = entries[i].origIdx;
    chunkCounts[origIdx]++;
    const r = chunkResults[i];
    if (r) {
      successfulChunkCounts[origIdx]++;
      const v = toValence(r);
      if (aggregatedValences[origIdx] === null) {
        aggregatedValences[origIdx] = { sum: v * entries[i].wordWeight, totalWeight: entries[i].wordWeight };
      } else {
        aggregatedValences[origIdx].sum += v * entries[i].wordWeight;
        aggregatedValences[origIdx].totalWeight += entries[i].wordWeight;
      }
    }
  }

  // Convertir a valencia final (promedio ponderado o null si todos los chunks fallaron)
  const rawResults = aggregatedValences.map((agg) => {
    if (agg === null || agg.totalWeight === 0) return null;
    return agg.sum / agg.totalWeight;
  });

  const sentimentArc = [];
  let failedCount = 0;
  eligible.forEach((e, k) => {
    const valence = rawResults[k] ?? 0;
    const hadChunks = chunkCounts[k];
    const hadSuccess = successfulChunkCounts[k];
    const failed = hadSuccess === 0 && hadChunks > 0;
    if (failed) failedCount++;
    const label = valence > 0.05 ? 'POS' : valence < -0.05 ? 'NEG' : 'NEU';
    sentimentArc.push({
      blockId: blockIds[e.idx],
      blockIndex: blockIndices[e.idx],
      blockType: blockTypes[e.idx],
      label,
      valence: Math.round(valence * 1000) / 1000,
      chunkCount: hadChunks,
      successfulChunks: hadSuccess,
      failed
    });
  });

  if (sentimentArc.length === 0) {
    self.postMessage({
      type: 'SENTIMENT_RESULT', requestId,
      sentimentArc: [], engagementScore: 0, emotionalMomentum: 0, tonalJumps: [],
      processing: { totalBlocks: texts.length, eligibleBlocks: eligible.length, successfulBlocks: 0, failedBlocks: eligible.length }
    });
    return;
  }

  const valences = sentimentArc.map(p => p.valence);

  // --- Engagement: min(1, varianza*2 + |media|*0.5) (§7.6) ---
  const mean = valences.reduce((a, b) => a + b, 0) / (valences.length || 1);
  const variance = valences.reduce((s, v) => s + (v - mean) ** 2, 0) / (valences.length || 1);
  const engagementScore = Math.min(1, variance * 2 + Math.abs(mean) * 0.5);

  // --- Momentum: media(último tercio) − media(primer tercio) (§7.6) ---
  const third = Math.max(1, Math.floor(valences.length / 3));
  const firstThird = valences.slice(0, third);
  const lastThird = valences.slice(-third);
  const meanF = firstThird.reduce((a, b) => a + b, 0) / (firstThird.length || 1);
  const meanL = lastThird.reduce((a, b) => a + b, 0) / (lastThird.length || 1);
  const emotionalMomentum = Math.round((meanL - meanF) * 1000) / 1000;

  // --- Saltos tonales (§7.6.1, umbrales VADER) ---
  const tonalJumps = [];
  for (let i = 1; i < sentimentArc.length; i++) {
    const delta = Math.abs(sentimentArc[i].valence - sentimentArc[i - 1].valence);
    // Detección mínima |Δ| ≥ 0.25.
    // [INFERIDO VADER: neutral→"okay"=0.225 redondeado]
    if (delta >= 0.25) {
      let severity;
      // Bandas VADER normalizadas:
      //   bajo: 0.25–0.50 (neutral→"good"=0.475)
      //   medio: 0.50–0.75 (neutral→"great"/"horrible"=0.775/0.625)
      //   alto: ≥0.75 (cambio de signo con intensidad)
      if (delta >= 0.75) severity = 'high';
      else if (delta >= 0.50) severity = 'medium';
      else severity = 'low';
      tonalJumps.push({
        fromBlock: sentimentArc[i - 1].blockIndex,
        toBlock: sentimentArc[i].blockIndex,
        fromLabel: sentimentArc[i - 1].label,
        toLabel: sentimentArc[i].label,
        deltaValence: Math.round(delta * 1000) / 1000,
        severity
      });
    }
  }

  self.postMessage({
    type: 'SENTIMENT_RESULT',
    requestId,
    sentimentArc,
    engagementScore: Math.round(engagementScore * 1000) / 1000,
    emotionalMomentum,
    tonalJumps,
    processing: {
      totalBlocks: texts.length,
      eligibleBlocks: eligible.length,
      successfulBlocks: eligible.length - failedCount,
      failedBlocks: failedCount
    }
  });
}

/* ============================================================
   Router de mensajes
   ============================================================ */
self.onmessage = async ({ data }) => {
  try {
    switch (data.type) {
      case 'INIT':
        await init();
        break;
      case 'SENTIMENT':
        await sentiment(data);
        break;
      default:
        self.postMessage({ type: 'ERROR', requestId: data.requestId, message: 'Tipo desconocido: ' + data.type });
    }
  } catch (error) {
    self.postMessage({ type: 'ERROR', requestId: data.requestId, message: error.message || 'Error en sentiment-worker' });
  }
};
