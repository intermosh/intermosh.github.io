/* store.js — Centralized state management for ScriptLab.
   Single source of truth with pub-sub notifications.
   All state reads go through getters; all writes go through setters.
   Render functions subscribe to state changes instead of being called manually.

   Internal flags (flowDirty, analysisDirty) stay in their respective modules
   (state.js, scoring.js) — they are not observable state, just memoization. */

/* ===== Private state ===== */
const _state = {
  project: null,          // Active project object
  selection: null,        // Selected block ID
  aiResult: null,         // Embedding analysis result from ai-worker
  retentionResult: null,  // Retention prediction from retention-worker
  sentimentResult: null,  // Sentiment analysis from sentiment-worker
  calRecords: [],         // Calibration records from IndexedDB
  ttsState: { index: 0, playing: false, paused: false }
};

/* ===== Pub-sub ===== */
const _listeners = new Map();

function _notify(key) {
  const fns = _listeners.get(key);
  if (!fns) return;
  const value = _state[key];
  for (const fn of fns) {
    try { fn(value); } catch (e) { console.error('[store] subscriber error on "' + key + '":', e); }
  }
}

function subscribe(key, fn) {
  if (!_listeners.has(key)) _listeners.set(key, new Set());
  _listeners.get(key).add(fn);
}

function unsubscribe(key, fn) {
  _listeners.get(key)?.delete(fn);
}

/* Manual notification for property mutations on existing objects.
   Use after mutating getProject().blocks, getProject().title, etc.
   when you want subscribers to react without replacing the object. */
function notify(key) { _notify(key); }

/* ===== Getters ===== */
function getProject() { return _state.project; }
function getSelection() { return _state.selection; }
function getAIResult() { return _state.aiResult; }
function getRetentionResult() { return _state.retentionResult; }
function getSentimentResult() { return _state.sentimentResult; }
function getCalRecords() { return _state.calRecords; }
function getTTSState() { return _state.ttsState; }

/* ===== Setters — only entry point to modify each piece of state ===== */
function setProject(v) { _state.project = v; _notify('project'); }
function setSelection(v) { _state.selection = v; _notify('selection'); }
function setAIResult(v) { _state.aiResult = v; _notify('aiResult'); }
function setRetentionResult(v) { _state.retentionResult = v; _notify('retentionResult'); }
function setSentimentResult(v) { _state.sentimentResult = v; _notify('sentimentResult'); }
function setCalRecords(v) { _state.calRecords = v; _notify('calRecords'); }
function setTTSState(v) { _state.ttsState = v; _notify('ttsState'); }

/* ===== Analysis cache wrapper ===== */
/* Reads/writes the analysisCache IndexedDB store through the store layer.
   Checks cache before computing, writes result after successful computation.
   If computeFn throws, nothing is cached. */
async function getOrComputeAI(cacheId, computeFn) {
  const cached = await get('analysisCache', cacheId);
  if (cached?.result) return cached.result;
  const result = await computeFn();
  await put('analysisCache', {
    id: cacheId,
    projectId: _state.project?.id,
    updatedAt: Date.now(),
    result
  });
  return result;
}