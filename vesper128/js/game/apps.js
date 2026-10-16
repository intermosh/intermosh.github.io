/* vesper128 · game/apps — apps diegéticas. Todo su contenido (títulos, líneas,
   soportes, botones, sonidos, umbrales) proviene de apps.* en game.json.
   Este módulo sólo dibuja y emite eventos: no conoce la historia. */

import { clamp, rndi } from '../core/util.js';
import { FB, fillRect, strokeRect, hline, vline, text, textC, textW, wrap, drawIcon } from '../core/framebuffer.js';
import { Config } from '../core/config.js';
import { Audio } from '../core/audio.js';
import { Events } from '../core/events.js';
import { UI, newWin, dialog, closeWin, bringFront, winByTitle, body, addBtn } from '../os/ui.js';
import { FS } from '../os/filesystem.js';
import { Story } from './story.js';

/* ---------------- utilidades ---------------- */
function subs(str, map) {
  return String(str).replace(/%([A-Z_]+)%/g, (m, k) => (map[k] != null ? map[k] : m));
}

function playSounds(list) {
  (list || []).forEach(s => {
    switch (s.kind) {
      case 'signal': Audio.playSignal(s.seconds || 16, s.freqs || [18.97, 19.4], s.level); break;
      case 'knock': Audio.knock(s.freq || 150, s.dur || 0.5, s.vol || 0.2); break;
      case 'disk': Audio.disk(s.mode || 'read', s.dur || 0.8); break;
      case 'breath': Audio.breath(s.dur || 7, s.vol || 0.045); break;
      case 'blip': Audio.blip(s.freq || 880, s.dur || 0.04, s.vol || 0.06); break;
      case 'alert': Audio.alert(s.n || 1); break;
      case 'slam': Audio.slam(); break;
      default: break;
    }
  });
}

export function registerApps() {
  if (!Config.get('runtime.narrative', true)) return;
  const oy = Config.get('apps.oyente');
  if (oy) FS.registerApp(oy.appId || 'OYENTE', (path, opts) => oyenteApp(oy, path, opts));
  const lv = Config.get('apps.live');
  if (lv) FS.registerApp(lv.appId || 'VISITANTE', (path, opts) => liveApp(lv, path, opts));
  const ab = Config.get('apps.about');
  if (ab) FS.registerApp(ab.appId || 'ACERCA', (path, opts) => aboutApp(ab, path, opts));
}

/* ================= OYENTE ================= */
function oyenteApp(cfg, path, opts = {}) {
  const title = cfg.title || 'OYENTE';
  const ex = winByTitle(title);
  if (ex && !opts.force) { bringFront(ex); return ex; }

  const w = newWin({
    x: opts.x != null ? opts.x : (opts.fx != null ? clamp(opts.fx - 60, 6, FB.W - (cfg.width || 340) - 20) : 70),
    y: opts.y != null ? opts.y : (opts.fy != null ? clamp(opts.fy - 40, FB.menuBarH + 4, FB.H - (cfg.height || 246) - 10) : 56),
    w: cfg.width || 340, h: cfg.height || 246, title, kind: 'oyente',
    data: { cfg, started: false, t: 0 }, fx: opts.fx, fy: opts.fy
  });

  const buttons = cfg.buttons || [];
  const btnY = w.y + w.h - 30;
  let bx = w.x + 18;
  buttons.forEach(b => {
    const bw = b.width || Math.max(64, textW(b.label) + 26);
    addBtn(w, bx, btnY, bw, 18, b.label, () => {
      if (b.close) {
        if (w.data.started && b.failChance != null && Math.random() < b.failChance) {
          w.closeFails = (w.closeFails || 0) + 1;
          const d = Config.get('dialogs.' + (b.failDialog || 'appInUse'));
          if (d) dialog({ title: d.title || title, text: d.text || '', buttons: d.buttons || ['Aceptar'] });
          Events.emit('close:refused', { path, app: 'oyente' });
          return;
        }
        closeWin(w); Events.emit('close', { path, kind: 'oyente' }); return;
      }
      if (b.once && w.data.started) { Events.emit('app', { app: cfg.id || 'oyente', button: b.event || b.label, repeat: true, path }); return; }
      if (b.starts !== false) w.data.started = true;
      playSounds(b.sounds);
      Events.emit('app', { app: cfg.id || 'oyente', button: b.event || b.label, path });
      Events.emit('read', { app: cfg.id || 'oyente', path });
    }, { def: !!b.def });
    bx += bw + 10;
  });

  w.onTick = (dt) => { w.data.t += dt; };

  w.draw = (win, now) => {
    const b = body(win);
    const c = win.data.cfg;
    fillRect(b.x, b.y, b.w, b.h, 1);

    /* espectro */
    const sp = c.spectrum || {};
    const gx = b.x + (sp.x != null ? sp.x : 12);
    const gy = b.y + (sp.y != null ? sp.y : 10);
    const gw = b.w - (sp.x != null ? sp.x * 2 : 24);
    const gh = sp.h != null ? sp.h : 74;
    const N = sp.bars || 56;
    const hz = sp.hzPerBar || 0.9;
    const peak = sp.peak != null ? sp.peak : 18.97;
    strokeRect(gx, gy, gw, gh, 0);
    fillRect(gx + 1, gy + 1, gw - 2, gh - 2, 1);
    const bwid = Math.floor((gw - 6) / N);
    for (let i = 0; i < N; i++) {
      const f = i * hz;
      let hgt;
      if (!win.data.started) hgt = Math.random() * 3;
      else {
        const d = Math.abs(f - peak);
        hgt = 4 + Math.random() * 5 + (d < 0.5 ? (gh - 14) : (d < 2 ? 18 : 0));
        if (d < 0.5) hgt *= 0.94 + 0.06 * Math.sin(now * 0.004);
      }
      const hh = Math.min(gh - 6, hgt);
      fillRect(gx + 3 + i * bwid, gy + gh - 3 - hh, Math.max(1, bwid - 1), hh, 0);
    }
    const axisMax = sp.axisMax || 45, axisStep = sp.axisStep || 5;
    for (let f = 0; f <= axisMax; f += axisStep) {
      const x = gx + 3 + Math.floor(f / hz) * bwid;
      if (x > gx + gw - 12) break;
      vline(x, gy + gh - 3, gy + gh, 0.45);
      text(String(f), x - 2, gy + gh + 3, 0.45);
    }
    text(sp.axisUnit || 'Hz', gx + gw - 16, gy + gh + 3, 0.45);
    if (win.data.started) {
      const px = gx + 3 + Math.floor(peak / hz) * bwid;
      vline(px, gy + 2, gy + 8, 0);
      text(sp.peakLabel || String(peak).replace('.', ','), clamp(px - 14, gx + 4, gx + gw - 40), gy + 10, 0);
    }

    /* soportes */
    let y = gy + gh + 20;
    if (c.supportsLabel) { text(c.supportsLabel, b.x + 12, y, 0.45); y += FB.font.lineHeight + 2; }
    const sup = win.data.started ? (c.supports && c.supports.active) || [] : (c.supports && c.supports.idle) || [];
    sup.forEach(s => {
      text('· ' + s, b.x + 18, y, 0);
      if (c.supports && s === c.supports.activeMatch) text(c.supports.activeMark || '', b.x + 18 + textW('· ' + s), y, 0);
      y += FB.font.lineHeight;
    });

    /* presencia / estado */
    const secs = Math.floor(Story.t / 1000);
    const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
    const mm = String(Math.floor(secs / 60) % 60).padStart(2, '0');
    const ss = String(secs % 60).padStart(2, '0');
    if (c.presenceLabel) text(c.presenceLabel + '  ' + hh + ':' + mm + ':' + ss, b.x + 12, b.y + b.h - 44, 0);
    text(win.data.started ? (c.statusActive || '') : (c.statusIdle || ''), b.x + 190, b.y + b.h - 44, 0.45);
  };
  return w;
}

/* ================= REGISTRO DEL VISITANTE (en vivo) ================= */
function liveApp(cfg, path, opts = {}) {
  const title = cfg.titleFrom === 'visitorName'
    ? (Story.visitorName || 'VISITANTE').slice(0, cfg.titleMax || 22)
    : (cfg.title || 'REGISTRO');
  const ex = winByTitle(title);
  if (ex && !opts.force) { bringFront(ex); return ex; }

  const w = newWin({
    x: opts.x != null ? opts.x : (opts.fx != null ? clamp(opts.fx - 300, 8, FB.W - (cfg.width || 370) - 10) : 60),
    y: opts.y != null ? opts.y : (opts.fy != null ? clamp(opts.fy - 30, FB.menuBarH + 4, FB.H - (cfg.height || 244) - 10) : 50),
    w: cfg.width || 370, h: cfg.height || 244, title, kind: 'doc',
    data: { path, live: true }, scrollable: true, fx: opts.fx, fy: opts.fy
  });

  w._cols = -1; w._lines = null;
  w.getLines = () => {
    const b = body(w);
    const cols = Math.max(10, Math.floor((b.w - 12) / FB.font.advance));
    if (w._cols === cols && w._lines) return w._lines;
    w._cols = cols;
    const map = {
      TITLE: title,
      CITY: Story.visitorCity || '---',
      SESSION: String(Story.session + 1),
      OPERATOR: Story.log.length ? (cfg.operatorPresent || 'presente') : (cfg.operatorAbsent || 'sin confirmar'),
      NOW: new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };
    const head = (cfg.headLines || []).map(l => subs(l, map));
    const log = Story.log.slice(-(cfg.logLines || 40));
    const tail = (cfg.tailLines || []).map(l => subs(l, map));
    w._lines = head.concat(log, tail).flatMap(l => wrap(l, cols));
    return w._lines;
  };
  w.onTick = () => { w._lines = null; };   // se reescribe solo
  w.draw = (win) => {
    const b = body(win);
    fillRect(b.x, b.y, b.w, b.h, 1);
    const lines = win.getLines();
    win.contentH = lines.length * FB.font.lineHeight + 20;
    const start = Math.floor(win.scrollY / FB.font.lineHeight);
    const y0 = b.y + 6 - (win.scrollY % FB.font.lineHeight);
    for (let i = start; i < lines.length; i++) {
      const y = y0 + (i - start) * FB.font.lineHeight;
      if (y > b.y + b.h) break;
      if (y < b.y - FB.font.lineHeight) continue;
      text(lines[i], b.x + 6, y, /^={5,}/.test(lines[i]) ? 0.45 : 0);
    }
  };
  Events.emit('read', { path, app: 'live' });
  return w;
}

/* ================= ACERCA DE ================= */
function aboutApp(cfg, path, opts = {}) {
  const title = cfg.title || 'Acerca de esta máquina';
  const ex = winByTitle(title);
  if (ex && !opts.force) { bringFront(ex); return ex; }
  const w = newWin({
    x: Math.round(FB.W / 2 - (cfg.width || 320) / 2), y: cfg.y != null ? cfg.y : 74,
    w: cfg.width || 320, h: cfg.height || 186, title, kind: 'doc',
    data: { path }, fx: 20, fy: 10
  });
  w.draw = (win) => {
    const b = body(win);
    fillRect(b.x, b.y, b.w, b.h, 1);
    if (cfg.icon) drawIcon(cfg.icon, b.x + 12, b.y + 12, 1);
    const days = (cfg.daysBase != null ? cfg.daysBase : 11412) + Math.floor(Story.t / 60000);
    const users = Story.tension > (cfg.usersAbove != null ? cfg.usersAbove : 0.6) ? 2 : 1;
    const map = {
      OWNER: cfg.owner || '---',
      DAYS: String(days),
      SESSIONS: String(1 + Story.session),
      USERS: users + (users > 1 ? (cfg.usersSuffix || ' (usted y otro)') : ''),
      STATION: cfg.station || ''
    };
    (cfg.lines || []).forEach((l, i) => text(subs(l, map), b.x + (cfg.textX != null ? cfg.textX : 56), b.y + 10 + i * FB.font.lineHeight, i < 3 ? 0 : 0.35));
  };
  Events.emit('read', { path, app: 'about', doc: cfg.doc || null });
  return w;
}
