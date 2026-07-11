/* =====================================================================
 * YouTube Script Lab — render.js
 * Toda la lógica que toca el DOM: render de bloques, métricas, curva,
 * riesgos, checklist y fuentes (tab Research).
 *
 * Dependencias: window.Config, window.Model
 * Expone: window.Render
 * ===================================================================== */

window.Render = (function () {
  'use strict';

  const { TYPES, SOURCES, HEURISTICS, CALIBRATION_CONFIG, BENCHMARK_BUCKETS } = window.Config;
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const esc = s => (s || '').replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));

  /* ---- Helpers de score ---- */
  function gradeClass(v, good = 70, warn = 50) { return v >= good ? 'good' : v >= warn ? 'warn' : 'bad'; }

  /* ---- Render de bloques del editor ----
   * Depende del estado externo (window.App.state) y del último análisis.
   * ------------------------------------------------------- */
  function renderBlocks(state, lastAnalysis) {
    const root = $('#blocks');
    $('#blockCount').textContent = `${state.blocks.length} bloques`;
    if (!state.blocks.length) {
      root.innerHTML = '<div class="empty">Empezá con un bloque de voz o cargá el ejemplo. El panel derecho se actualiza en tiempo real.</div>';
      return;
    }
    const a = lastAnalysis || window.Model.analyze(state);
    root.innerHTML = state.blocks.map((block, i) => {
      const t = TYPES[block.type] || TYPES.voice, st = a.blockStats[i] || {};
      const showTiming = ['visual', 'screen', 'sfx'].includes(block.type);
      return `<article class="block" data-id="${block.id}" style="--type-color:${t.color}"><div class="block-head"><div class="block-color"></div><div class="block-main-head"><span class="block-index">#${i + 1}</span><select class="ghost-select js-type">${Object.entries(TYPES).map(([k, v]) => `<option value="${k}" ${k === block.type ? 'selected' : ''}>${v.label}</option>`).join('')}</select><span class="pill mono">${window.Model.formatTime(st.start || 0)}</span><span class="pill mono">${window.Model.formatTime(st.duration || 0)}</span><span class="pill">${st.words || 0} palabras</span></div><div class="block-tools"><button class="btn icon" data-act="up" title="Subir">↑</button><button class="btn icon" data-act="down" title="Bajar">↓</button><button class="btn icon" data-act="dup" title="Duplicar">⧉</button><button class="btn icon danger" data-act="del" title="Eliminar">✕</button></div></div><div class="block-body"><textarea class="js-text" placeholder="${esc(t.placeholder)}">${esc(block.text)}</textarea><div class="block-meta">${showTiming ? `<label class="check"><input type="checkbox" class="js-adds" ${block.addsTime ? 'checked' : ''}> suma tiempo</label><label class="check">seg. <input class="mini-input js-seconds" type="number" min="0" step="0.5" value="${Number(block.seconds) || ''}" placeholder="auto"></label>` : ''}${block.type === 'pause' ? `<label class="check">duración <input class="mini-input js-seconds" type="number" min="0" step="0.5" value="${Number(block.seconds) || 2.5}"> seg.</label>` : ''}<span class="dim small">Frase media: ${(st.avgSent || 0).toFixed(1)} palabras</span>${st.longSent ? `<span class="pill warn">${st.longSent} frase larga</span>` : ''}</div></div></article>`;
    }).join('');
    root.querySelectorAll('textarea').forEach(autoResize);
  }

  /* ---- Render central de métricas ---- */
  function renderMetrics(a, state, calibrationMeta) {
    renderScore(a, calibrationMeta);
    renderStats(a, state);
    renderCurve(a);
    renderTiming(a);
    renderRisks(a);
    renderChecklist(a);
  }

  function renderScore(a, calibrationMeta) {
    const g = $('#scoreGauge'), v = Math.round(a.preflight), label = window.Model.scoreBandLabel(v);
    g.style.setProperty('--p', v);
    g.style.background = `conic-gradient(${v >= 75 ? 'var(--good)' : v >= 55 ? 'var(--warn)' : 'var(--bad)'} ${v}%,rgba(255,255,255,.11) 0)`;
    $('#scoreValue').textContent = `${window.Model.scoreBandText(v)} · ${label}`;
    $('#scoreLabel').textContent = v >= 78 ? 'Listo para primer borrador' : v >= 60 ? 'Buen rumbo, ajustar riesgos' : v >= 40 ? 'Necesita reescritura puntual' : 'Falta estructura de retención';
    $('#scoreText').textContent = `Hook ${window.Model.scoreBandText(a.hook.score)}/100 · APV direccional ${window.Model.bandText(a.retention.apv)} · ${a.risks.length} riesgos detectados.`;
    $('#scorePills').innerHTML = [['Hook', a.hook.score], ['Ritmo', a.pacingScore], ['Claridad', a.clarity], ['Promesa aprox.', a.promiseScore]].map(([n, val]) => `<span class="pill ${gradeClass(val)}">${n}: ${window.Model.scoreBandText(val)}</span>`).join('');

    // Indicador de calibración del benchmark — siempre visible junto al preflight
    // para que quede claro cuándo el número tiene sustento real.
    const ind = $('#calibrationIndicator');
    if (ind) {
      let html = '';
      if (calibrationMeta && calibrationMeta.kind === 'manual') {
        html = `<span class="pill good">Calibrado con este video (n=1, realRetention manual)</span>`;
      } else if (calibrationMeta && calibrationMeta.kind === 'bucket' && calibrationMeta.sampleCount > 0) {
        html = `<span class="pill good">n=${calibrationMeta.sampleCount} videos, calibrado (${esc(calibrationMeta.format)}+${esc(calibrationMeta.genre)})</span>`;
      } else {
        html = `<span class="pill warn">Sin calibrar (benchmark genérico)</span>`;
      }
      ind.innerHTML = html;
    }
  }

  function renderStats(a, state) {
    const target = a.retention.benchmark, benchLabel = a.calibrated ? 'Benchmark calibrado con Studio' : 'Benchmark genérico — sin calibrar';
    const stats = [
      { l: 'Duración', v: window.Model.formatTime(a.totalSec), s: `Objetivo ${window.Model.formatTime(a.targetSec)} (${a.delta >= 0 ? '+' : ''}${window.Model.formatTime(Math.abs(a.delta))})`, c: Math.abs(a.delta) < a.targetSec * .12 ? 'good' : Math.abs(a.delta) < a.targetSec * .25 ? 'warn' : 'bad' },
      { l: 'Voz', v: a.voiceWords.toLocaleString('es-AR'), s: `${state.project.wpm} WPM · ${window.Model.formatTime(a.voiceSec)}`, c: 'good' },
      { l: 'Señal léxica de promesa (aprox.)', v: window.Model.bandText(a.promiseScore), s: 'No verifica semántica real', c: gradeClass(a.promiseScore, 45, 25) },
      { l: 'Retención 30s direccional', v: window.Model.bandText(a.retention.r30), s: 'Intro simulada', c: gradeClass(a.retention.r30, 70, 55) },
      { l: 'APV direccional', v: window.Model.bandText(a.retention.apv), s: `${benchLabel}: ${window.Model.bandText(target)}`, c: gradeClass(a.retention.apv, target + 5, target - 6) },
      { l: 'AVD direccional', v: window.Model.timeBandFromPct(a.totalSec, a.retention.apv), s: 'Average View Duration simulado', c: gradeClass(a.retention.apv, target + 5, target - 6) },
      { l: 'Watch time / 1k', v: window.Model.hoursBandFromPct(a.totalSec, a.retention.apv), s: 'Rango de horas por 1.000 views', c: 'good' },
      { l: 'Ritmo visual', v: a.interruptsPerMin.toFixed(1) + '/min', s: `bloque largo: ${window.Model.formatTime(a.longestVoice)}`, c: gradeClass(a.visualScore) },
      { l: 'Legibilidad FH', v: Math.round(a.fh), s: `${a.avgSent.toFixed(1)} palabras/frase`, c: gradeClass(a.clarity) },
      { l: 'Fuentes/claims', v: window.Model.scoreBandText(a.sourceScore), s: `${a.sourceCount} bloque(s) de fuente`, c: gradeClass(a.sourceScore, 70, 50) },
      { l: 'CTA / end screen', v: window.Model.scoreBandText(a.ctaScore), s: 'ubicación y presencia', c: gradeClass(a.ctaScore, 70, 50) }
    ];
    $('#quickStats').innerHTML = stats.map(x => `<div class="stat ${x.c}"><label>${x.l}</label><strong>${x.v}</strong><small>${x.s}</small></div>`).join('');
  }

  /* ---- Render de curva ---- */
  function renderCurve(a) {
    const canvas = $('#retentionCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d'), rect = canvas.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const W = rect.width, H = rect.height, pad = { l: 42, r: 12, t: 18, b: 30 }, gw = W - pad.l - pad.r, gh = H - pad.t - pad.b;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.03)'; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 1;
    ctx.fillStyle = 'rgba(220,232,255,.62)'; ctx.font = '11px ui-sans-serif,system-ui';
    [25, 50, 75, 100].forEach(yv => { const y = pad.t + gh - (yv / 100) * gh; ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(W - pad.r, y); ctx.stroke(); ctx.fillText(yv + '%', 6, y + 4); });
    [0, .25, .5, .75, 1].forEach(fr => { const x = pad.l + fr * gw; ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + gh); ctx.stroke(); ctx.fillText(window.Model.formatTime(a.totalSec * fr), x - 14, H - 10); });
    const by = pad.t + gh - (a.retention.benchmark / 100) * gh;
    ctx.strokeStyle = 'rgba(255,190,85,.45)'; ctx.setLineDash([5, 5]);
    ctx.beginPath(); ctx.moveTo(pad.l, by); ctx.lineTo(W - pad.r, by); ctx.stroke();
    ctx.setLineDash([]); ctx.fillStyle = 'rgba(255,190,85,.9)'; ctx.fillText('benchmark', W - 82, by - 5);
    if (a.totalSec > 30) {
      const x30 = pad.l + (30 / a.totalSec) * gw;
      ctx.strokeStyle = 'rgba(104,167,255,.55)';
      ctx.beginPath(); ctx.moveTo(x30, pad.t); ctx.lineTo(x30, pad.t + gh); ctx.stroke();
      ctx.fillStyle = '#9ec6ff'; ctx.fillText('30s', x30 + 4, pad.t + 12);
    }
    ctx.beginPath();
    a.retention.points.forEach((p, i) => { const x = pad.l + (p.time / a.totalSec) * gw, y = pad.t + gh - p.retention * gh; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
    ctx.strokeStyle = a.retention.apv >= a.retention.benchmark ? '#30d385' : a.retention.apv >= a.retention.benchmark - 7 ? '#ffbe55' : '#ff5d73';
    ctx.lineWidth = 3; ctx.stroke();
    a.risks.slice(0, 7).forEach(r => { const x = pad.l + (r.time / a.totalSec) * gw; ctx.fillStyle = r.severity === 'bad' ? '#ff5d73' : '#ffbe55'; ctx.beginPath(); ctx.arc(x, pad.t + 8, 4, 0, Math.PI * 2); ctx.fill(); });
    ctx.fillStyle = 'rgba(238,244,255,.95)'; ctx.font = '700 13px ui-sans-serif,system-ui';
    ctx.fillText(`APV direccional ${window.Model.bandText(a.retention.apv)} · AVD ${window.Model.timeBandFromPct(a.totalSec, a.retention.apv)}`, pad.l + 8, pad.t + 18);
  }

  /* ---- Render de timeline / tiempos ---- */
  function renderTiming(a) {
    const dur = a.totalSec;
    const segs = a.timeline.filter(x => x.duration > 0);
    let html = `<div class="timeline" title="Timeline por bloques con duración">${segs.map(x => `<div class="seg" data-jump="${x.id}" style="--type-color:${TYPES[x.type].color};width:${Math.max(.8, x.duration / dur * 100)}%" title="#${x.i + 1} ${TYPES[x.type].label} · ${window.Model.formatTime(x.start)}"></div>`).join('')}</div>`;
    html += `<div style="margin-top:12px" class="formula"><b>Desglose</b><br>Voz/CTA: ${window.Model.formatTime(a.voiceSec)} · Eventos visuales/SFX/pausa: ${a.parallelEvents} · Fuentes: ${a.sourceCount}<br>Los visuales paralelos no suman tiempo, pero sí aumentan densidad de ritmo.</div>`;
    $('#timeBreakdown').innerHTML = html;
    $$('[data-jump]').forEach(el => el.onclick = () => jumpBlock(el.dataset.jump));
  }

  /* ---- Render de riesgos ---- */
  function renderRisks(a) {
    const root = $('#riskList');
    if (!a.risks.length) {
      root.innerHTML = '<div class="risk" style="--risk:var(--good)"><h4>Sin riesgos críticos</h4><p>El guion no muestra problemas obvios. Revisá igual la promesa y los datos reales después de publicar.</p></div>';
      return;
    }
    root.innerHTML = a.risks.sort((x, y) => (x.severity === 'bad' ? -1 : 1) - (y.severity === 'bad' ? -1 : 1) || x.time - y.time).map(r => `<div class="risk" style="--risk:${r.severity === 'bad' ? 'var(--bad)' : 'var(--warn)'}"><h4>${window.Model.formatTime(r.time)} · ${esc(r.title)}</h4><p>${esc(r.detail)}</p><p class="action"><b>Acción:</b> ${esc(r.action)}</p></div>`).join('');
  }

  /* ---- Render de checklist ---- */
  function renderChecklist(a) {
    const promiseFalseNegative = a.promiseScore < 38 && a.hook.score > 70;
    const promiseItem = promiseFalseNegative
      ? { t: 'Señal léxica de promesa (aproximada)', status: 'info', d: 'Posible falso negativo: el hook puede cumplir la promesa con otras palabras — revisar manualmente antes de reescribir.' }
      : { t: 'Señal léxica de promesa (aproximada)', status: a.promiseScore >= 38 ? 'ok' : 'warn', d: `Rango señal: ${window.Model.bandText(a.promiseScore)}. No verifica semántica real.` };
    const items = [
      promiseItem,
      { t: 'Hook con pregunta/tensión', status: a.hook.score >= 65 ? 'ok' : 'warn', d: `Hook direccional: ${window.Model.scoreBandText(a.hook.score)}/100` },
      { t: 'Sin CTA/filler temprano', status: !a.risks.some(r => r.title.includes('Fricción')) ? 'ok' : 'warn', d: 'CTA después de valor' },
      { t: 'Ritmo visual suficiente', status: a.interruptsPerMin >= 1.4 || a.totalSec <= 180 ? 'ok' : 'warn', d: `${a.interruptsPerMin.toFixed(1)} interrupciones/min` },
      { t: 'Sin bloques de voz >95s', status: !a.risks.some(r => r.severity === 'bad' && r.title.includes('voz largo')) ? 'ok' : 'warn', d: 'Cortar cada 30–60s' },
      { t: 'Fuentes presentes', status: a.sourceCount > 0 ? 'ok' : 'warn', d: `${a.sourceCount} bloque(s) de fuente` },
      { t: 'CTA o end screen', status: a.ctaCount > 0 ? 'ok' : 'warn', d: 'Ubicación: después de valor' },
      { t: 'Duración cerca del objetivo', status: Math.abs(a.delta) < a.targetSec * .25 ? 'ok' : 'warn', d: `Delta ${a.delta >= 0 ? '+' : ''}${window.Model.formatTime(Math.abs(a.delta))}` }
    ];
    $('#checkList').innerHTML = items.map(item => {
      const color = item.status === 'ok' ? 'var(--good)' : item.status === 'info' ? 'var(--info)' : 'var(--warn)',
        label = item.status === 'ok' ? 'OK' : item.status === 'info' ? 'Manual' : 'Revisar',
        cls = item.status === 'ok' ? 'good' : item.status === 'info' ? '' : 'warn';
      return `<div class="checkitem"><span class="status-dot" style="--s:${color}"></span><div><b>${item.t}</b><br><span class="muted small">${item.d}</span></div><span class="pill ${cls}">${label}</span></div>`;
    }).join('');
  }

  /* ---- Render del tab Research ----
   * Dos secciones claramente separadas:
   *   1) "Validado con fuente" — constantes con cita empírica directa.
   *   2) "Heurística sin validar" — constantes sin respaldo directo,
   *      pendientes de calibración con datos propios del canal.
   * Más abajo: listado completo de fuentes consultadas (con link).
   * ------------------------------------------------------- */
  function renderSources() {
    const root = $('#sourceList');
    if (!root) return;

    /* Fórmulas clave con su estado de validación */
    const formulasHtml = `
      <div class="formula">
        <b>Fórmulas clave</b><br>
        <code><b>Fernández-Huerta</b> (VALIDADO, Fernández-Huerta 1959):
          206.84 − 60·(sílabas/palabra) − 1.02·(palabras/frase)</code><br>
        <code><b>Métricas YouTube Analytics</b> (VALIDADO, Google Developers):
          averageViewDuration, averageViewPercentage, estimatedMinutesWatched,
          audienceWatchRatio, relativeRetentionPerformance</code><br>
        <code><b>Forma de la curva</b> (VALIDADO cualitativo, Altman &amp; Jiménez 2019;
          YouTube Help 9314415): nose-body-tail — caída inicial fuerte,
          caída gradual, inflexión final.</code><br>
        <code><b>Interpolación algebraica</b> (SIN VALIDAR): r30 = 0.48 + hook·0.0032 +
          promise·0.0012 + visual·0.0009; post-30s lineal a endR con easeOut
          exponente 1.8.</code><br>
        <code><b>Preflight</b> (SIN VALIDAR — pesos normalizados a mano):
          hook·0.23 + retención·0.24 + pacing·0.15 + clarity·0.12 +
          visual·0.11 + promise·0.08 + cta·0.04 + source·0.03</code>
      </div>`;

    /* Sección 1: Validado con fuente */
    const validated = HEURISTICS.filter(h => h.group === 'validated');
    const validatedHtml = `
      <div class="research-section">
        <h4 style="margin:14px 0 6px;color:var(--good);font-size:.92rem">✓ Validado con fuente</h4>
        <p class="muted small" style="margin:0 0 8px">Constantes o relaciones con respaldo empírico directo (peer-reviewed u oficial).</p>
        ${validated.map(h => {
          const src = (h.sourceIdx !== null && SOURCES[h.sourceIdx]) ? SOURCES[h.sourceIdx] : null;
          return `<div class="source-card" style="border-left:4px solid var(--good)">
            <b>${esc(h.name)}</b>
            <div class="mono small" style="margin:3px 0;color:var(--info)">${esc(h.value)}</div>
            <div class="muted small">${esc(h.where)}</div>
            ${src ? `<div class="small" style="margin-top:4px"><a href="${esc(src.u)}" target="_blank" rel="noopener">${esc(src.a)} (${src.y})</a></div>` : ''}
            <div class="small" style="margin-top:4px;color:var(--muted)">${esc(h.note)}</div>
          </div>`;
        }).join('')}
      </div>`;

    /* Sección 2: Heurística sin validar */
    const heuristic = HEURISTICS.filter(h => h.group === 'heuristic');
    const heuristicHtml = `
      <div class="research-section">
        <h4 style="margin:18px 0 6px;color:var(--warn);font-size:.92rem">⚠ Heurística sin validar</h4>
        <p class="muted small" style="margin:0 0 8px">Constantes ajustadas a mano. Calibrar con datos propios del canal (YouTube Studio → comparar APV/AVD reales vs. simulados en videos publicados).</p>
        ${heuristic.map(h => {
          const src = (h.sourceIdx !== null && SOURCES[h.sourceIdx]) ? SOURCES[h.sourceIdx] : null;
          return `<div class="source-card" style="border-left:4px solid var(--warn)">
            <b>${esc(h.name)}</b>
            <div class="mono small" style="margin:3px 0;color:var(--info)">${esc(h.value)}</div>
            <div class="muted small">${esc(h.where)}</div>
            ${src ? `<div class="small" style="margin-top:4px">Apoyo direccional: <a href="${esc(src.u)}" target="_blank" rel="noopener">${esc(src.a)} (${src.y})</a></div>` : ''}
            <div class="small" style="margin-top:4px;color:var(--muted)">${esc(h.note)}</div>
          </div>`;
        }).join('')}
      </div>`;

    /* Listado completo de fuentes consultadas */
    const sourcesListHtml = `
      <div class="research-section">
        <h4 style="margin:18px 0 6px;color:#c4d3ea;font-size:.92rem">Fuentes consultadas</h4>
        <p class="muted small" style="margin:0 0 8px">Validadas (respaldo directo) y contextuales (informan el diseño sin validar constantes específicas).</p>
        ${SOURCES.map(s => `<div class="source-card">
          <b>${esc(s.t)}</b>
          <span class="muted small">${esc(s.a)} · ${esc(s.y)} · <span class="pill ${s.kind === 'validated' ? 'good' : ''}" style="font-size:.7rem;padding:1px 6px">${s.kind === 'validated' ? 'validada' : 'contextual'}</span></span><br>
          <span class="muted small">${esc(s.d)}</span><br>
          <a href="${esc(s.u)}" target="_blank" rel="noopener" class="small">${esc(s.u)}</a>
        </div>`).join('')}
      </div>`;

    root.innerHTML = formulasHtml + validatedHtml + heuristicHtml + sourcesListHtml;
  }

  /* ---- Utilidades de UI ---- */
  function jumpBlock(id) {
    const el = document.querySelector(`.block[data-id="${id}"]`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('active');
      setTimeout(() => el.classList.remove('active'), 1200);
    }
  }

  function autoResize(ta) {
    ta.style.height = 'auto';
    ta.style.height = Math.max(82, ta.scrollHeight) + 'px';
  }

  /* =====================================================================
   * TAB "DATOS REALES" — métricas post-publicación + recalibración
   * ===================================================================== */

  /* ---- renderRealData: formulario + lista de registros + comparación
   *     + tabla de buckets con estado de calibración + historial.
   *
   * ctx = { realScores, activeBenchmarks, recabHistory, currentProject }
   * ------------------------------------------------------- */
  function renderRealData(ctx) {
    const root = $('#realDataRoot');
    if (!root) return;

    const { realScores = [], activeBenchmarks = {}, recabHistory = [], currentProject = null } = ctx;
    const MIN = CALIBRATION_CONFIG.MIN_SAMPLES;
    const MAXD = CALIBRATION_CONFIG.MAX_DELTA_PCT;

    /* --- Sección 1: formulario para agregar un registro real --- */
    const formatOpts = ['long', 'short', 'live'].map(f => `<option value="${f}" ${currentProject && currentProject.format === f ? 'selected' : ''}>${f}</option>`).join('');
    const genreOpts  = ['documental', 'tutorial', 'ensayo', 'review', 'entretenimiento'].map(g => `<option value="${g}" ${currentProject && currentProject.genre === g ? 'selected' : ''}>${g}</option>`).join('');
    const today = new Date().toISOString().slice(0, 10);

    const formHtml = `
      <div class="panel" style="background:rgba(20,30,50,.6);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px">
        <h4 style="margin:0 0 8px;font-size:.92rem">Agregar métrica real</h4>
        <p class="muted small" style="margin:0 0 10px">Cargá los datos que ves en YouTube Studio después de publicar un video. Esto se guarda aparte de los guiones (key <code>${CALIBRATION_CONFIG.STORAGE_KEYS.REAL_SCORES}</code>) y nunca se mezcla con el estado del editor.</p>
        <form id="realScoreForm" style="display:grid;gap:8px;grid-template-columns:repeat(2,1fr)">
          <label class="field"><span class="dim small">Título del video *</span><input class="input" name="video_title" required placeholder="Ej: La mentira que cambió..." /></label>
          <label class="field"><span class="dim small">Fecha de publicación</span><input class="input" type="date" name="published_at" value="${today}" /></label>
          <label class="field"><span class="dim small">Formato</span><select class="select" name="format">${formatOpts}</select></label>
          <label class="field"><span class="dim small">Género</span><select class="select" name="genre">${genreOpts}</select></label>
          <label class="field"><span class="dim small">Duración real (segundos) *</span><input class="input" type="number" min="1" step="1" name="duration_sec" required placeholder="720" /></label>
          <label class="field"><span class="dim small">APV real (%) *</span><input class="input" type="number" min="1" max="100" step="0.1" name="real_apv_pct" required placeholder="42.5" /></label>
          <label class="field"><span class="dim small">Retención a 30s (%) — opcional</span><input class="input" type="number" min="1" max="100" step="0.1" name="real_r30_pct" placeholder="68" /></label>
          <label class="field"><span class="dim small">CTR (%) — opcional</span><input class="input" type="number" min="0" max="100" step="0.1" name="real_ctr_pct" placeholder="5.2" /></label>
          <label class="field"><span class="dim small">APV predicho por el preflight (%) — opcional</span><input class="input" type="number" min="0" max="100" step="0.1" name="predicted_apv_pct" placeholder="45" /></label>
          <label class="field"><span class="dim small">Referencia al guion (texto libre) — opcional</span><input class="input" name="linked_script_id" placeholder="ej: guion-2026-03-12" /></label>
          <div style="grid-column:1/3;display:flex;gap:8px;margin-top:4px">
            <button type="submit" class="btn primary">Agregar registro</button>
            <button type="button" class="btn ghost" id="realScoreCancel">Limpiar</button>
          </div>
        </form>
      </div>`;

    /* --- Sección 2: tabla de buckets (format, genre) con estado y botón recalibrar --- */
    const bucketRows = BENCHMARK_BUCKETS.map(({ format, genre }) => {
      const samples = realScores.filter(r => r.format === format && r.genre === genre && Number.isFinite(r.real_apv_pct) && r.real_apv_pct > 0);
      const n = samples.length;
      const calibratedValue = activeBenchmarks[format] && activeBenchmarks[format][genre] != null ? activeBenchmarks[format][genre] : null;
      const heuristicValue = window.Model.benchmarkAPV(720, format, genre, null, null); // 12min referencia
      const currentValue = calibratedValue != null ? calibratedValue : heuristicValue;
      const avgPct = n > 0 ? samples.reduce((s, r) => s + r.real_apv_pct, 0) / n : null;
      const canRecalibrate = n >= MIN;
      const statusPill = calibratedValue != null
        ? `<span class="pill good">calibrado · ${(calibratedValue * 100).toFixed(1)}%</span>`
        : `<span class="pill warn">heuristic · ${(heuristicValue * 100).toFixed(1)}%</span>`;
      return `<tr>
        <td><span class="mono small">${format}+${genre}</span></td>
        <td><span class="pill ${n >= MIN ? 'good' : 'warn'}">${n}/${MIN}</span></td>
        <td>${avgPct != null ? avgPct.toFixed(1) + '%' : '—'}</td>
        <td>${(currentValue * 100).toFixed(1)}%</td>
        <td>${statusPill}</td>
        <td><button class="btn ${canRecalibrate ? 'primary' : ''}" data-recab="${format}|${genre}" ${canRecalibrate ? '' : 'disabled title="Faltan registros: necesitás ' + MIN + ' para recalibrar."'}>Recalibrar</button></td>
      </tr>`;
    }).join('');

    const bucketsHtml = `
      <div class="panel" style="background:rgba(20,30,50,.6);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px">
        <h4 style="margin:0 0 6px;font-size:.92rem">Buckets por formato + género</h4>
        <p class="muted small" style="margin:0 0 10px">Recalibrar queda deshabilitado hasta tener <b>${MIN}+ registros</b> en el bucket. El cambio por recalibración está acotado a <b>±${MAXD} puntos porcentuales</b> respecto al valor actual. Los pesos del preflight (hook·0.23, etc.) <b>nunca</b> se ajustan automáticamente — solo el benchmark base.</p>
        <table class="table" style="font-size:.85rem">
          <thead><tr><th>Bucket</th><th>Muestras</th><th>Promedio real</th><th>Valor actual</th><th>Estado</th><th>Acción</th></tr></thead>
          <tbody>${bucketRows}</tbody>
        </table>
      </div>`;

    /* --- Sección 3: comparación predicho vs real por video --- */
    const compareRows = realScores.length === 0
      ? `<tr><td colspan="7" class="muted small" style="padding:14px;text-align:center">Sin registros todavía. Agregá el primero arriba.</td></tr>`
      : realScores.slice().sort((a, b) => (b.logged_at || '').localeCompare(a.logged_at || '')).map(r => {
          const pred = Number.isFinite(r.predicted_apv_pct) ? r.predicted_apv_pct : null;
          const real = Number.isFinite(r.real_apv_pct) ? r.real_apv_pct : null;
          const delta = (pred != null && real != null) ? (pred - real) : null;
          return `<tr>
            <td><b>${esc(r.video_title || '—')}</b><br><span class="dim small">${esc(r.linked_script_id || '')}</span></td>
            <td><span class="mono small">${esc(r.format)}+${esc(r.genre)}</span></td>
            <td class="mono small">${r.duration_sec || '—'}s</td>
            <td class="mono">${pred != null ? pred.toFixed(1) + '%' : '—'}</td>
            <td class="mono">${real != null ? real.toFixed(1) + '%' : '—'}</td>
            <td class="mono">${delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(1) + 'pp' : '—'}</td>
            <td><button class="btn icon danger" data-del-real="${esc(r.id)}" title="Eliminar">✕</button></td>
          </tr>`;
        }).join('');

    const compareHtml = `
      <div class="panel" style="background:rgba(20,30,50,.6);border:1px solid var(--line);border-radius:14px;padding:14px;margin-bottom:14px">
        <h4 style="margin:0 0 6px;font-size:.92rem">Comparación predicho vs real</h4>
        <p class="muted small" style="margin:0 0 10px">Sin colorear bien/mal — solo el número. El delta absoluto te dice cuánto se desviò el preflight del real.</p>
        <table class="table" style="font-size:.85rem">
          <thead><tr><th>Video</th><th>Bucket</th><th>Duración</th><th>Predicho</th><th>Real</th><th>Delta (pred−real)</th><th></th></tr></thead>
          <tbody>${compareRows}</tbody>
        </table>
      </div>`;

    /* --- Sección 4: historial de recalibraciones (append-only) --- */
    const historyRows = recabHistory.length === 0
      ? `<tr><td colspan="6" class="muted small" style="padding:14px;text-align:center">Sin recalibraciones todavía.</td></tr>`
      : recabHistory.slice().sort((a, b) => (b.logged_at || '').localeCompare(a.logged_at || '')).map(h => `
          <tr>
            <td><span class="mono small">${esc(h.format)}+${esc(h.genre)}</span></td>
            <td class="mono small">${esc(h.logged_at)}</td>
            <td class="mono">${(h.old_value * 100).toFixed(1)}%</td>
            <td class="mono">${(h.new_value * 100).toFixed(1)}%</td>
            <td><span class="pill ${h.was_capped ? 'warn' : 'good'}">n=${h.sample_count}${h.was_capped ? ' · cap' : ''}</span></td>
            <td><span class="dim small">${esc(h.note || '')}</span></td>
          </tr>`).join('');

    const historyHtml = `
      <div class="panel" style="background:rgba(20,30,50,.6);border:1px solid var(--line);border-radius:14px;padding:14px">
        <h4 style="margin:0 0 6px;font-size:.92rem">Historial de recalibraciones</h4>
        <p class="muted small" style="margin:0 0 10px">Append-only: cada recalibración se acá, nunca se sobreescribe. Si ves "cap" en una fila, el promedio real excedió el tope ±${MAXD}pp y se aplicó solo el máximo — ejecutá otra recalibración más adelante para mover el resto.</p>
        <table class="table" style="font-size:.85rem">
          <thead><tr><th>Bucket</th><th>Fecha</th><th>Valor viejo</th><th>Valor nuevo</th><th>Muestras</th><th>Nota</th></tr></thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>`;

    root.innerHTML = formHtml + bucketsHtml + compareHtml + historyHtml;
  }

  return {
    renderBlocks, renderMetrics, renderScore, renderStats,
    renderCurve, renderTiming, renderRisks, renderChecklist,
    renderSources, jumpBlock, autoResize, gradeClass,
    renderRealData
  };
})();
