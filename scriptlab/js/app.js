/* =====================================================================
 * YouTube Script Lab — app.js
 * Estado, persistencia, binding de eventos, import/export, init.
 *
 * Dependencias: window.Config, window.Model, window.Render
 * Expone: window.App (state, init, etc.)
 *
 * NOTA: el guion de ejemplo se carga desde window.Config.EXAMPLE_STATE
 * (en config.js) y NO desde data/example-script.json vía fetch(), para
 * que el proyecto funcione abriendo index.html con doble clic (file://).
 * El archivo data/example-script.json existe como espejo descargable.
 * ===================================================================== */

window.App = (function () {
  'use strict';

  const { TYPES, EXAMPLE_STATE, CALIBRATION_CONFIG } = window.Config;
  const STORE = 'yt-script-lab-v1';
  const KEYS = CALIBRATION_CONFIG.STORAGE_KEYS;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);

  let state = loadState() || exampleState(false);
  let lastAnalysis = null;
  let saveTimer = null;

  /* ---- Estado de calibración (SEPARADO del estado de guiones) ----
   * realScores: array de registros de métricas reales post-publicación.
   * activeBenchmarks: {format: {genre: number en fracción 0-1}}.
   * recabHistory: array append-only de recalibraciones aplicadas.
   * Persisten en KEYS distintas — nunca se mezclan con el STORE del guion.
   * ------------------------------------------------------- */
  let realScores = loadRealScores();
  let activeBenchmarks = loadActiveBenchmarks();
  let recabHistory = loadRecabHistory();

  function loadRealScores() {
    try { return JSON.parse(localStorage.getItem(KEYS.REAL_SCORES) || '[]'); }
    catch (e) { return []; }
  }
  function saveRealScores() {
    localStorage.setItem(KEYS.REAL_SCORES, JSON.stringify(realScores));
  }
  function loadActiveBenchmarks() {
    try { return JSON.parse(localStorage.getItem(KEYS.BENCHMARKS) || '{}'); }
    catch (e) { return {}; }
  }
  function saveActiveBenchmarks() {
    localStorage.setItem(KEYS.BENCHMARKS, JSON.stringify(activeBenchmarks));
  }
  function loadRecabHistory() {
    try { return JSON.parse(localStorage.getItem(KEYS.RECAB_HISTORY) || '[]'); }
    catch (e) { return []; }
  }
  function saveRecabHistory() {
    localStorage.setItem(KEYS.RECAB_HISTORY, JSON.stringify(recabHistory));
  }

  /* ---- Construcción del estado de ejemplo ----
   * Cada bloque recibe un id único generado al instanciarse.
   * ------------------------------------------------------- */
  function exampleState(full = true) {
    const ex = EXAMPLE_STATE;
    const project = full ? ex.project : { ...ex.project, title: '', promise: '', audience: '' };
    const blocks = full ? ex.blocks.map(b => ({ id: uid(), type: b.type, text: b.text, addsTime: !!b.addsTime, seconds: Number(b.seconds) || 0 })) : [];
    return { project, blocks };
  }

  function b(type, text, addsTime = false, seconds = 0) { return { id: uid(), type, text, addsTime, seconds }; }

  /* ---- Persistencia ---- */
  function loadState() {
    try { return JSON.parse(localStorage.getItem(STORE) || 'null'); }
    catch (e) { return null; }
  }
  function saveState() {
    localStorage.setItem(STORE, JSON.stringify(state));
    $('#autosavePill').textContent = 'Guardado ' + new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  }
  function scheduleSave() { clearTimeout(saveTimer); saveTimer = setTimeout(saveState, 350); }

  /* ---- Render central ---- */
  function getCalibrationMeta() {
    // Prioridad 1: realRetention manual (per-video)
    const manual = Number(state.project.realRetention);
    if (Number.isFinite(manual) && manual > 0 && manual <= 100) {
      return { kind: 'manual' };
    }
    // Prioridad 2: activeBenchmarks por bucket
    const f = state.project.format, g = state.project.genre;
    if (activeBenchmarks[f] && activeBenchmarks[f][g] != null) {
      const n = realScores.filter(r => r.format === f && r.genre === g && Number.isFinite(r.real_apv_pct) && r.real_apv_pct > 0).length;
      return { kind: 'bucket', format: f, genre: g, sampleCount: n };
    }
    return { kind: 'none' };
  }

  function renderAll() {
    lastAnalysis = window.Model.analyze(state, activeBenchmarks);
    window.Render.renderMetrics(lastAnalysis, state, getCalibrationMeta());
    window.Render.renderBlocks(state, lastAnalysis);
  }
  function rerenderMetricsOnly() {
    lastAnalysis = window.Model.analyze(state, activeBenchmarks);
    window.Render.renderMetrics(lastAnalysis, state, getCalibrationMeta());
  }

  /* ---- Visibilidad del panel de métricas ---- */
  function setMetricsVisible(visible, persist = true) {
    document.body.classList.toggle('metrics-hidden', !visible);
    const btn = $('#btnToggleMetrics');
    if (btn) {
      btn.textContent = visible ? 'Métricas: ON' : 'Métricas: OFF';
      btn.setAttribute('aria-pressed', String(visible));
      btn.classList.toggle('good', visible);
    }
    if (persist) localStorage.setItem('yt-script-lab-metrics-visible', visible ? '1' : '0');
  }

  /* ---- Import JSON ---- */
  function normalizeImportedJson(data) {
    const src = data && data.project && Array.isArray(data.blocks) ? data : (data && data.state && data.state.project && Array.isArray(data.state.blocks) ? data.state : null);
    if (!src) throw new Error('Formato no compatible');
    const base = exampleState(false).project;
    const project = { ...base, ...src.project };
    project.targetMinutes = Number(project.targetMinutes) || base.targetMinutes;
    project.wpm = Number(project.wpm) || base.wpm;
    project.realRetention = project.realRetention || '';
    const blocks = src.blocks.map(x => ({ id: x.id || uid(), type: TYPES[x.type] ? x.type : 'voice', text: typeof x.text === 'string' ? x.text : '', addsTime: !!x.addsTime, seconds: Number(x.seconds) || 0 }));
    return { project, blocks };
  }
  function importJsonFile(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = normalizeImportedJson(JSON.parse(reader.result));
        if (state.blocks.length && !confirm('Importar este JSON reemplazará el guion actual. ¿Continuar?')) return;
        state = imported;
        initFromState();
        saveState();
        toast('JSON importado');
      } catch (err) { toast('JSON inválido o incompatible', 'bad'); }
    };
    reader.onerror = () => toast('No se pudo leer el archivo', 'bad');
    reader.readAsText(file);
  }

  /* ---- Binding de eventos ---- */
  function bind() {
    const metricsStored = localStorage.getItem('yt-script-lab-metrics-visible');
    setMetricsVisible(metricsStored !== '0', false);

    const metricBtn = $('#btnToggleMetrics');
    if (metricBtn) metricBtn.onclick = () => setMetricsVisible(document.body.classList.contains('metrics-hidden'));

    const importBtn = $('#btnImportJson'), importInput = $('#jsonImportInput');
    if (importBtn && importInput) {
      importBtn.onclick = () => importInput.click();
      importInput.addEventListener('change', () => { const file = importInput.files && importInput.files[0]; if (file) importJsonFile(file); importInput.value = ''; });
    }

    ['projectTitle', 'projectPromise', 'projectAudience', 'projectFormat', 'projectGenre', 'targetMinutes', 'wpm', 'realRetention'].forEach(id => {
      const el = $('#' + id);
      if (!el) return;
      el.addEventListener('input', () => { readProject(); updateProjectLabels(); rerenderMetricsOnly(); scheduleSave(); });
      el.addEventListener('change', () => { readProject(); updateProjectLabels(); rerenderMetricsOnly(); scheduleSave(); });
    });

    $$('[data-add]').forEach(btn => btn.onclick = () => addBlock(btn.dataset.add));

    $('#blocks').addEventListener('input', e => {
      const card = e.target.closest('.block'); if (!card) return;
      const block = state.blocks.find(b => b.id === card.dataset.id); if (!block) return;
      if (e.target.classList.contains('js-text')) { block.text = e.target.value; window.Render.autoResize(e.target); }
      if (e.target.classList.contains('js-seconds')) block.seconds = Number(e.target.value) || 0;
      rerenderMetricsOnly();
      updateBlockInline(card, block);
      scheduleSave();
    });
    $('#blocks').addEventListener('change', e => {
      const card = e.target.closest('.block'); if (!card) return;
      const idx = state.blocks.findIndex(b => b.id === card.dataset.id);
      const block = state.blocks[idx];
      if (e.target.classList.contains('js-type')) block.type = e.target.value;
      if (e.target.classList.contains('js-adds')) block.addsTime = e.target.checked;
      lastAnalysis = window.Model.analyze(state, activeBenchmarks);
      window.Render.renderBlocks(state, lastAnalysis);
      window.Render.renderMetrics(lastAnalysis, state, getCalibrationMeta());
      scheduleSave();
    });
    $('#blocks').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]'); if (!btn) return;
      const card = btn.closest('.block'), idx = state.blocks.findIndex(b => b.id === card.dataset.id);
      if (idx < 0) return;
      const act = btn.dataset.act;
      if (act === 'del') state.blocks.splice(idx, 1);
      if (act === 'dup') state.blocks.splice(idx + 1, 0, { ...state.blocks[idx], id: uid(), text: state.blocks[idx].text });
      if (act === 'up' && idx > 0) [state.blocks[idx - 1], state.blocks[idx]] = [state.blocks[idx], state.blocks[idx - 1]];
      if (act === 'down' && idx < state.blocks.length - 1) [state.blocks[idx + 1], state.blocks[idx]] = [state.blocks[idx], state.blocks[idx + 1]];
      lastAnalysis = window.Model.analyze(state, activeBenchmarks);
      window.Render.renderBlocks(state, lastAnalysis);
      window.Render.renderMetrics(lastAnalysis, state, getCalibrationMeta());
      scheduleSave();
    });

    $$('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));

    $('#btnSave').onclick = () => { saveState(); toast('Guardado en este navegador'); };
    $('#btnExample').onclick = () => { if (confirm('¿Reemplazar el contenido actual por un ejemplo?')) { state = exampleState(true); initFromState(); saveState(); toast('Ejemplo cargado'); } };
    $('#btnExportTxt').onclick = exportTxt;
    $('#btnExportJson').onclick = exportJson;
    $('#btnExportHtml').onclick = exportHtml;

    /* ---- Botón Vista previa (abre visor.html) ---- */
    const previewBtn = $('#btnPreview');
    if (previewBtn) previewBtn.onclick = openPreview;

    /* ---- Dropdown Exportar ---- */
    const exportMenuBtn = $('#btnExportMenu');
    const exportMenu = $('#exportMenu');
    if (exportMenuBtn && exportMenu) {
      exportMenuBtn.onclick = e => {
        e.stopPropagation();
        const isOpen = exportMenu.style.display !== 'none';
        exportMenu.style.display = isOpen ? 'none' : 'block';
      };
      // Cerrar al click fuera
      document.addEventListener('click', e => {
        if (!e.target.closest('#exportDropdown')) exportMenu.style.display = 'none';
      });
      // Cerrar al elegir una opción
      exportMenu.querySelectorAll('button').forEach(b => {
        b.addEventListener('click', () => { exportMenu.style.display = 'none'; });
      });
    }

    /* ---- Botón Convertir texto (modal conversor offline) ---- */
    const promptBtn = $('#btnPromptIa');
    if (promptBtn) promptBtn.onclick = openConverterModal;
    const promptClose = $('#promptIaClose');
    if (promptClose) promptClose.onclick = closeConverterModal;
    const promptBackdrop = $('#promptIaModal');
    if (promptBackdrop) promptBackdrop.addEventListener('click', e => { if (e.target === promptBackdrop) closeConverterModal(); });
    const convertBtn = $('#promptIaCopy');
    if (convertBtn) convertBtn.onclick = runConversion;
    const clearBtn = $('#promptIaClear');
    if (clearBtn) clearBtn.onclick = () => {
      const src = $('#promptIaSource'); if (src) src.value = '';
      const prev = $('#promptIaPreview'); if (prev) prev.value = '';
      const stats = $('#converterStats'); if (stats) stats.textContent = '';
    };
    // Live conversion on input (debounced)
    const promptSource = $('#promptIaSource');
    if (promptSource) {
      let convTimer = null;
      promptSource.addEventListener('input', () => {
        clearTimeout(convTimer);
        convTimer = setTimeout(runConversion, 350);
      });
    }
    const copyJsonBtn = $('#promptIaCopyJson');
    if (copyJsonBtn) copyJsonBtn.onclick = copyConverterJson;
    const convertImportBtn = $('#promptIaPasteJson');
    if (convertImportBtn) convertImportBtn.onclick = importConverted;

    window.addEventListener('resize', () => { clearTimeout(window.__rz); window.__rz = setTimeout(() => lastAnalysis && window.Render.renderCurve(lastAnalysis), 150); });
  }

  function updateBlockInline(card, block) {
    const a = lastAnalysis;
    const idx = state.blocks.findIndex(b => b.id === block.id);
    const st = a.blockStats[idx];
    const pills = card.querySelectorAll('.block-main-head .pill');
    if (pills[0]) pills[0].textContent = window.Model.formatTime(st.start || 0);
    if (pills[1]) pills[1].textContent = window.Model.formatTime(st.duration || 0);
    if (pills[2]) pills[2].textContent = (st.words || 0) + ' palabras';
  }

  function addBlock(type) {
    state.blocks.push(b(type, '', false, type === 'pause' ? 2.5 : 0));
    lastAnalysis = window.Model.analyze(state, activeBenchmarks);
    window.Render.renderBlocks(state, lastAnalysis);
    window.Render.renderMetrics(lastAnalysis, state, getCalibrationMeta());
    scheduleSave();
    setTimeout(() => { const el = $('#blocks .block:last-child textarea'); if (el) el.focus(); }, 20);
  }

  function readProject() {
    state.project.title = $('#projectTitle').value;
    state.project.promise = $('#projectPromise').value;
    state.project.audience = $('#projectAudience').value;
    state.project.format = $('#projectFormat').value;
    state.project.genre = $('#projectGenre').value;
    state.project.targetMinutes = Number($('#targetMinutes').value) || 12;
    state.project.wpm = Number($('#wpm').value) || 150;
    state.project.realRetention = $('#realRetention').value;
  }

  function initFromState() {
    const p = state.project;
    $('#projectTitle').value = p.title || '';
    $('#projectPromise').value = p.promise || '';
    $('#projectAudience').value = p.audience || '';
    $('#projectFormat').value = p.format || 'long';
    $('#projectGenre').value = p.genre || 'documental';
    $('#targetMinutes').value = p.targetMinutes || 12;
    $('#wpm').value = p.wpm || 150;
    $('#realRetention').value = p.realRetention || '';
    updateProjectLabels();
    lastAnalysis = window.Model.analyze(state, activeBenchmarks);
    window.Render.renderMetrics(lastAnalysis, state, getCalibrationMeta());
    window.Render.renderBlocks(state, lastAnalysis);
  }

  function updateProjectLabels() {
    $('#targetMinutesLabel').textContent = window.Model.formatTime((Number($('#targetMinutes').value) || 12) * 60);
    $('#wpmLabel').textContent = (Number($('#wpm').value) || 150) + ' WPM';
    const v = Number($('#realRetention').value), badge = $('#benchmarkBadge');
    if (!badge) return;
    // Prioridad 1: realRetention manual
    if (Number.isFinite(v) && v > 0 && v <= 100) {
      badge.textContent = 'Calibrado con este video (realRetention manual)';
      badge.className = 'pill good';
      return;
    }
    // Prioridad 2: bucket recalibrado
    const f = state.project.format, g = state.project.genre;
    if (activeBenchmarks[f] && activeBenchmarks[f][g] != null) {
      const n = realScores.filter(r => r.format === f && r.genre === g && Number.isFinite(r.real_apv_pct) && r.real_apv_pct > 0).length;
      badge.textContent = `Calibrado por bucket (${f}+${g}, n=${n})`;
      badge.className = 'pill good';
      return;
    }
    badge.textContent = 'Benchmark genérico — sin calibrar con tu canal';
    badge.className = 'pill warn';
  }

  /* ---- Tabs (incluye Research y Datos Reales) ---- */
  function switchTab(name) {
    $$('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === name));
    $$('.tab-body').forEach(b => b.classList.toggle('active', b.id === 'tab-' + name));
    if (name === 'curve' && lastAnalysis) setTimeout(() => window.Render.renderCurve(lastAnalysis), 20);
    if (name === 'research') window.Render.renderSources();
    if (name === 'realdatos') {
      window.Render.renderRealData({ realScores, activeBenchmarks, recabHistory, currentProject: state.project });
      bindRealDataEvents();
    }
  }

  /* ---- Export ---- */
  function exportTxt() {
    const p = state.project;
    let txt = `${p.title || 'Guion YouTube'}\nPromesa: ${p.promise || ''}\nAudiencia: ${p.audience || ''}\n\n`;
    state.blocks.forEach((b, i) => { txt += `[${String(i + 1).padStart(2, '0')}] ${TYPES[b.type].label.toUpperCase()}\n${b.text || ''}\n\n`; });
    download('guion-youtube.txt', txt, 'text/plain');
  }
  function exportJson() {
    const payload = { ...state, analysis: lastAnalysis || window.Model.analyze(state, activeBenchmarks), exportedAt: new Date().toISOString(), method: 'YouTube Script Lab preflight v1' };
    download('guion-youtube-preflight.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  /* ---- Exportar HTML standalone (incluye visor embebido) ----
   * Genera un archivo .html único con el JSON del guion embebido y
   * todo el CSS+JS del visor. Se puede abrir con doble clic y enviar
   * a otra persona sin dependencias externas.
   * ------------------------------------------------------- */
  function exportHtml() {
    const html = buildStandaloneHtml(state);
    const safeTitle = (state.project.title || 'guion-youtube').replace(/[^\w\-]+/g, '-').toLowerCase().replace(/-+/g, '-').replace(/^-|-$/g, '') || 'guion-youtube';
    download(safeTitle + '.html', html, 'text/html');
    toast('HTML exportado (standalone, abrible con doble clic)');
  }

  function buildStandaloneHtml(stateObj) {
    // Cargar visor.html embebido + inyectar JSON como window.__SCRIPT__
    // Para mantener el archivo único sin dependencias, replicamos el visor completo.
    const json = JSON.stringify({ project: stateObj.project, blocks: stateObj.blocks });
    const css = window.VISOR_CSS || '';
    const js = window.VISOR_JS || '';
    return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${(stateObj.project.title || 'Guion YouTube').replace(/[<>&"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m]))}</title>
<style>
${css}
</style>
</head>
<body>
<script>window.__SCRIPT__ = ${json};</script>
<div class="toolbar">
  <h1>📄 ${(stateObj.project.title || 'Guion').replace(/[<>&"]/g, m => ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[m]))}</h1>
  <div class="spacer"></div>
  <span class="tb-label">Estilo</span>
  <div class="tb-group" id="styleGroup">
    <button class="tb-btn active" data-style="bloques">Bloques</button>
    <button class="tb-btn" data-style="cine">Cinematográfico</button>
    <button class="tb-btn" data-style="despejado">Despejado</button>
    <button class="tb-btn" data-style="grabacion">Grabación</button>
  </div>
  <span class="tb-label">Tema</span>
  <div class="tb-group" id="themeGroup">
    <button class="tb-btn" data-theme="dark">🌙 Dark</button>
    <button class="tb-btn" data-theme="light">☀️ Light</button>
  </div>
</div>
<div class="viewport" id="viewport"></div>
<script>
${js}
</script>
</body>
</html>`;
  }

  /* ---- Vista previa: abrir visor.html con el guion actual ----
   * Estrategia: escribir el guion en localStorage bajo una key
   * compartida y abrir visor.html en nueva pestaña. El visor la lee
   * al init y la borra. Funciona con file:// y http://.
   * ------------------------------------------------------- */
  function openPreview() {
    try {
      localStorage.setItem('yt-script-lab-visor-pending', JSON.stringify(state));
      window.open('visor.html', '_blank');
      toast('Abriendo vista previa en otra pestaña');
    } catch (e) {
      toast('No se pudo abrir el visor: ' + e.message, 'bad');
    }
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 500);
  }

  /* ---- Toast ---- */
  function toast(msg, kind = 'good') {
    const el = document.createElement('div');
    el.className = 'toast ' + (kind === 'bad' ? 'bad' : '');
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
  }

  /* =====================================================================
   * CONVERTIR TEXTO — modal conversor offline (sin LLM)
   * ===================================================================== */
  let lastConverted = null;

  function openConverterModal() {
    const modal = $('#promptIaModal');
    if (!modal) return;
    modal.classList.add('open');
    // Si ya había texto fuente (de una sesión previa), re-correr la conversión
    runConversion();
  }
  function closeConverterModal() {
    const modal = $('#promptIaModal');
    if (!modal) return;
    modal.classList.remove('open');
  }

  function runConversion() {
    const src = $('#promptIaSource');
    const prev = $('#promptIaPreview');
    const stats = $('#converterStats');
    if (!src || !prev) return;
    const text = src.value || '';
    if (!text.trim()) {
      prev.value = '';
      if (stats) stats.textContent = '';
      lastConverted = null;
      return;
    }
    try {
      const result = window.Converter.textToScript(text);
      lastConverted = result;
      prev.value = JSON.stringify(result, null, 2);
      if (stats) stats.textContent = window.Converter.describe(result);
    } catch (e) {
      prev.value = '';
      if (stats) stats.textContent = 'Error: ' + e.message;
      lastConverted = null;
    }
  }

  function copyConverterJson() {
    if (!lastConverted) { toast('Convertí primero el texto', 'bad'); return; }
    const text = JSON.stringify(lastConverted, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        () => toast('JSON copiado al portapapeles'),
        () => fallbackCopy(text)
      );
    } else {
      fallbackCopy(text);
    }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast('JSON copiado'); }
    catch (e) { toast('No se pudo copiar automáticamente — seleccioná y copiá a mano', 'bad'); }
    ta.remove();
  }

  function importConverted() {
    if (!lastConverted || !lastConverted.blocks || !lastConverted.blocks.length) {
      toast('Nada que importar — convertí primero un texto con contenido', 'bad');
      return;
    }
    if (state.blocks.length && !confirm('Esto reemplazará el guion actual. ¿Continuar?')) return;
    try {
      const imported = normalizeImportedJson(lastConverted);
      state = imported;
      initFromState();
      saveState();
      closeConverterModal();
      toast(`Guion importado: ${lastConverted.blocks.length} bloques`);
    } catch (err) {
      toast('No se pudo importar: ' + err.message, 'bad');
    }
  }

  /* =====================================================================
   * DATOS REALES — CRUD + recalibración
   * ===================================================================== */
  function bindRealDataEvents() {
    const form = $('#realScoreForm');
    if (form) form.onsubmit = e => {
      e.preventDefault();
      addRealScoreFromForm(form);
    };
    const cancel = $('#realScoreCancel');
    if (cancel) cancel.onclick = () => { form && form.reset(); };

    // Botones "Recalibrar" por bucket
    $$('[data-recab]').forEach(btn => {
      btn.onclick = () => {
        const [format, genre] = btn.dataset.recab.split('|');
        recalibrateBucketConfirm(format, genre);
      };
    });
    // Botones "Eliminar" por registro
    $$('[data-del-real]').forEach(btn => {
      btn.onclick = () => {
        if (!confirm('¿Eliminar este registro real? No se puede deshacer.')) return;
        deleteRealScore(btn.dataset.delReal);
      };
    });
  }

  function addRealScoreFromForm(form) {
    const fd = new FormData(form);
    const rec = {
      id: uid(),
      logged_at: new Date().toISOString(),
      video_title: (fd.get('video_title') || '').toString().trim(),
      published_at: (fd.get('published_at') || '').toString().trim(),
      format: (fd.get('format') || 'long').toString(),
      genre: (fd.get('genre') || 'documental').toString(),
      duration_sec: Number(fd.get('duration_sec')) || 0,
      real_apv_pct: Number(fd.get('real_apv_pct')) || 0,
      real_r30_pct: fd.get('real_r30_pct') ? Number(fd.get('real_r30_pct')) : null,
      real_ctr_pct: fd.get('real_ctr_pct') ? Number(fd.get('real_ctr_pct')) : null,
      predicted_apv_pct: fd.get('predicted_apv_pct') ? Number(fd.get('predicted_apv_pct')) : null,
      linked_script_id: (fd.get('linked_script_id') || '').toString().trim() || null
    };
    if (!rec.video_title || !rec.duration_sec || !rec.real_apv_pct) {
      toast('Faltan campos requeridos (título, duración, APV real)', 'bad');
      return;
    }
    realScores.push(rec);
    saveRealScores();
    toast('Registro agregado');
    // Re-render Datos Reales + refresh metrics (por si cambió el bucket del project actual)
    window.Render.renderRealData({ realScores, activeBenchmarks, recabHistory, currentProject: state.project });
    bindRealDataEvents();
    rerenderMetricsOnly();
    updateProjectLabels();
  }

  function deleteRealScore(id) {
    realScores = realScores.filter(r => r.id !== id);
    saveRealScores();
    window.Render.renderRealData({ realScores, activeBenchmarks, recabHistory, currentProject: state.project });
    bindRealDataEvents();
    rerenderMetricsOnly();
    updateProjectLabels();
    toast('Registro eliminado');
  }

  function recalibrateBucketConfirm(format, genre) {
    const MIN = CALIBRATION_CONFIG.MIN_SAMPLES;
    const MAXD = CALIBRATION_CONFIG.MAX_DELTA_PCT;
    const samples = realScores.filter(r => r.format === format && r.genre === genre && Number.isFinite(r.real_apv_pct) && r.real_apv_pct > 0);
    if (samples.length < MIN) {
      toast(`Faltan registros: ${samples.length}/${MIN}`, 'bad');
      return;
    }
    // Valor actual: si ya está calibrado usar ese, sino el heurístico de referencia (12min)
    const currentValue = (activeBenchmarks[format] && activeBenchmarks[format][genre] != null)
      ? activeBenchmarks[format][genre]
      : window.Model.benchmarkAPV(720, format, genre, null, null);

    const result = window.Model.recalibrateBucket(realScores, format, genre, currentValue, MIN, MAXD);
    if (!result.ok) {
      toast(result.reason || 'No se pudo recalibrar', 'bad');
      return;
    }

    // Confirmación explícita del usuario — nunca silenciosa
    const oldPct = (result.oldValue * 100).toFixed(1);
    const newPct = (result.newValue * 100).toFixed(1);
    const avgPct = (result.average * 100).toFixed(1);
    const cappedTxt = result.wasCapped ? `\n\n⚠ Tope ±${MAXD}pp aplicado. Ajuste pendiente.` : '';
    const msg = `Recalibrar bucket ${format}+${genre}:\n\n` +
                `Valor actual: ${oldPct}%\n` +
                `Promedio real (n=${result.sampleCount}): ${avgPct}%\n` +
                `Nuevo valor: ${newPct}%\n` +
                `Delta: ${(result.newValue * 100 - result.oldValue * 100).toFixed(1)}pp${cappedTxt}\n\n` +
                `Los pesos del preflight (hook·0.23, etc.) NO se tocan. ¿Confirmás la recalibración?`;
    if (!confirm(msg)) return;

    // Aplicar
    if (!activeBenchmarks[format]) activeBenchmarks[format] = {};
    activeBenchmarks[format][genre] = result.newValue;
    saveActiveBenchmarks();

    // Append al historial (nunca sobreescribir)
    recabHistory.push({
      id: uid(),
      logged_at: new Date().toISOString(),
      format, genre,
      old_value: result.oldValue,
      new_value: result.newValue,
      average: result.average,
      sample_count: result.sampleCount,
      was_capped: result.wasCapped,
      note: result.note
    });
    saveRecabHistory();

    // Re-render
    window.Render.renderRealData({ realScores, activeBenchmarks, recabHistory, currentProject: state.project });
    bindRealDataEvents();
    rerenderMetricsOnly();
    updateProjectLabels();
    toast(`Bucket ${format}+${genre} recalibrado a ${newPct}%${result.wasCapped ? ' (con tope)' : ''}`);
  }

  /* ---- Init ---- */
  function init() {
    bind();
    initFromState();
  }

  return {
    init,
    get state() { return state; },
    get lastAnalysis() { return lastAnalysis; },
    get realScores() { return realScores; },
    get activeBenchmarks() { return activeBenchmarks; },
    get recabHistory() { return recabHistory; }
  };
})();

/* ---- Auto-init al cargar el DOM ---- */
document.addEventListener('DOMContentLoaded', function () { window.App.init(); });
