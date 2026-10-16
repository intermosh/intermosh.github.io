/* vesper128 · game/boot — máquina de fases de arranque y apagado, leída de
   boot.* en game.json. Sin texto embebido. */

import { clamp, rndi, chance } from '../core/util.js';
import { FB, fbClear, fillRect, strokeRect, hline, vline, text, textC, textW, textBig, drawIcon } from '../core/framebuffer.js';
import { Config } from '../core/config.js';
import { Audio } from '../core/audio.js';
import { UI, dialog } from '../os/ui.js';
import { Story } from './story.js';

export const Boot = {
  phase: 'warn',
  t: 0,
  boot: { line: 0, ch: 0, timer: 200, hold: 0 },
  happyT: 0, powerT: 0, powerSnd: false,
  warnBtns: null,
  reducedFlicker: false,
  bootCount: 0,
  onDesktop: null,

  reset() { this.phase = 'warn'; this.boot = { line: 0, ch: 0, timer: 200, hold: 0 }; this.happyT = 0; this.powerT = 0; this.powerSnd = false; },

  press() {
    if (this.phase !== 'warn') return false;
    const b = this.warnBtns; if (!b) return false;
    const p = { x: UI.mouse.rawX, y: UI.mouse.rawY };
    if (p.x >= b.chk.x && p.x < b.chk.x + b.chk.w && p.y >= b.chk.y && p.y < b.chk.y + b.chk.h) {
      this.reducedFlicker = !this.reducedFlicker;
      Audio.init(); Audio.click(false);
      return true;
    }
    if (p.x >= b.btn.x && p.x < b.btn.x + b.btn.w && p.y >= b.btn.y && p.y < b.btn.y + b.btn.h) {
      Audio.init(); Audio.setReduced(this.reducedFlicker); Audio.relay();
      this.phase = 'power'; this.powerT = 0; fbClear(0);
      return true;
    }
    return true;
  },

  tick(dt) {
    this.t += dt;
    if (this.phase === 'power') {
      this.powerT += dt;
      if (this.powerT > 220 && !this.powerSnd) { this.powerSnd = true; Audio.relay(); }
      if (this.powerT > 900) { this.phase = 'post'; this.boot = { line: 0, ch: 0, timer: 200, hold: 0 }; }
    } else if (this.phase === 'post') {
      tickLines(this.boot, Config.get('boot.post.lines', []), dt, () => { this.phase = 'happy'; this.happyT = 0; });
    } else if (this.phase === 'happy') {
      this.happyT += dt;
      if (this.happyT > (Config.get('boot.happy.duration', 2200))) { this.phase = 'desktop'; this.onDesktop && this.onDesktop(); }
    } else if (this.phase === 'post2') {
      tickLines(this.boot, post2Lines(), dt, () => { Endgame.step = 4; Endgame.t = 0; this.phase = 'ending'; });
    }
  },

  draw(now) {
    if (this.phase === 'warn') drawWarn(now);
    else if (this.phase === 'power') fbClear(0);
    else if (this.phase === 'post') drawLines(Config.get('boot.post.lines', []), this.boot, now);
    else if (this.phase === 'happy') drawHappy(now, this.happyT);
    else if (this.phase === 'post2') drawLines(post2Lines(), this.boot, now, 60);
  }
};

function post2Lines() {
  return (Config.get('boot.post2.lines', []) || []).map(l => ({
    ...l,
    t: String(l.t).replace('%NOW%', new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }))
      .replace('%VISITOR%', Story.visitorName)
  }));
}

function tickLines(b, lines, dt, onDone) {
  if (b.hold > 0) { b.hold -= dt; return; }
  b.timer -= dt;
  if (b.timer > 0) return;
  const L = lines[b.line];
  if (!L) { onDone(); return; }
  const txt = L.t || '';
  if (b.ch < txt.length) { b.ch += (L.big ? 2 : 1 + rndi(3)); if (b.ch > txt.length) b.ch = txt.length; b.timer = 12 + Math.random() * 22; if (chance(0.25)) Audio.blip(2400 + rndi(900), 0.008, 0.012, 'square'); }
  else {
    if (L.snd === 'disk') Audio.disk('read', 0.5);
    if (L.snd === 'knock') { Audio.knock(120, 0.6, 0.22); }
    if (L.snd === 'grind') Audio.disk('grind', 1.4);
    if (L.hold) b.hold = L.hold;
    b.line++; b.ch = 0; b.timer = L.d != null ? L.d : 200;
    if (b.line >= lines.length) onDone();
  }
}

function drawLines(lines, b, now, y0 = 40) {
  fbClear(0);
  let y = y0;
  for (let i = 0; i < b.line && i < lines.length; i++) {
    const L = lines[i];
    if (L.big) { textBig(L.t, 40, y, 1, 2); y += 30; continue; }
    text(L.t, 40, y, 1); y += FB.font.lineHeight + 2;
  }
  if (b.line < lines.length) {
    const L = lines[b.line];
    if (L.big) textBig((L.t || '').slice(0, b.ch), 40, y, 1, 2);
    else text((L.t || '').slice(0, b.ch), 40, y, 1);
    if (((now / 400) | 0) % 2 === 0) {
      const xw = L.big ? b.ch * FB.font.advance * 2 : b.ch * FB.font.advance;
      fillRect(40 + xw + 2, y + (L.big ? 6 : 1), 6, L.big ? 16 : 8, 1);
    }
  }
}

function drawWarn(now) {
  fbClear(0);
  const wcfg = Config.get('boot.warn', {});
  const lines = wcfg.lines || [];
  lines.forEach((l, i) => textC(l, FB.W / 2, 70 + i * FB.font.lineHeight, 1));
  const y = 70 + lines.length * FB.font.lineHeight + 26;
  const bw = 150, bx = Math.round(FB.W / 2 - bw / 2);
  const m = UI.mouse;
  const hov = m.rawX >= bx && m.rawX < bx + bw && m.rawY >= y && m.rawY < y + 20;
  fillRect(bx, y, bw, 20, hov ? 0 : 1);
  strokeRect(bx, y, bw, 20, 1);
  textC(wcfg.button || 'ENCENDER', bx + bw / 2, y + 5, hov ? 1 : 0);
  const y2 = y + 34, cbx = Math.round(FB.W / 2 - 108);
  strokeRect(cbx, y2, 10, 10, 1);
  if (Boot.reducedFlicker) fillRect(cbx + 2, y2 + 2, 6, 6, 1);
  text(wcfg.reduced || 'modo reducido (menos parpadeo)', cbx + 16, y2 + 1, 1);
  Boot.warnBtns = { btn: { x: bx, y, w: bw, h: 20 }, chk: { x: cbx, y: y2, w: 226, h: 14 } };
}

function drawHappy(now, t) {
  fbClear(1);
  const h = Config.get('boot.happy', {});
  const sc = 4, iw = 32 * sc, ih = 32 * sc;
  const x = Math.round(FB.W / 2 - iw / 2), y = Math.round(FB.H / 2 - ih / 2 - 10);
  const wrong = Story.tension > 0.9 || Boot.bootCount > 0;
  drawIcon(wrong ? (h.wrongIcon || h.icon) : (h.icon || 'happy'), x, y, sc);
  if (t > 700 && h.label) textC(h.label, FB.W / 2, y + ih + 18, 0);
}

/* ---------------- final ---------------- */
export const Endgame = {
  step: 0, t: 0, active: false,
  begin() {
    if (this.active) return;
    this.active = true;
    Story.note('· · ·');
    Audio.duck(0.5, 2);
    const closeAll = () => {
      if (UI.wins.length) { closeWinSilent(UI.wins[0]); Audio.blip(300, 0.03, 0.05); setTimeout(closeAll, 220); }
      else setTimeout(() => this.copyDialog(), 900);
    };
    closeAll();
  },
  copyDialog() {
    const cfg = Config.get('ending', {});
    dialog({
      title: cfg.title || 'COPIAR', text: cfg.text || '', buttons: cfg.buttons || ['Copiar'],
      x: Math.round(FB.W / 2 - 130), y: 120, w: 260,
      onButton: () => this.startCopy()
    });
    UI.draggableDialogs = true;
  },
  startCopy() { this.step = 1; this.t = 0; Boot.phase = 'ending'; Audio.disk('write', 3.4); Story.session++; },
  tick(dt) {
    this.t += dt;
    if (this.step === 1) {
      fbClear(1);
      const p = clamp(this.t / 3200, 0, 1);
      const bw = 260, bx = Math.round(FB.W / 2 - bw / 2), by = 150;
      strokeRect(bx, by, bw, 14, 0);
      fillRect(bx + 2, by + 2, Math.round((bw - 4) * p), 10, 0);
      const ec = Config.get('ending', {});
      textC((ec.copyLabel || 'COPIANDO') + '  ' + Math.round(p * 100) + ' %', FB.W / 2, by - 22, 0);
      if (ec.copySub) textC(ec.copySub, FB.W / 2, by + 30, 0);
      if (p >= 1 && this.t > 3600) { this.step = 2; this.t = 0; Audio.slam(); }
    } else if (this.step === 2) {
      const k = clamp(this.t / 700, 0, 1);
      fbClear(k > 0.5 ? 255 : 0);
      fillRect(0, 0, FB.W, FB.H, k);
      if (this.t > 1400) { this.step = 3; this.t = 0; Boot.phase = 'post2'; Boot.boot = { line: 0, ch: 0, timer: 300, hold: 0 }; Boot.bootCount = 1; }
    } else if (this.step === 4) {
      const k = clamp(this.t / 2600, 0, 1);
      fbClear(0);
      if (k < 0.55) {
        const hh = Math.max(1, Math.round(6 * (1 - k / 0.55)));
        fillRect(0, Math.round(FB.H / 2 - hh / 2), FB.W, hh, 1);
      } else {
        const kk = (k - 0.55) / 0.45;
        const ww = Math.max(1, Math.round(FB.W * (1 - kk)));
        fillRect(Math.round(FB.W / 2 - ww / 2), Math.round(FB.H / 2), ww, 2, 1);
      }
      if (k >= 1) { this.step = 5; this.t = 0; Audio.duck(0.0001, 2); }
    } else if (this.step === 5) {
      fbClear(0);
      if (this.t > 2600) {
        const ec = Config.get('ending', {});
        textC(ec.offLabel || 'SE APAGA', FB.W / 2, FB.H / 2, clamp(1 - (this.t - 2600) / 4000, 0, 1));
      }
    }
  },
  draw() { /* el tick dibuja */ }
};

function closeWinSilent(w) {
  const i = UI.wins.indexOf(w); if (i >= 0) UI.wins.splice(i, 1);
  const di = UI.dialogs.indexOf(w); if (di >= 0) UI.dialogs.splice(di, 1);
}
