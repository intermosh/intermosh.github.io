/* state.js — Project helpers, DOM helpers, and mutation operations.
   This file defines block-type constants, pure helper functions,
   and mutation functions that modify project state.

   Observable state lives in store.js. Internal flags (flowDirty,
   paletteDragType, save debounce timer) are module-scoped here.

   DOM render functions are in render.js.
   Analysis computation is in scoring.js. */

/* --- DOM helpers (used everywhere) --- */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* --- Block type definitions --- */
const T = {
  HOOK:      ['Hook',       '#ff7d5c'],
  CONTEXTO:  ['Contexto',   '#69a8ff'],
  EVIDENCIA: ['Evidencia',  '#ae83ff'],
  SEGMENTO:  ['Segmento',   '#b3bdce'],
  GIRO:      ['Giro',       '#f4b857'],
  VISUAL:    ['Nota visual','#32d2ac'],
  CTA:       ['CTA',        '#5cdb87']
};

const TRASH_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M6 6l1 14h10l1-14"/></svg>';

/* --- Internal flags (not observable state) --- */
let timer;               // Save debounce timer
let flowDirty = true;    // Whether block list needs full re-render
let paletteDragType = null;  // Currently dragging palette type

/* --- Pure helper functions --- */
const W = t => (t || '').trim().match(/[\p{L}\p{N}'''-]+/gu)?.length || 0;
const D = t => Math.round(W(t) / (getProject()?.wpm || 150) * 60);
const time = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const esc = s => String(s || '').replace(/[&<>]/g, x => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[x]));

/* --- Project normalization (input sanitization, no DOM) --- */
function normalizeProject(raw = {}) {
  const meta = raw.project || raw;
  const blocks = Array.isArray(raw.blocks) ? raw.blocks : [];
  return {
    id: 'active',
    title: meta.title || 'Nuevo guion',
    promise: meta.promise || '',
    targetDuration: Math.max(0, Math.min(3600, Number(meta.targetDuration) || 0)),
    aiMode: ['basic', 'embeddings'].includes(meta.aiMode) ? meta.aiMode : 'basic',
    blocks: blocks.map((b, i) => ({
      id: b.id || crypto.randomUUID(),
      type: T[b.type] ? b.type : 'SEGMENTO',
      label: b.label || T[T[b.type] ? b.type : 'SEGMENTO'][0],
      content: b.content || '',
      notes: b.notes || ''
    })),
    updatedAt: meta.updatedAt || Date.now(),
    wpm: Math.max(115, Math.min(185, Number(meta.wpm) || 150))
  };
}

/* --- State mutations (touch state + persist) --- */
function save() {
  markAnalysisDirty();
  clearTimeout(timer);
  timer = setTimeout(async () => {
    const proj = getProject();
    proj.title = $('#title').value || 'Nuevo guion';
    proj.promise = $('#promise').value;
    proj.updatedAt = Date.now();
    await put('projects', proj);
    if (Date.now() - (proj.lastSnapshotAt || 0) > 1800000) {
      proj.lastSnapshotAt = Date.now();
      await put('snapshots', {
        id: crypto.randomUUID(),
        projectId: proj.id,
        createdAt: proj.lastSnapshotAt,
        data: structuredClone(proj)
      });
    }
  }, 350);
}

/* add() calls render() via store subscription (notify('project')).
   Safe because render() is defined in render.js (loaded before runtime). */
function add(type = 'HOOK', insertBefore = null) {
  const proj = getProject();
  const block = { id: crypto.randomUUID(), type, label: T[type][0], content: '', notes: '' };
  if (insertBefore != null) {
    const idx = proj.blocks.findIndex(b => b.id === insertBefore);
    if (idx >= 0) proj.blocks.splice(idx, 0, block); else proj.blocks.push(block);
  } else {
    proj.blocks.push(block);
  }
  flowDirty = true;
  setSelection(block.id);
  save();
  notify('project');
}

function move(n) {
  const proj = getProject();
  let i = proj.blocks.findIndex(b => b.id === getSelection()), j = i + n;
  if (j >= 0 && j < proj.blocks.length) {
    [proj.blocks[i], proj.blocks[j]] = [proj.blocks[j], proj.blocks[i]];
    flowDirty = true;
    save();
    notify('project');
  }
}

function view(id) {
  $$('.panel').forEach(x => x.classList.toggle('on', x.id === id));
  $$('.view').forEach(x => x.classList.toggle('on', x.dataset.view === id));
}