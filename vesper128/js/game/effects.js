/* vesper128 · game/effects — runtime de efectos. El catálogo (parámetros, nombres,
   categorías, macros) vive en data/effects.json; aquí sólo existen las
   implementaciones primitivas. Un efecto nuevo puede crearse sin tocar código
   componiendo primitivas vía "macro" en effects.json. */

import { clamp, rndi, pick, chance } from '../core/util.js';
import { FB, fillRect, text } from '../core/framebuffer.js';
import { Audio } from '../core/audio.js';
import { UI, dialog, closeWin, winByTitle, frontWin } from '../os/ui.js';
import { Events } from '../core/events.js';
import { Desktop } from '../os/desktop.js';
import { FS, Trash } from '../os/filesystem.js';
import { Config } from '../core/config.js';

export const Registry = {};
export function define(id, fn) { Registry[id] = fn; }

/* catálogo cargado (effects.json) */
let CATALOG = [];
export function loadCatalog(list) { CATALOG = list || []; }
export const catalog = () => CATALOG;
export const catalogEntry = (id) => CATALOG.find(e => e.id === id);

/* ---------------- sustituciones diegéticas ---------------- */
function sub(str, ctx) {
  return String(str == null ? '' : str).replace(/%([A-Z_]+)%/g, (m, k) => {
    switch (k) {
      case 'MIN': return String(Math.floor(ctx.Story.t / 60000));
      case 'SEC': return String(Math.floor(ctx.UI.stillFor / 1000));
      case 'CITY': return ctx.Story.visitorCity || '---';
      case 'VISITOR': return ctx.Story.visitorName || 'VISITANTE';
      case 'SESSION': return String(ctx.Story.session + 1);
      case 'NOW': return new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      case 'OPS': return String(3 + rndi(40));
      default: return m;
    }
  });
}

function runBranches(specs, ctx, i, val) {
  for (const b of specs) {
    const c = b.if || {};
    let ok = true;
    if (c.index != null) ok = ok && i === c.index;
    if (c.value != null) ok = ok && val != null && val.toUpperCase() === String(c.value).toUpperCase();
    if (c.notValue != null) ok = ok && !(val != null && val.toUpperCase() === String(c.notValue).toUpperCase());
    if (c.flag != null) ok = ok && ctx.Story.has(c.flag);
    if (!ok) continue;
    if (b.effects) runList(b.effects, ctx);
    else if (b.effect) runEffect(b.effect, b.params, ctx);
    return true;
  }
  return false;
}

/* ---------------- primitivas ---------------- */
define('tension', (p, ctx) => ctx.Story.raise(p.amount != null ? p.amount : 0.05, p.why));
define('flag', (p, ctx) => ctx.Story.set(p.name));
define('log', (p, ctx) => ctx.Story.note(sub(p.text, ctx)));

define('dialog', (p, ctx) => {
  const go = () => dialog({
    title: sub(p.title, ctx), text: sub(p.text, ctx), buttons: p.buttons || ['Aceptar'],
    w: p.width, x: p.x, y: p.y, icon: p.icon || null,
    field: p.field ? { ph: p.field.ph || '', secret: !!p.field.secret } : null,
    onButton: (i, label, d) => {
      const val = d && d.data && d.data.fieldRef ? String(d.data.fieldRef.value).trim() : null;
      if (val != null) Events.emit('password', { value: val.toUpperCase(), path: (p.field && p.field.path) || null });
      ctx.Story.note('eligió «' + label + '»' + (val ? ' · ' + val : ''));
      const specs = p.onButton;
      if (Array.isArray(specs)) runBranches(specs, ctx, i, val);
      else if (typeof specs === 'string') runEffect(specs, {}, ctx);
      else if (p.onButtonEffect) runEffect(p.onButtonEffect.effect, p.onButtonEffect.params, ctx);
      return p.stayOpen ? false : undefined;
    }
  });
  p.delay ? setTimeout(go, p.delay) : go();
});

define('reveal', (p, ctx) => FS.reveal(p.node, p.asIcon !== false));
define('hide', (p, ctx) => FS.hide(p.node));
define('unlock', (p, ctx) => { const n = FS.node(p.node); if (n) n.unlocked = true; });
define('lock', (p, ctx) => { const n = FS.node(p.node); if (n) n.unlocked = false; });

define('icon_add', (p, ctx) => { FS.reveal(p.node, true); });
define('icon_remove', (p, ctx) => Desktop.removeIcon(p.id || p.node));

define('icon_shift', (p, ctx) => {
  const blink = ctx.Blink;
  blink.run(p.blinkMs != null ? p.blinkMs : 140, () => {
    const vis = Desktop.icons.filter(i => i.visible && !i.fixed);
    if (vis.length < 2) return;
    const a = pick(vis);
    a.x = clamp(a.x + (p.dx != null ? p.dx : 8) * (chance(0.5) ? 1 : 4), 20, FB.W - 40);
    a.y = clamp(a.y + (p.dy != null ? p.dy : 0), FB.menuBarH + 14, FB.H - 60);
    a.keep = true;
    vis.forEach(i => { if (i !== a) i.y += rndi(3) - 1; });
  });
});

define('troxler', (p, ctx) => {
  const dist = p.distance != null ? p.distance : 130;
  Desktop.icons.filter(i => i.visible && Math.hypot(i.x - UI.cursor.x, i.y - UI.cursor.y) > dist)
    .forEach(i => { i.fade = 1; });
});

define('pareidolia', (p, ctx) => {
  Desktop.addCluster({
    x: p.x != null ? p.x : rndi(FB.W - 120) + 40,
    y: p.y != null ? p.y : FB.menuBarH + 30 + rndi(FB.H - 140),
    r: p.radius != null ? p.radius : 26 + rndi(46),
    life: p.life != null ? p.life : 26000
  });
});

define('subliminal', (p, ctx) => ctx.Subliminal.flash(p));

define('latency', (p, ctx) => {
  UI.latency = (p.min != null ? p.min : 70) + rndi((p.max != null ? p.max : 160) - (p.min != null ? p.min : 70));
  setTimeout(() => { UI.latency = ctx.Story.tension > 0.7 ? 26 + rndi(40) : 0; }, p.duration != null ? p.duration : 9000);
});

define('hitdrift', (p, ctx) => {
  UI.hitDrift = p.amount != null ? p.amount : 3;
  if (p.duration) setTimeout(() => { UI.hitDrift = 0; }, p.duration);
});

define('menu_disable', (p, ctx) => {
  ctx.MenuState.disabledUntil = ctx.Story.t + (p.duration != null ? p.duration : 15000);
  ctx.MenuState.disabledPick = rndi(3);
});
define('menu_add', (p, ctx) => { ctx.MenuState.extra.add(p.key); ctx.rebuildMenus(); });
define('menu_remove', (p, ctx) => { ctx.MenuState.extra.delete(p.key); ctx.rebuildMenus(); });

define('clock', (p, ctx) => {
  const C = ctx.Clock;
  if (p.mode) C.mode = p.mode;
  if (p.frozen != null) C.frozen = !!p.frozen;
  if (p.drift != null) C.drift += p.drift;
});

define('knock', (p) => Audio.knock(p.freq != null ? p.freq : 160, p.dur != null ? p.dur : 0.5, p.vol != null ? p.vol : 0.2));
define('breath', (p) => Audio.breath(p.dur != null ? p.dur : 7, p.vol != null ? p.vol : 0.045));
define('sound', (p) => Audio.disk(p.kind || 'read', p.dur != null ? p.dur : 1.0));
define('play', (p, ctx) => { Audio.playSignal(p.seconds || 9, p.freqs || [18.97, 19.4]); if (p.flag) ctx.Story.set(p.flag); });

define('trash_add', (p) => { (p.items || ['?']).forEach(i => Trash.items.push(i)); if (Trash.items.length > 6) Trash.items.shift(); });
define('trash_clear', () => { Trash.items = []; });
define('trash_return', (p, ctx) => {
  Audio.disk('grind', 1.8);
  const n = Trash.items.length; Trash.items = [];
  const msg = n ? `Se vaciaron ${n} ítems. ${n} ítems volvieron.` : 'La papelera estaba vacía.\nAun así, hay ítems nuevos.';
  setTimeout(() => {
    dialog({ title: 'PAPELERA', text: msg, buttons: ['Aceptar'], onButton: () => { Trash.items = (p.items || ['COPIA.TXT']); } });
  }, p.delay != null ? p.delay : 1900);
});

define('selfwrite', (p, ctx) => {
  FS.registroExtra.push({ name: (p.prefix || 'SESIÓN') + ' ' + (100 + rndi(800)), size: rndi(4) + 1 });
  Audio.disk('write', 0.8);
});

define('ghost_window', (p, ctx) => {
  const path = p.path;
  if (!path || winByTitle(path)) return;
  ctx.FS.open(path, { force: true });
  const w = winByTitle(path) || frontWin();
  if (w) setTimeout(() => { if (UI.wins.includes(w) && !UI.dialogs.length) closeWin(w); }, p.duration != null ? p.duration : 3000);
});

define('ghost_cursor', (p, ctx) => {
  const ic = p.targetIcon ? Desktop.icon(p.targetIcon) : pick(Desktop.icons.filter(i => i.visible));
  const t = ic ? { x: ic.x + 16, y: ic.y + 16 } : { x: FB.W / 2, y: FB.H / 2 };
  ctx.Story.ghostCursor = { x: ctx.UI.cursor.x, y: ctx.UI.cursor.y, tx: t.x, ty: t.y, t: 0, dur: p.duration != null ? p.duration : 2600 };
});

define('flicker', (p, ctx) => { ctx.CRTBoost.flicker = p.amount != null ? p.amount : 0.05; setTimeout(() => { ctx.CRTBoost.flicker = 0; }, p.duration != null ? p.duration : 900); });
define('glitch', (p, ctx) => { ctx.CRTBoost.glitch = p.amount != null ? p.amount : 0.4; setTimeout(() => { ctx.CRTBoost.glitch = 0; }, p.duration != null ? p.duration : 700); });
define('blank', (p, ctx) => { ctx.Blink.run(p.duration != null ? p.duration : 1200, null, 'blank'); });

define('audio_gain', (p, ctx) => ctx.AudioOverride.set(p.layer, p.gain));

define('doc_open', (p, ctx) => ctx.FS.open(p.path, { force: !!p.force }));
define('open', (p, ctx) => ctx.FS.open(p.path, {}));

define('list', (p, ctx) => {
  const rows = (p.rows || []).map(r => ({ name: sub(r.name, ctx), size: sub(r.size, ctx) }));
  ctx.FS.openList(sub(p.title, ctx), rows, { note: p.note ? sub(p.note, ctx) : null, w: p.width, h: p.height });
});

define('unprompted', (p, ctx) => {
  if (ctx.UI.dialogs.length) return;
  const all = Config.get('dialogs.invitados', []) || [];
  const pool = all.filter(d => ctx.Story.condsTrue(d.conditions || []));
  if (!pool.length) return;
  const d = pick(pool);
  dialog({
    title: sub(d.title, ctx), text: sub(d.text, ctx), buttons: d.buttons || ['Aceptar'], w: d.width,
    onButton: (i, label) => {
      ctx.Story.note('respondió «' + label + '»');
      runBranches(d.onButton || [], ctx, i, null);
    }
  });
});

define('visitor_icon', (p, ctx) => {
  const name = ctx.Story.visitorCity || 'VISITANTE';
  if (ctx.Desktop.icon(p.id || 'visitor')) return;
  ctx.Desktop.addIcon({ id: p.id || 'visitor', name, icon: p.icon || 'folder', node: p.node });
});

define('ending', (p, ctx) => ctx.Endgame.begin());

/* ---------------- dispatcher ---------------- */
export function runEffect(id, params, ctx) {
  const entry = catalogEntry(id);
  if (entry && entry.macro && entry.macro.length) {
    for (const step of entry.macro) runEffect(step.effect, Object.assign({}, step.params, params && params.__override ? params : {}), ctx);
    return;
  }
  const fn = Registry[id];
  if (!fn) { console.warn('[effects] efecto sin implementación o retirado del catálogo:', id); return; }
  try { fn(params || {}, ctx); } catch (e) { console.warn('[effects]', id, e); }
}

export function runList(list, ctx) {
  if (!list) return;
  for (const inst of list) {
    if (inst.enabled === false) continue;
    if (inst.delay) setTimeout(() => runEffect(inst.effect, inst.params, ctx), inst.delay);
    else runEffect(inst.effect, inst.params, ctx);
  }
}
