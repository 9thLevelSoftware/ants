// The ONE place that reads gamepads from the browser. Everything that needs the pad (the game's input state, the
// menu navigation layer in src/ui/nav, the rebinding capture) calls `readGamepads()`, which calls
// `navigator.getGamepads()` once per call. A test can therefore inject a virtual pad by overriding that single
// browser function in the page (Playwright has no gamepad); nothing in the game has to be touched.
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

/** The pad the player uses: the first connected one (the game's tracker is more exact; menus only need one). */
export function firstPad(pads: readonly (PadSnapshot | null)[]): PadSnapshot | null {
  for (const p of pads) if (p) return p;
  return null;
}
