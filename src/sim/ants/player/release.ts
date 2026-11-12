// What a released ant does next (GDD 01 §3.5): the release-inference table, evaluated top to bottom, first match
// wins, from what the ant carries and where it is.

import type { Ant, Item, Sim, Task } from '@/sim/types';
import { AntFlag, REASON_CODES, TASKS } from '@/sim/types';
import {
  CROP_RETURN_FRACTION, CROP_RETURN_MIN, RESUME_COMBAT_WINDOW_S, RESUME_DIG_FRONTIER_BU, RESUME_LOCALITY_BONUS,
  RESUME_LOCALITY_BU, RESUME_RETREAT_HEALTH_IN, RESUME_RETREAT_HEALTH_OUT, RESUME_SOURCE_BU,
} from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { carriedItem } from '../actions/carry';
import { ports } from '../actions/ports';
import { isFoodItem } from '../actions/sourceKinds';
import { antCasteDef } from '../actions/workRate';

/** Result of the table: the task, the rule number that matched (1..16), and whether to put the load down first. */
export interface ReleaseInference {
  task: Task;
  rule: number;
  putDownFirst: boolean;
  /** Rule 2: still falling; the table runs again on landing. */
  reinfer: boolean;
}

const HAUL_KINDS: readonly Item['kind'][] = ['soil-pellet', 'corpse', 'waste', 'chaff', 'frass', 'garden-waste'];
const FORAGE_KINDS: readonly Item['kind'][] = ['seed', 'leaf-fragment'];
const GARDEN_KINDS: readonly Item['kind'][] = ['leaf-pulp', 'fungus-piece', 'staphylae'];
/** Tasks the allocation fallback (rule 16) may hand out; combat states come from rule 1 only. */
const ALLOCATABLE: readonly Task[] = TASKS.filter((t) => t !== 'fight' && t !== 'flee' && t !== 'raid' && t !== 'idle');

function inCombat(sim: Sim, ant: Ant): boolean {
  const c = ant.combat;
  if (!c) return false;
  if (c.lock !== null || c.heldBy.length > 0) return true;
  const since = sim.state.tick - RESUME_COMBAT_WINDOW_S * TICKS_PER_SECOND;
  return c.recentHitters.some((h) => h.tick >= since);
}

function fightOrFlee(ant: Ant): Task {
  const h = ant.maxHp > 0 ? ant.hp / ant.maxHp : 0;
  return h < (ant.nestId >= 0 ? RESUME_RETREAT_HEALTH_IN : RESUME_RETREAT_HEALTH_OUT) ? 'flee' : 'fight';
}

function dist(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/** Distance from the ant to the nearest frontier sphere of an active dig plan of its colony, mm (Infinity none). */
export function digFrontierDistance(sim: Sim, ant: Ant): number {
  let best = Infinity;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== ant.colony) continue;
    for (const plan of nest.digPlans) {
      if (plan.status !== 'active') continue;
      for (const i of plan.window) {
        const s = plan.spheres[i];
        if (s && !s.done) best = Math.min(best, Math.max(0, dist(ant.pos, s.c) - s.r));
      }
    }
  }
  return best;
}

/** Nearest source with food left within r mm usable by the colony, or -1. */
function sourceNear(sim: Sim, ant: Ant, r: number): number {
  const id = ports.nearestSource(sim, ant.colony, ant.pos, r);
  const s = id >= 0 ? sim.stores.sources.get(id) : undefined;
  return s && s.units > 0 ? id : -1;
}

function isAphidSource(sim: Sim, id: number): boolean {
  const s = sim.stores.sources.get(id);
  return s !== undefined && s.herdId >= 0;
}

function broodNear(sim: Sim, ant: Ant, r: number): boolean {
  const ids: number[] = [];
  sim.index.queryBrood(ant.pos, r, ids);
  return ids.some((id) => sim.stores.brood.get(id)?.colony === ant.colony);
}

/** Rule 16: allocation's choice by demand, with a locality bonus for work sites within RESUME_LOCALITY_BU. */
function allocationChoice(sim: Sim, ant: Ant): Task | null {
  const r = RESUME_LOCALITY_BU * sim.world.bu;
  const weights = antCasteDef(sim, ant)?.taskWeights ?? {};
  let best: Task | null = null;
  let bestScore = 0;
  for (const task of ALLOCATABLE) {
    if (weights[task] === 0) continue;
    let score = ports.colonyDemand(sim, ant.colony, task);
    if (score <= 0) continue;
    const local = (task === 'dig' && digFrontierDistance(sim, ant) <= r)
      || (task === 'forage' && sourceNear(sim, ant, r) >= 0)
      || (task === 'nurse' && broodNear(sim, ant, r));
    if (local) score += RESUME_LOCALITY_BONUS;
    if (score > bestScore) { best = task; bestScore = score; }
  }
  return best;
}

function result(task: Task, rule: number, putDownFirst = false, reinfer = false): ReleaseInference {
  return { task, rule, putDownFirst, reinfer };
}

/** Rules 5-12: what the ant carries decides. Null when it carries nothing that matters. */
function byLoad(sim: Sim, ant: Ant): ReleaseInference | null {
  if (ant.carry.kind === 'brood') return result('nurse', 5);
  const it = carriedItem(sim, ant);
  if (it && isFoodItem(it) && !FORAGE_KINDS.includes(it.kind)) return result('forage', 6);
  if (!it) return null;
  if (it.kind === 'soil-pellet') return result('haul', 8);
  if (HAUL_KINDS.includes(it.kind)) return result('haul', 9);
  if (it.kind === 'live-aphid') return result('tend', 10);
  if (FORAGE_KINDS.includes(it.kind)) return result('forage', 11);
  if (GARDEN_KINDS.includes(it.kind)) return result('garden', 11);
  return null;
}

/** Rule 7: a laden forager outside returns; inside the nest the crop goes to the store. */
function byCrop(sim: Sim, ant: Ant): ReleaseInference | null {
  const crop = ant.cropC + ant.cropP;
  const full = crop >= CROP_RETURN_FRACTION * ant.cropCap;
  const partNoSource = crop >= CROP_RETURN_MIN && sourceNear(sim, ant, RESUME_SOURCE_BU * sim.world.bu) < 0;
  if (!full && !partNoSource) return null;
  return result(ant.nestId >= 0 ? 'store' : 'forage', 7);
}

/** The release-inference table of GDD 01 §3.5 (pure: changes nothing). */
export function inferRelease(sim: Sim, ant: Ant): ReleaseInference {
  const bu = sim.world.bu;
  if (inCombat(sim, ant)) return result(fightOrFlee(ant), 1);
  if (ant.medium === 'air') return result(ant.suspendedTask ?? ant.task, 2, false, ant.alate?.flightPhase == null);
  if (ant.caste === 'queen') {
    const founding = ant.queen?.mode === 'founding' || (ant.flags & AntFlag.FOUNDING) !== 0;
    return result(founding ? (ant.suspendedTask ?? 'rest') : 'rest', 3);
  }
  if (ant.caste === 'gyne' || ant.caste === 'male') return result('rest', 4);
  const load = byLoad(sim, ant);
  if (load && load.rule <= 6) return load;
  const crop = byCrop(sim, ant);
  if (crop) return crop;
  if (load) return load;
  // rule 12: anything else is put down where the ant stands; the table continues
  const putDown = ant.carry.kind === 'item';
  if (digFrontierDistance(sim, ant) <= RESUME_DIG_FRONTIER_BU * bu) return result('dig', 13, putDown);
  const src = sourceNear(sim, ant, RESUME_SOURCE_BU * bu);
  if (src >= 0) return result(isAphidSource(sim, src) ? 'tend' : 'forage', 14, putDown);
  const suspended = ant.suspendedTask;
  if (suspended && suspended !== 'idle' && ports.colonyDemand(sim, ant.colony, suspended) > 0) {
    return result(suspended, 15, putDown);
  }
  return result(allocationChoice(sim, ant) ?? suspended ?? 'idle', 16, putDown);
}

/**
 * Sets the inferred task on a released ant (task-changed, decision log). Rule 2 leaves the flag `ctl.reinfer` so
 * the table runs again once the ant has landed.
 */
export function applyInference(sim: Sim, ant: Ant, inf: ReleaseInference): void {
  ant.bb['ctl.reinfer'] = inf.reinfer ? 1 : 0;
  ant.bb['ctl.releaseRule'] = inf.rule;
  if (ant.task !== inf.task) {
    sim.emit({ type: 'task-changed', antId: ant.id, from: ant.task, to: inf.task, reason: 'released' });
    ant.task = inf.task;
  }
  ant.taskTick = sim.state.tick;
  ant.thinkTick = sim.state.tick;
  logDecision(sim, ant, inf.rule);
}

/** Writes the release into the ant's decision ring (inspect card "last 5 decisions"). */
function logDecision(sim: Sim, ant: Ant, rule: number): void {
  const log = ant.mem.decisions;
  if (log.length === 0) return;
  let slot = 0;
  for (let i = 1; i < log.length; i++) if (log[i].tick < log[slot].tick) slot = i;
  log[slot] = { tick: sim.state.tick, code: RELEASED_CODE, detail: rule };
}

const RELEASED_CODE = REASON_CODES.indexOf('released');

/** Behaviour-runner hook for rule 2: once landed, re-run the table. True when the ant may think now. */
export function reinferAfterLanding(sim: Sim, ant: Ant): boolean {
  if (ant.medium === 'air') return false;
  const inf = inferRelease(sim, ant);
  applyInference(sim, ant, { ...inf, reinfer: false });
  return true;
}
