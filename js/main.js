/* main.js — Bootstrap, event binding y "Analizar a fondo" (tier 2 on-demand).
   Implementa §13.8, §5.2, §11.3 del contrato.
   Punto de entrada: <script type="module" src="./main.js">.
   Depende de todos los demás módulos. */

import { state, T, normalizeProject, markAnalysisDirty, time, esc, CALIBRATION_CONFIG, recalibrateBucket } from './state.js';
import { openDB, migrateLegacy, all, put, get, del } from './db.js';
import { analysis, splitSentences, splitIntoSegments } from './scoring.js';
import {
  initWorker, initRetentionWorker, syncWorkerWithState, scheduleRetention,
  scheduleAI, scheduleSentiment, workerSend, downloadModel, updateAnalysisTabState,
  setAIActivity, refreshAIActivityPill, modelsAreReady, resetAIResults
} from './workers.js';
import {
  render, renderMetrics, renderCal, view, addBlock, saveDebounced, undo, redo,
  renderDeepReport, renderGapsObj
} from './render.js';
import { exportJSON, exportMarkdown, exportHTML, exportTXT, exportPDF, exportReportTXT, exportReportJSON, exportReportHTML, exportReportPDF, importProject } from './export-import.js';

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

/* ============================================================
   _exampleProject — guion de ejemplo para onboarding (primer visita)
   ============================================================ */
function _exampleProject() {
  return {
    id: 'active',
    title: 'Cómo empezar con ScriptLab',
    promise: 'Aprender a usar la herramienta en 2 minutos',
    targetDuration: 0,
    aiMode: 'basic',
    wpm: 150,
    format: 'long',
    genre: 'educativo',
    blocks: [
      {
        id: 'ex-hook',
        type: 'HOOK',
        label: 'Hook — Tu primer bloque',
        content: '¿Sabías que podés analizar tu guion de YouTube antes de grabarlo? Hoy te muestro cómo ScriptLab mide la retención, el ritmo y la claridad de cada bloque de tu video.',
        notes: 'Este es un bloque HOOK. Los hooks efectivos tienen una pregunta, un dato sorprendente o una promesa clara en los primeros 15 segundos.'
      },
      {
        id: 'ex-ctx',
        type: 'CONTEXTO',
        label: 'Contexto — Qué es ScriptLab',
        content: 'ScriptLab es un editor por bloques que analiza tu guion en tiempo real. Cada bloque tiene un tipo: HOOK, CONTEXTO, EVIDENCIA, GIRO, VISUAL o CTA. El motor calcula salud, retención estimada y carga cognitiva.',
        notes: 'Los bloques CONTEXTO dan información al espectador. Oraciones cortas y claras mejoran la legibilidad (Fernández-Huerta).'
      },
      {
        id: 'ex-evid',
        type: 'EVIDENCIA',
        label: 'Evidencia — Los números',
        content: 'El motor usa 8 factores con citas académicas: hook (25%), ritmo (17%), pattern interrupts (14%), arco emocional (11%), densidad (11%), promesa (9%), legibilidad (7%) y CTA (3%). Cada peso tiene una fuente verificada.',
        notes: 'Los bloques EVIDENCIA aportan datos, ejemplos o fuentes. Los números concretos aumentan la credibilidad.'
      },
      {
        id: 'ex-giro',
        type: 'GIRO',
        label: 'Giro — El truco',
        content: 'Pero lo mejor no es que mida tu guion. Es que te dice exactamente dónde perdés audiencia. La curva de retención te muestra cada punto de fuga, bloque por bloque.',
        notes: 'Los bloques GIRO recontextualizan. Son pattern interrupts que resetean la atención del espectador.'
      },
      {
        id: 'ex-cta',
        type: 'CTA',
        label: 'CTA — Probalo',
        content: 'Borrá estos bloques de ejemplo y escribí tu propio guion. Las métricas aparecen en tiempo real. Si querés análisis semántico, activá el Modo IA en el ícono ⚙.',
        notes: 'Los bloques CTA cierran el video. Posicionarlos en el 75-95% del video mejora la retención.'
      }
    ],
    updatedAt: Date.now()
  };
}

/* ============================================================
   boot()
   ============================================================ */
async function boot() {
  await openDB();
  await migrateLegacy();

  // Cargar proyecto + calibraciones
  const stored = await get('projects', 'active');
  state.p = normalizeProject(stored || _exampleProject());
  state.modelsReady = await modelsAreReady();
  state.mode = state.p.aiMode === 'embeddings' && state.modelsReady ? 'ia' : 'heuristic';
  state.realScores = await all('realScores');
  const bm = await get('benchmarks', 'active');
  state.activeBenchmarks = bm?.data || {};

  // Paleta de bloques
  const palette = $('#palette');
  if (palette) {
    palette.innerHTML = '';
    Object.entries(T).forEach(([k, [n, c]]) => {
      palette.insertAdjacentHTML('beforeend',
        '<button draggable="true" data-type="' + k + '"><i style="background:' + c + '"></i>' + n + '</button>');
    });
  }

  bind();
  initRetentionWorker();  // Bug 1+7 fix: crear retention worker ANTES de render
  render();               // render() llama scheduleRetention() → ahora el worker ya existe
  refreshAIActivityPill();
  await syncWorkerWithState();

  window.ScriptLabBooted = true;
  document.documentElement.dataset.scriptlabReady = 'true';

  // Hook de debug/test: expone internals del grafo de módulos para que
  // herramientas externas (harness de tests, consola) puedan inspeccionar
  // state y disparar funciones. Los ES modules no exponen bindings en window.
  window.ScriptLab = { state, render, addBlock, runDeep, analysis, view };
}

/* ============================================================
   bind() — todos los eventos DOM
   ============================================================ */
function bind() {
  /* Paleta drag-to-canvas */
  $$('#palette [data-type]').forEach(btn =>
    btn.addEventListener('dragstart', e => {
      e.dataTransfer.setData('palette-type', btn.dataset.type);
      e.dataTransfer.effectAllowed = 'copy';
      state.paletteDragType = btn.dataset.type;
    })
  );
  document.addEventListener('dragend', () => {
    state.paletteDragType = null;
    $$('.flow-block').forEach(e => e.classList.remove('dragover-top', 'dragover-bottom'));
  });

  const viewport = $('#viewport');
  if (viewport) {
    viewport.ondragover = e => {
      e.preventDefault();
      if (state.paletteDragType) {
        const block = e.target.closest('.flow-block');
        if (block) {
          const rect = block.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          block.classList.toggle('dragover-top', e.clientY < mid);
          block.classList.toggle('dragover-bottom', e.clientY >= mid);
        } else {
          $$('.flow-block').forEach(e => e.classList.remove('dragover-top', 'dragover-bottom'));
        }
      }
    };
    viewport.ondrop = e => {
      e.preventDefault();
      const t = e.dataTransfer.getData('palette-type') || e.dataTransfer.getData('type');
      if (!t) return;
      const block = e.target.closest('.flow-block');
      if (block) {
        const rect = block.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        addBlock(t, e.clientY < mid ? block.dataset.id : null);
      } else {
        addBlock(t);
      }
    };
  }

  /* Meta bar */
  $('#title')?.addEventListener('input', () => { saveDebounced(); renderMetrics(analysis()); });
  $('#promise')?.addEventListener('input', () => { saveDebounced(); renderMetrics(analysis()); });
  $('#wpm')?.addEventListener('input', () => {
    state.p.wpm = +$('#wpm').value;
    $('#wpm-value').textContent = state.p.wpm + ' WPM';
    saveDebounced();
    state.flowDirty = true;
    render();
  });
  $('#target-duration')?.addEventListener('input', () => {
    state.p.targetDuration = +$('#target-duration').value;
    $('#target-duration-value').textContent = state.p.targetDuration ? time(state.p.targetDuration) : '—';
    saveDebounced();
    render();
  });

  /* ===== Reader tabs (M1) ===== */
  $$('.reader-tab').forEach(b => b.onclick = () => {
    $$('.reader-tab').forEach(x => x.classList.toggle('on', x === b));
    $$('.reader-tabpage').forEach(x => x.classList.toggle('on', x.dataset.rtabpage === b.dataset.rtab));
  });

  /* ===== Vistas y Componentes Principales ===== */
  $$('.view').forEach(b => b.onclick = () => view(b.dataset.view));

  /* ===== Undo/Redo keyboard shortcuts ===== */
  document.addEventListener('keydown', e => {
    if (e.target.matches('input,textarea,select')) return; // don't intercept when typing
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') { e.preventDefault(); redo(); }
  });

  /* AUTO-HIDE de la meta bar al scrollear el canvas hacia abajo.
     Bug 2 fix: el scrollable es #canvas (.panel con overflow-y:auto), no #viewport. */
  const scrollContainer = $('#canvas');
  const header = document.querySelector('header.h');
  const paletteBar = $('#palette-bar');
  if (scrollContainer && header) {
    let lastScrollTop = 0;
    let ticking = false;
    scrollContainer.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const st = scrollContainer.scrollTop;
        // Solo ocultar si scrolleó más de 40px (evita flicker) y bajando.
        if (st > lastScrollTop && st > 40) {
          header.classList.add('meta-hidden');
          paletteBar?.classList.add('palette-hidden');
        } else if (st < lastScrollTop) {
          header.classList.remove('meta-hidden');
          paletteBar?.classList.remove('palette-hidden');
        }
        lastScrollTop = st <= 0 ? 0 : st;
        ticking = false;
      });
    }, { passive: true });
  }

  /* Nuevo proyecto */
  $('#new')?.addEventListener('click', () => {
    if (!confirm('¿Crear un proyecto nuevo? Exportá el actual si querés conservarlo.')) return;
    state.p = normalizeProject({ id: 'active', title: 'Nuevo guion', promise: '', targetDuration: 0, aiMode: 'basic', wpm: 150, blocks: [], updatedAt: Date.now() });
    state.sel = null;
    state.aiResult = null;
    state.retentionResult = null;
    state.sentimentResult = null;
    state.deepResult = null;  // M3: invalidar análisis IA
    state.flowDirty = true;
    markAnalysisDirty();
    saveDebounced();
    syncWorkerWithState();
    render();
  });

  /* Export menu */
  $('#export')?.addEventListener('click', () => {
    const menu = $('#export-menu');
    menu.hidden = !menu.hidden;
  });
  $$('[data-export]').forEach(btn => btn.onclick = async () => {
    const a = analysis();
    const c = state.realScores || [];
    const kind = btn.dataset.export;
    if (kind === 'md') exportMarkdown(state.p, a);
    else if (kind === 'html') exportHTML(state.p, a);
    else if (kind === 'txt') exportTXT(state.p);
    else if (kind === 'pdf') exportPDF(state.p);
    else exportJSON(state.p, a, c);
    $('#export-menu').hidden = true;
  });

  /* Diagnostic Report Export */
  $$('[data-report-export]').forEach(btn => btn.onclick = async () => {
    const kind = btn.dataset.reportExport;
    const results = state.lastDeepResults || {};
    if (kind === 'txt') exportReportTXT(state, results);
    else if (kind === 'json') exportReportJSON(state, results);
    else if (kind === 'html') exportReportHTML(state, results);
    else if (kind === 'pdf') exportReportPDF(state, results);
  });

  /* Import */
  $('#import-btn')?.addEventListener('click', () => {
    importProject(async () => {
      const activeMode = state.mode;
      state.p = normalizeProject(await get('projects', 'active'));
      state.p.aiMode = activeMode === 'ia' ? 'embeddings' : 'basic';
      resetAIResults();
      state.mode = activeMode;
      state.flowDirty = true;
      markAnalysisDirty();
      render();
      await syncWorkerWithState();
      render();
    });
  });

  /* Theme */
  $('#theme')?.addEventListener('click', () => document.body.classList.toggle('light'));

  /* Modo enfoque */
  $('#toggle-right')?.addEventListener('click', () => {
    $('#reader').classList.toggle('collapsed');
  });

  /* AI dialog */
  const paintMode = () => {
    const aiSelected = state.p?.aiMode === 'embeddings';
    $('#mode-basic')?.classList.toggle('active', !aiSelected);
    $('#mode-ai')?.classList.toggle('active', aiSelected);
    const dl = $('#ai-download-area'); if (dl) dl.hidden = state.modelsReady || !aiSelected;
    const bs = $('#basic-state'); if (bs) bs.hidden = aiSelected;
    const ready = $('#model-ready-state'); if (ready) ready.hidden = !state.modelsReady;
    const iaCopy = $('#ia-state-copy'); if (iaCopy) iaCopy.hidden = !aiSelected;
  };
  $('#mode-basic')?.addEventListener('click', async () => {
    state.mode = 'heuristic';
    state.p.aiMode = 'basic';
    resetAIResults();
    await put('projects', state.p);
    await syncWorkerWithState();
    refreshAIActivityPill();
    paintMode();
    render();
  });
  $('#mode-ai')?.addEventListener('click', async () => {
    state.p.aiMode = 'embeddings';
    paintMode(); // Muestra la UI del modo IA instantáneamente antes de cargar/verificar
    state.modelsReady = await modelsAreReady();
    if (state.modelsReady) {
      state.mode = 'ia';
      await put('projects', state.p);
      await syncWorkerWithState();
    } else {
      state.mode = 'heuristic';
    }
    refreshAIActivityPill();
    render();
  });
  $('#download-model')?.addEventListener('click', async e => {
    e.preventDefault();
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      await downloadModel();
      state.modelsReady = true;
      state.mode = 'ia';
      state.p.aiMode = 'embeddings';
      await put('projects', state.p);
      refreshAIActivityPill();
      render();
    } catch (err) {
      $('#model-download-status').textContent = 'No se pudo descargar el modelo: ' + err.message;
      console.error(err);
    } finally {
      btn.disabled = false;
    }
  });
  $('#ai')?.addEventListener('click', () => { paintMode(); $('#aidialog').showModal(); });
  $('#close-ai')?.addEventListener('click', () => $('#aidialog').close?.());

  /* Calibración — realScoreForm + delegación recalibrar/eliminar */
  const rsf = $('#realScoreForm');
  if (rsf) rsf.onsubmit = async e => {
    e.preventDefault();
    const fd = new FormData(rsf);
    const rec = { id: crypto.randomUUID(), logged_at: new Date().toISOString(),
      video_title: (fd.get('video_title')||'').trim(), format: (fd.get('format')||'long'), genre: (fd.get('genre')||'educativo'),
      duration_sec: Number(fd.get('duration_sec'))||0, real_apv_pct: Number(fd.get('real_apv_pct'))||0,
      predicted_apv_pct: fd.get('predicted_apv_pct') ? Number(fd.get('predicted_apv_pct')) : null };
    if (!rec.video_title || !rec.duration_sec || !rec.real_apv_pct) { alert('Faltan campos requeridos.'); return; }
    state.realScores.push(rec); await put('realScores', rec); rsf.reset(); renderCal();
  };
  document.addEventListener('click', async e => {
    const rb = e.target.closest('[data-recab]');
    if (rb) {
      const [fmt,gen] = rb.dataset.recab.split('|');
      const cur = state.activeBenchmarks[fmt]?.[gen] || 0.4;
      const res = recalibrateBucket(state.realScores, fmt, gen, cur, CALIBRATION_CONFIG.MIN_SAMPLES, CALIBRATION_CONFIG.MAX_DELTA_PCT);
      if (!res.ok) { alert(res.reason); return; }
      if (!confirm('Recalibrar '+fmt+'+'+gen+':\n'+res.note+'\n\n¿Confirmar?')) return;
      if (!state.activeBenchmarks[fmt]) state.activeBenchmarks[fmt] = {};
      state.activeBenchmarks[fmt][gen] = res.newValue;
      if (!state.activeBenchmarks._history) state.activeBenchmarks._history = [];
      state.activeBenchmarks._history.push({bucket:fmt+'+'+gen, oldValue:res.oldValue, newValue:res.newValue, note:res.note, at:new Date().toISOString()});
      await put('benchmarks', {id:'active', data:state.activeBenchmarks}); renderCal(); return;
    }
    const db = e.target.closest('[data-del-real]');
    if (db) { const id = db.dataset.delReal; state.realScores = state.realScores.filter(r=>r.id!==id); await del('realScores', id); renderCal(); }
  });
  $('#proj-format')?.addEventListener('change', e => { state.p.format = e.target.value; saveDebounced(); renderCal(); });
  $('#proj-genre')?.addEventListener('change', e => { state.p.genre = e.target.value; saveDebounced(); renderCal(); });

  /* Teleprompter (TTS) */
  const speakAt = i => {
    const list = state.p.blocks.filter(b => b.content);
    if (!list.length) return;
    state.tts.index = Math.max(0, Math.min(i, list.length - 1));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(list[state.tts.index].content);
    u.lang = 'es-AR';
    u.rate = +$('#rate')?.value || 1;
    state.tts.playing = true;
    u.onend = () => { if (state.tts.playing && state.tts.index < list.length - 1) speakAt(state.tts.index + 1); };
    speechSynthesis.speak(u);
  };
  $('#speak')?.addEventListener('click', () => {
    if (state.tts.paused) { speechSynthesis.resume(); state.tts.paused = false; }
    else speakAt(state.tts.index);
  });
  $('#pause-speak')?.addEventListener('click', () => {
    if (state.tts.playing) { speechSynthesis.pause(); state.tts.paused = true; }
  });
  $('#prev-speak')?.addEventListener('click', () => speakAt(state.tts.index - 1));
  $('#next-speak')?.addEventListener('click', () => speakAt(state.tts.index + 1));
  $('#full')?.addEventListener('click', () => $('#tele')?.requestFullscreen());

  /* ===== "Analizar a fondo" (tier 2 on-demand, único botón, §5.2) ===== */
  $('#run-deep')?.addEventListener('click', runDeep);

  /* ===== Bottom-sheet mobile (T-21, §10.2) ===== */
  // En <768px el reader se convierte en bottom-sheet. Tap en el handle expande/colapsa.
  const readerEl = $('#reader');
  const readerHandle = $('#reader-handle');
  const readerOverlay = $('#reader-overlay');

  const isMobile = () => window.matchMedia('(max-width: 767px)').matches;

  if (readerHandle && readerEl) {
    readerHandle.addEventListener('click', () => {
      if (!isMobile()) return;
      const expanded = readerEl.classList.toggle('expanded');
      if (readerOverlay) readerOverlay.hidden = !expanded;
    });
  }
  if (readerOverlay) {
    readerOverlay.addEventListener('click', () => {
      readerEl.classList.remove('expanded');
      readerOverlay.hidden = true;
    });
  }
  // Si cambia a desktop, asegurar que no quede colapsado por el modo mobile.
  window.matchMedia('(max-width: 767px)').addEventListener('change', (e) => {
    if (!e.matches) {
      readerEl.classList.remove('expanded');
      if (readerOverlay) readerOverlay.hidden = true;
    }
  });

  /* ===== Service Worker (T-23, §3.4) ===== */
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js?v=1').catch(err => {
      console.warn('[SW] No se pudo registrar:', err.message);
    });
  }
}

/* ============================================================
   runDeep() — dispara los 4 análisis tier 2 en paralelo (§5.2)
   ============================================================ */
async function runDeep() {
  const btn = $('#run-deep');
  const section = $('#deep-section');
  const hint = $('#deep-hint');
  if (btn) { btn.disabled = true; btn.querySelector('.deep-label').textContent = '✦ Analizando…'; }
  if (hint) hint.textContent = 'procesando…';
  if (section) section.classList.remove('pending');

  const proj = state.p;
  const blocks = proj.blocks.map(b => b.content);
  const fullText = blocks.join(' ');

  // Promesas paralelas
  const promises = [];

  const results = {};

  // 1. Extractive
  const sentences = splitSentences(fullText);
  if (sentences.length >= 3) {
    promises.push(
      workerSend('EXTRACT_KEY_SENTENCES', { sentences, fullText, topN: 5 })
        .then(r => { results.extractive = r; })
        .catch(err => { results.extractiveError = err.message; })
    );
  }

  // 2. Redundancy (con valenceMap del sentiment)
  const eligible = proj.blocks.filter(b => b.content && b.content.trim().length > 10);
  const valenceMap = {};
  (state.sentimentResult?.sentimentArc || []).forEach(s => { valenceMap[s.blockId] = s.valence; });
  eligible.forEach(b => { if (!(b.id in valenceMap)) valenceMap[b.id] = 0; });

  if (eligible.length >= 2) {
    promises.push(
      workerSend('COMPUTE_REDUNDANCY', {
        blocks: eligible.map(b => b.content),
        blockIds: eligible.map(b => b.id),
        threshold: 0.85,
        valenceMap
      }).then(r => { results.redundancy = r; })
        .catch(err => { results.redundancyError = err.message; })
    );
  }

  // 3. Density
  if (fullText.trim()) {
    const segments = splitIntoSegments(fullText, proj.wpm);
    promises.push(
      workerSend('COMPUTE_DENSITY', { segments, fullText })
        .then(r => { results.density = r; })
        .catch(err => { results.densityError = err.message; })
    );
  }

  // 4. Gaps
  promises.push(
    renderGapsObj() // A modified version returning the data instead of DOM manipulation
      .then(r => { results.gaps = r; })
      .catch(err => { results.gapsError = err.message; })
  );

  await Promise.allSettled(promises);
  state.lastDeepResults = results;
  renderDeepReport(results);

  state.deepResult = { computedAt: Date.now(), results };
  if (btn) { btn.disabled = false; btn.querySelector('.deep-label').textContent = '✦ Analizar a fondo'; }
  if (section) section.classList.remove('pending');
}

/* ============================================================
   Boot
   ============================================================ */
boot().catch(error => {
  console.error(error);
  const message = 'ScriptLab no pudo iniciarse: ' + error.message;
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="padding:12px;background:#ff6879;color:#20101a;position:fixed;z-index:9999;left:0;right:0;top:0">' + message + '</div>');
});
