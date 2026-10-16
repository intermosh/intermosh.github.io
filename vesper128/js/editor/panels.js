/* vesper128 · editor/panels — pestañas Catálogo, Pantalla (gráfica), Audio y Datos. */

import { Store } from './store.js';
import { Preview } from './preview.js';
import { el, clear, field, textInput, numInput, rangeInput, selectInput, checkInput, jsonArea, listArea, btn, iconBtn, colorInput, rgb2hex, hex2rgb, fmt } from './dom.js';
import { Audio } from '../core/audio.js';
import { ICONS } from '../core/framebuffer.js';

const touch = (kind = 'data') => Store.touch(kind);

function section(title, kids, collapsed) {
  const d = collapsed ? el('details', { class: 'sec' }) : el('div', { class: 'sec open' });
  if (collapsed) {
    d.appendChild(el('summary', { text: title }));
  } else {
    d.appendChild(el('h4', { text: title }));
  }
  kids.forEach(k => k && d.appendChild(k));
  return d;
}

/* ================= CATÁLOGO ================= */
export function catalogPanel(root) {
  clear(root);
  const wrap = el('div', { class: 'panel wide' });
  wrap.appendChild(el('h3', { text: 'Catálogo de efectos' }));
  wrap.appendChild(el('p', { class: 'hint', html: 'Leído de <code>data/effects.json</code>. Para agregar un efecto nuevo sin tocar el motor, componelo como <b>macro</b> con primitivas existentes; si hace falta una primitiva nueva, se implementa en <code>js/game/effects.js</code> con <code>define(id, fn)</code> y se declara aquí. El motor ignora con aviso cualquier id que no esté en el catálogo.' }));

  const q = el('input', { type: 'search', placeholder: 'buscar por nombre, id o descripción…' });
  const catSel = selectInput([{ id: '', name: 'todas' }].concat(Store.categories()), '', () => fill());
  q.addEventListener('input', fill);
  wrap.appendChild(el('div', { class: 'row' }, [q, catSel, el('span', { class: 'sp' }), el('span', { class: 'hint', id: 'cat-count' })]));

  const list = el('div', { class: 'catlist' });
  wrap.appendChild(list);
  root.appendChild(wrap);

  function fill() {
    clear(list);
    const s = q.value.toLowerCase(), c = catSel.value;
    let n = 0;
    Store.catalog.effects.forEach(e => {
      if (c && e.category !== c) return;
      if (s && !(e.name + ' ' + e.id + ' ' + (e.description || '')).toLowerCase().includes(s)) return;
      n++;
      const card = el('div', { class: 'card' });
      card.appendChild(el('div', { class: 'chead' }, [
        el('b', { text: e.name }),
        el('code', { text: e.id }),
        el('span', { class: 'tag ' + (e.category || ''), text: (Store.categories().find(k => k.id === e.category) || {}).name || e.category || '—' }),
        e.macro ? el('span', { class: 'tag macro', text: 'macro' }) : null
      ]));
      card.appendChild(el('p', { class: 'cdesc', text: e.description || '' }));
      if (e.macro) card.appendChild(el('div', { class: 'hint', text: 'secuencia: ' + e.macro.map(m => m.effect + (m.params && Object.keys(m.params).length ? ' ' + JSON.stringify(m.params) : '')).join('  →  ') }));
      if ((e.params || []).length) {
        const t = el('table', { class: 'ptab' });
        t.appendChild(el('thead', {}, [el('tr', {}, [el('th', { text: 'parámetro' }), el('th', { text: 'tipo' }), el('th', { text: 'rango / opciones' }), el('th', { text: 'default' })])]));
        const tb = el('tbody');
        e.params.forEach(p => tb.appendChild(el('tr', {}, [
          el('td', { text: (p.label || p.key) + ' (' + p.key + ')' }),
          el('td', { text: (Store.catalog.paramTypes || {})[p.type] || p.type || '—' }),
          el('td', { text: p.options ? p.options.join(' | ') : (p.min != null || p.max != null ? [p.min, p.max].map(v => v == null ? '' : v).join(' … ') + (p.step ? ' (paso ' + p.step + ')' : '') : (p.help || '—')) }),
          el('td', { text: p.default === undefined || p.default === null ? '—' : JSON.stringify(p.default) })
        ])));
        t.appendChild(tb);
        card.appendChild(t);
      }
      if (Store.sel.kind === 'node') {
        card.appendChild(el('div', { class: 'row' }, [btn('＋ agregar al nodo ' + Store.sel.id, () => { Store.addEffectTo(Store.sel.id, e.id); Inspector_render(); })]));
      }
      list.appendChild(card);
    });
    const c2 = wrap.querySelector('#cat-count');
    if (c2) c2.textContent = n + ' efectos';
  }
  function Inspector_render() { Store.notify('sel'); }
  Store.subscribe((w) => { if (w === 'load') fill(); });
  fill();
}

/* ================= PANTALLA / GRÁFICOS ================= */
export function displayPanel(root) {
  clear(root);
  const wrap = el('div', { class: 'panel split' });
  const left = el('div', { class: 'col' });
  const right = el('div', { class: 'col preview-col' });
  wrap.append(left, right);
  root.appendChild(wrap);

  const disp = () => Store.get('display', {});

  /* --- resolución y fuente --- */
  const res = disp().resolution || [512, 342];
  left.appendChild(section('Pantalla', [
    field('resolución', el('div', { class: 'row2' }, [
      numInput(res[0], (v) => { Store.set('display.resolution.0', v || 512); Preview.apply(); touch('display'); }, { min: 160, max: 1280, step: 2 }),
      numInput(res[1], (v) => { Store.set('display.resolution.1', v || 342); Preview.apply(); touch('display'); }, { min: 120, max: 1024, step: 2 })
    ]), '512 × 342 es la resolución del Macintosh 128K/512K'),
    field('escalado', selectInput([{ id: 'fill', name: 'ocupa todo el espacio' }, { id: 'integer', name: 'entero, centrado' }], disp().scaleMode || 'fill', (v) => { Store.set('display.scaleMode', v); touch('display'); })),
    field('logo del menú', selectInput(Object.keys(ICONS), disp().logo || 'logo', (v) => { Store.set('display.logo', v); touch('display'); }))
  ]));

  const f = disp().font || {};
  left.appendChild(section('Tipografía', [
    field('cuerpo (px)', numInput(f.size, (v) => { Store.set('display.font.size', v); Preview.apply(); touch('display'); }, { min: 6, max: 24 })),
    field('avance (px)', numInput(f.advance, (v) => { Store.set('display.font.advance', v); Preview.apply(); touch('display'); }, { min: 4, max: 20 })),
    field('interlínea (px)', numInput(f.lineHeight, (v) => { Store.set('display.font.lineHeight', v); Preview.apply(); touch('display'); }, { min: 6, max: 30 })),
    field('umbral de trazo', numInput(f.threshold, (v) => { Store.set('display.font.threshold', v); Preview.apply(); touch('display'); }, { min: 1, max: 255 })),
    field('peso', selectInput(['normal', 'bold', '600', '900'], f.weight || 'bold', (v) => { Store.set('display.font.weight', v); Preview.apply(); touch('display'); })),
    field('familias', textInput(f.stack, (v) => { Store.set('display.font.stack', v); Preview.apply(); touch('display'); }))
  ], true));

  /* --- paleta por actos --- */
  const acts = Store.get('display.palette.acts', []);
  const palKids = [];
  acts.forEach((a, i) => {
    const row = el('div', { class: 'act' });
    row.appendChild(el('div', { class: 'ahead' }, [
      el('b', { text: 'acto ' + (i + 1) }),
      el('span', { class: 'hint', text: 'tensión ≥ ' + fmt(a.t) }),
      el('span', { class: 'sp' }),
      iconBtn('✕', () => { acts.splice(i, 1); touch('display'); displayPanel(root); })
    ]));
    row.appendChild(field('t', rangeInput(a.t, (v) => { a.t = v; touch('display'); }, { min: 0, max: 1, step: 0.01 })));
    row.appendChild(field('papel', colorInput(a.paper, (v) => { a.paper = v; touch('display'); })));
    row.appendChild(field('tinta', colorInput(a.ink, (v) => { a.ink = v; touch('display'); })));
    row.appendChild(field('contraste', rangeInput(a.contrast, (v) => { a.contrast = v; touch('display'); }, { min: 0.4, max: 1.6, step: 0.01 })));
    row.appendChild(field('velo (lift)', rangeInput(a.lift, (v) => { a.lift = v; touch('display'); }, { min: 0, max: 0.3, step: 0.005 })));
    palKids.push(row);
  });
  palKids.push(btn('＋ acto', () => { acts.push({ t: 1, paper: [176, 190, 206], ink: [26, 27, 30], contrast: 0.9, lift: 0.075 }); touch('display'); displayPanel(root); }));
  palKids.push(el('p', { class: 'hint', text: 'La paleta se interpola con la tensión: el fósforo pasa de ámbar cálido a frío lavado. Cuatro actos alcanzan; cada uno declara a partir de qué tensión pesa.' }));
  left.appendChild(section('Paleta por actos de tensión', palKids, true));

  /* --- CRT --- */
  const c = Store.get('display.crt', {});
  const curvPx = () => ((c.curvature || 0) * 0.02 * ((disp().resolution || [512, 342])[0] / 2)).toFixed(2);
  const crtKids = [
    field('curvatura', rangeInput(c.curvature, (v) => { Store.set('display.crt.curvature', v); Preview.configureCRT(); touch('display'); const s = root.querySelector('#curv-px'); if (s) s.textContent = '≈ ' + ((v * 0.02 * ((disp().resolution || [512, 342])[0] / 2)).toFixed(2)) + ' px de comba'; }, { min: 0, max: 1, step: 0.005 }), '0 = plano. Con 0,14 la imagen se comba ≈ ' + curvPx() + ' px: apenas perceptible.'),
    el('div', { class: 'hint', id: 'curv-px', text: '≈ ' + curvPx() + ' px de comba' }),
    field('líneas de barrido', rangeInput(c.scanlines, (v) => { Store.set('display.crt.scanlines', v); Preview.configureCRT(); touch('display'); }, { min: 0, max: 0.6, step: 0.01 })),
    field('viñeta', rangeInput(c.vignette, (v) => { Store.set('display.crt.vignette', v); Preview.configureCRT(); touch('display'); }, { min: 0, max: 1, step: 0.01 })),
    field('bloom (halo)', rangeInput(c.bloom, (v) => { Store.set('display.crt.bloom', v); Preview.configureCRT(); touch('display'); }, { min: 0, max: 0.3, step: 0.005 })),
    field('rodadura', rangeInput(c.roll, (v) => { Store.set('display.crt.roll', v); Preview.configureCRT(); touch('display'); }, { min: 0, max: 1, step: 0.01 })),
    field('parpadeo base', rangeInput(c.flickerBase, (v) => { Store.set('display.crt.flickerBase', v); touch('display'); }, { min: 0, max: 0.08, step: 0.001 })),
    field('parpadeo a tensión 1', rangeInput(c.flickerTension, (v) => { Store.set('display.crt.flickerTension', v); touch('display'); }, { min: 0, max: 0.15, step: 0.001 })),
    field('ruido máximo', rangeInput(c.noiseMax, (v) => { Store.set('display.crt.noiseMax', v); touch('display'); }, { min: 0, max: 0.4, step: 0.005 })),
    field('glitch desde tensión', rangeInput(c.glitchAbove, (v) => { Store.set('display.crt.glitchAbove', v); touch('display'); }, { min: 0, max: 1, step: 0.01 })),
    field('glitch intensidad', rangeInput(c.glitchAmount, (v) => { Store.set('display.crt.glitchAmount', v); touch('display'); }, { min: 0, max: 1, step: 0.01 })),
    field('color del halo', (() => { const w = el('div', { class: 'color' }); const i = el('input', { type: 'color', value: c.glow || '#e2dece' }); i.addEventListener('input', () => { Store.set('display.crt.glow', i.value); Preview.configureCRT(); touch('display'); }); w.append(i, el('span', { class: 'val', text: c.glow || '#e2dece' })); return w; })()),
    el('p', { class: 'hint', text: 'Regla de seguridad: mantener el parpadeo por debajo de 0,05 y lejos de la banda 12-30 Hz (Harding & Harding 1999). El modo reducido del arranque lo multiplica por 0,3.' })
  ];
  left.appendChild(section('Tubo (CRT)', crtKids));

  /* --- sprites --- */
  left.appendChild(spriteSection());

  /* --- vista previa --- */
  right.appendChild(el('h4', { text: 'Vista previa' }));
  const host = el('div', { id: 'preview-host' });
  const stage = el('div', { id: 'stage', class: 'preview-stage' }, [
    el('canvas', { id: 'view' }),
    el('canvas', { id: 'bloom', class: 'layer' }),
    el('div', { id: 'roll', class: 'layer' }),
    el('div', { id: 'vignette', class: 'layer' }),
    el('div', { id: 'glass', class: 'layer' })
  ]);
  host.appendChild(stage);
  right.appendChild(host);
  right.appendChild(field('tensión de prueba', rangeInput(Preview.tension, (v) => { Preview.tension = v; }, { min: 0, max: 1, step: 0.01 })));
  right.appendChild(checkInput(Preview.showWindow, (v) => { Preview.showWindow = v; }, 'mostrar ventana de ejemplo'));
  right.appendChild(el('p', { class: 'hint', text: 'Es el framebuffer real del motor: misma fuente, misma paleta, misma curvatura y mismas capas de tubo que en index.html.' }));
  Preview.init(stage);
}

function spriteSection() {
  const names = Array.from(new Set(Object.keys(ICONS).concat(Object.keys(Store.get('sprites', {}) || {}))));
  const box = el('div', { class: 'sec open' });
  box.appendChild(el('h4', { text: 'Sprites (1-bit, 32 × 32)' }));
  box.appendChild(el('p', { class: 'hint', text: 'Los originales viven en js/core/icons.js; al editar se copia una versión propia a game.json (clave "sprites") que el motor carga por encima.' }));

  let current = names[0];
  const sel = selectInput(names, current, (v) => { current = v; mount(); });
  const selRow = el('div', { class: 'row' }, [sel, el('span', { class: 'sp' })]);
  box.appendChild(selRow);

  const host = el('div', { class: 'sprite-host' });
  box.appendChild(host);

  let shade = '#';
  const shades = [['#', 'tinta'], ['o', 'papel'], ['%', 'trama 50'], ['l', 'trama 75'], ['d', 'trama 25'], ['.', 'borrar']];
  const shadeRow = el('div', { class: 'row shades' });
  shades.forEach(([ch, lab]) => {
    const b = el('button', { class: 'shade' + (ch === shade ? ' on' : ''), text: lab, onclick: () => { shade = ch; Array.from(shadeRow.children).forEach(k => k.classList.remove('on')); b.classList.add('on'); } });
    shadeRow.appendChild(b);
  });
  box.appendChild(shadeRow);

  const canvas = el('canvas', { class: 'sprite-canvas', width: 32 * 7, height: 32 * 7 });
  const ctx = canvas.getContext('2d');
  let rows = [];
  let painting = false;

  function loadRows() {
    const custom = Store.get('sprites', {}) || {};
    const src = custom[current] || ICONS[current] || [];
    rows = [];
    for (let j = 0; j < 32; j++) {
      const r = src[j] || '';
      rows.push((r + '................................').slice(0, 32));
    }
  }
  function drawGrid() {
    ctx.fillStyle = '#15151b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (let j = 0; j < 32; j++) for (let i = 0; i < 32; i++) {
      const c = rows[j][i];
      let col = '#20202a';
      if (c === '#') col = '#e6e1d6';
      else if (c === 'o') col = '#0b0b0d';
      else if (c === '%') col = '#8b8779';
      else if (c === 'l') col = '#b9b4a6';
      else if (c === 'd') col = '#5a5850';
      ctx.fillStyle = col;
      ctx.fillRect(i * 7 + 1, j * 7 + 1, 5, 5);
    }
    ctx.strokeStyle = '#26262f'; ctx.lineWidth = 1;
    for (let k = 0; k <= 32; k += 4) {
      ctx.beginPath(); ctx.moveTo(k * 7 + 0.5, 0); ctx.lineTo(k * 7 + 0.5, 224); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, k * 7 + 0.5); ctx.lineTo(224, k * 7 + 0.5); ctx.stroke();
    }
  }
  function paint(ev) {
    const r = canvas.getBoundingClientRect();
    const i = Math.floor((ev.clientX - r.left) / (r.width / 32));
    const j = Math.floor((ev.clientY - r.top) / (r.height / 32));
    if (i < 0 || j < 0 || i > 31 || j > 31) return;
    const arr = rows[j].split('');
    arr[i] = shade;
    rows[j] = arr.join('');
    drawGrid();
    save();
  }
  function save() {
    const sp = Store.get('sprites', null) || {};
    sp[current] = rows;
    Store.set('sprites', sp, true);
    Preview.apply();
    touch('sprites');
  }
  canvas.addEventListener('mousedown', (e) => { painting = true; paint(e); });
  window.addEventListener('mousemove', (e) => { if (painting) paint(e); });
  window.addEventListener('mouseup', () => { painting = false; });

  const actions = el('div', { class: 'row' }, [
    btn('limpiar', () => { rows = rows.map(() => '................................'); drawGrid(); save(); }),
    btn('restaurar original', () => { const sp = Store.get('sprites', {}) || {}; delete sp[current]; Store.set('sprites', sp, true); loadRows(); drawGrid(); Preview.apply(); touch('sprites'); }),
    btn('espejar', () => { rows = rows.map(r => r.split('').reverse().join('')); drawGrid(); save(); })
  ]);
  box.appendChild(actions);

  function mount() { loadRows(); drawGrid(); }
  host.appendChild(canvas);
  mount();
  return box;
}

/* ================= AUDIO ================= */
export function audioPanel(root) {
  clear(root);
  const wrap = el('div', { class: 'panel' });
  wrap.appendChild(el('h3', { text: 'Audio' }));
  wrap.appendChild(el('p', { class: 'hint', text: 'Todo el sonido se genera por síntesis (sin muestras). Las capas se mezclan según la tensión: cada una declara su ganancia inicial y final, y a partir de qué tensión entra.' }));

  const start = () => { Audio.configure(Store.get('audio', {})); Audio.init(); };

  wrap.appendChild(section('Mezcla', [
    field('volumen general', rangeInput(Store.get('audio.master', 0.85), (v) => { Store.set('audio.master', v); start(); Audio.duck(v, 0.3); touch('audio'); }, { min: 0, max: 1, step: 0.01 })),
    field('tensión de prueba', rangeInput(0, (v) => { start(); Audio.mix(v); }, { min: 0, max: 1, step: 0.01 })),
    el('div', { class: 'row' }, [
      btn('▶ iniciar audio', () => start()),
      btn('clic', () => { start(); Audio.click(true); }),
      btn('blip', () => { start(); Audio.blip(880, 0.05, 0.07); }),
      btn('alerta', () => { start(); Audio.alert(2); }),
      btn('relé', () => { start(); Audio.relay(); }),
      btn('disco (leer)', () => { start(); Audio.disk('read', 1.2); }),
      btn('disco (moler)', () => { start(); Audio.disk('grind', 1.6); }),
      btn('golpe', () => { start(); Audio.knock(160, 0.5, 0.2); }),
      btn('respiración', () => { start(); Audio.breath(6, 0.05); }),
      btn('portazo', () => { start(); Audio.slam(); }),
      btn('campana', () => { start(); Audio.chime(); }),
      btn('señal 18,97', () => { start(); Audio.playSignal(9); })
    ])
  ]));

  const layers = Store.get('audio.layers', {}) || {};
  Object.keys(layers).forEach(k => {
    const L = layers[k];
    const kids = [];
    if (Array.isArray(L.gain)) {
      kids.push(field('ganancia inicio', rangeInput(L.gain[0], (v) => { L.gain[0] = v; start(); touch('audio'); }, { min: 0, max: 0.5, step: 0.001 })));
      kids.push(field('ganancia final', rangeInput(L.gain[1], (v) => { L.gain[1] = v; start(); touch('audio'); }, { min: 0, max: 0.5, step: 0.001 })));
    }
    if (L.start != null) kids.push(field('entra a tensión', rangeInput(L.start, (v) => { L.start = v; start(); touch('audio'); }, { min: 0, max: 1, step: 0.01 })));
    if (Array.isArray(L.freqs)) kids.push(field('frecuencias (Hz)', listArea(L.freqs, (v) => { L.freqs = v.map(Number); start(); touch('audio'); }), 'una por línea'));
    if (L.freq != null) kids.push(field('frecuencia (Hz)', numInput(L.freq, (v) => { L.freq = v; start(); touch('audio'); }, { min: 0, max: 20000, step: 0.01 })));
    if (L.drift != null) kids.push(field('deriva (Hz)', numInput(L.drift, (v) => { L.drift = v; start(); touch('audio'); }, { min: 0, max: 5000 })));
    if (Array.isArray(L.filter)) {
      kids.push(field('filtro inicio (Hz)', numInput(L.filter[0], (v) => { L.filter[0] = v; start(); touch('audio'); }, { min: 20, max: 8000 })));
      kids.push(field('filtro final (Hz)', numInput(L.filter[1], (v) => { L.filter[1] = v; start(); touch('audio'); }, { min: 20, max: 12000 })));
    }
    if (Array.isArray(L.formants)) kids.push(field('formantes', listArea(L.formants, (v) => { L.formants = v.map(Number); start(); touch('audio'); })));
    if (L.harmonic) kids.push(field('armónico', jsonArea(L.harmonic, (v) => { L.harmonic = v; start(); touch('audio'); }, 3)));
    kids.push(el('div', { class: 'row' }, [btn('JSON de la capa', () => { Store.set('audio.layers.' + k, JSON.parse(prompt('JSON de la capa ' + k, JSON.stringify(L)) || JSON.stringify(L))); audioPanel(root); })]));
    wrap.appendChild(section(k, kids, true));
  });
  root.appendChild(wrap);
}

/* ================= DATOS ================= */
const SECTIONS = [
  { path: 'meta', label: 'meta (nombre, versión, título)', rows: 4 },
  { path: 'runtime', label: 'runtime (narrativa / efectos activos)', rows: 4 },
  { path: 'clock', label: 'clock (reloj diegético)', rows: 5 },
  { path: 'ui', label: 'ui (cierre que falla, deriva de punteo)', rows: 6 },
  { path: 'desktop', label: 'desktop', rows: 3 },
  { path: 'boot.warn', label: 'boot.warn (advertencia de fotosensibilidad)', rows: 8 },
  { path: 'boot.post', label: 'boot.post (líneas de arranque)', rows: 10 },
  { path: 'boot.happy', label: 'boot.happy (arranque gráfico)', rows: 5 },
  { path: 'boot.post2', label: 'boot.post2 (segundo arranque)', rows: 10 },
  { path: 'fs', label: 'fs (árbol de archivos y escritorio)', rows: 16 },
  { path: 'docs', label: 'docs (textos)', rows: 16 },
  { path: 'sounds', label: 'sounds (registros)', rows: 10 },
  { path: 'apps', label: 'apps (oyente, registro en vivo, acerca de)', rows: 14 },
  { path: 'menus', label: 'menus (barra de menú y extras)', rows: 14 },
  { path: 'dialogs', label: 'dialogs (avisos, no solicitados)', rows: 14 },
  { path: 'subliminal', label: 'subliminal (palabras de destello)', rows: 5 },
  { path: 'anomalies', label: 'anomalies (pool ambiental)', rows: 14 },
  { path: 'ending', label: 'ending', rows: 6 },
  { path: 'story.nodes', label: 'story.nodes (JSON en bruto)', rows: 16 },
  { path: 'story.edges', label: 'story.edges (JSON en bruto)', rows: 10 },
  { path: 'sprites', label: 'sprites (propios del editor)', rows: 8 }
];

export function dataPanel(root) {
  clear(root);
  const wrap = el('div', { class: 'panel wide' });
  wrap.appendChild(el('h3', { text: 'Datos' }));
  wrap.appendChild(el('p', { class: 'hint', text: 'Todo el contenido del juego vive en este único archivo. Editar aquí es equivalente a editar el JSON a mano, con validación al aplicar. Los cambios en story.nodes se reflejan en el grafo al aplicar.' }));
  wrap.appendChild(el('div', { class: 'row' }, [
    btn('Exportar game.json', () => Store.save()),
    btn('Recargar desde disco', async () => { try { await Store.loadDefault(); } catch (e) { Store.error = e.message; Store.notify('error'); } })
  ]));

  SECTIONS.forEach(s => {
    const d = el('details', { class: 'sec jsonsec' });
    d.appendChild(el('summary', {}, [el('span', { text: s.label }), el('code', { text: s.path })]));
    const area = jsonArea(Store.get(s.path, null), (v) => {
      Store.set(s.path, v);
      Store.ensureIds();
      Store.notify('load');
    }, s.rows);
    d.appendChild(area);
    d.addEventListener('toggle', () => { if (d.open) { const ta = area.querySelector('textarea'); if (ta) ta.value = JSON.stringify(Store.get(s.path, null), null, 2); } });
    wrap.appendChild(d);
  });
  root.appendChild(wrap);
}
