// The screen rectangles of the HUD regions the context prompts must stay clear of. Kept up to date from ResizeObserver
// callbacks (which run after layout, so reading a rectangle there forces nothing) and window resizes; the prompt's
// animation-frame loop only reads the cached array, never the layout.
import type { Rect } from './promptPlacement';

const REGIONS = '[data-hud]:not([data-hud="prompts"]), .fd-drawer';

let rects: Rect[] = [];

/** The cached rectangles, CSS px. */
export function keepOutRects(): readonly Rect[] {
  return rects;
}

/** Watches the HUD regions under `root`; returns the stop function. */
export function watchKeepOut(root: HTMLElement): () => void {
  const watched = new Set<Element>();
  const measure = (): void => {
    const next: Rect[] = [];
    watched.forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) next.push({ x: r.left, y: r.top, w: r.width, h: r.height });
    });
    rects = next;
  };
  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
  const sync = (): void => {
    const now = new Set(root.querySelectorAll(REGIONS));
    watched.forEach((el) => { if (!now.has(el)) { watched.delete(el); ro?.unobserve(el); } });
    now.forEach((el) => { if (!watched.has(el)) { watched.add(el); ro?.observe(el); } });
    if (!ro) measure();
  };
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(sync) : null;
  mo?.observe(root, { childList: true, subtree: true });
  window.addEventListener('resize', measure);
  sync();
  return () => { mo?.disconnect(); ro?.disconnect(); window.removeEventListener('resize', measure); watched.clear(); rects = []; };
}
