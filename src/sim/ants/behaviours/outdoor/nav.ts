// Locomotion requests the outdoor behaviours make (behaviours never move ants themselves, GDD 02 D10 / contracts
// guidance §4): thin wrappers that pick arrival radii and targets, and status predicates.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Chamber, FoodSource, Sim } from '@/sim/types';
import { HARVEST_REACH_PAD_BU } from '@/sim/balance/foraging';
import { footprintMm } from '@/sim/ecology';
import { navStop, navTo, navToTarget, type NavOptions } from '@/sim/locomotion';
import { K } from './keys';

export function moving(ant: Ant): boolean {
  return ant.nav.status === 'moving';
}
export function arrived(ant: Ant): boolean {
  return ant.nav.status === 'arrived';
}
export function failed(ant: Ant): boolean {
  return ant.nav.status === 'failed';
}

export function goTo(sim: Sim, ant: Ant, p: Vec3, arriveBu: number, opts?: NavOptions): boolean {
  return navTo(sim, ant, p, arriveBu * sim.world.bu, opts);
}

/** Distance from the ant to the edge of the source's footprint, mm. */
export function sourceEdgeDist(sim: Sim, ant: Ant, s: FoodSource): number {
  return Math.hypot(ant.pos.x - s.pos.x, ant.pos.y - s.pos.y, ant.pos.z - s.pos.z) - footprintMm(s, sim.world.bu);
}

/** Close enough to start harvesting (the primitive still checks its own reach and cone). */
export function atSource(sim: Sim, ant: Ant, s: FoodSource): boolean {
  return sourceEdgeDist(sim, ant, s) <= HARVEST_REACH_PAD_BU * sim.world.bu;
}

/** Walk to the source's footprint edge, facing it. */
export function goToSource(sim: Sim, ant: Ant, s: FoodSource): boolean {
  const arrive = footprintMm(s, sim.world.bu) + 0.3 * ant.lengthBu * sim.world.bu;
  return navToTarget(sim, ant, { kind: 'source', id: s.id, pos: s.pos }, arrive);
}

export function goToChamber(sim: Sim, ant: Ant, c: Chamber, arriveBu: number): boolean {
  return navToTarget(sim, ant, { kind: 'chamber', id: c.id, pos: c.center }, arriveBu * sim.world.bu);
}

export function stop(sim: Sim, ant: Ant): void {
  if (ant.nav.status !== 'idle') navStop(sim, ant);
}

/** Trip destination point stored in bb (K.dx/dy/dz). */
export function destOf(ant: Ant, out: Vec3): Vec3 {
  out.x = ant.bb[K.dx] ?? ant.pos.x;
  out.y = ant.bb[K.dy] ?? ant.pos.y;
  out.z = ant.bb[K.dz] ?? ant.pos.z;
  return out;
}

export function setDest(ant: Ant, p: Vec3): void {
  ant.bb[K.dx] = p.x;
  ant.bb[K.dy] = p.y;
  ant.bb[K.dz] = p.z;
}

export function distXZ(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}
