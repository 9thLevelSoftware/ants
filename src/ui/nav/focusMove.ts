// Moving focus inside one layer for the pad: the focused control gets the arrow first (sliders, segmented controls,
// tabs and listboxes use it themselves), otherwise the nearest focusable in that direction takes the focus.
import { focusableIn } from '../components/focus';
import { pickSpatial, type Rect } from '../components/logic/spatialNav';
import type { Dir } from './padReader';

const KEYS: Record<Dir, string> = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

const rectOf = (el: HTMLElement): Rect => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top, w: r.width, h: r.height };
};

/** A text field keeps its own arrow keys; the pad leaves it with B or by moving to another control. */
export function isTextField(el: Element | null): boolean {
  if (!el) return false;
  const h = el as HTMLElement;
  if (h.isContentEditable || h.tagName === 'TEXTAREA') return true;
  if (h.tagName !== 'INPUT') return false;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes((h as HTMLInputElement).type);
}

/** Does the control take this direction as a value change (a horizontal slider takes left and right, not up and down)? */
function controlTakesDirection(el: HTMLElement, dir: Dir): boolean {
  if (isTextField(el)) return false;
  if (el.getAttribute('role') === 'slider' || (el as HTMLInputElement).type === 'range') return dir === 'left' || dir === 'right';
  return true;
}

/** Puts focus on the first control of `root` (or `initial`). Returns the element that has focus afterwards, or null. */
export function focusFirst(root: HTMLElement, initial?: string): HTMLElement | null {
  const target = (initial && root.querySelector<HTMLElement>(initial)) || focusableIn(root)[0];
  if (!target) return null;
  target.focus();
  return document.activeElement === target ? target : null;
}

/** Moves focus one step in `dir` inside `root`; true when something changed or a control took the key. */
export function moveFocusIn(root: HTMLElement, dir: Dir, initial?: string): boolean {
  const cur = document.activeElement as HTMLElement | null;
  const inside = !!cur && cur !== document.body && root.contains(cur);
  if (inside && controlTakesDirection(cur!, dir)) {
    const ev = new KeyboardEvent('keydown', { key: KEYS[dir], code: KEYS[dir], bubbles: true, cancelable: true });
    cur!.dispatchEvent(ev);
    if (ev.defaultPrevented) return true;
  }
  const items = focusableIn(root);
  if (items.length === 0) return false;
  if (!inside || !items.includes(cur!)) return !!focusFirst(root, initial);
  const i = pickSpatial(rectOf(cur!), items.map(rectOf), dir);
  if (i < 0) return false;
  items[i].focus();
  return true;
}

const SCROLLABLE = /(auto|scroll)/;

/** The element that scrolls for the focused control: the nearest scrollable ancestor inside `root`, else the layer's first scroll area. */
export function scrollerOf(root: HTMLElement): HTMLElement | null {
  let el = document.activeElement as HTMLElement | null;
  while (el && root.contains(el)) {
    if (el.scrollHeight > el.clientHeight + 1 && SCROLLABLE.test(getComputedStyle(el).overflowY)) return el;
    el = el.parentElement;
  }
  const first = root.querySelector<HTMLElement>('.ui-scroll, .ui-drawer-body, .ui-page-scroll');
  return first && first.scrollHeight > first.clientHeight + 1 ? first : null;
}
