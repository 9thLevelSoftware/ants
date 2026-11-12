// Carrying a held item out to where it belongs: soil to the dump point beside the nearest open entrance (the nest
// module's dumpPoint; the pellet then settles into that entrance's mound, GDD 03 §1.3-1.4), waste and corpses to
// the colony midden (GDD 02 §10.8). Uses B.leg and B.drop* of the current state.

import type { Ant, Sim } from '@/sim/types';
import { dumpPoint, nearestEntrance } from '@/sim/nest';
import { DROP_ARRIVE_BU } from '@/sim/balance/nestwork';
import { B, bbv } from './fsm';
import { homeNest, middenPoint } from './places';
import { act, actEnded, entity } from './travel';
import { approach } from './common';

export type CarryStatus = 'moving' | 'dropped' | 'failed';

const p = { x: 0, y: 0, z: 0 };

/** Picks the drop point (into bb) for a trip to the mound or the midden; false if there is none. */
function chooseDrop(sim: Sim, ant: Ant, to: 'mound' | 'midden'): boolean {
  const nest = homeNest(sim, ant);
  if (!nest) return false;
  if (to === 'mound') {
    const e = nearestEntrance(sim, nest.id, ant.pos);
    if (!e) return false;
    dumpPoint(sim, e, p);
  } else if (!middenPoint(sim, nest, p)) return false;
  ant.bb[B.dropX] = p.x; ant.bb[B.dropY] = p.y; ant.bb[B.dropZ] = p.z;
  return true;
}

/** One step of a carry trip; call every think until 'dropped' (put down there) or 'failed'. */
export function carryTo(sim: Sim, ant: Ant, to: 'mound' | 'midden'): CarryStatus {
  const leg = bbv(ant, B.leg, 0);
  if (leg === 2) return actEnded(ant) ? (ant.carry.kind === 'none' ? 'dropped' : 'failed') : 'moving';
  if (ant.carry.kind === 'none') return 'failed';
  if (leg === 0) {
    if (!chooseDrop(sim, ant, to)) return 'failed';
    ant.bb[B.leg] = 1;
  }
  p.x = ant.bb[B.dropX]; p.y = ant.bb[B.dropY]; p.z = ant.bb[B.dropZ];
  const st = approach(sim, ant, entity('point', -1, p), DROP_ARRIVE_BU * sim.world.bu, true);
  if (st === 'failed') return 'failed';
  if (st === 'moving') return 'moving';
  if (!act(sim, ant, 'put-down', null)) return 'failed';
  ant.bb[B.leg] = 2;
  return 'moving';
}

/** Starts a new carry trip (forget an earlier drop point). */
export function resetCarry(ant: Ant): void {
  ant.bb[B.leg] = 0;
}
