# ScriptLab AI v4 — Contrato Técnico

**Versión del documento:** 1.0 (final)
**Fecha:** 2026-07-20
**Estado:** ✅ Aprobado para implementación
**Base técnica:** Reescritura desde cero sobre las lecciones de v25 (monolito), v18 (modular con pub-sub) y v16 (ES modules + DI). El motor analítico y la documentación de fuentes se heredan de v16/v18, con recalibración de pesos basada en research (ver Apéndice A).

**Decisiones cerradas en revisión:**
- §7.3 Retención: pesos recalibrados con research (Hook 0.25, Emotional arc 0.11, CTA 0.03).
- NER: descartado. No beneficia las métricas importantes (ICN, retención, alineación, redundancia, ideas, ritmo, cobertura, arco emocional). Fuera de alcance de v4.
- Etiqueta epistémica del ICN: mezcla honesta (Validado + Heurístico) — aprobada.

---

## 0. Tabla de contenidos

1. Objetivos y no-objetivos
2. Principios de diseño
3. Arquitectura general
4. Modelo de estado unificado
5. Modelo de cómputo (2 tiers)
6. Contratos de datos (main ↔ workers)
7. Especificación de métricas (con fuentes y etiqueta epistémica)
8. Modelo de datos y persistencia
9. Diseño de interfaz
10. Responsive y mobile
11. Modos de IA y modelos locales
12. Importación / Exportación
13. Módulos del sistema (responsabilidades y límites)
14. Criterios de aceptación por módulo
15. Criterios epistémicos (validado vs calculado vs heurístico)
16. Restricciones y compatibilidad
17. Glosario

---

## 1. Objetivos y no-objetivos

### 1.1 Objetivos

- **Orientar mediante métricas.** La base del producto es un diagnóstico cuantitativo del guion, no un editor de texto. Toda decisión de UI debe priorizar la legibilidad del diagnóstico.
- **Análisis local y privado.** Todo el cómputo (heurísticas, embeddings, sentimiento, retención) se ejecuta en el navegador del usuario. Ningún texto sale del dispositivo.
- **Máxima precisión sin generación.** Combinar heurísticas validadas con modelos semánticos locales para extraer y analizar, **nunca para generar texto**. El producto es analítico, no generativo.
- **Interfaz minimalista estilo Apple.** Menos paneles, menos pestañas, menos botones. Un relato vertical de diagnóstico, no un dashboard de programador.
- **Reactividad en tiempo real para lo esencial.** El usuario escribe y ve su Salud y Retención actualizarse sin acciones manuales.

### 1.2 No-objetivos (explícito)

- ❌ **No generar texto.** No se sugieren reescrituras, no se autocompleta contenido, no se redactan hooks. El sistema *mide*, el humano *escribe*.
- ❌ **No conectarse a internet para analizar.** Internet sólo se usa para descargar los modelos la primera vez (y para Chart.js como CDN, con fallback).
- ❌ **No requiere cuenta ni backend.** No hay login, no hay sincronización en la nube. La persistencia es local (IndexedDB).
- ❌ **No es un editor de video.** No produce subtítulos, no edita, no exporta a formatos de video.
- ❌ **No promete precisión absoluta.** Las métricas son guías direccionales. Toda métrica lleva etiqueta epistémica (§15).

---

## 2. Principios de diseño

| # | Principio | Implicancia |
|---|---|---|
| P1 | **El diagnóstico es el producto.** | Las métricas tienen peso visual co-equal con el editor; no son un sidebar accesorio. |
| P2 | **Un relato, no muchas herramientas.** | El panel derecho es un flujo vertical de secciones, no pestañas separadas que el usuario debe descubrir. |
| P3 | **Lo computable corre solo; lo pesado se pide.** | Dos tiers de cómputo (§5). Cero botones sueltos salvo "Analizar a fondo". |
| P4 | **El estado guía, no las instrucciones.** | Pips de estado (`●●●○`) y secciones grisadas comunican qué falta, en lugar de texto instructivo. |
| P5 | **Separar lo validado de lo proyectado.** | Cada métrica muestra su origen epistémico. Nunca se mezclan como si fueran igual de confiables. |
| P6 | **Lógica pura, DOM separado.** | El motor de scoring no toca el DOM. Es testeable en aislamiento. |
| P7 | **Cómputo pesado fuera del hilo principal.** | Los modelos y la retención viven en Web Workers. La UI nunca se bloquea. |
| P8 | **Inyección de dependencias, no globales.** | Los workers no referencian funciones de render; se registran vía callbacks (heredado de v16). |

---

## 3. Arquitectura general

### 3.1 Decisión de arquitectura

**ES modules** (`<script type="module">` con `import`/`export`), **no** scripts `defer` con funciones globales. Heredado de v16, que demostró ser la base más limpia de las tres versiones analizadas.

**Justificación frente a las alternativas descartadas:**
- *Monolito (v25)*: un `app.js` de ~1000 líneas con globales sueltos (`p`, `sel`, `aiResult`). Inmantenible, retención síncrona bloqueando UI. Descartado.
- *Defer modular + pub-sub (v18)*: `store.js` con subscribe/notify sobre-ingenierizado para un estado que raramente se observa desde múltiples sitios; NER incluido pero muerto (no cableado). Descartado por su sobrecoste.

**v4 toma de v16:** ES modules, DI vía `setRenderCallbacks`, `syncWorkerWithState()` automático, `scoring.js` puro importando primitivas de `ai-shared.js`, motor de retención off-main-thread documentado.

### 3.2 Grafo de dependencias

```
index.html
  └─ main.js (type=module) — bootstrap + binding + análisis on-demand
       ├─ state.js        — estado centralizado + constantes de dominio
       ├─ db.js           — IndexedDB (CRUD + migración legacy)
       ├─ scoring.js      — motor ICN puro (sin DOM)
       │    └─ ai-shared.js — primitivas (wordCount, Fernández-Huerta, cosine, sanitize…)
       ├─ workers.js      — orquestación de Web Workers + DI de render
       │    └─ db.js (cache)
       ├─ render.js       — todo el DOM + gráficos + incrementalidad
       │    ├─ state.js, scoring.js, ai-shared.js, db.js, workers.js
       │    └─ se registra en workers.js vía setRenderCallbacks()
       ├─ export-import.js — JSON / Markdown / HTML
       └─ Chart.js (CDN, con fallback)

Web Workers (hilos separados):
  ai-worker.js        — embeddings (multilingual-e5-small)
       └─ ai-shared.js
  sentiment-worker.js — sentimiento (robertuito-sentiment-analysis)
  retention-worker.js — motor heurístico de retención (sin modelo, pura matemática documentada)
```

### 3.3 Regla de dependencias

- `scoring.js` **no importa** nada que toque el DOM.
- `workers.js` **no importa** nada de `render.js`. Render se inyecta.
- `state.js` **no importa** de nadie (es la hoja de constantes + el contenedor de estado).
- `main.js` es el único que orquesta a todos (punto de entrada).
- `db.js` no depende de módulos de dominio (solo IndexedDB + hash).

### 3.4 Sin service worker obligatorio

El service worker (`sw.js`) se registra para offline, **pero la app debe funcionar sin él** (caso `file://` en navegadores como Opera). El cacheo de modelos lo hace transformers.js vía Cache Storage del navegador, no el SW.

---

## 4. Modelo de estado unificado

### 4.1 Objeto `state` (módulo `state.js`)

Estado mutable compartido, exportado como objeto único. No hay pub-sub (lección de v18: sobre-ingeniería). Las mutaciones llaman explícitamente a `render()` o a funciones de render específicas.

```js
export const state = {
  // Proyecto activo
  p: Project,              // proyecto normalizado (ver §8.1)
  sel: null | BlockId,     // bloque seleccionado

  // Flags de render
  flowDirty: true,         // ¿re-renderizar la lista de bloques?
  analysisDirty: true,     // ¿recalcular ICN cacheado?
  cachedAnalysis: null,    // memo del último analysis()

  // Workers + resultados
  worker: null,            // ai-worker (embeddings)
  retentionWorker: null,
  sentimentWorker: null,
  sentimentReady: false,
  rev: 0,                  // contador de revisiones (invalidate worker)

  // Resultados de análisis
  aiResult: null,          // { alignment, redundancy, baseline, ... }
  retentionResult: null,   // { overallRetention, confidence, curve, scores, ... }
  sentimentResult: null,   // { sentimentArc, engagementScore, emotionalMomentum, ... }
  redundancyResult: null,  // { redundantPairs, contrastPairs, density, ... }  (on-demand)
  deepResult: null,        // bundle de resultados del tier 2 (ideas, ritmo, cobertura)

  // Calibración
  calRecords: [],          // datos reales de YouTube del usuario

  // Misc
  timer: null,             // debounce de save
  aiTimer: null,           // debounce de scheduleAI
  tts: { index, playing, paused },
  paletteDragType: null,
  densityChartInstance: null,
  retentionChartInstance: null,
  analysisRequestId: 0,
  analysisCallbacks: {}    // mapa requestId → {resolve, reject}
};
```

### 4.2 Reglas de mutación

- Toda mutación de `state.p` debe: (1) marcar `analysisDirty` (vía `markAnalysisDirty()`), (2) debauncer el guardado (vía `saveDebounced()`), (3) disparar el render correspondiente.
- `markAnalysisDirty()` limpia `cachedAnalysis`. El siguiente `analysis()` recalcula.
- No hay setters encapsulados: la mutación es directa y explícita. La disciplina la da el patrón, no el encapsulamiento.

---

## 5. Modelo de cómputo (2 tiers)

### 5.1 Tier 1 — Tiempo real (automático)

Se recalcula al escribir (debounced 350ms para guardado, 700ms para workers pesados).

| Métrica | Disparador | Cómo | Hilo |
|---|---|---|---|
| Salud (ICN) + desglose | `oninput` de cualquier bloque/campo | `analysis()` síncrono | main |
| Estructura (por tipo) | `oninput` | chequeo de tipos de bloque | main |
| Alineación hook–promesa (IA) | `scheduleAI` 700ms | embeddings worker | ai-worker |
| Redundancia de baseline (IA) | `scheduleAI` 700ms | embeddings pairwise | ai-worker |
| Arco emocional (IA) | `scheduleSentiment` 700ms | sentiment worker | sentiment-worker |
| Retención estimada + curva | `scheduleRetention` (al cambiar bloques) | retention worker | retention-worker |

El tier 1 es **silencioso**: corre en background, actualiza los anillos y el desglose sin que el usuario pida nada.

### 5.2 Tier 2 — Bajo demanda ("Analizar a fondo")

Se ejecuta **solo** al pulsar el botón "Analizar a fondo". Dispara en paralelo (con `Promise.allSettled`):

| Análisis | Worker | Mensaje |
|---|---|---|
| Repetición (con contraste) | ai-worker | `COMPUTE_REDUNDANCY` (+ valenceMap del sentiment) |
| Ideas centrales (extractivo) | ai-worker | `EXTRACT_KEY_SENTENCES` |
| Ritmo de temas (densidad/min) | ai-worker | `COMPUTE_DENSITY` |
| Cobertura semántica (huecos) | ai-worker | `DETECT_GAPS` |

Mientras corre, la sección "Diagnóstico semántico" muestra estado de carga. Al terminar, se llena y queda visible hasta que el contenido cambie significativamente (ver §5.4).

### 5.3 Estado visible de cómputo

Pips en el header del panel derecho: `●●●○`

```
●  Tier 1 básico (ICN, estructura)         — listo al instante
●  Tier 1 IA (embeddings, sentimiento)      — listo al cargar modelos
●  Retención estimada                        — listo tras primer cálculo
○  Tier 2 (Analizar a fondo)                — pendiente hasta on-demand
```

Texto companion: "Tiempo real listo · Analizando retención…" / "Todo listo · podés analizar a fondo".

### 5.4 Invalidación del tier 2

- El tier 2 guarda un hash del contenido analizado (`contentHash`).
- Si el usuario edita y el hash cambia, la sección muestra sutilmente "contenido cambió desde el último análisis" como invitación a re-correrlo, pero **no se re-dispara solo** (decisión on-demand explícita del usuario, §acuerdo UI).

---

## 6. Contratos de datos (main ↔ workers)

Todo mensaje es un objeto plano postable. Cada mensaje de request incluye `type` + `requestId`. Cada respuesta incluye `type` + `requestId` (salvo los flujos push de worker → main).

### 6.1 ai-worker.js — Embeddings

**Init:**
```js
→ { type: 'INIT', mode: 'embeddings', revision: number }
← { type: 'PROGRESS', message: string }            // "42%"
← { type: 'READY' }
← { type: 'ERROR', message: string }
```

**Embed (tier 1, push):**
```js
→ { type: 'EMBED', requestId: number, cacheId: string,
    texts: [{ id, text, role: 'title'|'promise'|'block'|'hook' }] }
← { type: 'EMBED_RESULT', requestId, cacheId,
    alignment: number,       // 0–1, normalizado al baseline del guion
    alignmentRaw: number,    // coseno bruto hook↔promise
    redundancy: number,      // 0–1, normalizado
    baseline: { avgSim, maxSim, pairCount } }   // distribución pairwise del guion
```

**Análisis on-demand (tier 2, request/response):**
```js
→ { type: 'EXTRACT_KEY_SENTENCES', requestId, sentences: string[], fullText: string, topN: number }
← { type: 'EXTRACT_RESULT', requestId, sentences: [{ text, score: number }] }

→ { type: 'COMPUTE_REDUNDANCY', requestId, blocks: string[], blockIds: string[],
     threshold: number, valenceMap: { [blockId]: number } }
← { type: 'REDUNDANCY_RESULT', requestId,
     density: number, redundantCount: number, contrastCount: number,
     redundantPairs: [{ textA, textB, similarity, rawSimilarity }],
     contrastPairs: [{ textA, textB, similarity, rawSimilarity, valenceDiff }],
     baseline: { avgSim, maxSim } }

→ { type: 'COMPUTE_DENSITY', requestId, segments: [{text, label}], fullText: string }
← { type: 'DENSITY_RESULT', requestId,
     topicsPerMinute: number, density: number, totalSegments: number,
     avgGlobalSim: number,
     segments: [{ label, globalSim }],
     changes: [{ afterSegment, similarity }] }

→ { type: 'DETECT_GAPS', requestId, blocks: string[], topics: [{label, examples: string[]}] }
← { type: 'GAPS_RESULT', requestId,
     gaps: [{ topic, maxSimilarity, bestBlock }],
     covered: [{ topic, maxSimilarity, bestBlock }],
     adaptiveThreshold: number, baselineMean: number, baselineStd: number }
```

### 6.2 sentiment-worker.js — Sentimiento

```js
→ { type: 'INIT' }
← { type: 'PROGRESS', message }
← { type: 'READY' }

→ { type: 'SENTIMENT', requestId,
    texts: string[], blockIds: string[],
    blockIndices: number[], blockTypes: string[] }
← { type: 'SENTIMENT_RESULT', requestId,
    sentimentArc: [{ blockId, blockIndex, blockType, label: 'POS'|'NEG'|'NEU', valence: -1..1 }],
    engagementScore: 0..1,     // varianza emocional
    emotionalMomentum: number, // último tercio − primer tercio
    tonalJumps: [{ fromBlock, toBlock, fromLabel, toLabel, deltaValence, severity }] }
```

### 6.3 retention-worker.js — Retención

```js
→ { type: 'PREDICT_RETENTION', requestId,
    blocks: Block[], wpm: number, promise: string, title: string }
← { type: 'RETENTION_RESULT', requestId,
    overallRetention: number,       // APV estimado, clamp [15,95]
    confidence: 0..0.85,
    curve: [{ blockIndex, blockLabel, blockType, startTime, duration,
              retention: 0..1, retentionPct, relPosition, isDropRisk, isCritical }],
    scores: {                       // cada uno: { score: 0..100, formula: string, ...detalles }
      hook, pacing, patternInterrupts, contentDensity,
      promiseDelivery, readability, cta, narrative
    },
    weights: WEIGHTS,               // los 9 pesos (ver §7.3)
    insights: string[], risks: string[], recommendations: string[],
    formula: string,                // string descriptivo del cálculo
    meta: { totalBlocks, contentBlocks, totalDuration, wpm, hasHook, hasCTA } }
```

---

## 7. Especificación de métricas

Cada métrica se especifica con: **fórmula**, **fuente**, **etiqueta epistémica** (§15), **rango**.

### 7.1 Anillo 1 — Salud del guion (ICN)

**Etiqueta:** Validado + Heurístico (mezcla).
**Rango:** 0–100.

```
ICN = hs·0.31 + cl·0.22 + pa·0.22 + pr·0.17 + (CTA_presente ? 8 : 0)
```

| Factor | Código | Qué mide | Fuente |
|---|---|---|---|
| **Hook (hs)** | `hs` | Calidad del hook: longitud óptima (15–80 pal), pregunta (+15), números (+10), alineación con promesa (+20), urgencia (+10). Detecta hook implícito (primer bloque sin tipo HOOK, ×0.7). | Heurística interna. |
| **Claridad (cl)** | `cl` | Legibilidad Fernández-Huerta con penalización bidireccional (ni muy difícil ni infantil, FH>90 penaliza). | **Fernández-Huerta (1959)**, adaptación española de Flesch. [PRIMARIA] |
| **Ritmo (pa)** | `pa` | Notas visuales/giros + varianza de longitud de oraciones (CV óptimo 0.3–1.0). | Heurística. Referencia direccional: Cutting et al. (2016). [SECUNDARIA] |
| **Promesa (pr)** | `pr` | Solapamiento léxico (palabras ≥4 letras) entre hook y promesa. | Heurística binaria. |

**Calibración:** si el usuario cargó ≥5 datos reales de APV:
```
ICN_calibrado = ICN_raw · 0.7 + APV_promedio · 0.3
```

### 7.2 Métricas IA (tier 1, embeddings)

**Etiqueta:** Calculado (semántico).

| Métrica | Fórmula | Notas |
|---|---|---|
| **Alineación hook–promesa** | `cos(hook_emb, promise_emb)` normalizado al baseline pairwise del guion | Reporta `%` relativo + raw. |
| **Redundancia de baseline** | distribución pairwise de `cos(b_i, b_j)` entre todos los bloques | media/max/pairCount. |

### 7.3 Anillo 2 — Retención estimada (APV)

**Etiqueta:** Calculado (heurístico documentado, proyectado).
**Rango:** 15–95 (clamp).
**Hilo:** retention-worker (off-main-thread).

**Fórmula:**
```
APV = clamp[15, 95] ( Σ score_i · weight_i )
```

#### Pesos recalibrados (suman 1.00)

Los pesos se asignaron tras research sistemático (ver Apéndice A). Cada peso cita su fuente inline. La regla del proyecto: **ningún número es inventado**; si no hay fuente académica, se usa inferencia de segunda fuente y se documenta. En el código (`retention-worker.js`), cada peso lleva un comentario con la cita exacta.

| Sub-score | Peso | Cambio vs v16 | Etiqueta | Base |
|---|---|---|---|---|
| **Hook strength** | **0.25** | ↑ (0.22) | SECUNDARIA convergente | Ver §7.3.1 |
| **Pacing / segmentación** | **0.17** | ↓ (0.18) | PRIMARIA + SECUNDARIA | Ver §7.3.2 |
| **Pattern interrupts** | **0.14** | ↓ (0.15) | PRIMARIA + SECUNDARIA | Ver §7.3.3 |
| **Emotional arc** | **0.11** | ↑ (0.08) | **PRIMARIA causal** | Ver §7.3.4 |
| **Content density** | **0.11** | ↓ (0.12) | PRIMARIA (teoría) | Ver §7.3.5 |
| **Promise delivery** | **0.09** | ↓ (0.10) | SECUNDARIA | Ver §7.3.6 |
| **Readability** | **0.07** | ↓ (0.08) | PRIMARIA (fórmula) | Ver §7.3.7 |
| **CTA placement** | **0.03** | ↓ (0.04) | SECUNDARIA (conversión) | Ver §7.3.8 |
| **Narrative completeness** | **0.03** | = (0.03) | PRIMARIA (estructura) | Ver §7.3.9 |

Suma: 0.25 + 0.17 + 0.14 + 0.11 + 0.11 + 0.09 + 0.07 + 0.03 + 0.03 = **1.00** ✓

#### Justificación de cada peso

**7.3.1 Hook strength — 0.25 [↑ recalibrado al alza]**
El hook es el factor más consistentemente citado en toda la literatura como determinante de retención, y múltiples fuentes independientes convergen:
- Análisis de 5.000 scripts (PrePublish, 2026): los que entregan una promesa de valor concreta en los primeros 15 s retienen **52%** promedio vs **44%** sin ella (brecha de 8 puntos = ~18% relativo).
- RetentionRabbit 2025 (reporte sobre +videos): value prop clara en los primeros 15 s = **+18% retención** en el minuto 1.
- Think with Google 2024 Creator Insights: hooks estructuralmente fuertes (value prop en 30 s) = **+47% AVD**.
- Backlinko (1,3M videos): el mayor punto de caída es la ventana 30–45 s.
- Paddy Galloway: +10 pts de retención puede significar la diferencia entre 100k y 1M views.
> **Cita en código:** `// Hook 0.25 — PrePublish 5k-script study (52% vs 44%, 2026); Think with Google 2024 (+47% AVD); Backlinko 1.3M videos. [SECUNDARIA convergente — múltiples estudios independientes coinciden]`

**7.3.2 Pacing / segmentación — 0.17**
- **Seidel (2024)**, *Short, Long, and Segmented Learning Videos*, Technology Knowledge and Learning (Springer). Estudio sobre 1.419 canales educativos de YouTube + estudio controlado (N=22): los videos segmentados produjeron **mayores ganancias de aprendizaje** que los no segmentados. [PRIMARIA]
- PrePublish 5k-script: *"Pacing variation is a stronger retention predictor than vocabulary quality"*. [SECUNDARIA]
> **Cita:** `// Pacing 0.17 — Seidel (2024) Springer, segmented videos = higher learning gains; PrePublish: pacing variation > vocabulary quality. [PRIMARIA + SECUNDARIA]`

**7.3.3 Pattern interrupts — 0.14**
- **Kahneman (1973)** *Attention and Effort*; **Sokolov (1963)** modelo neuronal del orienting response. Base teórica del porqué los cambios novedosos resetean la atención. [PRIMARIA teoría]
- Datos de mercado: pattern interrupt en los primeros 5 s = **+23% retención** (ytshark 2026, longstories 2026). Interrupts cada 3–5 s = +40–60% retención en TikTok (EdicionVideoPro, 200+ videos). [SECUNDARIA]
> **Cita:** `// Pattern interrupts 0.14 — Kahneman (1973) orienting response [PRIMARIA]; +23% retención con interrupt en primeros 5s (ytshark 2026). [PRIMARIA teoría + SECUNDARIA cuantitativa]`

**7.3.4 Emotional arc — 0.11 [↑ recalibrado al alza]**
**Este peso subió porque encontré evidencia causal fuerte nueva.**
- **Berger, Levermann et al. (2026)**, *How should content creators narrate their content?* Journal of the Association for Consumer Research / Springer. **Evidencia causal** sobre 33.598 episodios de podcasts de YouTube (2019–2024) + 3.381 TED Talks (2006–2020) + 2 experimentos de laboratorio: los *"emotionality flips"* (cambios deliberados entre valencias emocionales altas y bajas) **aumentan el engagement**, con arousal como mecanismo explicativo confirmado. [PRIMARIA — evidencia causal]
- **Song et al. (2023)** eNeuro: el engagement reportado sigue el patrón del dramatic arc y es predecible por actividad neural. [PRIMARIA]
> **Cita:** `// Emotional arc 0.11 — Berger et al. (2026) Springer, 33,598 YouTube podcasts + 3,381 TED talks, causal evidence for emotionality flips; Song et al. (2023) eNeuro. [PRIMARIA causal]`

**7.3.5 Content density — 0.11**
- **Miller (1956)** *The Magical Number Seven, Plus or Minus Two*, Psychological Review. Working memory: 4–7 chunks. [PRIMARIA]
- **Sweller (1988)** Cognitive Load Theory. [PRIMARIA]
- AERO (2023), ACER (2022): el chunking mejora recall y engagement activo. [SECUNDARIA]
> **Cita:** `// Content density 0.11 — Miller (1956) 7±2 chunks; Sweller (1988) Cognitive Load Theory. [PRIMARIA teoría; traducción a temas/min es INFERENCIAL]`

**7.3.6 Promise delivery — 0.09**
- RetentionRabbit 2025: value prop en primeros 15 s correlaciona con +18% retención al minuto 1 (no causal). [SECUNDARIA correlacional]
- PrePublish: payoff-at-15 test. [SECUNDARIA]
> **Cita:** `// Promise delivery 0.09 — RetentionRabbit 2025 (+18% retention correlation); PrePublish payoff-at-15. [SECUNDARIA correlacional — no causal]`

**7.3.7 Readability — 0.07**
- **Fernández-Huerta (1959)** *Medidas sencillas de lecturabilidad*, Consigna 214. Fórmula validada para español. [PRIMARIA fórmula]
- El mapeo "legibilidad → retención de video" es inferencial (no hay estudio que lo valide directamente para español hablado). Por eso el peso es moderado.
> **Cita:** `// Readability 0.07 — Fernández-Huerta (1959) fórmula validada. [PRIMARIA fórmula; mapeo a retención de video es INFERENCIAL]`

**7.3.8 CTA placement — 0.03 [↓ recalibrado a la baja]**
**Este peso bajó porque la evidencia vincula el CTA con conversión, no con retención.**
- ClixieAI/Wistia/sender.net: CTAs mid-roll convierten ~16–17% vs end-roll. [SECUNDARIA — mide conversión, no retención]
- Wistia: guías de placement por duración. [SECUNDARIA]
- El CTA afecta la **acción posterior** del espectador que ya decidió quedarse, no tanto si se queda o se va. Por eso el peso más bajo.
> **Cita:** `// CTA placement 0.03 — ClixieAI/Wistia: mid-roll CTAs ~16-17% conversion. [SECUNDARIA — mide conversión, no retención; por eso peso bajo]`

**7.3.9 Narrative completeness — 0.03**
- **Song et al. (2023)** eNeuro: el engagement sigue el dramatic arc. [PRIMARIA]
- Estudio USC: 70% de las películas top-grossing siguen un framework narrativo reconocible. [SECUNDARIA]
- Peso bajo porque la estructura completa es necesaria pero por sí sola no retiene — los otros factores son los que mueven la aguja dentro de una estructura.
> **Cita:** `// Narrative completeness 0.03 — Song et al. (2023) eNeuro dramatic arc; USC 70% top films. [PRIMARIA estructura; peso bajo: necesaria pero no suficiente]`

#### Cambios vs v16 (resumen de recalibración)

| Factor | v16 | v4 | Por qué cambió |
|---|---|---|---|
| Hook | 0.22 | **0.25** | Fuentes convergen: es el #1 predictor. Subimos. |
| Pacing | 0.18 | 0.17 | Mantiene; redondeo por suma. |
| Pattern interrupts | 0.15 | 0.14 | Mantiene; leve ajuste. |
| **Emotional arc** | 0.08 | **0.11** | **Hallamos Berger et al. (2026) Springer — evidencia causal nueva.** Subimos. |
| Content density | 0.12 | 0.11 | Mantiene; leve ajuste. |
| Promise delivery | 0.10 | 0.09 | Mantiene; leve ajuste. |
| Readability | 0.08 | 0.07 | Leve ajuste. |
| **CTA placement** | 0.04 | **0.03** | Evidencia es sobre conversión, no retención. Bajamos. |
| Narrative | 0.03 | 0.03 | Igual. |

**Curva de retención:** dos baseline (hook promedio / hook fuerte ≥60) basadas en Wistia State of Video Report (2025) y RetentionRabbit 2025 (curva típica: ~55% de viewers perdidos al minuto 1, declive gradual). Modificadores por bloque: pattern interrupt +0.03–0.08, bloque largo >50s −0.04, >80s −0.06, CTA +0.03, bloque vacío −0.15. Puntos <35% marcados como riesgo de fuga (basado en RetentionRabbit: completion promedio 23.7%).

**Confianza:** `min(0.85, 0.3 + contentBlocks·0.05)`. Nunca supera 0.85 sin validación empírica propia.

> **Nota epistémica crítica (P5):** cada peso individual tiene justificación documentada y citada inline. El *conjunto* como sistema predictivo no está validado por un estudio único — es una agregación ponderada basada en la mejor evidencia disponible. En el código, cada peso lleva su cita exacta. La etiqueta "Calculada" del anillo y la sub-línea "proyección" comunican esto al usuario. La transparencia es deliberada.

### 7.4 Métricas tier 2 (on-demand)

| Sección | Métrica | Etiqueta | Cómo |
|---|---|---|---|
| **Repetición** | Pares redundantes vs contrastes narrativos | Calculado | Embeddings pairwise + valenceMap del sentiment. "Redundante" = mismo tema + mismo tono; "Contraste" = mismo tema + tono opuesto (estructura válida, no se penaliza). |
| **Ideas centrales** | Oraciones más representativas | Calculado | Similitud de cada oración con el centroide del guion. Top-N configurable. |
| **Ritmo de temas** | Temas/minuto | Calculado | Segmentación por minuto (WPM), similitud global por segmento, detección de cambios temáticos. |
| **Cobertura** | Estructural (5) + Semántica (3) | Híbrido | Ver §7.5. |

### 7.5 Cobertura — diseño en dos niveles

**Nivel estructural (instantáneo, sin IA):** verificación por tipo de bloque.
- ✓/✗ Hook, Contexto, Evidencia, Giro, CTA.
- Se renderiza inmediatamente, incluso en modo básico.

**Nivel semántico (IA):** 3 temas evaluados contra centroides de embeddings.
- **Problema**, **Solución**, **Resumen/Cierre**.
- Cada tema tiene 3 oraciones ejemplo en **español rioplatense** (en `state.js` como `PREDEFINED_TOPICS[].examples`).
- Se calcula el centroide de los embeddings de los ejemplos y se compara con cada bloque.
- Umbral **adaptativo**: `media − σ` de la distribución de similitudes. Un tema es "hueco" si su mejor match está por debajo.

### 7.6 Arco emocional (tier 1, sentiment)

**Etiqueta:** Calculado (modelo).
**Modelo:** robertuito-sentiment-analysis, optimizado para español.

| Sub-métrica | Fórmula |
|---|---|
| Engagement | `min(1, varianza(valencias)·2 + |media|·0.5)` |
| Momentum | `media(último tercio) − media(primer tercio)` |
| Saltos tonales | transiciones con `|Δvalencia| ≥ 0.25`, severidad por banda (ver §7.6.1) |

#### 7.6.1 Umbrales de salto tonal (recalibrados con base VADER)

Los umbrales se infirieron del lexicon **VADER** (Hutto & Gilbert, 2014, ICWSM), el más validado del NLP académico para valencia en escala continua. VADER usa escala `−4..+4` con 7.500 features validados por 10 raters humanos. La traslación a la escala `−1..+1` del sistema (÷4) es lineal y simétrica → válida.

| Banda | Rango `|Δvalencia|` | Severidad | Base VADER (normalizada) |
|---|---|---|---|
| Detección mínima | ≥ 0.25 | (umbral) | neutral → "okay" (+0.9 → +0.225) |
| Bajo | 0.25 – 0.50 | bajo | neutral → "good" (+1.9 → +0.475) |
| Medio | 0.50 – 0.75 | medio | neutral → "great"/"horrible" (±3.1/±2.5 → ±0.775/±0.625) |
| Alto | ≥ 0.75 | alto | cambio de signo con intensidad (NEG fuerte → POS fuerte) |

> **Cita en código:** `// Salto tonal ≥0.25 — inferido de VADER (Hutto & Gilbert 2014, ICWSM), escala -4..+4 trasladada a -1..+1 (÷4, lineal). Bandas: bajo<0.50, medio<0.75, alto≥0.75. [INFERIDO de segunda fuente cuantitativa validada]`

> **Nota epistémica:** la literatura de "emotional flow" (Nabi & Green 2014; Berger et al. 2026) trata los shifts cualitativamente (positive→negative), no da magnitudes numéricas. VADER es la mejor base cuantitativa disponible; los umbrales son inferencia sobre su escala, no validación directa sobre retención de video.

Visualización: secuencia de puntos por bloque (😊/😟/😐) + tarjeta de engagement/momentum/saltos.

---

## 8. Modelo de datos y persistencia

### 8.1 Entidades

**Project:**
```js
{
  id: 'active',                 // singleton
  title: string,
  promise: string,
  targetDuration: number,       // 0–3600 s | 0 = sin objetivo
  aiMode: 'basic' | 'embeddings',
  wpm: number,                  // 115–185
  blocks: Block[],
  updatedAt: number,
  lastSnapshotAt?: number
}
```

**Block:**
```js
{
  id: string (crypto.randomUUID),
  type: BlockType,              // HOOK | CONTEXTO | EVIDENCIA | SEGMENTO | GIRO | VISUAL | CTA
  label: string,
  content: string,
  notes: string                 // nota del autor (no se analiza)
}
```

**Calibration:**
```js
{
  id: string,
  format: 'long' | 'short',
  genre: 'educativo' | 'ensayo' | 'tutorial' | 'entretenimiento',
  apv: number,                  // APV real de YouTube Studio
  r30: number | null,
  createdAt: number
}
```

### 8.2 Tipos de bloque (constante `T`)

| Tipo | Color | Rol narrativo |
|---|---|---|
| HOOK | `#ff7d5c` | Apertura |
| CONTEXTO | `#69a8ff` | Antecedentes |
| EVIDENCIA | `#ae83ff` | Datos/respaldo |
| SEGMENTO | `#b3bdce` | Desarrollo neutro |
| GIRO | `#f4b857` | Pattern interrupt |
| VISUAL | `#32d2ac` | Nota visual (no se narra) |
| CTA | `#5cdb87` | Cierre/acción |

### 8.3 IndexedDB — `scriptlab-ai` (versión de schema 4)

| Store | keyPath | Contenido |
|---|---|---|
| `projects` | `id` | El proyecto activo (singleton `id:'active'`) |
| `snapshots` | `id` | Snapshots automáticos cada 30 min de edición |
| `calibrations` | `id` | Datos reales de YouTube del usuario |
| `settings` | `id` | Preferencias (tema, etc.) |
| `analysisCache` | `id` | Cache de resultados IA por hash de contenido |
| `modelRegistry` | `id` | Metadata de modelos descargados |

**Migración legacy:** si existe `localStorage['scriptlab-ai-project-v1']` (v1 del producto, pre-IDB), se migra una sola vez a `projects` y se marca `scriptlab-idb-migrated`.

### 8.4 Estrategia de cache de análisis

- Cada resultado IA se cachea en `analysisCache` con `id = 'embedding-' + contentHash(JSON.stringify(texts))`.
- Antes de computar, se consulta el cache. Si hit, se usa sin llamar al worker.
- El cache es por contenido, no por sesión: editar el texto invalida automáticamente (hash distinto).
- Las secciones tier 2 usan sufijos versionados (`-v3`) para poder invalidar cache al cambiar el algoritmo.

---

## 9. Diseño de interfaz

### 9.1 Layout desktop (≥1024px)

```
┌─────────────────────────────────────────────────────────────┐
│ HEADER (52px, slim)                                          │
│ ScriptLab · [Canvas|Timeline|Tele] · ●Salud72 ●Ret54% · ⚙↥⇥ │
├──────────────────────────────┬──────────────────────────────┤
│ EDITOR (flex)                │ READER (460px fijo)          │
│ ┌──────────────────────────┐ │ ┌──────────────────────────┐ │
│ │ Paleta de bloques        │ │ │ ●●●○  estado             │ │
│ ├──────────────────────────┤ │ │                          │ │
│ │ META: Título · Promesa   │ │ │ ╭─────╮  ╭─────╮         │ │
│ │       WPM · Duración     │ │ │ │ 72  │  │ 54% │  ANILLOS │ │
│ ├──────────────────────────┤ │ │ ╰─────╯  ╰─────╯         │ │
│ │ Canvas (bloques)         │ │ │ Salud    Retención        │ │
│ │  scroll                  │ │ │                          │ │
│ │                          │ │ │ [Analizar a fondo]        │ │
│ │                          │ │ │                          │ │
│ │                          │ │ │ Desglose de salud ────    │ │
│ │                          │ │ │ Curva de retención ───    │ │
│ │                          │ │ │ Estructura ───────────   │ │
│ │                          │ │ │ Diagnóstico semánt. ─── (grisado) │
│ │                          │ │ │ Tus datos reales ▸       │ │
│ └──────────────────────────┘ │ └──────────────────────────┘ │
└──────────────────────────────┴──────────────────────────────┘
```

### 9.2 Header slim (sidebar izquierdo absorbido)

- **Izquierda:** marca `ScriptLab` (con "Lab" en acento).
- **Centro-izq:** control segmentado Canvas / Timeline / Tele.
- **Derecha (siempre visible):**
  - **Eco mini de los dos anillos** (`●Salud 72 · ●Retención 54%`) — el usuario nunca pierde los números mientras escribe.
  - **Pill de IA** (`IA local · 2 modelos`) con punto pulsante si está activo.
  - Iconos: ⚙ (configurar IA), ↥ (exportar), ⇥ (modo enfoque, colapsa el Reader).

### 9.3 Barra de metadatos (entre paleta y canvas)

Dos filas:
```
[ Título ___________________ ] │ [ Promesa ___________________ ]
[ Voz ‒‒‒○‒‒ 150 WPM ]        │ [ Duración objetivo ‒‒○‒‒ 3:00 ]
```
- Título y Promesa son `input[type=text]` full-width.
- WPM y Duración objetivo son sliders con valor tabular a la derecha.
- Separadores verticales sutiles (`div-v`) entre pares.

### 9.4 Editor

- **Paleta** horizontal scrollable de chips (uno por tipo de bloque), drag-to-canvas.
- **Bloques** apilados verticalmente, cada uno con:
  - Borde izquierdo coloreado según tipo.
  - Header: tipo · índice.
  - Título editable (input inline).
  - Textarea de contenido (auto-grow).
  - Footer: `N palabras · M s` + etiqueta de calidad (`Óptimo`/`Revisar`/`Crítico`/`Vacío`) + botón eliminar.
- **Drag & drop** para reordenar y para insertar desde la paleta (con indicadores top/bottom).
- **Incrementalidad:** al editar un bloque, sólo se actualiza su footer (palabras, calidad), no se re-renderiza toda la lista. `flowDirty` controla el re-render completo (sólo al añadir/eliminar/reordenar).

### 9.5 Reader (panel de métricas)

**Scroll vertical continuo de secciones** (no pestañas). De arriba a abajo:

1. **Estado** — pips `●●●○` + texto companion.
2. **Dos anillos hero** — Salud (púrpura, "/100") + Retención (teal, "% APV"). Cada uno con sub-línea epistémica: "validado" / "calculada".
3. **Botón "Analizar a fondo"** — único botón del panel. Debajo, microcopy de qué incluye.
4. **Desglose de salud** — barras: Hook, Claridad, Ritmo, Promesa. (tier 1, tiempo real)
5. **Curva de retención** — mini-chart con punto rojo en riesgo de fuga. (tier 1)
6. **Estructura** — chips ✓/✗ por tipo de bloque. (tier 1)
7. **Diagnóstico semántico** — grisado hasta "Analizar a fondo". Contiene: Repetición, Ideas centrales, Ritmo de temas, Cobertura IA. (tier 2)
8. **Tus datos reales (YouTube)** — colapsable. Form de calibración.
9. **Pie** — leyenda epistémica y de privacidad.

### 9.6 Modo enfoque

Botón ⇥ colapsa el Reader a 0 width (animación). El editor ocupa todo. El eco de anillos del header sigue visible. Volver a pulsar restaura.

### 9.7 Tema claro / oscuro

- Toggle en header (◐).
- Dark por defecto (`--bg:#0d1117` y familia).
- Light simétrico vía variables CSS.
- `theme-color` meta para la barra del navegador.

### 9.8 Lenguaje de UI (renombrado)

| Antes (cripto) | Ahora |
|---|---|
| Métricas / ICN | **Salud del guion** |
| Retención / APV | **Retención estimada** |
| Resumen Extractivo | **Ideas centrales** |
| Redundancia Global | **Repetición** |
| Densidad Temática/min | **Ritmo de temas** |
| Huecos Detectados | **Estructura** (estructural) + **Cobertura** (semántica) |
| Calibración | **Tus datos reales (YouTube)** |
| Claridad FH | **Claridad** (tooltip con fórmula) |
| "Análisis IA" (pestaña) | **(desaparece — se integra al relato)** |

---

## 10. Responsive y mobile

### 10.1 Breakpoints

| Rango | Comportamiento |
|---|---|
| ≥1024px | Layout 2 zonas (editor + reader 460px). |
| 768–1023px | Reader se reduce a 380px. |
| <768px | **Mobile**: editor a pantalla completa, métricas como bottom-sheet colapsable. |

### 10.2 Mobile — editor-first

- El editor ocupa toda la pantalla: header slim + paleta + meta bar (compacta, Promesa y sliders en una sola fila colapsable) + canvas.
- **Bottom-sheet "Métricas"** pegado al borde inferior:
  - Estado colapsado: handle de arrastre + `Métricas · ●Salud 72 · Ret 54%`.
  - Al tocar: se desliza hacia arriba como hoja modal mostrando los dos anillos + secciones scrollables.
  - El tier 2 ("Analizar a fondo") vive dentro del sheet expandido.
- La meta bar en mobile colapsa Promesa/WPM/Duración bajo un control para no comer altura de escritura.

### 10.3 Decisión explícita

Mobile es **editor-first**: la prioridad es escribir. Las métricas son una feature colapsable, no un panel permanente. Esto honra P1 (el diagnóstico es el producto) sin sacrificar la usabilidad de escritura en pantalla chica.

---

## 11. Modos de IA y modelos locales

### 11.1 Dos modos

| Modo | Modelos | Tamaño | Qué activa |
|---|---|---|---|
| **Heurístico** (básico) | ninguno | 0 | Sólo tier 1 heurístico (Salud, estructura) + Retención (matemática pura). Sin embeddings ni sentimiento. |
| **Modo IA** | embeddings + sentiment | ~110 MB | Todo: alineación, redundancia, arco emocional, retención con arco, tier 2 completo. |

**No hay tier "PRO"** (lección de v25/v18: NER pesaba 670 MB y era prescindible para guion). NER queda **fuera de alcance** de v4.

### 11.2 Modelos

| Modelo | Origen | Uso | Notas |
|---|---|---|---|
| `multilingual-e5-small` | Xenova (transformers.js) | Embeddings para alineación, redundancia, extractivo, densidad, cobertura | Norma L2 habilitada → dot = coseno. |
| `robertuito-sentiment-analysis` | pysentimiento, cuantizado ONNX | Arco emocional, engagement, momentum | Optimizado para español. ~50–60 MB. |

### 11.3 Ciclo de vida del worker (heredado de v16, mejorado)

`syncWorkerWithState()` es el **único punto de control** del estado de los workers:
- Si `aiMode === 'embeddings'` y no hay worker → `initWorker()`.
- Si `aiMode === 'embeddings'` y hay worker → `scheduleAI()` + `scheduleSentiment()`.
- Si `aiMode === 'basic'` → termina workers, limpia resultados, resetea UI.

Se llama en: boot, nuevo proyecto, importar proyecto, cambio de modo. El usuario no gestiona nada manualmente.

### 11.4 Persistencia de modelos

- transformers.js guarda los modelos en **Cache Storage** del navegador, no en IndexedDB ni en el SW cache.
- Tras la primera descarga, funcionan offline.
- El pill de IA muestra "2 modelos" cuando están disponibles.

---

## 12. Importación / Exportación

### 12.1 Exportar

| Formato | Extensión | Contenido |
|---|---|---|
| JSON | `.scriptlab.json` | `{ app, version, project, analysis, calibration }` — completo, re-importable |
| Markdown | `.md` | Guion legible: `## 1. HOOK: título` + contenido + notas. Incluye `**ICN:** N/100`. |
| HTML | `.html` | Documento standalone estilado, para compartir/imprimir. |

### 12.2 Importar

- **JSON** (`.scriptlab.json`): normaliza y reemplaza el proyecto actual (con confirmación).
- **Markdown** (`.md`): parsea `## N. TIPO: título` → bloques. Extrae título (`# `) y promesa (`**Promesa:**`).
- **No** se soportan otros formatos (.docx, .pdf) en v4.

---

## 13. Módulos del sistema

### 13.1 `state.js`
**Responsabilidad:** constantes de dominio (`T`, `HEURISTICS`, `PREDEFINED_TOPICS`), objeto `state`, `normalizeProject()`, `markAnalysisDirty()`, `contentHash()`, helpers puros (`time`, `esc`).
**No hace:** DOM, workers, DB.
**Depende de:** nadie.

### 13.2 `db.js`
**Responsabilidad:** `openDB`, `put`, `get`, `all`, `del`, `migrateLegacy`. Schema IDB.
**No hace:** dominio, DOM.
**Depende de:** nadie.

### 13.3 `ai-shared.js`
**Responsabilidad:** primitivas matemáticas y léxicas compartidas entre main y workers: `sanitizeText`, `sanitizeSentimentText`, `dot`, `cosineSim`, `syllables`, `wordCount`, `sentenceCount`, `fernandezHuerta`, `durationInSeconds`, `overlap`.
**No hace:** DOM.
**Depende de:** nadie. Importable por workers (ES module).

### 13.4 `scoring.js`
**Responsabilidad:** motor ICN puro. `computeAnalysis()`, `analysis()` (memo), `quality()`, `splitSentences`, `splitIntoSegments`.
**No hace:** DOM (testeable en aislamiento), workers.
**Depende de:** `state.js`, `ai-shared.js`.

### 13.5 `workers.js`
**Responsabilidad:** ciclo de vida y mensajería de los 3 workers. `initWorker`, `initSentimentWorker`, `initRetentionWorker`, `syncWorkerWithState`, `scheduleAI`, `scheduleSentiment`, `scheduleRetention`, `workerSend`, `handleWorkerResult`, `downloadModel`, `updateAnalysisTabState`, `setAIActivity`, `setRenderCallbacks`.
**No hace:** DOM directo (lo hace vía callbacks inyectados).
**Depende de:** `state.js`, `db.js`, `scoring.js`.

### 13.6 `render.js`
**Responsabilidad:** todo el DOM y los gráficos. `render`, `renderMetrics`, `renderRetentionPanel`, `renderSentimentArc`, `renderTimeline`, `renderTele`, `draw` (canvas ICN), `renderCal`, `renderRetentionChart`, `renderDensityChart`, `view`, `saveDebounced`, `addBlock`, `bindBlocks`, `updateBlockFooterLocally`. Se registra en `workers.js` al cargar.
**No hace:** lógica de scoring, orquestación de workers.
**Depende de:** `state.js`, `scoring.js`, `ai-shared.js`, `db.js`, `workers.js`.

### 13.7 `export-import.js`
**Responsabilidad:** `exportJSON`, `exportMarkdown`, `exportHTML`, `importProject`, `parseMarkdownToBlocks`, `download`, `fileSlug`.
**Depende de:** `state.js`, `db.js`.

### 13.8 `main.js`
**Responsabilidad:** `boot()`, `bind()` (todos los eventos DOM), `bindAnalysis()` (botones tier 2), y las funciones tier 2 (`runExtractive`, `runRedundancy`, `runDensity`, `runGaps`) que ahora viven aquí (fusionado de `analysis-ui.js`).
**Depende de:** todos.

### 13.9 Workers (hilos separados)
- `ai-worker.js`: carga e5-small, responde INIT/EMBED/EXTRACT/REDUNDANCY/DENSITY/GAPS.
- `sentiment-worker.js`: carga robertuito, responde INIT/SENTIMENT.
- `retention-worker.js`: motor heurístico documentado, responde PREDICT_RETENTION. Sin modelo.

### 13.10 `sw.js`
Service worker para offline. Cache de los archivos de la app (no de modelos). Nombrado con versión `?v=N`.

### 13.11 `diagnostics.js`
Helper de diagnóstico (estado de boot, flags). Carga primero.

---

## 14. Criterios de aceptación por módulo

### 14.1 scoring.js
- [ ] `computeAnalysis()` no referencia `document` ni `window`.
- [ ] ICN siempre en [0, 100].
- [ ] `analysis()` memoiza correctamente (segunda llamada sin dirty no recalcula).
- [ ] Hook implícito detectado y penalizado (×0.7).
- [ ] Calibración aplica (≥5 registros) y es idempotente.

### 14.2 workers.js
- [ ] `syncWorkerWithState()` termina workers al pasar a básico y limpia resultados.
- [ ] `scheduleAI` respeta debounce de 700ms y consulta cache antes de llamar al worker.
- [ ] Los resultados push (EMBED_RESULT, SENTIMENT_RESULT) disparan render vía callbacks.
- [ ] Errores de worker no rompen la UI (caught + `setAIActivity('error')`).

### 14.3 retention-worker.js
- [ ] APV siempre en [15, 95].
- [ ] Confianza siempre en [0, 0.85].
- [ ] Curva generada con un punto por bloque con contenido.
- [ ] `isDropRisk` true cuando retention < 0.35.
- [ ] Cada peso documentado con su fuente en el código.

### 14.4 render.js
- [ ] Edición de un bloque NO re-renderiza toda la lista (sólo su footer).
- [ ] `flowDirty=true` fuerza re-render completo; `false` lo omite.
- [ ] Anillos se actualizan ante cualquier cambio de Salud/Retención.
- [ ] La sección tier 2 aparece grisada hasta "Analizar a fondo".

### 14.5 main.js
- [ ] `boot()` carga proyecto, workers, registra callbacks, renderiza.
- [ ] `bind()` cubre todos los controles del header, meta bar, paleta, bloques, teleprompter.
- [ ] "Analizar a fondo" dispara los 4 análisis en paralelo (`Promise.allSettled`) y actualiza la sección al resolver.
- [ ] Import/export en los 3 formatos funciona round-trip (JSON → importar → exportar JSON = mismo contenido).

### 14.6 UI / UX
- [ ] El usuario ve Salud y Retención sin tocar nada (tier 1 automático tras cargar modelos).
- [ ] El usuario entiende qué falta (pips + sección grisada).
- [ ] "Analizar a fondo" es el único botón de análisis visible.
- [ ] Mobile: editor a pantalla completa, métricas colapsables.
- [ ] Modo enfoque colapsa el reader.
- [ ] Dark/light toggle funciona.

### 14.7 Rendimiento
- [ ] La UI no se bloquea >50ms al escribir (todo lo pesado está en workers o debounced).
- [ ] Boot en <2s en el proyecto promedio (sin descarga de modelos).
- [ ] Primer cálculo de retención en <500ms (matemática pura).

---

## 15. Criterios epistémicos (validado vs calculado vs heurístico)

Cada métrica lleva una etiqueta visible (tooltip o sub-línea) que comunica su origen:

| Etiqueta | Significado | Ejemplos |
|---|---|---|
| **Validado** | Basado en una fórmula publicada con respaldo académico primario y常数 fijas. | Claridad (Fernández-Huerta 1959) |
| **Calculado** | Producido por un modelo o por matemática sobre los datos reales del guion. Preciso como cómputo, pero su *interpretación* es una proyección. | Alineación (embeddings), Retención estimada |
| **Heurístico** | Regla transparente con justificación cualitativa, sin validación formal como sistema. Pesos internos. | Hook score, Ritmo, Estructura |

**Regla de transparencia (P5):** nunca se presenta un número heurístico como si fuera validado. La sub-línea del anillo dice "validado"/"calculada". En el código, todo peso sin fuente primaria directa se marca `[NO VALIDADO — peso heurístico]`.

**Regla de escala original (P9):** cuando se traslada una métrica de una escala académica a otra del sistema (p.ej. VADER `−4..+4` → valencia `−1..+1`), la traslación solo se hace si es lineal y simétrica. Si la traslación no es limpia o introduce supuestos, se **usa la escala académica original** y se documenta la conversión al usuario, aunque sea menos prolijo. La honestidad epistémica pesa más que la elegancia.

---

## 16. Restricciones y compatibilidad

### 16.1 Navegadores
- Chrome/Edge ≥110, Firefox ≥115, Safari ≥16.
- **La app se sirve vía `http(s)` o `localhost`** (servidor local o hosting estático). No se soporta `file://` porque Chrome/Edge/Opera (Chromium) bloquean los `import` de ES modules por CORS; Firefox sí los permite, pero no es requisito.
- ES modules requieren `type="module"` (soportado en el rango anterior).
- **Servidor local mínimo:** cualquiera que sirva archivos estáticos (`python -m http.server`, `npx serve`, extensión de VS Code Live Server, hosting estático tipo GitHub Pages/Netlify).

> **Enmienda (2026-07-20):** el requisito original "Debe funcionar con file://" se quitó por contradicción insalvable con §3.1 (ES modules) en navegadores Chromium. Aprobado por el humano.

### 16.2 Dependencias externas
- **Chart.js 4.4.7** vía CDN. La app debe degradar con gracia si no carga (los números y textos siguen funcionando; los charts se omiten).
- **transformers.js** (`@huggingface/transformers` **v3.7.2**) cargada con **`import()` dinámico dentro del handler INIT del worker**, desde **bare URL de jsdelivr SIN path**.
  - URL canónica: `https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2` (sin `/dist/...mjs`)
  - **⚠️ Lección aprendida (5 intentos, resuelta copiando el patrón del software base v18):**
    1. ❌ `import map` del documento padre → Chromium no lo hereda en module Workers.
    2. ❌ `import` estático desde URL absoluta → Chromium rechaza el worker entero al cargar.
    3. ❌ jsdelivr `/dist/transformers.min.mjs` → build Node crudo (importa `fs`/`path`/`url`) → crash `"Failed to resolve module specifier 'fs'"`.
    4. ❌ esm.sh v3.0.0 → polyfilla Node, pero el CDN de HF bloquea CORS desde localhost.
    5. ✅ **Bare URL sin path (v3.7.2)** + `env.allowRemoteModels = true` + `device: 'wasm'` → **FUNCIONA**.
  - **Regla fijada (patrón exacto):**
    ```js
    const TRANSFORMERS_URL = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.7.2';
    async function init() {
      const { pipeline, env } = await import(TRANSFORMERS_URL);
      env.useBrowserCache = true;
      env.allowRemoteModels = true;       // NO usar allowLocalModels=false
      extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small', {
        device: 'wasm',                   // explícito
        // NO usar quantized: true (default dtype q8)
        progress_callback: (p) => { ... }
      });
    }
    ```
  - **Por qué bare URL y no `/dist/...mjs`:** la bare URL deja que jsdelivr elija el build correcto vía el campo `browser`/`module` del `package.json` (browser-ready). El path `.mjs` fuerza el build crudo de Node.
  - Mejora futura: actualizar a v4 para WebGPU (`device: 'webgpu'`).

### 16.3 Privacidad
- Ningún texto sale del navegador.
- La única red es: descarga de modelos (1ª vez), Chart.js CDN.
- No hay analytics, no hay telemetría.

### 16.4 Límites prácticos
- Guiones de hasta ~200 bloques (más allá, los embeddings pairwise se vuelven lentos).
- Modelo de embeddings: 512 tokens por texto (truncado por e5-small).

---

## 17. Glosario

| Término | Definición |
|---|---|
| **APV** | Audiencia que permanece viendo (retención promedio). Métrica de YouTube Studio. |
| **ICN** | Índice de Calidad Narrativa. El "Salud del guion", 0–100. |
| **Hook implícito** | Primer bloque que funciona como hook sin tener tipo HOOK (detectado por pregunta/brevedad/urgencia). |
| **Contraste narrativo** | Par de bloques semánticamente similares pero de tono opuesto (estructura válida, no redundancia). |
| **Pattern interrupt** | Cambio visual/narrativo que resetea la atención (GIRO/VISUAL). |
| **Cobertura estructural** | Presencia de tipos de bloque esenciales (sin IA). |
| **Cobertura semántica** | Presencia de conceptos (Problema/Solución/Cierre) vía centroides de embeddings. |
| **Tier 1 / Tier 2** | Cómputo automático vs bajo demanda. |
| **Salud / Retención** | Los dos anillos hero. |
| **Reader** | El panel de métricas (derecho). |
| **Meta bar** | Barra de Título/Promesa/WPM/Duración entre paleta y canvas. |

---

## Apéndice A — Base de evidencia de la recalibración de pesos (§7.3)

La recalibración de los 9 pesos del modelo de retención se basó en research sistemático (2026-07-20). Cada fuente está clasificada por su nivel de evidencia. **Regla del proyecto:** ningún peso es arbitrario; los que carecen de fuente académica primaria se basan en inferencia de segunda fuente y se documentan como tal.

### Niveles de evidencia

| Nivel | Significado | Confianza en el peso |
|---|---|---|
| **PRIMARIA causal** | Estudio académico con diseño experimental/quasi-experimental que establece causalidad | Alta |
| **PRIMARIA teoría** | Teoría académica establecida (peer-reviewed) aplicada por inferencia | Media-alta |
| **PRIMARIA fórmula** | Fórmula validada en publicación académica | Alta (para la fórmula; media para su mapeo) |
| **SECUNDARIA convergente** | Múltiples fuentes independientes (industria/analítica) que coinciden | Media |
| **SECUNDARIA correlacional** | Una fuente secundaria, correlación sin causalidad demostrada | Baja-media |
| **SECUNDARIA indirecta** | La fuente mide algo adyacente (p.ej. conversión, no retención) | Baja |

### Bibliografía por factor

#### Hook strength (0.25)
1. **PrePublish (2026)**. Análisis de 5.000 YouTube scripts + datos de retención. Scripts con value claim en primeros 15 s retienen 52% vs 44%. [SECUNDARIA convergente] — https://prepublish.ai/guides/first-30-seconds
2. **Think with Google (2024)**. Creator Insights. Hooks estructuralmente fuertes = +47% AVD. [SECUNDARIA] — thinkwithgoogle.com
3. **Backlinko**. YouTube ranking factor research, 1.3M videos. Mayor caída: ventana 30–45 s. [SECUNDARIA] — backlinko.com
4. **RetentionRabbit (2025)**. *Beyond Views: The 2025 State of YouTube Audience Retention*. Value prop en primeros 15 s = +18% retención al minuto 1. 55% de viewers perdidos al minuto 1. [SECUNDARIA] — retentionrabbit.com
5. **Paddy Galloway**. Cita pública: +10% retención = diferencia entre 100k y 1M views. [SECUNDARIA]

#### Pacing / segmentación (0.17)
6. **Seidel, N. (2024)**. *Short, Long, and Segmented Learning Videos: From YouTube Practice to Enhanced Video Players*. Technology, Knowledge and Learning (Springer), 29, 1965–1991. DOI: 10.1007/s10758-024-09745-2. Estudio sobre 1.419 canales educativos + experimento controlado (N=22). **[PRIMARIA]** — https://link.springer.com/article/10.1007/s10758-024-09745-2
7. **PrePublish (2026)**. "Pacing variation is a stronger retention predictor than vocabulary quality". [SECUNDARIA]

#### Pattern interrupts (0.14)
8. **Kahneman, D. (1973)**. *Attention and Effort*. Prentice-Hall. Orienting response. **[PRIMARIA teoría]**
9. **Sokolov, E.N. (1963)**. *Perception and the Conditioned Reflex*. Pergamon. Modelo neuronal de habituación. **[PRIMARIA teoría]**
10. **ytshark / longstories (2026)**. Pattern interrupt en primeros 5 s = +23% retención. [SECUNDARIA]
11. **EdicionVideoPro (2026)**. Interrupts cada 3–5 s = +40–60% retención (200+ TikToks). [SECUNDARIA]

#### Emotional arc (0.11) — ↑ recalibrado
12. **Berger, J., Levermann et al. (2026)**. *How should content creators narrate their content? The impact of emotionality flips on audience engagement*. Journal of the Association for Consumer Research / Springer. **Evidencia causal** sobre 33.598 podcasts de YouTube + 3.381 TED Talks + experimentos de laboratorio. Arousal = mecanismo confirmado. **[PRIMARIA causal]** — https://link.springer.com/article/10.1007/s11747-026-01147-3
13. **Song et al. (2023)**. *Exploring the Neural Processes behind Narrative Engagement*. eNeuro 10(7). Engagement sigue el dramatic arc; predecible por actividad neural (dISC). **[PRIMARIA]** — https://www.eneuro.org/content/10/7/ENEURO.0484-22.2023
14. **Knobloch-Westerwick, S. et al. (2015)**. *The Eudaimonic Entertainment Experience*. Journal of Communication. [PRIMARIA]

#### Umbrales de salto tonal §7.6.1 (recalibrados)
30. **Hutto, C.J. & Gilbert, E.E. (2014)**. *VADER: A Parsimonious Rule-based Model for Sentiment Analysis of Social Media Text*. Proceedings of the Eighth International Conference on Weblogs and Social Media (ICWSM). Lexicon de 7.500 features validados por 10 raters humanos, escala −4..+4. **[PRIMARIA fórmula / lexicon validado]** — https://github.com/cjhutto/vaderSentiment
> *Nota:* VADER da la escala de valencia continua; los umbrales de banda (0.25/0.50/0.75) son **inferencia** sobre esa escala normalizada (÷4), no validación directa sobre retención. La traslación es lineal y simétrica → considerada válida. Si la traslación no fuera limpia, se usaría la escala original (principio epistémico §15).

#### Content density (0.11)
15. **Miller, G.A. (1956)**. *The Magical Number Seven, Plus or Minus Two*. Psychological Review, 63(2), 81–97. Working memory 7±2 chunks. **[PRIMARIA teoría]**
16. **Sweller, J. (1988)**. *Cognitive Load During Problem Solving*. Cognitive Science, 12(2), 257–285. Cognitive Load Theory. **[PRIMARIA teoría]**
17. **AERO (2023)**; **ACER (2022)**. Chunking mejora recall y engagement activo. [SECUNDARIA]

#### Promise delivery (0.09)
18. **RetentionRabbit (2025)**. Value prop en primeros 15 s correlaciona con +18% retención al minuto 1 (no causal). [SECUNDARIA correlacional]
19. **PrePublish (2026)**. Payoff-at-15 test. [SECUNDARIA]

#### Readability (0.07)
20. **Fernández Huerta, J. (1959)**. *Medidas sencillas de lecturabilidad*. Consigna, 214, 29–32. Adaptación española de Flesch. Constantes 206.84, 60, 1.02. **[PRIMARIA fórmula]** — confirmado en PMC5831059, PMC8507699.
> *Nota:* la fórmula es validada; el mapeo "FH → retención de video hablado" es inferencial.

#### CTA placement (0.03) — ↓ recalibrado
21. **ClixieAI (2025)**. Mid-roll CTAs convierten 16.95% vs end-roll. [SECUNDARIA indirecta — mide conversión]
22. **Wistia**. Guías de placement por duración. [SECUNDARIA indirecta]
23. **sender.net (2026)**. Video CTAs promedian ~16% conversión. [SECUNDARIA indirecta]
> *Nota crítica:* toda la evidencia de CTA mide **conversión**, no **retención**. Por eso el peso es el más bajo. El CTA afecta al espectador que ya decidió quedarse, no si se queda.

#### Narrative completeness (0.03)
24. **Song et al. (2023)**. eNeuro (ver #13). El engagement sigue el dramatic arc. **[PRIMARIA]**
25. **USC study**. 70% de top-grossing films siguen un framework narrativo reconocible. [SECUNDARIA]
26. **Booker, C. (2004)**. *The Seven Basic Plots*. Continuum. [PRIMARIA teórica]

### Datos de benchmark de curva (para §7.3 baseline)
27. **Wistia (2025)**. State of Video Report. 800.000+ videos analizados. Completion promedio ~45%.
28. **RetentionRabbit (2025)**. Overall average retention 23.7%; 55% perdidos al minuto 1.
29. **PrePublish (2026)**. Benchmarks por duración: <5 min 65–75%, 5–10 min 50–60%, 10–15 min 40–50%, 15+ min 35–45%.

### Limitaciones reconocidas (transparencia epistémica)

- Ningún estudio valida el **conjunto de los 9 pesos como sistema**. Cada peso se justifica individualmente; la suma ponderada es una agregación inferida.
- La mayoría de la evidencia cuantitativa de retención proviene de analítica de industria (PrePublish, RetentionRabbit, Backlinko), no de investigación académica peer-reviewed con datos crudos de YouTube (eso no es público).
- La evidencia **académica primaria con causalidad** existe para: arco emocional (Berger 2026), segmentación (Seidel 2024), orienting response (Kahneman 1973), cognitive load (Sweller 1988), legibilidad (Fernández-Huerta 1959).
- El modelo debe presentarse siempre como **guía direccional**, no como predicción precisa. El clamp [15, 95] y el cap de confianza 0.85 reflejan esto.

> **Regla de oro del proyecto (acordada con el usuario):** en el código (`retention-worker.js`), cada peso y cada constante numérica lleva un comentario con la cita de su fuente. Si se agrega o modifica un peso, debe agregarse/actualizarse la cita. No se aceptan valores sin documentación.

---

*Fin del documento. Pendiente de aprobación antes de iniciar implementación.*
