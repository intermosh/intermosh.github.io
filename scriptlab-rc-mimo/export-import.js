/* export-import.js — Import/export de proyectos.
   Implementa §13.7 y §12 del contrato.
   Depende de: state.js (normalizeProject), db.js (put/get/all). */

import { normalizeProject } from './state.js';
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
      version: 4,
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
export function exportHTML(project, analysis, retentionResult, sentimentResult, aiResult) {
  const d = _buildDashboardHTML(project, analysis, retentionResult, sentimentResult, aiResult);
  download(
    '<!doctype html><meta charset="utf-8"><title>' + d.title + '</title>' +
    '<style>body{font:15px system-ui;max-width:780px;margin:30px auto;line-height:1.6;color:#222}' +
    '@media print{body{margin:15mm}}</style>' +
    '<h1 style="font-size:24px;margin-bottom:4px">' + d.title + '</h1>' +
    (d.promise ? '<p style="color:#555;margin-bottom:16px">' + d.promise + '</p>' : '') +
    '<div style="display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap">' + d.cardsHTML + '</div>' +
    d.curveHTML + d.sentimentHTML + d.iaHTML + d.issuesHTML +
    '<h2 style="font-size:18px;margin:24px 0 8px">Guion</h2>' + d.blocksHTML,
    fileSlug(project.title) + '.html', 'text/html'
  );
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
    ['Densidad', subScores.contentDensity?.score],
    ['Promesa', subScores.promiseDelivery?.score],
    ['Legibilidad', subScores.readability?.score],
    ['CTA', subScores.cta?.score],
    ['Narrativa', subScores.narrative?.score]
  ];

  const issues = [];
  if (r.risks) r.risks.forEach(x => issues.push(x));
  if (r.recommendations) r.recommendations.forEach(x => issues.push('→ ' + x));

  const sentimentArc = s.sentimentArc || [];

  // --- Exportar según formato ---
  const slug = fileSlug(title);

  if (format === 'json') {
    const data = {
      exportedAt: now,
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
  lines.push('DIAGNÓSTICO — ' + title);
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
  if (r.insights?.length) { lines.push(''); r.insights.forEach(x => lines.push('  ✓ ' + x)); }
  if (r.risks?.length) { lines.push(''); r.risks.forEach(x => lines.push('  ' + x)); }
  if (r.recommendations?.length) { lines.push(''); r.recommendations.forEach(x => lines.push('  → ' + x)); }
  lines.push('');
  lines.push('=== ARCO EMOCIONAL ===');
  lines.push('Engagement: ' + engagement + ' | Momentum: ' + momentum + ' | Saltos tonales: ' + jumps);
  if (sentimentArc.length) {
    lines.push('');
    sentimentArc.forEach(p => {
      lines.push('  Bloque #' + (p.blockIndex + 1) + ' [' + p.blockType + ']: ' + p.label + ' (' + (p.valence >= 0 ? '+' : '') + p.valence + ')');
    });
  }
  lines.push('');
  lines.push('=== ANÁLISIS IA ===');
  lines.push('Alineación hook↔promesa: ' + alignment);
  lines.push('Repetición: ' + redundancy);
  if (issues.length) { lines.push(''); lines.push('Problemas:'); issues.forEach(x => lines.push('  ' + x)); }

  const textContent = lines.join('\n');

  if (format === 'txt') {
    download(textContent, slug + '-diagnostico.txt', 'text/plain');
  } else if (format === 'html') {
    const esc = v => String(v || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const htmlLines = lines.map(l => {
      if (l.startsWith('===') && l.endsWith('===')) return '<h2 style="font-size:15px;margin:18px 0 6px;color:#7969ff">' + esc(l.replace(/===/g, '').trim()) + '</h2>';
      if (l.startsWith('  ✓')) return '<div style="color:#5cdb87;padding:2px 0">' + esc(l) + '</div>';
      if (l.startsWith('  →')) return '<div style="color:#f4b857;padding:2px 0">' + esc(l) + '</div>';
      if (l.startsWith('  ')) return '<div style="color:#888;padding:1px 0">' + esc(l) + '</div>';
      if (l === '') return '<br>';
      return '<div>' + esc(l) + '</div>';
    }).join('');
    download(
      '<!doctype html><meta charset="utf-8"><title>Diagnóstico — ' + esc(title) + '</title>' +
      '<style>body{font:13px/1.6 system-ui;max-width:700px;margin:30px auto;color:#222}</style>' +
      '<h1 style="font-size:18px">Diagnóstico — ' + esc(title) + '</h1>' + htmlLines,
      slug + '-diagnostico.html', 'text/html'
    );
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
