// Thin DOM adapter: browser events -> InputState. Everything with logic lives in the pure modules; this file only
// translates events, applies preventDefault where the GDD says so, and performs pointer-lock requests.
import type { InputState } from './inputState';
import type { PadSnapshot } from './types';

export interface DomInputOptions {
  /** Element receiving mouse presses and wheel (the game canvas). */
  canvas: HTMLElement;
  /** Defaults to globalThis.window. */
  win?: Window;
  /** Poll navigator.getGamepads() in poll(). Default true. */
  gamepads?: boolean;
  /** Called for Esc when pointer lock was lost unexpectedly and the Esc must not open the menu (for a toast). */
  onEscSwallowed?: () => void;
}

export interface DomInput {
  /** Call once per frame before input.update(now): polls gamepads and pending pointer-lock releases. */
  poll(): void;
  detach(): void;
}

function isTextField(el: EventTarget | null): boolean {
  if (!el || !(el as HTMLElement).tagName) return false;
  const h = el as HTMLElement;
  if (h.isContentEditable) return true;
  if (h.tagName === 'TEXTAREA' || h.tagName === 'SELECT') return true;
  if (h.tagName !== 'INPUT') return false;
  const type = (h as HTMLInputElement).type;
  return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'color', 'file', 'image'].includes(type);
}

function toSnapshot(g: Gamepad): PadSnapshot {
  return { index: g.index, id: g.id, mapping: g.mapping, buttons: g.buttons.map((b) => b.value || (b.pressed ? 1 : 0)), axes: [...g.axes] };
}

export function attachDomInput(input: InputState, opts: DomInputOptions): DomInput {
  const win = opts.win ?? window;
  const doc = win.document;
  const canvas = opts.canvas;
  const now = () => win.performance.now();
  const gameHasFocus = () => {
    const a = doc.activeElement;
    return !a || a === doc.body || a === canvas || a === doc.documentElement;
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTextField(e.target)) {
      if (e.code === 'Escape') { (e.target as HTMLElement).blur(); e.preventDefault(); } // Esc blurs the field first
      return;
    }
    if (e.code === 'Escape' && input.pointer.consumeEsc(now())) { opts.onEscSwallowed?.(); return; }
    const bound = input.keyDown(e.code, { shift: e.shiftKey, ctrl: e.ctrlKey, alt: e.altKey, meta: e.metaKey, repeat: e.repeat });
    // Tab / Space / arrows / F5 / Backspace would scroll, reload or move focus: prevent them only while the game,
    // not a DOM panel, has focus (inside panels Tab moves focus normally).
    if (bound && gameHasFocus()) e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => input.keyUp(e.code);
  const onMouseDown = (e: MouseEvent) => {
    input.mouseDown(e.button, e.clientX, e.clientY, now());
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;
    canvas.focus({ preventScroll: true });
    if (input.pointer.onCanvasClick(now())) requestLock();
    if (e.button === 1) e.preventDefault(); // no autoscroll on middle-drag
  };
  const onMouseMove = (e: MouseEvent) => input.mouseMove(e.clientX, e.clientY, e.movementX, e.movementY);
  const onMouseUp = (e: MouseEvent) => input.mouseUp(e.button, e.clientX, e.clientY, now());
  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Some browsers turn Shift+wheel into horizontal scrolling.
    const dy = e.deltaY !== 0 ? e.deltaY : e.shiftKey ? e.deltaX : 0;
    input.wheel(dy, e.deltaMode, e.shiftKey);
  };
  const onContextMenu = (e: Event) => e.preventDefault(); // canvas only, never DOM panels
  const onBlur = () => input.focusLost();
  const onVisibility = () => { if (doc.visibilityState === 'hidden') input.focusLost(); };
  const onFocusIn = (e: FocusEvent) => input.setSuspended(isTextField(e.target));
  const onFocusOut = (e: FocusEvent) => { if (isTextField(e.target)) input.setSuspended(isTextField(e.relatedTarget)); };
  const onLockChange = () => input.pointer.onLockChange(doc.pointerLockElement === canvas, now());
  const onLockError = () => input.pointer.onError(now());

  function requestLock(): void {
    try {
      const r = (canvas.requestPointerLock as unknown as (o?: object) => Promise<void> | void).call(canvas);
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => input.pointer.onError(now()));
    } catch {
      input.pointer.onError(now());
    }
  }

  win.addEventListener('keydown', onKeyDown);
  win.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('mousedown', onMouseDown);
  win.addEventListener('mousemove', onMouseMove);
  win.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', onContextMenu);
  win.addEventListener('blur', onBlur);
  doc.addEventListener('visibilitychange', onVisibility);
  doc.addEventListener('focusin', onFocusIn);
  doc.addEventListener('focusout', onFocusOut);
  doc.addEventListener('pointerlockchange', onLockChange);
  doc.addEventListener('pointerlockerror', onLockError);

  const pollPads = opts.gamepads !== false && typeof win.navigator.getGamepads === 'function';

  return {
    poll() {
      if (input.pointer.takeReleaseRequest() && doc.pointerLockElement) doc.exitPointerLock();
      if (!pollPads) return;
      let pads: (Gamepad | null)[] = [];
      try { pads = [...win.navigator.getGamepads()]; } catch { pads = []; }
      input.setPads(pads.map((g) => (g && g.connected ? toSnapshot(g) : null)));
    },
    detach() {
      win.removeEventListener('keydown', onKeyDown);
      win.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('mousedown', onMouseDown);
      win.removeEventListener('mousemove', onMouseMove);
      win.removeEventListener('mouseup', onMouseUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContextMenu);
      win.removeEventListener('blur', onBlur);
      doc.removeEventListener('visibilitychange', onVisibility);
      doc.removeEventListener('focusin', onFocusIn);
      doc.removeEventListener('focusout', onFocusOut);
      doc.removeEventListener('pointerlockchange', onLockChange);
      doc.removeEventListener('pointerlockerror', onLockError);
      if (doc.pointerLockElement === canvas) doc.exitPointerLock();
    },
  };
}
