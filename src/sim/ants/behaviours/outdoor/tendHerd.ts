// `tend` for the honeydew-ranching species (GDD 07 §6.1: Lasius niger; Camponotus is its Tier 3 variant): the herd
// branch (tendHerdStates.ts) on top of the outdoor engine's tend flavour. Registered as a species-specific behaviour
// (it wins over the generic `tend` for these species, src/sim/systems.ts createBehaviourTable), so the engine's
// Tier 1 tending of static honeydew films stays the generic behaviour and the fallback here.
//
// Who runs the ant:
//   herd branch  travel -> solicit / wait / guard / full at the herd  (TH.st >= 0)
//   engine       return, deliver, wait in the nest, rest, flee, and herd-less trips to honeydew films
// Hand-overs: a waiting tender in the nest with a workable herd departs straight for it (GDD 07 "delivered ->
// travel (same herd)"), after the end of its task cycle is booked; an engine phase heading to a herd source (a
// flee resumed) comes back into the branch; the branch leaves through the engine's startReturn.
//
// Contradiction (reported): GDD 02 §10.3 has tenders wait for activation in the nest like foragers; GDD 07 §6.1.4
// (the honeydew module, the more specific owner) sends them back to their herd after delivering. Followed GDD 07.

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { REST_ENTER } from '@/sim/balance';
import { CROP_RETURN_FRACTION } from '@/sim/balance/actions';
import { taskCycleDone } from '@/sim/colony';
import { herdOfSource, herdSourceOf } from '@/sim/ecology';
import { curfewNow, num, phaseOf } from './common';
import { makeBehaviour } from './engine';
import { TEND } from './flavours';
import { K, PHASE } from './keys';
import { chooseHerd } from './tendHerdChoice';
import { TH } from './tendHerdKeys';
import { clearHerdBranch, herdActive, resumeTravel, startTravel, updateHerd } from './tendHerdStates';

const engine = makeBehaviour(TEND);

/** Engine phases on the way to (or at) a source: a herd source there belongs to the herd branch. */
function headingToSource(ant: Ant): boolean {
  const p = phaseOf(ant);
  return p === PHASE.outbound || p === PHASE.search || p === PHASE.queue || p === PHASE.collect;
}

/** The engine was taking the ant to a herd source (after a flee): hand it back to the branch. */
function reclaim(sim: Sim, ant: Ant): boolean {
  if (ant.nestId >= 0 || !headingToSource(ant) || ant.task !== 'tend') return false;
  const src = sim.stores.sources.get(num(ant, K.src, -1));
  if (!src || !herdOfSource(sim, src.id)) return false;
  resumeTravel(sim, ant, src);
  return herdActive(ant);
}

/** A tender waiting in the nest leaves for its herd (after booking the end of the last cycle). */
function departForHerd(sim: Sim, ant: Ant): boolean {
  if (ant.nestId < 0 || phaseOf(ant) !== PHASE.wait || ant.task !== 'tend') return false;
  if (num(ant, TH.cycle, 0) === 1) {
    ant.bb[TH.cycle] = 0;
    if (taskCycleDone(sim, ant) !== 'tend') return true; // the runner switches the task
  }
  const col = sim.stores.colonies.get(ant.colony);
  if (ant.fatigue >= REST_ENTER || (col && curfewNow(sim, col))) return false;
  const h = chooseHerd(sim, ant);
  if (!h || !herdSourceOf(sim, h)) return false;
  return startTravel(sim, ant, h);
}

export const tendHerdBehaviour: Behaviour = {
  task: 'tend',
  species: ['lasius-niger', 'camponotus-pennsylvanicus'],
  enter(sim, ant) {
    clearHerdBranch(ant);
    // back from a reactive override (a fight at the herd) or a release outside: straight back to the herd
    const h = sim.stores.herds.get(num(ant, TH.herd, -1));
    const src = h ? herdSourceOf(sim, h) : undefined;
    if (ant.nestId < 0 && src && h && h.a >= 1 && ant.cropC + ant.cropP < CROP_RETURN_FRACTION * ant.cropCap) {
      ant.bb[K.phase] = PHASE.outbound;
      ant.bb[K.out0] = sim.state.tick;
      ant.bb[K.wentOut] = 1;
      resumeTravel(sim, ant, src);
      if (herdActive(ant)) return;
    }
    engine.enter(sim, ant);
  },
  update(sim, ant) {
    if (herdActive(ant)) { updateHerd(sim, ant); return; }
    if (reclaim(sim, ant) || departForHerd(sim, ant)) return;
    engine.update(sim, ant);
  },
  exit(sim, ant) {
    // the herd is kept (TH.herd): a tender pulled into a fight goes back to it when the task resumes
    clearHerdBranch(ant);
    engine.exit(sim, ant);
  },
  delivering: (sim, ant) => engine.delivering?.(sim, ant) ?? false,
};
