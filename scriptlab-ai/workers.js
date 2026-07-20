/* workers.js — Worker orchestration for ScriptLab.
   Manages lifecycle of ai-worker, sentiment-worker, and retention-worker.
   Writes results into the store (store.js setters).
   Render functions are triggered by store subscriptions (set up in main.js). */

/* ===== Worker references ===== */
let worker = null;
let retentionWorker = null;
let sentimentWorker = null;
let sentimentReady = false;
let aiTimer = null;
let sentimentTimer = null;

/* ===== Request/response plumbing for analysis tab (extract, redundancy, density, gaps) ===== */
let analysisRequestId = 0;
const analysisCallbacks = {};

function workerSend(type, data) {
  if (!worker) { alert('Activá el modo AI primero (Configurar IA > Modo AI > Descargar modelo).'); return null; }
  const id = ++analysisRequestId;
  return new Promise((resolve, reject) => {
    analysisCallbacks[id] = { resolve, reject };
    worker.postMessage({ type, requestId: id, ...data });
  });
}

function handleWorkerResult(d) {
  const cb = analysisCallbacks[d.requestId];
  if (!cb) return;
  if (d.type === 'ERROR') { cb.reject(new Error(d.message)); delete analysisCallbacks[d.requestId]; return; }
  cb.resolve(d);
  delete analysisCallbacks[d.requestId];
}

/* ===== AI activity indicator ===== */
function setAIActivity(kind, text) {
  const el = $('#ai-activity');
  if (!el) return;
  el.className = 'ai-activity ' + kind;
  el.textContent = text;
  el.title = text;
}

/* ===== Embeddings worker (ai-worker.js) ===== */
async function downloadModel() {
  const status = $('#model-download-status'), progress = $('#model-download-progress'), complete = $('#model-complete');
  progress.hidden = false; progress.value = 5; status.textContent = 'Preparando descarga local\u2026';
  await initWorker(true);
  progress.value = 100; status.textContent = '\u2713 2 modelos listos en este navegador.';
  if (complete) complete.hidden = false;
}

async function initWorker(activate = false) {
  worker?.terminate();
  const proj = getProject();
  $('#ai-state').textContent = proj.aiMode === 'basic' ? 'Análisis local (sin IA)' : 'IA local activa';
  setAIActivity(proj.aiMode === 'basic' ? 'heuristic' : 'loading', proj.aiMode === 'basic' ? '\u25CB Análisis local (sin IA)' : '\u25CB Preparando modelos de IA\u2026');
  if (proj.aiMode === 'basic' || !activate) return;
  return new Promise((resolve, reject) => {
    try {
      worker = new Worker('./ai-worker.js', { type: 'module' });
      worker.onmessage = event => {
        const d = event.data;
        if (d.type === 'PROGRESS') {
          setAIActivity('loading', '\u25CB Cargando modelo de embeddings\u2026');
          const pct = Number((d.message.match(/(\d+)%/) || [])[1]);
          if (Number.isFinite(pct)) { $('#model-download-progress').hidden = false; $('#model-download-progress').value = pct; }
        }
        if (d.type === 'READY') {
          setAIActivity('loading', '\u25CB Embeddings listos. Cargando sentimiento\u2026');
          initSentimentWorker()
            .then(() => { setAIActivity('semantic', '\u2726 IA lista \u00B7 ' + (getProject()?.blocks.length || 0) + ' bloques'); resolve(); })
            .catch(() => { setAIActivity('semantic', '\u2726 IA: embeddings listos (sentimiento no disponible)'); resolve(); });
        }
        /* EMBED_RESULT is no longer handled here — it flows through
           handleWorkerResult → workerSend promise → getOrComputeAI in scheduleAI */
        if (d.type === 'ERROR') { setAIActivity('error', '! IA: error'); reject(new Error(d.message)); }
        handleWorkerResult(d);
      };
      worker.postMessage({ type: 'INIT', mode: proj.aiMode });
    } catch (error) { reject(error); }
  });
}

function scheduleAI() {
  clearTimeout(aiTimer);
  const proj = getProject();
  if (!proj || proj.aiMode !== 'embeddings' || !worker) return;
  aiTimer = setTimeout(async () => {
    const texts = [
      { id: 'title', text: proj.title, role: 'title' },
      { id: 'promise', text: proj.promise, role: 'promise' },
      ...proj.blocks.map(b => ({ id: b.id, text: b.content, role: 'block' }))
    ];
    const hook = proj.blocks.find(b => b.type === 'HOOK');
    if (hook) texts.push({ id: 'hook', text: hook.content, role: 'hook' });
    const cacheId = 'embedding-' + contentHash(JSON.stringify(texts));

    try {
      const result = await getOrComputeAI(cacheId, () => {
        const promise = workerSend('EMBED', { texts, requestId: ++analysisRequestId, cacheId });
        if (!promise) throw new Error('Worker no disponible');
        return promise;
      });
      setAIResult(result);
      setAIActivity('semantic', '\u2726 IA \u00B7 Analizó ' + proj.blocks.length + ' bloques');
    } catch (err) {
      console.warn('[scheduleAI]', err);
      setAIActivity('error', '\u2716 Error en análisis de embeddings');
    }
  }, 700);
}

/* ===== Sentiment worker (sentiment-worker.js) ===== */

/* Independent scheduler — decoupled from embeddings pipeline.
   Shares the same guard pattern as scheduleAI: checks aiMode, worker readiness,
   and minimum content length. Uses a slightly longer debounce (800ms)
   to avoid competing with the embeddings worker. */
function scheduleSentiment() {
  clearTimeout(sentimentTimer);
  const proj = getProject();
  if (!proj || proj.aiMode !== 'embeddings' || !sentimentWorker || !sentimentReady) return;
  sentimentTimer = setTimeout(() => {
    runSentimentAnalysis();
  }, 800);
}

function initSentimentWorker() {
  if (sentimentReady) return Promise.resolve();
  return new Promise((resolve, reject) => {
    try {
      sentimentWorker = new Worker('./sentiment-worker.js', { type: 'module' });
      sentimentWorker.onmessage = e => {
        if (e.data.type === 'PROGRESS') setAIActivity('loading', '\u25CB Sentimiento: ' + e.data.message);
        if (e.data.type === 'READY') { sentimentReady = true; resolve(); }
        if (e.data.type === 'SENTIMENT_RESULT') {
          setSentimentResult(e.data);
          /* renderSentimentArc is triggered by sentimentResult subscription */
        }
        if (e.data.type === 'ERROR') { console.warn('Sentiment error:', e.data.message); resolve(); }
      };
      sentimentWorker.postMessage({ type: 'INIT' });
    } catch (e) { console.warn('Sentiment worker no disponible:', e); resolve(); }
  });
}

function runSentimentAnalysis() {
  if (!sentimentWorker || !sentimentReady) return;
  const proj = getProject();
  const blocks = proj.blocks.filter(b => b.content && b.content.length > 5);
  if (!blocks.length) return;
  sentimentWorker.postMessage({
    type: 'SENTIMENT',
    requestId: ++analysisRequestId,
    texts: blocks.map(b => b.content),
    blockIds: blocks.map(b => b.id),
    blockIndices: blocks.map((_, i) => i),
    blockTypes: blocks.map(b => b.type)
  });
}

/* ===== Retention worker (retention-worker.js) ===== */
function initRetentionWorker() {
  try {
    retentionWorker = new Worker('./retention-worker.js', { type: 'module' });
    retentionWorker.onmessage = e => {
      if (e.data.type === 'RETENTION_RESULT') {
        setRetentionResult(e.data);
        /* renderRetentionPanel is triggered by retentionResult subscription */
        const btn = $('#run-retention');
        if (btn) { btn.disabled = false; btn.textContent = 'Calcular retención'; }
        /* renderMetrics triggered by a separate call — retention changes ICN display */
        renderMetrics(analysis());
      }
    };
  } catch (e) { console.warn('Retention worker no disponible:', e); }
}

function scheduleRetention() {
  if (!retentionWorker) return;
  const proj = getProject();
  retentionWorker.postMessage({
    type: 'PREDICT_RETENTION',
    requestId: ++analysisRequestId,
    blocks: proj.blocks,
    wpm: proj.wpm || 150,
    promise: proj.promise || '',
    title: proj.title || ''
  });
}