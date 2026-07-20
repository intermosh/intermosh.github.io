/* =====================================================================
 * YouTube Script Lab — visor-assets.js
 * Constantes VISOR_CSS y VISOR_JS para exportar HTML standalone.
 * Generado automáticamente desde visor.html — no editar a mano.
 * ===================================================================== */

window.VisorAssets = (function () {
  const VISOR_CSS = `
:root {
  /* Dark por defecto — paleta optimizada para lectura desde monitor */
  --bg: #0d1117;
  --bg-elev: #161b22;
  --bg-soft: #1c2129;
  --text: #e6edf3;
  --text-muted: #8b949e;
  --text-dim: #6e7681;
  --border: rgba(255,255,255,0.08);
  --accent: #58a6ff;
  --voice: #79c0ff;
  --visual: #7ee787;
  --screen: #d2a8ff;
  --sfx: #ff7eb6;
  --cta: #ffa657;
  --pause: #8b949e;
  --source: #56d4dd;
  --shadow: 0 8px 24px rgba(0,0,0,.35);
}
html[data-theme="light"] {
  --bg: #fafbfc;
  --bg-elev: #ffffff;
  --bg-soft: #f3f4f6;
  --text: #1f2328;
  --text-muted: #59636e;
  --text-dim: #818b98;
  --border: rgba(0,0,0,0.10);
  --accent: #0969da;
  --voice: #0550ae;
  --visual: #1a7f37;
  --screen: #8250df;
  --sfx: #bf3989;
  --cta: #bc4c00;
  --pause: #59636e;
  --source: #0a7b83;
  --shadow: 0 4px 12px rgba(0,0,0,.08);
}
* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  line-height: 1.65;
  font-size: 17px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}
.mono { font-family: ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace; }
.muted { color: var(--text-muted); }
.dim { color: var(--text-dim); }
.small { font-size: 0.82rem; }

/* ---------- Toolbar ---------- */
.toolbar {
  position: sticky; top: 0; z-index: 50;
  background: var(--bg-elev);
  border-bottom: 1px solid var(--border);
  padding: 10px 18px;
  display: flex; gap: 12px; align-items: center; flex-wrap: wrap;
}
.toolbar h1 { margin: 0; font-size: 0.95rem; font-weight: 600; }
.toolbar .spacer { flex: 1; }
.tb-group {
  display: inline-flex; align-items: center; gap: 4px;
  background: var(--bg-soft);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 3px;
}
.tb-btn {
  background: transparent;
  color: var(--text-muted);
  border: 0;
  border-radius: 6px;
  padding: 6px 10px;
  cursor: pointer;
  font-size: 0.82rem;
  font-weight: 500;
  transition: 0.15s;
}
.tb-btn:hover { color: var(--text); background: var(--bg-elev); }
.tb-btn.active {
  background: var(--accent);
  color: #fff;
}
html[data-theme="light"] .tb-btn.active { color: #fff; }
.tb-label {
  font-size: 0.72rem;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-right: 4px;
  font-weight: 600;
}

/* ---------- Contenedor principal ---------- */
.viewport {
  max-width: 920px;
  margin: 0 auto;
  padding: 36px 28px 100px;
}

/* ---------- Header del guion ---------- */
.script-header {
  margin-bottom: 36px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
}
.script-header h1 {
  font-size: 1.85rem;
  margin: 0 0 8px;
  line-height: 1.25;
  font-weight: 700;
}
.script-header .meta-row {
  display: flex; flex-wrap: wrap; gap: 8px 18px;
  margin-top: 12px;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.script-header .meta-row b { color: var(--text); font-weight: 600; }
.script-header .promise {
  margin: 18px 0 0;
  padding: 14px 16px;
  background: var(--bg-elev);
  border-left: 3px solid var(--accent);
  border-radius: 0 8px 8px 0;
  color: var(--text);
  font-style: italic;
}
.script-header .audience {
  margin: 8px 0 0;
  font-size: 0.88rem;
  color: var(--text-muted);
}

/* ---------- Empty state ---------- */
.empty {
  text-align: center;
  padding: 80px 20px;
  color: var(--text-muted);
}
.empty h2 { font-weight: 600; margin: 0 0 8px; color: var(--text); }
.empty code { background: var(--bg-elev); padding: 2px 6px; border-radius: 4px; font-size: 0.85rem; }

/* ============================================================
   ESTILO: BLOQUES
   Cada bloque con tipo, color, header y cuerpo. Default.
   ============================================================ */
.style-bloques .block {
  margin: 14px 0;
  background: var(--bg-elev);
  border: 1px solid var(--border);
  border-left: 4px solid var(--bc);
  border-radius: 8px;
  overflow: hidden;
}
.style-bloques .block-head {
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px;
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-weight: 700;
  color: var(--bc);
}
.style-bloques .block-head .num {
  display: inline-block;
  min-width: 24px;
  height: 22px;
  line-height: 22px;
  text-align: center;
  background: var(--bc);
  color: #fff;
  border-radius: 4px;
  font-size: 0.72rem;
  padding: 0 6px;
}
.style-bloques .block-head .duration {
  margin-left: auto;
  font-weight: 500;
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
  font-size: 0.78rem;
  text-transform: none;
  letter-spacing: 0;
}
.style-bloques .block-body {
  padding: 14px 16px;
  font-size: 1rem;
  line-height: 1.65;
  white-space: pre-wrap;
  word-wrap: break-word;
}
.style-bloques .block-body.voice { font-size: 1.05rem; }
.style-bloques .block-body.source {
  font-size: 0.85rem;
  color: var(--text-muted);
  font-family: ui-monospace, monospace;
}

/* ============================================================
   ESTILO: CINEMATOGRÁFICO
   Tipo de bloque como slug arriba a la derecha, sin cajas.
   Ancho completo, tipografía grande, mucho aire.
   ============================================================ */
.style-cine .block {
  margin: 28px 0;
  position: relative;
  padding: 0 0 0 28px;
  border-left: 2px solid var(--bc);
}
.style-cine .block::before {
  content: attr(data-type-label);
  position: absolute;
  left: 0; top: 0;
  transform: translateX(-100%) translateY(2px);
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-weight: 700;
  color: var(--bc);
  white-space: nowrap;
  padding-right: 18px;
}
.style-cine .block-num {
  font-size: 0.7rem;
  color: var(--text-dim);
  font-family: ui-monospace, monospace;
  margin-right: 8px;
}
.style-cine .block-text {
  font-size: 1.08rem;
  line-height: 1.7;
  white-space: pre-wrap;
}
.style-cine .block-text.voice {
  font-size: 1.22rem;
  line-height: 1.55;
  font-weight: 400;
}
.style-cine .block-text.visual,
.style-cine .block-text.screen,
.style-cine .block-text.sfx,
.style-cine .block-text.pause {
  font-style: italic;
  color: var(--text-muted);
  font-size: 0.95rem;
}
.style-cine .block-text.source {
  font-size: 0.8rem;
  color: var(--text-dim);
  font-family: ui-monospace, monospace;
  font-style: normal;
}
.style-cine .block-text.cta {
  font-size: 1rem;
  color: var(--text);
}
.style-cine .duration-tag {
  display: inline-block;
  margin-left: 10px;
  font-family: ui-monospace, monospace;
  font-size: 0.7rem;
  color: var(--text-dim);
  font-style: normal;
}

/* ============================================================
   ESTILO: DESPEJADO
   Mucho whitespace, solo voz en grande. Visuales como
   notas al pie pequeñas. Sin tipos visibles en el cuerpo.
   ============================================================ */
.style-despejado .block {
  margin: 36px 0;
  text-align: left;
}
.style-despejado .block.voice {
  margin: 40px 0;
}
.style-despejado .block-text {
  font-size: 1.15rem;
  line-height: 1.8;
  max-width: 68ch;
  white-space: pre-wrap;
}
.style-despejado .block.voice .block-text {
  font-size: 1.28rem;
  line-height: 1.65;
  font-weight: 400;
}
.style-despejado .block.visual .block-text,
.style-despejado .block.screen .block-text,
.style-despejado .block.sfx .block-text,
.style-despejado .block.pause .block-text {
  font-size: 0.9rem;
  color: var(--text-muted);
  font-style: italic;
  margin-left: 24px;
  padding-left: 14px;
  border-left: 2px solid var(--border);
  max-width: 60ch;
}
.style-despejado .block.source .block-text {
  font-size: 0.82rem;
  color: var(--text-dim);
  font-family: ui-monospace, monospace;
  margin-left: 24px;
  padding-left: 14px;
  border-left: 2px solid var(--border);
  max-width: 60ch;
}
.style-despejado .block.cta .block-text {
  font-size: 1.08rem;
  color: var(--text);
  margin-top: 32px;
  padding-top: 18px;
  border-top: 1px dashed var(--border);
}

/* ============================================================
   ESTILO: GRABACIÓN / TELEPROMPTER
   Voz en grande, mono, centered. Visuales como acotaciones
   en mayúsculas pequeñas. Pensado para leer en vivo.
   ============================================================ */
.style-grabacion .block {
  margin: 22px 0;
  text-align: center;
}
.style-grabacion .block.voice .block-text {
  font-family: "SF Pro Display", -apple-system, "Segoe UI", sans-serif;
  font-size: 1.5rem;
  line-height: 1.45;
  font-weight: 500;
  max-width: 22ch;
  margin: 0 auto;
  letter-spacing: 0.005em;
}
.style-grabacion .block.visual .block-text,
.style-grabacion .block.screen .block-text,
.style-grabacion .block.sfx .block-text,
.style-grabacion .block.pause .block-text {
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--text-dim);
  font-weight: 600;
  margin: 0 auto;
  max-width: 60ch;
}
.style-grabacion .block.screen .block-text {
  color: var(--screen);
  font-weight: 700;
}
.style-grabacion .block.source .block-text {
  font-size: 0.75rem;
  color: var(--text-dim);
  font-family: ui-monospace, monospace;
  text-align: center;
  max-width: 60ch;
  margin: 0 auto;
}
.style-grabacion .block.cta .block-text {
  font-size: 1.15rem;
  color: var(--cta);
  font-weight: 600;
  max-width: 28ch;
  margin: 32px auto 0;
  padding-top: 20px;
  border-top: 1px solid var(--border);
}

/* ---------- Print-friendly ---------- */
@media print {
  .toolbar { display: none; }
  .viewport { max-width: 100%; padding: 0; }
  body { background: #fff; color: #000; font-size: 12pt; }
  html[data-theme="dark"] body, html[data-theme="light"] body { background: #fff !important; color: #000 !important; }
  .style-bloques .block { border-color: #888 !important; background: #fff !important; }
  .style-bloques .block-head { background: #eee !important; color: #000 !important; }
}

/* ---------- Responsive ---------- */
@media (max-width: 760px) {
  .toolbar { padding: 8px 12px; gap: 6px; }
  .tb-label { display: none; }
  .viewport { padding: 24px 16px 80px; }
  .script-header h1 { font-size: 1.4rem; }
  .style-cine .block { padding-left: 14px; }
  .style-cine .block::before { position: static; transform: none; display: block; margin-bottom: 4px; padding: 0; }
  .style-despejado .block-text { font-size: 1rem; }
  .style-despejado .block.voice .block-text { font-size: 1.1rem; }
  .style-grabacion .block.voice .block-text { font-size: 1.25rem; }
}
`;
  const VISOR_JS = `(function () {
  'use strict';

  // ============================================================
  // Tipos de bloque — labels en español
  // ============================================================
  const TYPE_LABELS = {
    voice:  'Voz',
    visual: 'Visual',
    screen: 'Pantalla',
    sfx:    'SFX',
    pause:  'Pausa',
    cta:    'CTA',
    source: 'Fuente'
  };
  const TYPE_COLORS = {
    voice:  'var(--voice)',
    visual: 'var(--visual)',
    screen: 'var(--screen)',
    sfx:    'var(--sfx)',
    pause:  'var(--pause)',
    cta:    'var(--cta)',
    source: 'var(--source)'
  };

  // ============================================================
  // Estado + persistencia local (solo preferencias, no el guion)
  // ============================================================
  const PREF_KEY = 'yt-script-lab-visor-prefs';
  function loadPrefs() {
    try { return JSON.parse(localStorage.getItem(PREF_KEY) || '{}'); }
    catch (e) { return {}; }
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch (e) {}
  }
  let prefs = loadPrefs();
  let currentStyle = prefs.style || 'bloques';
  let currentTheme = prefs.theme || 'dark';

  // ============================================================
  // Cargar guion: prioridad URL ?data=base64 > localStorage
  // compartido con el editor > embedded window.__SCRIPT__
  // ============================================================
  function loadScript() {
    // 1. URL param ?data=base64(json)
    const params = new URLSearchParams(location.search);
    const dataParam = params.get('data');
    if (dataParam) {
      try {
        const json = JSON.parse(decodeURIComponent(escape(atob(dataParam))));
        return normalizeScript(json);
      } catch (e) {
        console.warn('URL data param inválido:', e);
      }
    }
    // 2. localStorage compartido (editor lo escribe antes de abrir visor)
    try {
      const shared = localStorage.getItem('yt-script-lab-visor-pending');
      if (shared) {
        localStorage.removeItem('yt-script-lab-visor-pending');
        return normalizeScript(JSON.parse(shared));
      }
    } catch (e) {}
    // 3. Embedded
    if (window.__SCRIPT__) return normalizeScript(window.__SCRIPT__);
    return null;
  }

  function normalizeScript(data) {
    if (!data) return null;
    const src = data && data.project && Array.isArray(data.blocks) ? data
              : data && data.state && data.state.project && Array.isArray(data.state.blocks) ? data.state
              : null;
    if (!src) return null;
    return {
      project: src.project,
      blocks: src.blocks.map((b, i) => ({
        id: b.id || ('b' + i),
        type: TYPE_LABELS[b.type] ? b.type : 'voice',
        text: typeof b.text === 'string' ? b.text : '',
        addsTime: !!b.addsTime,
        seconds: Number(b.seconds) || 0
      }))
    };
  }

  // ============================================================
  // Formato de tiempo
  // ============================================================
  function formatTime(sec) {
    sec = Math.max(0, Math.round(sec || 0));
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? \`\${h}:\${String(m).padStart(2,'0')}:\${String(s).padStart(2,'0')}\` : \`\${m}:\${String(s).padStart(2,'0')}\`;
  }

  // ============================================================
  // Cálculo de duración por bloque (espeja model.js blockDuration)
  // ============================================================
  function blockDuration(block, wpm) {
    const wc = (block.text || '').trim().split(/\\s+/).filter(Boolean).length;
    const sec = Number(block.seconds) || 0;
    if (block.type === 'source') return 0;
    if (block.type === 'voice' || block.type === 'cta') return wc > 0 ? (wc / wpm) * 60 : 0;
    if (block.type === 'pause') return sec || 2.5;
    if (block.addsTime) {
      if (block.type === 'visual') return sec || Math.max(3, (wc / 170) * 60);
      if (block.type === 'screen') return sec || Math.max(2, (wc / 200) * 60);
      if (block.type === 'sfx') return sec || 2.2;
    }
    return 0;
  }

  function esc(s) {
    return (s || '').replace(/[&<>"]/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[m]));
  }

  // ============================================================
  // Render principal
  // ============================================================
  function render(script) {
    const root = document.getElementById('viewport');
    if (!script || !script.blocks || !script.blocks.length) {
      root.innerHTML = \`<div class="empty">
        <h2>Sin guion para mostrar</h2>
        <p>Abrí este visor desde el editor con el botón <b>Vista previa</b>, o pasá un JSON via URL:</p>
        <code>visor.html?data=&lt;base64-del-json&gt;</code>
      </div>\`;
      return;
    }

    const p = script.project || {};
    const wpm = Number(p.wpm) || 150;
    let t = 0;
    const blocksWithTime = script.blocks.map(b => {
      const dur = blockDuration(b, wpm);
      const start = t;
      if (dur > 0) t += dur;
      return { ...b, start, duration: dur };
    });
    const totalSec = t;

    // Header
    const headerHtml = \`
      <header class="script-header">
        <h1>\${esc(p.title || 'Guion sin título')}</h1>
        <div class="meta-row">
          <span><b>Formato:</b> \${esc(p.format || '—')}</span>
          <span><b>Género:</b> \${esc(p.genre || '—')}</span>
          <span><b>Duración estimada:</b> \${formatTime(totalSec)}</span>
          <span><b>WPM:</b> \${wpm}</span>
          <span><b>Bloques:</b> \${script.blocks.length}</span>
        </div>
        \${p.promise ? \`<div class="promise"><b>Promesa:</b> \${esc(p.promise)}</div>\` : ''}
        \${p.audience ? \`<div class="audience"><b>Audiencia:</b> \${esc(p.audience)}</div>\` : ''}
      </header>\`;

    // Body — cada estilo decide cómo renderizar cada bloque
    const bodyHtml = renderBlocks(blocksWithTime);

    root.innerHTML = headerHtml + bodyHtml;
    root.className = 'viewport style-' + currentStyle;
    // Aplicar color por tipo a cada bloque
    root.querySelectorAll('.block').forEach(el => {
      const t = el.dataset.type;
      el.style.setProperty('--bc', TYPE_COLORS[t] || 'var(--accent)');
    });
  }

  function renderBlocks(blocks) {
    return blocks.map((b, i) => {
      const label = TYPE_LABELS[b.type] || b.type;
      const num = String(i + 1).padStart(2, '0');
      const durTag = b.duration > 0
        ? \`<span class="duration-tag">[\${formatTime(b.start)} · \${formatTime(b.duration)}]</span>\`
        : (b.type === 'source' ? '' : \`<span class="duration-tag">[\${formatTime(b.start)}]</span>\`);
      return \`
        <article class="block \${b.type}" data-type="\${b.type}" data-type-label="\${label}">
          <div class="block-head">
            <span class="num">\${num}</span>
            <span class="type-label">\${label}</span>
            <span class="duration">\${b.duration > 0 ? formatTime(b.duration) : '—'}</span>
          </div>
          <div class="block-body \${b.type}">
            <div class="block-text \${b.type}">\${esc(b.text || '')}\${durTag}</div>
          </div>
        </article>\`;
    }).join('');
  }

  // ============================================================
  // Aplicar tema y estilo
  // ============================================================
  function applyTheme(theme) {
    currentTheme = theme;
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('#themeGroup .tb-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.theme === theme);
    });
    prefs.theme = theme;
    savePrefs(prefs);
  }

  function applyStyle(style) {
    currentStyle = style;
    const root = document.getElementById('viewport');
    root.className = 'viewport style-' + style;
    document.querySelectorAll('#styleGroup .tb-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.style === style);
    });
    prefs.style = style;
    savePrefs(prefs);
  }

  // ============================================================
  // Init
  // ============================================================
  function init() {
    // Fix: el toolbar tenía un botón duplicado; limpiar
    const themeGroup = document.getElementById('themeGroup');
    if (themeGroup) {
      const btns = themeGroup.querySelectorAll('.tb-btn');
      // Quitar duplicado vacío
      btns.forEach(b => { if (!b.textContent.trim()) b.remove(); });
    }

    // Listeners
    document.querySelectorAll('#styleGroup .tb-btn').forEach(b => {
      b.addEventListener('click', () => applyStyle(b.dataset.style));
    });
    document.querySelectorAll('#themeGroup .tb-btn').forEach(b => {
      b.addEventListener('click', () => applyTheme(b.dataset.theme));
    });

    // Aplicar prefs guardadas
    applyTheme(currentTheme);
    applyStyle(currentStyle);

    // Cargar y renderizar
    const script = loadScript();
    render(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();`;
  return { VISOR_CSS, VISOR_JS };
})();

// Exponer como globales para app.js
window.VISOR_CSS = window.VisorAssets.VISOR_CSS;
window.VISOR_JS = window.VisorAssets.VISOR_JS;
