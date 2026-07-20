/* main.js — Bootstrap, event binding, and store subscriptions for ScriptLab.
   This is the entry point: loads the project from IndexedDB,
   initializes workers, sets up store subscriptions, and binds all UI events.
   Loaded last so all other modules are available. */

async function boot() {
  await openDB();
  await migrateLegacy();

  /* Set up store subscriptions BEFORE loading state.
     This ensures that setProject() → render() works immediately. */
  subscribe('project', () => render());
  subscribe('aiResult', () => renderMetrics(analysis()));
  subscribe('retentionResult', () => renderRetentionPanel());
  subscribe('sentimentResult', () => renderSentimentArc());
  subscribe('calRecords', () => {
    renderCal();
    renderMetrics(analysis());
  });

  /* Load state into store (triggers render via project subscription) */
  setProject(normalizeProject(await get('projects', 'active')));
  setCalRecords(await all('calibrations'));

  /* Build palette buttons */
  Object.entries(T).forEach(([k, [n, c]]) => {
    $('#palette').insertAdjacentHTML('beforeend',
      '<button draggable="true" data-type="' + k + '"><i style="background:' + c + '"></i>' + n + '</button>');
  });

  bind();
  initWorker(false);
  initRetentionWorker();
  if (typeof bindAnalysis === 'function') bindAnalysis();
  if (typeof updateAnalysisTabState === 'function') updateAnalysisTabState();
  window.ScriptLabBooted = true;
  document.documentElement.dataset.scriptlabReady = 'true';
}

function bind() {
  /* ===== Palette drag — drops between blocks ===== */
  $$('#palette [data-type]').forEach(button =>
    button.addEventListener('dragstart', event => {
      event.dataTransfer.setData('palette-type', button.dataset.type);
      event.dataTransfer.effectAllowed = 'copy';
    })
  );
  document.addEventListener('dragstart', e => {
    if (e.target.closest('#palette')) {
      paletteDragType = e.target.closest('#palette [data-type]')?.dataset.type || null;
    }
  });
  document.addEventListener('dragend', () => {
    paletteDragType = null;
    $$('.flow-block').forEach(e => e.classList.remove('dragover-top', 'dragover-bottom'));
  });
  $('#viewport').ondragover = e => {
    e.preventDefault();
    if (paletteDragType) {
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
  $('#viewport').ondragleave = e => {
    if (!e.relatedTarget || !$('#viewport').contains(e.relatedTarget))
      $$('.flow-block').forEach(el => el.classList.remove('dragover-top', 'dragover-bottom'));
  };
  $('#viewport').ondrop = e => {
    e.preventDefault();
    const t = e.dataTransfer.getData('palette-type') || e.dataTransfer.getData('type');
    if (!t) return;
    const block = e.target.closest('.flow-block');
    if (block) {
      const rect = block.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      add(t, e.clientY < mid ? block.dataset.id : null);
    } else {
      add(t);
    }
  };

  /* ===== Save button — download guion as .txt ===== */
  $('#save-btn').onclick = () => {
    const proj = getProject();
    let txt = '# ' + proj.title + '\n\n' + (proj.promise ? 'Promesa: ' + proj.promise + '\n\n' : '');
    proj.blocks.forEach((b, i) => {
      txt += '--- ' + (i + 1) + '. ' + (b.label || T[b.type][0]) + ' (' + b.type + ') ---\n';
      txt += (b.content || '(vacío)') + '\n\n';
    });
    const u = URL.createObjectURL(new Blob([txt], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = u; a.download = (proj.title || 'guion').replace(/[^a-zA-Z0-9áéíóúñ]/gi, '_') + '.txt'; a.click();
    setTimeout(() => URL.revokeObjectURL(u), 800);
  };

  /* ===== Sidebar inputs ===== */
  $('#title').oninput = save;
  $('#wpm').oninput = () => {
    getProject().wpm = +$('#wpm').value;
    $('#wpm-value').textContent = getProject().wpm;
    save();
    notify('project');
  };
  $('#target-duration').oninput = () => {
    const v = +$('#target-duration').value;
    getProject().targetDuration = v;
    $('#target-duration-value').textContent = v ? time(v) : '\u2014';
    save(); renderMetrics(analysis());
  };
  $('#promise').oninput = () => { save(); renderMetrics(analysis()); };

  /* ===== Navigation ===== */
  $$('.view').forEach(b => b.onclick = () => view(b.dataset.view));
  $$('.tab').forEach(b => b.onclick = () => {
    $$('.tab').forEach(x => x.classList.toggle('on', x === b));
    $$('.tabpage').forEach(x => x.classList.toggle('on', x.id === b.dataset.tab));
    if (b.dataset.tab === 'cal') renderCal();
  });

  /* ===== New project ===== */
  $('#new').onclick = () => {
    if (!confirm('\u00BFCrear un proyecto nuevo? Export\u00e1 el actual si quer\u00e9s conservarlo.')) return;
    setSelection(null);
    setAIResult(null);
    setRetentionResult(null);
    setSentimentResult(null);
    flowDirty = true;
    markAnalysisDirty();
    setProject({
      id: 'active', title: 'Nuevo guion', promise: '', targetDuration: 0,
      format: 'long', genre: 'educativo', aiMode: 'basic', wpm: 150, blocks: [], updatedAt: Date.now()
    });
    save();
  };

  /* ===== Export ===== */
  $('#export').onclick = () => {
    const menu = $('#export-menu');
    menu.hidden = !menu.hidden;
    $('#export').setAttribute('aria-expanded', String(!menu.hidden));
  };
  $$('[data-export]').forEach(button => button.onclick = async () => {
    const a = analysis(), c = await all('calibrations'), kind = button.dataset.export;
    if (kind === 'md') exportMarkdown(getProject(), a);
    else if (kind === 'html') exportHTML(getProject(), a);
    else exportJSON(getProject(), a, c);
    $('#export-menu').hidden = true;
  });

  /* ===== Import ===== */
  $('#import-btn').onclick = importProject;

  /* ===== Theme ===== */
  $('#theme').onclick = () => document.body.classList.toggle('light');

  /* ===== Panel toggles ===== */
  const syncPanels = () => {
    const l = document.body.classList.contains('left-collapsed'), r = document.body.classList.contains('right-collapsed');
    $('#toggle-left').classList.toggle('active', l);
    $('#toggle-right').classList.toggle('active', r);
  };
  $('#toggle-left').onclick = () => { document.body.classList.toggle('left-collapsed'); syncPanels(); };
  $('#toggle-right').onclick = () => { document.body.classList.toggle('right-collapsed'); syncPanels(); };
  syncPanels();

  /* ===== AI dialog ===== */
  const downloadButton = $('#download-model');
  const paintMode = () => {
    const proj = getProject();
    const ai = proj.aiMode === 'embeddings';
    $('#mode-basic').classList.toggle('active', !ai);
    $('#mode-ai').classList.toggle('active', ai);
    $('#ai-download-area').hidden = !ai;
    $('#basic-state').hidden = ai;
  };
  $('#mode-basic').onclick = () => {
    getProject().aiMode = 'basic';
    setAIResult(null);
    initWorker(false);
    save();
    paintMode();
    if (typeof updateAnalysisTabState === 'function') updateAnalysisTabState();
  };
  $('#mode-ai').onclick = () => { getProject().aiMode = 'embeddings'; paintMode(); };
  if (downloadButton) downloadButton.onclick = async event => {
    event.preventDefault(); downloadButton.disabled = true;
    try { await downloadModel(); save(); }
    catch (error) { $('#model-download-status').textContent = 'No se pudo descargar el modelo.'; console.error(error); }
    finally { downloadButton.disabled = false; }
  };
  /* Activate AI button in analysis tab */
  const activateAiBtn = $('#activate-ai-btn');
  if (activateAiBtn) activateAiBtn.onclick = () => { $('#ai').click(); };

  $('#ai').onclick = () => {
    const dialog = $('#aidialog');
    paintMode();
    dialog.showModal();
  };
  $('#close-ai').onclick = () => $('#aidialog').close?.();

  /* ===== Calibration ===== */
  $('#calform').onsubmit = async e => {
    e.preventDefault();
    await put('calibrations', { id: crypto.randomUUID(), format: $('#format').value, genre: $('#genre').value, apv: +$('#apv').value, r30: +$('#r30').value || null, createdAt: Date.now() });
    e.target.reset();
    setCalRecords(await all('calibrations'));
  };

  /* ===== Teleprompter (TTS) ===== */
  const speakAt = i => {
    const proj = getProject();
    const list = proj.blocks.filter(b => b.content);
    if (!list.length) return;
    const tts = getTTSState();
    tts.index = Math.max(0, Math.min(i, list.length - 1));
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(list[tts.index].content);
    u.lang = 'es-AR'; u.rate = +$('#rate').value;
    tts.playing = true;
    setTTSState(tts);
    u.onend = () => {
      const st = getTTSState();
      if (st.playing && st.index < list.length - 1) speakAt(st.index + 1);
    };
    speechSynthesis.speak(u);
  };
  $('#speak').onclick = () => {
    const tts = getTTSState();
    if (tts.paused) { speechSynthesis.resume(); tts.paused = false; setTTSState(tts); }
    else speakAt(tts.index);
  };
  $('#pause-speak').onclick = () => {
    const tts = getTTSState();
    if (tts.playing) { speechSynthesis.pause(); tts.paused = true; setTTSState(tts); }
  };
  $('#prev-speak').onclick = () => speakAt(getTTSState().index - 1);
  $('#next-speak').onclick = () => speakAt(getTTSState().index + 1);
  $('#full').onclick = () => $('#tele').requestFullscreen();

  /* ===== Retention ===== */
  const runRetentionBtn = $('#run-retention');
  if (runRetentionBtn) runRetentionBtn.onclick = () => {
    scheduleRetention(); runRetentionBtn.disabled = true; runRetentionBtn.textContent = 'Calculando\u2026';
  };

  /* ===== Service Worker ===== */
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js?v=' + VERSION);
}

/* ===== Boot ===== */
boot().catch(error => {
  console.error(error);
  const message = 'ScriptLab no pudo iniciarse: ' + error.message;
  document.body.insertAdjacentHTML('afterbegin',
    '<div style="padding:12px;background:#ff6879;color:#20101a;position:fixed;z-index:9999;left:0;right:0;top:0">' + message + '</div>');
});