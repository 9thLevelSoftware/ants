// Flee (GDD 02 §10.12), a reactive override of the outdoor tasks: the ant keeps its task and resumes it. Triggers
// in Tier 1: alarm pheromone >= ALARM_ALERT where the ant stands, a looming human event (tremor, shadow cues of
// GDD 04 §15), and, once creatures exist (Tier 2), a predator within smell range. Run away at RUN_SPEED for
// FLEE_RUN_S, freeze FLEE_FREEZE_S, re-check; at most FLEE_MAX_CYCLES runs, then home. The threat out of range
// for FLEE_CLEAR_S ends it: laden ants resume their return, others their trip.
//
// Hook for combat / creatures (Tier 2): requestFlee(sim, ant, x, z) makes an outdoor ant flee from a point at its
// next think (e.g. after being bitten while not fighting).

import type { Ant, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import {
  FLEE_CLEAR_S, FLEE_FREEZE_S, FLEE_LEG_BU, FLEE_MAX_CYCLES, FLEE_RUN_S, HUMAN_FLEE_REFRACTORY_S, LEG_ARRIVE_BU, SUCCESS_CROP,
} from '@/sim/balance/foraging';
import { THREAT, threatApproach, threatCode, threatX, threatZ } from '@/sim/ants/perception';
import { TICKS_PER_SECOND } from '@/sim/time';
import { logDecision, num, phaseOf, phaseS, setPhase } from './common';
import type { Flavour } from './flavours';
import { K, NAV, PHASE } from './keys';
import { goTo, stop } from './nav';
import { resumeExplore } from './phaseScout';
import { dropAction, resumeOutboundNav, startReturn } from './transitions';

const REQUEST_X = 'fo.fRx', REQUEST_Z = 'fo.fRz', REQUEST = 'fo.fReq';
/** 1 while the current flee runs from a human-event cue; tick until which tremor warnings are ignored. */
const HUMAN_FLEE = 'fo.fHum', HUMAN_QUIET = 'fo.fHq';

/** Tier 2 hook: flee from (x, z) at the next think (outdoor tasks only). */
export function requestFlee(_sim: Sim, ant: Ant, x: number, z: number): void {
  ant.bb[REQUEST] = 1;
  ant.bb[REQUEST_X] = x;
  ant.bb[REQUEST_Z] = z;
}

function threatAt(sim: Sim, ant: Ant): { x: number; z: number } | null {
  if (num(ant, REQUEST, 0) === 1) return { x: num(ant, REQUEST_X, ant.pos.x), z: num(ant, REQUEST_Z, ant.pos.z) };
  const code = threatCode(ant);
  if (code === THREAT.none) return null;
  if (code === THREAT.human && sim.state.tick < num(ant, HUMAN_QUIET, -1) && !shadowOver(sim, ant)) return null;
  return { x: threatX(ant), z: threatZ(ant) };
}

function inAvoid(sim: Sim, ant: Ant, x: number, z: number): boolean {
  for (const m of sim.stores.markers.list) {
    if (m.alive && m.kind === 'avoid' && m.colony === ant.colony && Math.hypot(x - m.pos.x, z - m.pos.z) <= m.radius) return true;
  }
  return false;
}

/** A looming footprint (shadow cue) covers the ant right now: the step lands here (GDD 04 §15 cues). */
function shadowOver(sim: Sim, ant: Ant): boolean {
  const now = sim.state.tick;
  for (const run of sim.state.env.human.active) {
    for (const c of run.cues) {
      if (c.kind !== 'shadow' || now > c.impactTick || now < c.startTick) continue;
      if (Math.hypot(ant.pos.x - c.origin.x, ant.pos.z - c.origin.z) <= c.radiusMm) return true;
    }
  }
  return false;
}

function inFlee(ant: Ant): boolean {
  const p = phaseOf(ant);
  return p === PHASE.fleeRun || p === PHASE.fleeFreeze;
}

/**
 * Run leg: away from the threat point; from a human pass whose approach is known, perpendicular to it (GDD 02
 * §10.12), to the side of the pass's line the ant is already on.
 */
function run(sim: Sim, ant: Ant, fl: Flavour, from: { x: number; z: number }): void {
  let dx = ant.pos.x - from.x, dz = ant.pos.z - from.z;
  const a = threatCode(ant) === THREAT.human ? threatApproach(ant) : null;
  if (a) {
    // the normal of the approach line on the ant's side (either side when it stands on the line)
    const side = a.x * dz - a.z * dx >= 0 ? 1 : -1;
    dx = -a.z * side;
    dz = a.x * side;
  }
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) { dx = ant.fwd.x; dz = ant.fwd.z; } else { dx /= l; dz /= l; }
  const leg = FLEE_LEG_BU * sim.world.bu;
  let x = ant.pos.x + dx * leg, z = ant.pos.z + dz * leg;
  // never run into the colony's avoid markers (GDD 02 §12.2: no autonomous ant inside one): turn 90° either way, then back
  for (const k of [1, -1, 2]) {
    if (!inAvoid(sim, ant, x, z)) break;
    const c = Math.cos((k * Math.PI) / 2), sn = Math.sin((k * Math.PI) / 2);
    x = ant.pos.x + (dx * c - dz * sn) * leg; z = ant.pos.z + (dx * sn + dz * c) * leg;
  }
  setPhase(sim, ant, fl.names, PHASE.fleeRun);
  goTo(sim, ant, { x, y: sim.field.height(x, z), z }, LEG_ARRIVE_BU, { speed: 'run' });
}

/**
 * Called first in every outdoor think: starts or continues a flee. True when the ant is fleeing (the task logic
 * is skipped this think).
 */
export function fleeCheck(sim: Sim, ant: Ant, fl: Flavour): boolean {
  if ((ant.flags & AntFlag.POSSESSED) !== 0 || ant.nestId >= 0) {
    if (inFlee(ant)) endFlee(sim, ant, fl);
    return false;
  }
  const human = num(ant, REQUEST, 0) !== 1 && threatCode(ant) === THREAT.human;
  const t = threatAt(sim, ant);
  if (t) ant.bb[K.fleeSeen] = sim.state.tick;
  ant.bb[REQUEST] = 0;
  if (!inFlee(ant)) {
    if (!t) return false;
    const p = phaseOf(ant);
    ant.bb[K.resume] = p;
    ant.bb[K.fleeN] = 1;
    ant.bb[HUMAN_FLEE] = human ? 1 : 0;
    dropAction(sim, ant);
    logDecision(sim, ant, threatCode(ant) === THREAT.alarm ? 'alarm' : 'threat', threatCode(ant));
    run(sim, ant, fl, t);
    return true;
  }
  const s = phaseS(sim, ant);
  if (phaseOf(ant) === PHASE.fleeRun) {
    if (s < FLEE_RUN_S) return true;
    // GDD 02 §10.12: a human-event warning is one run across the pass, then the task goes on; tremor warnings of
    // the same pass are ignored for HUMAN_FLEE_REFRACTORY_S (a 2 m tremor radius would otherwise hold every ant
    // in run-freeze cycles and send it home empty, econ-growth)
    if (num(ant, HUMAN_FLEE, 0) === 1) {
      ant.bb[HUMAN_FLEE] = 0;
      ant.bb[HUMAN_QUIET] = sim.state.tick + HUMAN_FLEE_REFRACTORY_S * TICKS_PER_SECOND;
      endFlee(sim, ant, fl);
      return true;
    }
    stop(sim, ant);
    setPhase(sim, ant, fl.names, PHASE.fleeFreeze);
    return true;
  }
  // freeze: re-check
  if (s < FLEE_FREEZE_S) return true;
  if (t) {
    const n = num(ant, K.fleeN, 1);
    if (n >= FLEE_MAX_CYCLES) { endFlee(sim, ant, fl, true); return true; }
    ant.bb[K.fleeN] = n + 1;
    run(sim, ant, fl, t);
    return true;
  }
  const clear = (sim.state.tick - num(ant, K.fleeSeen, sim.state.tick)) / TICKS_PER_SECOND;
  if (clear < FLEE_CLEAR_S) return true;
  endFlee(sim, ant, fl);
  return true;
}

/** Resumes the task (GDD 02 §10.12 exit): laden or given up -> return; otherwise the interrupted phase. */
function endFlee(sim: Sim, ant: Ant, fl: Flavour, giveUp = false): void {
  const resume = num(ant, K.resume, PHASE.return);
  ant.bb[K.resume] = -1;
  const laden = ant.carry.kind === 'item' || ant.cropC + ant.cropP >= SUCCESS_CROP;
  if (giveUp || laden || ant.nestId >= 0 || resume === PHASE.return || resume === PHASE.collect || resume === PHASE.queue) {
    startReturn(sim, ant, fl, laden && (ant.bb[K.success] ?? 0) === 1, giveUp ? 'threat' : 'job:resume');
    return;
  }
  if (fl.scout) { resumeExplore(sim, ant, fl); return; }
  setPhase(sim, ant, fl.names, PHASE.outbound, 'job:resume');
  ant.bb[K.nav] = NAV.plan;
  ant.bb[K.nav0] = sim.state.tick;
  resumeOutboundNav(sim, ant);
}
