# PLAN.md — ScriptLab AI v4

**Generado por:** Sombrero Planificador
**Fecha:** 2026-07-20
**Contrato de referencia:** `scriptlab-v4-tech-contract.md` (v1.0 final)
**Estado:** Pendiente de aprobación humana antes de pasar al Sombrero Ingeniero.

---

## 0. Mapa de hitos (visión general)

Sequencia ordenada por dependencia, siguiendo §13 y §3.2:

| Hito | Alcance | Módulos | Naturaleza |
|---|---|---|---|
| **H1** | Núcleo puro y testeable | `state.js`, `db.js`, `ai-shared.js`, `scoring.js`, `retention-worker.js` | Sin DOM, sin runtime UI. 100% testeable en Node. |
| **H2** | Workers runtime | `ai-worker.js`, `sentiment-worker.js`, `workers.js` | Web Workers + modelos. Necesita navegador para prueba E2E. |
| **H3** | UI y render | `render.js`, `export-import.js`, `styles.css`, `index.html`, `main.js` | DOM, gráficos, wireframe v4. |
| **H4** | Extras y responsive | `sw.js`, `diagnostics.js`, responsive/mobile, integración E2E | Offline, mobile bottom-sheet, ajustes finales. |

**Mapa de dependencias (qué bloquea qué):**
```
H1.state ←─ H1.scoring
H1.ai-shared ←─ H1.scoring
H1.ai-shared ←─ H1.retention (decisión pendiente D1)
H1 (todo) ←─ H2.workers
H2 (todo) ←─ H3.render ←─ H3.main
H1.scoring ←─ H3.render
H3 (todo) ←─ H4.integración
```

---

## Hito 1 — Núcleo puro y testeable

**Objetivo del hito:** Implementar toda la lógica analítica que **no toca el DOM ni requiere runtime de navegador**. Cada módulo debe poder ejecutarse y testearse en Node puro. Al cerrar este hito, el motor analítico (ICN + retención) queda completo, documentado y verificado — independientemente de que aún no haya UI.

**Salida esperada del hito:**
- 5 archivos de módulo (`state.js`, `db.js`, `ai-shared.js`, `scoring.js`, `retention-worker.js`)
- 3 archivos de tests (`ai-shared.test.js`, `scoring.test.js`, `retention.test.js`)
- `AUDIT-REPORT.md` sección H1.

---

### T-01 — `state.js`: constantes de dominio, helpers y contenedor de estado

**Implementa:** §13.1, §4.1, §8.1, §8.2
**Dependencias:** ninguna.
**Criterios de aceptación (§14):** indirectos (todos los demás módulos dependen de esto).

**Contenido a implementar:**
- Constante `T` (7 tipos de bloque con nombre + color, exactamente §8.2).
- Constante `TRASH_SVG` (ícono SVG inline, usado por render en H3).
- Constante `HEURISTICS` (4 entradas: Fernández-Huerta, Hook, Ritmo visual, CTA — para el catálogo del panel).
- Constante `PREDEFINED_TOPICS` (§7.5): 5 estructurales (`kind:'structural'` con `blockType`) + 3 semánticos (`kind:'semantic'` con `examples: string[3]` en español rioplatense).
- Objeto `state` exportado con todos los campos de §4.1 (project, flags, workers, resultados, calRecords, misc).
- `normalizeProject(raw)` → Project saneado (§8.1). Validar aiMode ∈ {basic, embeddings}, clamp wpm [115,185], clamp targetDuration [0,3600].
- `markAnalysisDirty()` → pone `state.analysisDirty=true` y `state.cachedAnalysis=null`.
- `contentHash(value)` → FNV-1a hash → base36 (para claves de cache, §8.4).
- Helpers puros: `time(s)` → `m:ss`, `esc(s)` → escape HTML.

**Definición de DONE:**
- `state.js` no tiene ni un `import` (§3.3).
- `normalizeProject({})` devuelve proyecto válido con un bloque vacío de ninguna parte (array vacío) y defaults correctos.
- `normalizeProject` acepta `{project:{...}, blocks:[...]}` y `{...}` plano (legacy).
- `contentHash('')` y `contentHash('x')` no colisionan; `contentHash` es determinista.

**Riesgos/notas:**
- El objeto `state` referencia campos de worker (`worker`, `retentionWorker`, `sentimentWorker`) que arrancan en `null`. §13.1 dice state.js "no hace workers" — esto se respeta porque state.js no *crea* workers, solo contiene las refs. Confirmado conforme al contrato.

---

### T-02 — `ai-shared.js`: primitivas puras (matemáticas + léxicas)

**Implementa:** §13.3
**Dependencias:** ninguna.
**Criterios de aceptación (§14):** base para §14.1 (scoring) y §14.3 (retención).

**Contenido a implementar (funciones exportadas, todas puras):**
- `sanitizeText(text)` — para embeddings e5-small: quita control chars, zero-width, BOM, surrogates rotos, PUA, non-characters, fuera de BMP (excepto CJK común + latin extendido). Default `' '` si vacío.
- `sanitizeSentimentText(text)` — para robertuito BPE: más agresivo, latin imprimible + tildes, quita misc symbols/variation selectors. Default `'texto'` si ≤3 chars.
- `dot(a, b)` — producto escalar.
- `cosineSim(a, b)` — similitud coseno con guard div/0.
- `syllables(w)` — cuenta sílabas en español (NFD, vocales, hiato/diptongo básico). Mínimo 1.
- `wordCount(text)` — regex `\p{L}\p{N}` con apóstrofes/guiones. 0 si vacío.
- `sentenceCount(text)` — split por `[.!?]+`, filter trim. Mínimo 1.
- `fernandezHuerta(text)` — **206.84 − 60·(sílabas/palabra) − 1.02·(palabras/oración)**, clamp [0,100]. Citación inline de Fernández-Huerta 1959.
- `durationInSeconds(text, wpm=150)` — `round(wordCount / wpm · 60)`.
- `overlap(a, b)` — boolean: ¿comparten palabras ≥4 letras?

**Definición de DONE:**
- Ningún `import` (§3.3). Importable desde main thread y workers.
- `fernandezHuerta` lleva comentario con cita: `// Fernández Huerta (1959), Consigna 214, 29-32. Constantes 206.84/60/1.02.`
- `sanitizeText('')` y `sanitizeText(null)` devuelven `' '`; no lanzan.
- `cosineSim` de un vector consigo mismo ≈ 1.0; de ortogonales ≈ 0.

**Riesgos/notas:**
- `sanitizeSentimentText` tiene su propio tokenizer-specific sanitizer (robertuito BPE ≠ e5). No unificar, según nota heredada de v16.

---

### T-03 — `db.js`: IndexedDB (CRUD + migración legacy)

**Implementa:** §13.2, §8.3
**Dependencias:** ninguna de dominio.
**Criterios de aceptación (§14):** indirectos (usado por workers, render, main).

**Contenido a implementar:**
- `openDB()` — abre DB `scriptlab-ai` versión **4**. `onupgradeneeded` crea 6 stores si no existen: `projects`, `snapshots`, `calibrations`, `settings`, `analysisCache`, `modelRegistry` (todos `keyPath:'id'`). Memoiza la conexión.
- `put(store, value)`, `get(store, id)`, `all(store)`, `del(store, id)` — wrappers Promise sobre transacciones readwrite/readonly.
- `migrateLegacy()` — si no hay flag `scriptlab-idb-migrated` y existe `localStorage['scriptlab-ai-project-v1']`, lo parsea, lo migra a `projects` con `id:'active'`, marca el flag. Idempotente.

**Definición de DONE:**
- `db.js` no importa de `state.js` ni de ningún módulo de dominio (§3.3).
- Las 6 stores existen tras `openDB()` en un DB nuevo.
- `migrateLegacy` corre sin romper si localStorage está vacío o el JSON está corrupto (try/catch + warn).

**Riesgos/notas:**
- `openDB` referencia `indexedDB` global — eso es aceptable: §3.3 prohíbe DOM (`document`/`window`), no IDB. Pero como IDB no existe en Node, los tests de este módulo requieren un polyfill o se dejan para prueba en navegador. Lo marco: T-03 no lleva test en Node; se prueba en H4 (integración) o con `fake-indexeddb` si el humano lo aprueba (decisión pendiente D2).

---

### T-04 — `scoring.js`: motor ICN puro

**Implementa:** §13.4, §7.1
**Dependencias:** T-01 (state.js), T-02 (ai-shared.js).
**Criterios de aceptación (§14.1) — todos deben pasar:**
- `computeAnalysis()` no referencia `document` ni `window`.
- ICN siempre en [0, 100].
- `analysis()` memoiza correctamente (segunda llamada sin dirty no recalcula).
- Hook implícito detectado y penalizado (×0.7).
- Calibración aplica (≥5 registros) y es idempotente.

**Contenido a implementar:**
- `computeAnalysis(project = state.p, calRecords = state.calRecords)` → objeto `{ hs, cl, pa, pr, score, rawIcn, calibrated, reference, r }`.
  - Hook score `hs`: detección de hook implícito (primer bloque con pregunta `¿?`, o <30 palabras, o regex urgencia), base 20, +20 long óptima (15–80), +15 pregunta, +10 números, +20 overlap con promesa, +10 urgencia; ×0.7 si implícito. Clamp 100.
  - Claridad `cl`: FH con penalización bidireccional (>90 penaliza infantil; 60–80 óptimo; <40 muy difícil).
  - Ritmo `pa`: visuales/giros + varianza de longitud de oraciones (CV óptimo 0.3–1.0).
  - Promesa `pr`: binario, overlap hook↔promise → 75 o 20.
  - `rawIcn = round(hs·0.31 + cl·0.22 + pa·0.22 + pr·0.17 + (CTA?8:0))`, clamp [0,100].
  - `reference`: si `calRecords.length >= 5`, promedio de los últimos 5 `.apv`; si no, null.
  - `score = reference===null ? rawIcn : round(rawIcn·0.7 + reference·0.3)`.
  - Riesgos `r`: array de `[severidad, texto, blockId?]`.
- `analysis()` — memo con `analysisDirty`/`cachedAnalysis`.
- `quality(block, a)` → `[label, clase]` (Óptimo/Revisar/Crítico/Vacío → good/warn/bad).
- `splitSentences(text)` — split por `[.!?]+`, filter len>10.
- `splitIntoSegments(text, wpm)` — segmentos de 1 min (wpm palabras).

**Definición de DONE:**
- `computeAnalysis` firma opcional (project, calRecords) → **testeable sin state** (pasar args explícitos).
- `import` solo de `state.js` y `ai-shared.js` (§3.3).
- `import { fernandezHuerta, overlap } from './ai-shared.js'` para no duplicar.

**Casos de test obligatorios (T-06):**
1. Guion vacío → score válido (no NaN, en [0,100]).
2. Hook explícito con pregunta + promesa con overlap → hs alto.
3. Hook implícito (primer bloque CONTEXTO con pregunta) → hs = mismo cálculo × 0.7.
4. Sin hook → `r` contiene "Sin Hook definido".
5. Calibración <5 registros → `calibrated:false`, `score===rawIcn`.
6. Calibración ≥5 registros → `calibrated:true`, `score ≈ rawIcn·0.7 + avg·0.3`.
7. FH>90 → cl penalizado (no se infla por "muy fácil").
8. `analysis()` llamada 2× sin mutar → misma referencia (memo).
9. `analysis()` tras `markAnalysisDirty()` → recalcula.

---

### T-05 — `retention-worker.js`: motor heurístico de retención

**Implementa:** §13.9, §7.3 (con Apéndice A), §6.3
**Dependencias:** T-02 (ai-shared.js) — **sujeto a D1**.
**Criterios de aceptación (§14.3) — todos deben pasar:**
- APV siempre en [15, 95].
- Confianza siempre en [0, 0.85].
- Curva generada con un punto por bloque con contenido.
- `isDropRisk` true cuando retention < 0.35.
- Cada peso documentado con su fuente en el código.

**Contenido a implementar:**
- Constante `WEIGHTS` con los 9 pesos recalibrados del §7.3 (Hook 0.25, Pacing 0.17, Pattern interrupts 0.14, Emotional arc 0.11, Content density 0.11, Promise delivery 0.09, Readability 0.07, CTA 0.03, Narrative 0.03). **Cada peso con su cita inline** (tomar literal del §7.3.1–7.3.9).
- Constante `RETENTION_CURVES` con `baseline` y `strongHook` (valores del §7.3, baseline Wistia 2025 / RetentionRabbit 2025).
- 8 funciones `analyzeX(block, ...)`: `analyzeHook`, `analyzePacing`, `analyzePatternInterrupts`, `analyzeContentDensity`, `analyzePromiseDelivery`, `analyzeReadability`, `analyzeCTA`, `analyzeNarrativeCompleteness`. Cada una devuelve `{ score:0-100, formula:string, ...detalles }` con cita de umbrales inline.
- `generateRetentionCurve(blocks, wpm, hookAnalysis)` → puntos por bloque con modificadores (+0.03–0.08 interrupt, −0.04 largo >50s, −0.06 >80s, +0.03 CTA, −0.15 vacío, isDropRisk<0.35).
- `computeRetentionPrediction({ blocks, wpm, promise, title })` → salida completa según schema §6.3 (`overallRetention`, `confidence`, `curve`, `scores`, `weights`, `insights`, `risks`, `recommendations`, `formula`, `meta`).
- `self.onmessage` wrapper que rutea `PREDICT_RETENTION`.

**Arquitectura para testeabilidad (propuesta sujeta a D3):**
Separar la lógica pura (`computeRetentionPrediction` y las 8 analyzeX) en un módulo importable `retention-engine.js`, y dejar `retention-worker.js` como wrapper delgado que importa el engine y solo hace `self.onmessage`. Así la lógica se testea en Node sin levantar el worker. **El contrato §13.9 nombra solo `retention-worker.js`**, así que esto es una decisión pendiente.

**Definición de DONE:**
- `overallRetention` siempre en [15,95] (incluso con input degenerate como guion vacío).
- `confidence = min(0.85, 0.3 + contentBlocks·0.05)`.
- `isDropRisk` true iff `retention < 0.35`.
- Suma de los 9 pesos = 1.00 (verificable en test).
- **CADA peso y cada umbral numérico lleva comentario con cita.** Sin excepciones (regla de oro §7.3).
- Salida respeta schema §6.3 campo por campo.

**Casos de test obligatorios (T-06):**
1. Guion vacío → overallRetention en [15,95], curve=[], confidence razonable.
2. 1 bloque con contenido → overallRetention válido, curve con 1 punto.
3. Hook score≥60 → usa curva `strongHook`.
4. Bloque vacío → modifier −0.15 aplicado.
5. `confidence` con 0 bloques con contenido = 0.3; con muchos, cap en 0.85.
6. Suma `Object.values(WEIGHTS).reduce(+) === 1.0` (tolerancia 1e-9).
7. APV nunca <15 ni >95 (probar con todos los scores en 0 y en 100).
8. Cada peso tiene comentario de cita (test de grep/regex sobre el fuente).

---

### T-06 — Tests unitarios de los módulos puros

**Implementa:** soporte a §14.1, §14.3, P6 (scoring puro y testeable).
**Dependencias:** T-02, T-04, T-05.

**Contenido a implementar:**
- `tests/ai-shared.test.js` — cubre sanitizeText/sanitizeSentimentText (casos raros: vacío, null, emoji, surrogate roto, CJK), fernandezHuerta (texto simple, texto denso, vacío), cosineSim (paralelo, ortogonal, cero), wordCount/sentenceCount, overlap.
- `tests/scoring.test.js` — los 9 casos listados en T-04.
- `tests/retention.test.js` — los 8 casos listados en T-05, incluyendo el grep de citas.
- `tests/run.js` (o equivalente) — mini runner de asserts planos que imprime PASS/FAIL por caso y sale con código !=0 si hay fallos. Sin dependencias externas (sin Vitest/Jest). **Sujeto a D2.**

**Definición de DONE:**
- `node tests/run.js` corre los 3 archivos y reporta "X/Y tests pasaron".
- Exit code ≠ 0 si alguno falla.
- Cobertura: todos los casos borde listados en T-04 y T-05.

---

## Orden sugerido de ejecución (Hito 1)

```
T-01 (state.js)        ──┐
T-02 (ai-shared.js)  ──┼──→ T-04 (scoring.js) ──┐
T-03 (db.js)         ──┘                         ├──→ T-06 (tests) ──→ AUDIT H1
                              T-02 ──→ T-05 (retention) ──┘
```

Lineal: **T-01 → T-02 → T-03 → T-04 → T-05 → T-06 → AUDIT(H1)**

---

## Decisiones pendientes (escalar al humano antes de implementar)

### D1 — ¿`retention-worker.js` importa `ai-shared.js` o duplica las primitivas?
El contrato §13.3 dice que ai-shared.js es "Importable por workers (ES module)", y §13.9 no especifica dependencias del retention worker. v16 duplicaba `fernandezHuerta`/`wordCount`/`syllables` localmente.
- **Opción A (recomendada):** `retention-worker.js` importa de `ai-shared.js` (DRY, una sola fuente de las fórmulas).
- **Opción B:** duplica localmente (aislamiento total del worker, sin import cruzado).
- *Mi recomendación:* A. Más mantenible y la cita de Fernández-Huerta vive en un solo lugar.

### D2 — ¿Runner de tests y polyfill de IDB?
- **Tests puros:** propongo asserts planos + mini `run.js` sin dependencias (respeta "sin build step" §3). ¿OK?
- **Tests de `db.js`:** IDB no existe en Node. Opciones: (a) usar `fake-indexeddb` (npm, introduce dependencia), (b) dejar `db.js` para prueba manual en navegador en H4. *Mi recomendación:* (b) — no meter deps. `db.js` es delgado y se valida en integración.

### D3 — ¿Separar `retention-engine.js` (lógica pura) de `retention-worker.js` (wrapper)?
Para que el motor de retención sea testeable en Node sin levantar un Worker, conviene separar:
- `retention-engine.js` — toda la lógica (`WEIGHTS`, analyzeX, computeRetentionPrediction). Importable.
- `retention-worker.js` — wrapper delgado: `import { computeRetentionPrediction } from './retention-engine.js'` + `self.onmessage`.

El contrato §13.9 solo nombra `retention-worker.js`. Agregar `retention-engine.js` es una **desviación del grafo de §3.2**. *Mi recomendación:* hacerlo igual (mejor testeabilidad, separación de concerns), pero necesito luz verde del humano porque toca el contrato. Alternativa: meter TODO dentro de `retention-worker.js` y testear solo vía navegador (peor).

### D4 — Idioma de los comentarios de citación
El §7.3 + Apéndice A dan las citas en formato español+inglés mixto. ¿Los comentarios inline en el código van en español (consistente con el resto del proyecto) o se copia literal las citas en inglés del Apéndice?
- *Mi recomendación:* español para la glosa, preservando nombres/autores/años en original. Ej: `// Hook 0.25 — PrePublish 2026 (5k scripts: 52% vs 44% retención); Think with Google 2024 (+47% AVD). [SECUNDARIA convergente]`

### D5 — `PREDEFINED_TOPICS` ejemplos en español rioplatense
§7.5 exige 3 oraciones ejemplo por tema semántico (Problema/Solución/Cierre) en "español rioplatense". El contrato no fija el texto exacto. ¿Los redacto yo (siguiendo el v3 que ya tenía ejemplos) o el humano provee los 9 textos? *Mi recomendación:* los redacto yo usando voseo ("tenés", "podés", "vas a") y los marco como revisables.

---

## Hito 2 — Workers runtime

**Objetivo del hito:** Implementar los 3 Web Workers de IA y la orquestación que los maneja desde el hilo principal. Esto desbloquea todo el tier 1 IA (alineación, redundancia baseline, arco emocional) y el tier 2 on-demand (repetición, ideas, ritmo, cobertura).

**Salida esperada del hito:**
- `ai-worker.js` — embeddings (transformers.js + e5-small)
- `sentiment-worker.js` — robertuito
- `workers.js` — orquestación con DI (`setRenderCallbacks`)
- `tests-harness-h2.html` — smoke estructural + integración con descarga opcional
- `AUDIT-REPORT.md` sección H2

**Restricción de testing de H2:** los modelos pesan ~110 MB y se descargan del CDN de HuggingFace. Los tests cubren (a) message schemas, (b) ciclo de vida de workers, (c) plumbing de DI, sin requerir la descarga. La prueba E2E con modelo real queda como **opcional/manual** (el humano puede descargar 1 vez para verificar).

---

### T-08 — `ai-worker.js`: embeddings con transformers.js

**Implementa:** §13.9 (ai-worker), §6.1, §7.2, §7.4, §7.5
**Dependencias:** T-02 (ai-shared.js — decisión D1 ya aplicada).

**Contenido a implementar:**
- `import { pipeline } from 'transformers'` (vía import map CDN — ver D6).
- Carga el modelo `Xenova/multilingual-e5-small` con `pipeline('feature-extraction', ..., { quantized: true })`. Norma L2 habilitada → dot = coseno.
- Handler `INIT`: descarga/instancia el modelo, emite PROGRESS (porcentaje) y READY.
- Handler `EMBED` (push, tier 1): recibe `texts: [{id, text, role}]`. Sanitiza con `sanitizeText`, antepone prefijo e5 (`query:`/`passage:` según rol), embedde, normaliza L2. Computa:
  - `alignment`: coseno(hook_emb, promise_emb) normalizado al baseline pairwise.
  - `alignmentRaw`: coseno bruto hook↔promise.
  - `redundancy`: 0–1 normalizado.
  - `baseline: { avgSim, maxSim, pairCount }`.
  - Emite `EMBED_RESULT`.
- Handler `EXTRACT_KEY_SENTENCES` (tier 2): oraciones vs centroide del guion, top-N por similitud. Emite `EXTRACT_RESULT`.
- Handler `COMPUTE_REDUNDANCY` (tier 2): pairwise, separa redundantes vs contrastes usando `valenceMap`. Emite `REDUNDANCY_RESULT`.
- Handler `COMPUTE_DENSITY` (tier 2): segmentos de 1 min, similitud global por segmento, cambios temáticos. Emite `DENSITY_RESULT`.
- Handler `DETECT_GAPS` (tier 2): centroides de los ejemplos de cada tema, umbral adaptativo `media−σ`. Emite `GAPS_RESULT`.

**Definición de DONE:**
- Respeta schemas §6.1 campo por campo (tipos, presencia).
- Sanitiza todos los inputs con `sanitizeText` antes de pasar al modelo.
- Errores del modelo se capturan y emiten `ERROR` (no crashean el worker).
- Cualquier texto vacío/truncado produce embedding cero (no rompe el pairwise).

**Riesgos/notas:**
- El modelo truncado a 512 tokens por texto (§16.4) — transformers.js lo maneja solo.
- El prefijo e5 (`query:`/`passage:`) es **obligatorio** para que los embeddings sean correctos. Si se omite, las similitudes quedan descalibradas.

---

### T-09 — `sentiment-worker.js`: robertuito

**Implementa:** §13.9 (sentiment-worker), §6.2, §7.6
**Dependencias:** T-02 (ai-shared.js — `sanitizeSentimentText`).

**Contenido a implementar:**
- Carga `Xenova/robertuito-sentiment-analysis` (ver D7 para confirmar nombre exacto). `pipeline('text-classification', ..., { quantized: true })`.
- Handler `INIT`: PROGRESS + READY.
- Handler `SENTIMENT`: por cada texto, sanitiza con `sanitizeSentimentText`, clasifica → `label: POS|NEG|NEU`, `score`. Convierte a valencia `−1..1`:
  - POS: `+score`, NEG: `−score`, NEU: `0`.
- Computa agregados:
  - `sentimentArc`: [{ blockId, blockIndex, blockType, label, valence }] por bloque.
  - `engagementScore`: `min(1, varianza(valencias)·2 + |media|·0.5)`.
  - `emotionalMomentum`: `media(último tercio) − media(primer tercio)`.
  - `tonalJumps`: transiciones con `|Δvalencia| ≥ 0.3`, con severidad (alto si Δ≥0.6, medio si ≥0.45, bajo si ≥0.3).
- Emite `SENTIMENT_RESULT`.

**Definición de DONE:**
- Respeta schema §6.2.
- `engagementScore` siempre en [0,1]; `valence` siempre en [−1,1].
- Maneja bloques vacíos (los salta, no aparecen en `sentimentArc`).

---

### T-10 — `workers.js`: orquestación + DI

**Implementa:** §13.5, §4 (uso de state), §5.1/5.2 (schedulers), §11.3 (ciclo de vida)
**Dependencias:** T-01 (state.js), T-03 (db.js), T-04 (scoring.js). **NO importa render.js (§3.3).**

**Contenido a implementar:**
- `setRenderCallbacks(metricsCb, retentionCb, sentimentArcCb)` — registra los 3 callbacks (DI).
- `setAIActivity(kind, text)` — actualiza el pill de IA (selector `#ai-activity`).
- `initWorker()` — crea ai-worker, cablea onmessage (PROGRESS/READY/EMBED_RESULT/ERROR + handleWorkerResult), manda INIT.
- `initSentimentWorker()` — análogo para robertuito, con flag `sentimentReady`.
- `initRetentionWorker()` — crea retention-worker, cablea RETENTION_RESULT → setRetentionResult + callback.
- `syncWorkerWithState()` — **único punto de control** (§11.3): según `state.p.aiMode` inicializa/termina workers y resetea resultados.
- `scheduleAI()` — debounce 700ms, consulta cache IDB, si miss → manda EMBED.
- `scheduleSentiment()` — debounce 700ms (closure separada, no en state), manda SENTIMENT.
- `scheduleRetention()` — manda PREDICT_RETENTION (sin debounce: se pide explícito).
- `workerSend(type, data)` — request/response con `analysisCallbacks[requestId]`.
- `handleWorkerResult(d)` — resuelve promesas pendientes.
- `downloadModel()` — dispara initWorker (para el botón "Descargar modelo").
- `updateAnalysisTabState()` — togglea visibilidad de la sección tier 2 según modo.

**Definición de DONE:**
- `workers.js` **no importa** nada de `render.js` (verificable por grep).
- Errores de worker → `setAIActivity('error')` + no rompen UI.
- `syncWorkerWithState` al pasar a `basic` termina los 3 workers y limpia resultados en `state`.
- Los callbacks inyectados son llamados en los momentos correctos (EMBED_RESULT → metricsCb, RETENTION_RESULT → retentionCb, SENTIMENT_RESULT → sentimentArcCb).

**Riesgos/notas:**
- `scheduleSentiment` usa una variable de closure para su timer (no va en `state`, regla de v16).
- El flujo push (EMBED_RESULT) es distinto del request/response (EXTRACT/REDUNDANCY/DENSITY/GAPS). El handler de onmessage del ai-worker rutea correctamente ambos.

---

### T-11 — Tests harness H2

**Implementa:** soporte a §14.2 + §6.1/6.2/6.3 message schemas.
**Dependencias:** T-08, T-09, T-10.

**Contenido:**
- `tests-harness-h2.html` — sirve vía localhost (no file://, lección de H1).
- Tests estructurales (sin descargar modelos):
  - `workers.js` no importa `render.js` (verificable).
  - `setRenderCallbacks` expone los 3 registros.
  - `syncWorkerWithState` con `aiMode='basic'` no crea workers.
  - `workerSend` devuelve Promise y registra callback.
  - Schemas: comparar tipo/campos de cada mensaje esperado vs el que produce cada handler (mockeando el pipeline).
- Tests E2E **opcionales** (manual, con descarga de modelos):
  - INIT del ai-worker emite READY.
  - EMBED de 3 textos → EMBED_RESULT con `alignment`, `redundancy`, `baseline`.
  - SENTIMENT de 3 textos → SENTIMENT_RESULT con `sentimentArc`, `engagementScore`, `emotionalMomentum`, `tonalJumps`.

**Definición de DONE:**
- Tests estructurales pasan sin descargar modelos (rápidos, sin red).
- El humano puede correr los E2E manualmente cuando quiera validar el modelo real.

---

## Orden sugerido de ejecución (Hito 2)

```
T-08 (ai-worker)      ──┐
T-09 (sentiment-worker) ─┤──→ T-10 (workers.js) ──→ T-11 (tests) ──→ AUDIT H2
```

Lineal: **T-08 → T-09 → T-10 → T-11 → AUDIT(H2)**

---

## Decisiones pendientes de H2 (escalar al humano)

### D6 — ¿Cómo cargar transformers.js?
El contrato §16.2 deja abierto: "bundled dentro de los workers o cargado vía CDN/import map". Opciones:
- **A) Import map con CDN (esm.sh)** — `<script type="importmap">` mapea `transformers` a `https://esm.sh/@xenova/transformers@2.x`. Los workers hacen `import { pipeline } from 'transformers'`. Cero build step, descarga del CDN en runtime. *Mi recomendación: A.*
- **B) Bundlear transformers.js local** — más trabajo, peor para actualizar.

### D7 — Confirmar nombres exactos de los modelos en HuggingFace
- `Xenova/multilingual-e5-small` (embeddings) — confirma, es el estándar.
- `robertuito-sentiment-analysis` — el contrato dice "pysentimiento, cuantizado ONNX". Candidatos en HF:
  - `Xenova/robertuito-sentiment-analysis` (versión cuantizada Xenova, si existe)
  - `pysentimiento/robertuito-sentiment-analysis` (original)
  - *Mi recomendación:* usar `Xenova/robertuito-sentiment-analysis` si existe; si no, `pysentimiento/robertuito-sentiment-analysis`. Lo verifico al implementar.

### D8 — ¿Umbral de salto tonal?
El contrato §7.6 fija `|Δvalencia| ≥ 0.3` para saltos. Severidad: alto si Δ≥0.6, medio si ≥0.45, bajo si ≥0.3. *Mi recomendación:* dejarlo (consistente con el contrato).

---

## Resumen para aprobación

- **3 módulos + 1 harness** en el Hito 2.
- 3 decisiones pendientes (D6, D7, D8). D6 y D7 son las que realmente afectan implementación.

**Pregunto al humano:**
1. ¿Aprobás el plan del Hito 2?
2. D6: import map con CDN (esm.sh) — ¿OK?
3. D7: nombres de modelos — ¿confirmás o me dejas a criterio?
4. D8: umbral de salto tonal 0.3/0.45/0.6 — ¿lo dejamos?

Con tus respuestas paso al **Sombrero Ingeniero** (T-08 → T-11), cierro con auditoría del H2.


## Hito 3 — UI y render

**Objetivo del hito:** Implementar toda la interfaz de usuario según el wireframe v4: layout de 2 zonas (editor + Reader), header slim, meta bar, los dos anillos hero estilo Apple Fitness, sección "Analizar a fondo" on-demand, y el lenguaje de UI renombrado. Al cerrar H3 la app es funcional end-to-end (escribir → ver métricas → analizar a fondo).

**Salida esperada:**
- `index.html` — estructura DOM del wireframe v4
- `styles.css` — design tokens (CSS vars), dark/light, layout 2 zonas, responsive
- `export-import.js` — JSON/Markdown/HTML
- `render.js` — todo el DOM, bloques, drag&drop, Reader, anillos, charts, incrementalidad
- `main.js` — boot, bind, "Analizar a fondo", integración
- `tests-harness-h3.html` — smoke de UI + integración E2E
- `AUDIT-REPORT.md` sección H3

---

### T-12 — `index.html`: estructura DOM del wireframe v4

**Implementa:** §9.1 (layout), §9.2 (header slim), §9.3 (meta bar), §9.4 (editor), §9.5 (reader)
**Dependencias:** ninguna (solo HTML estático).

**Contenido:**
- `<head>`: meta tags, `theme-color`, `<link rel="stylesheet" href="./styles.css">`, `<script src="chart.js CDN">` con fallback, `<script type="module" src="./main.js">` al final del body.
- `<header>` slim: marca + control segmentado (Canvas/Timeline/Tele) + eco mini de anillos + pill IA + iconos ⚙↥⇥◐.
- `<main>` con 2 zonas:
  - `<section class="editor">`: paleta + meta bar (Título/Promesa/WPM/Duración) + canvas de bloques + panels Timeline/Tele.
  - `<aside class="reader">` (460px): estado (pips), dos anillos SVG, botón "Analizar a fondo", secciones (desglose, curva, estructura, diagnóstico semántico grisado, datos reales colapsable).
- `<dialog id="aidialog">`: configurar IA (Heurístico / Modo IA + descarga modelo).
- Sin JS inline (todo en main.js/render.js).

**Definición de DONE:**
- La estructura coincide con el wireframe v4 (sidebar izquierdo absorbido en header).
- IDs y classes coinciden con los que usan render.js / main.js (contrato implícito).
- Funciona con `http://localhost` (no file://, lección H1/H2).

---

### T-13 — `styles.css`: design tokens + layout + componentes

**Implementa:** §9.7 (tema), §10 (responsive), estética Apple-minimal del wireframe v4.
**Dependencias:** T-12 (estructura HTML a estilar).

**Contenido:**
- CSS vars (`--bg`, `--panel`, `--border`, `--text`, `--muted`, `--purple`, `--teal`, `--good`, `--warn`, `--bad`, colores de tipos de bloque).
- Layout grid/flex de 2 zonas, reader 460px fijo desktop, 380px tablet, bottom-sheet mobile.
- Componentes: paleta de chips, bloques (borde color tipo), meta bar (sliders), anillos SVG hero, barras de desglose, curva de retención mini, chips ✓/✗ de estructura, botón "Analizar a fondo" con estado loading.
- Dark default + light simétrico vía `.light` en `<body>`.
- Estados: `flow-block.selected`, `.dragover-top/bottom`, `.highlighted`, sección tier 2 `.pending` (grisada con guiones).
- Modo enfoque: `.reader.collapsed` colapsa a 0 width con transición.
- Mobile bottom-sheet: `.metrics-sheet` pegado abajo, expandible.

**Definición de DONE:**
- Variables CSS centralizadas; sin colores hardcoded.
- Dark/light toggle funciona.
- Layout se ve como el wireframe v4 (proporciones, espaciados, tipografía system).
- Responsive: en <768px el reader se convierte en bottom-sheet.

---

### T-14 — `export-import.js`: JSON / Markdown / HTML

**Implementa:** §13.7, §12.
**Dependencias:** T-01 (state.js — normalizeProject), T-03 (db.js).

**Contenido:**
- `download(data, name, type)` helper genérico.
- `fileSlug(text)`.
- `exportJSON(project, analysis, calibration)` → `.scriptlab.json` con `{app, version, project, analysis, calibration}`.
- `exportMarkdown(project, analysis)` → `# title` + `**Promesa:**` + `**ICN:**` + `## N. TIPO: label` + contenido.
- `exportHTML(project, analysis)` → HTML standalone estilado.
- `parseMarkdownToBlocks(md)` → bloques (regex `## N. TIPO: título`).
- `importProject(onDone)` — file input, JSON o MD, confirmación, normalizeProject, persist, callback.

**Definición de DONE:**
- Round-trip JSON → importar → exportar JSON = mismo contenido.
- MD parsea bloques por tipo y extrae título/promesa.
- HTML export es standalone (abrir sin servidor).

---

### T-15 — `render.js` (parte 1): editor + bloques + meta bar + incrementalidad

**Implementa:** §13.6 (render principal), §9.3 (meta bar), §9.4 (editor + drag&drop), §4.2 (mutaciones).
**Dependencias:** T-01, T-02, T-04, T-03, T-10 (workers.js para scheduleAI/scheduleSentiment/setRenderCallbacks).

**Contenido:**
- `render()` — orquestador: rellena meta bar, re-renderiza flow si `flowDirty`, dispara renderMetrics/scheduleAI/scheduleSentiment/renderTimeline/renderTele/draw/renderSentimentArc.
- `bindBlocks()` — eventos por bloque: click select, textarea oninput (incremental: solo update footer + metrics + scheduleAI/Sentiment), title input, delete, drag&drop (palette + reordenar con indicadores top/bottom).
- `addBlock(type, insertBefore)`, `view(id)`, `saveDebounced()`.
- `updateBlockFooterLocally(article, block, a)` — actualización incremental del footer sin re-render.
- Registro en workers.js vía `setRenderCallbacks(renderMetrics, renderRetentionPanel, renderSentimentArc)`.

**Definición de DONE:**
- Editar un bloque NO re-renderiza toda la lista (solo su footer) — §14.4.
- `flowDirty=true` fuerza re-render completo; `false` lo omite.
- Drag&drop paleta→canvas y reordenar funcionan.
- Mutaciones marcan analysisDirty + debauncean save.

---

### T-16 — `render.js` (parte 2): Reader (anillos, desglose, curva, estructura, tier 2 grisado, datos reales, modo enfoque)

**Implementa:** §9.5 (reader), §9.6 (modo enfoque), §5.3 (pips de estado).
**Dependencias:** T-15.

**Contenido:**
- `renderMetrics(a)` — actualiza anillo Salud (SVG dashoffset), barras de desglose (Hook/Claridad/Ritmo/Promesa), riesgos + insight, eco mini en header.
- `renderRetentionPanel()` — actualiza anillo Retención (SVG dashoffset), score/confianza/duración/bloques, curva Chart.js (o SVG si Chart.js no cargó — fallback), score grid 8 factores, risks/recs.
- `renderSentimentArc()` — secuencia de puntos por bloque (😊/😟/😐), engagement/momentum/saltos.
- `renderTimeline()`, `renderTele()`, `draw(a)` (canvas ICN, si hay), `renderCal()`, `renderHeuristics()`.
- `renderRetentionChart(curve)`, `renderDensityChart(result)` — Chart.js con fallback.
- `updateAnalysisTabState()` (si no está en workers.js).
- Sección tier 2 aparece grisada con guiones hasta "Analizar a fondo".
- Modo enfoque: clase `.reader.collapsed`.

**Definición de DONE:**
- Anillos se actualizan ante cualquier cambio de Salud/Retención.
- Sección tier 2 grisada hasta "Analizar a fondo".
- Modo enfoque colapsa el reader.
- Charts degradan con gracia si Chart.js no carga (números + texto siguen funcionando).

---

### T-17 — `main.js`: boot + bind + "Analizar a fondo"

**Implementa:** §13.8, §5.2 (tier 2 on-demand), §11.3 (syncWorkerWithState en boot).
**Dependencias:** T-15, T-16, T-10, T-14, T-12.

**Contenido:**
- `boot()` — openDB, migrateLegacy, setProject(normalizeProject(get('projects','active'))), setCalRecords(all('calibrations')), build palette, bind(), render(), `syncWorkerWithState()`, `initRetentionWorker()`, `bindAnalysis()`.
- `bind()` — todos los eventos: header (views, theme, toggle panels, focus mode, export menu, import, new), meta bar (title/promise/wpm/targetDuration oninput), AI dialog (mode-basic/mode-ai/download-model), calibración form, teleprompter (TTS), "Analizar a fondo" button.
- `bindAnalysis()` — bind de los botones tier 2 (que ahora viven dentro del botón único "Analizar a fondo").
- `runDeep()` — dispara en paralelo con `Promise.allSettled` los 4 análisis tier 2 (extract, redundancy, density, gaps) y rellena la sección al resolver; muestra estado de carga.
- `runExtractive`, `runRedundancy`, `runDensity`, `runGaps` — wrappers que llaman `workerSend` y renderizan resultados (pares redundantes/contrastes, ideas centrales, ritmo de temas, cobertura estructural+semántica).
- `boot().catch()` — banner de error rojo si falla.

**Definición de DONE:**
- `boot()` carga proyecto, workers, registra callbacks, renderiza — §14.5.
- `bind()` cubre todos los controles.
- "Analizar a fondo" dispara los 4 análisis en paralelo y actualiza la sección al resolver.
- Import/export en los 3 formatos funciona round-trip.

---

### T-18 — `tests-harness-h3.html`: smoke de UI + integración E2E

**Implementa:** soporte a §14.4, §14.5, §14.6.
**Dependencias:** T-12 a T-17.

**Contenido:**
- Smoke DOM: header presente, paleta con 7 chips, meta bar con 4 inputs, reader con 2 anillos SVG, botón "Analizar a fondo" visible, sección tier 2 grisada inicialmente.
- Smoke incremental: editar un bloque no re-renderiza toda la lista (verificar que el DOM de otros bloques no cambia).
- Smoke de cómputo: escribir en un bloque actualiza el anillo Salud en tiempo real (sin tocar nada).
- Smoke tier 2: clic "Analizar a fondo" (modo IA) rellena la sección que estaba grisada.
- E2E opcional con modelos: armar guion de prueba, verificar todos los anillos + secciones se llenan.

**Definición de DONE:**
- Tests smoke pasan sin descargar modelos (los que no requieren IA).
- La app abre vía localhost y es funcional end-to-end.

---

## Orden sugerido de ejecución (Hito 3)

```
T-12 (index.html) ──→ T-13 (styles.css) ──→ T-14 (export-import) ──→ T-15 (render p1) ──→ T-16 (render p2) ──→ T-17 (main) ──→ T-18 (tests) ──→ AUDIT H3
```

Lineal: **T-12 → T-13 → T-14 → T-15 → T-16 → T-17 → T-18 → AUDIT(H3)**

---

## Decisiones pendientes de H3 (escalar al humano)

### D9 — ¿Cómo cargar Chart.js?
Contrato §16.2: Chart.js 4.4.7 vía CDN con fallback. Propongo `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js">` en `<head>` (no module, global `Chart`), y verificar `typeof Chart !== 'undefined'` antes de instanciar. *Mi recomendación: así.*

### D10 — ¿Anillos hero en SVG puro o con librería?
El wireframe v4 los hace con SVG puro (`stroke-dasharray` + `stroke-dashoffset` animado). Es liviano, sin dependencias, y se ve idéntico a Apple Fitness. *Mi recomendación: SVG puro.*

### D11 — ¿Iconos SVG inline o librería (Heroicons/Lucide)?
El wireframe usa SVG inline para los pocos iconos que hay (Canvas/Timeline/Tele, ⚙↥⇥◐, trash). *Mi recomendación: SVG inline (sin librería).*

### D12 — ¿Mobile bottom-sheet en H3 o H4?
El contrato §10.2 define el bottom-sheet mobile. H4 es "Extras y responsive". *Mi recomendación:* layout desktop + tablet en H3; mobile bottom-sheet en H4. Pero el CSS puede prepararse en H3 (media queries) y solo el JS de interacción va a H4.

### D13 — ¿Proyecto inicial al primer boot?
Si no hay proyecto guardado en IDB, ¿mostrar guion vacío con onboarding (placeholder + hint) o un guion de ejemplo precargado? *Mi recomendación:* guion vacío + empty state con hint ("Arrastrá bloques desde la barra superior").

---

## Resumen para aprobación

- **6 tareas (T-12 a T-18)** que producen 5 archivos + harness.
- 5 decisiones pendientes (D9–D13). Todas con mi recomendación.

**Pregunto al humano:**
1. ¿Aprobás el plan del Hito 3?
2. D9: Chart.js vía `<script>` en head con fallback — ¿OK?
3. D10: anillos SVG puro — ¿OK?
4. D11: iconos SVG inline — ¿OK?
5. D12: mobile bottom-sheet en H4 (CSS preparado en H3) — ¿OK?
6. D13: guion vacío + empty state al primer boot — ¿OK?

Con tus respuestas paso al **Sombrero Ingeniero** (T-12 → T-18), cierro con auditoría del H3.


## Hito 4 — Extras, mobile y offline

**Objetivo del hito:** Completar la app con responsive mobile funcional (bottom-sheet JS), service worker para offline, y los ajustes finales de integración/pulido. Al cerrar H4 la app es producción-ready.

**Salida esperada:**
- `sw.js` — service worker con cache de archivos de la app
- `diagnostics.js` — helper de diagnóstico
- `main.js` — JS del bottom-sheet mobile (tap-to-expand)
- `styles.css` — pulido final, micro-animaciones, ajustes Apple-like
- `AUDIT-REPORT.md` sección H4

**Mejoras acumuladas de UI ya aplicadas en H3.5:**
- ✅ BigInt fix en sentiment-worker (batching + retry)
- ✅ Arco emocional estilo ECG (sin emojis)
- ✅ Meta bar en header de 2 filas + auto-hide al scrollear
- ✅ Pill de IA siempre informando (refreshAIActivityPill)
- ✅ Fix import JSON (data.project → data completo)

---

### T-19 — `sw.js`: service worker para offline

**Implementa:** §13.10, §3.4 (la app funciona sin SW, pero con SW queda offline).
**Dependencias:** ninguna.

**Contenido:**
- Cache estática con nombre versionado (`scriptlab-v4-v1`).
- `install`: pre-cachea los archivos core (index.html, styles.css, *.js, *.json).
- `activate`: limpia caches viejas.
- `fetch`: cache-first para mismos-origin, network-first para CDN (Chart.js, transformers).
- NO cachea los modelos (eso lo hace transformers.js via Cache Storage).

**Definición de DONE:**
- La app carga offline (sin red) tras la 1ra visita.
- Los modelos siguen cacheados por transformers.js (no por el SW).

---

### T-20 — `diagnostics.js`: helper de diagnóstico

**Implementa:** §13.11.
**Dependencias:** ninguna.

**Contenido:**
- Detecta y reporta: browser, versión, soporta Web Workers, soporta module Workers, soporta IndexedDB, soporta Cache Storage.
- Función `runDiagnostics()` que devuelve un objeto plano.
- Útil para debugging si algo falla en producción.

**Definición de DONE:**
- Carga sin romper la app si algún feature no está disponible.

---

### T-21 — Bottom-sheet mobile (JS)

**Implementa:** §10.2.
**Dependencias:** T-12 (index.html), T-13 (styles.css ya preparado).

**Contenido (en main.js):**
- Detectar mobile (<768px).
- Tap en el handle del reader (o en la cabecera del bottom-sheet) → toggle `.expanded`.
- Cerrar al tap fuera del sheet expandido o con botón.
- Sincronizar con eco mini de anillos del header (que ya está oculto en mobile, no aplica).

**Definición de DONE:**
- En mobile (<768px), tap en el handle expande el reader como hoja modal.
- Tap fuera (overlay) lo cierra.

---

### T-22 — Pulido Apple-like final

**Implementa:** principios estéticos del wireframe v4.
**Dependencias:** T-12, T-13.

**Contenido (styles.css):**
- Micro-animaciones: hover states más suaves, transitions en ring-card, fade-in de secciones.
- Sombra y profundidad más sutiles (Apple usa sombras muy suaves).
- Tipografía: tabular-nums en todos los números, jerarquía más clara.
- Espaciado: más respiración donde haga falta.
- Anillos: animación inicial del dashoffset (entrada).

**Definición de DONE:**
- La app se siente más Apple: transiciones suaves, espacio negativo, micro-feedback.
- No se rompe ningún layout existente.

---

### T-23 — Registro del SW en main.js

**Implementa:** §3.4 (SW opcional).
**Dependencias:** T-19, T-17.

**Contenido:**
- `if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');`
- Sin versión en URL (no es crítico con cache-first).

**Definición de DONE:**
- El SW se registra tras boot sin bloquear la UI.

---

## Orden sugerido de ejecución (Hito 4)

```
T-19 (sw.js) ──→ T-20 (diagnostics.js) ──→ T-21 (mobile JS) ──→ T-22 (pulido) ──→ T-23 (registro SW) ──→ AUDIT H4
```

Lineal: **T-19 → T-20 → T-21 → T-22 → T-23 → AUDIT(H4)**

---

## Decisiones pendientes de H4 (escalar al humano)

### D14 — ¿Pre-cachear archivos en SW en `install`?
Dos enfoques:
- **A) Pre-cache hardcodeado:** lista de archivos en `install`. Simple, pero hay que mantenerla.
- **B) Cache on-demand:** se cachean a medida que se piden. Cero mantenimiento, pero primera visita offline no funciona (solo segunda visita).
- *Mi recomendación:* B (cache on-demand). Más simple, cero mantenimiento, suficiente para "offline tras primera visita".

### D15 — ¿Versión en URL del SW (`./sw.js?v=N`)?
Ayuda a invalidar caches viejos. *Mi recomendación:* sí, con número de versión simple.

---

## Resumen para aprobación

- **5 tareas (T-19 a T-23)** que producen 2 archivos nuevos + ediciones a main.js y styles.css.
- 2 decisiones pendientes (D14, D15). Ambas con mi recomendación.

**Pregunto al humano:**
1. ¿Aprobás el plan del Hito 4?
2. D14: cache on-demand para el SW — ¿OK?
3. D15: versión en URL del SW (`./sw.js?v=N`) — ¿OK?

Con tus respuestas paso al **Sombrero Ingeniero** (T-19 → T-23), cierro con auditoría del H4.
