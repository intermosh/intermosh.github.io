/**
 * GP_LIVE // SYS.CTRL
 * constants.js — shared configuration, state factory, visual tables
 *
 * Author  : KRANK
 * Version : 0.1.0
 * License : MIT
 */

// ── Keyboard layout ─────────────────────────────────────────────────────────

export const KEY_MAPS = Object.freeze({
    palettes : ['1','2','3','4','5','6','7','8','9','0'],
    patterns : ['Q','W','E','R','T','Y','U','I','O','P'],
    effects  : ['A','S','D','F','G','H','J','K','L'],
    loops    : ['Z','X','C','V','B','N','M'],
});

// ── SharedArrayBuffer layout ─────────────────────────────────────────────────
// Byte offsets in the SAB. freqsStart occupies 16 consecutive bytes (indices 2–17).

export const SAB_FIELDS = Object.freeze({
    sync      : 0,
    vol       : 1,
    freqsStart: 2,   // bytes 2..17
    palette   : 18,
    pattern   : 19,
    effect    : 20,
    loop      : 21,
    spaceTrig : 22,
});

export const SAB_SIZE = 64;  // bytes; headroom for future fields

// ── Mutable state factory ────────────────────────────────────────────────────
// Returns a fresh plain-object state. Both BackendController and
// ProjectorController hold their own copy; they are kept in sync via SAB or
// postMessage depending on browser support.

export const createState = () => ({
    sync      : 0,
    vol       : 0,
    freqs     : new Array(16).fill(0),
    palette   : 0,
    pattern   : 0,
    effect    : 0,
    loop      : 3,
    spaceTrig : 0,
    gain      : 1.0,
});

// ── Visual palettes ──────────────────────────────────────────────────────────
// Ten palettes addressable by keys 1–0.
// Each entry: { bg, c1 (primary), c2 (secondary) }

export const PALETTES = Object.freeze([
    { bg: '#050505', c1: '#00ffcc', c2: '#ff0055' },  // 1  Cyberpunk
    { bg: '#000000', c1: '#00ff00', c2: '#ffffff' },  // 2  Matrix
    { bg: '#110022', c1: '#ff00ff', c2: '#00ffff' },  // 3  Vaporwave
    { bg: '#1a0505', c1: '#ff3300', c2: '#ffcc00' },  // 4  Meltdown
    { bg: '#eeeeee', c1: '#000000', c2: '#ff0000' },  // 5  Mirror's Edge
    { bg: '#0a0a0a', c1: '#ffffff', c2: '#555555' },  // 6  Noir
    { bg: '#001a33', c1: '#00ccff', c2: '#ffffff' },  // 7  Tron
    { bg: '#222200', c1: '#ffff00', c2: '#ff8800' },  // 8  Hazard
    { bg: '#050011', c1: '#aa00ff', c2: '#0055ff' },  // 9  Deep Space
    { bg: '#050505', c1: '#ff0055', c2: '#ff0055' },  // 0  Panic
]);

// ── Loop / time speed table ──────────────────────────────────────────────────
// Indexed by state.loop (0–6). Values are time-step multipliers applied each
// render frame. -1 = reverse.

export const SPEED_MAP = Object.freeze([0, 0.2, 0.5, 1, 2, 4, -1]);
