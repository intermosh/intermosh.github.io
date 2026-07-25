/* sentiment-engine.js — Lógica PURA del arco emocional (ENGINE combined-2.0).
   Rescata de arena: chunking por oraciones para bloques largos.
   Corrige de arena: promedio PONDERADO por longitud (sus chunks chicos pesaban
   igual que los grandes) y NO descarta la cola sin puntuación final (su regex
   perdía el punchline del bloque).
   Corrige de mimo: sin NEU-0 fabricado — un fallo es "sin dato" (N/D),
   excluido de agregados pero VISIBLE en el arco (nunca desaparece en
   silencio ni se inventa).
   LÓGICA PURA: testeable en Node (ver tests/run-tests.mjs). Importable
   desde el worker (patrón D3, igual que retention-engine.js). */

import { sanitizeSentimentText } from './ai-shared.js';

export const SENTIMENT_CONFIG = {
  MAX_CHUNK_WORDS: 200,   // empaquetado de oraciones por chunk (rescue arena)
  LONG_SENTENCE_WORDS: 150, // corte duro de oraciones monstruosas sin puntuación
  JUMP_DETECT: 0.25,      // |Δ| mínimo para registrar salto tonal
  JUMP_MEDIUM: 0.50,
  JUMP_HIGH: 0.75
};

/* ============================================================
   chunkTextForSentiment — RESCATE arena con 2 fixes:
   1. La cola final SIN puntuación se conserva (arena la descartaba).
   2. Los chunks devueltos llevan su peso en palabras para el promedio
      ponderado (arena promediaba sin ponderar: sesgo hacia la cola).
   ============================================================ */
export function chunkTextForSentiment(text) {
  const t = (text || '');
  if (!t.trim()) return [];
  // Oraciones CON puntuación + cola final sin puntuación (fix arena)
  let sentences = t.match(/[^.!?]+[.!?]+|[^.!?]+$/g);
  if (!sentences) sentences = [t];

  const finalSentences = [];
  for (const s of sentences) {
    const words = s.trim().split(/\s+/).filter(Boolean);
    if (words.length > SENTIMENT_CONFIG.MAX_CHUNK_WORDS) {
      // Oración monstruosa sin puntuación: corte duro
      for (let i = 0; i < words.length; i += SENTIMENT_CONFIG.LONG_SENTENCE_WORDS) {
        finalSentences.push(words.slice(i, i + SENTIMENT_CONFIG.LONG_SENTENCE_WORDS).join(' '));
      }
    } else if (words.length) {
      finalSentences.push(s);
    }
  }

  const chunks = [];
  let currentChunk = '';
  let currentWords = 0;
  for (const sentence of finalSentences) {
    const words = sentence.trim().split(/\s+/).filter(Boolean).length;
    if (currentWords + words > SENTIMENT_CONFIG.MAX_CHUNK_WORDS && currentChunk) {
      chunks.push({ text: currentChunk.trim(), words: currentWords });
      currentChunk = sentence;
      currentWords = words;
    } else {
      currentChunk = currentChunk ? currentChunk + ' ' + sentence : sentence;
      currentWords += words;
    }
  }
  if (currentChunk.trim()) chunks.push({ text: currentChunk.trim(), words: currentWords });
  return chunks;
}

/* ============================================================
   aggregateBlockValence — promedio PONDERADO por palabras (fix arena).
   chunks: [{valence, words}] con solo los chunks exitosos.
   Devuelve null si no hay chunks exitosos (el bloque queda N/D).
   ============================================================ */
export function aggregateBlockValence(chunks) {
  const ok = (chunks || []).filter(c => c && typeof c.valence === 'number' && Number.isFinite(c.valence));
  if (!ok.length) return null;
  const totalWords = ok.reduce((s, c) => s + (c.words || 1), 0);
  const sum = ok.reduce((s, c) => s + c.valence * (c.words || 1), 0);
  return sum / (totalWords || 1);
}

/* ============================================================
   buildSentimentResult — construye el payload final.
   entries: [{blockId, blockIndex, blockType, text}]  (ya sanitizados y elegibles)
   outcomes[i]: {chunks: [{valence, words}] | null, failed: boolean}
   - Bloque con outcome.failed → punto N/D en el arco (valence: null),
     EXCLUIDO de engagement/momentum/saltos (missing ≠ 0).
   - Saltos tonales: entre puntos disponibles consecutivos del arco
     (si falta el del medio, se compara con el anterior disponible).
   ============================================================ */
export function buildSentimentResult({ entries, outcomes }) {
  const sentimentArc = entries.map((e, i) => {
    const o = outcomes[i] || { failed: true };
    const valence = aggregateBlockValence(o.chunks);
    const failed = valence === null;
    return {
      blockId: e.blockId,
      blockIndex: e.blockIndex,
      blockType: e.blockType,
      label: failed ? 'N/D' : (valence > 0.05 ? 'POS' : valence < -0.05 ? 'NEG' : 'NEU'),
      valence: failed ? null : Math.round(valence * 1000) / 1000,
      failed,
      chunks: (o.chunks || []).length
    };
  });

  const available = sentimentArc.filter(p => !p.failed);
  const valences = available.map(p => p.valence);
  const failedBlocks = sentimentArc.length - available.length;

  if (!valences.length) {
    return {
      sentimentArc,
      engagementScore: 0,
      emotionalMomentum: 0,
      tonalJumps: [],
      processing: {
        totalBlocks: entries.length,
        eligibleBlocks: entries.length,
        successfulBlocks: 0,
        failedBlocks
      }
    };
  }

  // Engagement: min(1, varianza*2 + |media|*0.5) (§7.6) — sobre disponibles
  const mean = valences.reduce((a, b) => a + b, 0) / valences.length;
  const variance = valences.reduce((s, v) => s + (v - mean) ** 2, 0) / valences.length;
  const engagementScore = Math.min(1, variance * 2 + Math.abs(mean) * 0.5);

  // Momentum: media(último tercio) − media(primer tercio) (§7.6) — sobre disponibles
  const third = Math.max(1, Math.floor(valences.length / 3));
  const firstThird = valences.slice(0, third);
  const lastThird = valences.slice(-third);
  const meanF = firstThird.reduce((a, b) => a + b, 0) / firstThird.length;
  const meanL = lastThird.reduce((a, b) => a + b, 0) / lastThird.length;
  const emotionalMomentum = Math.round((meanL - meanF) * 1000) / 1000;

  // Saltos tonales (§7.6.1) — entre DISPONIBLES consecutivos (no se inventan
  // saltos contra puntos N/D)
  const tonalJumps = [];
  for (let i = 1; i < available.length; i++) {
    const delta = Math.abs(available[i].valence - available[i - 1].valence);
    if (delta >= SENTIMENT_CONFIG.JUMP_DETECT) {
      const severity = delta >= SENTIMENT_CONFIG.JUMP_HIGH ? 'high'
        : delta >= SENTIMENT_CONFIG.JUMP_MEDIUM ? 'medium' : 'low';
      tonalJumps.push({
        fromBlock: available[i - 1].blockIndex,
        toBlock: available[i].blockIndex,
        fromLabel: available[i - 1].label,
        toLabel: available[i].label,
        deltaValence: Math.round(delta * 1000) / 1000,
        severity
      });
    }
  }

  return {
    sentimentArc,
    engagementScore: Math.round(engagementScore * 1000) / 1000,
    emotionalMomentum,
    tonalJumps,
    processing: {
      totalBlocks: entries.length,
      eligibleBlocks: entries.length,
      successfulBlocks: available.length,
      failedBlocks
    }
  };
}
