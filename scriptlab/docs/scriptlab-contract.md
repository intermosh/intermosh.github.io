# ScriptLab — Contrato Técnico Definitivo

**Versión:** 5.1
**Fecha:** 2026-07-25
**Estado:** Documento único y definitivo. STABLE RELEASE v1.0.1. No existen versiones anteriores. Este documento describe la aplicación tal como existe hoy.

> Durante el estado STABLE RELEASE v1.0.1 no se agregan funcionalidades ni dependencias. Solo se aceptan correcciones críticas, regresiones, compatibilidad de navegador y actualizaciones documentales que no cambien el comportamiento.

---

## 0. Para cualquier IA que lea esto

Este documento es la **única fuente de verdad** sobre la arquitectura, decisiones, reglas y estado actual de ScriptLab. Antes de tocar código:

1. **Leé todo.** No saltear secciones.
2. **No inventes.** Si algo no está acá, preguntá antes de asumir.
3. **No parchees.** Si encontrás un bug, entendé la causa raíz antes de tocar.
4. **Cita tus fuentes.** Cada número en el motor debe tener una cita de dónde sale.
5. **Respeta las reglas epistémicas (§15).** Nunca presentes un número heurístico como validado.
6. **No agregues dependencias externas** sin aprobación explícita del humano.

---

## 1. Qué es ScriptLab

ScriptLab es una aplicación web (vanilla JS, ES modules, sin framework ni build step) que orienta la escritura de guiones de YouTube mediante **métricas analíticas locales**. El usuario escribe bloques de guion; ScriptLab mide calidad narrativa y proyecta retención.

**No es generativo.** No sugiere, no autocompleta, no reescribe. El sistema **mide**, el humano **escribe**.

Todo el cómputo (heurísticas, embeddings, sentimiento, retención) se ejecuta en el navegador del usuario. Ningún texto sale del dispositivo.

---

## 2. Arquitectura

### 2.1 Sistema de módulos

**ES modules** con `import`/`export`. Punto de entrada: `<script type="module" src="./main.js">`.

La app se sirve vía `http(s)` o `localhost`. **No soporta `file://`** porque Chromium bloquea los `import` de ES modules por CORS.

### 2.2 Grafo de dependencias

```
scriptlab.html
  └─ main.js (type=module) — bootstrap + binding + análisis on-demand
       ├─ state.js        — constantes + estado + helpers + calibración
       ├─ db.js           — IndexedDB (CRUD + migración)
       ├─ scoring.js      — motor ICN puro (sin DOM)
       │    └─ ai-shared.js
       ├─ workers.js      — orquestación Web Workers + DI de render
       │    └─ db.js, scoring.js
       ├─ render.js       — TODO el DOM + gráficos SVG + incrementalidad
       │    └─ state.js, scoring.js, ai-shared.js, db.js, workers.js, retention-engine.js
       ├─ export-import.js
       └─ retention-engine.js (importado por render.js para cognitive load)

Web Workers:
  ai-worker.js        — embeddings (multilingual-e5-small)
       └─ ai-shared.js
  sentiment-worker.js — sentimiento (robertuito-sentiment-analysis)
  retention-worker.js — wrapper de retention-engine.js
```

### 2.3 Reglas de dependencias (inviolables)

- `js/scoring.js` **no referencia** `document` ni `window`. Es pura y testeable.
- `js/workers.js` **no importa** `js/render.js`. Render se inyecta vía `setRenderCallbacks()`.
- `js/state.js` **no importa** de nadie.
- `js/db.js` no depende de módulos de dominio.
- `js/main.js` es el único que orquesta a todos.

### 2.4 Inyección de dependencias

`js/workers.js` no conoce las funciones de render. `js/render.js` se registra al cargar:

```js
setRenderCallbacks(renderMetrics, renderRetentionPanel, renderSentimentArc);
```

Los workers llaman los callbacks cuando hay resultados. Esto rompe el ciclo worker↔render.

---

## 3. Estado centralizado

Un único objeto `state` exportado desde `js/state.js`. No hay pub-sub. Mutación directa + llamadas explícitas a render.

```js
export const state = {
  p: null,                  // proyecto activo
  sel: null,                // bloque seleccionado
  flowDirty: true,          // ¿re-renderizar lista de bloques?
  analysisDirty: true,      // ¿recalcular ICN?
  cachedAnalysis: null,     // memo
  worker: null,             // ai-worker
  retentionWorker: null,
  sentimentWorker: null,
  sentimentReady: false,
  modelsReady: false,
  mode: 'heuristic' | 'ia', // estado operativo global
  rev: 0,                   // revisiones (solo INIT)
  aiResult: null,           // embeddings: {alignment, redundancy, baseline}
  retentionResult: null,    // retención: {overallRetention, confidence, curve, scores}
  sentimentResult: null,    // {sentimentArc, engagementScore, emotionalMomentum, tonalJumps}
  redundancyResult: null,
  deepResult: null,         // invalidación tier 2
  calRecords: [],
  realScores: [],           // métricas reales de YouTube
  activeBenchmarks: {},     // benchmarks calibrados por bucket
  recabHistory: [],
  timer: null, aiTimer: null,
  tts: { index: 0, playing: false, paused: false },
  paletteDragType: null,
  analysisRequestId: 0,
  analysisCallbacks: {}
};
```

---

## 4. Modelo de datos

### 4.1 Proyecto

```js
{
  id: 'active',
  title: string,
  promise: string,
  targetDuration: number,    // 0–3600 s | 0 = sin objetivo
  format: 'long' | 'short',
  genre: 'educativo' | 'ensayo' | 'tutorial' | 'entretenimiento',
  aiMode: 'basic' | 'embeddings',
  wpm: number,               // 115–185
  blocks: Block[],
  updatedAt: number,
  lastSnapshotAt?: number
}
```

### 4.2 Bloque

```js
{
  id: string (crypto.randomUUID),
  type: 'HOOK' | 'CONTEXTO' | 'EVIDENCIA' | 'SEGMENTO' | 'GIRO' | 'VISUAL' | 'CTA',
  label: string,
  content: string,
  notes: string
}
```

### 4.3 Tipos de bloque (constante `T`)

| Tipo | Color | Rol |
|---|---|---|
| HOOK | #ff7d5c | Apertura |
| CONTEXTO | #69a8ff | Antecedentes |
| EVIDENCIA | #ae83ff | Datos/respaldo |
| SEGMENTO | #b3bdce | Desarrollo neutro |
| GIRO | #f4b857 | Pattern interrupt |
| VISUAL | #32d2ac | Nota visual (no se narra) |
| CTA | #5cdb87 | Cierre/acción |

### 4.4 Registro real (calibración)

```js
{
  id: string,
  logged_at: ISO string,
  video_title: string,
  format: 'long' | 'short',
  genre: string,
  duration_sec: number,
  real_apv_pct: number,
  predicted_apv_pct: number | null
}
```

---

## 5. IndexedDB

DB: `scriptlab-ai`, schema **v5**.

| Store | keyPath | Contenido |
|---|---|---|
| `projects` | `id` | Proyecto activo (singleton `id:'active'`) |
| `snapshots` | `id` | Snapshots automáticos cada 30 min |
| `calibrations` | `id` | Calibraciones legacy (formato viejo) |
| `realScores` | `id` | Métricas reales de YouTube |
| `benchmarks` | `id` | Benchmarks calibrados (`id:'active'`) + historial |
| `settings` | `id` | Preferencias |
| `analysisCache` | `id` | Cache de resultados IA por hash |
| `modelRegistry` | `id` | Metadata de modelos |

---

## 6. Modelo de cómputo (2 tiers)

### Tier 1 — Tiempo real (automático)

Se recalcula al escribir (debounce 700ms para workers).

| Métrica | Cómo | Hilo |
|---|---|---|
| ICN (Salud) | `analysis()` síncrono | main |
| Carga cognitiva | `analyzeCognitiveLoad()` | main |
| Retención + curva | `scheduleRetention()` | retention-worker |
| Estructura | chequeo de tipos de bloque | main |
| Alineación + redundancia baseline | `scheduleAI()` | ai-worker |
| Arco emocional | `scheduleSentiment()` | sentiment-worker |

### Tier 2 — On-demand ("Analizar a fondo")

Solo IA. Botón único. `Promise.allSettled` con 4 análisis en paralelo:
- Repetición (con contrastes)
- Ideas centrales
- Ritmo de temas
- Cobertura semántica

**Invalidación:** al editar/importar/nuevo → `state.deepResult = null` → el indicador muestra "contenido cambió".

### IDs de mensajes

Para evitar Data Races (condiciones de carrera) entre los modelos asíncronos y la escritura del usuario, los Web Workers usan canales de ID independientes: `state.sentimentRequestId`, `state.retentionRequestId` y `state.embedRequestId`. Cada respuesta entrante valida el ID contra el estado actual.

---

## 7. Métricas: especificación con fuentes

### 7.1 Salud del guion (ICN)

```
ICN = hs·0.31 + cl·0.22 + pa·0.22 + pr·0.17 + (CTA ? 8 : 0)
```

| Factor | Qué mide | Fuente |
|---|---|---|
| Hook (hs) | Longitud óptima, pregunta, números, alineación con promesa, urgencia. Hook implícito ×0.7. | Heurística interna |
| Claridad (cl) | Fernández-Huerta (1959). Penaliza bidireccional: ni muy difícil ni infantil. | **Fernández-Huerta (1959)** [PRIMARIA fórmula] |
| Ritmo (pa) | Visuales/giros + varianza de longitud de oraciones (CV óptimo 0.3–1.0). | Heurística |
| Promesa (pr) | Solapamiento léxico hook↔promesa. | Heurística |

**Calibración con datos reales:** si ≥5 registros, `ICN_calibrado = rawIcn·0.7 + APV_promedio·0.3`.

### 7.2 Retención estimada (APV)

```
APV = clamp[15, 95] ( Σ score_i · weight_norm_i )
```

**Pesos recalibrados con research** (cada peso con cita inline en el código):

| Sub-score | Peso | Fuente |
|---|---|---|
| Hook strength | 0.25 | PrePublish 2026; Think with Google 2024; Backlinko [SECUNDARIA convergente] |
| Pacing | 0.17 | Seidel (2024) Springer [PRIMARIA] |
| Pattern interrupts | 0.14 | Kahneman (1973); Sokolov (1963) [PRIMARIA teoría] |
| Content density | 0.11 | Miller (1956); Sweller (1988) [PRIMARIA] |
| Promise delivery | 0.09 | RetentionRabbit 2025 [SECUNDARIA correlacional] |
| Readability | 0.07 | Fernández-Huerta (1959) [PRIMARIA fórmula] |
| CTA placement | 0.03 | ClixieAI 2025; Wistia [SECUNDARIA indirecta] |
| Narrative | 0.03 | Song et al. (2023) eNeuro; Booker (2004) [PRIMARIA] |

> `emotionalArc: 0.11` está definido en `WEIGHTS` pero **requiere sentiment** (solo Modo IA). En el engine se normalizan los 8 pesos a 1.00 dividiendo por su suma (0.89). Cuando se integre sentiment en el retention worker, se sumará el 9° factor.

**Curva de retención:** SVG inline. Baseline Wistia 2025 / RetentionRabbit 2025. Modificadores por bloque:
- Pattern interrupt (GIRO/VISUAL): boost determinista con habituation. `baseBoost=0.05 × 1/log2(n+1)`. [Wistia 15-22% spike; Sokolov 1963 habituation; Rankin et al. 2009]
- Bloque >50s: −0.04; >80s: −0.06 adicional
- Hook fuerte en bloque 0: +0.05
- CTA: +0.03
- Bloque vacío: −0.15
- `isDropRisk` cuando retention < 0.35

> **Bug crítico corregido:** el boost de pattern interrupt usaba `Math.random()` (no determinista). Reemplazado por fórmula determinista con habituation logarítmica.

**Confianza:** `min(0.85, 0.3 + contentBlocks·0.05)`.

### 7.3 Carga cognitiva (Miller 1956 + Sweller 1988)

4 sub-métricas:
1. **Speaking pace:** WPM real vs benchmark 130 WPM [Faculty eCommons 2025 "780-word rule"]
2. **Information density:** temas/min. En IA, los segmentos consecutivos se comparan con un umbral adaptativo `media − 1σ`; si hay contenido se cuenta al menos un tema estimado para evitar un cero aislado. En heurístico se usa overlap léxico <15% = tema nuevo [Miller 7±2 chunks]
3. **Sentence load:** palabras promedio por oración [Sweller CLT]
4. **Rest points:** ratio de VISUAL/GIRO como descansos cognitivos [Sweller: segmentación reduce overload]

Score 0-100: ≥75 Liviana, ≥50 Moderada, ≥30 Pesada, <30 Sobrecarga.

### 7.4 Arco emocional (sentiment)

**Modelo:** robertuito-sentiment-analysis. Umbrales de salto tonal basados en VADER:

| Banda | \|Δvalencia\| | Severidad |
|---|---|---|
| Detección mínima | ≥ 0.25 | umbral |
| Bajo | 0.25 – 0.50 | bajo |
| Medio | 0.50 – 0.75 | medio |
| Alto | ≥ 0.75 | alto |

> Inferido de VADER (Hutto & Gilbert 2014, ICWSM), escala −4..+4 trasladada a −1..+1 (÷4, lineal).

### 7.5 Calibración con datos reales

Sistema de **buckets** (formato × género = 8 pares). Cada bucket:
- Acumula registros reales de YouTube Studio
- Con ≥5 registros → botón "Recalibrar"
- Recalibración: promedio real con cap ±8pp
- Persiste en `benchmarks` store + historial append-only

`CALIBRATION_CONFIG = { MIN_SAMPLES: 5, MAX_DELTA_PCT: 8 }`

Función pura: `recalibrateBucket(realScores, format, genre, currentValue, minSamples, maxDeltaPct)`.

---

## 8. Modos de IA

| Modo | Modelos | Tamaño | Activación |
|---|---|---|---|
| **Heurístico** (default) | ninguno | 0 | Arranque automático |
| **Modo IA** | embeddings + sentiment | ~110 MB | Usuario activa en ⚙ → verificación de IndexedDB/Cache Storage → descarga si falta → activación tras READY de ambos modelos |

### Carga de transformers.js (regla fijada — 5 intentos documentados)

```js
// En el worker:
const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';
async function loadExtractor() {
  const { pipeline, env } = await import(TRANSFORMERS_URL);
  env.useBrowserCache = true;
  env.allowRemoteModels = true;
  return await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', { device: 'wasm', progress_callback });
}
```

**Reglas:**
1. Import **dinámico** (`await import()`), no estático (Chromium rechaza workers con import estático cross-origin).
2. **Bare URL sin path** (jsdelivr resuelve vía `browser` del package.json).
3. **NO usar** `/dist/transformers.min.mjs` (build Node crudo, importa `fs`/`path`).
4. **NO usar** import maps del documento padre (Chromium no los hereda en module Workers).
5. `env.allowRemoteModels = true` (NO `allowLocalModels = false`).
6. `device: 'wasm'` explícito.
7. Sin `quantized: true` (default dtype q8).
8. **Batching + retry:** los workers procesan en batches de 8; si un batch falla (BigInt bug), reintentan uno por uno. Los que fallan se marcan `null`.

### Modelos

| Modelo | Pipeline | Uso |
|---|---|---|
| `Xenova/multilingual-e5-small` | feature-extraction | Embeddings: alineación, redundancia, extractivo, densidad, cobertura |
| `Xenova/robertuito-sentiment-analysis` | text-classification | Arco emocional |

### e5: prefijo obligatorio

Todos los textos se embeddean con prefijo `'query: '` (tarea simétrica, convención e5). Pooling: `'mean'`, normalize: `true` → dot = coseno.

---

## 9. Diseño de interfaz

### 9.1 Layout

Desktop (≥768px): 2 zonas.
- **Editor** (flex): paleta de bloques de 52px + canvas + timeline + teleprompter. La paleta se oculta hacia arriba al scrollear hacia abajo el canvas y reaparece al scrollear hacia arriba.
- **Reader** (460px desktop, 380px tablet): panel de métricas.
- **Header slim** de 2 filas: navegación arriba, meta bar (Título/Promesa/WPM/Duración/Formato/Género) abajo. Auto-hide al scrollear canvas hacia abajo.
- Mobile (<768px): editor a pantalla completa, reader como bottom-sheet colapsable.

### 9.2 Estructura del Reader (de arriba a abajo)

**Zona heurística (siempre visible):**
1. Pastilla de estado IA en la barra principal (heurístico, cargando, listo o error)
2. Dos anillos hero SVG (Salud púrpura, Retención teal)
3. Duración del guion vs objetivo (con barra)
4. Curva de retención SVG (siempre visible, puntos clickeables → scroll al bloque)
5. Factores de retención (8 valores siempre visibles con glosa de 1 línea c/u)
6. Desglose de salud (Hook/Claridad/Ritmo/Promesa con barras)
7. Carga cognitiva (score + 3 métricas: Temas/min, Pal/oración, Descansos)
8. Estructura (chips ✓/✗ por tipo de bloque)

**Pestañas:**
- **Métricas:** activa por defecto; salud, desglose, retención heurística, curva, riesgos, factores, carga cognitiva y estructura. Siempre visible.
- **Análisis IA:** bloqueada en modo Heurístico ("Activá el Modo IA"). En IA: botón "Analizar a fondo" + arco emocional ECG + diagnóstico semántico desplegable.
- **Calibración:** form de métricas reales (6 campos) + tabla de buckets + tabla predicho vs real + historial. Visible en ambos modos.

La pastilla `#ai-activity` es la única fuente resumida del estado IA. Los pips y el texto de estado del reader fueron eliminados.

### 9.3 Bloques en el canvas

Cada bloque tiene:
- `<select>` para cambiar tipo (instantáneo, actualiza color + métricas).
- `<input>` para título editable.
- `<textarea>` auto-grow para contenido.
- Footer: palabras · segundos · etiqueta de calidad · botón eliminar.
- Drag & drop: paleta → canvas, reordenar entre bloques (con indicadores top/bottom).
- Edición incremental: `oninput` actualiza solo el footer del bloque, no re-renderiza toda la lista.

### 9.4 Lenguaje de UI

Todo en español. Nombres renombrados (sin jerga técnica):

| Original | Actual |
|---|---|
| ICN | Salud del guion |
| APV / Retención | Retención estimada |
| Resumen Extractivo | Ideas centrales |
| Redundancia | Repetición |
| Densidad Temática | Ritmo de temas |
| Huecos | Estructura + Cobertura |
| Calibración | Métricas reales de YouTube Studio |

---

## 10. Contratos de datos (main ↔ workers)

### 10.1 ai-worker.js

```js
→ { type: 'INIT', revision: number }
← { type: 'PROGRESS', message: string }
← { type: 'READY' }
← { type: 'ERROR', message: string }

→ { type: 'EMBED', requestId, cacheId, texts: [{id, text, role}] }
← { type: 'EMBED_RESULT', requestId, cacheId, alignment, alignmentRaw, redundancy, baseline: {avgSim, maxSim, pairCount} }

→ { type: 'EXTRACT_KEY_SENTENCES', requestId, sentences, fullText, topN }
← { type: 'EXTRACT_RESULT', requestId, sentences: [{text, score}] }

→ { type: 'COMPUTE_REDUNDANCY', requestId, blocks, blockIds, threshold, valenceMap }
← { type: 'REDUNDANCY_RESULT', requestId, density, redundantCount, contrastCount, redundantPairs, contrastPairs, baseline }

→ { type: 'COMPUTE_DENSITY', requestId, segments, fullText }
← { type: 'DENSITY_RESULT', requestId, topicsPerMinute, density, segments, changes }

→ { type: 'DETECT_GAPS', requestId, blocks, topics: [{label, examples}] }
← { type: 'GAPS_RESULT', requestId, gaps, covered, adaptiveThreshold }
```

### 10.2 sentiment-worker.js

```js
→ { type: 'INIT' }
← { type: 'READY' }

→ { type: 'SENTIMENT', requestId, texts, blockIds, blockIndices, blockTypes }
← { type: 'SENTIMENT_RESULT', requestId, sentimentArc, engagementScore, emotionalMomentum, tonalJumps }
```

### 10.3 retention-worker.js

```js
→ { type: 'PREDICT_RETENTION', requestId, blocks, wpm, promise, title }
← { type: 'RETENTION_RESULT', requestId, overallRetention, confidence, curve, scores, weights, insights, risks, recommendations, formula, meta }
```

---

## 11. Bugs corregidos (registro — para que no se repitan)

*(Nota: Los bugs de versiones anteriores fueron archivados en `old-bugs-solved.md`)*

| Bug | Causa | Fix |
|---|---|---|
| Cálculo de APV no coincidía con UI | La UI no usaba pesos normalizados | Uso de la función `_n()` con `.toFixed(2)` en `js/retention-engine.js` |
| Salto abrupto en la curva de retención | Umbral binario (>= 60) no validado | Interpolación lineal entre curva baseline y strongHook |
| Conteo de sílabas en español erróneo | No contemplaba reglas de hiato vs diptongo | Ajuste de `syllables()` para reglas ortográficas precisas |
| Doble conteo de `hookAnalysis.score` | Se sumaba en la elección de curva y además en bloque 0 | Eliminada suma extra arbitraria de +0.05 en el primer bloque |
| worker de retención sin `requestId` | Condición de carrera (Data race) al responder | Se verifica strict match con `state.analysisRequestId` |
| `computeRetentionPrediction` fallos silenciosos | Solo lanzaba console.warn en excepciones | Feedback visual inyectado en el DOM |
| Truncado silencioso de Bloques Largos | Modelos solo soportan ~512 tokens | Pipeline jerárquico (Chunking) ponderado en `js/ai-worker.js` y `js/sentiment-worker.js` |
| Caracteres especiales y emojis rompían Arco | Regex demasiado estricto | Permisividad en el sanitzer (`sanitizeSentimentText`) conservando emojis |
| Data Race de Report Card | El reporte no esperaba al worker de retención | `computeRetentionPrediction` corre síncrono como fallback si la info no está lista |
| Redundancia daba falsos positivos en UI | El análisis asíncrono no esperaba a Sentimiento | Aviso *Missing Emotional Context* inyectado en la UI para prevenir confusiones |
| El Reporte se colgaba por ReferenceError | Variable `proj` no instanciada en `renderDeepReport` | Ajustado a `state.p` |
| Fallos parciales de IA ignorados | El reporte ignoraba los errores parciales (`densityError`, etc.) | Alerta `Partial AI Failure` inyectada en `renderDeepReport` |
| Texto de Speech-to-Text rompía chunking | No había puntos para delimitar oraciones largas | Fallback que segmenta por espacios si falla el delimitador léxico |

---

## 12. Reglas epistémicas

| Etiqueta | Significado |
|---|---|
| **Validado** | Fórmula publicada con respaldo académico primario y constantes fijas |
| **Calculado** | Modelo o matemática sobre datos reales del guion. Interpretación es proyección |
| **Heurístico** | Regla transparente con justificación cualitativa. Pesos internos |

**Regla de transparencia (P5):** nunca se presenta un número heurístico como validado.

**Regla de escala original (P9):** si una traslación de escala no es lineal, se usa la escala académica original.

**Regla de oro de citación:** cada peso y constante numérica en `js/retention-engine.js` lleva comentario con la cita de su fuente. No se aceptan valores sin documentación.

---

## 13. Dependencias externas

| Dependencia | Cómo se carga | Fallback |
|---|---|---|
| transformers.js v3.7.2 | `import()` dinámico desde `jsdelivr` bare URL en workers | Sin fallback — la IA no funciona sin él |
| Ninguna otra | — | — |

> **Chart.js fue eliminado.** La curva de retención usa SVG inline. Sin dependencias de charting.

---

## 14. Service Worker

`sw.js` con cache on-demand. Cache-first mismo-origin, network-first CDN, passthrough de modelos HF. No cachea modelos (transformers.js usa Cache Storage propio).

---

## 15. Restricciones

- Sin build step, sin framework, sin bundler.
- Sin backend, sin login, sin telemetría.
- Sin generación de texto.
- NER (Named Entity Recognition) fuera de alcance.
- Guiones de hasta ~200 bloques.
- e5-small: 512 tokens por texto (truncado).

---

## 16. Importación / Exportación

| Formato | Extensión |
|---|---|
| JSON | `.scriptlab.json` |
| Markdown | `.md` |
| HTML | `.html` |
| Texto Plano | `.txt` |
| Imprimible | `.pdf` (vía print API) |

Los reportes de Diagnóstico Semántico (Deep Analysis) también se pueden exportar a TXT, JSON, HTML y PDF.

Round-trip JSON → importar → exportar = mismo contenido.

`parseMarkdownToBlocks` hace fallback: las secciones `##` que no matchean el patrón estricto se guardan como SEGMENTO (no se pierden).

---

## 17. Archivos del producto (17)

| Archivo | Responsabilidad |
|---|---|
| `index.html` | Landing Page (Marketing/Onboarding) apuntando a scriptlab.html |
| `scriptlab.html` | Estructura DOM completa (La App), tres tabs del reader y configuración IA |
| `css/styles.css` | Estilos CSS (Slim Header, Dark Mode, Animaciones, Report Card) |
| `sw.js` | Service worker offline (Mismo origin, CDN, passthrough de HF) |
| `js/state.js` | Constantes (T, HEURISTICS), estado, normalizeProject (con fallback UUID), Undo/Redo |
| `js/db.js` | IndexedDB (CRUD + migración legacy) |
| `js/ai-shared.js` | Primitivas puras (sanitize, dot, cosine, syllables, wordCount) |
| `js/scoring.js` | ICN (Health Score heurístico en tiempo real) |
| `js/retention-engine.js`| Lógica Pura: Curva de retención proyectada (APV), ponderaciones heurísticas |
| `js/sentiment-engine.js`| Lógica Pura: Chunking, agregados y saltos tonales |
| `js/export-import.js` | Import/Export de PDF, HTML, JSON, MD, TXT y CSV |
| `js/render.js` | Interacción del DOM, SVG, Undo/Redo functions |
| `js/main.js` | Orquestador, events, boot(), ejemplo de onboarding (_exampleProject) |
| `js/workers.js` | Wrapper de Workers con canales aislados de requestIds |
| `js/ai-worker.js` | Embeddings worker (multilingual-e5-small) con chunking jerárquico |
| `js/sentiment-worker.js`| Sentiment worker (robertuito) con retry y manejo de missing data |
| `js/retention-worker.js`| Worker delegado asíncrono para el APV |
| `js/diagnostics.js` | Performance y telemetría ligera |


