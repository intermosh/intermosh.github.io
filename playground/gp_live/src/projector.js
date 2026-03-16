/**
 * GP_LIVE // SYS.CTRL
 * projector.js — ProjectorController: full-screen visual renderer
 *
 * Author  : KRANK
 * Version : 0.1.0
 * License : MIT
 *
 * Runs in the projector popup window opened by BackendController.
 * Communication flow:
 *
 *   Projector → Controller : postMessage('PROJECTOR_READY')
 *   Controller → Projector : postMessage({ type: 'INIT', useSab, sab })
 *   Controller → Projector : postMessage({ type: 'STATE_UPDATE', state })   [fallback]
 *   Controller → Projector : postMessage({ type: 'ROM_DATA', tiles, … })
 *   Projector  → Controller: postMessage({ type: 'PREVIEW_FRAME', bitmap })  [every 6 frames]
 *
 * When SAB is available (COOP/COEP headers present), state reads happen directly
 * from shared memory inside _loop() — postMessage is used only for ROM transfer.
 */

import { createState } from './constants.js';
import { SabTransport } from './transport.js';
import { Renderer }     from './renderer.js';
import { RomAtlas }     from './rom.js';

export class ProjectorController {
    constructor() {
        this._state      = createState();
        this._sab        = new SabTransport();
        this._renderer   = new Renderer(document.getElementById('visualCanvas'));
        this._frameCount = 0;

        this._bindComms();
        this._bindFullscreen();
    }

    // ── Inter-window messaging ────────────────────────────────────────────────

    _bindComms() {
        window.addEventListener('message', ({ data }) => {

            // INIT: receive SAB (or fall back to postMessage state updates)
            if (data.type === 'INIT') {
                if (data.useSab && data.sab) this._sab.attach(data.sab);
                requestAnimationFrame(this._loop.bind(this));
            }

            // STATE_UPDATE: postMessage fallback when SAB is unavailable
            if (data.type === 'STATE_UPDATE') {
                Object.assign(this._state, data.state);
            }

            // ROM_DATA: reconstruct RomAtlas from serialised tile shade data
            if (data.type === 'ROM_DATA' && data.tiles && data.tileCount > 0) {
                const flat        = new Uint8Array(data.tiles);
                const shadeArrays = Array.from({ length: data.tileCount },
                    (_, i) => flat.slice(i * 64, i * 64 + 64));
                this._renderer.setRom(new RomAtlas(shadeArrays));
            }
        });

        // Announce readiness to the opener
        if (window.opener) {
            window.opener.postMessage('PROJECTOR_READY', '*');
        } else {
            document.body.innerHTML =
                "<h1 style='color:red;font-family:monospace;margin:40px'>" +
                "ERR: MUST OPEN FROM CONTROLLER</h1>";
        }
    }

    // ── Fullscreen button ─────────────────────────────────────────────────────

    _bindFullscreen() {
        const btn       = document.getElementById('btn-fullscreen');
        const container = document.getElementById('projector-container');

        btn.addEventListener('click', () => {
            const req = container.requestFullscreen
                ?? container.webkitRequestFullscreen
                ?? container.mozRequestFullScreen;
            req?.call(container);
        });

        const onFsChange = () => {
            const isFs = !!(
                document.fullscreenElement       ??
                document.webkitFullscreenElement ??
                document.mozFullScreenElement
            );
            btn.style.display = isFs ? 'none' : 'block';
        };

        document.addEventListener('fullscreenchange',       onFsChange);
        document.addEventListener('webkitfullscreenchange', onFsChange);
        document.addEventListener('mozfullscreenchange',    onFsChange);
    }

    // ── RAF loop ─────────────────────────────────────────────────────────────

    _loop() {
        // Read latest state (SAB = zero-copy; postMessage fallback already updated _state)
        this._sab.read(this._state);

        // Render full frame
        this._renderer.render(this._state);

        // Every 6 frames send a scaled bitmap back to the controller preview panel.
        // createImageBitmap is async + non-blocking; postMessage with transfer = zero copy.
        this._frameCount++;
        if (this._frameCount % 6 === 0 && window.opener && !window.opener.closed) {
            const canvas = this._renderer._canvas;
            createImageBitmap(canvas, 0, 0, canvas.width, canvas.height, {
                resizeWidth   : 320,
                resizeHeight  : 180,
                resizeQuality : 'low',
            }).then(bitmap => {
                window.opener.postMessage({ type: 'PREVIEW_FRAME', bitmap }, '*', [bitmap]);
            }).catch(() => { /* projector window was closed mid-frame */ });
        }

        requestAnimationFrame(this._loop.bind(this));
    }
}
