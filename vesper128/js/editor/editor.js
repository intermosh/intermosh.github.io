/* vesper128 · editor/editor — entrada del editor: pestañas, barra de herramientas,
   carga/guardado del único game.json compartido con el juego, y validación. */

import { Store, validate } from './store.js';
import { Graph } from './graph.js';
import { Inspector, mountDatalists } from './inspector.js';
import { catalogPanel, displayPanel, audioPanel, dataPanel } from './panels.js';
import { Preview } from './preview.js';

window.__GRAPH__ = Graph;
window.__STORE__ = Store;

const PANELS = {
  grafo: null,
  catalogo: catalogPanel,
  pantalla: displayPanel,
  audio: audioPanel,
  datos: dataPanel
};
const built = new Set();

/* ---------------- pestañas ---------------- */
function showTab(name) {
  Store.tab = name;
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('.tab').forEach(s => s.classList.toggle('on', s.id === 'tab-' + name));
  const host = document.getElementById('tab-' + name);
  if (name === 'grafo') { Graph.resize(); return; }
  if (PANELS[name] && (!built.has(name) || name === 'pantalla')) { PANELS[name](host); built.add(name); }
  if (name === 'pantalla' && !Preview.stage) { /* init ocurre dentro del panel */ }
}

function renderCurrent() {
  const name = Store.tab;
  if (name === 'grafo') return;
  const host = document.getElementById('tab-' + name);
  if (host && PANELS[name]) PANELS[name](host);
}

/* ---------------- estado / validación ---------------- */
function updateStatus() {
  const st = document.getElementById('state');
  const msg = document.getElementById('status-msg');
  if (st) st.textContent = (Store.dirty ? '● sin guardar' : '○ guardado') + ' · ' + Store.fileName;
  if (msg) msg.textContent = Store.error ? 'error: ' + Store.error
    : Store.nodes().length + ' nodos · ' + Store.edges().length + ' aristas · ' + Store.catalog.effects.length + ' efectos en catálogo';
}

function showIssues() {
  const issues = validate(Store);
  const box = document.getElementById('issues');
  box.innerHTML = '';
  const counts = { error: 0, warn: 0, info: 0 };
  issues.forEach(i => counts[i.level]++);
  const head = document.createElement('div');
  head.className = 'ihead';
  head.innerHTML = '<b>Validación</b> <span class="tag error">' + counts.error + ' errores</span> ' +
    '<span class="tag warn">' + counts.warn + ' avisos</span> <span class="tag info">' + counts.info + ' notas</span>';
  box.appendChild(head);
  if (!issues.length) box.appendChild(document.createTextNode('Sin observaciones.'));
  issues.forEach(i => {
    const d = document.createElement('div');
    d.className = 'issue ' + i.level;
    d.textContent = (i.level === 'error' ? '✕ ' : i.level === 'warn' ? '! ' : '· ') + i.msg;
    box.appendChild(d);
  });
  document.getElementById('issues-drawer').classList.add('on');
  const c = document.getElementById('status-issues');
  if (c) c.textContent = counts.error ? counts.error + ' errores' : (counts.warn ? counts.warn + ' avisos' : 'sin problemas');
  c.className = counts.error ? 'bad' : (counts.warn ? 'mid' : 'good');
}

/* ---------------- arranque ---------------- */
async function boot() {
  mountDatalists(document.getElementById('datalists'));
  Graph.init(document.getElementById('graph'));
  Inspector.init(document.getElementById('inspector'));

  document.querySelectorAll('#tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));

  const fileInput = document.getElementById('file');
  document.getElementById('b-load').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => { if (fileInput.files[0]) { Store.loadFile(fileInput.files[0]); fileInput.value = ''; } });
  document.getElementById('b-save').addEventListener('click', () => Store.save());
  document.getElementById('b-validate').addEventListener('click', showIssues);
  document.getElementById('b-play').addEventListener('click', () => window.open('index.html', '_blank'));
  document.getElementById('b-fit').addEventListener('click', () => Graph.fit());
  document.getElementById('b-layout').addEventListener('click', () => Graph.autoLayout());
  document.getElementById('b-node').addEventListener('click', () => { const r = document.getElementById('graph').getBoundingClientRect(); const w = Graph.toWorld(r.width / 2, r.height / 2); Graph.addNodeHere(w.x, w.y); });
  document.getElementById('issues-close').addEventListener('click', () => document.getElementById('issues-drawer').classList.remove('on'));

  window.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); Store.save(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'o') { e.preventDefault(); fileInput.click(); }
  });
  window.addEventListener('beforeunload', (e) => { if (Store.dirty) { e.preventDefault(); e.returnValue = ''; } });

  Store.subscribe((what) => {
    updateStatus();
    if (what === 'load') { renderCurrent(); Graph.needsDraw = true; }
  });

  try {
    await Store.loadCatalog('data/effects.json');
  } catch (e) {
    Store.error = 'no se pudo leer data/effects.json: ' + e.message;
  }
  try {
    await Store.loadDefault('data/game.json');
  } catch (e) {
    Store.error = 'no se pudo leer data/game.json: ' + e.message;
  }

  const v = document.getElementById('ver');
  if (v) v.textContent = (Store.get('meta.workingName', 'vesper128') + ' v' + Store.get('meta.version', '0.0.1'));
  updateStatus();
  Graph.fit();
  showTab('grafo');
  if (Store.error) showIssues();
}

boot();
