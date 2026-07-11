/* =====================================================================
 * YouTube Script Lab — config.js
 * Constantes de datos: tipos de bloque, fuentes, stop-words, familias
 * de sinónimos, guion de ejemplo y catálogo de constantes del motor.
 *
 * Carga: debe cargarse PRIMERO (antes que model.js, render.js, app.js).
 * Expone: window.Config
 * ===================================================================== */

window.Config = (function () {
  'use strict';

  /* ---- Tipos de bloque (definición de UI + duración) ---- */
  const TYPES = {
    voice:  { label: 'Voz en off',         color: 'var(--voice)',  placeholder: 'Escribí la narración tal como se dirá. Ej: “En 1986, una llamada cambió...”' },
    visual: { label: 'Visual / B-roll',    color: 'var(--visual)', placeholder: 'Qué se ve: archivo, cámara, gráfico, recreación, zoom, mapa...' },
    screen: { label: 'Texto en pantalla',  color: 'var(--screen)', placeholder: 'Palabras exactas que aparecerán en pantalla. Ideal: 3 a 8 palabras.' },
    sfx:    { label: 'SFX / Música',       color: 'var(--sfx)',    placeholder: 'Golpe musical, silencio, riser, ambiente, corte sonoro...' },
    pause:  { label: 'Pausa / beat',       color: 'var(--pause)',  placeholder: 'Beat de silencio, respiración, transición o pausa dramática.' },
    cta:    { label: 'CTA / End screen',   color: 'var(--cta)',    placeholder: 'Llamado a comentar, suscribirse o ver el siguiente video. Mejor después de entregar valor.' },
    source: { label: 'Fuente / dato',      color: 'var(--source)', placeholder: 'URL, paper, dato verificable o nota de research. No suma duración.' }
  };

  /* ---- Stop-words para señales léxicas (heurística, sin validar) ---- */
  const STOP = new Set('a al algo algunas algunos ante antes como con contra cual cuando de del desde donde dos el ella ellas ellos en entre era eran es esa esas ese eso esos esta estaba estan estar este esto estos fue fueron ha habia han hasta hay la las le les lo los mas me mi mis muy no nos o para pero por porque que quien se sin sobre su sus te tiene todo tras tu tus un una unas uno unos y ya'.split(' '));

  /* ---- Familias de sinónimos/raíces para overlap léxico aproximado
   *       (heurística, sin validar) ---- */
  const SYNONYM_FAMILIES = [
    ['revel','descubr','mostr','expon'],
    ['decision','decid','eleccion','eleg'],
    ['mentir','engan','fals'],
    ['error','fall','problema','conflict','riesg'],
    ['cambi','transform','modific'],
    ['histori','caso','suces','hech'],
    ['prueba','evidenci','dato','fuente'],
    ['ocult','secret','invisibil']
  ];

  /* ---- Catálogo de fuentes consultadas durante el research empírico.
   *       Cada entrada: { t: título, a: autor/institución, y: año,
   *                       u: URL, d: qué mide/respalda,
   *                       kind: 'validated' | 'contextual' }
   *   - 'validated'    = source directly backs a constant used by the engine.
   *   - 'contextual'   = source informs the engine's design qualitatively
   *                      but does NOT back any specific number.
   * --------------------------------------------------------------------- */
  const SOURCES = [
    { t:'YouTube Help — Analytics basics', a:'Google/YouTube', y:'2024', u:'https://support.google.com/youtube/answer/9002587', d:'Tabs oficiales: Reach, Engagement, Audience; métricas como impresiones, CTR, watch time y AVD.', kind:'validated' },
    { t:'YouTube Help — Key moments for audience retention', a:'Google/YouTube', y:'2024', u:'https://support.google.com/youtube/answer/9314415', d:'Define Intro 30s, top moments, spikes, dips, audiencia por segmento y comparación con videos similares. Establece que las curvas “taper off” con caídas graduales.', kind:'validated' },
    { t:'YouTube Help — CTR FAQ', a:'Google/YouTube', y:'2024', u:'https://support.google.com/youtube/answer/7628154', d:'CTR varía por audiencia/fuente; rango típico 2–10%; alto CTR + bajo AVD sugiere clickbait.', kind:'validated' },
    { t:'YouTube Analytics API — Metrics', a:'Google Developers', y:'2024', u:'https://developers.google.com/youtube/analytics/metrics', d:'Definiciones oficiales: averageViewDuration, averageViewPercentage, estimatedMinutesWatched, audienceWatchRatio, relativeRetentionPerformance. Base validada de las métricas simuladas.', kind:'validated' },
    { t:'YouTube Blog — On YouTube’s recommendation system', a:'Google/YouTube', y:'2021', u:'https://blog.youtube/inside-youtube/on-youtubes-recommendation-system/', d:'Señales públicas de recomendaciones: clicks, watch time, encuestas, shares, likes y dislikes; foco en satisfacción.', kind:'validated' },
    { t:'The science of YouTube: a review of the empirical literature', a:'Singer et al. / PLOS ONE', y:'2022', u:'https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0267697', d:'Estudio académico con variables de engagement: views, shares, comments, AVD, average percentage viewed, subscribers; relación negativa de duración con views.', kind:'validated' },
    { t:'Legibilidad en español — Fernández-Huerta / INFLESZ', a:'Fernández-Huerta (1959); revisión SciELO', y:'1959/2008', u:'https://scielo.isciii.es/scielo.php?script=sci_arttext&pid=S1137-66272008000300004&lng=en&nrm=iso&tlng=en', d:'Adaptación de Flesch Reading Ease al español: fórmula 206.84 − 60·(silabas/palabra) − 1.02·(palabras/frase). Escala 0–100 donde más alto es más fácil.', kind:'validated' },

    /* ---- Fuentes contextuales añadidas en el research 2026 ---- */
    { t:'Measuring Audience Retention in YouTube', a:'Altman, E. & Jiménez, T. (EAI ValueTools)', y:'2019', u:'https://doi.org/10.1145/3306309.3306322', d:'Paper peer-reviewed. Documenta la forma cualitativa de la curva de retención (“nose-body-tail”, no monotónica). NO propone una interpolación algebraica específica — la forma lineal+easeOut usada acá es heurística.', kind:'contextual' },
    { t:'The evolution of pace in popular movies', a:'Cutting, J. E., Candan, A. & DeLong, J. E. (Cognitive Research: Principles and Implications)', y:'2016', u:'https://doi.org/10.1186/s41235-016-0029-0', d:'Cine contemporáneo ~4.3 s/toma (≈14 cortes/min); era silente ~7.5 s/toma (≈8/min). Contexto para ritmo visual — los targets del motor (3 y 8/min) no se derivan de este paper.', kind:'contextual' },
    { t:'Um, so, like, do speech disfluencies matter? A parametric evaluation of filler sounds and words', a:'Carlson, K., McStraw, J. & Bostow, S. (J Appl Behav Anal)', y:'2024', u:'https://pubmed.ncbi.nlm.nih.gov/38819033/', d:'Encuentra efecto umbral: ≤5 disfluencias/min aceptable, 12/min significativamente peor. Contradice el modelo lineal −1.2/filler del motor.', kind:'contextual' },
    { t:'The Psychology of Curiosity: A Review and Reinterpretation', a:'Loewenstein, G. (Psychological Bulletin)', y:'1994', u:'https://www.cmu.edu/dietrich/sds/docs/loewenstein/PsychofCuriosity.pdf', d:'Information-gap theory: la curiosidad surge de la brecha entre lo que se sabe y lo que se quiere saber. Apoyo cualitativo al bonus por palabras de tensión/curiosidad, sin magnitud reportada.', kind:'contextual' },
    { t:'Beyond Views: 2025 State of YouTube Audience Retention', a:'Retention Rabbit', y:'2025', u:'https://www.retentionrabbit.com/blog/2025-youtube-audience-retention-benchmark-report', d:'Benchmark industry (10.000+ videos): APV promedio 23.7%; How-To Educativo 42.1% vs Vlogs 21.5%; 55% drop a 60s; +18% retención con propuesta de valor clara en los primeros 15s. Apoyo direccional para ajustes por género y bonus por value promise, no para las magnitudes exactas.', kind:'contextual' },
    { t:'YouTube Audience Retention Benchmarks 2026', a:'humbleandbrag', y:'2026', u:'https://humbleandbrag.com/blog/youtube-audience-retention-benchmarks', d:'Rangos de APV por duración: <5 min 50–70%, 5–15 min 40–55%, 15–30 min 30–45%, >30 min 25–35%. Tutorial/How-to 45–55%. Los puntos del motor caen dentro de estos rangos pero no son punto estimado directo.', kind:'contextual' },
    { t:'What Is YouTube Audience Retention? Benchmarks and Fixes', a:'prepublish.ai', y:'2026', u:'https://prepublish.ai/guides/youtube-retention-guide', d:'Rangos: <5 min 65–75%, 5–10 min 50–60%, 10–15 min 40–50%, 15+ min 35–45%, Shorts 70–85%. El 0.82 del motor cae dentro del rango de Shorts pero no es punto estimado.', kind:'contextual' },
    { t:'YouTube Audience retention', a:'socialvideoplaza', y:'2024', u:'https://www.socialvideoplaza.com/en/articles/youtube-audience-retention', d:'Shorts APV “alrededor de 80%–90%”. El 0.82 del motor cae dentro del rango. APV no escala linealmente con duración.', kind:'contextual' },
    { t:'The Nose, Body, and Tail of Video Engagement', a:'Wistia', y:'2023', u:'https://wistia.com/learn/marketing/nose-body-tail', d:'Patrón cualitativo “nose-body-tail”: caída grande al inicio, caída estable en el medio, inflexión al final. Apoyo direccional para la forma de la curva, no para la interpolación algebraica.', kind:'contextual' },
    { t:'Technical Communication', a:'Markel, M.', y:'2018', u:'https://www.macmillanlearning.com/college/us/product/Technical-Communication/p/1319027732', d:'Recomendación heurística de 15–20 palabras/oración para comunicación técnica. Apoyo cualitativo al tier ≤18 palabras del motor, no a la magnitud +16.', kind:'contextual' }
  ];

  /* ---- Catálogo de constantes del motor.
   *       Cada entrada documenta: nombre, valor, ubicación en el código,
   *       estado de validación, fuente (si la hay) y nota.
   *
   *       status = 'validated'  → respaldo empírico directo
   *              = 'heuristic'  → sin validar; ajustar con datos del canal
   * --------------------------------------------------------------------- */
  const HEURISTICS = [
    /* ===== VALIDADAS (respaldo empírico directo) ===== */
    {
      group: 'validated',
      name: 'Fórmula de Fernández-Huerta',
      value: '206.84 − 60·(sílabas/palabra) − 1.02·(palabras/frase)',
      where: 'model.js → fernandezHuerta()',
      sourceIdx: 6,
      note: 'Fórmula original de Fernández-Huerta (1959), adaptación de Flesch Reading Ease al español. Validada.'
    },
    {
      group: 'validated',
      name: 'Definiciones de métricas APV, AVD, watch-time, audienceWatchRatio',
      value: 'Definiciones oficiales, no pesos',
      where: 'model.js → retentionModel() (cálculo de apv/avd/watch1000)',
      sourceIdx: 3,
      note: 'Definiciones de la YouTube Analytics API. El motor las calcula a partir de la curva simulada, no las predice.'
    },
    {
      group: 'validated',
      name: 'Forma cualitativa de la curva de retención (nose-body-tail)',
      value: 'Caída inicial fuerte → caída gradual → inflexión final',
      where: 'model.js → retentionModel() (estructura de la curva)',
      sourceIdx: 7,
      note: 'Altman & Jiménez (2019) y YouTube Help (answer 9314415) documentan la forma cualitativa. La interpolación algebraica específica (lineal + easeOut) NO está validada — ver entrada correspondiente en “Heurística sin validar”.'
    },

    /* ===== HEURÍSTICA SIN VALIDAR ===== */
    /* --- hookScore() --- */
    {
      group: 'heuristic',
      name: 'Hook: bonus por rango 35–95 palabras',
      value: '+13',
      where: 'model.js → hookScore()',
      sourceIdx: null,
      note: 'No se encontró paper que reporte un rango óptimo de palabras del hook. Ajustar con datos propios del canal (comparar hook score vs. retención real a 30s en Studio).'
    },
    {
      group: 'heuristic',
      name: 'Hook: penalización <20 palabras',
      value: '−15',
      where: 'model.js → hookScore()',
      sourceIdx: null,
      note: 'Sin validar. Mismo caso que el bonus anterior.'
    },
    {
      group: 'heuristic',
      name: 'Hook: penalización >120 palabras',
      value: '−8',
      where: 'model.js → hookScore()',
      sourceIdx: null,
      note: 'Sin validar.'
    },
    {
      group: 'heuristic',
      name: 'Hook: bonus por abrir con pregunta',
      value: '+9',
      where: 'model.js → hookScore()',
      sourceIdx: null,
      note: 'Sin validar. La literatura de copywriting trata la pregunta como dispositivo de atención, pero ningún estudio cuantifica un lift de retención atribuible.'
    },
    {
      group: 'heuristic',
      name: 'Hook: bonus por palabra de tensión/curiosidad',
      value: '+12',
      where: 'model.js → hookScore()',
      sourceIdx: 10,
      note: 'Apoyo cualitativo: Loewenstein (1994) information-gap theory. Sin magnitud reportada — el +12 es heurístico.'
    },
    {
      group: 'heuristic',
      name: 'Hook: bonus por promesa de valor concreto',
      value: '+9',
      where: 'model.js → hookScore()',
      sourceIdx: 11,
      note: 'Apoyo direccional: Retention Rabbit 2025 reporta +18% de retención a 1 min con propuesta de valor clara en los primeros 15s. La magnitud +9 es heurística.'
    },
    {
      group: 'heuristic',
      name: 'Hook: solapamiento léxico título↔hook (>.38 / >.18 / bajo)',
      value: '+14 / +7 / −11',
      where: 'model.js → hookScore()',
      sourceIdx: null,
      note: 'Sin validar. Los umbrales .38 y .18 no aparecen en ningún paper de alineación título-contenido.'
    },
    {
      group: 'heuristic',
      name: 'Hook: penalización por filler/CTA temprano',
      value: '−15',
      where: 'model.js → hookScore()',
      sourceIdx: null,
      note: 'Sin validar. Recomendación cualitativa consistente en blogs de creadores, pero sin magnitud publicada.'
    },
    {
      group: 'heuristic',
      name: 'Hook: penalización por oraciones largas',
      value: '−7',
      where: 'model.js → hookScore()',
      sourceIdx: 16,
      note: 'Apoyo cualitativo: Markel (Technical Communication) recomienda 15–20 palabras/oración. La magnitud −7 es heurística.'
    },
    {
      group: 'heuristic',
      name: 'Hook: soporte visual en primeros 30s (2+/1/0)',
      value: '+9 / +5 / −7',
      where: 'model.js → hookScore()',
      sourceIdx: 8,
      note: 'Apoyo direccional: Cutting et al. (2016) muestra que el pacing cinematográfico afecta sincronía atencional, pero no mapea a “0/1/2+ cortes en primeros 30s”.'
    },

    /* --- clarity --- */
    {
      group: 'heuristic',
      name: 'Claridad: peso Fernández-Huerta sobre claridad',
      value: '*.88',
      where: 'model.js → analyze() (cálculo de clarity)',
      sourceIdx: null,
      note: 'Sin validar. El .88 es un factor de escala heurístico para combinar FH con el ajuste por longitud de oración; no forma parte de la fórmula FH original.'
    },
    {
      group: 'heuristic',
      name: 'Claridad: ajuste por palabras promedio por oración',
      value: '≤18 → +16, ≤24 → +7, >24 → −12',
      where: 'model.js → analyze() (cálculo de clarity)',
      sourceIdx: 16,
      note: 'Apoyo cualitativo de Markel (15–20 palabras/oración). Las magnitudes +16/+7/−12 son heurísticas.'
    },
    {
      group: 'heuristic',
      name: 'Claridad: penalización por oración larga (>28 palabras)',
      value: '−2 por oración',
      where: 'model.js → analyze() (cálculo de clarity)',
      sourceIdx: null,
      note: 'Sin validar.'
    },
    {
      group: 'heuristic',
      name: 'Claridad: penalización por filler',
      value: '−1.2 por filler',
      where: 'model.js → analyze() (cálculo de clarity)',
      sourceIdx: 9,
      note: 'Parcialmente contradicho: Carlson et al. (2024) encuentran efecto umbral (≤5/min aceptable, 12/min peor), no modelo lineal. El −1.2/filler es heurístico y probablemente sobre-penaliza fillers a baja densidad.'
    },

    /* --- visualScore / pacingScore --- */
    {
      group: 'heuristic',
      name: 'Ritmo visual: target de interrupciones/min',
      value: '3 (long) / 8 (short)',
      where: 'model.js → analyze() (visualScore)',
      sourceIdx: 8,
      note: 'Apoyo direccional: Cutting et al. (2016) reporta ≈14 cortes/min en cine contemporáneo y ≈8/min en cine silente. Los 3/min para video largo están por debajo de cualquier baseline documentado; los 8/min para Shorts caen dentro del rango silente. Ajustar con datos propios.'
    },
    {
      group: 'heuristic',
      name: 'Ritmo visual: penalización por desvío del target',
      value: '×13',
      where: 'model.js → analyze() (visualScore)',
      sourceIdx: null,
      note: 'Sin validar. Multiplicador de escala heurístico.'
    },
    {
      group: 'heuristic',
      name: 'Ritmo visual: penalización por bloque de voz >55s',
      value: '−0.55 por segundo sobre 55',
      where: 'model.js → analyze() (visualScore)',
      sourceIdx: null,
      note: 'Sin validar. El umbral 55s y la magnitud −0.55/s no aparecen en literatura de retención por monólogo.'
    },
    {
      group: 'heuristic',
      name: 'Ritmo visual: bonus/penalización por apoyo visual en primeros 30s',
      value: '+8 / −8',
      where: 'model.js → analyze() (visualScore)',
      sourceIdx: null,
      note: 'Sin validar.'
    },
    {
      group: 'heuristic',
      name: 'Pacing score: fórmula base + eventos paralelos + ajustes',
      value: 'base 72, +1.7/evento (cap +18), −0.75/bloque largo, −0.35/avg voz',
      where: 'model.js → analyze() (pacingScore)',
      sourceIdx: null,
      note: 'Sin validar. Todos los coeficientes son heurísticos.'
    },

    /* --- benchmarkAPV() --- */
    {
      group: 'heuristic',
      name: 'APV esperado por duración (umbrales)',
      value: '≤180s→0.62, ≤300→0.55, ≤600→0.47, ≤900→0.41, ≤1800→0.34, else→0.30',
      where: 'model.js → benchmarkAPV()',
      sourceIdx: 12,
      note: 'Sin validar como punto estimado. Los valores caen dentro (a veces en el borde inferior) de los rangos publicados por humbleandbrag 2026 y prepublish.ai 2026, pero ningún source reproduce los 6 umbrales exactos ni los decimales específicos. Calibrar con APV promedio del canal.'
    },
    {
      group: 'heuristic',
      name: 'APV: ajustes por género',
      value: 'tutorial +0.03, entretenimiento +0.02, ensayo −0.02',
      where: 'model.js → benchmarkAPV()',
      sourceIdx: 11,
      note: 'Apoyo direccional: Retention Rabbit 2025 muestra spread de ~20 puntos entre How-To (42.1%) y Vlogs (21.5%). Los deltas +0.03/+0.02/−0.02 son heurísticos y probablemente sub-estiman la diferencia real.'
    },
    {
      group: 'heuristic',
      name: 'APV: valores fijos para Shorts y Live',
      value: 'Shorts 0.82, Live 0.24',
      where: 'model.js → benchmarkAPV()',
      sourceIdx: 13,
      note: 'Shorts 0.82 cae dentro del rango publicado (70–85% / 80–90%) pero no es punto estimado. Live 0.24 no tiene ninguna fuente publicada — ajustar con datos propios del canal.'
    },

    /* --- retentionModel() --- */
    {
      group: 'heuristic',
      name: 'Modelo de retención: coeficientes de target',
      value: 'hook 0.0015, pacing 0.0012, clarity 0.0007, visual 0.001, promise 0.0011',
      where: 'model.js → retentionModel()',
      sourceIdx: null,
      note: 'Sin validar. Ningún modelo académico o de industria combina retención como suma lineal de estos sub-scores con estos coeficientes.'
    },
    {
      group: 'heuristic',
      name: 'Modelo de retención: penalización por riesgo',
      value: 'bad −0.012, warn −0.004',
      where: 'model.js → retentionModel()',
      sourceIdx: null,
      note: 'Sin validar.'
    },
    {
      group: 'heuristic',
      name: 'Modelo de retención: fórmula de r30',
      value: '0.48 + hook·0.0032 + promise·0.0012 + visual·0.0009',
      where: 'model.js → retentionModel()',
      sourceIdx: null,
      note: 'Sin validar. Intercepto 0.48 y coeficientes son heurísticos. La forma lineal no aparece en literatura de retención a 30s.'
    },
    {
      group: 'heuristic',
      name: 'Modelo de retención: reconstrucción algebraica de endR',
      value: 'endR = 2·(target·T − 15·(1+r30)) / (T−30) − r30, clampeado',
      where: 'model.js → retentionModel()',
      sourceIdx: null,
      note: 'Sin validar. Es una inversión algebraica para que el área bajo la curva coincida con el target; no tiene respaldo en literatura de audience retention curves.'
    },
    {
      group: 'heuristic',
      name: 'Modelo de retención: interpolación post-30s',
      value: 'lineal entre r30 y endR (con easeOut en los primeros 30s)',
      where: 'model.js → retentionModel() (curva)',
      sourceIdx: 7,
      note: 'Forma cualitativa validada (nose-body-tail, Altman & Jiménez 2019; YouTube Help 9314415), pero la interpolación algebraica específica (lineal + easeOut con exponente 1.8) es arbitraria y NO está validada. Tratar como aproximación direccional, no como predicción.'
    },
    {
      group: 'heuristic',
      name: 'Modelo de retención: amplitud y ancho de dips por riesgo',
      value: 'bad: amp 0.045, width 38; warn: amp 0.025, width 28',
      where: 'model.js → retentionModel() (curva)',
      sourceIdx: null,
      note: 'Sin validar. Parámetros de la curva gaussiana que simula dips localizados en cada riesgo.'
    },

    /* --- scoreCTA() --- */
    {
      group: 'heuristic',
      name: 'CTA: bonus/penalización por posición',
      value: '+20 si >70% del video, −22 si <25%',
      where: 'model.js → scoreCTA()',
      sourceIdx: null,
      note: 'Sin validar. Blogs de marketing dan advice cualitativo contradictorio (cerca del final vs. temprano para atención corta). Las magnitudes y umbrales son heurísticos.'
    },

    /* --- scoreSources() --- */
    {
      group: 'heuristic',
      name: 'Fuentes: bonus por bloque de fuente',
      value: '+12 por bloque (cap +18 por densidad de claims)',
      where: 'model.js → scoreSources()',
      sourceIdx: null,
      note: 'Sin validar. Recompensa heurística la densidad evidenciaria del guion; no hay data de retención asociada a presencia de fuentes.'
    },

    /* --- preflight --- */
    {
      group: 'heuristic',
      name: 'Preflight: pesos de la suma ponderada',
      value: 'hook·0.23 + retención·0.24 + pacing·0.15 + clarity·0.12 + visual·0.11 + promise·0.08 + cta·0.04 + source·0.03',
      where: 'model.js → analyze() (cálculo de preflight)',
      sourceIdx: null,
      note: 'Sin validar. Pesos normalizados a mano (suman 1.00); reflejan prioridad editorial del autor, no data empírica.'
    },
    {
      group: 'heuristic',
      name: 'Duration score: penalización por desvío relativo al objetivo',
      value: '×120 sobre |delta|/max(60, targetSec)',
      where: 'model.js → analyze() (durationScore)',
      sourceIdx: null,
      note: 'Sin validar. Multiplicador de escala heurístico.'
    },
    {
      group: 'heuristic',
      name: 'Retention score: fórmula de escala',
      value: '55 + (apv − benchmark) · 3.1',
      where: 'model.js → analyze() (retentionScore)',
      sourceIdx: null,
      note: 'Sin validar. Intercepto 55 y pendiente 3.1 son heurísticos; transforman la diferencia APV−benchmark en un score 0–100.'
    }
  ];

  /* ---- Guion de ejemplo (en línea, para compatibilidad con file://) ----
   * Se mantiene como objeto JS (no fetch de JSON externo) para que el
   * proyecto funcione abriendo index.html con doble clic. El archivo
   * data/example-script.json existe como espejo descargable.
   * --------------------------------------------------------------- */
  const EXAMPLE_STATE = {
    project: {
      title: 'La mentira que cambió el destino de una ciudad',
      promise: 'El video revela cómo una decisión aparentemente técnica terminó afectando la vida de miles de personas, y qué señal se ignoró antes del desastre.',
      audience: 'Personas interesadas en historia, misterio y decisiones reales explicadas con ritmo documental.',
      format: 'long',
      genre: 'documental',
      targetMinutes: 12,
      wpm: 150,
      realRetention: ''
    },
    blocks: [
      { type: 'voice',  text: 'En los primeros diez segundos quiero que mires esta imagen. Parece una calle común, pero detrás de esa puerta se tomó una decisión que nadie pudo deshacer. ¿Por qué una ciudad entera confió en un dato que estaba mal?' },
      { type: 'visual', text: 'Foto de archivo: calle vacía, zoom lento hacia una puerta marcada. Sobreimpresión de fecha.' },
      { type: 'screen', text: 'UN DATO MAL LEÍDO' },
      { type: 'sfx',    text: 'Golpe grave + silencio breve' },
      { type: 'voice',  text: 'La historia empieza con una promesa: resolver un problema rápido, barato y sin conflicto. El plan sonaba perfecto. Pero había una variable que no aparecía en los informes públicos.' },
      { type: 'source', text: 'Fuente: informe municipal, entrevista y archivo de prensa. Agregar URL exacta antes de publicar.' },
      { type: 'voice',  text: 'Primero vamos a reconstruir la línea de tiempo. Después vamos a ver la advertencia que se ignoró. Y al final vas a entender por qué este caso todavía se usa como ejemplo de mala toma de decisiones.' },
      { type: 'visual', text: 'Timeline animada: 3 hitos con fechas. Cortes cada 6–8 segundos.' },
      { type: 'voice',  text: 'El primer error no fue técnico. Fue narrativo: todos querían creer que la solución ya estaba encontrada. Cuando un equipo empieza por la conclusión, cada dato se transforma en decoración.' },
      { type: 'screen', text: 'ERROR #1: EMPEZAR POR LA CONCLUSIÓN' },
      { type: 'pause',  text: 'Pausa para dejar respirar la idea.', addsTime: true, seconds: 2 },
      { type: 'voice',  text: 'En este punto conviene mirar el documento original. La tabla no dice lo que después dijeron que decía. La diferencia parece mínima, pero cambia por completo el riesgo.' },
      { type: 'visual', text: 'Mostrar tabla con resaltado: columna correcta vs interpretación errónea.' },
      { type: 'cta',    text: 'Si querés, dejame en comentarios qué hubieras decidido con esa información. Y en la pantalla final te dejo el análisis del caso anterior, que conecta con este patrón.' }
    ]
  };

  /* ---- Configuración de recalibración de benchmarks ----
   * Reglas duras (no opcionales) para tocar benchmarkAPV con datos reales.
   * ------------------------------------------------------- */
  const CALIBRATION_CONFIG = {
    MIN_SAMPLES: 5,         // mínimo de registros reales por par formato+género antes de habilitar recalibrar
    MAX_DELTA_PCT: 8,       // tope de cambio por recalibración, en puntos porcentuales (sobre la fracción 0-1 del benchmark)
    STORAGE_KEYS: {
      REAL_SCORES:    'yt-script-lab-real-scores-v1',
      BENCHMARKS:     'yt-script-lab-benchmarks-v1',
      RECAB_HISTORY:  'yt-script-lab-recab-history-v1'
    }
  };

  /* ---- Buckets (format, genre) soportados por la recalibración.
   * Derivado del mismo enum que project.format / project.genre.
   * ------------------------------------------------------- */
  const BENCHMARK_BUCKETS = (() => {
    const formats = ['long', 'short', 'live'];
    const genres  = ['documental', 'tutorial', 'ensayo', 'review', 'entretenimiento'];
    const out = [];
    formats.forEach(f => genres.forEach(g => out.push({ format: f, genre: g })));
    return out;
  })();

  return {
    TYPES, STOP, SYNONYM_FAMILIES, SOURCES, HEURISTICS, EXAMPLE_STATE,
    CALIBRATION_CONFIG, BENCHMARK_BUCKETS
  };
})();
