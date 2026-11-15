// Per-state framing parameters of the possession camera (GDD 01 6.3), in body lengths L and degrees.
import type { PossessionCamState } from './types';

export type Framing = 'orbit' | 'boom' | 'chase';

export interface StateParams {
  framing: Framing;
  /** Distance default / min / max in L (min = max = default for fixed distances). */
  dist: [number, number, number];
  /** Pitch default and range in degrees above the tangent plane (orbit / chase framings). */
  pitch: [number, number, number];
  fov: number;
}

export const STATE_PARAMS: Record<PossessionCamState, StateParams> = {
  // GDD: 5 L at 20°. Retuned (gate 1B, inside the GDD ranges): 3.5 L at 12° so the ant reads large in the lower
  // middle of the frame with the ground filling the foreground (the look-pass reference framing).
  open: { framing: 'orbit', dist: [3.5, 1.5, 18], pitch: [12, -5, 80], fov: 60 },
  chamber: { framing: 'orbit', dist: [4, 1.5, 8], pitch: [35, 0, 80], fov: 65 },
  tunnel: { framing: 'boom', dist: [2.5, 1.5, 4], pitch: [0, 0, 0], fov: 72 },
  // GDD: 1.2 L fixed. Retuned (views task, deviation): 1.8 L default, zoomable 1.2-2.5 L, so a queen in her own
  // 1 BU shaft is seen whole instead of filling the frame; the path boom keeps it inside the shaft.
  crevice: { framing: 'boom', dist: [1.8, 1.2, 2.5], pitch: [0, 0, 0], fov: 80 },
  falling: { framing: 'chase', dist: [5, 5, 5], pitch: [15, 15, 15], fov: 60 },
  flight: { framing: 'chase', dist: [6, 3, 15], pitch: [10, 10, 10], fov: 70 },
};

/**
 * Open state: the camera aims this far (L, along the camera up) above the pivot, so the ant sits in the lower middle
 * of the frame instead of its centre (gate 1B framing; blended with the state).
 */
export const OPEN_AIM_LIFT_L = 0.45;

/** Absolute distance cap in the open state (BU). */
export const OPEN_DIST_CAP_BU = 60;
/** Up-vector time constant while falling: eases to world +Y. */
export const FALLING_UP_TAU = 0.25;
