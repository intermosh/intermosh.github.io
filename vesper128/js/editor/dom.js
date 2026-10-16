/* vesper128 · editor/dom — piezas de interfaz reutilizadas por todos los paneles. */

export function el(tag, props, kids) {
  const n = document.createElement(tag);
  if (props) for (const k of Object.keys(props)) {
    if (k === 'class') n.className = props[k];
    else if (k === 'html') n.innerHTML = props[k];
    else if (k === 'text') n.textContent = props[k];
    else if (k.startsWith('on') && typeof props[k] === 'function') n.addEventListener(k.slice(2), props[k]);
    else if (props[k] !== undefined && props[k] !== null && props[k] !== false) n.setAttribute(k, props[k]);
  }
  (kids || []).forEach(c => c && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return n;
}

export const clear = (n) => { while (n && n.firstChild) n.removeChild(n.firstChild); };

export function field(label, control, hint) {
  return el('label', { class: 'fld' }, [
    el('span', { class: 'lbl', text: label }),
    control,
    hint ? el('span', { class: 'hint', text: hint }) : null
  ]);
}

export function textInput(value, onChange, ph) {
  const i = el('input', { type: 'text', value: value == null ? '' : String(value), placeholder: ph || '' });
  i.addEventListener('input', () => onChange(i.value));
  return i;
}

export function numInput(value, onChange, opt = {}) {
  const i = el('input', { type: 'number', value: value == null ? '' : String(value), step: opt.step != null ? opt.step : 1 });
  if (opt.min != null) i.min = opt.min;
  if (opt.max != null) i.max = opt.max;
  i.addEventListener('input', () => onChange(i.value === '' ? null : Number(i.value)));
  return i;
}

export const fmt = (v) => (v == null || v === '' ? '—' : (Math.round(Number(v) * 1000) / 1000).toString().replace('.', ','));

export function rangeInput(value, onChange, opt = {}) {
  const wrap = el('div', { class: 'range' });
  const min = opt.min != null ? opt.min : 0, max = opt.max != null ? opt.max : 1, step = opt.step != null ? opt.step : 0.01;
  const r = el('input', { type: 'range', min, max, step, value: value == null ? min : value });
  const out = el('span', { class: 'val', text: fmt(value == null ? min : value) });
  r.addEventListener('input', () => { out.textContent = fmt(r.value); onChange(Number(r.value)); });
  wrap.append(r, out);
  return wrap;
}

export function selectInput(options, value, onChange) {
  const s = el('select');
  const hasEmpty = options.some(o => (typeof o === 'string' ? o : o.id) === '');
  if (hasEmpty || value === '' || value == null) s.appendChild(el('option', { value: '', text: '—' }));
  options.forEach(o => {
    const val = typeof o === 'string' ? o : o.id;
    const lab = typeof o === 'string' ? o : (o.name ? o.name + ' (' + o.id + ')' : o.id);
    s.appendChild(el('option', { value: val, text: lab }));
  });
  s.value = value == null ? '' : String(value);
  s.addEventListener('change', () => onChange(s.value));
  return s;
}

export function checkInput(checked, onChange, label) {
  const w = el('label', { class: 'chk' });
  const c = el('input', { type: 'checkbox' });
  c.checked = !!checked;
  c.addEventListener('change', () => onChange(c.checked));
  w.append(c, el('span', { text: label || '' }));
  return w;
}

export function jsonArea(value, onApply, rows = 4) {
  const wrap = el('div', { class: 'json' });
  const ta = el('textarea', { rows, spellcheck: 'false' });
  ta.value = JSON.stringify(value == null ? null : value, null, 2);
  const err = el('div', { class: 'err' });
  const b = el('button', { class: 'mini', text: 'aplicar' });
  b.addEventListener('click', () => {
    try { onApply(JSON.parse(ta.value || 'null')); err.textContent = ''; ta.classList.remove('bad'); }
    catch (e) { err.textContent = 'JSON inválido: ' + e.message; ta.classList.add('bad'); }
  });
  wrap.append(ta, el('div', { class: 'row' }, [b, err]));
  return wrap;
}

export function listArea(value, onChange, ph) {
  const ta = el('textarea', { rows: 3, spellcheck: 'false', placeholder: ph || 'un ítem por línea' });
  ta.value = (value || []).join('\n');
  ta.addEventListener('input', () => onChange(ta.value.split('\n').map(s => s.trim()).filter(s => s.length)));
  return ta;
}

export function btn(label, fn, cls = '') { return el('button', { class: 'btn ' + cls, text: label, onclick: fn }); }
export function iconBtn(label, fn, title) { return el('button', { class: 'ibtn', text: label, title: title || label, onclick: fn }); }

/* ---------------- color ---------------- */
export const rgb2hex = (a) => '#' + (a || [0, 0, 0]).slice(0, 3).map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const hex2rgb = (h) => {
  const s = String(h).replace('#', '');
  return [0, 2, 4].map(i => parseInt(s.slice(i, i + 2), 16) || 0);
};
export function colorInput(rgb, onChange) {
  const w = el('div', { class: 'color' });
  const c = el('input', { type: 'color', value: rgb2hex(rgb) });
  const t = el('span', { class: 'val', text: rgb2hex(rgb) });
  c.addEventListener('input', () => { const v = hex2rgb(c.value); t.textContent = c.value; onChange(v); });
  w.append(c, t);
  return w;
}
