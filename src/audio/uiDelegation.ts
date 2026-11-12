// Interface sounds without touching UI files: one delegated listener on the UI root classifies the control that was
// activated or hovered (button variant, tab, switch, segmented radio) and plays the matching §13.8 sound through
// the audio facade. Components may also call `audioUi(id)` (facade.ts) directly; both paths share the throttles.
import type { UiSoundId } from './uiSounds';

/** The parts of an element the classifier reads (an Element satisfies it). */
export interface ControlLike {
  tagName: string;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  classList?: { contains(c: string): boolean };
}

const CONTROL_SELECTOR = 'button, [role="tab"], [role="switch"], [role="radio"], [role="option"], a[href]';

/** Which sound an activated control makes (null = none, e.g. disabled). */
export function soundForControl(el: ControlLike): UiSoundId | null {
  if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') return null;
  const role = el.getAttribute('role');
  if (role === 'tab') return 'tab';
  if (role === 'switch' || role === 'radio' || el.hasAttribute('aria-pressed')) return 'toggle';
  if (el.classList?.contains('ui-btn--primary')) return 'click';
  return 'click-secondary';
}

export interface DelegationTarget {
  addEventListener(type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions | boolean): void;
  removeEventListener(type: string, fn: (e: Event) => void, opts?: EventListenerOptions | boolean): void;
}

/** Installs the listeners on `root` (the document or the UI root); returns an uninstall function. */
export function installUiSounds(root: DelegationTarget, play: (id: UiSoundId) => void): () => void {
  let keyboard = false;
  const controlOf = (t: EventTarget | null): Element | null => {
    const el = t as Element | null;
    return el && typeof el.closest === 'function' ? el.closest(CONTROL_SELECTOR) : null;
  };
  const control = (e: Event): Element | null => controlOf(e.target);
  const onClick = (e: Event) => {
    const el = control(e);
    if (!el) return;
    const id = soundForControl(el);
    if (id) play(id);
  };
  const onOver = (e: Event) => {
    const el = control(e);
    // pointerover bubbles from every child of a control: only entering the control from outside it counts
    if (!el || controlOf((e as PointerEvent).relatedTarget) === el) return;
    if (soundForControl(el)) play('hover');
  };
  const onKey = () => { keyboard = true; };
  const onPointer = () => { keyboard = false; };
  const onFocus = (e: Event) => {
    if (!keyboard) return;
    const el = control(e);
    if (el && soundForControl(el)) play('hover');
  };
  const opts = { capture: true, passive: true };
  root.addEventListener('click', onClick, opts);
  root.addEventListener('pointerover', onOver, opts);
  root.addEventListener('keydown', onKey, opts);
  root.addEventListener('pointerdown', onPointer, opts);
  root.addEventListener('focusin', onFocus, opts);
  return () => {
    root.removeEventListener('click', onClick, opts);
    root.removeEventListener('pointerover', onOver, opts);
    root.removeEventListener('keydown', onKey, opts);
    root.removeEventListener('pointerdown', onPointer, opts);
    root.removeEventListener('focusin', onFocus, opts);
  };
}
