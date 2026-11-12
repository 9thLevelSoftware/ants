// GDD 02 §10.0 "carried item and task change: deliver first": an ant whose task changed while it carried brood
// (a nurse made a hauler, say) first takes the brood to the best chamber for its stage (§10.4.1) and puts it down
// on that pile, then starts its new task. Nurses and queen carers carry brood as part of their own states.

import type { Ant, Sim } from '@/sim/types';
import { BROOD_DROP_ARRIVE_BU } from '@/sim/balance/nestwork';
import { sortOf } from './board';
import { approach } from './common';
import { B } from './fsm';
import { chamberIn, homeNest, pileSlot } from './places';
import { bestChamberId, groupOf } from './sorting';
import { act, entity, resetTravel } from './travel';

/** bb: 1 while delivering brood held from an earlier task. */
const DELIVERING = 'bn.dl';
const spot = { x: 0, y: 0, z: 0 };

/** One step of delivering held brood; true while it goes on (the state's own step waits). */
export function deliverHeldBrood(sim: Sim, ant: Ant): boolean {
  if (ant.carry.kind !== 'brood' || ant.task === 'nurse' || ant.task === 'queen-care') {
    if (ant.bb[DELIVERING] === 1) { ant.bb[DELIVERING] = 0; ant.bb[B.began] = 0; resetTravel(ant); }
    return false;
  }
  const b = sim.stores.brood.get(ant.carry.id);
  const nest = homeNest(sim, ant);
  const ctx = nest ? sortOf(sim, ant.colony, nest.id) : undefined;
  const room = nest && b ? chamberIn(nest, ctx ? bestChamberId(ctx, groupOf(b)) : -1) ?? chamberIn(nest, b.chamberId) : undefined;
  if (!b || !room) return false; // nowhere better: the state puts it down where the ant stands
  if (ant.bb[DELIVERING] !== 1) { ant.bb[DELIVERING] = 1; resetTravel(ant); }
  pileSlot(room, groupOf(b), b.id, sim.world.bu, spot);
  const st = approach(sim, ant, entity('point', -1, spot), BROOD_DROP_ARRIVE_BU * sim.world.bu, true);
  if (st === 'failed') { ant.bb[DELIVERING] = 0; resetTravel(ant); return false; }
  if (st === 'arrived') act(sim, ant, 'put-down', null);
  return true;
}
