/**
 * GP_LIVE // SYS.CTRL
 * ui.js — BackendUI: DOM feedback layer for the controller window
 *
 * Author  : KRANK
 * Version : 0.1.0
 * License : MIT
 *
 * All DOM mutation for the backend panel lives here.
 * BackendController calls these methods; it never touches the DOM directly.
 */

import { KEY_MAPS } from './constants.js';

export class BackendUI {
    constructor() {
        this._sysLog    = document.getElementById('sys-log');
        this._vuMeter   = document.getElementById('vu-meter');
        this._sabStatus = document.getElementById('sab-status');
        this._buildKeys();
    }

    // ── Keyboard display ─────────────────────────────────────────────────────

    _buildKeys() {
        const build = (containerId, keys, defaultActive) => {
            const container = document.getElementById(containerId);
            for (const k of keys) {
                const el = document.createElement('div');
                el.className = 'key';
                el.id        = `ui-key-${k}`;
                el.innerText = k;
                container.appendChild(el);
            }
            document.getElementById(`ui-key-${defaultActive}`)?.classList.add('active');
        };

        build('keys-palettes', KEY_MAPS.palettes, '1');
        build('keys-patterns', KEY_MAPS.patterns, 'Q');
        build('keys-effects',  KEY_MAPS.effects,  'A');
        build('keys-loops',    KEY_MAPS.loops,    'V');
    }

    /** Highlight the active key in a group and dim the rest. */
    updateKeyGroup(group, activeKey) {
        KEY_MAPS[group]?.forEach(k => {
            document.getElementById(`ui-key-${k}`)
                ?.classList.toggle('active', k === activeKey);
        });
    }

    /** Brief flash on the spacebar indicator. */
    flashSpace() {
        const el = document.getElementById('key-space');
        if (!el) return;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 100);
    }

    // ── Audio VU ─────────────────────────────────────────────────────────────

    updateVU(vol) {
        this._vuMeter.style.width      = `${(vol / 255) * 100}%`;
        this._vuMeter.style.background = vol > 200 ? 'var(--accent)' : 'var(--fg)';
    }

    // ── SAB status ───────────────────────────────────────────────────────────

    setSabStatus(active) {
        this._sabStatus.innerText        = active ? 'SAB: ACTIVE' : 'SAB: FALLBACK (postMessage)';
        this._sabStatus.style.background = active ? 'var(--fg)' : 'var(--accent)';
        if (active) this._sabStatus.style.color = 'var(--bg)';
    }

    // ── Gamepad indicators ───────────────────────────────────────────────────

    setGamepadStatus(connected, label = '') {
        const el = document.getElementById('gp-status');
        if (!el) return;
        el.innerText         = connected ? `GAMEPAD: ${label.slice(0, 20)}` : 'GAMEPAD: DISCONNECTED';
        el.style.background  = connected ? 'var(--fg)' : '#333';
        el.style.color       = connected ? 'var(--bg)' : '#fff';
    }

    flashGamepadBtn(id) {
        const el = document.getElementById(id);
        if (!el) return;
        el.classList.add('active');
        setTimeout(() => el.classList.remove('active'), 130);
    }

    syncGainSlider(gain) {
        const pct    = Math.round(gain * 100);
        const slider = document.getElementById('audio-gain');
        const label  = document.getElementById('gain-val');
        if (slider) slider.value    = pct;
        if (label)  label.innerText = `${pct}%`;
    }

    // ── System log ───────────────────────────────────────────────────────────

    log(msg) {
        const time = new Date().toTimeString().split(' ')[0];
        this._sysLog.innerHTML = `[${time}] ${msg}\n` + this._sysLog.innerHTML;
    }
}
