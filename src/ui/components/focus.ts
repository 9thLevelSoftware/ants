// Focus handling shared by the components: finding focusable elements, a Tab trap for dialogs, restoring focus to
// the opener when a layer closes (GDD 08 section 8), and initial focus per screen.
import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { pushBack } from './logic/escapeStack';
import { trapIndex } from './logic/groupNav';

const NOT_REMOVED = ':not([tabindex="-1"])';
export const FOCUSABLE = [
  `a[href]${NOT_REMOVED}`, `button:not([disabled])${NOT_REMOVED}`, `input:not([disabled]):not([type="hidden"])${NOT_REMOVED}`,
  `select:not([disabled])${NOT_REMOVED}`, `textarea:not([disabled])${NOT_REMOVED}`, '[tabindex]:not([tabindex="-1"])',
].join(', ');

function isVisible(el: HTMLElement): boolean {
  if (el.closest('[inert]') || el.closest('[hidden]')) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return el.getClientRects().length > 0;
}

/** Focusable, visible elements inside `root`, in DOM order (the Tab order for positive-free tabindex use). */
export function focusableIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(isVisible);
}

/** Moves focus to the first element matching `selector` (or the first focusable one) without scrolling the page. */
export function focusInitial(root: HTMLElement, selector?: string): boolean {
  const target = (selector && root.querySelector<HTMLElement>(selector)) || focusableIn(root)[0];
  if (!target) return false;
  target.focus({ preventScroll: true });
  return document.activeElement === target;
}

/**
 * Keeps Tab inside `container` while `active`. Returns the handler to attach to the container's keydown, so the
 * logic is usable without hooks as well.
 */
export function trapTabKey(container: HTMLElement, e: KeyboardEvent): void {
  if (e.key !== 'Tab') return;
  const items = focusableIn(container);
  if (items.length === 0) { e.preventDefault(); return; }
  const cur = items.indexOf(document.activeElement as HTMLElement);
  const atEdge = e.shiftKey ? cur <= 0 : cur === items.length - 1;
  if (cur < 0 || atEdge) {
    e.preventDefault();
    items[trapIndex(items.length, cur, e.shiftKey)].focus();
  }
}

export interface FocusScopeOptions {
  /** CSS selector of the element to focus on mount (default: first focusable). */
  initial?: string;
  /** Trap Tab inside the container (modals). */
  trap?: boolean;
  /** Restore focus to the previously focused element on unmount (default true). */
  restore?: boolean;
}

/**
 * The last element that received focus. When a layer opens, the browser drops focus from the (now inert or hidden)
 * element underneath before effects run, so `document.activeElement` is already `body`; this keeps the opener.
 */
let lastFocused: HTMLElement | null = null;
if (typeof document !== 'undefined') {
  document.addEventListener('focusin', (e) => {
    const t = e.target as HTMLElement | null;
    if (t && t !== document.body) lastFocused = t;
  }, true);
}

/**
 * A focus scope: on mount remembers the opener and focuses `initial`; optionally traps Tab; on unmount restores
 * focus to the opener if it is still in the document.
 */
export function useFocusScope(ref: { current: HTMLElement | null }, opts: FocusScopeOptions = {}): void {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const current = document.activeElement as HTMLElement | null;
    const candidate = current && current !== document.body ? current : lastFocused;
    const opener = candidate && !root.contains(candidate) ? candidate : null;
    // focus after the first paint so layout (and `inert` on the layer below) has settled
    const raf = requestAnimationFrame(() => focusInitial(root, opts.initial));
    const onKey = (e: KeyboardEvent) => { if (opts.trap) trapTabKey(root, e); };
    root.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      root.removeEventListener('keydown', onKey);
      if (opts.restore !== false && opener && opener !== document.body) {
        // after the layer below is interactive again
        requestAnimationFrame(() => { if (opener.isConnected) opener.focus({ preventScroll: true }); });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/** Registers `onClose` as a back layer once; later renders update the handler without changing the stack order. */
export function useBackLayer(onClose: () => void, level: number, enabled = true): void {
  const ref = useRef(onClose);
  ref.current = onClose;
  useLayoutEffect(() => (enabled ? pushBack(() => ref.current(), level) : undefined), [enabled, level]);
}
