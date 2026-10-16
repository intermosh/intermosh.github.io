/* vesper128 · core/events — bus de eventos mínimo (pub/sub) para desacoplar
   el SO de la capa de juego. */

const subs = new Map();

export const Events = {
  on(type, fn) {
    if (!subs.has(type)) subs.set(type, []);
    subs.get(type).push(fn);
    return () => this.off(type, fn);
  },
  off(type, fn) {
    const a = subs.get(type);
    if (a) { const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
  },
  emit(type, payload) {
    const a = subs.get(type);
    if (a) for (const fn of a.slice()) { try { fn(payload); } catch (e) { console.warn('[events]', type, e); } }
    const any = subs.get('*');
    if (any) for (const fn of any.slice()) { try { fn(type, payload); } catch (e) { } }
  }
};
