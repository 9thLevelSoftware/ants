// The ONE place that reads gamepads from the browser. Everything that needs the pad (the game's input state, the
// menu navigation layer in src/ui/nav, the rebinding capture) calls `readGamepads()`, which calls
// `navigator.getGamepads()` once per call. A test can therefore inject a virtual pad by overriding that single
// browser function in the page (Playwright has no gamepad); nothing in the game has to be touched.
import { STICK_DEADZONE } from './defaults';
import { padHasInput } from './gamepad';
import type { PadSnapshot } from './types';

/** Snapshot of one browser Gamepad (button values 0..1, axes -1..1). */
export function snapshotOf(g: Gamepad): PadSnapshot {
  return { index: g.index, id: g.id, mapping: g.mapping, buttons: g.buttons.map((b) => b.value || (b.pressed ? 1 : 0)), axes: [...g.axes] };
}

/** Is the Gamepad API there at all? */
export function gamepadApiPresent(win: Window | undefined = typeof window === 'undefined' ? undefined : window): boolean {
  return !!win && typeof win.navigator?.getGamepads === 'function';
}

/**
 * All connected pads as snapshots (null entries kept, as `navigator.getGamepads()` returns them, so indices stay
 * stable). Never throws: a refused or missing API reads as no pads.
 */
export function readGamepads(win: Window | undefined = typeof window === 'undefined' ? undefined : window): (PadSnapshot | null)[] {
  if (!gamepadApiPresent(win)) return [];
  try {
    return Array.from(win!.navigator.getGamepads() as ArrayLike<Gamepad | null>).map((g) => (g && g.connected !== false ? snapshotOf(g) : null));
  } catch {
    return [];
  }
}

/**
 * The pad the player uses, stateless: the first connected pad that shows input right now, else the first connected
 * one. (A second controller or a remapper's virtual pad can sit in slot 0 while the player uses slot 1.)
 */
export function firstPad(pads: readonly (PadSnapshot | null)[], deadZone = STICK_DEADZONE): PadSnapshot | null {
  let first: PadSnapshot | null = null;
  for (const p of pads) {
    if (!p) continue;
    if (padHasInput(p, deadZone)) return p;
    first ??= p;
  }
  return first;
}

/**
 * The same choice as the game's PadTracker (GDD 01 5.8) for code that only needs the pad, not its events: the first
 * pad to produce input becomes the player pad and stays it until it disconnects. Until one has produced input, the
 * first connected pad is read, so a lone idle pad works for the menus.
 */
export class PlayerPadPicker {
  private index = -1;

  pick(pads: readonly (PadSnapshot | null)[], deadZone = STICK_DEADZONE): PadSnapshot | null {
    const current = pads.find((p) => p && p.index === this.index);
    if (current) return current;
    const chosen = firstPad(pads, deadZone);
    this.index = chosen && padHasInput(chosen, deadZone) ? chosen.index : -1;
    return chosen;
  }
}
