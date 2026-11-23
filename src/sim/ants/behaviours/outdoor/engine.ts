// The outdoor behaviour engine (GDD 02 §10.0-10.3, §10.12): one state machine for scout, forage and tend, named
// per task by its flavour. Every think runs the interrupts in the GDD order (flee -> environmental recall /
// curfew -> hungry return) and then the phase's own logic. Behaviours move ants only through locomotion
// requests and change the world only through action primitives.

import type { Ant, Behaviour, Sim } from '@/sim/types';
import { CROP_RETURN_FRACTION, CROP_RETURN_MIN } from '@/sim/balance/actions';
import {
  HUNGER_RETURN_CROP, HUNGER_RETURN_POOL_MIN_C, HUNGER_RETURN_RESERVE_FRAC, SUCCESS_CROP, THINK_TRAVEL_TICKS,
  TRIP_LOST_S, TRIP_TURN_S, UNLOAD_CROP_MARGIN,
} from '@/sim/balance/foraging';
import { processAntDeath } from '@/sim/ants/lifecycle';
import { TICKS_PER_SECOND } from '@/sim/time';
import { avoidMarkerNear, perceiveNow } from '@/sim/ants/perception';
import { reserveCap } from '@/sim/colony';
import { tooColdToDepart, tooColdToStayOut } from '@/sim/colony/coldGate';
import { departFilter } from './choice';
import { curfewNow, num, phaseOf, thinkIn } from './common';
import { fleeCheck } from './flee';
import type { Flavour } from './flavours';
import { K, PHASE } from './keys';
import { updateCollect } from './phaseCollect';
import { rationStep, updateDeliver, updateRest, updateWait } from './phaseNest';
import { startDepart, updateDepart, updateExplore, updateInvestigate } from './phaseScout';
import { updateOutbound, updateQueue, updateReturn, updateSearch } from './phaseTravel';
import { dropAction, homePlanner, startDeliver, startOutbound, startRest, startReturn, startWait } from './transitions';
import { stopLaying } from './trail';
import { huntCheck, updateHunt } from './hunt';

/** Phases in which an outside ant is still heading away from home (recall and hunger turn it round). */
function awayFromHome(p: number): boolean {
  return p === PHASE.outbound || p === PHASE.search || p === PHASE.queue || p === PHASE.collect || p === PHASE.depart
    || p === PHASE.explore || p === PHASE.investigate || p === PHASE.assess || p === PHASE.hunt;
}

function laden(ant: Ant): boolean {
  return ant.carry.kind === 'item' || ant.cropC + ant.cropP >= CROP_RETURN_FRACTION * ant.cropCap;
}

/**
 * The trip clock (time outside on this trip): starts when the ant is first seen outside, stops at home. Past
 * TRIP_TURN_S an ant still heading away turns home; past TRIP_LOST_S it is lost. True when the think is over.
 */
function tripClock(sim: Sim, ant: Ant, fl: Flavour): boolean {
  if (ant.nestId >= 0) { ant.bb[K.out0] = -1; return false; }
  const t0 = num(ant, K.out0, -1);
  if (t0 < 0) {
    ant.bb[K.out0] = sim.state.tick;
    ant.bb[K.wentOut] = 1;
    return false;
  }
  const s = (sim.state.tick - t0) / TICKS_PER_SECOND;
  if (s > TRIP_LOST_S) { processAntDeath(sim, ant.id, 'lost'); return true; }
  if (s > TRIP_TURN_S && awayFromHome(phaseOf(ant)) && !chaseOnTheWayHome(ant)) {
    startReturn(sim, ant, fl, ant.cropC + ant.cropP >= SUCCESS_CROP, 'timeout');
    return true;
  }
  return false;
}

/**
 * A chase begun on the way home (hunt.ts, after a failed trip) is already homeward bound: the trip clock does not
 * turn it home again. An ant sent home for `timeout` always has a clock past TRIP_TURN_S, so without this the next
 * think dropped the bite and huntCheck restarted the chase, again and again (round-3 sweep review,
 * huntReturn.verify: 3 flips in 30 s, 0 hits). HUNT_CHASE_S still ends the chase and TRIP_LOST_S still applies.
 */
function chaseOnTheWayHome(ant: Ant): boolean {
  return phaseOf(ant) === PHASE.hunt && (ant.bb[K.huntFrom] ?? -1) === PHASE.return;
}

/** Environmental recall (curfew: storm, stayIn, too hot / cold / dark, alarm at the entrance) and hunger. */
function recallCheck(sim: Sim, ant: Ant, fl: Flavour): boolean {
  if (ant.nestId >= 0 || !awayFromHome(phaseOf(ant))) return false;
  const col = sim.stores.colonies.get(ant.colony);
  const crop = ant.cropC + ant.cropP;
  if (num(ant, K.recall, 0) === 1) { startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'surplus'); return true; }
  if (col && curfewNow(sim, col)) { startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'curfew'); return true; }
  // R42: a worker the cold has slowed under OUTDOOR_TURN_BACK_SPEED ends her trip and homes with what she has
  if (tooColdToStayOut(sim, ant)) { startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'too-cold'); return true; }
  if (ant.cropC < HUNGER_RETURN_CROP && ant.energy < HUNGER_RETURN_RESERVE_FRAC * reserveCap(ant) && phaseOf(ant) !== PHASE.collect
    && (col?.stores.c ?? 0) >= HUNGER_RETURN_POOL_MIN_C) {
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
    if (ant.carry.kind === 'item' || crop >= CROP_RETURN_MIN + UNLOAD_CROP_MARGIN) { startDeliver(sim, ant, fl); return; }
    if (fl.scout) startDepart(sim, ant, fl);
    else startWait(sim, ant, fl);
    return;
  }
  if (laden(ant)) { startReturn(sim, ant, fl, true, 'job:home'); return; }
  const src = ant.mem.knownSourceId;
  const s = src >= 0 ? sim.stores.sources.get(src) : undefined;
  const accept = departFilter(sim, ant, fl);
  if (!fl.scout && s && (!accept || accept(s))) { startOutbound(sim, ant, fl, s.id, s.pos, -1, 'job:resume', s.id); return; }
  if (fl.scout) { startDepart(sim, ant, fl); return; }
  startReturn(sim, ant, fl, crop >= SUCCESS_CROP, 'job:home');
}

/**
 * R42: a worker still inside on her way out (a scout departing, a forager or tender outbound) stays in while the
 * entrance air is too cold to walk in: the scout rests, the others wait. True when the think is over.
 */
function coldHold(sim: Sim, ant: Ant, fl: Flavour): boolean {
  if (ant.nestId < 0) return false;
  const p = phaseOf(ant);
  if (p !== PHASE.depart && p !== PHASE.outbound) return false;
  const col = sim.stores.colonies.get(ant.colony);
  if (!col || !tooColdToDepart(sim, col)) return false;
  if (fl.scout) startRest(sim, ant, fl, 'too-cold');
  else startWait(sim, ant, fl, 'too-cold');
  return true;
}

function dispatch(sim: Sim, ant: Ant, fl: Flavour): void {
  if (coldHold(sim, ant, fl)) return;
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
    case PHASE.hunt: updateHunt(sim, ant, fl); return;
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
      // the task was changed while this trip is not over (deliver first, the runner keeps this behaviour): home now
      if (ant.task !== fl.task && ant.nestId < 0) ant.bb[K.recall] = 1;
      if (tripClock(sim, ant, fl)) return;
      // (every worker outside notices the aphid herds it passes: behaviourRunner.ts noticeHerdsOutside, R38 item 2)
      if (fleeCheck(sim, ant, fl)) return;
      if (recallCheck(sim, ant, fl)) return;
      if (avoidCheck(sim, ant, fl)) return;
      // patch prey ahead of a forager or scout with free mandibles: hunt it (R18, hunt.ts)
      if (huntCheck(sim, ant, fl)) return;
      dispatch(sim, ant, fl);
    },
    exit(sim, ant) {
      dropAction(sim, ant);
      stopLaying(sim, ant);
      // the trip is over for this behaviour: its phase must not keep claiming the source (claims.ts) under the next
      // task; enter() and situate() start every trip afresh
      ant.bb[K.phase] = -1;
    },
    // Deliver first (GDD 02 §6.5, §10.0): an ant whose task changes while it is outside, or laden in the nest, keeps
    // this behaviour (the runner holds the switch) until it is home and has unloaded.
    // (A forager resting with a full crop because the stores are full is not delivering: it may be reassigned.)
    delivering: (_sim, ant) => ant.nestId < 0 || phaseOf(ant) === PHASE.return || phaseOf(ant) === PHASE.deliver,
  };
}
