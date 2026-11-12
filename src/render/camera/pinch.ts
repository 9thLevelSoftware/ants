// Pinch fallback and ceiling comfort of the possession camera (spike-nest 5.9-5.10).
//  - Pinch: squeezed closer than PINCH_DIST_L to the pivot for PINCH_HOLD_S, the camera rises over the ant along
//    its up and looks down at it, heading at the top of the screen; it returns once there is room again.
//  - Ceiling comfort (an option): with the ant upside down the view's up leans toward world up; orbit and
//    collision stay in the ant's frame, only the picture's roll changes.
import { v3AddScaled, v3Dot, v3Lerp, v3Normalize, v3Sub, vec3, type Vec3 } from '@/core';
import { COMFORT_UP_Y_FULL, COMFORT_UP_Y_START, PINCH_BLEND_S, PINCH_DIST_L, PINCH_EXIT_L, PINCH_HEIGHT_L, PINCH_HOLD_S } from './constants';
import { slerpUnit } from './frameMath';
import type { TraceFn } from './types';

export class PinchFallback {
  /** 0 = normal framing, 1 = fully over the ant. */
  weight = 0;
  active = false;
  private squeezedFor = 0;
  private roomyFor = 0;
  private over = vec3();
  private up = vec3();

  reset(): void {
    this.weight = 0; this.active = false; this.squeezedFor = 0; this.roomyFor = 0;
  }

  /** `allowedMm`: how far the normal framing may put the camera from the pivot this frame. */
  update(dt: number, allowedMm: number, lengthMm: number): number {
    if (allowedMm < PINCH_DIST_L * lengthMm) { this.squeezedFor += dt; this.roomyFor = 0; } else this.squeezedFor = 0;
    if (allowedMm > PINCH_EXIT_L * lengthMm) this.roomyFor += dt; else this.roomyFor = 0;
    if (!this.active && this.squeezedFor >= PINCH_HOLD_S) this.active = true;
    if (this.active && this.roomyFor >= PINCH_HOLD_S) this.active = false;
    const rate = dt / PINCH_BLEND_S;
    this.weight += Math.max(-rate, Math.min(rate, (this.active ? 1 : 0) - this.weight));
    return this.weight;
  }

  /**
   * Blends `pos` (normal framing) toward the over-the-ant point by the current weight and writes the matching view
   * up into `up` (camera up -> ant heading). `base` is the pivot base (clear by R), `u` the camera up.
   */
  apply(pos: Vec3, up: Vec3, base: Vec3, u: Vec3, fwd: Vec3, lengthMm: number, radiusMm: number, trace: TraceFn): void {
    if (this.weight <= 0) return;
    const h = Math.max(0, Math.min(PINCH_HEIGHT_L * lengthMm, trace(base, u, PINCH_HEIGHT_L * lengthMm, radiusMm) - 0.05 * radiusMm));
    v3AddScaled(this.over, base, u, h);
    v3Lerp(pos, pos, this.over, this.weight);
    slerpUnit(this.up, u, fwd, this.weight);
    v3Normalize(up, this.up);
  }
}

const _view = vec3(), _wu = vec3(), _lean = vec3();
const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

/** Ceiling-comfort strength for an ant whose (camera) up has world y = upY: 0 upright .. 1 upside down. */
export function comfortWeight(upY: number): number {
  const k = (COMFORT_UP_Y_START - upY) / (COMFORT_UP_Y_START - COMFORT_UP_Y_FULL);
  const c = Math.max(0, Math.min(1, k));
  return c * c * (3 - 2 * c);
}

/** Leans the view up `up` toward world up (projected off the view direction) by `w`. In place; degenerate -> unchanged. */
export function leanUp(up: Vec3, pos: Vec3, look: Vec3, w: number): Vec3 {
  if (w <= 0) return up;
  v3Sub(_view, look, pos);
  if (v3Normalize(_view, _view) < 1e-9) return up;
  // world up without its view-direction part; looking straight up or down there is none, keep the ant frame
  v3AddScaled(_wu, WORLD_UP, _view, -v3Dot(WORLD_UP, _view));
  if (v3Normalize(_wu, _wu) < 0.1) return up;
  slerpUnit(_lean, up, _wu, w);
  v3Normalize(up, _lean);
  return up;
}
