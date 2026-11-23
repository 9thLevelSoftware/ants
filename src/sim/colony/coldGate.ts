// Ruling R42 (colony-life direction 28, round 13): the cold does not catch workers outside. A worker does not start an
// outdoor trip while the surface air at the colony's entrance would slow her under OUTDOOR_DEPART_MIN_SPEED (the
// allocator then asks nobody to forage, tend or scout), and one already outside whose own body has cooled under
// OUTDOOR_TURN_BACK_SPEED heads home. Round 13's trace (pp #1, doy 17-19): two workers set out at 7-9 C, walked at
// 0.0-0.2 x for 2 game days and died `lost` 9 and 93 BU from the entrance.

import type { Ant, Colony, Sim } from '@/sim/types';
import { OUTDOOR_DEPART_MIN_SPEED, OUTDOOR_TURN_BACK_SPEED } from '@/sim/balance';
import { speedMult } from '@/sim/environment/thermalResponse';
import { pointTempC } from './envAdapter';

/** Thermal speed multiplier the surface air at the colony's main entrance gives its workers (1 with no nest). */
export function entranceAirSpeed(sim: Sim, col: Colony): number {
  let p = null;
  for (const nid of col.nestIds) {
    const n = sim.stores.nests.get(nid);
    if (n) { p = n.entrances.length > 0 ? n.entrances[0].pos : n.origin; break; }
  }
  return p ? speedMult(sim, pointTempC(sim, p), col.species) : 1;
}

/** R42: too cold at the entrance to start an outdoor trip. */
export function tooColdToDepart(sim: Sim, col: Colony): boolean {
  return entranceAirSpeed(sim, col) < OUTDOOR_DEPART_MIN_SPEED;
}

/** R42: a worker outside whose own body temperature slows her under OUTDOOR_TURN_BACK_SPEED. */
export function tooColdToStayOut(sim: Sim, ant: Ant): boolean {
  const col = sim.stores.colonies.get(ant.colony);
  return !!col && speedMult(sim, ant.tb, col.species) < OUTDOOR_TURN_BACK_SPEED;
}
