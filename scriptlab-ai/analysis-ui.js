/* analysis-ui.js — Analysis tab UI logic for ScriptLab.
   Sends analysis jobs to ai-worker via workerSend() (workers.js)
   and renders results into the #analysis tab.

   Predefined topics for gap detection are based on narrative theory:
   - Aristóteles, Poética (s. IV a.C.) — tripartite structure
   - Booker, C. (2004). "The Seven Basic Plots." Continuum. */

const PREDEFINED_TOPICS = [
  { label: 'Gancho (Hook)', text: 'Una apertura que captura inmediatamente la atención del espectador con una pregunta, dato sorprendente o promesa clara' },
  { label: 'Problema', text: 'La descripción de un problema, dolor o necesidad que enfrenta la audiencia' },
  { label: 'Contexto', text: 'Información de fondo y contexto necesario para entender el tema principal' },
  { label: 'Evidencia', text: 'Datos, estadísticas, ejemplos concretos, estudios o testimonios que respaldan las afirmaciones' },
  { label: 'Solución', text: 'La propuesta de solución al problema planteado, explicada paso a paso' },
  { label: 'Giro narrativo', text: 'Un cambio inesperado en la dirección del relato que sorprende o recontextualiza lo anterior' },
  { label: 'Llamada a la acción (CTA)', text: 'Una instrucción clara sobre qué debe hacer el espectador después: suscribirse, comentar, visitar un enlace' },
  { label: 'Resumen o cierre', text: 'Un repaso de los puntos principales o una conclusión que refuerza el mensaje central' }
];

/* ===== Text splitting utilities ===== */
function splitSentences(text) {
  if (!text) return [];
  const raw = text.split(/(?<=[.!?])\s+/);
  return raw.map(s => s.trim()).filter(s => s.length > 10);
}

function splitIntoSegments(text, wpm) {
  const wordsPerMinute = wpm || getProject()?.wpm || 150;
  const segments = [];
  const words = (text || '').split(/\s+/).filter(Boolean);
  const wordsPerSegment = Math.ceil(wordsPerMinute);
  for (let i = 0; i < words.length; i += wordsPerSegment) {
    segments.push({ text: words.slice(i, i + wordsPerSegment).join(' '), label: 'Min ' + (Math.floor(i / wordsPerMinute) + 1) });
  }
  return segments.length ? segments : [{ text: text || '', label: 'Min 1' }];
}

/* ===== ACTUALIZACIÓN 1 — Resumen Extractivo ===== */
function runExtractive() {
  const proj = getProject();
  const fullText = proj.blocks.map(b => b.content).join(' ');
  if (!fullText.trim()) { $('#extractive-results').innerHTML = '<small>El guion no tiene contenido.</small>'; return; }
  const sentences = splitSentences(fullText);
  if (sentences.length < 3) { $('#extractive-results').innerHTML = '<small>Necesitás al menos 3 oraciones.</small>'; return; }
  const topN = Math.min(+$('#extract-topN').value || 5, sentences.length);
  const btn = $('#run-extractive'); btn.disabled = true; btn.textContent = 'Procesando\u2026';
  workerSend('EXTRACT_KEY_SENTENCES', { sentences, fullText, topN })
    .then(result => {
      $('#extractive-results').innerHTML = result.sentences.map(s =>
        '<div class="key-sentence">' + esc(s.text) + '<br><span class="score-badge">Relevancia: ' + Math.round(s.score * 100) + '%</span></div>'
      ).join('');
      highlightKeySentences(result.sentences.map(s => s.text));
    })
    .catch(err => { $('#extractive-results').innerHTML = '<small class="bad">Error: ' + esc(err.message) + '</small>'; })
    .finally(() => { btn.disabled = false; btn.textContent = 'Analizar'; });
}

/* ===== ACTUALIZACIÓN 2 — Redundancia Global ===== */
function runRedundancy() {
  const proj = getProject();
  const blocks = proj.blocks.map(b => b.content).filter(t => t.trim().length > 10);
  if (blocks.length < 2) { $('#redundancy-results').innerHTML = '<small>Necesitás al menos 2 bloques con contenido.</small>'; return; }
  const threshold = +($('#redundancy-threshold').value || 0.85);
  const btn = $('#run-redundancy'); btn.disabled = true; btn.textContent = 'Procesando\u2026';
  workerSend('COMPUTE_REDUNDANCY', { blocks, threshold })
    .then(result => {
      const pct = result.totalPairs > 0 ? Math.round(result.redundantCount / result.totalPairs * 100) : 0;
      let html = '<div class="redundancy-stat">' +
        '<div class="stat-card"><div class="val">' + Math.round(result.density * 100) + '%</div><div class="lbl">Densidad semántica</div></div>' +
        '<div class="stat-card"><div class="val">' + result.redundantCount + '</div><div class="lbl">Pares redundantes (>' + threshold + ')</div></div></div>';
      if (result.redundantPairs.length) {
        html += '<p style="font-size:11px;color:var(--muted);margin:8px 0 4px">Pares con alta similitud:</p>';
        result.redundantPairs.slice(0, 8).forEach(pair => {
          html += '<div class="redundancy-pair"><span class="sim-tag high">' + Math.round(pair.similarity * 100) + '%</span>' +
            '<blockquote>' + esc(pair.textA.substring(0, 120)) + '</blockquote>' +
            '<blockquote>' + esc(pair.textB.substring(0, 120)) + '</blockquote></div>';
        });
      } else {
        html += '<small style="color:var(--good)">No se detectaron pares redundantes. Buena densidad semántica.</small>';
      }
      $('#redundancy-results').innerHTML = html;
    })
    .catch(err => { $('#redundancy-results').innerHTML = '<small class="bad">Error: ' + esc(err.message) + '</small>'; })
    .finally(() => { btn.disabled = false; btn.textContent = 'Analizar'; });
}

/* ===== ACTUALIZACIÓN 3 — Densidad Temática por Minuto ===== */
function runDensity() {
  const proj = getProject();
  const fullText = proj.blocks.map(b => b.content).join(' ');
  if (!fullText.trim()) { $('#density-results').innerHTML = '<small>El guion no tiene contenido.</small>'; return; }
  const segments = splitIntoSegments(fullText, proj.wpm);
  const btn = $('#run-density'); btn.disabled = true; btn.textContent = 'Procesando\u2026';
  workerSend('COMPUTE_DENSITY', { segments, fullText })
    .then(result => {
      let html = '<div class="density-header"><span class="density-value">' + result.topicsPerMinute + '</span><span class="density-unit">temas estimados por minuto</span></div>';
      html += '<div style="font-size:11px;color:var(--muted);margin:4px 0">Densidad global: ' + Math.round(result.density * 100) + '% · ' + result.totalSegments + ' segmentos</div>';
      if (result.changes.length) {
        html += '<div class="density-changes">';
        result.changes.forEach(c => { html += '<div class="density-change">Cambio temático después del segmento ' + c.afterSegment + ' (similitud: ' + Math.round(c.similarity * 100) + '%)</div>'; });
        html += '</div>';
      }
      $('#density-results').innerHTML = html;
      renderDensityChart(result);
    })
    .catch(err => { $('#density-results').innerHTML = '<small class="bad">Error: ' + esc(err.message) + '</small>'; })
    .finally(() => { btn.disabled = false; btn.textContent = 'Analizar'; });
}

/* ===== ACTUALIZACIÓN 5 — Detección de Huecos ===== */
function runGaps() {
  const proj = getProject();
  const blocks = proj.blocks.map(b => b.content).filter(t => t.trim());
  if (blocks.length < 1) { $('#gap-results').innerHTML = '<small>El guion no tiene contenido.</small>'; return; }
  const btn = $('#run-gaps'); btn.disabled = true; btn.textContent = 'Procesando\u2026';
  const topics = PREDEFINED_TOPICS.map(t => ({ label: t.label, text: t.text }));
  workerSend('DETECT_GAPS', { blocks, topics })
    .then(result => {
      let html = '<div class="gaps-list">';
      if (result.adaptiveThreshold !== undefined) {
        html += '<div class="gap-item covered" style="border-left-color:var(--a);margin-bottom:8px"><div class="gap-topic">Umbral adaptativo: ' +
          (result.adaptiveThreshold * 100).toFixed(0) + '%</div><small>Media: ' + (result.baselineMean * 100).toFixed(0) +
          '% · \u03C3: ' + (result.baselineStd * 100).toFixed(0) +
          '% · Un tema es hueco si su mejor match est\u00e1 por debajo de media\u2212\u03C3.</small></div>';
      }
      result.gaps.forEach(g => { html += '<div class="gap-item"><div class="gap-topic">' + esc(g.topic) + '</div><small>Mejor match: ' + Math.round(g.maxSimilarity * 100) + '% (bloque #' + (g.bestBlock + 1) + ')</small></div>'; });
      result.covered.forEach(g => { html += '<div class="gap-item covered"><div class="gap-topic">' + esc(g.topic) + '</div><small>Cubierto (' + Math.round(g.maxSimilarity * 100) + '% · bloque #' + (g.bestBlock + 1) + ')</small></div>'; });
      html += '</div>';
      $('#gap-results').innerHTML = html;
    })
    .catch(err => { $('#gap-results').innerHTML = '<small class="bad">Error: ' + esc(err.message) + '</small>'; })
    .finally(() => { btn.disabled = false; btn.textContent = 'Analizar'; });
}

/* ===== Analysis tab state — V1: invite/notice/content toggle ===== */
function updateAnalysisTabState() {
  const proj = getProject();
  const isAI = proj?.aiMode === 'embeddings' && typeof worker !== 'undefined' && worker;
  const invite = $('#analysis-invite');
  const notice = $('#analysis-notice');
  const content = $('#analysis-content');
  if (invite && notice && content) {
    invite.hidden = isAI;
    notice.hidden = true;
    content.hidden = !isAI;
  }
}

/* ===== Bind analysis tab buttons ===== */
function bindAnalysis() {
  const btn = (id, fn) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  btn('run-extractive', runExtractive);
  btn('run-redundancy', runRedundancy);
  btn('run-density', runDensity);
  btn('run-gaps', runGaps);
  const tabBtn = document.querySelector('[data-tab="analysis"]');
  if (tabBtn) tabBtn.addEventListener('click', () => { updateAnalysisTabState(); });
}