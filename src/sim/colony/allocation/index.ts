// Task allocation (GDD 02 §6): the periodic allocation pass, idle re-evaluation, and the hooks behaviours and
// other modules call (requestTask, taskCycleDone).

import { ti } from '../taskIdx';
import type { Ant, Colony, ReasonCode, Sim, SpeciesDef, Task } from '@/sim/types';
import { ALLOCATION_GROUPS, AntFlag } from '@/sim/types';
import { BROOD_HAZARD, IDLE_REEVAL_S, SURPLUS_CHECK_S } from '@/sim/balance';
import { secondsToTicks, TICKS_PER_SECOND } from '@/sim/time';
import { censusOf, cycleWaste, isWorkerCaste } from '../census';
import { coreOf } from '../core';
import { PROSPECTIVE_FORAGE_KEY, SCOUT_FLOOR_KEY, computeDemand } from './demand';
import { computeTargets } from './targets';
import { eligible, groupOf, GROUP_TASKS, thresholdBand } from './groups';
import { gainExperience, reassignable, reevaluate, surplusCheck, switchTask } from './assign';

export { GROUP_TASKS, groupOf } from './groups';
export { knownCapacity, digDemand } from './demand';
export { takeProbability, threshold, stimulus, inSurplus } from './assign';

/** Rebuilds alloc.actual and groupCounts from the census (exact after deaths and spawns). */
function refreshActual(sim: Sim, col: Colony): void {
  const cen = censusOf(sim, col.id);
  col.alloc.actual.set(cen.byTask);
  for (const g of ALLOCATION_GROUPS) {
    let n = 0;
    for (const t of GROUP_TASKS[g]) n += cen.byTask[ti(t)];
    col.groupCounts[g] = n;
  }
}

/** True when a chamber holding the colony's brood has waste at the hygiene tolerance (last colony cycle's count). */
function broodAmongWaste(sim: Sim, col: Colony): boolean {
  const seen = new Set<number>();
  for (const b of sim.stores.brood.list) {
    if (!b.alive || b.colony !== col.id || b.chamberId < 0 || seen.has(b.chamberId)) continue;
    seen.add(b.chamberId);
    if (cycleWaste(col, b.chamberId) >= BROOD_HAZARD.wasteTolerance) return true;
  }
  return false;
}

/** The ALLOC_PERIOD pass for one colony: demand, targets, actual counts, and every 120 s the surplus check. */
export function allocateColony(sim: Sim, col: Colony, def: SpeciesDef, surplusPass: boolean): void {
  const cen = censusOf(sim, col.id);
  refreshActual(sim, col);
  const hygiene = broodAmongWaste(sim, col);
  computeDemand(sim, col, cen, hygiene);
  const workforce = { all: cen.available, adult: cen.availableAdult, outside: cen.availableOutside };
  const acc = coreOf(col).acc;
  computeTargets(
    col, cen.available, (acc['threat'] ?? 0) > 0, workforce, hygiene, acc[PROSPECTIVE_FORAGE_KEY] ?? 0,
    acc[SCOUT_FLOOR_KEY] ?? 0,
  );
  col.alloc.lastTick = sim.state.tick;
  if (!surplusPass) return;
  for (const a of sim.stores.ants.list) if (a.colony === col.id && isWorkerCaste(a.caste)) surplusCheck(sim, col, a, def);
}

/** True on allocation runs that also do the surplus check. */
export function isSurplusRun(tick: number, allocEvery: number): boolean {
  const period = secondsToTicks(SURPLUS_CHECK_S);
  return Math.floor(tick / allocEvery) % Math.max(1, Math.round(period / allocEvery)) === 0;
}

/** Idle ants re-evaluate every IDLE_REEVAL_S, staggered by id; run every `every` ticks. */
export function reevaluateIdle(sim: Sim, col: Colony, def: SpeciesDef, every: number): void {
  if (col.alloc.lastTick < 0) return; // no targets yet
  const slots = Math.max(1, Math.round((IDLE_REEVAL_S * TICKS_PER_SECOND) / every));
  const slot = Math.floor(sim.state.tick / every) % slots;
  for (const a of sim.stores.ants.list) {
    if (a.colony !== col.id || a.task !== 'idle' || a.id % slots !== slot) continue;
    if (a.state === 'rest') continue;
    reevaluate(sim, col, a, def, true);
  }
}

/**
 * Hook for behaviours at the end of a task cycle (delivery, feed round, pellet drop, patrol loop, guard shift):
 * experience gain, then a re-evaluation (GDD 02 §6.4-6.5).
 */
export function taskCycleDone(sim: Sim, a: Ant): Task {
  const col = sim.stores.colonies.get(a.colony);
  const def = col ? sim.getSpecies(col.species) : undefined;
  if (!col || !def) return a.task;
  gainExperience(a, a.task);
  return reevaluate(sim, col, a, def);
}

/**
 * Asks the allocator to put an ant on a task (markers, nursery jobs, release from possession). Refused for
 * non-workers, possessed ants (unless the reason is `released`), and tasks the ant is not eligible for.
 */
export function requestTask(sim: Sim, a: Ant, task: Task, reason: ReasonCode): boolean {
  if (!mayTakeTask(sim, a, task, reason)) return false;
  switchTask(sim, sim.stores.colonies.get(a.colony)!, a, task, reason);
  return true;
}

/** Whether requestTask(sim, a, task, reason) would switch her (no side effects). */
export function mayTakeTask(sim: Sim, a: Ant, task: Task, reason: ReasonCode = 'job:tend-overdue'): boolean {
  const col = sim.stores.colonies.get(a.colony);
  const def = col ? sim.getSpecies(col.species) : undefined;
  if (!col || !def || !a.alive || !isWorkerCaste(a.caste)) return false;
  if ((a.flags & AntFlag.POSSESSED) && reason !== 'released') return false;
  return task === 'idle' || task === 'rest' || eligible(a, task, thresholdBand(a, sim.state.tick), def);
}

export { reassignable, switchTask };
