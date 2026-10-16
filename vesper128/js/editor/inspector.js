/* vesper128 · editor/inspector — panel lateral reactivo: propiedades del nodo o
   arista seleccionada, condiciones y efectos con sus parámetros (esquemas del
   catálogo externo). Todo cambio escribe en Store y notifica. */

import { Store } from './store.js';
import { ICONS } from '../core/framebuffer.js';
import { el, clear, field, textInput, numInput, rangeInput, fmt, selectInput, checkInput, jsonArea, listArea, btn, iconBtn } from './dom.js';

/* ---------------- listas conocidas ---------------- */
function fsPaths() { return Object.keys(Store.fsNodes()); }
function spriteNames() {
  const base = Object.keys(ICONS || {});
  const custom = Object.keys(Store.get('sprites', {}) || {});
  return Array.from(new Set(base.concat(custom)));
}
function knownFlags() {
  const set = new Set();
  const walk = (list) => (list || []).forEach(i => {
    if (!i) return;
    if (i.effect === 'flag' && i.params && i.params.name) set.add(i.params.name);
    if (i.params && Array.isArray(i.params.onButton)) i.params.onButton.forEach(b => { if (b.effect === 'flag' && b.params && b.params.name) set.add(b.params.name); if (b.effects) walk(b.effects); });
  });
  Store.nodes().forEach(n => walk(n.effects));
  (Store.get('menus.base', []) || []).concat(Store.get('menus.extra', []) || []).forEach(m => (m.items || []).forEach(it => it && it.effects && walk(it.effects)));
  (Store.get('anomalies.pool', []) || []).forEach(a => walk([{ effect: a.effect, params: a.params }]));
  return Array.from(set).sort();
}

/* ================= inspector ================= */
export const Inspector = {
  root: null,
  init(root) {
    this.root = root;
    Store.subscribe((what) => { if (what === 'sel' || what === 'load') this.render(); if (what === 'graph') this.renderSoft(); });
    this.render();
  },
  renderSoft() {
    // el grafo cambió (posiciones): sólo actualizar contadores si no hay foco activo
    const a = document.activeElement;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT')) return;
    this.render();
  },
  render() {
    if (!this.root) return;
    clear(this.root);
    if (Store.sel.kind === 'node') this.root.appendChild(this.nodePanel(Store.node(Store.sel.id)));
    else if (Store.sel.kind === 'edge') this.root.appendChild(this.edgePanel(Store.edge(Store.sel.id)));
    else this.root.appendChild(this.emptyPanel());
  },

  /* -------- sin selección -------- */
  emptyPanel() {
    const ns = Store.nodes(), es = Store.edges();
    const p = el('div', { class: 'panel' });
    p.appendChild(el('h3', { text: 'Grafo de descubrimientos' }));
    p.appendChild(el('p', { class: 'hint', text: 'Cada nodo se activa cuando su disparador ocurre y alguna arista entrante está satisfecha (origen descubierto + condiciones). Al activarse ejecuta sus efectos en orden y queda descubierto: eso habilita las ramas siguientes.' }));
    const stats = el('div', { class: 'stats' });
    stats.append(
      el('div', {}, [el('b', { text: String(ns.length) }), el('span', { text: ' nodos' })]),
      el('div', {}, [el('b', { text: String(es.length) }), el('span', { text: ' aristas' })]),
      el('div', {}, [el('b', { text: String(ns.filter(n => (n.trigger || {}).type === 'start').length) }), el('span', { text: ' arranques' })]),
      el('div', {}, [el('b', { text: String(new Set(ns.flatMap(n => (n.effects || []).map(e => e.effect))).size) }), el('span', { text: ' efectos distintos' })])
    );
    p.appendChild(stats);
    p.appendChild(el('div', { class: 'row' }, [
      btn('＋ Nodo nuevo', () => { const n = Store.addNode(80, 80); Store.notify('sel'); }),
      btn('Auto-ordenar', () => window.__GRAPH__ && window.__GRAPH__.autoLayout()),
      btn('Encuadrar', () => window.__GRAPH__ && window.__GRAPH__.fit())
    ]));
    p.appendChild(el('h4', { text: 'Atajos' }));
    p.appendChild(el('ul', { class: 'keys' }, [
      el('li', { text: 'N — nodo nuevo en el centro' }),
      el('li', { text: 'F — encuadrar todo' }),
      el('li', { text: 'Supr — borrar selección' }),
      el('li', { text: 'Doble clic en el fondo — nodo nuevo' }),
      el('li', { text: 'Arrastrar del puerto derecho — conectar' }),
      el('li', { text: 'Shift + arrastrar — mover el lienzo' })
    ]));
    return p;
  },

  /* -------- nodo -------- */
  nodePanel(n) {
    if (!n) return this.emptyPanel();
    const p = el('div', { class: 'panel' });
    p.appendChild(el('div', { class: 'phead' }, [
      el('h3', { text: 'Nodo' }),
      el('div', { class: 'row' }, [
        iconBtn('⧉', () => { const c = JSON.parse(JSON.stringify(n)); c.id = Store.uniqueId('n'); c.label = n.label + ' (copia)'; c.x += 30; c.y += 30; Store.nodes().push(c); Store.select('node', c.id); Store.touch('graph'); }, 'duplicar'),
        iconBtn('✕', () => Store.removeNode(n.id), 'eliminar nodo')
      ])
    ]));

    const idIn = textInput(n.id, (v) => {
      const old = n.id;
      if (!v || Store.nodes().some(x => x !== n && x.id === v)) return;
      n.id = v;
      Store.edges().forEach(e => { if (e.from === old) e.from = v; if (e.to === old) e.to = v; });
      Store.sel.id = v; Store.touch('graph');
    });
    p.appendChild(field('id', idIn));
    const labelIn = textInput(n.label, (v) => { n.label = v; Store.notify('graph'); });
    labelIn.id = 'ins-label';
    p.appendChild(field('etiqueta', labelIn));
    p.appendChild(field('tipo', selectInput(['start', 'event', 'auto'], n.type || (n.trigger || {}).type, (v) => {
      n.type = v;
      n.trigger = Object.assign({ type: v === 'event' ? 'event' : v }, n.trigger || {});
      n.trigger.type = v === 'event' ? 'event' : v;
      Store.touch('graph');
    })));
    p.appendChild(field('repetible', el('div', { class: 'row' }, [
      checkInput(n.repeat, (v) => { if (v) n.repeat = true; else delete n.repeat; Store.touch('graph'); this.render(); }, 'se re-dispara'),
      numInput(n.cooldown || 6000, (v) => { n.cooldown = v; Store.touch('graph'); }, { min: 0, step: 500 }),
      el('span', { class: 'hint', text: 'ms de espera' })
    ]), 'para avisos que deben volver a salir (clave, bloqueos)'));
    p.appendChild(field('posición', el('div', { class: 'row2' }, [
      numInput(n.x, (v) => { n.x = v || 0; Store.notify('graph'); }),
      numInput(n.y, (v) => { n.y = v || 0; Store.notify('graph'); })
    ])));

    p.appendChild(this.triggerPanel(n));
    p.appendChild(this.conditionsPanel(n, 'conditions', () => Store.touch('graph')));
    p.appendChild(this.effectsPanel(n));
    return p;
  },

  triggerPanel(n) {
    const box = el('div', { class: 'sec' });
    box.appendChild(el('h4', { text: 'Disparador' }));
    const trig = n.trigger || (n.trigger = { type: 'auto' });
    const kinds = (Store.catalog.triggers || []).map(t => t.id);
    const opts = kinds.length ? kinds : ['start', 'auto', 'event', 'idle'];
    box.appendChild(field('tipo', selectInput(opts, trig.type, (v) => { trig.type = v; Store.touch('graph'); })));
    if (trig.type === 'event') {
      const evs = (Store.catalog.events || []).map(e => e.id);
      box.appendChild(field('evento', evs.length ? selectInput(evs, trig.event, (v) => { trig.event = v; Store.touch('graph'); })
        : textInput(trig.event, (v) => { trig.event = v; Store.touch('graph'); })));
      const ev = (Store.catalog.events || []).find(e => e.id === trig.event);
      if (ev) box.appendChild(el('div', { class: 'hint', text: 'payload: ' + ev.payload + ' — ' + ev.desc }));
      box.appendChild(field('filtro (match)', jsonArea(trig.match || {}, (v) => { trig.match = v; Store.touch('graph'); }, 4),
        'clave: valor exacto, o clave: { "op": ">=", "value": 4 }'));
    } else if (trig.type === 'idle') {
      box.appendChild(field('ms de inacción', numInput(trig.ms || 26000, (v) => { trig.ms = v; Store.touch('graph'); }, { min: 1000, step: 1000 })));
    } else if (trig.type === 'auto') {
      box.appendChild(el('div', { class: 'hint', text: 'Se evalúa cada cuadro: se activa en cuanto se cumplen sus condiciones y hay una arista entrante satisfecha.' }));
    } else if (trig.type === 'start') {
      box.appendChild(el('div', { class: 'hint', text: 'Se activa una sola vez, cuando aparece el escritorio.' }));
    }
    return box;
  },

  conditionsPanel(owner, key, after) {
    const box = el('div', { class: 'sec' });
    const list = owner[key] || (owner[key] = []);
    box.appendChild(el('div', { class: 'shead' }, [
      el('h4', { text: 'Condiciones (' + list.length + ')' }),
      btn('＋', () => { list.push({ kind: 'flag', name: '' }); after(); this.render(); })
    ]));
    if (!list.length) box.appendChild(el('div', { class: 'hint', text: 'Sin condiciones: siempre verdaderas.' }));
    list.forEach((c, i) => {
      const row = el('div', { class: 'cond' });
      const kinds = (Store.catalog.conditions || []).map(k => k.kind);
      row.appendChild(selectInput(kinds.length ? kinds : ['flag', 'tension', 'time', 'node', 'always', 'never'], c.kind, (v) => { c.kind = v; delete c.op; delete c.value; delete c.name; delete c.node; after(); this.render(); }));
      if (c.kind === 'flag') {
        const flags = knownFlags();
        const t = textInput(c.name, (v) => { c.name = v; after(); });
        if (flags.length) t.setAttribute('list', 'dl-flags');
        row.appendChild(t);
        row.appendChild(checkInput(c.negate, (v) => { c.negate = v; after(); }, 'no'));
      } else if (c.kind === 'node') {
        row.appendChild(selectInput(Store.nodes().map(n => n.id), c.node, (v) => { c.node = v; after(); }));
        row.appendChild(checkInput(c.negate, (v) => { c.negate = v; after(); }, 'no'));
      } else if (c.kind === 'tension' || c.kind === 'time') {
        row.appendChild(selectInput(['>', '>=', '<', '<='], c.op || '>', (v) => { c.op = v; after(); }));
        row.appendChild(numInput(c.value, (v) => { c.value = v; after(); }, c.kind === 'tension' ? { min: 0, max: 1, step: 0.01 } : { min: 0, step: 1000 }));
      }
      row.appendChild(iconBtn('✕', () => { list.splice(i, 1); after(); this.render(); }));
      box.appendChild(row);
    });
    return box;
  },

  /* -------- efectos -------- */
  effectsPanel(n) {
    const box = el('div', { class: 'sec' });
    const list = n.effects || (n.effects = []);
    box.appendChild(el('div', { class: 'shead' }, [
      el('h4', { text: 'Efectos (' + list.length + ')' }),
      btn('＋ efecto', () => this.effectPicker(n))
    ]));
    if (!list.length) box.appendChild(el('div', { class: 'hint', text: 'Sin efectos: el nodo sólo habilita ramas.' }));
    list.forEach((inst, i) => box.appendChild(this.effectRow(n, inst, i, list)));
    return box;
  },

  effectPicker(n) {
    const cats = Store.categories();
    const wrap = el('div', { class: 'picker' });
    const search = el('input', { type: 'search', placeholder: 'buscar efecto…' });
    const listEl = el('div', { class: 'plist' });
    const fill = () => {
      clear(listEl);
      const q = search.value.toLowerCase();
      cats.forEach(cat => {
        const items = Store.catalog.effects.filter(e => e.category === cat.id && (!q || (e.name + ' ' + e.id + ' ' + (e.description || '')).toLowerCase().includes(q)));
        if (!items.length) return;
        listEl.appendChild(el('div', { class: 'pcat', text: cat.name }));
        items.forEach(e => {
          const it = el('div', { class: 'pitem', title: e.description || '', onclick: () => { Store.addEffectTo(n.id, e.id); wrap.remove(); this.render(); } }, [
            el('b', { text: e.name }), el('span', { class: 'id', text: e.id })
          ]);
          listEl.appendChild(it);
        });
      });
    };
    search.addEventListener('input', fill);
    wrap.append(el('div', { class: 'phead2' }, [search, iconBtn('✕', () => wrap.remove())]), listEl);
    fill();
    this.root.appendChild(wrap);
    search.focus();
  },

  effectRow(n, inst, i, list) {
    const entry = Store.effect(inst.effect);
    const row = el('div', { class: 'eff' + (inst.enabled === false ? ' off' : '') });
    const head = el('div', { class: 'ehead' });
    head.appendChild(checkInput(inst.enabled !== false, (v) => { inst.enabled = v; Store.touch('graph'); this.render(); }));
    const sel = selectInput(Store.catalog.effects.map(e => e.id), inst.effect, (v) => {
      inst.effect = v;
      const e2 = Store.effect(v);
      const p = {};
      ((e2 && e2.params) || []).forEach(sp => { if (sp.default !== null && sp.default !== undefined) p[sp.key] = sp.default; });
      inst.params = p;
      Store.touch('graph'); this.render();
    });
    head.appendChild(sel);
    head.appendChild(el('span', { class: 'delay', title: 'retardo en ms' }, [
      el('span', { text: '↻' }),
      numInput(inst.delay || 0, (v) => { if (v) inst.delay = v; else delete inst.delay; Store.touch('graph'); }, { min: 0, step: 50 })
    ]));
    head.appendChild(el('span', { class: 'sp' }));
    head.appendChild(iconBtn('↑', () => { if (i > 0) { list.splice(i, 1); list.splice(i - 1, 0, inst); Store.touch('graph'); this.render(); } }, 'subir'));
    head.appendChild(iconBtn('↓', () => { if (i < list.length - 1) { list.splice(i, 1); list.splice(i + 1, 0, inst); Store.touch('graph'); this.render(); } }, 'bajar'));
    head.appendChild(iconBtn('✕', () => { list.splice(i, 1); Store.touch('graph'); this.render(); }, 'quitar'));
    row.appendChild(head);

    if (entry && entry.description) row.appendChild(el('div', { class: 'edesc', text: entry.description }));
    if (entry && entry.macro) row.appendChild(el('div', { class: 'emacro', text: 'macro: ' + entry.macro.map(m => m.effect).join(' → ') }));
    if (!entry) row.appendChild(el('div', { class: 'err', text: 'Este id no está en el catálogo: el motor lo ignorará.' }));

    const params = (entry && entry.params) || [];
    if (params.length) {
      const det = el('details', { open: '' });
      det.appendChild(el('summary', { text: 'parámetros' }));
      const body = el('div', { class: 'params' });
      params.forEach(sp => body.appendChild(this.paramField(sp, inst.params || (inst.params = {}), () => Store.touch('graph'))));
      det.appendChild(body);
      row.appendChild(det);
    } else if (entry) {
      row.appendChild(el('div', { class: 'hint', text: 'sin parámetros' }));
    }
    return row;
  },

  paramField(sp, params, after) {
    const get = () => params[sp.key];
    const set = (v) => { if (v === null || v === '' || v === undefined) delete params[sp.key]; else params[sp.key] = v; after(); };
    let ctrl;
    switch (sp.type) {
      case 'number': ctrl = rangeInput(get(), set, sp); break;
      case 'int': ctrl = numInput(get(), set, sp); break;
      case 'string': case 'flag': {
        ctrl = textInput(get(), set);
        if (sp.type === 'flag') { ctrl.setAttribute('list', 'dl-flags'); }
        break;
      }
      case 'text': ctrl = el('textarea', { rows: 3 }); ctrl.value = get() || ''; ctrl.addEventListener('input', () => set(ctrl.value)); break;
      case 'bool': ctrl = checkInput(get(), set, ''); break;
      case 'select': ctrl = selectInput(sp.options || [], get(), set); break;
      case 'list': ctrl = listArea(get(), set); break;
      case 'node': {
        ctrl = textInput(get(), set);
        ctrl.setAttribute('list', 'dl-paths');
        break;
      }
      case 'icon': ctrl = selectInput(spriteNames(), get(), set); break;
      case 'event': ctrl = selectInput((Store.catalog.events || []).map(e => e.id), get(), set); break;
      case 'branches': ctrl = this.branchesEditor(get() || [], (v) => { params[sp.key] = v; after(); }); break;
      case 'json': default: ctrl = jsonArea(get(), set, 4); break;
    }
    const f = field(sp.label || sp.key, ctrl, sp.help || (sp.default !== undefined && sp.default !== null ? 'por omisión: ' + JSON.stringify(sp.default) : ''));
    if (sp.type === 'branches' || sp.type === 'json' || sp.type === 'text' || sp.type === 'list') f.classList.add('wide');
    return f;
  },

  branchesEditor(list, onChange) {
    const box = el('div', { class: 'branches' });
    const rerender = () => { onChange(list); this.render(); };
    list.forEach((b, i) => {
      const row = el('div', { class: 'branch' });
      const cond = b.if || (b.if = {});
      const kindSel = selectInput(
        [{ id: 'index', name: 'botón nº' }, { id: 'value', name: 'clave escrita' }, { id: 'notValue', name: 'clave distinta de' }, { id: 'always', name: 'siempre (por defecto)' }],
        cond.index != null ? 'index' : cond.value != null ? 'value' : cond.notValue != null ? 'notValue' : 'always',
        (v) => {
          delete cond.index; delete cond.value; delete cond.notValue;
          if (v === 'index') cond.index = 0;
          else if (v === 'value') cond.value = '';
          else if (v === 'notValue') cond.notValue = '';
          rerender();
        });
      row.appendChild(el('div', { class: 'bhead' }, [
        el('span', { class: 'bn', text: 'rama ' + (i + 1) }), kindSel,
        cond.index != null ? numInput(cond.index, (v) => { cond.index = v; onChange(list); }, { min: 0 }) : null,
        cond.value != null ? textInput(cond.value, (v) => { cond.value = v; onChange(list); }) : null,
        cond.notValue != null ? textInput(cond.notValue, (v) => { cond.notValue = v; onChange(list); }) : null,
        el('span', { class: 'sp' }),
        iconBtn('✕', () => { list.splice(i, 1); rerender(); })
      ]));
      const mode = b.effects ? 'list' : 'single';
      const modeSel = selectInput([{ id: 'single', name: 'un efecto' }, { id: 'list', name: 'lista de efectos' }], mode, (v) => {
        if (v === 'list') { b.effects = b.effect ? [{ effect: b.effect, params: b.params || {} }] : []; delete b.effect; delete b.params; }
        else { const first = (b.effects || [])[0]; b.effect = first ? first.effect : ''; b.params = first ? first.params : {}; delete b.effects; }
        rerender();
      });
      row.appendChild(el('div', { class: 'bbody' }, [modeSel]));
      if (mode === 'single') {
        row.appendChild(field('efecto', selectInput(Store.catalog.effects.map(e => e.id), b.effect, (v) => { b.effect = v; const e2 = Store.effect(v); const p = {}; ((e2 && e2.params) || []).forEach(s => { if (s.default !== null && s.default !== undefined) p[s.key] = s.default; }); b.params = p; onChange(list); this.render(); })));
        const e = Store.effect(b.effect);
        if (e) (e.params || []).forEach(sp => row.appendChild(this.paramField(sp, b.params || (b.params = {}), () => onChange(list))));
      } else {
        row.appendChild(jsonArea(b.effects || [], (v) => { b.effects = v; onChange(list); }, 6));
      }
      box.appendChild(row);
    });
    box.appendChild(btn('＋ rama', () => { list.push({ if: {}, effect: '', params: {} }); rerender(); }));
    return box;
  },

  /* -------- arista -------- */
  edgePanel(e) {
    if (!e) return this.emptyPanel();
    const p = el('div', { class: 'panel' });
    p.appendChild(el('div', { class: 'phead' }, [
      el('h3', { text: 'Arista (habilitación)' }),
      iconBtn('✕', () => Store.removeEdge(e.id))
    ]));
    p.appendChild(field('desde', selectInput(Store.nodes().map(n => ({ id: n.id, name: n.label })), e.from, (v) => { e.from = v; Store.touch('graph'); })));
    p.appendChild(field('hasta', selectInput(Store.nodes().map(n => ({ id: n.id, name: n.label })), e.to, (v) => { e.to = v; Store.touch('graph'); })));
    p.appendChild(el('div', { class: 'hint', text: 'El nodo destino sólo puede activarse si el origen ya fue descubierto y estas condiciones se cumplen. Varias aristas entrantes = alternativas (OR); las condiciones de cada arista = ramas.' }));
    p.appendChild(this.conditionsPanel(e, 'conditions', () => Store.touch('graph')));
    return p;
  }
};

/** datalists compartidos (rutas y banderas) */
export function mountDatalists(root) {
  const d1 = el('datalist', { id: 'dl-paths' });
  const d2 = el('datalist', { id: 'dl-flags' });
  root.append(d1, d2);
  const fill = () => {
    clear(d1); clear(d2);
    fsPaths().forEach(p => d1.appendChild(el('option', { value: p })));
    knownFlags().forEach(f => d2.appendChild(el('option', { value: f })));
  };
  Store.subscribe(fill);
  fill();
}
