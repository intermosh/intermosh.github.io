/* export-import.js — Import/export de proyectos.
   Implementa §13.7 y §12 del contrato.
   Depende de: state.js (normalizeProject), db.js (put/get/all). */

import { normalizeProject, ENGINE_VERSION, APP_VERSION } from './state.js';
import { wordCount, durationInSeconds } from './ai-shared.js';
import { analyzeCTA, analyzeCognitiveLoad } from './retention-engine.js';
import { put, all } from './db.js';

/* ============================================================
   Helpers de descarga
   ============================================================ */
function download(data, name, type) {
  const u = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 800);
}

function fileSlug(text) {
  return (text || 'scriptlab').toLowerCase().replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

/* ============================================================
   Export JSON — completo, re-importable (§12.1)
   ============================================================ */
export function exportJSON(project, analysis, calibration) {
  download(
    JSON.stringify({
      app: 'ScriptLab AI',
      version: 5, // COMBINED: ambos builds decían 4 con motores distintos (bug B13)
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      exportedAt: new Date().toISOString(),
      project, analysis, calibration
    }, null, 2),
    fileSlug(project.title) + '.scriptlab.json',
    'application/json'
  );
}

/* ============================================================
   Export Markdown — guion legible (§12.1)
   ============================================================ */
export function exportMarkdown(project, analysis) {
  let md = '# ' + project.title + '\n\n**Promesa:** ' + (project.promise || '—') + '\n\n**Salud del guion:** ' + (analysis?.score || 0) + '/100\n';
  project.blocks.forEach((b, i) => {
    md += '\n## ' + (i + 1) + '. ' + b.type + ': ' + b.label + '\n\n' +
      (b.content || '_Sin contenido_') + '\n' +
      (b.notes ? '\n> Nota: ' + b.notes + '\n' : '');
  });
  download(md, fileSlug(project.title) + '.md', 'text/markdown');
}

/* ============================================================
   Export TXT — texto plano (§12.1)
   ============================================================ */
export function exportTXT(project) {
  let txt = project.title + '\n' + '='.repeat(project.title.length) + '\n\n';
  if (project.promise) txt += 'Promesa: ' + project.promise + '\n\n';
  project.blocks.forEach((b, i) => {
    txt += (i + 1) + '. [' + b.type + '] ' + b.label + '\n';
    if (b.content) txt += b.content + '\n';
    if (b.notes) txt += '  Nota: ' + b.notes + '\n';
    txt += '\n';
  });
  download(txt, fileSlug(project.title) + '.txt', 'text/plain');
}

/* ============================================================
   Export CSV — guion + datos por bloque (fix #6)
   Una fila por bloque con métricas ya calculadas inyectadas (duración,
   retención estimada, valencia si hay IA). BOM UTF-8 para Excel.
   ============================================================ */
export function exportCSV(project, retentionResult, sentimentResult) {
  const NL = String.fromCharCode(10);
  const wpm = project.wpm || 150;
  const curveByIdx = {};
  (retentionResult?.curve || []).forEach(p => { curveByIdx[p.blockIndex] = p.retentionPct; });
  const valByIdx = {};
  (sentimentResult?.sentimentArc || []).forEach(p => { valByIdx[p.blockIndex] = p; });
  const escField = (v) => {
    const s2 = String(v ?? '').replace(/\s+/g, ' ').trim();
    return /[",;]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
  };
  const rows = [['bloque','tipo','etiqueta','palabras','segundos_estimados','wpm','valencia','tono','retencion_estimada_pct','contenido'].join(',')];
  project.blocks.forEach((b, i) => {
    const arc = valByIdx[i];
    const val = arc && !arc.failed && typeof arc.valence === 'number' ? arc.valence : '';
    const tone = arc ? (arc.failed ? 'N/D' : (arc.label || '')) : '';
    rows.push([
      i + 1, b.type, escField(b.label), wordCount(b.content || ''),
      Math.round(durationInSeconds(b.content || '', wpm)), wpm,
      val, tone, curveByIdx[i] ?? '', escField(b.content || '')
    ].join(','));
  });
  download(String.fromCharCode(0xFEFF) + rows.join(NL), fileSlug(project.title) + '.csv', 'text/csv;charset=utf-8');
}

/* ============================================================
   Export PDF — vía print del navegador (§12.1)
   Abre una ventana con el guion estilado y dispara print().
   ============================================================ */
/* ============================================================
   _buildDashboardHTML — genera el HTML completo del dashboard
   Usado por exportHTML y exportPDF. Incluye gráficas, métricas
   heurísticas + IA (si disponible).
   ============================================================ */
function _buildDashboardHTML(project, analysis, retentionResult, sentimentResult, aiResult) {
  const clean = v => String(v || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const T = { HOOK:['Hook','#ff7d5c'], CONTEXTO:['Contexto','#69a8ff'], EVIDENCIA:['Evidencia','#ae83ff'], SEGMENTO:['Segmento','#b3bdce'], GIRO:['Giro','#f4b857'], VISUAL:['Visual','#32d2ac'], CTA:['CTA','#5cdb87'] };
  const r = retentionResult || {};
  const s = sentimentResult || {};
  const ai = aiResult || {};
  const health = analysis?.score ?? 0;
  const apv = r.overallRetention ?? '—';

  // --- Metric cards ---
  const cards = [
    ['Salud', health, '/100', '#7969ff'],
    ['Retención', apv, '% APV', '#32d2ac'],
    ['Engagement', s.engagementScore != null ? Math.round(s.engagementScore * 100) : '—', '%', '#5cdb87'],
    ['Carga', r.scores?.contentDensity?.score ?? '—', '/100', '#f4b857']
  ];
  const cardsHTML = cards.map(([label, val, unit, color]) =>
    '<div style="background:#f8f9fa;border:1px solid #e5e7eb;border-radius:10px;padding:14px;text-align:center;flex:1;min-width:100px">' +
    '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:#888;font-weight:600">' + label + '</div>' +
    '<div style="font-size:28px;font-weight:800;color:' + color + ';margin:4px 0">' + val + '</div>' +
    '<div style="font-size:11px;color:#aaa">' + unit + '</div></div>'
  ).join('');

  // --- Retention curve SVG ---
  let curveHTML = '';
  if (r.curve?.length > 1) {
    const W = 560, H = 100;
    const pts = r.curve.map((p, i) => {
      const x = (i / (r.curve.length - 1)) * W;
      const y = H - (p.retention * H);
      return x + ',' + y;
    });
    const path = 'M' + pts.join(' L');
    const dots = r.curve.map((p, i) => {
      const x = (i / (r.curve.length - 1)) * W;
      const y = H - (p.retention * H);
      const color = p.retention > 0.6 ? '#5cdb87' : p.retention > 0.35 ? '#f4b857' : '#ff6879';
      return '<circle cx="' + x + '" cy="' + y + '" r="4" fill="' + color + '"/>';
    }).join('');
    curveHTML = '<div style="background:#f8f9fa;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:16px 0">' +
      '<div style="font-size:11px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:10px">Retención estimada por bloque</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:80px">' +
      '<line x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '" stroke="#e5e7eb" stroke-width="1"/>' +
      '<path d="' + path + '" fill="none" stroke="#ff6879" stroke-width="2" stroke-linecap="round"/>' + dots +
      '</svg></div>';
  }

  // --- Block list ---
  const blocksHTML = project.blocks.map((b, i) => {
    const [name, color] = T[b.type] || ['Otro', '#b3bdce'];
    return '<div style="border-left:4px solid ' + color + ';padding:8px 14px;margin:8px 0;background:#f8f9fa;border-radius:0 8px 8px 0;page-break-inside:avoid">' +
      '<div style="font-size:11px;color:#888">' + (i + 1) + '. ' + name + '</div>' +
      '<div style="font-size:14px;font-weight:600;margin:2px 0">' + clean(b.label) + '</div>' +
      '<div style="font-size:13px;line-height:1.6;white-space:pre-wrap;color:#333">' + clean(b.content) + '</div>' +
      (b.notes ? '<div style="font-size:11px;color:#888;margin-top:4px;font-style:italic">Nota: ' + clean(b.notes) + '</div>' : '') +
      '</div>';
  }).join('');

  // --- Sentiment arc SVG ---
  let sentimentHTML = '';
  if (s.sentimentArc?.length > 1) {
    const arc = s.sentimentArc;
    const SW = 560, SH = 60, midY = SH / 2;
    const pts = arc.map((p, i) => {
      const x = (i / (arc.length - 1)) * (SW - 16) + 8;
      const y = midY - p.valence * (midY - 6);
      return { x, y, color: p.label === 'POS' ? '#5cdb87' : p.label === 'NEG' ? '#ff6879' : '#f4b857' };
    });
    const linePath = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p.x + ',' + p.y).join(' ');
    const dots = pts.map(p => '<circle cx="' + p.x + '" cy="' + p.y + '" r="3" fill="' + p.color + '"/>').join('');
    const jumps = s.tonalJumps?.length ?? 0;
    sentimentHTML = '<div style="background:#f8f9fa;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin:16px 0">' +
      '<div style="font-size:11px;text-transform:uppercase;color:#888;font-weight:600;margin-bottom:10px">Arco emocional · ' + jumps + ' saltos tonales</div>' +
      '<svg viewBox="0 0 ' + SW + ' ' + SH + '" style="width:100%;height:50px">' +
      '<line x1="0" y1="' + midY + '" x2="' + SW + '" y2="' + midY + '" stroke="#e5e7eb" stroke-width="1" stroke-dasharray="3 3"/>' +
      '<path d="' + linePath + '" fill="none" stroke="#aaa" stroke-width="1.5" opacity=".5"/>' + dots +
      '</svg></div>';
  }

  // --- IA metrics (if available) ---
  let iaHTML = '';
  if (ai.alignment != null) {
    const alPct = Math.round(ai.alignment * 100);
    iaHTML = '<div style="margin:16px 0;padding:14px;background:#f0f0ff;border-radius:10px;border:1px solid #e0e0f0">' +
      '<div style="font-size:11px;text-transform:uppercase;color:#7969ff;font-weight:600;margin-bottom:8px">Análisis IA</div>' +
      '<div style="display:flex;gap:20px;font-size:13px">' +
      '<div>Alineación hook↔promesa: <strong>' + alPct + '%</strong></div>' +
      '<div>Repetición: <strong>' + Math.round((ai.redundancy || 0) * 100) + '%</strong></div>' +
      '</div></div>';
  }

  // --- Risks & recommendations ---
  let issuesHTML = '';
  if (r.risks?.length || r.recommendations?.length) {
    const items = [];
    (r.risks || []).forEach(x => items.push('<div style="padding:3px 0;color:#c00">' + clean(x) + '</div>'));
    (r.recommendations || []).forEach(x => items.push('<div style="padding:3px 0;color:#856404">→ ' + clean(x) + '</div>'));
    issuesHTML = '<div style="margin:16px 0;padding:14px;background:#fff8f0;border:1px solid #f0e0c0;border-radius:10px">' +
      '<div style="font-size:11px;text-transform:uppercase;color:#856404;font-weight:600;margin-bottom:6px">Riesgos y recomendaciones</div>' +
      items.join('') + '</div>';
  }

  return {
    cardsHTML, curveHTML, blocksHTML, sentimentHTML, iaHTML, issuesHTML,
    title: clean(project.title), promise: clean(project.promise), health
  };
}

/* ============================================================
   Export HTML — standalone estilado con gráficas (§12.1)
   ============================================================ */
/* ============================================================
   Export HTML — ONEPAGE autocontenida estilo app (fix #7)
   Reescrito por completo: antes era un documento claro genérico. Ahora
   replica el look&feel oscuro de ScriptLab con sus mismas gráficas
   (anillos SVG, curva de retención con puntos clickeables, barras de
   factores, arco ECG, bloques coloreados), CSS y JS inline. Doble
   click → funciona sin red ni dependencias.
   (_buildDashboardHTML queda SOLO para exportPDF: papel claro.)
   ============================================================ */
const _XTYPE = {
  HOOK: ['Hook', '#ff7d5c'], CONTEXTO: ['Contexto', '#69a8ff'], EVIDENCIA: ['Evidencia', '#ae83ff'],
  SEGMENTO: ['Segmento', '#b3bdce'], GIRO: ['Giro', '#f4b857'], VISUAL: ['Visual', '#32d2ac'], CTA: ['CTA', '#5cdb87']
};
const _xEsc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const _XCSS = `
:root{--bg:#0d1117;--panel:#161b27;--panel2:#1c2333;--border:#26304a;--track:#1f2a40;--text:#e6ebf5;--muted:#8b97ad;--faint:#5c6781;--purple:#7969ff;--teal:#32d2ac;--good:#5cdb87;--warn:#f4b857;--bad:#ff6879;--r:12px}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--text);font:14px/1.5 -apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.wrap{max-width:820px;margin:0 auto;padding:26px 18px 60px}
.xh{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.brand{font-weight:600;font-size:15px}.brand i{color:var(--purple);font-style:normal}
.xh .eng{font-size:10px;color:var(--faint);border:1px solid var(--border);border-radius:99px;padding:2px 9px}
h1{font-size:24px;letter-spacing:-.02em;margin-top:6px}
.promise{color:var(--muted);margin:2px 0 4px}
.chipsline{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px}
.chip{font-size:11px;color:var(--muted);background:var(--panel2);border:1px solid var(--border);border-radius:99px;padding:3px 10px}
.sec{margin-top:20px;background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:14px 16px}
.sec-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:10px}
.sec-t{font-size:13px;font-weight:600}
.sec-hint{font-size:10px;color:var(--faint)}
.hero{display:flex;gap:12px;flex-wrap:wrap}
.ring-card{flex:1;min-width:180px;background:var(--panel);border:1px solid var(--border);border-radius:var(--r);padding:16px;display:flex;flex-direction:column;align-items:center;gap:2px}
.ring{position:relative;width:104px;height:104px}.ring svg{position:absolute;inset:0}
.ring-num{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-variant-numeric:tabular-nums}
.ring-num b{font-size:26px}.ring-num small{color:var(--faint);font-size:11px}
.ring-name{margin-top:8px;font-size:12px;font-weight:600}.ring-sub{font-size:10px;color:var(--faint)}
.rf-row{margin-bottom:10px}
.rf-head{display:flex;justify-content:space-between;font-size:12px}
.rf-val{font-variant-numeric:tabular-nums}.rf-val.good{color:var(--good)}.rf-val.warn{color:var(--warn)}.rf-val.bad{color:var(--bad)}
.rf-glosa{font-size:10px;color:var(--faint);margin:1px 0 3px}
.rf-bar{height:4px;background:var(--track);border-radius:99px}.rf-bar i{display:block;height:100%;border-radius:99px}
.legendx{display:flex;gap:14px;font-size:10px;color:var(--muted);margin:8px 0 4px}
.lg-dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px}
.xrisk{padding:6px 10px;border-left:3px solid var(--warn);background:var(--panel2);border-radius:0 6px 6px 0;margin:6px 0;font-size:12px;color:var(--muted)}
.xrisk[data-block]{cursor:pointer}.xrisk[data-block]:hover{background:var(--track);color:var(--text)}
.xrisk.ok{border-left-color:var(--good)}
.xrec{font-size:12px;color:var(--warn);padding:4px 0}
.xins{font-size:12px;color:var(--good);padding:4px 0}
.xformula{font:11px ui-monospace,Menlo,Consolas,monospace;color:var(--faint);margin-top:8px;word-break:break-all}
.xblock{border-left:4px solid #999;background:var(--panel);border-radius:0 10px 10px 0;padding:10px 14px;margin:10px 0}
.xmeta{font-size:10px;color:var(--faint);margin-bottom:2px}
.xlabel{font-size:14px;font-weight:600;margin-bottom:4px}
.xcontent{font-size:13px;line-height:1.65;white-space:pre-wrap;color:var(--text)}
.xnotes{font-size:11px;color:var(--muted);font-style:italic;margin-top:6px}
.xblock.flash{animation:xflash 1.3s ease}
@keyframes xflash{0%{box-shadow:0 0 0 3px var(--purple);background:rgba(121,105,255,.08)}70%{box-shadow:0 0 0 3px rgba(121,105,255,.35)}100%{box-shadow:0 0 0 0 transparent}}
.cl-metrics{display:flex;gap:18px;flex-wrap:wrap}
.cl-metric small{display:block;font-size:10px;color:var(--faint)}.cl-metric b{font-size:18px;font-variant-numeric:tabular-nums}
.xerr{font-size:11px;color:var(--warn);margin:6px 0}
footer{margin-top:26px;font-size:11px;color:var(--faint);text-align:center;line-height:1.8}
footer a{color:var(--purple);text-decoration:none}
@media (max-width:560px){.ring-card{flex:1 1 100%}}
@media print{body{background:#fff;color:#111}.sec,.ring-card,.xblock,.xrisk{background:#fff;color:#111;border-color:#ddd}}
`;

const _XJS = `
document.querySelectorAll('[data-block]').forEach(function(el){
  el.addEventListener('click',function(){
    var t=document.getElementById(el.getAttribute('data-block'));
    if(t){t.scrollIntoView({behavior:'smooth',block:'center'});
      t.classList.remove('flash');void t.offsetWidth;t.classList.add('flash');
      setTimeout(function(){t.classList.remove('flash')},1400);}
  });
});
`;

export function exportHTML(project, analysis, retentionResult, sentimentResult, aiResult) {
  const r = retentionResult || {};
  const s = sentimentResult || {};
  const ai = aiResult || {};
  const wpm = project.wpm || 150;
  const health = analysis?.score ?? 0;
  const apv = typeof r.overallRetention === 'number' ? r.overallRetention : null;
  const title = _xEsc(project.title || 'Sin título');
  const now = new Date().toLocaleString('es-AR');

  /* --- anillo SVG (misma geometría de la app: C = 276.5) --- */
  const ring = (val, color, unit) =>
    '<div class="ring-card"><div class="ring"><svg width="104" height="104" viewBox="0 0 104 104">' +
    '<circle cx="52" cy="52" r="44" fill="none" stroke="var(--track)" stroke-width="9"/>' +
    '<circle cx="52" cy="52" r="44" fill="none" stroke="' + color + '" stroke-width="9" stroke-linecap="round" ' +
    'stroke-dasharray="276.5" stroke-dashoffset="276.5" transform="rotate(-90 52 52)"/></svg>' +
    '<div class="ring-num"><b>' + (val ?? '—') + '</b><small>' + unit + '</small></div></div>';
  // dashoffset inline (los anillos llevan el valor ya resuelto, no animado)
  const ringFilled = (val, color, unit) =>
    val == null ? ring(val, color, unit).replace('="276.5" transform', '="276.5" transform') :
    ring(val, color, unit).replace('stroke-dashoffset="276.5"', 'stroke-dashoffset="' + (276.5 * (1 - Math.max(0, Math.min(100, val)) / 100)).toFixed(1) + '"');

  const ringsHTML =
    ringFilled(health, 'var(--purple)', '/100') + '<div class="ring-name">Salud del guion</div><div class="ring-sub">heurístico + calculado</div></div>' +
    ringFilled(apv, 'var(--teal)', '%') + '<div class="ring-name">Retención estimada</div><div class="ring-sub">proyección calculada</div></div>';

  /* --- curva de retención (misma geometría que render.js, puntos clickeables) --- */
  let curveHTML = '';
  if (r.curve && r.curve.length > 1) {
    const W = 380, H = 80, pad = 8, n = r.curve.length;
    const xStep = (W - pad * 2) / Math.max(1, n - 1);
    const pts = r.curve.map((p, i) => ({
      x: pad + (n === 1 ? (W - pad * 2) / 2 : i * xStep),
      y: H - pad - (p.retentionPct / 100) * (H - pad * 2), p
    }));
    const path = pts.map((pt, i) => (i === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1)).join(' ');
    const areaPath = path + ' L' + pts[pts.length - 1].x.toFixed(1) + ',' + (H - pad) + ' L' + pts[0].x.toFixed(1) + ',' + (H - pad) + ' Z';
    const dots = pts.map(pt =>
      '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="4" fill="' +
      (pt.p.isDropRisk ? 'var(--bad)' : 'var(--teal)') + '" style="cursor:pointer" data-block="block-' + pt.p.blockIndex + '">' +
      '<title>#' + (pt.p.blockIndex + 1) + ': ' + pt.p.retentionPct + '%</title></circle>'
    ).join('');
    curveHTML =
      '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:80px">' +
      '<path d="' + areaPath + '" fill="rgba(50,210,172,.08)"/>' +
      '<path d="' + path + '" fill="none" stroke="var(--teal)" stroke-width="1.5" opacity="0.7"/>' +
      '<line x1="' + pad + '" y1="' + (H - pad) + '" x2="' + (W - pad) + '" y2="' + (H - pad) + '" stroke="var(--border)"/>' +
      dots + '</svg>' +
      '<div class="legendx"><span style="color:var(--teal)">●</span> estable &nbsp;<span style="color:var(--bad)">●</span> riesgo de fuga &nbsp;<span style="color:var(--muted)">clic en un punto → va al bloque</span></div>';
  }

  /* --- factores de retención (mismas filas y glosas de la app) --- */
  let factorsHTML = '';
  if (r.scores) {
    const factors = [
      ['Hook', r.scores.hook, 'Fuerza del gancho inicial (pregunta, dato, urgencia).'],
      ['Pacing', r.scores.pacing, 'Variación de ritmo entre bloques cortos y largos.'],
      ['Interrupts', r.scores.patternInterrupts, 'Cambios visuales/narrativos que resetean la atención.'],
      ['Densidad', r.scores.contentDensity, 'Cantidad de temas nuevos por minuto.'],
      ['Promesa', r.scores.promiseDelivery, 'Si la promesa del hook se cumple en el cuerpo.'],
      ['Legibilidad', r.scores.readability, 'Claridad del lenguaje (Fernández-Huerta).'],
      ['CTA', r.scores.cta, 'Presencia y posición del llamado a la acción.'],
      ['Narrativa', r.scores.narrative, 'Completitud de la estructura (hook→evidencia→cierre).']
    ];
    if (r.scores.emotionalArc && r.scores.emotionalArc.available) {
      factors.splice(3, 0, ['Arco emocional', r.scores.emotionalArc, 'Flips (Berger 2026), engagement y momentum ascendente (Song 2023, peak-end).']);
    }
    factorsHTML = factors.map(([label, data, glosa]) => {
      if (!data || typeof data.score !== 'number') return '';
      const c = data.score >= 70 ? 'good' : data.score >= 45 ? 'warn' : 'bad';
      return '<div class="rf-row"><div class="rf-head"><span>' + label + '</span><span class="rf-val ' + c + '">' + data.score + '</span></div>' +
        '<div class="rf-glosa">' + glosa + '</div><div class="rf-bar"><i style="width:' + data.score + '%;background:var(--' + c + ')"></i></div></div>';
    }).join('');
  }

  /* --- arco emocional ECG (mismo look de la app incl. N/D huecos + leyenda con puntitos) --- */
  let arcHTML = '';
  const arc = s.sentimentArc || [];
  if (arc.length > 1) {
    const W = Math.max(180, arc.length * 36), H = 64, midY = H / 2;
    const pts = arc.map((p, i) => {
      const x = arc.length === 1 ? W / 2 : (i / (arc.length - 1)) * (W - 8) + 4;
      const missing = p.failed || p.valence === null || p.valence === undefined;
      return { x, y: missing ? midY : midY - p.valence * (midY - 6), missing, p };
    });
    const okPts = pts.filter(pt => !pt.missing);
    const linePath = okPts.map((pt, i) => (i === 0 ? 'M' : 'L') + pt.x.toFixed(1) + ',' + pt.y.toFixed(1)).join(' ');
    const dotsSvg = pts.map(pt => {
      const n = (pt.p.blockIndex ?? 0) + 1;
      if (pt.missing) {
        return '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="3" fill="none" stroke="var(--muted)" stroke-width="1.5" stroke-dasharray="2 2"><title>#' + n + ' (sin dato)</title></circle>';
      }
      const color = pt.p.label === 'POS' ? 'var(--good)' : pt.p.label === 'NEG' ? 'var(--bad)' : 'var(--warn)';
      const rr = 3 + Math.abs(pt.p.valence) * 3;
      return '<circle cx="' + pt.x.toFixed(1) + '" cy="' + pt.y.toFixed(1) + '" r="' + rr.toFixed(1) + '" fill="' + color + '"><title>#' + n + ' (' + pt.p.label + ' ' + (pt.p.valence >= 0 ? '+' : '') + pt.p.valence.toFixed(2) + ')</title></circle>';
    }).join('');
    const engPct = s.engagementScore != null ? Math.round(s.engagementScore * 100) : null;
    const momPts = s.emotionalMomentum != null ? Math.round(s.emotionalMomentum * 100) : null;
    const failedN = s.processing?.failedBlocks || pts.filter(pt => pt.missing).length;
    arcHTML =
      '<div class="legendx">' +
        '<span><i class="lg-dot" style="background:var(--good)"></i>Positivo</span>' +
        '<span><i class="lg-dot" style="background:var(--warn)"></i>Neutral</span>' +
        '<span><i class="lg-dot" style="background:var(--bad)"></i>Negativo</span>' +
        '<span><i class="lg-dot" style="background:transparent;border:1.5px dashed var(--muted)"></i>Sin dato</span>' +
      '</div>' +
      (failedN > 0 ? '<div class="xerr">⚠ ' + failedN + ' bloque(s) sin dato — excluido(s) de engagement, momentum y saltos.</div>' : '') +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:64px">' +
      '<line x1="0" y1="' + midY + '" x2="' + W + '" y2="' + midY + '" stroke="var(--border)" stroke-width="1" stroke-dasharray="2 3"/>' +
      '<path d="' + linePath + '" fill="none" stroke="var(--muted)" stroke-width="1.5" opacity="0.4"/>' + dotsSvg + '</svg>' +
      '<div class="cl-metrics" style="margin-top:8px">' +
        (engPct != null ? '<div class="cl-metric"><small>Engagement</small><b>' + engPct + '%</b></div>' : '') +
        (momPts != null ? '<div class="cl-metric"><small>Momentum</small><b>' + (s.emotionalMomentum >= 0 ? '+' : '') + momPts + '</b></div>' : '') +
        '<div class="cl-metric"><small>Saltos tonales</small><b>' + (s.tonalJumps?.length ?? 0) + '</b></div>' +
      '</div>';
  }

  /* --- desglose de salud (ICN) --- */
  let healthHTML = '';
  if (analysis) {
    const rows = [['Hook', analysis.hs], ['Claridad', analysis.cl], ['Ritmo', analysis.pa], ['Promesa', analysis.pr]];
    healthHTML = rows.map(([label, v]) => {
      const c = v >= 70 ? 'good' : v >= 45 ? 'warn' : 'bad';
      return '<div class="rf-row"><div class="rf-head"><span>' + label + '</span><span class="rf-val ' + c + '">' + Math.round(v) + '</span></div>' +
        '<div class="rf-bar"><i style="width:' + Math.max(0, Math.min(100, v)) + '%;background:var(--' + c + ')"></i></div></div>';
    }).join('');
    const _ctaQ = analyzeCTA(project.blocks || []);
    const contrib = _ctaQ.position === null ? null : Math.round(8 * _ctaQ.score / 10) / 10;
    healthHTML += '<div class="legendx" style="margin-top:6px">' +
      (contrib === null
        ? '<span>Bonus CTA: +0/8 (sin CTA en el guion)</span>'
        : '<span>Bonus CTA (escalado por calidad): +' + contrib + '/8 · calidad ' + _ctaQ.score + '/100</span>') +
      '</div>';
  }

  /* --- carga cognitiva --- */
  let cogHTML = '';
  if ((project.blocks || []).length) {
    const cl = analyzeCognitiveLoad(project.blocks, wpm);
    const c = cl.score < 25 ? 'good' : cl.score < 50 ? 'warn' : cl.score < 75 ? 'warn' : 'bad';
    cogHTML =
      '<div class="rf-row"><div class="rf-head"><span>' + cl.level + '</span><span class="rf-val ' + c + '">' + cl.score + '</span></div>' +
      '<div class="rf-bar"><i style="width:' + Math.min(100, cl.score) + '%;background:var(--' + c + ')"></i></div></div>' +
      '<div class="cl-metrics" style="margin-top:8px">' +
      '<div class="cl-metric"><small>Temas/min</small><b>' + cl.topicsPerMinute + '</b></div>' +
      '<div class="cl-metric"><small>Pal/oración</small><b>' + cl.avgWordsPerSentence + '</b></div>' +
      '<div class="cl-metric"><small>Descansos</small><b>' + cl.restPoints + '</b></div></div>';
  }

  /* --- estructura por tipo --- */
  const counts = {};
  (project.blocks || []).forEach(b => { counts[b.type] = (counts[b.type] || 0) + 1; });
  const chipsHTML = Object.keys(_XTYPE).filter(t => counts[t]).map(t =>
    '<span class="chip"><span style="color:' + _XTYPE[t][1] + '">●</span> ' + _XTYPE[t][0] + ' ×' + counts[t] + '</span>'
  ).join('');

  /* --- riesgos, insights y recomendaciones (clickeables cuando hay bloque) --- */
  let issuesHTML = '';
  {
    const _tgt = (x) => {
      const m = x.match(/#(\d+)/);
      if (m && (project.blocks || [])[+m[1] - 1]) return 'block-' + (+m[1] - 1);
      if (/hook|promesa/i.test(x)) {
        const i = (project.blocks || []).findIndex(b => b.type === 'HOOK');
        if (i >= 0) return 'block-' + i;
      }
      return null;
    };
    const items = [];
    (r.insights || []).forEach(x => items.push('<div class="xins">' + _xEsc(x) + '</div>'));
    (r.risks || []).forEach(x => {
      const t = _tgt(x);
      items.push('<div class="xrisk"' + (t ? ' data-block="' + t + '" title="Clic para ir al bloque"' : '') + '>' + _xEsc(x) + (t ? ' ↦' : '') + '</div>');
    });
    (r.recommendations || []).forEach(x => items.push('<div class="xrec">→ ' + _xEsc(x) + '</div>'));
    if (items.length) {
      issuesHTML = '<div class="sec"><div class="sec-h"><span class="sec-t">Riesgos y recomendaciones</span><span class="sec-hint">clic en el riesgo → va al bloque</span></div>' + items.join('') + '</div>';
    }
  }

  /* --- IA plana (alineación/repetición) --- */
  let iaHTML = '';
  if (ai.alignment != null || ai.redundancy != null) {
    iaHTML = '<div class="sec"><div class="sec-h"><span class="sec-t">Análisis IA semántico</span><span class="sec-hint">modelos locales</span></div>' +
      '<div class="cl-metrics">' +
      (ai.alignment != null ? '<div class="cl-metric"><small>Alineación hook↔promesa</small><b>' + Math.round(ai.alignment * 100) + '%</b></div>' : '') +
      (ai.redundancy != null ? '<div class="cl-metric"><small>Repetición</small><b>' + Math.round(ai.redundancy * 100) + '%</b></div>' : '') +
      '</div></div>';
  }

  /* --- bloques del guion --- */
  const blocksHTML = (project.blocks || []).map((b, i) => {
    const [tName, tColor] = _XTYPE[b.type] || ['Otro', '#b3bdce'];
    const words = wordCount(b.content || '');
    const secs = Math.round(durationInSeconds(b.content || '', wpm));
    const arcPt = arc.find(p => p.blockIndex === i && !p.failed && typeof p.valence === 'number');
    const curvePt = (r.curve || []).find(p => p.blockIndex === i);
    const metaBits = ['#' + (i + 1), b.type, words + ' pal', '~' + secs + 's'];
    if (arcPt) metaBits.push('val ' + (arcPt.valence >= 0 ? '+' : '') + arcPt.valence.toFixed(2) + ' ' + arcPt.label);
    if (curvePt) metaBits.push('ret ' + curvePt.retentionPct + '%');
    return '<div class="xblock" id="block-' + i + '" style="border-left-color:' + tColor + ';background:var(--panel2)">' +
      '<div class="xmeta">' + metaBits.join(' · ') + '</div>' +
      '<div class="xlabel">' + _xEsc(b.label || tName) + '</div>' +
      '<div class="xcontent">' + _xEsc(b.content || '') + '</div>' +
      (b.notes ? '<div class="xnotes">Nota: ' + _xEsc(b.notes) + '</div>' : '') + '</div>';
  }).join('');

  const html =
    '<!doctype html><html lang="es"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="engine-version" content="' + ENGINE_VERSION + '"><meta name="app-version" content="' + APP_VERSION + '">' +
    '<title>' + title + ' — ScriptLab</title><style>' + _XCSS + '</style></head><body><div class="wrap">' +
    '<div class="xh"><span class="brand">Script<b>i</b>Lab</span><span class="eng">motor ' + ENGINE_VERSION + '</span>' +
    '<span class="eng">' + now + '</span></div>' +
    '<h1>' + title + '</h1>' +
    (project.promise ? '<p class="promise">' + _xEsc(project.promise) + '</p>' : '') +
    '<div class="chipsline"><span class="chip">' + (project.blocks || []).length + ' bloques</span><span class="chip">' + wpm + ' WPM</span>' +
    (r.confidence != null ? '<span class="chip">confianza ' + r.confidence + '</span>' : '') +
    (s.processing ? '<span class="chip">IA: ' + s.processing.successfulBlocks + '/' + s.processing.eligibleBlocks + ' bloques analizados</span>' : '') +
    '</div>' +
    '<div class="hero" style="margin-top:16px">' + ringsHTML + '</div>' +
    '<div class="sec"><div class="sec-h"><span class="sec-t">Curva de retención</span><span class="sec-hint">' + (apv != null ? 'APV ' + apv + '%' : 'dónde abandona el público') + '</span></div>' +
    (curveHTML || '<div class="xrisk ok">Calculá la retención en la app para ver la curva.</div>') +
    (r.formula ? '<div class="xformula">' + _xEsc(r.formula) + '</div>' : '') + '</div>' +
    (factorsHTML ? '<div class="sec"><div class="sec-h"><span class="sec-t">Factores de retención</span><span class="sec-hint">dimensiones del APV</span></div>' + factorsHTML + '</div>' : '') +
    (arcHTML ? '<div class="sec"><div class="sec-h"><span class="sec-t">Arco emocional</span><span class="sec-hint">IA en vivo (robertuito local)</span></div>' + arcHTML + '</div>' : '') +
    '<div class="sec"><div class="sec-h"><span class="sec-t">Desglose de salud</span><span class="sec-hint">ICN</span></div>' + healthHTML + '</div>' +
    '<div class="sec"><div class="sec-h"><span class="sec-t">Carga cognitiva</span><span class="sec-hint">Miller 1956 · Sweller 1988</span></div>' + cogHTML + '</div>' +
    '<div class="sec"><div class="sec-h"><span class="sec-t">Estructura</span><span class="sec-hint">por tipo de bloque</span></div><div class="chipsline">' + chipsHTML + '</div></div>' +
    iaHTML + issuesHTML +
    '<div class="sec"><div class="sec-h"><span class="sec-t">Guion completo</span><span class="sec-hint">' + (project.blocks || []).length + ' bloques</span></div>' + blocksHTML + '</div>' +
    '<footer>Generado por ScriptLab V' + APP_VERSION + ' · motor ' + ENGINE_VERSION + ' · todo el análisis se procesó localmente en el navegador.<br>' +
    'Fórmulas y fuentes completas: <a href="./metricas.html">metricas.html</a></footer>' +
    '</div><script>' + _XJS + '<\/script></body></html>';

  download(html, fileSlug(project.title) + '.html', 'text/html');
}

/* ============================================================
   Export PDF — vía print con gráficas (§12.1)
   ============================================================ */
export function exportPDF(project, analysis, retentionResult, sentimentResult, aiResult) {
  const d = _buildDashboardHTML(project, analysis, retentionResult, sentimentResult, aiResult);
  const html = '<!doctype html><meta charset="utf-8"><title>' + d.title + '</title>' +
    '<style>@media print{body{margin:12mm}div,svg{page-break-inside:avoid}}body{font:13px system-ui;color:#222;margin:0;padding:16px}</style>' +
    '<h1 style="font-size:20px;margin-bottom:4px">' + d.title + '</h1>' +
    (d.promise ? '<p style="color:#555;margin-bottom:12px">' + d.promise + '</p>' : '') +
    '<div style="display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap">' + d.cardsHTML + '</div>' +
    d.curveHTML + d.sentimentHTML + d.iaHTML + d.issuesHTML +
    '<h2 style="font-size:16px;margin:20px 0 6px">Guion</h2>' + d.blocksHTML;
  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

/* ============================================================
   Parse Markdown → bloques (§12.2)
   ============================================================ */
export function parseMarkdownToBlocks(md) {
  const blocks = [];
  const skipped = [];
  const sections = md.split(/^##\s+/m);
  const validTypes = ['HOOK','CONTEXTO','EVIDENCIA','SEGMENTO','GIRO','VISUAL','CTA'];

  for (const section of sections) {
    const m = section.match(/^(\d+)\.\s+(\w+):\s*(.+?)(?:\n\n([\s\S]*))?$/);
    if (!m) {
      // Bug 4 fix: si la sección ## tiene contenido pero no matchea el patrón estricto,
      // no descartarla silenciosamente. La guardamos como SEGMENTO con el título como label.
      const trimmed = section.trim();
      if (trimmed && trimmed.length > 3) {
        const firstLine = trimmed.split('\n')[0].trim();
        const rest = trimmed.substring(firstLine.length).trim();
        blocks.push({
          id: crypto.randomUUID(),
          type: 'SEGMENTO',
          label: firstLine.substring(0, 60) || 'Importado',
          content: rest,
          notes: ''
        });
      } else if (trimmed) {
        skipped.push(trimmed.substring(0, 40));
      }
      continue;
    }
    const typeStr = m[2].toUpperCase();
    const type = validTypes.includes(typeStr) ? typeStr : 'SEGMENTO';
    let content = m[4] || '';
    content = content.replace(/^> Nota:\s*(.+)/gm, '').trim();
    const notesMatch = section.match(/^> Nota:\s*(.+)/m);
    blocks.push({
      id: crypto.randomUUID(),
      type, label: m[3].trim(),
      content,
      notes: notesMatch ? notesMatch[1].trim() : ''
    });
  }
  if (skipped.length) {
    console.warn('[ScriptLab] Secciones de Markdown ignoradas por formato:', skipped);
  }
  return blocks;
}

/* ============================================================
   importProject(onDone) — JSON o MD, con confirmación (§12.2)
   ============================================================ */
export function importProject(onDone) {
  const input = document.querySelector('#import-input');
  if (!input) return;
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    input.value = '';
    const ext = file.name.split('.').pop().toLowerCase();
    try {
      if (ext === 'json') {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.project && data.title === undefined) throw new Error('Formato JSON no reconocido.');
        // Pasar `data` completo, NO `data.project || data`: los bloques están en
        // data.blocks (hermano de data.project), no dentro de data.project.
        const imported = normalizeProject(data);
        if (!confirm('¿Importar "' + imported.title + '"? Se reemplazará el proyecto actual.')) return;
        await put('projects', imported);
        if (onDone) onDone();
      } else if (ext === 'md') {
        const text = await file.text();
        const blocks = parseMarkdownToBlocks(text);
        const titleMatch = text.match(/^#\s+(.+)/m);
        const promiseMatch = text.match(/\*\*Promesa:\*\*\s*(.+)/);
        if (!confirm('¿Importar "' + (titleMatch ? titleMatch[1] : 'Sin título') + '"? Se reemplazará el proyecto actual.')) return;
        const imported = normalizeProject({
          title: titleMatch ? titleMatch[1].trim() : 'Importado',
          promise: promiseMatch ? promiseMatch[1].trim() : '',
          blocks
        });
        await put('projects', imported);
        if (onDone) onDone();
      } else {
        alert('Formato no soportado. Usá .json o .md');
      }
    } catch (err) {
      alert('Error al importar: ' + err.message);
    }
  };
  input.click();
}

/* ============================================================
   Exportar diagnósticos completos — TXT / HTML / PDF / JSON
   Recopila todos los resultados IA y heurísticos del proyecto.
   ============================================================ */
export function exportDiagnostics(project, analysis, retentionResult, sentimentResult, aiResult, deepResult, format) {
  const now = new Date().toLocaleString('es-AR');
  const title = project.title || 'Sin título';
  const r = retentionResult || {};
  const s = sentimentResult || {};
  const ai = aiResult || {};

  // --- Datos comunes ---
  const health = analysis?.score ?? '—';
  const apv = r.overallRetention ?? '—';
  const confidence = r.confidence ?? '—';
  const engagement = s.engagementScore != null ? Math.round(s.engagementScore * 100) + '%' : '—';
  const momentum = s.emotionalMomentum != null ? (s.emotionalMomentum >= 0 ? '+' : '') + Math.round(s.emotionalMomentum * 100) : '—';
  const jumps = s.tonalJumps?.length ?? 0;
  const alignment = ai.alignment != null ? Math.round(ai.alignment * 100) + '%' : '—';
  const redundancy = ai.redundancy != null ? Math.round(ai.redundancy * 100) + '%' : '—';

  const subScores = r.scores || {};
  const scoreRows = [
    ['Hook', subScores.hook?.score],
    ['Ritmo', subScores.pacing?.score],
    ['Pattern interrupts', subScores.patternInterrupts?.score],
    // combined-2.0 (E1): el arco ahora forma parte del APV cuando hay dato
    ['Arco emocional', subScores.emotionalArc?.available ? subScores.emotionalArc.score : 'N/D'],
    ['Densidad', subScores.contentDensity?.score],
    ['Promesa', subScores.promiseDelivery?.score],
    ['Legibilidad', subScores.readability?.score],
    ['CTA', subScores.cta?.score],
    ['Narrativa', subScores.narrative?.score]
  ];

  // COMBINED: riesgos/recomendaciones se imprimen una sola vez (mimo los
  // duplicaba en "ANÁLISIS IA" y rotulaba recomendaciones como "Problemas").

  const sentimentArc = s.sentimentArc || [];

  // --- Exportar según formato ---
  const slug = fileSlug(title);

  if (format === 'json') {
    const data = {
      exportedAt: now,
      engineVersion: ENGINE_VERSION,
      appVersion: APP_VERSION,
      project: { title, promise: project.promise, blocks: project.blocks.length, format: project.format, genre: project.genre },
      health: { score: health, breakdown: { hook: analysis?.hs, clarity: analysis?.cl, pacing: analysis?.pa, promise: analysis?.pr } },
      retention: { apv, confidence, formula: r.formula, subScores: Object.fromEntries(scoreRows), curve: r.curve, insights: r.insights, risks: r.risks, recommendations: r.recommendations },
      sentiment: { engagement, momentum, jumps, arc: sentimentArc },
      ai: { alignment, redundancy, baseline: ai.baseline },
      deep: deepResult || null
    };
    download(JSON.stringify(data, null, 2), slug + '-diagnostico.json', 'application/json');
    return;
  }

  // --- Contenido de texto (compartido entre TXT y HTML) ---
  const lines = [];
  lines.push('DIAGNÓSTICO — ' + title + '  [motor: ' + ENGINE_VERSION + ' · app: ' + APP_VERSION + ']');
  lines.push('Generado: ' + now);
  lines.push('');
  lines.push('=== SALUD DEL GUION ===');
  lines.push('Score: ' + health + '/100');
  if (analysis) lines.push('Hook: ' + analysis.hs + ' | Claridad: ' + analysis.cl + ' | Ritmo: ' + analysis.pa + ' | Promesa: ' + analysis.pr);
  lines.push('');
  lines.push('=== RETENCIÓN ESTIMADA ===');
  lines.push('APV: ' + apv + '% | Confianza: ' + confidence);
  if (r.formula) lines.push('Fórmula: ' + r.formula);
  lines.push('');
  lines.push('Factores:');
  scoreRows.forEach(([name, val]) => { lines.push('  ' + name + ': ' + (val ?? '—') + '/100'); });
  // COMBINED fix (glitch "✓ ✗"): solo anteponer ✓ si el texto no trae símbolo.
  const _sym = /^[✓✗⚠→]/.test.bind(/^[✓✗⚠→]/);
  if (r.insights?.length) { lines.push(''); r.insights.forEach(x => lines.push('  ' + (_sym(x) ? '' : '✓ ') + x)); }
  if (r.risks?.length) { lines.push(''); r.risks.forEach(x => lines.push('  ' + x)); }
  if (r.recommendations?.length) { lines.push(''); r.recommendations.forEach(x => lines.push('  → ' + x)); }
  lines.push('');
  lines.push('=== ARCO EMOCIONAL ===');
  lines.push('Engagement: ' + engagement + ' | Momentum: ' + momentum + ' | Saltos tonales: ' + jumps);
  if (sentimentArc.length) {
    lines.push('');
    sentimentArc.forEach(p => {
      // COMBINED: puntos N/D (falló la clasificación) con valencia null.
      const v = (p.failed || p.valence === null || p.valence === undefined)
        ? 'sin dato'
        : (p.valence >= 0 ? '+' : '') + p.valence;
      lines.push('  Bloque #' + (p.blockIndex + 1) + ' [' + p.blockType + ']: ' + p.label + ' (' + v + ')');
    });
    const fb = s.processing?.failedBlocks || 0;
    if (fb > 0) lines.push('  ⚠ ' + fb + ' bloque(s) sin dato — excluido(s) de engagement/momentum/saltos.');
  }
  lines.push('');
  lines.push('=== ANÁLISIS IA ===');
  lines.push('Alineación hook↔promesa: ' + alignment);
  lines.push('Repetición: ' + redundancy);
  if (ai.baseline) {
    lines.push('Baseline semántico: avgSim ' + (ai.baseline.avgSim?.toFixed(3) ?? '—') +
      ' | maxSim ' + (ai.baseline.maxSim?.toFixed(3) ?? '—') +
      ' | pares ' + (ai.baseline.pairCount ?? '—'));
  }
  if (ai.processing) {
    const pr = ai.processing;
    lines.push('Procesamiento IA: ' + (pr.successfulChunks ?? '—') + '/' + (pr.totalChunks ?? '—') + ' chunks OK' +
      (pr.failedChunks ? ' (' + pr.failedChunks + ' bloques con fallo)' : ''));
  }

  const textContent = lines.join('\n');

  // --- CSV diagnóstico (fix #6): filas [seccion, metrica, valor, detalle] ---
  if (format === 'csv') {
    const NL2 = String.fromCharCode(10);
    const escCsv = (v) => {
      const s2 = String(v ?? '').replace(/\s+/g, ' ').trim();
      return /[",;]/.test(s2) ? '"' + s2.replace(/"/g, '""') + '"' : s2;
    };
    const rows = [['seccion', 'metrica', 'valor', 'detalle'].join(',')];
    rows.push(['salud', 'score', health, ''].join(','));
    if (analysis) {
      rows.push(['salud', 'hook_hs', analysis.hs, ''].join(','));
      rows.push(['salud', 'claridad_cl', analysis.cl, ''].join(','));
      rows.push(['salud', 'ritmo_pa', analysis.pa, ''].join(','));
      rows.push(['salud', 'promesa_pr', analysis.pr, ''].join(','));
    }
    rows.push(['retencion', 'apv_pct', apv, ''].join(','));
    rows.push(['retencion', 'confianza', confidence, ''].join(','));
    if (r.formula) rows.push(['retencion', 'formula', '', escCsv(r.formula)].join(','));
    scoreRows.forEach(([name, val]) => rows.push(['factor', escCsv(name), val ?? 'N/D', ''].join(',')));
    rows.push(['arco', 'engagement_pct', engagement, ''].join(','));
    rows.push(['arco', 'momentum', momentum, ''].join(','));
    rows.push(['arco', 'saltos_tonales', jumps, ''].join(','));
    sentimentArc.forEach(p => {
      const v = (p.failed || p.valence === null || p.valence === undefined) ? '' : p.valence;
      rows.push(['arco_bloque', '#' + (p.blockIndex + 1) + '_' + p.blockType, v, p.label].join(','));
    });
    rows.push(['ia', 'alineacion_hook_promesa', alignment, ''].join(','));
    rows.push(['ia', 'repeticion', redundancy, ''].join(','));
    (r.insights || []).forEach(x => rows.push(['insight', '', '', escCsv(x)].join(',')));
    (r.risks || []).forEach(x => rows.push(['riesgo', '', '', escCsv(x)].join(',')));
    (r.recommendations || []).forEach(x => rows.push(['recomendacion', '', '', escCsv(x)].join(',')));
    download(String.fromCharCode(0xFEFF) + rows.join(NL2), slug + '-diagnostico.csv', 'text/csv;charset=utf-8');
    return;
  }

  if (format === 'txt') {
    download(textContent, slug + '-diagnostico.txt', 'text/plain');
  } else if (format === 'html') {
    // Fix E2E: el DIAGNÓSTICO html despacha a la misma onepage rica que el
    // de GUION (anillos, curva, factores, ECG, bloques anclables, stamps
    // de versión). Antes era un documento de texto con estilos sueltos,
    // sin gráficas — detectado en la verificación E2E de V1.0.0a.
    exportHTML(project, analysis, retentionResult, sentimentResult, aiResult);
  } else if (format === 'pdf') {
    const esc = v => String(v || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const htmlLines = lines.map(l => {
      if (l.startsWith('===') && l.endsWith('===')) return '<h2 style="font-size:14px;margin:16px 0 4px;color:#555">' + esc(l.replace(/===/g, '').trim()) + '</h2>';
      if (l.startsWith('  ')) return '<div style="color:#666;padding:1px 0">' + esc(l) + '</div>';
      if (l === '') return '<br>';
      return '<div>' + esc(l) + '</div>';
    }).join('');
    const win = window.open('', '_blank');
    win.document.write('<!doctype html><meta charset="utf-8"><title>Diagnóstico — ' + esc(title) + '</title>' +
      '<style>@media print{body{margin:12mm}}body{font:12px/1.5 system-ui;color:#222}</style>' +
      '<h1 style="font-size:16px">Diagnóstico — ' + esc(title) + '</h1>' + htmlLines);
    win.document.close();
    setTimeout(() => win.print(), 400);
  }
}
