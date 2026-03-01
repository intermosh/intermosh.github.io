/**
 * GP_LIVE // SYS.CTRL
 * preview.js — PreviewPanel: thumbnail renderer for the controller window
 *
 * Author  : KRANK
 * Version : 0.1.0
 * License : MIT
 *
 * Renders the current state at 320×180 @ ~15fps using its own local Renderer.
 * Runs inside the shared rAF loop — no second loop, no extra thread.
 *
 * When the projector window is open it sends back scaled ImageBitmaps every
 * 6 frames (~10fps at 60fps). In that mode the local renderer pauses and we
 * display the received bitmap instead, keeping the preview in sync with what
 * the audience actually sees on the big screen.
 */

import { Renderer } from './renderer.js';

export class PreviewPanel {
    static W           = 320;
    static H           = 180;
    static INTERVAL_MS = 66;   // ~15fps gate

    /**
     * @param {object} stateRef  Shared mutable state (read-only from here).
     */
    constructor(stateRef) {
        this._state      = stateRef;
        this._canvas     = document.getElementById('preview-canvas');
        this._ctx        = this._canvas.getContext('2d');
        this._renderer   = new Renderer(this._canvas);
        this._lastRender = 0;
        this._fromBitmap = false;

        this._dot      = document.getElementById('preview-dot');
        this._srcLabel = document.getElementById('preview-src');
        this._stLabel  = document.getElementById('preview-state-label');
    }

    /**
     * Call once per rAF frame from BackendController._loop().
     * Internally throttled to INTERVAL_MS so we don't waste paint time.
     *
     * @param {number} now  performance.now() timestamp from rAF.
     */
    tick(now) {
        if (this._fromBitmap) return;
        if (now - this._lastRender < PreviewPanel.INTERVAL_MS) return;
        this._lastRender = now;
        this._renderer.render(this._state);
        this._updateLabels();
    }

    /**
     * Called when a transferable ImageBitmap arrives from the projector.
     * Switches the panel to "projector sync" mode until fallbackToLocal() is called.
     *
     * @param {ImageBitmap} bitmap  Zero-copy bitmap transferred from the projector.
     */
    receiveBitmap(bitmap) {
        this._fromBitmap = true;
        this._ctx.drawImage(bitmap, 0, 0, PreviewPanel.W, PreviewPanel.H);
        bitmap.close();
        this._dot.className         = 'preview-dot sync';
        this._srcLabel.textContent  = 'PROJECTOR SYNC · 10fps';
        this._updateLabels();
    }

    /** Resume local rendering after the projector window closes. */
    fallbackToLocal() {
        this._fromBitmap           = false;
        this._dot.className        = 'preview-dot live';
        this._srcLabel.textContent = 'LOCAL · 15fps';
    }

    _updateLabels() {
        const { palette: p, pattern: pat, effect: e } = this._state;
        this._stLabel.textContent = `PAL:${p} PAT:${pat} EFX:${e}`;
        if (!this._fromBitmap) this._dot.className = 'preview-dot live';
    }
}
