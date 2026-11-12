// The outdoor behaviour engine (GDD 02 §10.0-10.3, §10.12): one state machine for scout, forage and tend, named
// per task by its flavour. Every think runs the interrupts in the GDD order (flee -> environmental recall /
// curfew -> hungry return) and then the phase's own logic. Behaviours move ants only through locomotion
// requests and change the world only through action primitives.

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { CROP_RETURN_FRACTION, CROP_RETURN_MIN } from '@/sim/balance/actions';
import { HUNGER_RETURN_CROP, HUNGER_RETURN_RESERVE_FRAC, SUCCESS_CROP, THINK_TRAVEL_TICKS } from '@/sim/balance/foraging';
import { avoidMarkerNear, isOutdoorTask, perceiveNow } from '@/sim/ants/perception';
import { requestTask, reserveCap } from '@/sim/colony';
import { curfewNow, num, phaseOf, thinkIn } from './common';
import { fleeCheck } from './flee';
import type { Flavour } from './flavours';
import { K, PHASE } from './keys';
import { updateCollect } from './phaseCollect';
import { rationStep, updateDeliver, updateRest, updateWait } from './phaseNest';
import { startDepart, updateDepart, updateExplore, updateInvestigate } from './phaseScout';
import { updateOutbound, updateQueue, updateReturn, updateSearch } from './phaseTravel';
import { dropAction, homePlanner, startDeliver, startOutbound, startReturn, startWait } from './transitions';
import { stopLaying } from './trail';

/** Phases in which an outside ant is still heading away from home (recall and hunger turn it round). */
function awayFromHome(p: number): boolean {
  return p === PHASE.outbound || p === PHASE.search || p === PHASE.queue || p === PHASE.collect || p === PHASE.depart
    || p === PHASE.explore || p === PHASE.investigate || p === PHASE.assess;
}

function laden(ant: Ant): boolean {
  return ant.carry.kind === 'item' || ant.cropC + ant.cropP >= CROP_RETURN_FRACTION * ant.cropCap;
}

/** Environmental recall (curfew: storm, stayIn, too hot / cold / dark, alarm at the entrance) and hunger. */
function recallCheck(sim: Sim, ant: Ant, fl: Flavour): boolean {
  if (ant.nestId >= 0 || !awayFromHome(phaseOf(ant))) return false;
  const col = sim.stores.colonies.get(ant.colony);
  const crop = ant.cropC + ant.cropP;
  if (num(ant, K.recall, 0) === 1) { startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'surplus'); return true; }
  if (col && curfewNow(sim, col)) { startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'curfew'); return true; }
  if (ant.cropC < HUNGER_RETURN_CROP && ant.energy < HUNGER_RETURN_RESERVE_FRAC * reserveCap(ant) && phaseOf(ant) !== PHASE.collect) {
    startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'hungry');
    return true;
  }
  return false;
}

/**
 * GDD 02 §12.2: an autonomous ant inside an avoid marker heads out of it. Outward-bound phases turn home by the
 * planner, which prices the disc at x20 and so leaves it by the shortest way.
 */
function avoidCheck(sim: Sim, ant: Ant, fl: Flavour): boolean {
  if (ant.nestId >= 0 || !awayFromHome(phaseOf(ant))) return false;
  const m = sim.stores.markers.get(avoidMarkerNear(ant));
  if (!m || Math.hypot(ant.pos.x - m.pos.x, ant.pos.z - m.pos.z) > m.radius) return false;
  startReturn(sim, ant, fl, ant.cropC + ant.cropP >= SUCCESS_CROP, 'marker:avoid', m.id);
  homePlanner(sim, ant);
  return true;
}

/** Where to pick up when the behaviour is entered: from what the ant carries and where it is (GDD 01 §3.5 spirit). */
function situate(sim: Sim, ant: Ant, fl: Flavour): void {
  const crop = ant.cropC + ant.cropP;
  if (num(ant, K.recall, 0) === 1 && ant.nestId < 0) { startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'surplus'); return; }
  if (ant.nestId >= 0) {
    if (ant.carry.kind === 'item' || crop >= CROP_RETURN_MIN + 0.05) { startDeliver(sim, ant, fl); return; }
    if (fl.scout) startDepart(sim, ant, fl);
    else startWait(sim, ant, fl);
    return;
  }
  if (laden(ant)) { startReturn(sim, ant, fl, true, 'job:home'); return; }
  const src = ant.mem.knownSourceId;
  const s = src >= 0 ? sim.stores.sources.get(src) : undefined;
  if (!fl.scout && s && (!fl.accept || fl.accept(s))) { startOutbound(sim, ant, fl, s.id, s.pos, -1, 'job:resume', s.id); return; }
  if (fl.scout) { startDepart(sim, ant, fl); return; }
  startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'job:home');
}

function dispatch(sim: Sim, ant: Ant, fl: Flavour): void {
  switch (phaseOf(ant)) {
    case PHASE.wait: updateWait(sim, ant, fl); return;
    case PHASE.rest: updateRest(sim, ant, fl); return;
    case PHASE.outbound:
      if (rationStep(sim, ant)) return;
      updateOutbound(sim, ant, fl);
      return;
    case PHASE.search: updateSearch(sim, ant, fl); return;
    case PHASE.queue: updateQueue(sim, ant, fl); return;
    case PHASE.collect: updateCollect(sim, ant, fl); return;
    case PHASE.return: updateReturn(sim, ant, fl); return;
    case PHASE.deliver: updateDeliver(sim, ant, fl); return;
    case PHASE.depart: updateDepart(sim, ant, fl); return;
    case PHASE.explore: updateExplore(sim, ant, fl); return;
    case PHASE.investigate: updateInvestigate(sim, ant, fl); return;
    case PHASE.assess: updateCollect(sim, ant, fl); return;
    default: situate(sim, ant, fl);
  }
}

export function makeBehaviour(fl: Flavour): Behaviour {
  return {
    task: fl.task,
    enter(sim, ant) {
      ant.bb[K.phase] = -1;
      ant.bb[K.resume] = -1;
      perceiveNow(sim, ant);
      situate(sim, ant, fl);
      ant.bb[K.recall] = 0;
      // stagger the first think so ants entering together do not think on the same ticks
      thinkIn(sim, ant, 1 + (ant.id % THINK_TRAVEL_TICKS));
    },
    update(sim, ant) {
      thinkIn(sim, ant, THINK_TRAVEL_TICKS);
      if (fleeCheck(sim, ant, fl)) return;
      if (recallCheck(sim, ant, fl)) return;
      if (avoidCheck(sim, ant, fl)) return;
      dispatch(sim, ant, fl);
    },
    exit(sim, ant) {
      dropAction(sim, ant);
      stopLaying(sim, ant);
      // Deliver first (GDD 02 §6.5, §10.0): an autonomous ant that the allocator moves to an in-nest task while it
      // is outside keeps this task until it is home, then re-evaluates there.
      const possessed = (ant.flags & AntFlag.POSSESSED) !== 0;
      if (ant.alive && !possessed && ant.nestId < 0 && !isOutdoorTask(ant.task) && ant.task !== 'fight') {
        ant.bb[K.recall] = 1;
        requestTask(sim, ant, fl.task, 'job:homing');
      }
    },
  };
}
