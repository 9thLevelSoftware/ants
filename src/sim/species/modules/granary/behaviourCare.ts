// Task `store`, subtype `granary-care`, for a granary species (GDD 07 §6.3.4): a store worker who can gnaw walks to
// a granary with germinating seed and bites the radicles off (`gnaw-radicle`); sprouted seed she mills while it is
// soft (or gnaws back when the paste stock is full). With no granary work she does the ordinary store work
// (receiving, dispersing, cleaning: src/sim/ants/behaviours/nest/store.ts).
//   store.care-find  choose the granary
//   store.care-go    walk into it
//   store.care-work  gnaw or mill there

import { v3DistanceSq } from '@/core/math/vec3';
import type { Ant, Behaviour, Chamber, GranaryState, Sim } from '@/sim/types';
import { ROOM_ARRIVE_FRAC } from '@/sim/balance/nestwork';
import { GNAW_AI_BATCH_LOADS, GNAW_BATCH_LOADS, MILL_BATCH_LOADS } from '@/sim/balance/species-harvester';
import { endCycle, think } from '@/sim/ants/behaviours/nest/common';
import { B, bbv, setState } from '@/sim/ants/behaviours/nest/fsm';
import { chamberIn, homeNest } from '@/sim/ants/behaviours/nest/places';
import { actEnded, busy, entity, travel, tryAct } from '@/sim/ants/behaviours/nest/travel';
import { storeBehaviour } from '@/sim/ants/behaviours/nest/store';
import { canDo } from '@/sim/ants/actions/runner';
import { granaryParams } from './params';
import { germinatingLoads } from './cohorts';
import { millCohort } from './paste';
import { GNAW_WANT, MILL_WANT } from './actions';
import { pasteEnough } from './behaviourMill';

const CARE = 'store.care-find';
const STORE_ENTRY = 'store.post';

function isCareState(s: string): boolean {
  return s.startsWith('store.care-');
}

function sprouted(gr: GranaryState): number {
  let n = 0;
  for (const c of gr.cohorts) if (c.state === 'sprouted') n += c.loads;
  return n;
}

/** Work this ant can do in this granary: 'gnaw', 'mill' or null. */
function jobIn(sim: Sim, ant: Ant, gr: GranaryState): 'gnaw' | 'mill' | null {
  const col = sim.stores.colonies.get(ant.colony);
  const g = col ? granaryParams(sim.getSpecies(col.species)) : null;
  if (!g) return null;
  const gnawOk = canGnaw(sim, ant);
  if (germinatingLoads(gr) > 0 && gnawOk) return 'gnaw';
  if (sprouted(gr) > 0) {
    if (!pasteEnough(sim, ant) && millCohort(g, ant, gr)?.state === 'sprouted') return 'mill';
    if (gnawOk) return 'gnaw';
  }
  return null;
}

/** The species lets this ant gnaw radicles (minors and media; majors do not, GDD 07 §5.3.1). */
function canGnaw(sim: Sim, ant: Ant): boolean {
  const r = canDo(sim, ant, 'gnaw-radicle', null).reason;
  return r !== 'caste' && r !== 'species';
}

/** The nearest granary of the ant's nest with care work for her (current chamber first). */
function careRoom(sim: Sim, ant: Ant): Chamber | undefined {
  const col = sim.stores.colonies.get(ant.colony);
  const nest = homeNest(sim, ant);
  if (!col?.granary || !nest) return undefined;
  let best: Chamber | undefined, bestD = Infinity;
  for (const gr of col.granary.granaries) {
    const ch = chamberIn(nest, gr.chamberId);
    if (!ch || !jobIn(sim, ant, gr)) continue;
    const d = gr.chamberId === ant.chamberId ? -1 : v3DistanceSq(ch.center, ant.pos);
    if (d < bestD) { bestD = d; best = ch; }
  }
  return best;
}

function careStep(sim: Sim, ant: Ant): void {
  const nest = homeNest(sim, ant);
  const col = sim.stores.colonies.get(ant.colony);
  switch (ant.state) {
    case 'store.care-go': {
      const ch = nest ? chamberIn(nest, bbv(ant, B.jobDest)) : undefined;
      if (!ch) { setState(sim, ant, CARE); return; }
      if (ant.chamberId === ch.id) { setState(sim, ant, 'store.care-work'); return; }
      const st = travel(sim, ant, entity('chamber', ch.id, ch.center), ROOM_ARRIVE_FRAC * Math.min(ch.radii.x, ch.radii.z));
      if (st === 'arrived') setState(sim, ant, 'store.care-work');
      else if (st === 'failed') endCycle(sim, ant, STORE_ENTRY, 'job:granary-care');
      return;
    }
    case 'store.care-work': {
      if (actEnded(ant)) setState(sim, ant, 'store.care-work'); // next job, fresh state clock
      if (busy(ant)) return;
      const gr = col?.granary?.granaries.find((x) => x.chamberId === ant.chamberId);
      const job = gr ? jobIn(sim, ant, gr) : null;
      if (!job) { endCycle(sim, ant, STORE_ENTRY); return; }
      if (job === 'mill') ant.bb[MILL_WANT] = Math.min(MILL_BATCH_LOADS, sprouted(gr!));
      else ant.bb[GNAW_WANT] = Math.max(GNAW_BATCH_LOADS, Math.min(GNAW_AI_BATCH_LOADS, germinatingLoads(gr!) + sprouted(gr!)));
      const failed = tryAct(sim, ant, job === 'gnaw' ? 'gnaw-radicle' : 'mill-seed', null);
      if (failed) endCycle(sim, ant, STORE_ENTRY);
      return;
    }
    default: {
      const ch = careRoom(sim, ant);
      if (!ch) { setState(sim, ant, STORE_ENTRY); return; }
      setState(sim, ant, 'store.care-go');
      ant.bb[B.jobDest] = ch.id;
    }
  }
}

/** Some granary of the ant's nest has care work she can do. */
export function careWorkFor(sim: Sim, ant: Ant): boolean {
  return careRoom(sim, ant) !== undefined;
}

export const granaryStoreBehaviour: Behaviour = {
  task: 'store', species: ['messor-barbarus'],
  enter: (sim, ant) => storeBehaviour.enter(sim, ant),
  update(sim, ant) {
    if (isCareState(ant.state)) { think(sim, ant, CARE, careStep); return; }
    if (!busy(ant) && ant.carry.kind === 'none' && ant.state === STORE_ENTRY && careWorkFor(sim, ant)) {
      setState(sim, ant, CARE);
      think(sim, ant, CARE, careStep);
      return;
    }
    storeBehaviour.update(sim, ant);
  },
  exit: (sim, ant) => storeBehaviour.exit(sim, ant),
  // a care worker at work in a sprouting granary finishes the radicles there before she takes another task
  delivering: (sim, ant) => storeBehaviour.delivering!(sim, ant) || (ant.state === 'store.care-work' && gnawingLeftHere(sim, ant)),
};

/** Germinating seed is left in the granary the ant stands in. */
function gnawingLeftHere(sim: Sim, ant: Ant): boolean {
  const gr = sim.stores.colonies.get(ant.colony)?.granary?.granaries.find((x) => x.chamberId === ant.chamberId);
  return !!gr && germinatingLoads(gr) > 0;
}
