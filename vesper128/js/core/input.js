/* vesper128 · core/input — entrada normalizada a coordenadas lógicas del framebuffer. */

import { clamp } from './util.js';
import { FB } from './framebuffer.js';

export const Input = {
  mouse: { x: 0, y: 0, rawX: 0, rawY: 0, down: false, inside: false, moved: false },
  handlers: {},
  view: null,

  attach(viewCanvas) {
    this.view = viewCanvas;
    const toLogical = (e) => {
      const r = this.view.getBoundingClientRect();
      return {
        x: clamp((e.clientX - r.left) / FB.SCALE, 0, FB.W - 1),
        y: clamp((e.clientY - r.top) / FB.SCALE, 0, FB.H - 1)
      };
    };
    window.addEventListener('mousemove', (e) => {
      const p = toLogical(e);
      this.mouse.rawX = p.x; this.mouse.rawY = p.y;
      this.mouse.inside = true; this.mouse.moved = true;
    }, { passive: true });
    window.addEventListener('mouseleave', () => { this.mouse.inside = false; });
    window.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      this.mouse.down = true;
      this.handlers.press && this.handlers.press();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button !== 0) return;
      this.mouse.down = false;
      this.handlers.release && this.handlers.release();
    });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('wheel', (e) => {
      if (this.handlers.wheel) this.handlers.wheel(e);
    }, { passive: false });
    window.addEventListener('keydown', (e) => {
      this.handlers.key && this.handlers.key(e);
    });
  },

  on(name, fn) { this.handlers[name] = fn; }
};
