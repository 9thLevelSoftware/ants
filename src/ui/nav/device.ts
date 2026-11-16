// Which device the player used last (GDD 01 5.8, GDD 08 2.7): key hints print the binding of that device, and the
// focus ring is drawn for pad users even when focus moved by script. The game's input state keeps its own copy for
// play; this one lives in the UI so the shell (title, settings) works before a game exists and a test can drive it.
import { signal } from '@preact/signals';
import { DEVICE_SWITCH_HYST_S } from '@/input/defaults';
import { padStyleOf, type PadStyle } from '@/input/glyphs';
import type { InputDevice } from '@/input/types';

/** The device whose bindings key hints show. Read it in a component (`.value`) to follow it. */
export const inputDevice = signal<InputDevice>('kbm');
/** Glyph family of the last pad used. */
export const padStyle = signal<PadStyle>('xbox');

/** Last-used-device logic with the GDD's 0.5 s hysteresis, pure so it is testable without a browser. */
export class DeviceTracker {
  current: InputDevice = 'kbm';
  private since = -Infinity;

  /** Reports input from `device` at `nowMs`; returns true when the active device changed. */
  note(device: InputDevice, nowMs: number): boolean {
    if (device === this.current) return false;
    if ((nowMs - this.since) / 1000 < DEVICE_SWITCH_HYST_S) return false; // a stray event right after a switch
    this.current = device;
    this.since = nowMs;
    return true;
  }
}

const tracker = new DeviceTracker();

function publish(): void {
  if (inputDevice.peek() !== tracker.current) inputDevice.value = tracker.current;
  if (typeof document !== 'undefined') document.documentElement.dataset.input = tracker.current;
}

/** Input from the pad this frame (the controller calls it; `id` is the pad's id string). */
export function notePad(id: string, nowMs: number): void {
  const style = padStyleOf(id);
  if (padStyle.peek() !== style) padStyle.value = style;
  if (tracker.note('pad', nowMs)) publish();
}

export function noteKbm(nowMs: number): void {
  if (tracker.note('kbm', nowMs)) publish();
}

/** Forces the device (tests, the debug API). */
export function setInputDevice(device: InputDevice, style: PadStyle = padStyle.peek()): void {
  tracker.current = device;
  (tracker as unknown as { since: number }).since = -Infinity;
  padStyle.value = style;
  publish();
}

/** Listens for keyboard and mouse use. Trusted events only: the navigation layer's own synthetic keys are the pad. */
export function startKbmWatch(win: Window = window): () => void {
  const now = () => win.performance.now();
  let lastX = -1, lastY = -1;
  const onKey = (e: KeyboardEvent) => { if (e.isTrusted) noteKbm(now()); };
  const onDown = (e: MouseEvent) => { if (e.isTrusted) noteKbm(now()); };
  const onMove = (e: MouseEvent) => {
    if (!e.isTrusted) return;
    if (lastX >= 0 && Math.hypot(e.clientX - lastX, e.clientY - lastY) < 4) return; // jitter
    if (lastX >= 0) noteKbm(now());
    lastX = e.clientX; lastY = e.clientY;
  };
  const onWheel = (e: Event) => { if (e.isTrusted) noteKbm(now()); };
  win.addEventListener('keydown', onKey, true);
  win.addEventListener('mousedown', onDown, true);
  win.addEventListener('mousemove', onMove, true);
  win.addEventListener('wheel', onWheel, true);
  publish();
  return () => {
    win.removeEventListener('keydown', onKey, true);
    win.removeEventListener('mousedown', onDown, true);
    win.removeEventListener('mousemove', onMove, true);
    win.removeEventListener('wheel', onWheel, true);
  };
}
