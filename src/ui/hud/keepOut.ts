// The screen rectangles of the HUD regions the context prompts must stay clear of. Kept up to date from ResizeObserver
// callbacks (which run after layout, so reading a rectangle there forces nothing) and window resizes; the prompt's
// animation-frame loop only reads the cached array, never the layout.
import type { Rect } from './promptPlacement';

// .pn-panel: the colony view's marker palette (gate-close-app: the top hint card sat on top of it)
const REGIONS = '[data-hud]:not([data-hud="prompts"]), .fd-drawer, .pn-panel';

let rects: Rect[] = [];

/** The cached rectangles, CSS px. */
export function keepOutRects(): readonly Rect[] {
  return rects;
}

/**
 * Watches the HUD regions under `root` and the panel toolbars (`.pn-panel`), which the panels layer mounts outside
 * the HUD root: the whole document is searched and observed (gate-close-app: the marker palette was never seen, so
 * hint chips still sat on it, e2e/slicenight/slice-night.png); returns the stop function.
 */
export function watchKeepOut(root: HTMLElement): () => void {
  const scope: ParentNode & Node = root.ownerDocument?.body ?? root;
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
    const now = new Set(scope.querySelectorAll(REGIONS));
    watched.forEach((el) => { if (!now.has(el)) { watched.delete(el); ro?.unobserve(el); } });
    now.forEach((el) => { if (!watched.has(el)) { watched.add(el); ro?.observe(el); } });
    if (!ro) measure();
  };
  const mo = typeof MutationObserver !== 'undefined' ? new MutationObserver(sync) : null;
  mo?.observe(scope, { childList: true, subtree: true });
  window.addEventListener('resize', measure);
  sync();
  return () => { mo?.disconnect(); ro?.disconnect(); window.removeEventListener('resize', measure); watched.clear(); rects = []; };
}
