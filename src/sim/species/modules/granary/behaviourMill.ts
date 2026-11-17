// Task `mill` for a granary species (GDD 07 §6.3.6): a miller walks to a granary holding seed she can crack and runs
// `mill-seed` there until her batch is done, then reports a task cycle. She stops when the paste stock is above
// target (milling ahead of need only feeds the spoilage).
//   mill.find  choose the granary (current chamber first)
//   mill.go    walk into it
//   mill.work  the primitive

import type { Ant, Behaviour, Chamber, Sim } from '@/sim/types';
import { ROOM_ARRIVE_FRAC } from '@/sim/balance/nestwork';
import { endCycle, releaseAll, think } from '@/sim/ants/behaviours/nest/common';
import { B, bbv, setState } from '@/sim/ants/behaviours/nest/fsm';
import { chamberIn, homeNest } from '@/sim/ants/behaviours/nest/places';
import { actEnded, busy, entity, travel, tryAct } from '@/sim/ants/behaviours/nest/travel';
import { granaryParams } from './params';
import { millCohort, pasteDemandPerGd } from './paste';
import { MILL_WANT } from './actions';
import { MILL_BATCH_LOADS } from '@/sim/balance/species-harvester';

const ENTRY = 'mill.find';

/** The colony has paste enough (stock at or above pasteTargetGd days of demand). */
export function pasteEnough(sim: Sim, ant: Ant): boolean {
  const col = sim.stores.colonies.get(ant.colony);
  const g = col ? granaryParams(sim.getSpecies(col.species)) : null;
  if (!col?.granary || !g) return true;
  const demand = pasteDemandPerGd(g, col);
  return demand > 0 && col.granary.pasteLoads >= g.pasteTargetGd * demand;
}

/** The granary chamber of the ant's nest where she can mill, current chamber first; undefined none. */
function millRoom(sim: Sim, ant: Ant): Chamber | undefined {
  const col = sim.stores.colonies.get(ant.colony);
  const g = col ? granaryParams(sim.getSpecies(col.species)) : null;
  const nest = homeNest(sim, ant);
  if (!col?.granary || !g || !nest) return undefined;
  let best: Chamber | undefined, bestD = Infinity;
  for (const gr of col.granary.granaries) {
    const ch = chamberIn(nest, gr.chamberId);
    if (!ch || !millCohort(g, ant, gr)) continue;
    const d = gr.chamberId === ant.chamberId ? -1 : Math.hypot(ch.center.x - ant.pos.x, ch.center.y - ant.pos.y, ch.center.z - ant.pos.z);
    if (d < bestD) { bestD = d; best = ch; }
  }
  return best;
}

function step(sim: Sim, ant: Ant): void {
  switch (ant.state) {
    case 'mill.go': {
      const nest = homeNest(sim, ant);
      const ch = nest ? chamberIn(nest, bbv(ant, B.jobDest)) : undefined;
      if (!ch) { setState(sim, ant, ENTRY); return; }
      if (ant.chamberId === ch.id) { setState(sim, ant, 'mill.work'); return; }
      const st = travel(sim, ant, entity('chamber', ch.id, ch.center), ROOM_ARRIVE_FRAC * Math.min(ch.radii.x, ch.radii.z));
      if (st === 'arrived') setState(sim, ant, 'mill.work');
      else if (st === 'failed') endCycle(sim, ant, ENTRY, 'job:mill');
      return;
    }
    case 'mill.work': {
      if (actEnded(ant)) { endCycle(sim, ant, ENTRY); return; }
      if (busy(ant)) return;
      ant.bb[MILL_WANT] = MILL_BATCH_LOADS;
      if (tryAct(sim, ant, 'mill-seed', null) !== null) setState(sim, ant, ENTRY);
      return;
    }
    default: {
      if (pasteEnough(sim, ant)) { endCycle(sim, ant, ENTRY, 'job:mill'); return; }
      const ch = millRoom(sim, ant);
      if (!ch) { endCycle(sim, ant, ENTRY, 'job:mill'); return; }
      setState(sim, ant, 'mill.go');
      ant.bb[B.jobDest] = ch.id;
    }
  }
}

export const millBehaviour: Behaviour = {
  task: 'mill', species: ['messor-barbarus'],
  enter: (sim, ant) => setState(sim, ant, ENTRY),
  update: (sim, ant) => think(sim, ant, ENTRY, step),
  exit: (sim, ant) => releaseAll(sim, ant),
};
