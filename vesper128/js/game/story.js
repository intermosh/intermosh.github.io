/* vesper128 · game/story — motor narrativo data-driven: evalúa el grafo de
   descubrimientos de game.json, mantiene tensión/flags/log y programa anomalías
   ambientales (razón/intervalo variable). No contiene contenido: sólo reglas. */

import { clamp, lerp, smooth, rndi, pick, chance } from '../core/util.js';
import { FB, fillRect, text } from '../core/framebuffer.js';
import { Config } from '../core/config.js';
import { Events } from '../core/events.js';
import { UI } from '../os/ui.js';
import { runList, runEffect } from './effects.js';
import { GainOverride } from '../core/audio.js';

export const Story = {
  tension: 0, target: 0,
  flags: new Set(),
  discovered: new Set(),
  log: [],
  t: 0,
  session: 0,
  ctx: null,
  ghostCursor: null,
  visitorName: '', visitorCity: '',
  anomalyTimer: 9000,
  anomalyLast: new Map(),
  graph: { nodes: [], edges: [] },
  enabled: true,

  setCtx(ctx) { this.ctx = ctx; },
  has: (f) => Story.flags.has(f),
  set(f) { if (!Story.flags.has(f)) Story.flags.add(f); },

  note(txt) {
    const d = new Date(Date.now());
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0'), ss = String(d.getSeconds()).padStart(2, '0');
    Story.log.push(`${hh}:${mm}:${ss}  ${txt}`);
    if (Story.log.length > 400) Story.log.shift();
  },

  raise(v, why) {
    Story.target = clamp(Story.target + v, 0, 1);
    if (why) Story.note('· ' + why);
  },
  setTension(v) { Story.target = clamp(v, 0, 1); },

  initVisitor() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      Story.visitorCity = (tz.split('/').pop() || 'VISITANTE').replace(/_/g, ' ').toUpperCase();
    } catch (e) { Story.visitorCity = 'VISITANTE'; }
    const d = new Date();
    const M = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    Story.visitorName = `VISITANTE — ${String(d.getDate()).padStart(2, '0')} ${M[d.getMonth()]} ${d.getFullYear()}`;
  },

  loadGraph() {
    this.graph = Config.get('story', { nodes: [], edges: [] });
    this.enabled = !!Config.get('story.enabled', true) && !!Config.get('runtime.narrative', true);
    this.anomalyTimer = 9000;
  },

  activateStart() {
    if (!this.enabled) return;
    for (const node of this.graph.nodes) {
      if (this.discovered.has(node.id)) continue;
      const tr = node.trigger || {};
      if (tr.type === 'start' && this.isEnabled(node) && this.condsTrue(node.conditions)) this.activate(node);
    }
  },

  /* ------------- condiciones ------------- */
  condTrue(c) {
    if (!c) return true;
    switch (c.kind) {
      case 'flag': return c.negate ? !this.has(c.name) : this.has(c.name);
      case 'tension': return cmp(this.tension, c.op, c.value);
      case 'time': return cmp(this.t, c.op, c.value);
      case 'node': return c.negate ? !this.discovered.has(c.node) : this.discovered.has(c.node);
      case 'always': return true;
      case 'never': return false;
      default: return true;
    }
  },
  condsTrue(list) { return (list || []).every(c => this.condTrue(c)); },

  /* ------------- habilitación por aristas ------------- */
  incoming(id) { return this.graph.edges.filter(e => e.to === id); },
  isEnabled(node) {
    const inc = this.incoming(node.id);
    if (!inc.length) return node.type === 'start' ? true : this.condsTrue(node.conditions);
    return inc.some(e => this.discovered.has(e.from) && this.condsTrue(e.conditions));
  },

  /* ------------- triggers ------------- */
  triggerMatches(node, ev, payload) {
    const tr = node.trigger;
    if (!tr || tr.type !== 'event') return false;
    if (tr.event !== ev) return false;
    const m = tr.match || {};
    for (const k of Object.keys(m)) {
      const want = m[k], got = payload ? payload[k] : undefined;
      if (want && typeof want === 'object' && want.op) { if (!cmp(got, want.op, want.value)) return false; }
      else if (got !== want) return false;
    }
    return true;
  },

  /** un nodo repetible puede re-dispararse (diálogos de clave, avisos de bloqueo…) */
  canActivate(node) {
    if (!this.discovered.has(node.id)) return true;
    return !!node.repeat && (this.t - (node._last || -1e9)) > (node.cooldown || 6000);
  },

  activate(node) {
    if (this.discovered.has(node.id) && !node.repeat) return;
    this.discovered.add(node.id);          // también en repetibles: habilita las aristas salientes
    node._last = this.t;
    Events.emit('discover', { id: node.id, node });
    runList(node.effects, this.ctx);
  },

  onEvent(ev, payload) {
    if (!this.enabled) return;
    for (const node of this.graph.nodes) {
      if (!this.canActivate(node)) continue;
      if (!this.isEnabled(node)) continue;
      if (this.triggerMatches(node, ev, payload)) this.activate(node);
    }
  },

  tick(dt) {
    this.t += dt;
    this.tension += (this.target - this.tension) * clamp(dt / 4200, 0, 1);
    if (!this.enabled) return;

    // nodos auto / idle / start
    for (const node of this.graph.nodes) {
      if (!this.canActivate(node)) continue;
      if (!this.isEnabled(node)) continue;
      const tr = node.trigger || { type: 'auto' };
      if (tr.type === 'auto' && this.condsTrue(node.conditions)) this.activate(node);
      else if (tr.type === 'idle' && UI.stillFor > (tr.ms || 26000) && this.condsTrue(node.conditions)) this.activate(node);
    }

    // cursor fantasma
    if (this.ghostCursor) {
      const gc = this.ghostCursor; gc.t += dt;
      gc.x = lerp(gc.x, gc.tx, 0.02);
      gc.y = lerp(gc.y, gc.ty, 0.02);
      if (gc.t > gc.dur) this.ghostCursor = null;
    }

    // anomalías ambientales
    const pool = Config.get('anomalies.pool', []);
    if (pool.length && Config.get('runtime.effects', true)) {
      this.anomalyTimer -= dt;
      if (this.anomalyTimer <= 0) {
        const base = Config.get('anomalies.intervalBase', 26000), min = Config.get('anomalies.intervalMin', 9000);
        this.anomalyTimer = lerp(base, min, this.tension) * (0.6 + Math.random() * 0.9);
        const elig = pool.filter(a => this.tension >= (a.minT || 0) && this.condsTrue(a.conditions) && (this.t - (this.anomalyLast.get(a.effect + ':' + (a.key || '')) || -1e9)) > (a.cooldown || 20000));
        if (elig.length) {
          let total = 0; elig.forEach(a => total += (a.weight || 1));
          let r = Math.random() * total;
          for (const a of elig) {
            r -= (a.weight || 1);
            if (r <= 0) { runEffect(a.effect, a.params, this.ctx); this.anomalyLast.set(a.effect + ':' + (a.key || ''), this.t); break; }
          }
        }
      }
    }
  }
};

function cmp(a, op, b) {
  switch (op) {
    case '>': return a > b; case '>=': return a >= b;
    case '<': return a < b; case '<=': return a <= b;
    case '==': return a == b; case '!=': return a != b;
    default: return a === b;
  }
}

/* ---------------- destello subliminal ---------------- */
export const Subliminal = {
  frames: 0, kind: null, val: null, x: 0, y: 0,
  flash(p = {}) {
    const cfg = Config.get('subliminal', {});
    if (Story.ctx && Story.ctx.reducedFlicker && chance(0.6)) return;
    this.frames = p.frames != null ? p.frames : (cfg.frames || 2);
    this.kind = p.kind || (chance(0.55) ? 'word' : 'glyph');
    const words = p.words || cfg.words || [];
    this.val = this.kind === 'word' ? (words.length ? pick(words) : '') : null;
    this.contrast = p.contrast != null ? p.contrast : (cfg.contrast != null ? cfg.contrast : 0.44);
    this.x = p.x != null ? p.x : rndi(FB.W - 120) + 30;
    this.y = p.y != null ? p.y : FB.menuBarH + 30 + rndi(FB.H - 100);
  },
  draw() {
    if (this.frames <= 0) return;
    this.frames--;
    if (this.kind === 'word' && this.val) text(this.val, this.x, this.y, this.contrast);
    else for (let k = 0; k < 3; k++) {
      const cx = this.x + rndi(60) - 30, cy = this.y + rndi(40) - 20;
      fillRect(cx, cy, 9, 4, this.contrast); fillRect(cx + 3, cy + 8, 3, 5, this.contrast);
    }
  }
};

/* ---------------- blink / perturbación enmascarante ---------------- */
export const Blink = {
  active: 0, dur: 0, fn: null, mode: 'static',
  run(dur, fn, mode = 'static') { this.active = dur; this.dur = dur; this.fn = fn || null; this.mode = mode; },
  tick(dt) {
    if (this.active <= 0) return;
    this.active -= dt;
    if (this.active <= this.dur * 0.45 && this.fn) { const f = this.fn; this.fn = null; f(); }
  },
  get on() { return this.active > 0; }
};

/* ---------------- estado de menú / overrides ---------------- */
export const MenuState = { disabledUntil: 0, disabledPick: -1, extra: new Set() };
export const CRTBoost = { flicker: 0, glitch: 0 };
export const AudioOverride = { set(layer, gain) { GainOverride.set(layer, gain); } };

/* puente Events → Story */
export function wireStoryEvents() {
  Events.on('*', (type, payload) => Story.onEvent(type, payload));
}
