// The possessed nuptial flight's kinematics (GDD 06 §11.6, GDD 01 §4.4), kept deliberately simple: a guided glide
// above the terrain height field. The gyne turns toward the steering direction at a fixed rate, flies forward at
// FLIGHT_FORWARD_BU_S, climbs (FLIGHT_CLIMB_BU_S) or descends on request and otherwise sinks slowly, and drifts
// with the wind. Pure: the caller supplies the ground height and the wind.

import {
  FLIGHT_CEILING_BU, FLIGHT_CLIMB_BU_S, FLIGHT_DESCEND_BU_S, FLIGHT_FORWARD_BU_S, FLIGHT_SINK_BU_S, FLIGHT_TURN_RAD_S,
  FLIGHT_WIND_DRIFT_BU_PER_MS,
} from '@/sim/balance/lifecycle';

export interface GlideState {
  x: number;
  y: number;
  z: number;
  /** Heading in the XZ plane, radians (0 = +X). */
  yaw: number;
}

export interface GlideInput {
  /** Desired horizontal direction (any length; 0 = keep heading). */
  steerX: number;
  steerZ: number;
  /** -1 descend .. +1 climb. */
  climb: number;
  /** Forward thrust 0..1 (1 = full speed; braking hovers at a third). */
  thrust: number;
  /** Wind at 2 m, m/s, and its unit direction in XZ. */
  windMs: number;
  windX: number;
  windZ: number;
  /** World body unit, mm. */
  bu: number;
}

const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));

/** One step of `dt` seconds; `ground` gives the terrain height (mm) under a point. Returns the vertical speed used. */
export function glideStep(s: GlideState, inp: GlideInput, dt: number, ground: (x: number, z: number) => number): number {
  const L = Math.hypot(inp.steerX, inp.steerZ);
  if (L > 1e-6) {
    const want = Math.atan2(inp.steerZ, inp.steerX);
    const d = wrap(want - s.yaw);
    const turn = Math.max(-FLIGHT_TURN_RAD_S * dt, Math.min(FLIGHT_TURN_RAD_S * dt, d));
    s.yaw = wrap(s.yaw + turn);
  }
  const fwd = FLIGHT_FORWARD_BU_S * inp.bu * Math.max(1 / 3, Math.min(1, inp.thrust));
  const drift = FLIGHT_WIND_DRIFT_BU_PER_MS * inp.windMs * inp.bu;
  s.x += (Math.cos(s.yaw) * fwd + inp.windX * drift) * dt;
  s.z += (Math.sin(s.yaw) * fwd + inp.windZ * drift) * dt;
  const vy = inp.climb > 0.05 ? FLIGHT_CLIMB_BU_S * inp.bu * Math.min(1, inp.climb)
    : inp.climb < -0.05 ? -FLIGHT_DESCEND_BU_S * inp.bu * Math.min(1, -inp.climb) : -FLIGHT_SINK_BU_S * inp.bu;
  s.y += vy * dt;
  const g = ground(s.x, s.z);
  s.y = Math.min(s.y, g + FLIGHT_CEILING_BU * inp.bu);
  if (s.y < g) s.y = g;
  return vy;
}

/** Height above the ground, BU. */
export function heightAboveBu(s: GlideState, ground: (x: number, z: number) => number, bu: number): number {
  return (s.y - ground(s.x, s.z)) / bu;
}
