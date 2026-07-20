/* render.js — All DOM rendering for ScriptLab.
   Canvas, metrics, timeline, teleprompter, retention panel, charts.
   Reads state from store.js getters and scoring.js.
   Triggered by store subscriptions (set up in main.js). */

/* ===== Chart instances (module-scoped) ===== */
let retentionChartInstance = null;
let densityChartInstance = null;

/* ===== Main render orchestrator ===== */
function render() {
  const proj = getProject();
  $('#title').value = proj.title;
  $('#promise').value = proj.promise;
  $('#wpm').value = proj.wpm || 150;
  $('#wpm-value').textContent = proj.wpm || 150;
  const durSlider = $('#target-duration');
  if (durSlider) {
    durSlider.value = proj.targetDuration || 0;
    $('#target-duration-value').textContent = proj.targetDuration ? time(proj.targetDuration) : '—';
  }

  let a = analysis(), flow = $('#flow');
  $('#empty').hidden = !!proj.blocks.length;

  if (flowDirty) {
    flow.innerHTML = proj.blocks.map((b, i) => {
      let [n, c] = T[b.type], q = quality(b, a);
      return '<article draggable="true" class="flow-block ' + (getSelection() === b.id ? 'selected' : '') +
        '" data-id="' + b.id + '" style="--color:' + c + '">' +
        '<header>' + n + '<span>· ' + (i + 1) + '</span></header>' +
        '<input class="block-title-input" value="' + esc(b.label || n) + '" data-title="' + b.id + '" spellcheck="false">' +
        '<textarea class="inline-block-editor" data-inline="' + b.id + '" placeholder="Pegá o escribí el contenido del bloque…">' +
        esc(b.content) + '</textarea>' +
        '<footer>' + W(b.content) + ' palabras · ' + D(b.content) + ' s ' +
        '<b class="quality ' + q[1] + '">' + q[0] + '</b>' +
        '<button class="delete-inline" data-delete="' + b.id + '" title="Eliminar bloque" aria-label="Eliminar bloque">' +
        TRASH_SVG + '</button></footer></article>';
    }).join('');
    bindBlocks();
    flowDirty = false;
  }

  renderMetrics(a);
  scheduleAI();
  scheduleSentiment();
  renderTimeline();
  renderTele();
  draw(a);
}

/* ===== Block list: bind events after innerHTML ===== */
function bindBlocks() {
  $$('.flow-block').forEach(e => {
    /* Click to select — lightweight CSS toggle, no full re-render */
    e.onclick = event => {
      if (event.target.matches('textarea,button,svg,path')) return;
      setSelection(e.dataset.id);
      $$('.flow-block').forEach(x => x.classList.toggle('selected', x.dataset.id === getSelection()));
    };

    /* Inline content editing — INCREMENTAL: updates only the block footer,
       does NOT re-render the entire flow (no innerHTML, no bindBlocks). */
    const text = e.querySelector('.inline-block-editor');
    if (text) {
      const grow = () => { text.style.height = 'auto'; text.style.height = text.scrollHeight + 'px'; };
      grow();
      text.oninput = () => {
        const b = getProject().blocks.find(x => x.id === text.dataset.inline);
        if (!b) return;
        b.content = text.value;
        grow();
        save();

        /* Incremental footer update (skip full flow re-render) */
        const a = analysis();
        const q = quality(b, a);
        const footer = e.querySelector('footer');
        if (footer) {
          footer.firstChild.textContent = W(b.content) + ' palabras \xb7 ' + D(b.content) + ' s ';
          const qualityEl = footer.querySelector('.quality');
          if (qualityEl) {
            qualityEl.textContent = q[0];
            qualityEl.className = 'quality ' + q[1];
          }
        }

        renderMetrics(a);
        scheduleAI();
        scheduleSentiment();
      };
      text.onclick = event => event.stopPropagation();
    }

    /* Title editing */
    const titleInput = e.querySelector('.block-title-input');
    if (titleInput) {
      titleInput.oninput = () => {
        const b = getProject().blocks.find(x => x.id === titleInput.dataset.title);
        if (!b) return;
        b.label = titleInput.value;
        save();
      };
      titleInput.onclick = event => event.stopPropagation();
      titleInput.onfocus = () => titleInput.select();
    }

    /* Delete button */
    const remove = e.querySelector('[data-delete]');
    if (remove) remove.onclick = event => {
      event.stopPropagation();
      const id = remove.dataset.delete;
      const proj = getProject();
      proj.blocks = proj.blocks.filter(b => b.id !== id);
      if (getSelection() === id) setSelection(null);
      flowDirty = true;
      save();
      notify('project');
    };

    /* Drag-and-drop reordering */
    e.ondragstart = x => {
      if (x.target.matches('textarea')) return;
      x.dataTransfer.setData('id', e.dataset.id);
    };
    e.ondragover = x => {
      x.preventDefault();
      if (!paletteDragType) e.classList.add('dragover');
    };
    e.ondragleave = x => {
      if (!e.contains(x.relatedTarget)) e.classList.remove('dragover', 'dragover-top', 'dragover-bottom');
    };
    e.ondrop = x => {
      x.preventDefault();
      const pType = x.dataTransfer.getData('palette-type');
      if (pType) {
        const rect = e.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        add(pType, x.clientY < mid ? e.dataset.id : null);
        return;
      }
      let id = x.dataTransfer.getData('id');
      const proj = getProject();
      let from = proj.blocks.findIndex(b => b.id === id);
      let to = proj.blocks.findIndex(b => b.id === e.dataset.id);
      if (from >= 0 && to >= 0 && from !== to) {
        let [moved] = proj.blocks.splice(from, 1);
        proj.blocks.splice(to, 0, moved);
        flowDirty = true;
        save();
        notify('project');
      }
    };
  });
}

/* ===== Metrics panel (right sidebar) — V1: clear language, no jargon ===== */
function renderMetrics(a) {
  const proj = getProject();
  const ai = getAIResult();
  $('#score').textContent = a.score;
  $('#bar').style.width = a.score + '%';

  /* Score sub-label */
  const sub = $('#score-sub');
  if (sub) {
    if (a.calibrated) sub.textContent = 'Ajustada con ' + a.reference + '% APV real (últ. 5 videos)';
    else sub.textContent = a.rawIcn + ' puntos base · sin datos reales todavía';
  }

  const blockTime = proj.blocks.reduce((s, b) => s + D(b.content), 0);
  const targetTime = +(proj.targetDuration || 0);
  const diff = targetTime > 0 ? targetTime - blockTime : 0;

  /* Metric cards with clear labels and help icons */
  const metrics = [
    { label: 'Apertura', help: 'hook', value: a.hs + '/100', cls: a.hs >= 60 ? 'good' : a.hs >= 35 ? 'warn' : 'bad', hint: a.hs >= 60 ? 'Buena apertura' : a.hs >= 35 ? 'Puede mejorar' : 'Necesita atención' },
    { label: 'Claridad del texto', help: 'cl', value: a.cl + '/100', cls: a.cl >= 50 ? 'good' : a.cl >= 30 ? 'warn' : 'bad', hint: a.cl >= 50 ? 'Fácil de seguir' : a.cl >= 30 ? 'Algo denso' : 'Difícil de leer' },
    { label: 'Ritmo narrativo', help: 'pa', value: a.pa + '/100', cls: a.pa >= 50 ? 'good' : a.pa >= 30 ? 'warn' : 'bad', hint: a.pa >= 50 ? 'Buen ritmo' : a.pa >= 30 ? 'Monótono' : 'Muy plano' },
    { label: 'Coherencia con la promesa', help: 'pr', value: a.pr >= 50 ? 'Sí' : 'No', cls: a.pr >= 50 ? 'good' : 'bad', hint: a.pr >= 50 ? 'El hook y la promesa coinciden' : 'La promesa no aparece en el hook' },
    { label: 'Duración del guion', help: null, value: time(blockTime), cls: '', hint: targetTime > 0 ? (diff > 0 ? 'Falta ' + time(diff) : diff === 0 ? 'Exacto' : 'Sobran ' + time(Math.abs(diff))) : '' },
  ];

  /* AI metrics — only show when AI is active */
  if (ai) {
    const alignPct = Math.round(ai.alignment * 100);
    const redundPct = Math.round(ai.redundancy * 100);
    metrics.push({ label: 'Alineación semántica (IA)', help: null, value: alignPct + '%', cls: alignPct >= 40 ? 'good' : alignPct >= 20 ? 'warn' : 'bad', hint: 'Qué tan conectado está el texto con su propio tema' });
    metrics.push({ label: 'Repetición (IA)', help: null, value: redundPct + '%', cls: redundPct <= 30 ? 'good' : redundPct <= 60 ? 'warn' : 'bad', hint: 'Porcentaje del guion que se repite' });
  }
  if (getRetentionResult()) {
    metrics.push({ label: 'Retención estimada', help: null, value: getRetentionResult().overallRetention + '%', cls: getRetentionResult().overallRetention >= 60 ? 'good' : getRetentionResult().overallRetention >= 40 ? 'warn' : 'bad', hint: 'APV predicho por el modelo' });
  }

  $('#metric-grid').innerHTML = metrics.map(m =>
    '<div class="metric-card">' +
      '<div class="mc-label">' + m.label +
        (m.help ? ' <i class="mc-help" data-meth="' + m.help + '" title="">?</i>' : '') +
      '</div>' +
      '<div class="mc-value ' + m.cls + '">' + m.value + '</div>' +
      (m.hint ? '<div class="mc-hint">' + esc(m.hint) + '</div>' : '') +
    '</div>'
  ).join('');

  /* Risks — clearer language */
  const riskMap = {
    'Sin Hook definido': 'No hay un bloque de apertura (Hook). Agregá uno al principio.',
    'Hook demasiado corto': 'El bloque de apertura tiene menos de 12 palabras. Extendelo para captar atención.',
    'La promesa no aparece en el Hook': 'Lo que prometés en la barra lateral no se menciona en la apertura.',
    'Oraciones extensas': 'Algunas oraciones superan las 25 palabras. Acortalas para que sea más fácil de seguir.',
    'Oraciones demasiado cortas (estilo infantil)': 'Las oraciones son muy cortas en promedio. Esto puede sonar fragmentado.',
    'Ritmo visual bajo': 'El guion es largo y tiene pocos cambios visuales. Agregá notas visuales o giros narrativos.',
    'Sin CTA': 'No hay un cierre ni llamada a la acción al final del guion.',
  };
  const baseRisks = a.r.map(x => {
    const hint = riskMap[x[1]] || x[1];
    const cls = x[0] === 'good' ? 'good' : x[0];
    return '<li class="' + cls + '">' + esc(hint) + (x[2] ? ' <small style="opacity:.6">(bloque "' + (T[proj.blocks.find(b => b.id === x[2])?.type] || [])[0] + '")</small>' : '') + '</li>';
  }).join('') || '<li class="good">Todo bien por ahora. Escribí contenido para ver sugerencias.</li>';
  const durWarn = diff > 0 ? '<li class="warn">Faltan ~' + time(diff) + ' de contenido para llegar al objetivo de duración.</li>' : '';

  let explain;
  if (ai) {
    const bl = ai.baseline || {};
    explain = '<li class="ai-insight"><b>Modelo de IA activo</b>' +
      'Alineación hook–promesa: ' + Math.round(ai.alignment * 100) + '%. ' +
      'Repetición: ' + Math.round(ai.redundancy * 100) + '%. ' +
      'Se analizaron ' + (bl.pairCount || 0) + ' pares de bloques con embeddings multilingüe.</li>';
  } else {
    explain = '<li class="ai-insight"><b>Análisis sin IA</b>Las métricas se calculan con reglas locales (legibilidad, estructura, ritmo). Para análisis semántico, activá IA local desde el panel izquierdo.</li>';
  }
  $('#risks').innerHTML = (durWarn ? durWarn : '') + baseRisks + explain;
  renderHeuristics();
}

/* ===== Timeline view ===== */
function renderTimeline() {
  const proj = getProject();
  let s = 0;
  $('#timeline-list').innerHTML = proj.blocks.map((b, i) => {
    let t = s; s += D(b.content);
    return '<div class="timeline-item"><small>' + time(t) + '</small>' +
      '<i class="dot" style="background:' + T[b.type][1] + '"></i>' +
      '<button data-go="' + b.id + '">' + (i + 1) + '. ' + esc(b.label || T[b.type][0]) + '</button>' +
      '<small>' + D(b.content) + 's</small></div>';
  }).join('');
  $$('[data-go]').forEach(x => x.onclick = () => { setSelection(x.dataset.go); view('canvas'); render(); });
}

/* ===== Teleprompter view ===== */
function renderTele() {
  const proj = getProject();
  $('#teletext').innerHTML = proj.blocks.filter(b => b.content)
    .map(b => '<section class="tele-section"><small>' + T[b.type][0] + '</small><p>' + esc(b.content) + '</p></section>').join('') ||
    '<p>Sin contenido para leer.</p>';
}

/* ===== ICN curve (canvas) ===== */
function draw(a) {
  let c = $('#chart'), x = c.getContext('2d'), w = c.width, h = c.height;
  x.clearRect(0, 0, w, h);
  x.strokeStyle = '#303b53';
  for (let y = 35; y < h; y += 40) { x.beginPath(); x.moveTo(30, y); x.lineTo(w - 10, y); x.stroke(); }
  x.strokeStyle = '#32d2ac'; x.lineWidth = 3;
  x.beginPath();
  x.moveTo(30, 18);
  x.bezierCurveTo(100, 55, 130, 60 + (100 - a.hs) / 2, 180, 70);
  x.bezierCurveTo(300, 95, 380, 100 + (100 - a.pa) / 3, w - 12, h - a.score * 1.5);
  x.stroke();
  x.fillStyle = '#9aa8c0'; x.font = '11px sans-serif';
  x.fillText('ICN ' + a.score + '/100', 35, 17);
}

/* ===== Methodology panel (no longer renders into a details element) ===== */
function renderHeuristics() {
  /* The methodology panel is static HTML in index.html. Just wire the toggle. */
  const toggle = $('#methodology-toggle');
  const panel = $('#methodology-panel');
  if (toggle && panel && !toggle._wired) {
    toggle._wired = true;
    toggle.onclick = () => panel.classList.toggle('visible');
  }
}

/* ===== Calibration data ===== */
function renderCal() {
  all('calibrations').then(rows => {
    $('#caldata').innerHTML = rows.length
      ? rows.map(r => '<p>' + r.format + ' · ' + r.genre + ': <b>' + r.apv + '%</b></p>').join('')
      : '<small>Sin datos todavía.</small>';
  });
}

/* ===== Analysis tab state ===== */
function updateAnalysisTabState() {
  const proj = getProject();
  const isAI = proj?.aiMode === 'embeddings' && worker;
  const notice = $('#analysis-notice');
  const content = $('#analysis-content');
  if (notice) notice.hidden = isAI;
  if (content) content.hidden = !isAI;
}

/* ===== Highlight key sentences in canvas ===== */
function highlightKeySentences(keyTexts) {
  const keySet = new Set(keyTexts.map(t => t.trim().substring(0, 60)));
  $$('.flow-block').forEach(el => {
    const content = el.querySelector('.inline-block-editor');
    if (!content) return;
    const text = content.value.trim();
    const isKey = keyTexts.some(kt => text.includes(kt.trim().substring(0, 60)));
    el.classList.toggle('highlighted', isKey);
  });
}

/* ===== Retention panel ===== */
function renderRetentionPanel() {
  const r = getRetentionResult();
  if (!r) return;
  $('#retention-score').textContent = r.overallRetention + '%';
  $('#retention-confidence').textContent = Math.round(r.confidence * 100) + '%';
  $('#retention-duration').textContent = time(r.meta.totalDuration);
  $('#retention-blocks').textContent = r.meta.contentBlocks + '/' + r.meta.totalBlocks;
  const scoreEl = $('#retention-score');
  scoreEl.className = 'retention-score ' + (r.overallRetention >= 60 ? 'good' : r.overallRetention >= 40 ? 'warn' : 'bad');
  renderRetentionChart(r.curve);

  let insHtml = r.insights.map(i => '<div class="retention-insight">' + esc(i) + '</div>').join('');
  if (r.formula) insHtml += '<div class="retention-formula-label">' + esc(r.formula) + '</div>';

  const sc = r.scores || {};
  let scoreHtml = '<div class="retention-score-grid">';
  const scoreItems = [
    ['Hook', sc.hook], ['Pacing', sc.pacing], ['Interrupts', sc.patternInterrupts],
    ['Densidad', sc.contentDensity], ['Promesa', sc.promiseDelivery],
    ['Legibilidad', sc.readability], ['CTA', sc.cta], ['Narrativa', sc.narrative]
  ];
  scoreItems.forEach(([label, data]) => {
    if (!data) return;
    const cls = data.score >= 70 ? 'good' : data.score >= 45 ? 'warn' : 'bad';
    scoreHtml += '<div class="retention-score-item"><div class="rsi-label">' + label + '</div>' +
      '<div class="rsi-value ' + cls + '">' + data.score + '</div>' +
      (data.formula ? '<div class="rsi-formula">' + esc(data.formula) + '</div>' : '') + '</div>';
  });
  scoreHtml += '</div>';

  let riskHtml = r.risks.length ? '<div class="retention-risk-title">Riesgos</div>' + r.risks.map(x => '<div class="retention-risk">' + esc(x) + '</div>').join('') : '';
  let recHtml = r.recommendations.length ? '<div class="retention-rec-title">Recomendaciones</div>' + r.recommendations.map(x => '<div class="retention-rec">' + esc(x) + '</div>').join('') : '';

  let wHtml = '';
  const wd = $('#retention-weights-detail');
  if (wd) wHtml = Object.entries(r.weights).map(([k, v]) =>
    '<div class="weight-row"><span>' + k + '</span><b>' + Math.round(v * 100) + '%</b></div>'
  ).join('');

  $('#retention-insights').innerHTML = insHtml + scoreHtml;
  $('#retention-risks').innerHTML = riskHtml;
  $('#retention-recommendations').innerHTML = recHtml;
  if (wd) wd.innerHTML = wHtml;
}

/* ===== Sentiment arc (independent from retention) ===== */
function renderSentimentArc() {
  const root = $('#sentiment-arc');
  if (!root) return;
  const sent = getSentimentResult();
  const proj = getProject();

  /* Empty state: no AI mode, no result, or no content */
  if (!sent || !sent.sentimentArc || !sent.sentimentArc.length) {
    if (proj?.aiMode === 'embeddings' && sentimentReady) {
      root.innerHTML = '<p class="eyebrow" style="margin-bottom:8px">Arco emocional</p>' +
        '<div class="sentiment-empty">Escribí contenido en los bloques para ver el arco emocional del guion.</div>';
    } else {
      root.innerHTML = '';
    }
    return;
  }

  /* Map blockIndex → block type name for labels */
  const typeNames = proj.blocks.reduce((m, b, i) => { m[i] = T[b.type]?.[0] || b.type; return m; }, {});

  /* Per-block sequence */
  let html = '<p class="eyebrow" style="margin-bottom:8px">Arco emocional <span style="opacity:.5">(robertuito)</span></p>';
  html += '<div class="sentiment-sequence">';
  sent.sentimentArc.forEach(pt => {
    const cls = pt.label.toLowerCase();
    const typeName = typeNames[pt.blockIndex] || '';
    html += '<div class="sentiment-pt ' + cls + '">' +
      '<span class="sentiment-dot ' + cls + '"></span>' +
      'Bloque ' + (pt.blockIndex + 1) + (typeName ? ' · ' + esc(typeName) : '') +
      ' <small>' + (pt.valence >= 0 ? '+' : '') + pt.valence.toFixed(2) + '</small></div>';
  });
  html += '</div>';

  /* Aggregated metrics — 2×2 grid */
  const engPct = Math.round((sent.engagementScore || 0) * 100);
  const engCls = engPct >= 50 ? 'good' : engPct >= 25 ? 'warn' : 'bad';
  const momPts = ((sent.emotionalMomentum || 0) * 100).toFixed(0);
  const momCls = (sent.emotionalMomentum || 0) >= 0.1 ? 'good' : (sent.emotionalMomentum || 0) <= -0.1 ? 'bad' : 'warn';
  const jumpCount = (sent.tonalJumps || []).length;
  const jumpCls = jumpCount <= 2 ? 'good' : jumpCount <= 5 ? 'warn' : 'bad';
  const ctaPct = Math.round((sent.ctaEmotionalScore || 0) * 100);
  const ctaCls = ctaPct >= 50 ? 'good' : ctaPct >= 25 ? 'warn' : 'bad';

  html += '<div class="sentiment-summary">';
  html += '<div class="sentiment-metric"><small>Engagement</small><b class="' + engCls + '">' + engPct + '%</b></div>';
  html += '<div class="sentiment-metric"><small>Momentum</small><b class="' + momCls + '">' + ((sent.emotionalMomentum || 0) >= 0 ? '+' : '') + momPts + 'pts</b></div>';
  html += '<div class="sentiment-metric"><small>Saltos tonales</small><b class="' + jumpCls + '">' + jumpCount + '</b></div>';
  html += '<div class="sentiment-metric"><small>CTA emocional</small><b class="' + ctaCls + '">' + ctaPct + '%</b></div>';
  html += '</div>';

  /* Tonal jumps detail — collapsible */
  const jumps = sent.tonalJumps || [];
  if (jumps.length) {
    html += '<details class="sentiment-jumps-detail"><summary>Detalle de saltos tonales</summary>';
    jumps.forEach(j => {
      const sevCls = j.severity === 'high' ? 'bad' : j.severity === 'medium' ? 'warn' : '';
      const sevLabel = j.severity === 'high' ? 'alto' : j.severity === 'medium' ? 'medio' : 'bajo';
      html += '<div class="sentiment-jump-item">' +
        '<span class="jump-severity ' + sevCls + '">●</span>' +
        'Bloque ' + (j.fromBlock + 1) + ' → ' + (j.toBlock + 1) + ': ' +
        esc(j.fromLabel) + ' → ' + esc(j.toLabel) +
        ' <small class="muted">(Δ ' + Math.abs(j.deltaValence).toFixed(2) + ' · ' + sevLabel + ')</small></div>';
    });
    html += '</details>';
  }

  /* Formula */
  html += '<div class="retention-formula-label" style="margin-top:10px">' +
    'engagement = min(1, varianza\u00D72 + |media|\u00D70.5) \u00B7 momentum = \u00FAltimo_tercio \u2212 primer_tercio</div>';

  root.innerHTML = html;
}

/* ===== Retention chart (Chart.js) ===== */
function renderRetentionChart(curve) {
  const wrap = $('#retention-chart-wrap');
  const canvas = $('#retention-chart');
  if (!canvas || !wrap) return;
  if (!curve.length) { wrap.hidden = true; return; }
  if (typeof Chart === 'undefined') return;
  wrap.hidden = false;
  if (retentionChartInstance) { retentionChartInstance.destroy(); retentionChartInstance = null; }
  const ctx = canvas.getContext('2d');
  const labels = curve.map(pt => '#' + (pt.blockIndex + 1) + ' ' + pt.blockLabel);
  const data = curve.map(pt => pt.retentionPct);
  const bgColors = curve.map(pt => pt.isDropRisk ? 'rgba(255,104,121,0.8)' : 'rgba(121,105,255,0.6)');
  const borderColors = curve.map(pt => pt.isDropRisk ? '#ff6879' : '#7969ff');
  retentionChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Retención estimada (%)', data,
        borderColor: '#7969ff', backgroundColor: 'rgba(121,105,255,0.1)',
        borderWidth: 2, pointRadius: 6,
        pointBackgroundColor: bgColors, pointBorderColor: borderColors,
        fill: true, tension: 0.3
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, aspectRatio: 2.5,
      scales: {
        y: { min: 0, max: 100, ticks: { color: '#9aa8c0', font: { size: 10 }, callback: v => v + '%' }, grid: { color: '#303b53' } },
        x: { ticks: { color: '#9aa8c0', font: { size: 9 }, maxRotation: 45 }, grid: { display: false } }
      },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => 'Retención: ' + ctx.parsed.y + '%' + (curve[ctx.dataIndex]?.isDropRisk ? ' \u26A0 Riesgo de fuga' : '') } }
      }
    }
  });
}

/* ===== Density chart (Chart.js) ===== */
function renderDensityChart(result) {
  const canvas = $('#density-chart');
  if (!canvas || typeof Chart === 'undefined') return;
  if (densityChartInstance) { densityChartInstance.destroy(); densityChartInstance = null; }
  const ctx = canvas.getContext('2d');
  const labels = result.segments.map(s => s.label);
  const data = result.segments.map(s => Math.round(s.globalSim * 100));
  const avgLine = result.segments.map(() => Math.round(result.avgGlobalSim * 100));
  densityChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Similitud con global (%)', data, backgroundColor: 'rgba(121,105,255,0.6)', borderColor: '#7969ff', borderWidth: 1, borderRadius: 4 },
        { label: 'Promedio', data: avgLine, type: 'line', borderColor: '#f4b857', borderDash: [4, 4], pointRadius: 0, borderWidth: 1, fill: false }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        y: { min: 0, max: 100, ticks: { color: '#9aa8c0', font: { size: 10 } }, grid: { color: '#303b53' } },
        x: { ticks: { color: '#9aa8c0', font: { size: 9 } }, grid: { display: false } }
      },
      plugins: { legend: { labels: { color: '#9aa8c0', font: { size: 10 } } } }
    }
  });
}