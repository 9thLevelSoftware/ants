// Pure gamepad helpers: dead zones, response curve, digital thresholds, player-pad selection and hot-plug.
import { PAD, PAD_BUTTON_THRESHOLD, TRIGGER_THRESHOLD } from './defaults';
import type { InputEvent, PadSnapshot, Vec2 } from './types';

/** Radial dead zone with rescale: |v| < dz -> 0, otherwise the magnitude is remapped dz..1 -> 0..1. */
export function radialDeadzone(out: Vec2, x: number, y: number, dz: number): Vec2 {
  const len = Math.hypot(x, y);
  if (len <= dz || len === 0) { out.x = 0; out.y = 0; return out; }
  const mag = Math.min(1, (len - dz) / (1 - dz));
  out.x = (x / len) * mag;
  out.y = (y / len) * mag;
  return out;
}

/** Response curve |v|^exp keeping direction (stick look). */
export function applyResponse(out: Vec2, v: Vec2, exponent: number): Vec2 {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) { out.x = 0; out.y = 0; return out; }
  const s = Math.pow(len, exponent) / len;
  out.x = v.x * s;
  out.y = v.y * s;
  return out;
}

/** Digital threshold for a button: analogue triggers use TRIGGER_THRESHOLD. */
export function buttonThreshold(button: number): number {
  return button === PAD.LT || button === PAD.RT ? TRIGGER_THRESHOLD : PAD_BUTTON_THRESHOLD;
}

export function padButtonDown(p: PadSnapshot | null, button: number): boolean {
  if (!p) return false;
  return (p.buttons[button] ?? 0) > buttonThreshold(button);
}

/** Does this snapshot show any input above dead zone / thresholds? */
export function padHasInput(p: PadSnapshot, dz: number): boolean {
  for (let i = 0; i < p.buttons.length; i++) if ((p.buttons[i] ?? 0) > buttonThreshold(i)) return true;
  for (let i = 0; i + 1 < p.axes.length; i += 2) if (Math.hypot(p.axes[i], p.axes[i + 1]) > dz) return true;
  return false;
}

/**
 * Chooses the player pad among all connected pads (GDD 01 5.8): the first pad to produce input above dead zone
 * becomes the player pad; others are ignored until it disconnects. Emits connect/disconnect/non-standard events.
 */
export class PadTracker {
  private known = new Map<number, string>();
  private warnedNonStandard = new Set<number>();
  playerIndex = -1;

  /** Feed all connected pads (null entries allowed, as navigator.getGamepads() returns). Returns the player pad. */
  update(pads: readonly (PadSnapshot | null)[], dz: number, events: InputEvent[]): PadSnapshot | null {
    const seen = new Set<number>();
    for (const p of pads) {
      if (!p) continue;
      seen.add(p.index);
      if (!this.known.has(p.index)) {
        this.known.set(p.index, p.id);
        events.push({ type: 'pad-connected', index: p.index, id: p.id });
      }
      if (p.mapping !== 'standard' && !this.warnedNonStandard.has(p.index)) {
        this.warnedNonStandard.add(p.index);
        events.push({ type: 'pad-nonstandard', index: p.index, id: p.id });
      }
    }
    for (const idx of [...this.known.keys()]) {
      if (seen.has(idx)) continue;
      this.known.delete(idx);
      this.warnedNonStandard.delete(idx);
      events.push({ type: 'pad-disconnected', index: idx, wasActiveDevice: idx === this.playerIndex });
      if (idx === this.playerIndex) this.playerIndex = -1;
    }
    if (this.playerIndex < 0) {
      for (const p of pads) if (p && padHasInput(p, dz)) { this.playerIndex = p.index; break; }
    }
    for (const p of pads) if (p && p.index === this.playerIndex) return p;
    return null;
  }
}
