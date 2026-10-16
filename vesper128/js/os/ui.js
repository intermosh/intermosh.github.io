/* vesper128 · os/ui — toolkit de interfaz 1-bit: barra de menú, ventanas,
   diálogos modales, botones, campos y scrollbars. Sin narrativa: puro motor. */

import { clamp, lerp, smooth, rndi, chance } from '../core/util.js';
import { FB, fillRect, strokeRect, fillRound, strokeRound, hline, vline, text, textC, textW } from '../core/framebuffer.js';
import { Audio } from '../core/audio.js';

export const UI = {
  wins: [],
  dialogs: [],
  mouse: { x: 0, y: 0, rawX: 0, rawY: 0, down: false, inside: false, moved: false },
  cursor: { x: 0, y: 0 },
  drag: null,
  scrollDrag: null,
  openMenu: null,
  hoverPart: null,
  zoom: [],
  nextId: 1,
  latency: 0,
  hitDrift: 0,
  stillFor: 0,
  focusField: null,
  draggableDialogs: false,
  menuBar: { items: [] },
  logo: null           // sprite o null; lo define el juego
};

export const MENUBAR_H = () => FB.menuBarH;

/* ---------------- ventanas ---------------- */
export function newWin(o) {
  const w = Object.assign({
    id: UI.nextId++, x: 40, y: 40, w: 320, h: 200,
    title: '', kind: 'generic', data: null,
    scrollY: 0, contentH: 0, scrollable: false,
    closable: true, closeFails: 0, selected: -1, parts: [],
    draw: null, onClick: null, onDblClick: null, onKey: null, onTick: null, onScrollEnd: null,
    modal: false, jitter: 0, born: performance.now(), maximized: false, restore: null,
    fx: undefined, fy: undefined
  }, o);
  UI.wins.push(w);
  UI.zoom.push({ w, t: 0, dur: 260, x0: w.fx != null ? w.fx : FB.W / 2, y0: w.fy != null ? w.fy : FB.H / 2 });
  return w;
}

export function closeWin(w, silent) {
  const i = UI.wins.indexOf(w);
  if (i >= 0) UI.wins.splice(i, 1);
  const di = UI.dialogs.indexOf(w);
  if (di >= 0) UI.dialogs.splice(di, 1);
  if (!silent) Audio.blip(660, 0.035);
  return i >= 0;
}
export const frontWin = () => (UI.wins.length ? UI.wins[UI.wins.length - 1] : null);
export const topModal = () => (UI.dialogs.length ? UI.dialogs[UI.dialogs.length - 1] : null);
export function bringFront(w) {
  const i = UI.wins.indexOf(w);
  if (i >= 0 && i !== UI.wins.length - 1) { UI.wins.splice(i, 1); UI.wins.push(w); }
}
export const winByTitle = (t) => UI.wins.find(w => w.title === t);

export function body(w) {
  const barH = 15;
  const x = w.x + 1, y = w.y + barH + 1;
  const sw = w.scrollable ? 15 : 0;
  return { x, y, w: w.w - 2 - sw, h: w.h - barH - 2, sw, barH };
}

/* ---------------- partes ---------------- */
export function addBtn(w, x, y, ww, hh, label, fn, opts = {}) {
  const p = { type: 'btn', x, y, w: ww, h: hh, label, fn, def: !!opts.def, disabled: !!opts.disabled, pressed: 0 };
  w.parts.push(p); return p;
}
export function addField(w, x, y, ww, hh, key, ph) {
  const p = { type: 'field', x, y, w: ww, h: hh, key, ph: ph || '', value: '', secret: false };
  w.parts.push(p); return p;
}

function drawParts(w, now) {
  for (const p of w.parts) {
    if (p.type === 'btn') {
      const dx = (w.jitter && chance(0.5)) ? rndi(3) - 1 : 0;
      const pressed = p.pressed > 0 || (UI.hoverPart === p && UI.mouse.down);
      if (pressed) {
        fillRound(p.x + dx, p.y, p.w, p.h, 0);
        textC(p.label, p.x + dx + p.w / 2, p.y + Math.floor((p.h - FB.font.size) / 2), 1);
      } else {
        fillRound(p.x + dx, p.y, p.w, p.h, 1);
        strokeRound(p.x + dx, p.y, p.w, p.h, p.disabled ? 0.45 : 0);
        if (p.def) strokeRound(p.x + dx - 2, p.y - 2, p.w + 4, p.h + 4, p.disabled ? 0.45 : 0);
        textC(p.label, p.x + dx + p.w / 2, p.y + Math.floor((p.h - FB.font.size) / 2), p.disabled ? 0.45 : 0);
      }
    } else if (p.type === 'field') {
      fillRect(p.x, p.y, p.w, p.h, 1);
      strokeRect(p.x, p.y, p.w, p.h, 0);
      const focused = UI.focusField === p;
      if (focused) strokeRect(p.x - 1, p.y - 1, p.w + 2, p.h + 2, 0);
      const shown = p.secret ? '•'.repeat(p.value.length) : p.value;
      text(shown || (focused ? '' : p.ph), p.x + 4, p.y + Math.floor((p.h - FB.font.size) / 2), shown ? 0 : 0.45);
      if (focused && ((now / 500) | 0) % 2 === 0) vline(p.x + 4 + textW(shown), p.y + 2, p.y + p.h - 3, 0);
    }
  }
}

export function partAt(w, x, y) {
  const drift = UI.hitDrift;
  for (let i = w.parts.length - 1; i >= 0; i--) {
    const p = w.parts[i];
    const dx = drift ? Math.sin(p.x * 0.13 + performance.now() * 0.001) * drift : 0;
    const dy = drift ? Math.cos(p.y * 0.11 + performance.now() * 0.001) * drift : 0;
    if (x >= p.x + dx && x < p.x + dx + p.w && y >= p.y + dy && y < p.y + dy + p.h) return p;
  }
  return null;
}

/* ---------------- diálogos ---------------- */
export function dialog(o) {
  const adv = FB.font.advance;
  const lines = (o.text || '').split('\n').flatMap(l => wrapLine(l, Math.floor((o.w || 300) / adv) - 4));
  const textH = lines.length * FB.font.lineHeight;
  const wpx = o.w || Math.max(260, textW(o.text || '') + 60);
  const hpx = 40 + textH + (o.field ? 26 : 0) + 30;
  const x = o.x !== undefined ? o.x : Math.round(FB.W / 2 - wpx / 2 + rndi(9) - 4);
  const y = o.y !== undefined ? o.y : Math.round(70 + Math.random() * 60);
  const d = newWin({
    x, y, w: wpx, h: hpx, title: o.title || '', kind: 'dialog', modal: true,
    data: { lines, buttons: o.buttons || ['Aceptar'], icon: o.icon || null, field: o.field || null, onButton: o.onButton || (() => { }) },
    fx: o.fx, fy: o.fy
  });
  d.draw = (win) => {
    const b = body(win);
    fillRect(b.x, b.y, b.w, b.h, 1);
    let tx = b.x + 12;
    if (win.data.icon) { win.data.iconDraw && win.data.iconDraw(b.x + 10, b.y + 8); tx = b.x + 48; }
    win.data.lines.forEach((l, i) => text(l, tx, b.y + 8 + i * FB.font.lineHeight, 0));
  };
  const bw = Math.max(58, Math.floor((wpx - 30) / d.data.buttons.length) - 6);
  d.data.buttons.forEach((label, i) => {
    const nn = d.data.buttons.length;
    const total = nn * bw + (nn - 1) * 8;
    const bx = d.x + Math.floor((d.w - total) / 2) + i * (bw + 8);
    addBtn(d, bx, d.y + d.h - 26, bw, 17, label, () => {
      const close = d.data.onButton(i, label, d);
      if (close !== false) dismissDialog(d);
    }, { def: i === 0 });
  });
  if (d.data.field) {
    const f = addField(d, d.x + 20, d.y + 34 + textH + 4, d.w - 40, 16, 'dlg', d.data.field.ph || '');
    f.secret = !!d.data.field.secret;
    UI.focusField = f;
    d.data.fieldRef = f;
  }
  UI.dialogs.push(d);
  Audio.blip(880, 0.05);
  Audio.alert(d.data.buttons.length > 1 ? 2 : 1);
  return d;
}

export function dismissDialog(d) {
  const i = UI.dialogs.indexOf(d);
  if (i >= 0) UI.dialogs.splice(i, 1);
  closeWin(d, true);
  if (UI.focusField && d.parts.includes(UI.focusField)) UI.focusField = null;
}

function wrapLine(s, cols) {
  if (s.length <= cols) return [s];
  const out = []; let cur = s;
  while (cur.length > cols) { out.push(cur.slice(0, cols)); cur = cur.slice(cols); }
  if (cur) out.push(cur);
  return out;
}

/* ---------------- reloj diegético (lo configura el juego) ---------------- */
export const Clock = {
  base: new Date(1994, 10, 2, 3, 14, 7),
  frozen: true, drift: 0, mode: 'owner', elapsed: 0,
  string() {
    let d;
    if (this.mode === 'owner') d = new Date(this.base.getTime() + (this.frozen ? 0 : this.elapsed) + this.drift);
    else d = new Date(Date.now() + this.drift);
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }
};

/* ---------------- barra de menú ---------------- */
export function setMenuItems(items) { UI.menuBar.items = items; }

function drawMenuBar() {
  const H = MENUBAR_H();
  fillRect(0, 0, FB.W, H, 1);
  hline(0, FB.W - 1, H - 1, 0);
  let x = 26;
  if (UI.logo) { UI.logo(7, 5, UI.openMenu && UI.openMenu.logo ? 1 : 0); }
  for (const m of UI.menuBar.items) {
    if (m.logo) { m._x = 0; m._w = 25; continue; }
    const wpx = textW(m.label) + 14;
    if (UI.openMenu === m) { fillRect(x - 2, 1, wpx, H - 2, 0); text(m.label, x + 5, 5, 1); }
    else text(m.label, x + 5, 5, 0);
    m._x = x - 2; m._w = wpx;
    x += wpx;
  }
  const t = Clock.string();
  text(t, FB.W - textW(t) - 8, 5, 0);
}

/* ---------------- marcos ---------------- */
function drawWindowFrame(w) {
  const barH = 15;
  for (let j = 3; j < w.h + 3; j++) for (let i = 3; i < w.w + 3; i++) {
    const x = w.x + i, y = w.y + j;
    if (x >= FB.W || y >= FB.H) continue;
    if (((x + y) & 1) === 0) { const idx = y * FB.W + x; FB.buf[idx] = Math.min(FB.buf[idx], 90); }
  }
  fillRect(w.x, w.y, w.w, w.h, 1);
  strokeRect(w.x, w.y, w.w, w.h, 0);
  strokeRect(w.x + 1, w.y + 1, w.w - 2, w.h - 2, 0);
  const active = frontWin() === w || w.modal;
  fillRect(w.x + 2, w.y + 2, w.w - 4, barH - 2, 1);
  if (active) {
    for (let i = w.x + 22; i < w.x + w.w - 22; i += 2) vline(i, w.y + 3, w.y + barH - 2, 0);
    fillRect(w.x + 22, w.y + 2, w.w - 44, barH - 2, 1);
  }
  hline(w.x + 2, w.x + w.w - 3, w.y + barH - 1, 0);
  textC(w.title, w.x + w.w / 2, w.y + 3, 0);
  if (w.closable) strokeRect(w.x + 6, w.y + 4, 9, 8, 0);
  strokeRect(w.x + w.w - 15, w.y + 4, 9, 8, 0);
  strokeRect(w.x + w.w - 13, w.y + 6, 5, 4, 0);
}

function drawScrollbar(w) {
  const b = body(w);
  const x = w.x + w.w - 16, y = b.y, h = b.h;
  fillRect(x, y, 15, h, 1);
  vline(x, y, y + h - 1, 0);
  for (const [ay, dir] of [[y, -1], [y + h - 15, 1]]) {
    strokeRect(x + 1, ay + 1, 13, 13, 0);
    for (let k = 0; k < 4; k++) hline(x + 4 + k, x + 10 - k, ay + (dir < 0 ? 10 - k : 5 + k), 0);
  }
  const ty = y + 15, th = h - 30;
  fillRect(x + 1, ty, 13, th, 0.5);
  const range = Math.max(1, w.contentH - b.h);
  const thumH = Math.max(12, Math.floor(th * b.h / Math.max(b.h + 1, w.contentH)));
  const thumY = ty + Math.floor((th - thumH) * clamp(w.scrollY / range, 0, 1));
  w._thumb = { x: x + 1, y: thumY, w: 13, h: thumH, ty, th };
  fillRect(x + 1, thumY, 13, thumH, 1);
  strokeRect(x + 1, thumY, 13, thumH, 0);
}

/* ---------------- tick / draw ---------------- */
export function uiTick(dt) {
  const lag = UI.latency;
  if (lag > 0) {
    const k = clamp(dt / (lag + 16), 0, 1);
    UI.cursor.x = lerp(UI.cursor.x, UI.mouse.rawX, k);
    UI.cursor.y = lerp(UI.cursor.y, UI.mouse.rawY, k);
  } else { UI.cursor.x = UI.mouse.rawX; UI.cursor.y = UI.mouse.rawY; }
  UI.mouse.x = UI.cursor.x; UI.mouse.y = UI.cursor.y;
  if (!UI.mouse.moved) UI.stillFor += dt; else UI.stillFor = 0;
  UI.mouse.moved = false;
  for (let i = UI.zoom.length - 1; i >= 0; i--) { const z = UI.zoom[i]; z.t += dt; if (z.t >= z.dur) UI.zoom.splice(i, 1); }
  for (const w of UI.wins) if (w.onTick) w.onTick(dt, performance.now());
}

function zoomRect(z) {
  const t = smooth(clamp(z.t / z.dur, 0, 1));
  const w = z.w;
  return {
    x: Math.round(lerp(z.x0 - 6, w.x, t)), y: Math.round(lerp(z.y0 - 6, w.y, t)),
    w: Math.round(lerp(12, w.w, t)), h: Math.round(lerp(12, w.h, t)), done: t >= 1
  };
}

export function uiDraw() {
  const now = performance.now();
  for (const w of UI.wins) {
    const z = UI.zoom.find(z => z.w === w);
    if (z && !z.done) {
      const r = zoomRect(z);
      fillRect(r.x, r.y, r.w, r.h, 1);
      strokeRect(r.x, r.y, r.w, r.h, 0);
      strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 0);
      continue;
    }
    drawWindowFrame(w);
    if (w.draw) w.draw(w, now);
    if (w.scrollable && w.contentH > body(w).h) drawScrollbar(w);
    drawParts(w, now);
  }
  drawMenuBar();
  if (UI.openMenu) drawOpenMenu();
}

export function drawOpenMenu() {
  const m = UI.openMenu;
  const items = typeof m.items === 'function' ? m.items() : (m.items || []);
  let h = 4; const rows = [];
  for (const it of items) {
    if (it === '-') { rows.push({ sep: true }); h += 7; }
    else { rows.push({ it }); h += 15; }
  }
  let wpx = 0;
  for (const r of rows) if (r.it) wpx = Math.max(wpx, textW(r.it.label) + 26);
  wpx = Math.max(wpx, 90);
  const x = clamp(m._x || 0, 0, FB.W - wpx);
  const y = MENUBAR_H() - 1;
  m._box = { x, y, w: wpx, h, rows };
  fillRect(x, y, wpx, h, 1);
  strokeRect(x, y, wpx, h, 0);
  let cy = y + 3;
  for (const r of rows) {
    if (r.sep) { hline(x + 1, x + wpx - 2, cy + 3, 0); cy += 7; continue; }
    r.y = cy;
    const dis = r.it.disabled && r.it.disabled();
    const hov = UI.mouse.x >= x && UI.mouse.x < x + wpx && UI.mouse.y >= cy && UI.mouse.y < cy + 15;
    if (hov && !dis) { fillRect(x + 1, cy, wpx - 2, 15, 0); text(r.it.label, x + 10, cy + 3, 1); }
    else text(r.it.label, x + 10, cy + 3, dis ? 0.45 : 0);
    cy += 15;
  }
}

/* ---------------- hit testing ---------------- */
export function windowAt(x, y) {
  for (let i = UI.wins.length - 1; i >= 0; i--) {
    const w = UI.wins[i];
    if (x >= w.x && x < w.x + w.w && y >= w.y && y < w.y + w.h) return w;
  }
  return null;
}
export function menuAt(x, y) {
  if (y >= MENUBAR_H()) return null;
  for (const m of UI.menuBar.items) if (m._x !== undefined && x >= m._x && x < m._x + m._w) return m;
  return null;
}
