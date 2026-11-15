// Small movement helpers of the rival jobs: one locomotion request per leg (the walker steers between thinks),
// polled through nav.status. Points live in ant.bb (rv.tx/ty/tz).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Sim, TargetRef } from '@/sim/types';
import { navStop, navTo, navToTarget, navWander } from '@/sim/locomotion';
import { AGENT_ARRIVE_BU } from '@/sim/balance/rivals';
import { BB } from '../state';

export type LegStatus = 'moving' | 'arrived' | 'failed';

export function setTarget(ant: Ant, p: Vec3, id = -1): void {
  ant.bb[BB.tx] = p.x; ant.bb[BB.ty] = p.y; ant.bb[BB.tz] = p.z; ant.bb[BB.tid] = id;
  ant.bb[BB.go] = 0;
}

export function targetOf(ant: Ant, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 | null {
  const x = ant.bb[BB.tx];
  if (x === undefined) return null;
  out.x = x; out.y = ant.bb[BB.ty] ?? 0; out.z = ant.bb[BB.tz] ?? 0;
  return out;
}

export function d3(a: Vec3, b: Vec3): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

export function d2(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

const tmp = { x: 0, y: 0, z: 0 };

/** Walks to the bb target point (one request per leg). */
export function goPoint(sim: Sim, ant: Ant, arriveBu = AGENT_ARRIVE_BU): LegStatus {
  const t = targetOf(ant, tmp);
  if (!t) return 'failed';
  const arrive = arriveBu * sim.world.bu;
  if (ant.bb[BB.go] === 1) {
    if (ant.nav.status === 'moving') return 'moving';
    if (ant.nav.status === 'arrived' || d3(ant.pos, t) <= arrive * 1.5) return 'arrived';
    return 'failed';
  }
  if (d3(ant.pos, t) <= arrive) return 'arrived';
  ant.bb[BB.go] = 1;
  return navTo(sim, ant, { x: t.x, y: t.y, z: t.z }, arrive) ? 'moving' : 'failed';
}

/** Walks to an entity / entrance / chamber target (one request per leg). */
export function goTarget(sim: Sim, ant: Ant, target: TargetRef, arriveBu = AGENT_ARRIVE_BU): LegStatus {
  const arrive = arriveBu * sim.world.bu;
  if (ant.bb[BB.go] === 1) {
    if (ant.nav.status === 'moving') return 'moving';
    if (ant.nav.status === 'arrived' || d3(ant.pos, target.pos) <= arrive * 1.5) return 'arrived';
    return 'failed';
  }
  if (d3(ant.pos, target.pos) <= arrive) return 'arrived';
  ant.bb[BB.go] = 1;
  return navToTarget(sim, ant, target, arrive) ? 'moving' : 'failed';
}

/** Loiters around a point (a wander that never arrives). */
export function loiter(sim: Sim, ant: Ant, center: Vec3, radiusBu: number): void {
  if (ant.bb[BB.go] === 2 && ant.nav.status === 'moving') return;
  ant.bb[BB.go] = 2;
  navWander(sim, ant, center, radiusBu * sim.world.bu);
}

/** Stops and forgets the current leg. */
export function halt(sim: Sim, ant: Ant): void {
  if (ant.nav.status === 'moving') navStop(sim, ant);
  ant.bb[BB.go] = 0;
}

/** A point on the ground at distance r (mm) and angle a from c, clamped inside the world. */
export function groundPoint(sim: Sim, c: { x: number; z: number }, r: number, a: number): Vec3 {
  const m = 2 * sim.world.bu, L = sim.world.size;
  const x = Math.min(L - m, Math.max(m, c.x + Math.cos(a) * r));
  const z = Math.min(L - m, Math.max(m, c.z + Math.sin(a) * r));
  return { x, y: sim.field.height(x, z), z };
}
