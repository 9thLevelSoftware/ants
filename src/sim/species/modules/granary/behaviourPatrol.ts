// Task `patrol` for a granary species (GDD 07 §5.3.7 morning patrol gate): the shared patrol behaviour
// (src/sim/ants/behaviours/outdoor/patrol.ts), but while the colony's gate is closed in an active window a patroller
// turns home after GATE_PATROL_TRIP_S outside. The shared trip (PATROL_TRIP_S, 180 game s = 7 clock hours) is a
// territory patrol; the morning patrol is a short look round whose safe return opens foraging, so with the shared
// trip no patroller ever came back before the gate's fail-safe. A returning patroller also walks on into the
// entrance chamber (the shared return stops at the hole, outside).

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { patrolBehaviour } from '@/sim/ants/behaviours/outdoor/patrol';
import { navStop } from '@/sim/locomotion';
import { GATE_PATROL_TRIP_S, PATROL_ENTER_ARRIVE_BU, PATROL_ENTER_THINK_TICKS } from '@/sim/balance/species-harvester';
import { entranceChamber, homeNest } from '@/sim/ants/behaviours/outdoor/common';
import { goToChamber } from '@/sim/ants/behaviours/outdoor/nav';
import { secondsToTicks } from '@/sim/time';
import { patrolPending } from './rhythm';

/** Tick the patroller was first seen outside on this patrol. */
const OUT0 = 'mb.pt.out';
/** The shared behaviour's return state (documented in its header). */
const RETURN_STATE = 'patrol.return';

/** Whether this gate patroller has looked round long enough and should come back now. */
export function gatePatrolDone(sim: Sim, ant: Ant): boolean {
  const out0 = ant.bb[OUT0];
  if (out0 === undefined || ant.nestId >= 0 || ant.state === RETURN_STATE) return false;
  const col = sim.stores.colonies.get(ant.colony);
  if (!col || !patrolPending(sim, col)) return false;
  return sim.state.tick - out0 >= secondsToTicks(GATE_PATROL_TRIP_S);
}

/** Ticks a gate patroller is overdue: outside longer than GATE_PATROL_TRIP_S (0 when not out or not late). */
export function patrolOverdueTicks(sim: Sim, ant: Ant): number {
  const out0 = ant.bb[OUT0];
  if (out0 === undefined || ant.nestId >= 0) return 0;
  return Math.max(0, sim.state.tick - out0 - secondsToTicks(GATE_PATROL_TRIP_S));
}

/**
 * The shared return walks to the entrance point and ends there, outside the hole (nestId stays -1), so the patroller
 * never counts as back. A harvester patroller arrived at the hole walks on into the entrance chamber, as foragers do.
 */
function enterNest(sim: Sim, ant: Ant): boolean {
  if (ant.state !== RETURN_STATE || ant.nestId >= 0 || ant.nav.status !== 'arrived') return false;
  const nest = homeNest(sim, ant);
  const room = nest ? entranceChamber(nest) : undefined;
  return !!room && goToChamber(sim, ant, room, PATROL_ENTER_ARRIVE_BU);
}

function update(sim: Sim, ant: Ant): void {
  if (ant.nestId < 0 && ant.bb[OUT0] === undefined) ant.bb[OUT0] = sim.state.tick;
  if (gatePatrolDone(sim, ant)) {
    // the shared behaviour walks home from its return state once no move is in flight
    navStop(sim, ant);
    ant.state = RETURN_STATE;
    ant.stateTick = sim.state.tick;
  }
  if (enterNest(sim, ant)) { ant.thinkTick = sim.state.tick + PATROL_ENTER_THINK_TICKS; return; }
  patrolBehaviour.update(sim, ant);
}

export const harvesterPatrolBehaviour: Behaviour = {
  task: 'patrol', species: ['messor-barbarus'],
  enter(sim, ant) {
    delete ant.bb[OUT0];
    patrolBehaviour.enter?.(sim, ant);
  },
  update,
  exit(sim, ant) {
    delete ant.bb[OUT0];
    patrolBehaviour.exit?.(sim, ant);
  },
};
