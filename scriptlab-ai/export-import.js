/* export-import.js — Project import/export for ScriptLab.
   Supports JSON (.scriptlab.json), Markdown (.md), and HTML (.html). */

function download(data, name, type) {
  const u = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 800);
}

function fileSlug(text) {
  return (text || 'scriptlab').toLowerCase().replace(/[^a-z0-9]+/gi, '-');
}

function exportJSON(project, analysis, calibration) {
  download(
    JSON.stringify({ app: 'ScriptLab AI', exportedAt: new Date().toISOString(), project, analysis, calibration }, null, 2),
    fileSlug(project.title) + '.scriptlab.json',
    'application/json'
  );
}

function exportMarkdown(project, analysis) {
  let md = '# ' + project.title + '\n\n**Promesa:** ' + (project.promise || '\u2014') + '\n\n**ICN:** ' + analysis.score + '/100\n';
  project.blocks.forEach((b, i) => {
    md += '\n## ' + (i + 1) + '. ' + b.type + ': ' + b.label + '\n\n' +
      (b.content || '_Sin contenido_') + '\n' +
      (b.notes ? '\n> Nota: ' + b.notes + '\n' : '');
  });
  download(md, fileSlug(project.title) + '.md', 'text/markdown');
}

function exportHTML(project, analysis) {
  const clean = v => String(v || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const blocks = project.blocks.map((b, i) =>
    '<section><small>' + (i + 1) + '. ' + clean(b.type) + '</small><h2>' + clean(b.label) + '</h2>' +
    '<p>' + clean(b.content).replace(/\n/g, '<br>') + '</p></section>'
  ).join('');
  download(
    '<!doctype html><meta charset="utf-8"><title>' + clean(project.title) + '</title>' +
    '<style>body{font:16px system-ui;max-width:780px;margin:40px auto;line-height:1.6}' +
    'section{border-left:4px solid #7969ff;padding:10px 20px;margin:15px 0;background:#fafafa;break-inside:avoid}' +
    'small{color:#555}</style><h1>' + clean(project.title) + '</h1><p>' + clean(project.promise) + '</p>' +
    '<p>ICN ' + analysis.score + '/100</p>' + blocks,
    fileSlug(project.title) + '.html',
    'text/html'
  );
}

/* ===== Import ===== */
function parseMarkdownToBlocks(md) {
  const blocks = [];
  const sections = md.split(/^##\s+/m);
  for (const section of sections) {
    const m = section.match(/^(\d+)\.\s+(\w+):\s*(.+?)(?:\n\n([\s\S]*))?$/);
    if (!m) continue;
    const typeStr = m[2].toUpperCase();
    const type = T[typeStr] ? typeStr : 'SEGMENTO';
    let content = m[4] || '';
    content = content.replace(/^> Nota:\s*(.+)/gm, '').trim();
    const notesMatch = section.match(/^> Nota:\s*(.+)/m);
    blocks.push({ id: crypto.randomUUID(), type, label: m[3].trim() || T[type][0], content, notes: notesMatch ? notesMatch[1].trim() : '' });
  }
  return blocks;
}

async function importProject() {
  const input = $('#import-input');
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
        console.log('[IMPORT] file:', file.name, 'keys:', Object.keys(data), 'blocks:', data.blocks?.length, 'project.blocks:', data.project?.blocks?.length);
        if (!data.project && data.title === undefined) throw new Error('Formato JSON no reconocido.');
        const imported = normalizeProject(data);
        console.log('[IMPORT] normalized: title=' + imported.title, 'blocks=' + imported.blocks.length);
        if (!confirm('\u00BFImportar "' + imported.title + '"? Se reemplazar\u00e1 el proyecto actual.')) return;
        setSelection(null);
        setAIResult(null);
        flowDirty = true;
        markAnalysisDirty();
        await put('projects', imported);
        setProject(imported);
        console.log('[IMPORT] done. blocks=' + getProject().blocks.length);
      } else if (ext === 'md') {
        const text = await file.text();
        const blocks = parseMarkdownToBlocks(text);
        const titleMatch = text.match(/^#\s+(.+)/m);
        const promiseMatch = text.match(/\*\*Promesa:\*\*\s*(.+)/);
        if (!confirm('\u00BFImportar "' + (titleMatch ? titleMatch[1] : 'Sin t\u00edtulo') + '"? Se reemplazar\u00e1 el proyecto actual.')) return;
        const currentProj = getProject();
        const imported = normalizeProject({ title: titleMatch ? titleMatch[1].trim() : 'Importado', promise: promiseMatch ? promiseMatch[1].trim() : '', blocks, aiMode: currentProj.aiMode, wpm: currentProj.wpm });
        setSelection(null);
        setAIResult(null);
        flowDirty = true;
        markAnalysisDirty();
        await put('projects', imported);
        setProject(imported);
      } else {
        alert('Formato no soportado. Us\u00e1 .json o .md');
      }
    } catch (err) { alert('Error al importar: ' + err.message); }
  };
  input.click();
}