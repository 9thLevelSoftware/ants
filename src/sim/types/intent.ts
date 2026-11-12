// Player intent for the possessed ant (contracts guidance §8, GDD 01 App. A `state.player.intent`).
// The game layer converts camera-relative input into a world-space direction; the sim projects it onto the
// ant's tangent plane.

import type { Vec3 } from '@/core/math/vec3';
import type { ActionId } from './ids/ants';

/** Flight controls while a possessed alate flies (GDD 01 §4.4, GDD 06 §11.6). */
export interface FlightIntent {
  /** -1..1 each. */
  thrust: number;
  brake: number;
  bank: number;
  climb: number;
  descend: number;
}

export interface PlayerIntent {
  /** World-space desired direction, length 0..1 (length = input magnitude). */
  dir: Vec3;
  hurry: boolean;
  /** Grip held (cling to the surface). */
  grip: boolean;
  /** Actions whose input is currently held (dig, bite, special, interact, inspect map to ActionIds). */
  held: ActionId[];
  /** Flight controls; null when not flying. */
  flight: FlightIntent | null;
}

/** A neutral intent (allocates). */
export function idleIntent(): PlayerIntent {
  return { dir: { x: 0, y: 0, z: 0 }, hurry: false, grip: false, held: [], flight: null };
}
