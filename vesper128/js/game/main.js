/* vesper128 · game/main — punto de entrada. Carga data/game.json + data/effects.json,
   configura las capas, conecta la entrada al toolkit del OS y corre el bucle.
   Este archivo no contiene narrativa: sólo cableado. */

import { clamp, rndi, pick, chance, sampleActs } from '../core/util.js';
import { FB, configure, attach, fitScale, fbClear, fillRect, plot, text, drawIcon, drawCursor, present, registerIcons } from '../core/framebuffer.js';
import { SPRITES } from '../core/icons.js';
import { CRT } from '../core/crt.js';
import { Input } from '../core/input.js';
import { Audio, GainOverride } from '../core/audio.js';
import { Config } from '../core/config.js';
import { Events } from '../core/events.js';
import {
  UI, newWin, closeWin, frontWin, topModal, bringFront, winByTitle, body, partAt,
  dialog, dismissDialog, Clock, setMenuItems, uiTick, uiDraw, windowAt, menuAt
} from '../os/ui.js';
import { Desktop } from '../os/desktop.js';
import { FS, Trash } from '../os/filesystem.js';
import { loadCatalog, runEffect, runList } from './effects.js';
import { Story, Subliminal, Blink, MenuState, CRTBoost, wireStoryEvents } from './story.js';
import { Boot, Endgame } from './boot.js';
import { registerApps } from './apps.js';

/* ---------------- contexto compartido con los efectos ---------------- */
const ctx = {
  Story, UI, FS, Trash, Desktop, Audio, Config, Events, Clock,
  MenuState, CRTBoost, Blink, Subliminal, Boot, Endgame,
  AudioOverride: GainOverride,
  get reducedFlicker() { return Boot.reducedFlicker; },
  rebuildMenus: () => rebuildMenus()
};

/* ---------------- arranque ---------------- */
async function main() {
  await Config.load('data/game.json');
  try {
    const r = await fetch('data/effects.json', { cache: 'no-store' });
    const cat = await r.json();
    loadCatalog(Array.isArray(cat) ? cat : (cat.effects || []));
  } catch (e) { console.warn('[main] sin catálogo de efectos:', e.message); loadCatalog([]); }

  configure(Config.get('display'));
  registerIcons(SPRITES);
  const customSprites = Config.get('sprites', null);
  if (customSprites) registerIcons(customSprites);   // sprites editados en editor.html
  attach(document.getElementById('view'));
  fitScale(Config.get('display.scaleMode', 'fill'));

  CRT.attach(document.getElementById('stage'), document.getElementById('bloom'));
  CRT.configure(Config.get('display.crt'));
  CRT.resize(FB.view.width, FB.view.height);

  Input.attach(FB.view);
  Audio.configure(Config.get('audio'));

  FS.configure(Config.get('fs'));
  const cb = Config.get('clock', {});
  Clock.base = new Date(...(cb.base || [1994, 10, 2, 3, 14, 7]));
  Clock.frozen = cb.frozen !== false;
  Clock.mode = cb.mode || 'owner';
  Clock.drift = cb.drift || 0;

  UI.logo = (x, y, inv) => drawIcon(Config.get('display.logo', 'logo'), x, y, 1, inv);

  Story.initVisitor();
  Story.loadGraph();
  Story.setCtx(ctx);
  wireStoryEvents();
  registerApps();
  rebuildMenus();

  Events.on('open:generated', ({ name }) => {
    const rows = Config.get('fs.generatedRows', [{ name: '—', size: '1 K' }]);
    FS.openList(name, rows.map(r => ({ name: r.name, size: r.size })), {});
    Audio.disk('write', 0.7);
  });

  Boot.onDesktop = enterDesktop;
  bindInput();
  window.addEventListener('resize', onResize);

  document.title = Config.get('meta.title') || Config.get('meta.workingName') || 'vesper128';

  // gancho de inspección (pruebas automatizadas y editor)
  window.__VESPER__ = {
    Config, FB, CRT, Audio, UI, Desktop, FS, Trash, Story, Subliminal, Blink, MenuState, Boot, Endgame, ctx, runEffect, runList,
    winByTitle, frontWin, windowAt, menuAt, body, closeWin, Clock, Input, Events
  };

  requestAnimationFrame(frame);
}

function onResize() {
  fitScale(Config.get('display.scaleMode', 'fill'));
  CRT.resize(FB.view.width, FB.view.height);
  Desktop.buildPattern();
  Desktop.layout();
}

function enterDesktop() {
  Boot.phase = 'desktop';
  FS.buildDesktop();
  Audio.init();
  Audio.setReduced(Boot.reducedFlicker);
  CRT.reduced = Boot.reducedFlicker;
  Audio.chime();
  UI.latency = 0;
  Story.activateStart();
  Events.emit('desktop', {});
}

/* ---------------- menús (datos → UI) ---------------- */
function condOk(c) { return Story.condTrue(c); }

function menuDisabled(menu, it) {
  if (MenuState.disabledUntil > Story.t && menu._idx === MenuState.disabledPick) return true;
  if (it.disabledIf && condOk(it.disabledIf)) return true;
  if (it.needsFlag && !Story.has(it.needsFlag)) return true;
  if (it.hideIf && condOk(it.hideIf)) return true;
  return !!it.alwaysDisabled;
}

const MENU_ACTIONS = {
  'close': () => { const w = frontWin(); if (w) tryClose(w); },
  'closeAll': () => { UI.wins.slice().forEach(w => tryClose(w)); },
  'emptyTrash': () => {
    const n = Trash.items.length;
    const narrative = Config.get('story.enabled', true) && Config.get('runtime.narrative', true);
    if (!n && !narrative) { infoDialog('trashEmpty'); return; }
    Events.emit('menu:emptyTrash', { count: n });   // también vacía: el grafo puede responder
    // sin narrativa el SO resuelve solo; con narrativa decide el grafo
    if (!narrative) { Audio.disk('grind', 1.6); Trash.items = []; }
  },
  'about': () => {
    const p = Config.get('menus.aboutPath');
    if (p && FS.node(p)) FS.open(p, {}); else infoDialog('about');
  },
  'open': (arg) => FS.open(arg, {}),
  'dialog': (arg) => infoDialog(arg),
  'graph': () => { /* lo resuelve el grafo narrativo vía el evento 'menu' */ },
  'effect': (arg) => runEffect(arg, {}, ctx),
  'mute': () => Audio.duck(0.0001, 0.5),
  'unmute': () => Audio.duck(Config.get('audio.master', 0.85), 0.5),
  'restart': () => location.reload(),
  'noop': () => { }
};

function runAction(spec, it) {
  if (!spec) return;
  const i = spec.indexOf(':');
  const kind = i < 0 ? spec : spec.slice(0, i);
  const arg = i < 0 ? '' : spec.slice(i + 1);
  Events.emit('menu', { action: spec, label: it && it.label });
  const fn = MENU_ACTIONS[kind];
  if (fn) fn(arg);
  else if (!it || !it.effects) console.warn('[main] acción de menú desconocida:', spec);
  if (it && it.effects) runList(it.effects, ctx);
}

function infoDialog(key) {
  const d = (Config.get('dialogs', {}) || {})[key];
  if (!d) return;
  dialog({ title: d.title || '', text: d.text || '', buttons: d.buttons || ['Aceptar'], w: d.width });
}

function buildMenu(m, idx) {
  const menu = {
    label: m.label || ' ', logo: !!m.logo, _idx: idx,
    items: () => {
      const out = [];
      (m.items || []).forEach(it => {
        if (typeof it === 'string') { out.push('-'); return; }
        if (it.showIf && !condOk(it.showIf)) return;
        if (it.hideIf && condOk(it.hideIf)) return;
        if (it.sep) { out.push('-'); return; }
        out.push({
          label: it.label,
          disabled: () => menuDisabled(menu, it),
          fn: () => runAction(it.action, it)
        });
      });
      return out;
    }
  };
  return menu;
}

function rebuildMenus() {
  const base = Config.get('menus.base', []) || [];
  const extra = Config.get('menus.extra', []) || [];
  const items = base.map((m, i) => buildMenu(m, i));
  extra.forEach((m, i) => { if (MenuState.extra.has(m.key)) items.push(buildMenu(m, base.length + i)); });
  setMenuItems(items);
}

/* ---------------- ventanas: cerrar / maximizar ---------------- */
function tryClose(w) {
  if (!w) return;
  const cf = Config.get('ui.closeFail', null);
  if (cf && !w.modal && Story.tension > (cf.above != null ? cf.above : 0.5) && chance(cf.chance != null ? cf.chance : 0.45)) {
    w.closeFails = (w.closeFails || 0) + 1;
    infoDialog(w.closeFails > 1 ? (cf.dialogKey2 || 'closeFail2') : (cf.dialogKey || 'closeFail'));
    Story.note('la ventana no se cerró');
    Events.emit('close:refused', { path: w.data && w.data.path });
    return;
  }
  const node = w.data && w.data.node;
  if (node && node.noClose) {
    infoDialog('noClose');
    w.jitter = 260; setTimeout(() => { w.jitter = 0; }, 260);
    Audio.alert(2);
    Events.emit('close:refused', { path: w.data && w.data.path });
    return;
  }
  if (w.modal) { dismissDialog(w); return; }
  closeWin(w);
  Events.emit('close', { path: w.data && w.data.path, kind: w.kind });
}

function toggleMax(w) {
  if (!w.maximized) {
    w.restore = { x: w.x, y: w.y, w: w.w, h: w.h };
    w.x = 2; w.y = FB.menuBarH + 1; w.w = FB.W - 4; w.h = FB.H - FB.menuBarH - 3;
    w.maximized = true;
  } else {
    Object.assign(w, w.restore); w.maximized = false;
  }
  Audio.blip(520, 0.03, 0.05);
  Events.emit('resize', { path: w.data && w.data.path });
}

/* ---------------- entrada ---------------- */
const P = () => ({ x: UI.cursor.x, y: UI.cursor.y });

let lastClick = { key: '', t: 0 };
function maybeDouble(key, fn) {
  const t = performance.now();
  if (lastClick.key === key && t - lastClick.t < 470) { lastClick = { key: '', t: 0 }; fn(); }
  else lastClick = { key, t };
}

function iconAt(x, y) {
  for (let i = Desktop.icons.length - 1; i >= 0; i--) {
    const ic = Desktop.icons[i];
    if (!ic.visible) continue;
    if (x >= ic.x - 3 && x < ic.x + 35 && y >= ic.y - 3 && y < ic.y + 48) return ic;
  }
  return null;
}

function openIcon(ic) {
  const node = FS.node(ic.node);
  if (node && node.locked && !node.unlocked) { Events.emit('open:locked', { path: ic.node, node }); Audio.alert(1); return; }
  Audio.disk('read', 0.6);
  FS.open(ic.node, { fx: ic.x + 16, fy: ic.y + 16 });
}

function openMenu(m) {
  UI.openMenu = (UI.openMenu === m) ? null : m;
  Audio.blip(1200, 0.03, 0.04);
  if (UI.openMenu) Story.note('menú ' + (m.logo ? '■' : m.label));
}
function closeMenu() { UI.openMenu = null; UI.pendingMenu = null; }

function menuItemAt(p) {
  const m = UI.openMenu; if (!m || !m._box) return null;
  const b = m._box;
  if (p.x < b.x || p.x > b.x + b.w || p.y < b.y || p.y > b.y + b.h) return null;
  for (const r of b.rows) if (r.it && p.y >= r.y && p.y < r.y + 15) return r.it;
  return null;
}

function startDragWin(w, p) {
  if (w.maximized) return;
  UI.drag = { win: w, dx: p.x - w.x, dy: p.y - w.y };
  bringFront(w);
}

function scrollBy(w, dy) {
  const b = body(w);
  const range = Math.max(0, w.contentH - b.h);
  const wasEnd = w.scrollY >= range - 1;
  w.scrollY = clamp(w.scrollY + dy, 0, range);
  if (!wasEnd && w.scrollY >= range - 1) checkScrollEnd(w);
}
function checkScrollEnd(w) {
  if (w._se) return;
  w._se = true; setTimeout(() => { w._se = false; }, 500);
  if (w.onScrollEnd) w.onScrollEnd();
  Events.emit('scrollend', { path: w.data && w.data.path, kind: w.kind, scrollY: w.scrollY });
}

function scrollbarDown(w, p) {
  const b = body(w);
  const top = b.y + 15, bot = b.y + b.h - 15;
  if (p.y < top) { scrollBy(w, -Math.max(20, b.h * 0.8)); Audio.blip(420, 0.02, 0.04); return; }
  if (p.y > bot) { scrollBy(w, Math.max(20, b.h * 0.8)); Audio.blip(420, 0.02, 0.04); return; }
  const th = w._thumb;
  if (th && p.y >= th.y && p.y < th.y + th.h) { UI.scrollDrag = { w, dy: p.y - th.y }; return; }
  if (th) {
    const range = Math.max(1, w.contentH - b.h);
    w.scrollY = clamp(((p.y - th.ty) / Math.max(1, th.th)) * range - b.h / 2, 0, range);
    checkScrollEnd(w);
  }
}

function winDown(w, p) {
  bringFront(w);
  const b = body(w);
  if (w.closable && p.x >= w.x + 4 && p.x < w.x + 17 && p.y >= w.y + 2 && p.y < w.y + 14) { UI.pendingClose = w; return; }
  if (p.x >= w.x + w.w - 17 && p.x < w.x + w.w - 4 && p.y >= w.y + 2 && p.y < w.y + 14) { toggleMax(w); return; }
  if (p.y < w.y + b.barH) { startDragWin(w, p); return; }
  if (w.scrollable && p.x >= w.x + w.w - 16) { scrollbarDown(w, p); return; }
  const part = partAt(w, p.x, p.y);
  if (part) {
    if (part.type === 'btn') { if (!part.disabled) { UI.pendingPart = part; UI.hoverPart = part; } else Audio.alert(1); }
    else if (part.type === 'field') { UI.focusField = part; }
    return;
  }
  if (w.onClick && w.onClick(p.x, p.y, w)) return;
  if (w.kind === 'folder') {
    const idx = FS.rowAt(w, p.x, p.y);
    w.selected = idx;
    if (idx >= 0) {
      Audio.click(false);
      maybeDouble('row:' + w.data.path + ':' + idx, () => FS.folderOpen(w, idx));
    }
    return;
  }
  if (w.onDown && w.onDown(p.x, p.y)) return;
}

function bindInput() {
  Input.on('press', () => {
    if (Boot.phase === 'warn') { Boot.press(); return; }
    if (Boot.phase !== 'desktop' && !(Endgame.active && Endgame.step <= 1)) return;
    if (UI.latency > 0) setTimeout(act, UI.latency); else act();
  });

  function act() {
    const p = P();

    const modal = topModal();
    if (modal) {
      const part = partAt(modal, p.x, p.y);
      if (part && part.type === 'btn') { if (!part.disabled) { UI.pendingPart = part; UI.hoverPart = part; } else Audio.alert(1); return; }
      if (part && part.type === 'field') { UI.focusField = part; return; }
      if (p.y < modal.y + body(modal).barH && UI.draggableDialogs) { startDragWin(modal, p); return; }
      Audio.alert(1);
      return;
    }

    if (UI.openMenu) {
      const it = menuItemAt(p);
      const m2 = menuAt(p.x, p.y);
      if (it) { UI.pendingMenu = it; Audio.click(false); }
      else if (m2) openMenu(m2);
      else closeMenu();
      return;
    }

    const m = menuAt(p.x, p.y);
    if (m) { openMenu(m); return; }

    const w = windowAt(p.x, p.y);
    if (w) { winDown(w, p); return; }

    Desktop.icons.forEach(i => { i.sel = false; });
    const ic = iconAt(p.x, p.y);
    if (ic) {
      ic.sel = true; ic.fade = 0;
      Audio.click(false);
      UI.dragCandidate = { ic, sx: p.x, sy: p.y, dx: p.x - ic.x, dy: p.y - ic.y };
      maybeDouble('icon:' + ic.id, () => openIcon(ic));
    } else {
      UI.dragCandidate = null;
      Events.emit('click', { where: 'desktop', x: Math.round(p.x), y: Math.round(p.y) });
    }
  }

  Input.on('release', () => {
    const p = P();
    if (UI.pendingPart) {
      const part = UI.pendingPart; UI.pendingPart = null; UI.hoverPart = null;
      const w = UI.wins.find(ww => ww.parts.includes(part));
      if (w && partAt(w, p.x, p.y) === part && !part.disabled) {
        part.pressed = 90; Audio.click(true);
        if (part.fn) part.fn();
      }
    }
    if (UI.pendingMenu) {
      const it = UI.pendingMenu; UI.pendingMenu = null;
      closeMenu();
      const dis = it.disabled && it.disabled();
      if (!dis) { Audio.click(true); if (it.fn) it.fn(); } else Audio.alert(1);
    }
    if (UI.pendingClose) { const w = UI.pendingClose; UI.pendingClose = null; tryClose(w); }
    if (UI.drag && UI.drag.icon) {
      const ic = UI.drag.icon;
      const trash = Desktop.icons.find(i => i.fixed);
      if (trash && Math.hypot(UI.cursor.x - (trash.x + 16), UI.cursor.y - (trash.y + 16)) < 34) {
        Story.note('intentó tirar «' + ic.name + '» a la papelera');
        Audio.disk('grind', 1.6);
        Events.emit('drop:trash', { icon: ic.id, name: ic.name });
        const narrative = Config.get('story.enabled', true) && Config.get('runtime.narrative', true);
        if (!narrative) {
          // SO funcional: el ítem pasa a la papelera (con narrativa decide el grafo)
          Trash.items.push(ic.name);
          if (ic.node && FS.node(ic.node)) FS.hide(ic.node);
          Desktop.removeIcon(ic.id);
        } else {
          ic.keep = false; Desktop.layout();
        }
      } else {
        ic.x = clamp(Math.round(UI.cursor.x - 16), 20, FB.W - 52);
        ic.y = clamp(Math.round(UI.cursor.y - 16), FB.menuBarH + 8, FB.H - 60);
        ic.keep = true;
        Audio.click(false);
      }
    }
    UI.drag = null; UI.scrollDrag = null; UI.dragCandidate = null;
    for (const w of UI.wins) for (const pp of w.parts) pp.pressed = 0;
  });

  Input.on('wheel', (e) => {
    if (Boot.phase !== 'desktop') return;
    e.preventDefault();
    const p = P();
    const w = topModal() || windowAt(p.x, p.y);
    if (w && w.scrollable) scrollBy(w, e.deltaY > 0 ? 24 : -24);
  });

  Input.on('key', (e) => {
    if (Boot.phase === 'warn') {
      if (e.key === 'Enter' || e.key === ' ') { const b = Boot.warnBtns; if (b) { UI.mouse.rawX = b.btn.x + 4; UI.mouse.rawY = b.btn.y + 4; Boot.press(); } }
      return;
    }
    if (Boot.phase !== 'desktop') return;

    if (UI.focusField) {
      const f = UI.focusField;
      if (e.key === 'Backspace') { f.value = f.value.slice(0, -1); e.preventDefault(); Audio.blip(300, 0.012, 0.03); return; }
      if (e.key === 'Enter') {
        const w = UI.wins.find(ww => ww.parts.includes(f));
        UI.focusField = null;
        const def = w && w.parts.find(pp => pp.type === 'btn' && pp.def && !pp.disabled);
        if (def) def.fn();
        return;
      }
      if (e.key === 'Escape') { UI.focusField = null; return; }
      if (e.key.length === 1) { f.value = (f.value + e.key.toUpperCase()).slice(0, 40); Audio.blip(1800 + rndi(600), 0.008, 0.02, 'square'); e.preventDefault(); }
      return;
    }

    if (e.key === 'Escape') {
      if (UI.openMenu) { closeMenu(); return; }
      const w = topModal() || frontWin();
      if (w) tryClose(w);
      return;
    }
    if (e.key === 'Enter') {
      const w = topModal() || frontWin();
      if (!w) return;
      const def = w.parts.find(pp => pp.type === 'btn' && pp.def && !pp.disabled);
      if (def) { def.pressed = 90; Audio.click(true); def.fn(); }
      return;
    }
    if (e.key.indexOf('Arrow') === 0) {
      const w = topModal() || frontWin();
      if (w && w.scrollable) { scrollBy(w, e.key === 'ArrowDown' ? 22 : e.key === 'ArrowUp' ? -22 : 0); e.preventDefault(); }
      return;
    }
    Events.emit('key', { key: e.key });
  });
}

/* ---------------- máscaras ---------------- */
function blinkMask(mode) {
  if (mode === 'blank') {
    fbClear(255);
    for (let y = 0; y < FB.H; y++) for (let x = 0; x < FB.W; x++) if (((x + y) & 1) === 0) FB.buf[y * FB.W + x] = 128;
    return;
  }
  fbClear(255);
  for (let i = 0; i < 2400; i++) { const x = rndi(FB.W), y = rndi(FB.H); FB.buf[y * FB.W + x] = chance(0.5) ? 0 : 255; }
  for (let k = 0; k < 5; k++) { const y = rndi(FB.H), h = 2 + rndi(9); fillRect(0, y, FB.W, h, chance(0.5) ? 0 : 1); }
}

/* ---------------- bucle ---------------- */
let prev = performance.now(), mixT = 0;

function frame(now) {
  const dt = Math.min(64, now - prev); prev = now;

  // sincronizar entrada → UI
  UI.mouse.rawX = Input.mouse.rawX; UI.mouse.rawY = Input.mouse.rawY;
  UI.mouse.down = Input.mouse.down; UI.mouse.inside = Input.mouse.inside;
  if (Input.mouse.moved) { UI.mouse.moved = true; Input.mouse.moved = false; }

  const live = Boot.phase === 'desktop' || Endgame.active;

  if (live) {
    Story.tick(dt);
    if (Story.ghostCursor) { UI.mouse.rawX = Story.ghostCursor.x; UI.mouse.rawY = Story.ghostCursor.y; }
    Blink.tick(dt);
    uiTick(dt);
    if (Boot.phase === 'desktop') {
      Desktop.tick(dt, UI.cursor);
      if (!Clock.frozen) Clock.elapsed += dt;
      // arrastre
      if (UI.drag) {
        const d = UI.drag;
        if (d.win) { d.win.x = clamp(UI.cursor.x - d.dx, -d.win.w + 52, FB.W - 52); d.win.y = clamp(UI.cursor.y - d.dy, FB.menuBarH, FB.H - 20); }
        else if (d.icon) { d.icon.x = clamp(UI.cursor.x - d.dx, 2, FB.W - 38); d.icon.y = clamp(UI.cursor.y - d.dy, FB.menuBarH + 2, FB.H - 50); d.icon.keep = true; }
      } else if (UI.dragCandidate && Input.mouse.down) {
        const c = UI.dragCandidate;
        if (Math.hypot(UI.cursor.x - c.sx, UI.cursor.y - c.sy) > 4) { UI.drag = { icon: c.ic, dx: c.dx, dy: c.dy }; UI.dragCandidate = null; }
      }
      if (UI.scrollDrag) {
        const s = UI.scrollDrag, b = body(s.w);
        const range = Math.max(1, s.w.contentH - b.h);
        s.w.scrollY = clamp(((UI.cursor.y - s.dy) - (s.w._thumb ? s.w._thumb.ty : b.y)) / Math.max(1, s.w._thumb ? s.w._thumb.th : 1) * range, 0, range);
      }
    }
  }

  const hd = Config.get('ui.hitDrift', null);
  if (hd && Boot.phase === 'desktop') UI.hitDrift = Story.tension > (hd.above || 0.55) ? (Story.tension - (hd.above || 0.55)) * (hd.scale || 8) : 0;

  Boot.tick(dt);
  if (Endgame.active && Endgame.step >= 1) Endgame.tick(dt);   // además dibuja

  mixT -= dt;
  if (mixT <= 0) { mixT = 110; Audio.mix(clamp(Story.tension + (Endgame.active ? 0.12 : 0), 0, 1)); }

  /* ---- dibujo ---- */
  if (Boot.phase === 'post2') {
    Boot.draw(now);
  } else if (Endgame.active && Endgame.step >= 1) {
    /* Endgame.tick(dt) ya dibujó este cuadro */
  } else if (Boot.phase === 'desktop') {
    Desktop.draw(UI.cursor, UI.drag && UI.drag.icon ? UI.drag.icon : null);
    uiDraw();
    Subliminal.draw();
    if (Blink.on) blinkMask(Blink.mode);
    else drawCursor(UI.cursor.x, UI.cursor.y);
  } else {
    Boot.draw(now);
    if (Blink.on) blinkMask(Blink.mode);
  }

  /* ---- presentación ---- */
  const pal = sampleActs(Config.get('display.palette.acts'), clamp(Story.tension, 0, 1), ['paper', 'ink', 'contrast', 'lift']);
  const flick = CRT.flick(dt, Story.tension) + (CRTBoost.flicker ? (chance(0.5) ? -CRTBoost.flicker : CRTBoost.flicker) : 0);
  present({
    paper: pal.paper || [214, 200, 168],
    ink: pal.ink || [10, 10, 11],
    contrast: pal.contrast == null ? 1 : pal.contrast,
    lift: pal.lift || 0,
    noise: CRT.noise(Story.tension),
    flick,
    curvature: Config.get('display.crt.curvature', 0.14),
    glitch: CRT.glitchChance(Story.tension) + CRTBoost.glitch
  });
  CRT.tick();

  requestAnimationFrame(frame);
}

main().catch(e => {
  console.error(e);
  const el = document.getElementById('fatal');
  if (el) { el.style.display = 'block'; el.textContent = 'No se pudo cargar la configuración: ' + e.message; }
});
