/* vesper128 · core/audio — motor de audio 100 % procedural (Web Audio, sin samples).
   Las capas y sus curvas de mezcla se leen de display/audio en game.json. */

import { clamp, lerp, smooth } from './util.js';

let ctx = null, master = null;
export const GainOverride = new Map();
const g = {}, n = {};
let started = false, reduced = false, cfg = null;

function pinkBuffer(seconds) {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.96900 * b2 + w * 0.1538520; b3 = 0.86650 * b3 + w * 0.3104856;
    b4 = 0.55000 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.0168980;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.09;
    b6 = w * 0.115926;
  }
  return buf;
}
const noiseSrc = (loop, secs = 4) => { const s = ctx.createBufferSource(); s.buffer = pinkBuffer(secs); s.loop = !!loop; return s; };
function env(dur, peak = 0.3, atk = 0.004) {
  const gn = ctx.createGain(); const t = ctx.currentTime;
  gn.gain.setValueAtTime(0.0001, t);
  gn.gain.exponentialRampToValueAtTime(peak, t + atk);
  gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  return gn;
}

export const Audio = {
  get ready() { return started; },
  get ctx() { return ctx; },
  setReduced(v) { reduced = !!v; },

  configure(audioCfg) { cfg = audioCfg || {}; },

  init() {
    if (started) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { return; }
    const L = (cfg && cfg.layers) || {};
    master = ctx.createGain(); master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.knee.value = 22; comp.ratio.value = 6;
    comp.attack.value = 0.006; comp.release.value = 0.25;
    master.connect(comp); comp.connect(ctx.destination);

    // sub (infrasonido) + armónico
    const sub = L.sub || { freqs: [18.97, 19.4], harmonic: { freq: 37.94 } };
    g.sub = ctx.createGain(); g.sub.gain.value = 0.0001; g.sub.connect(master);
    const mix = ctx.createGain(); mix.gain.value = 0.5; mix.connect(g.sub);
    (sub.freqs || [18.97, 19.4]).forEach(f => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(mix); o.start(); });
    g.subH = ctx.createGain(); g.subH.gain.value = 0.0001; g.subH.connect(master);
    n.subH = ctx.createOscillator(); n.subH.type = 'sine'; n.subH.frequency.value = (sub.harmonic && sub.harmonic.freq) || 37.94;
    n.subH.connect(g.subH); n.subH.start();

    // red
    const mains = L.mains || { freqs: [50, 100, 150] };
    g.mains = ctx.createGain(); g.mains.gain.value = 0.0001; g.mains.connect(master);
    (mains.freqs || [50, 100, 150]).forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = i === 0 ? 'sawtooth' : 'sine'; o.frequency.value = f;
      const gg = ctx.createGain(); gg.gain.value = i === 0 ? 0.5 : 0.28 / (i + 1);
      o.connect(gg); gg.connect(g.mains); o.start();
    });

    // flyback
    const fly = L.flyback || { freq: 15625 };
    g.fly = ctx.createGain(); g.fly.gain.value = 0.0001; g.fly.connect(master);
    n.fly = ctx.createOscillator(); n.fly.type = 'sine'; n.fly.frequency.value = fly.freq || 15625;
    n.fly.connect(g.fly); n.fly.start();

    // cama de ruido rosa filtrada
    const bed = L.bed || { filter: [300, 2100] };
    g.bed = ctx.createGain(); g.bed.gain.value = 0.0001; g.bed.connect(master);
    n.bedF = ctx.createBiquadFilter(); n.bedF.type = 'lowpass'; n.bedF.frequency.value = bed.filter[0]; n.bedF.Q.value = 0.7;
    n.bedSrc = noiseSrc(true, 6); n.bedSrc.connect(n.bedF); n.bedF.connect(g.bed); n.bedSrc.start();

    // cluster batiente
    const cl = L.cluster || { freqs: [110, 116.5, 164.8] };
    g.cluster = ctx.createGain(); g.cluster.gain.value = 0.0001; g.cluster.connect(master);
    (cl.freqs || [110, 116.5, 164.8]).forEach((f, i) => {
      const o = ctx.createOscillator(); o.type = f > 150 ? 'triangle' : 'sine'; o.frequency.value = f;
      const gg = ctx.createGain(); gg.gain.value = f > 150 ? 0.18 : 0.4;
      o.connect(gg); gg.connect(g.cluster); o.start();
    });

    // acúfeno
    const tin = L.tinnitus || { freq: 12400 };
    g.tin = ctx.createGain(); g.tin.gain.value = 0.0001; g.tin.connect(master);
    n.tin = ctx.createOscillator(); n.tin.type = 'sine'; n.tin.frequency.value = tin.freq || 12400;
    n.tin.connect(g.tin); n.tin.start();

    // susurro (formantes de ruido)
    const wh = L.whisper || { formants: [520, 1180, 2450] };
    g.whisp = ctx.createGain(); g.whisp.gain.value = 0.0001; g.whisp.connect(master);
    n.whSrc = noiseSrc(true, 6);
    const wg = ctx.createGain(); wg.gain.value = 0.9; wg.connect(g.whisp);
    const fs = (wh.formants || [520, 1180, 2450]).map((f, i) => {
      const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = 7 + i * 2;
      n.whSrc.connect(b); b.connect(wg); return b;
    });
    n.whSrc.start();
    const lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 0.07;
    const lg = ctx.createGain(); lg.gain.value = 190; lfo.connect(lg); lg.connect(fs[1].frequency); lfo.start();

    started = true;
    master.gain.setTargetAtTime((cfg && cfg.master) || 0.85, ctx.currentTime, 0.6);
  },

  /** mezcla continua en función de la tensión 0..1 usando las curvas de game.json */
  mix(t) {
    if (!started) return;
    const L = (cfg && cfg.layers) || {};
    const now = ctx.currentTime, T = 0.9;
    const set = (gn, v) => gn.gain.setTargetAtTime(Math.max(0.00005, v), now, T);
    const sub = L.sub || {}, mains = L.mains || {}, fly = L.flyback || {}, bed = L.bed || {}, cl = L.cluster || {}, tin = L.tinnitus || {}, wh = L.whisper || {};
    const sg = sub.gain || [0.02, 0.30];
    set(g.sub, lerp(sg[0], reduced ? sg[1] * 0.4 : sg[1], smooth(t)));
    const hg = (sub.harmonic && sub.harmonic.gain) || [0.004, 0.035];
    set(g.subH, lerp(hg[0], hg[1], smooth(t)));
    const mg = mains.gain || [0.030, 0.012];
    set(g.mains, lerp(mg[0], mg[1], t));
    const fg = fly.gain || [0.0035, 0.010];
    set(g.fly, lerp(fg[0], fg[1], t));
    const bg = bed.gain || [0.012, 0.055];
    set(g.bed, lerp(bg[0], bg[1], smooth(t)));
    const bf = bed.filter || [300, 2100];
    n.bedF.frequency.setTargetAtTime(lerp(bf[0], bf[1], t * t), now, 1.6);
    const cg = cl.gain || [0, 0.055]; const cs = cl.start != null ? cl.start : 0.32;
    set(g.cluster, t < cs ? 0.00005 : lerp(cg[0], cg[1], smooth((t - cs) / (1 - cs))));
    const tg = tin.gain || [0, 0.0045]; const ts = tin.start != null ? tin.start : 0.5;
    set(g.tin, t < ts ? 0.00005 : lerp(tg[0], tg[1], (t - ts) / (1 - ts)));
    n.tin.frequency.setTargetAtTime((tin.freq || 12400) + (t - ts) * (tin.drift || 900), now, 3);
    const wg2 = wh.gain || [0, 0.030]; const ws = wh.start != null ? wh.start : 0.62;
    set(g.whisp, t < ws ? 0.00005 : lerp(wg2[0], wg2[1], smooth((t - ws) / (1 - ws))));
    // overrides absolutos definidos por efectos (audio_gain)
    for (const [k, v] of GainOverride) { if (g[k]) set(g[k], v); }
  },

  duck(v, secs = 1) { if (started) master.gain.setTargetAtTime(v, ctx.currentTime, secs * 0.3); },

  /* ---------- eventos ---------- */
  click(loud) {
    if (!started) return;
    const len = Math.floor(ctx.sampleRate * 0.03);
    const b = ctx.createBuffer(1, len, ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 9);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = loud ? 2600 : 1900; f.Q.value = 1.1;
    const gn = ctx.createGain(); gn.gain.value = loud ? 0.30 : 0.16;
    s.connect(f); f.connect(gn); gn.connect(master); s.start();
  },
  blip(freq = 880, dur = 0.05, vol = 0.07, type = 'square') {
    if (!started) return;
    const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
    const gn = env(dur, vol); o.connect(gn); gn.connect(master); o.start(); o.stop(ctx.currentTime + dur + 0.05);
  },
  beepSeq(pattern = [1]) { let t = 0; for (const p of pattern) { if (p > 0) setTimeout(() => this.blip(p, 0.07, 0.11, 'square'), t); t += 130; } },
  alert(nn = 1) { this.beepSeq(Array(nn).fill(660)); },
  relay() {
    if (!started) return;
    const len = Math.floor(ctx.sampleRate * 0.09);
    const b = ctx.createBuffer(1, len, ctx.sampleRate); const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 4) * Math.sin(i * 0.02);
    const s = ctx.createBufferSource(); s.buffer = b;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const gn = ctx.createGain(); gn.gain.value = 0.4;
    s.connect(f); f.connect(gn); gn.connect(master); s.start();
  },
  disk(kind = 'read', dur = 1.4) {
    if (!started) return;
    const s = noiseSrc(false, Math.max(2, dur));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = kind === 'write' ? 900 : 1500; f.Q.value = 2.2;
    const gn = ctx.createGain(); const t = ctx.currentTime;
    const peak = kind === 'write' ? 0.16 : 0.10;
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(peak, t + 0.08);
    gn.gain.setValueAtTime(peak, t + dur - 0.2);
    gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lfo = ctx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 5;
    const lg = ctx.createGain(); lg.gain.value = 0.55; lfo.connect(lg); lg.connect(gn.gain);
    s.connect(f); f.connect(gn); gn.connect(master); s.start(); lfo.start();
    s.stop(t + dur); lfo.stop(t + dur);
    if (kind === 'grind') {
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(60, t + dur);
      const og = ctx.createGain(); og.gain.value = 0.03; o.connect(og); og.connect(master); o.start(); o.stop(t + dur);
    }
  },
  knock(freq = 180, dur = 0.5, vol = 0.18) {
    if (!started) return;
    const o = ctx.createOscillator(); o.type = 'triangle'; const t = ctx.currentTime;
    o.frequency.setValueAtTime(freq * 1.6, t); o.frequency.exponentialRampToValueAtTime(freq, t + dur);
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq * 2.2; f.Q.value = 3;
    const gn = env(dur, vol, 0.002); o.connect(f); f.connect(gn); gn.connect(master); o.start(); o.stop(t + dur + 0.1);
  },
  breath(dur = 6, vol = 0.05) {
    if (!started) return;
    const s = noiseSrc(false, Math.max(7, dur));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.4; const t = ctx.currentTime;
    f.frequency.setValueAtTime(180, t); f.frequency.linearRampToValueAtTime(620, t + dur * 0.55); f.frequency.linearRampToValueAtTime(140, t + dur);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.linearRampToValueAtTime(vol, t + dur * 0.5); gn.gain.linearRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(gn); gn.connect(master); s.start(); s.stop(t + dur + 0.1);
  },
  slam() {
    if (!started) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(24, t + 1.8);
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(0.5, t + 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(gn); gn.connect(master); o.start(); o.stop(t + 2.4);
    const s = noiseSrc(false, 3);
    const nf = ctx.createBiquadFilter(); nf.type = 'lowpass';
    nf.frequency.setValueAtTime(4000, t); nf.frequency.exponentialRampToValueAtTime(120, t + 1.4);
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.4, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
    s.connect(nf); nf.connect(ng); ng.connect(master); s.start(); s.stop(t + 1.8);
  },
  chime() {
    if (!started) return;
    const t = ctx.currentTime;
    [[196, 0.16], [294, 0.10], [392, 0.07], [588, 0.045], [784, 0.03]].forEach(([f, v]) => {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0.0001, t); gn.gain.exponentialRampToValueAtTime(v, t + 0.03); gn.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
      o.connect(gn); gn.connect(master); o.start(); o.stop(t + 3.6);
    });
  },
  playSignal(seconds = 12, freqs = [18.97, 19.4], level = 0.34) {
    if (!started) return;
    const t = ctx.currentTime;
    const lv = reduced ? level * 0.5 : level;
    const gn = ctx.createGain();
    gn.gain.setValueAtTime(0.0001, t);
    gn.gain.linearRampToValueAtTime(lv, t + 0.9);
    gn.gain.setValueAtTime(lv, t + seconds - 1.2);
    gn.gain.linearRampToValueAtTime(0.0001, t + seconds);
    gn.connect(master);
    freqs.forEach(f => { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.connect(gn); o.start(); o.stop(t + seconds + 0.1); });
    const s = noiseSrc(false, Math.max(4, seconds));
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.8;
    const sg = ctx.createGain();
    sg.gain.setValueAtTime(0.0001, t); sg.gain.linearRampToValueAtTime(0.05, t + 1.4); sg.gain.linearRampToValueAtTime(0.0001, t + seconds);
    s.connect(f); f.connect(sg); sg.connect(master); s.start(); s.stop(t + seconds + 0.1);
  }
};
