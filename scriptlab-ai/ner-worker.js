/* ner-worker.js — Reconocimiento de Entidades Nombradas para ScriptLab Pro
   Modelo: Xenova/PlanTL-GOB-ES-roberta-base-bne-capitel-ner
   
   No wireado todavía. La UI no lo instancia ni tiene pestaña propia.
   Ver README para plan de activación futura.
   Se conserva fuera del cache del Service Worker para no consumir
   banda ni almacenamiento hasta que se decida activarlo. */
import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';
env.useBrowserCache = true;
env.allowRemoteModels = true;

let ner = null;
const MODEL_ID = 'Xenova/PlanTL-GOB-ES-roberta-base-bne-capitel-ner';

async function loadNER() {
  if (ner) return ner;
  ner = await pipeline('token-classification', MODEL_ID, {
    device: 'wasm',
    dtype: 'q4',
    aggregation_strategy: 'simple',
    progress_callback: p => postMessage({
      type: 'PROGRESS',
      model: 'ner',
      message: p.status === 'progress'
        ? 'NER: ' + Math.round(p.progress || 0) + '%'
        : 'Preparando modelo NER...'
    })
  });
  return ner;
}

function normalizeEntity(word) {
  return word
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñ]/g, '')
    .trim();
}

const AR_HIGH_VALUE = new Set([
  'caba', 'gba', 'rosario', 'cordoba', 'mendoza', 'la plata', 'tucuman',
  'buenos aires', 'argentina', 'clarin', 'la nacion', 'infona', 'conicet',
  'anses', 'indec', 'pami', 'afip', 'banco central', 'casa rosada',
  'milei', 'massa', 'bullrich', 'stolbizer', 'schiaretti',
  'netflix', 'youtube', 'twitch', 'tiktok', 'instagram'
]);

function buildEntityChains(entitiesByBlock) {
  const map = new Map();
  entitiesByBlock.forEach((entities, blockIdx) => {
    entities.forEach(e => {
      const key = e.normalized + '|' + e.entity_group;
      if (!map.has(key)) map.set(key, { type: e.entity_group, blocks: new Set(), count: 0 });
      const entry = map.get(key);
      entry.blocks.add(blockIdx);
      entry.count++;
    });
  });

  return Array.from(map.entries())
    .filter(([, v]) => v.blocks.size >= 2)
    .map(([k, v]) => {
      const [entity, type] = k.split('|');
      const blocks = Array.from(v.blocks).sort((a, b) => a - b);
      return {
        entity,
        type,
        blocks,
        count: v.count,
        firstBlock: blocks[0],
        lastBlock: blocks[blocks.length - 1],
        coherence: v.count / (blocks[blocks.length - 1] - blocks[0] + 1)
      };
    })
    .sort((a, b) => b.coherence - a.coherence);
}

function computeLocalRelevance(entitiesByBlock) {
  let totalEntities = 0, arEntities = 0;
  entitiesByBlock.forEach(entities => {
    entities.forEach(e => {
      totalEntities++;
      if (AR_HIGH_VALUE.has(e.normalized)) arEntities++;
    });
  });
  return totalEntities > 0 ? arEntities / totalEntities : 0;
}

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'INIT') {
      await loadNER();
      postMessage({ type: 'READY', model: 'ner' });
      return;
    }

    if (data.type === 'NER') {
      const allResults = [];
      for (let i = 0; i < data.texts.length; i++) {
        const text = data.texts[i];
        if (!text || text.length < 10) { allResults.push([]); continue; }
        const entities = await ner(text);
        const enriched = entities.map(e => ({
          ...e,
          blockIndex: i,
          normalized: normalizeEntity(e.word, e.entity_group)
        }));
        allResults.push(enriched);
      }

      const chains = buildEntityChains(allResults);
      const localRelevanceAR = computeLocalRelevance(allResults);

      postMessage({
        type: 'NER_RESULT',
        requestId: data.requestId,
        entitiesByBlock: allResults,
        entityChains: chains,
        localRelevanceAR
      });
    } else {
      postMessage({ type: 'ERROR', model: 'ner', requestId: data.requestId, message: 'Tipo desconocido: ' + data.type });
    }
  } catch (e) {
    postMessage({ type: 'ERROR', model: 'ner', requestId: data.requestId, message: e.message });
  }
};