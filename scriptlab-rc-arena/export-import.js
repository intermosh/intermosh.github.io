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
   Export HTML — standalone estilado (§12.1)
   ============================================================ */
export function exportHTML(project, analysis) {
  const clean = v => String(v || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const blocks = project.blocks.map((b, i) =>
    '<section><small>' + (i + 1) + '. ' + clean(b.type) + '</small><h2>' + clean(b.label) + '</h2>' +
    '<p>' + clean(b.content).replace(/\n/g, '<br>') + '</p></section>'
  ).join('');
  download(
    '<!doctype html><meta charset="utf-8"><title>' + clean(project.title) + '</title>' +
    '<style>body{font:16px system-ui;max-width:780px;margin:40px auto;line-height:1.6;color:#222}' +
    'section{border-left:4px solid #7969ff;padding:10px 20px;margin:15px 0;background:#fafafa}' +
    'small{color:#666}</style><h1>' + clean(project.title) + '</h1><p><strong>Promesa:</strong> ' + clean(project.promise) + '</p>' +
    '<p>Salud del guion: ' + (analysis?.score || 0) + '/100</p>' + blocks,
    fileSlug(project.title) + '.html',
    'text/html'
  );
}

/* ============================================================
   Export TXT — texto plano
   ============================================================ */
export function exportTXT(project) {
  let txt = project.title.toUpperCase() + '\n\nPromesa: ' + (project.promise || '—') + '\n\n';
  project.blocks.forEach((b, i) => {
    txt += (i + 1) + '. ' + b.type + ': ' + b.label + '\n\n' + (b.content || '') + '\n\n';
  });
  download(txt, fileSlug(project.title) + '.txt', 'text/plain');
}

/* ============================================================
   Export PDF — Imprimible
   ============================================================ */
export function exportPDF(project) {
  const clean = v => String(v || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const blocks = project.blocks.map((b, i) =>
    '<section><small>' + (i + 1) + '. ' + clean(b.type) + '</small><h2>' + clean(b.label) + '</h2>' +
    '<p>' + clean(b.content).replace(/\n/g, '<br>') + '</p></section>'
  ).join('');
  
  const html = '<!doctype html><meta charset="utf-8"><title>' + clean(project.title) + '</title>' +
    '<style>body{font:12pt system-ui, sans-serif;max-width:800px;margin:2cm auto;line-height:1.5;color:#000}' +
    'section{margin-bottom:20px; page-break-inside:avoid;}' +
    'h1{font-size:24pt} h2{font-size:14pt; margin:4px 0;}' +
    'small{color:#666; font-size:9pt; text-transform:uppercase; letter-spacing:1px}' +
    '</style><h1>' + clean(project.title) + '</h1><p><strong>Promesa:</strong> ' + clean(project.promise) + '</p>' +
    blocks + '<script>window.print(); setTimeout(() => window.close(), 500);</script>';
    
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}

/* ============================================================
   Export Report (TXT, JSON, HTML, PDF)
   ============================================================ */
function getReportData(state, results) {
  const proj = state.p || {};
  const rData = state.retentionResult || {};
  const scores = rData.scores || {};
  const issues = [];
  
  const hookScore = scores.hook?.score || 0;
  
  if (results.extractiveError || results.redundancyError || results.densityError || results.gapsError) {
    issues.push({ title: 'Fallo Parcial de IA', desc: 'Algunos módulos semánticos fallaron al procesarse. Los resultados podrían estar incompletos.', type: 'red' });
  }

  if (!state.sentimentResult || !state.sentimentResult.sentimentArc || state.sentimentResult.sentimentArc.length === 0) {
    if (state.mode === 'ia') {
      issues.push({ title: 'Falta Contexto Emocional', desc: 'Esperando análisis de sentimiento. La detección de redundancia podría producir falsos positivos.', type: 'yellow' });
    }
  }

  if (hookScore < 50) issues.push({ title: 'Gancho Débil', desc: 'El inicio no captura la atención ni hace una promesa fuerte.', type: 'red' });

  if (results.gaps?.structural) {
    const missingStruct = results.gaps.structural.filter(s => !s.has);
    if (missingStruct.length > 0) issues.push({ title: 'Faltan Elementos Narrativos', desc: 'Considerá agregar: ' + missingStruct.map(s => s.label).join(', '), type: 'yellow' });
  }

  const pacingScore = scores.pacing?.score || 0;
  if (pacingScore < 50) issues.push({ title: 'Problemas de Ritmo', desc: 'Las oraciones son monótonas o los bloques son muy largos sin pausas.', type: 'yellow' });

  if (results.redundancy && results.redundancy.redundantPairs?.length > 0) {
    issues.push({ title: 'Contenido Repetitivo', desc: results.redundancy.redundantPairs.length + ' ideas repetidas sin contraste narrativo. Considerá recortarlas.', type: 'yellow' });
  }

  if (results.density && results.density.topicsPerMinute < 1) {
    issues.push({ title: 'Baja Densidad de Contenido', desc: 'Solo ' + results.density.topicsPerMinute.toFixed(1) + ' temas por minuto. La audiencia podría aburrirse.', type: 'red' });
  }

  const ctaScore = scores.cta?.score || 0;
  if (ctaScore < 50 && (proj.blocks || []).some(b => b.type === 'CTA')) {
    issues.push({ title: 'CTA Débil', desc: 'El llamado a la acción carece de urgencia o verbos de acción.', type: 'yellow' });
  }

  return {
    title: proj.title,
    overallRetention: Math.round(rData.overallRetention || 0),
    scores: {
      hook: hookScore,
      structure: scores.narrative?.score || 0,
      pacing: pacingScore
    },
    issues
  };
}

export function exportReportJSON(state, results) {
  const data = getReportData(state, results);
  download(JSON.stringify(data, null, 2), fileSlug(data.title) + '-diagnostic.json', 'application/json');
}

export function exportReportTXT(state, results) {
  const data = getReportData(state, results);
  let txt = 'DIAGNÓSTICO: ' + data.title.toUpperCase() + '\n';
  txt += '=======================================\n';
  txt += 'RETENCIÓN ESTIMADA: ' + data.overallRetention + '%\n';
  txt += 'SCORES -> Hook: ' + data.scores.hook + ' | Structure: ' + data.scores.structure + ' | Pacing: ' + data.scores.pacing + '\n\n';
  txt += 'PROBLEMAS ENCONTRADOS (' + data.issues.length + '):\n';
  data.issues.forEach(i => {
    txt += '- [' + i.type.toUpperCase() + '] ' + i.title + ': ' + i.desc + '\n';
  });
  if (data.issues.length === 0) txt += '- Todo bien. No se encontraron problemas críticos.\n';
  
  download(txt, fileSlug(data.title) + '-diagnostic.txt', 'text/plain');
}

export async function exportReportHTML(state, results) {
  const title = state.p?.title || 'Guion';
  let css = '';
  try {
    const res = await fetch('./styles.css');
    css = await res.text();
  } catch (e) {
    console.warn('Could not fetch styles for export', e);
  }

  const metricsNode = document.querySelector('#metrics-tabpage').cloneNode(true);
  const iaNode = document.querySelector('#ia-content').cloneNode(true);
  
  metricsNode.querySelectorAll('button').forEach(b => b.remove());
  iaNode.querySelectorAll('button').forEach(b => b.remove());

  // Show hidden elements in AI node if it was processed
  iaNode.style.display = 'block';
  iaNode.removeAttribute('hidden');

  let html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Diagnóstico - ${title}</title>
  <style>
    ${css}
    body { background: var(--bg); color: var(--fg); padding: 40px; max-width: 900px; margin: 0 auto; overflow: visible !important; height: auto !important; }
    .sec { page-break-inside: avoid; margin-bottom: 20px; }
    svg { max-width: 100%; }
    .hero { display: flex; flex-wrap: wrap; gap: 20px; }
    .ring-card { flex: 1; min-width: 200px; }
    details { display: block; }
    details > summary { display: none; } /* Open details for printing */
    details > div { display: block !important; margin-top: 10px; }
  </style>
</head>
<body class="dark">
  <h1 style="text-align:center; margin-bottom:40px; color: var(--fg)">Reporte de Diagnóstico: ${title}</h1>
  ${metricsNode.innerHTML}`;

  if (state.deepResult) {
    html += `<hr style="border:0; border-top:1px solid var(--border); margin: 40px 0;">
    <h2 style="color:var(--fg); margin-bottom:20px;">Análisis Semántico Profundo</h2>
    ${iaNode.innerHTML}`;
  }

  html += `</body></html>`;
  download(html, fileSlug(title) + '-diagnostic.html', 'text/html');
}

export async function exportReportPDF(state, results) {
  const title = state.p?.title || 'Guion';
  let css = '';
  try {
    const res = await fetch('./styles.css');
    css = await res.text();
  } catch (e) {
    console.warn('Could not fetch styles for export', e);
  }

  const metricsNode = document.querySelector('#metrics-tabpage').cloneNode(true);
  const iaNode = document.querySelector('#ia-content').cloneNode(true);
  
  metricsNode.querySelectorAll('button').forEach(b => b.remove());
  iaNode.querySelectorAll('button').forEach(b => b.remove());

  iaNode.style.display = 'block';
  iaNode.removeAttribute('hidden');

  let html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Diagnóstico - ${title}</title>
  <style>
    ${css}
    body { background: var(--bg); color: var(--fg); padding: 40px; max-width: 900px; margin: 0 auto; overflow: visible !important; height: auto !important; }
    .sec { page-break-inside: avoid; margin-bottom: 20px; }
    svg { max-width: 100%; }
    .hero { display: flex; flex-wrap: wrap; gap: 20px; }
    .ring-card { flex: 1; min-width: 200px; }
    details { display: block; }
    details > summary { display: none; }
    details > div { display: block !important; margin-top: 10px; }
  </style>
</head>
<body class="dark">
  <h1 style="text-align:center; margin-bottom:40px; color: var(--fg)">Reporte de Diagnóstico: ${title}</h1>
  ${metricsNode.innerHTML}`;

  if (state.deepResult) {
    html += `<hr style="border:0; border-top:1px solid var(--border); margin: 40px 0;">
    <h2 style="color:var(--fg); margin-bottom:20px;">Análisis Semántico Profundo</h2>
    ${iaNode.innerHTML}`;
  }

  html += `<script>window.print(); setTimeout(() => window.close(), 500);</script></body></html>`;
  
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
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
