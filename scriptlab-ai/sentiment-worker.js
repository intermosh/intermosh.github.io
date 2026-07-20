/* sentiment-worker.js — Análisis de sentimiento para retención
   Modelo: Xenova/robertuito-sentiment-analysis
   Base: pysentimiento/robertuito-sentiment-analysis (RoBERTuito, español)
   Cuantizado ONNX para transformers.js (~50-60 MB)
   
   Fuente PRIMARIA: Pérez, J.M. et al. (2022). "pysentimiento: A Python
   Toolkit for Sentiment Analysis and SocialNLP tasks." LREC 2022.
   arxiv:2106.09462
   
   Fuente PRIMARIA: Cañete, J. et al. (2022). "RoBERTuito: A pre-trained
   language model for social media text in Spanish." LREC 2022.
   ==================================================================== */

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';
env.useBrowserCache = true;
env.allowRemoteModels = true;

let sentiment = null;
const MODEL_ID = 'Xenova/robertuito-sentiment-analysis';

/* Sanitización agresiva: el tokenizer de robertuito (RoBERTa) falla con
   caracteres fuera del vocabulario BPE. Mantenemos solo texto latino
   imprimible, números y puntuación básica. */
function sanitizeText(text) {
  if (!text || typeof text !== 'string') return 'texto';
  let s = text
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')   // control chars
    .replace(/[\u200B-\u200F\u2028-\u202F\u2060-\u2064\uFEFF]/g, '') // zero-width, bidi, LS/PS
    .replace(/[\uD800-\uDFFF]/g, '')                    // surrogates sueltos
    .replace(/[\uE000-\uF8FF]/g, '')                    // private use
    .replace(/[\uFFFE\uFFFF\uFFF0-\uFFFD]/g, '')        // specials
    .replace(/[\u{10000}-\u{10FFFF}]/gu, '')             // todo fuera de BMP (emoji, símbolos)
    .replace(/[\u2600-\u27BF]/g, '')                     // misc symbols
    .replace(/[\uFE00-\uFE0F]/g, '')                     // variation selectors
    .replace(/[^\x20-\x7E\u00A0-\u024F\u1E00-\u1EFF\u00C0-\u00FF\u0100-\u017F]/g, '') // latin imprimible
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > 3 ? s : 'texto';
}

async function loadSentiment() {
  if (sentiment) return sentiment;
  sentiment = await pipeline('text-classification', MODEL_ID, {
    device: 'wasm',
    dtype: 'q8',
    topk: 3,
    progress_callback: p => postMessage({
      type: 'PROGRESS',
      model: 'sentiment',
      message: p.status === 'progress'
        ? 'Sentimiento: ' + Math.round(p.progress || 0) + '%'
        : 'Preparando modelo de sentimiento...'
    })
  });
  return sentiment;
}

function detectTonalJumps(arc) {
  const jumps = [];
  for (let i = 1; i < arc.length; i++) {
    const delta = Math.abs(arc[i].valence - arc[i - 1].valence);
    if (delta >= 0.3) {
      jumps.push({
        fromBlock: arc[i - 1].blockIndex,
        toBlock: arc[i].blockIndex,
        deltaValence: delta,
        fromLabel: arc[i - 1].label,
        toLabel: arc[i].label,
        severity: delta >= 0.7 ? 'high' : delta >= 0.5 ? 'medium' : 'low'
      });
    }
  }
  return jumps;
}

function computeEngagement(arc) {
  if (arc.length < 2) return 0.5;
  const valences = arc.map(a => a.valence);
  const mean = valences.reduce((a, b) => a + b, 0) / valences.length;
  const variance = valences.reduce((s, v) => s + (v - mean) ** 2, 0) / valences.length;
  const magnitude = Math.abs(mean);
  return Math.min(1, (variance * 2) + (magnitude * 0.5));
}

function computeCTAScore(arc, blockTypes) {
  const ctaIdx = blockTypes.findIndex(t => t === 'CTA');
  if (ctaIdx === -1 || ctaIdx >= arc.length) return 0;
  const cta = arc[ctaIdx];
  return cta.allScores.POS * 0.6 + cta.allScores.NEG * 0.4;
}

function computeMomentum(arc) {
  if (arc.length < 2) return 0;
  const first = arc.slice(0, Math.ceil(arc.length / 3));
  const last = arc.slice(Math.floor(arc.length * 2 / 3));
  const firstAvg = first.reduce((s, a) => s + a.valence, 0) / first.length;
  const lastAvg = last.reduce((s, a) => s + a.valence, 0) / last.length;
  return lastAvg - firstAvg;
}

/* Procesa textos de a uno con try/catch para que un texto problemático
   no tumbe todo el análisis. Devuelve null para textos que fallan. */
async function safeClassify(text) {
  try {
    const clean = sanitizeText(text);
    if (clean.length < 2) return null;
    const result = await sentiment(clean);
    return result;
  } catch (e) {
    return null;
  }
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'INIT') {
      await loadSentiment();
      postMessage({ type: 'READY', model: 'sentiment' });
      return;
    }

    if (data.type === 'SENTIMENT') {
      const rawTexts = data.texts || [];
      const results = [];

      /* Procesar uno por uno con fallback seguro */
      for (let i = 0; i < rawTexts.length; i++) {
        const text = rawTexts[i];
        if (!text || text.length < 5) {
          results.push(null);
          continue;
        }
        const r = await safeClassify(text);
        results.push(r);
      }

      const arc = [];
      results.forEach((r, idx) => {
        if (!r) return;
        const scores = { POS: 0, NEG: 0, NEU: 0 };
        r.forEach(x => { scores[x.label] = x.score; });
        const top = r[0];
        arc.push({
          blockIndex: data.blockIndices[idx],
          blockId: data.blockIds[idx],
          label: top.label,
          score: top.score,
          valence: scores.POS - scores.NEG,
          allScores: scores
        });
      });

      const jumps = detectTonalJumps(arc);
      const engagement = computeEngagement(arc);
      const ctaScore = computeCTAScore(arc, data.blockTypes || []);
      const momentum = computeMomentum(arc);

      postMessage({
        type: 'SENTIMENT_RESULT',
        requestId: data.requestId,
        sentimentArc: arc,
        tonalJumps: jumps,
        engagementScore: engagement,
        ctaEmotionalScore: ctaScore,
        emotionalMomentum: momentum
      });
    } else {
      postMessage({
        type: 'ERROR',
        model: 'sentiment',
        requestId: data.requestId,
        message: 'Tipo desconocido: ' + data.type
      });
    }
  } catch (e) {
    postMessage({
      type: 'ERROR',
      model: 'sentiment',
      requestId: data.requestId,
      message: e.message
    });
  }
};
