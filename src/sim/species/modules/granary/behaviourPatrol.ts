// Task `patrol` for a granary species (GDD 07 §5.3.7 morning patrol gate): the shared patrol behaviour
// (src/sim/ants/behaviours/outdoor/patrol.ts), but while the colony's gate is closed in an active window a patroller
// turns home after GATE_PATROL_TRIP_S outside. The shared trip (PATROL_TRIP_S, 180 game s = 7 clock hours) is a
// territory patrol; the morning patrol is a short look round whose safe return opens foraging, so with the shared
// trip no patroller ever came back before the gate's fail-safe.

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { patrolBehaviour } from '@/sim/ants/behaviours/outdoor/patrol';
import { navStop } from '@/sim/locomotion';
import { GATE_PATROL_TRIP_S } from '@/sim/balance/species-harvester';
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

function update(sim: Sim, ant: Ant): void {
  if (ant.nestId < 0 && ant.bb[OUT0] === undefined) ant.bb[OUT0] = sim.state.tick;
  if (gatePatrolDone(sim, ant)) {
    // the shared behaviour walks home from its return state once no move is in flight
    navStop(sim, ant);
    ant.state = RETURN_STATE;
    ant.stateTick = sim.state.tick;
  }
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
