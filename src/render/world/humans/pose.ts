// Where a human-event actor is at a render time: the plan's keys (ticks after the instance start) interpolated with
// a smoothstep, yaw along the shortest arc. Pure (no three), unit-tested.

import type { ActorKey } from '@/sim/environment/human/plan';

export interface ActorPose {
  x: number; y: number; z: number;
  yaw: number;
  /** Underside height above the contact point, mm. */
  lift: number;
  /** 0..1 progress between the two keys (for spinning parts), and the travelled distance of the segment, mm. */
  u: number;
}

const smooth = (u: number): number => u * u * (3 - 2 * u);

function lerpAngle(a: number, b: number, u: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * u;
}

/**
 * Pose at time `t` (ticks after the instance start, fractional) or null outside the keys. `linear` keeps constant
 * speed between keys (machines on a path); the default eases (soles lifting and landing).
 */
export function samplePose(keys: readonly ActorKey[], t: number, out: ActorPose, linear = false): ActorPose | null {
  const n = keys.length;
  if (n === 0 || t < keys[0].t || t > keys[n - 1].t) return null;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) lo = mid; else hi = mid;
  }
  const a = keys[lo], b = keys[hi];
  const span = b.t - a.t;
  const u0 = span > 0 ? Math.min(1, Math.max(0, (t - a.t) / span)) : 1;
  const u = linear ? u0 : smooth(u0);
  out.x = a.x + (b.x - a.x) * u;
  out.y = a.y + (b.y - a.y) * u;
  out.z = a.z + (b.z - a.z) * u;
  out.yaw = lerpAngle(a.yaw, b.yaw, u);
  out.lift = a.lift + (b.lift - a.lift) * u;
  out.u = u0;
  return out;
}

/** Render time of a run in plan ticks: the sim tick interpolated by alpha, minus the instance start. */
export function planTime(simTick: number, alpha: number, startTick: number): number {
  return simTick - 1 + alpha - startTick;
}
