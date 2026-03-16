/**
 * GP_LIVE // SYS.CTRL
 * main.js — application entry point
 *
 * Author  : KRANK
 * Version : 0.1.0
 * License : MIT
 *
 * The single HTML file serves both the controller and the projector.
 * Mode is determined by the query parameter `?mode=projector`, which the
 * BackendController appends when it opens the projector popup window.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *  Serving instructions
 *  ─────────────────────
 *  SharedArrayBuffer requires cross-origin isolation headers:
 *
 *    Cross-Origin-Opener-Policy:   same-origin
 *    Cross-Origin-Embedder-Policy: require-corp
 *
 *  Without them the system falls back silently to postMessage state sync,
 *  which adds ~1–2ms latency. All visual output is identical either way.
 *
 *  Simplest local dev server (Node.js):
 *    npx serve . --cors
 *
 *  For production, configure the headers in your web server or CDN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { BackendController }   from './backend.js';
import { ProjectorController } from './projector.js';

const IS_PROJECTOR = window.location.search.includes('mode=projector');

if (IS_PROJECTOR) {
    document.getElementById('backend').style.display              = 'none';
    document.getElementById('projector-container').style.display  = 'block';
    new ProjectorController();
} else {
    new BackendController();
}
