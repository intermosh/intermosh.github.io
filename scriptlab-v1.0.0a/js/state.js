/* state.js — Constantes de dominio, estado centralizado y helpers puros.
   Implementa §13.1, §4.1, §8.1, §8.2 del contrato.
   No importa de ningún módulo (§3.3). Es la hoja base del grafo de dependencias. */

/* ============================================================
   Tipos de bloque (§8.2)
   ============================================================ */
export const T = {
  HOOK:      ['Hook',        '#ff7d5c'],
  CONTEXTO:  ['Contexto',    '#69a8ff'],
  EVIDENCIA: ['Evidencia',   '#ae83ff'],
  SEGMENTO:  ['Segmento',    '#b3bdce'],
  GIRO:      ['Giro',        '#f4b857'],
  VISUAL:    ['Nota visual', '#32d2ac'],
  CTA:       ['CTA',         '#5cdb87']
};

/* Ícono de borrado (inline SVG, usado por render.js en H3). */
export const TRASH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6l1 14h10l1-14"/></svg>';

/* Versión del motor de métricas. COMBINED: ambos builds exportaban
   "version: 4" — imposible saber qué motor midió cada guion (bug B13).
   Bump SEMVER: major = cambio de escala/semántica; minor = retune de
   constantes; patch = fix sin cambio de valores esperados. */
export const ENGINE_VERSION = 'combined-2.0.0'; // PASO 3: emotionalArc→APV (E1) + CTA escalado (E2) + citas corregidas

/* Versión pública de la app (release). Distinta de ENGINE_VERSION:
   ENGINE_VERSION marca la semántica de las métricas (qué significa cada
   número y cuándo cambia); APP_VERSION marca el paquete distribuido
   (código, UI, docs). Útil para bugs y exports. */
export const APP_VERSION = '1.0.0a'; // RELEASE 2026-07-22

export const CALIBRATION_CONFIG = { MIN_SAMPLES: 5, MAX_DELTA_PCT: 8 };
export const BENCHMARK_BUCKETS = (() => {
  const out = [];
  ['long','short'].forEach(f => ['educativo','ensayo','tutorial','entretenimiento'].forEach(g => out.push({ format: f, genre: g })));
  return out;
})();
export function recalibrateBucket(realScores, format, genre, currentValue, minSamples, maxDeltaPct) {
  const samples = realScores.filter(r => r.format === format && r.genre === genre && Number.isFinite(r.real_apv_pct) && r.real_apv_pct > 0);
  if (samples.length < minSamples) return { ok: false, reason: 'Faltan ' + (minSamples - samples.length) + ' para ' + format + '+' + genre + '.', sampleCount: samples.length };
  const avgPct = samples.reduce((s, r) => s + r.real_apv_pct, 0) / samples.length;
  const deltaPct = avgPct - currentValue * 100;
  let newVal = avgPct / 100, wasCapped = false;
  if (Math.abs(deltaPct) > maxDeltaPct) { const d = deltaPct > 0 ? 1 : -1; newVal = Math.max(0.05, Math.min(0.95, currentValue + d * maxDeltaPct / 100)); wasCapped = true; }
  return { ok: true, oldValue: currentValue, newValue: newVal, sampleCount: samples.length, wasCapped, note: 'Avg ' + avgPct.toFixed(1) + '%, delta ' + (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1) + 'pp' + (wasCapped ? ' (cap ±' + maxDeltaPct + 'pp)' : '') };
}

/* ============================================================
   Catálogo de heurísticas (panel "Cómo se calculan estas métricas")
   ============================================================ */
export const HEURISTICS = [
  { name: 'Fernández-Huerta', kind: 'Validada',  formula: '206.84 − 60×sílabas/palabra − 1.02×palabras/frase. Sílabas por grupos vocálicos RAE; crudo puede ser negativo; null si <3 palabras.', source: 'Fernández-Huerta (1959), adaptación española de Flesch.' },
  { name: 'Hook',             kind: 'Heurística', formula: 'Longitud, pregunta y alineación con promesa',         source: 'Regla transparente configurable.' },
  { name: 'Ritmo visual',     kind: 'Heurística', formula: 'Notas visuales y giros por duración',                 source: 'Referencia direccional: Cutting et al. (2016).' },
  { name: 'CTA',              kind: 'Heurística', formula: 'Bonus ICN escalado: 8×(calidad/100) por posición, longitud y verbos; sin CTA real = +0.', source: 'Cambio combined-2.0 (PASO 3-E2): Wistia CTA study (mid 16.95% vs end 10.98%).' },
  { name: 'Arco emocional',   kind: 'Heurística', formula: 'Valencia robertuito por bloque de voz (sin VISUAL). Fallo = "sin dato" (no entra a agregados). Con arco disponible, alimenta el APV (peso 0.11: flips 0.4 + engagement 0.4 + momentum⁺ 0.2).', source: 'combined-1.0: missing ≠ 0. combined-2.0 (PASO 3-E1): Berger et al. 2026 JAMS; Song et al. 2023 eNeuro.' },
  { name: 'Carga cognitiva',  kind: 'Heurística', formula: 'Mayor = más pesada. WPM + temas/min + palabras/oración − descansos. Bandas: <25 Liviana, <50 Moderada, <75 Pesada, ≥75 Sobrecarga.', source: 'INFERENCIAL (Sweller 1988; Miller 1956).' }
];

/* ============================================================
   Temas predefinidos para detección de cobertura (§7.5)
   - 5 estructurales: verificación instantánea por tipo de bloque (sin IA).
   - 3 semánticos: evaluados con centroides de embeddings contra oraciones
     ejemplo en español rioplatense.
   ============================================================ */
export const PREDEFINED_TOPICS = [
  // --- 5 estructurales ---
  { label: 'Gancho (Hook)',            kind: 'structural', blockType: 'HOOK' },
  { label: 'Contexto',                  kind: 'structural', blockType: 'CONTEXTO' },
  { label: 'Evidencia',                 kind: 'structural', blockType: 'EVIDENCIA' },
  { label: 'Giro narrativo',            kind: 'structural', blockType: 'GIRO' },
  { label: 'Llamada a la acción (CTA)', kind: 'structural', blockType: 'CTA' },

  // --- 3 semánticos ---
  // Cada tema: 3 oraciones ejemplo en español rioplatense (voseo), estilo
  // narración de guion de YouTube, 12-25 palabras. El motor de cobertura
  // (H2 ai-worker DETECT_GAPS) construye un centroide por tema con los
  // embeddings de estas oraciones y lo compara contra cada bloque del guion.
  { label: 'Problema',
    kind: 'semantic',
    examples: [
      'Seguramente te pasó más de una vez que hacés todo igual y aun así los resultados no aparecen.',
      'El error más común es pensar que el problema está en un solo detalle, cuando en realidad viene de antes.',
      'Sin una estrategia clara, es muy fácil terminar dando vueltas sin avanzar.'
    ]
  },
  { label: 'Solución',
    kind: 'semantic',
    examples: [
      'La buena noticia es que hay una forma mucho más simple de resolverlo.',
      'Empecemos por el primer paso y vayamos construyendo la solución de forma ordenada.',
      'Con un par de ajustes concretos vas a notar una diferencia bastante rápido.'
    ]
  },
  { label: 'Resumen o cierre',
    kind: 'semantic',
    examples: [
      'En definitiva, identificar el problema correcto es lo que realmente cambia el resultado.',
      'Como viste, la solución no depende de un truco sino de seguir un método.',
      'Quedate con estas tres ideas porque son las que realmente hacen la diferencia.'
    ]
  }
];

/* ============================================================
   Estado centralizado (§4.1)
   Objeto mutable compartido. No hay pub-sub (lección de v18).
   Las mutaciones llaman explícitamente a render() o funciones de render.
   ============================================================ */
export const state = {
  // Proyecto activo
  p: null,                  // Project normalizado (§8.1)
  sel: null,                // BlockId seleccionado

  // Flags de render
  flowDirty: true,          // ¿re-renderizar la lista de bloques?
  analysisDirty: true,      // ¿recalcular ICN cacheado?
  cachedAnalysis: null,     // memo del último analysis()

  // Workers + banderas (las refs se crean en H2 workers.js; state.js no crea workers)
  worker: null,
  retentionWorker: null,
  sentimentWorker: null,
  sentimentReady: false,
  modelsReady: false,
  mode: 'heuristic',       // estado operativo global: heuristic | ia
  rev: 0,                   // contador de revisiones (invalidate worker)

  // Resultados de análisis
  aiResult: null,           // { alignment, redundancy, baseline, ... }
  retentionResult: null,    // { overallRetention, confidence, curve, scores, ... }
  sentimentResult: null,    // { sentimentArc, engagementScore, emotionalMomentum, ... }
  redundancyResult: null,   // { redundantPairs, contrastPairs, density, ... } (on-demand)
  deepResult: null,         // bundle de resultados del tier 2 (ideas, ritmo, cobertura)

  // Calibración
  calRecords: [],
  realScores: [],
  activeBenchmarks: {},
  recabHistory: [],

  // Misc
  timer: null,              // debounce de save
  aiTimer: null,            // debounce de scheduleAI
  tts: { index: 0, playing: false, paused: false },
  paletteDragType: null,
  densityChartInstance: null,
  retentionChartInstance: null,
  analysisRequestId: 0,
  sentimentRequestId: 0,   // COMBINED: contadores dedicados por canal
  retentionRequestId: 0,   // (antes uno compartido: races + respuestas
  embedRequestId: 0,       // descartadas entre workers)
  analysisCallbacks: {}     // mapa requestId → { resolve, reject }
};

/* ============================================================
   Normalización de proyecto (§8.1)
   Acepta formato legacy { project:{...}, blocks:[...] } y plano {...}.
   ============================================================ */
export function normalizeProject(raw = {}) {
  const meta = raw.project || raw;
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  return {
    id: 'active',
    title: meta.title || 'Nuevo guion',
    promise: meta.promise || '',
    targetDuration: Math.max(0, Math.min(3600, Number(meta.targetDuration) || 0)),
    format: ['long','short'].includes(meta.format) ? meta.format : 'long',
    genre: ['educativo','ensayo','tutorial','entretenimiento'].includes(meta.genre) ? meta.genre : 'educativo',
    aiMode: ['basic', 'embeddings'].includes(meta.aiMode) ? meta.aiMode : 'basic',
    blocks: blocks.map(b => {
      const blockType = T[b.type] ? b.type : 'SEGMENTO';
      // Fallback UUID para browsers sin crypto.randomUUID (Safari <15.4, Chrome <92)
      const id = b.id || (typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9));
      return {
        id,
        type: blockType,
        label: b.label || T[blockType][0],
        content: b.content || '',
        notes: b.notes || ''
      };
    }),
    updatedAt: meta.updatedAt || Date.now(),
    wpm: Math.max(115, Math.min(185, Number(meta.wpm) || 150))
  };
}

/* Marca el análisis como sucio y limpia el memo (§4.2). */
export function markAnalysisDirty() {
  state.analysisDirty = true;
  state.cachedAnalysis = null;
}

/* ============================================================
   FNV-1a hash → base36 (para claves de cache de análisis, §8.4)
   ============================================================ */
export function contentHash(value) {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

/* ============================================================
   Helpers puros de formato
   ============================================================ */
export const time = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
export const esc = s => String(s || '').replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));
