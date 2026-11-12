// Colony module API: allocation, queen, brood, economy, stats, founding, overwintering, reproduction.
// STUB written by F1b. Owners: colony-core (allocation, queen, brood, economy, stats, markers/directives),
// founding (colony/founding), overwinter-repro (colony/overwinter, reproduction, succession).

import type { Ant, Colony, FoodAmount, Sim, System, Task } from '@/sim/types';
import { taskIndex } from '@/sim/types';
import { ALLOC_EVERY, ALLOC_OFFSET, COLONY_STATS_OFFSET, HOURLY_EVERY } from '@/sim/balance';

/** Task allocation (thresholds, demand, targets). Stub: colony-core. */
export const allocationSystem: System = { name: 'allocation', every: ALLOC_EVERY, offset: ALLOC_OFFSET, run: () => {} };
/** Queen egg laying, queen nutrition. Stub: colony-core. */
export const queenSystem: System = { name: 'queen', run: () => {} };
/** Founding sequence (opening phases, founding model, time-lapse). Stub: founding. */
export const foundingSystem: System = { name: 'founding', run: () => {} };
/** Brood development, feeding requests, hazards, eclosion. Stub: colony-core. */
export const broodSystem: System = { name: 'brood', run: () => {} };
/** Food pool, upkeep, spoilage, starvation stages, needs. Stub: colony-core. */
export const economySystem: System = { name: 'economy', run: () => {} };
/** Counters and hourly/daily statistics series. Stub: colony-core. */
export const colonyStatsSystem: System = {
  name: 'colony-stats', every: HOURLY_EVERY, offset: COLONY_STATS_OFFSET, run: () => {},
};
/** Overwintering notice/banner/lapse/report. Stub: overwinter-repro. */
export const overwinterSystem: System = { name: 'overwinter', run: () => {} };
/** Alate rearing, nuptial flights, queen death and orphaning. Stub: overwinter-repro. */
export const reproductionSystem: System = { name: 'reproduction', run: () => {} };

/** The player's colony (colonies[0]), if alive. */
export function playerColony(sim: Sim): Colony | undefined {
  const c = sim.state.colonies[0];
  return c && c.alive ? c : undefined;
}

export function colonyOf(sim: Sim, ant: Ant): Colony | undefined {
  return sim.stores.colonies.get(ant.colony);
}

/** Adds food to the colony pool; returns what was accepted (capacity limits). Stub: accepts nothing (colony-core). */
export function addFood(_sim: Sim, _colonyId: number, _c: number, _p: number, _toxin = 0): FoodAmount {
  return { c: 0, p: 0 };
}

/** Takes food from the colony pool; returns what was taken. Stub: nothing (colony-core). */
export function takeFood(_sim: Sim, _colonyId: number, _c: number, _p: number): FoodAmount {
  return { c: 0, p: 0 };
}

/** Current headcount of a task (allocation cache). */
export function taskHeadcount(sim: Sim, colonyId: number, task: Task): number {
  const c = sim.stores.colonies.get(colonyId);
  return c ? c.alloc.actual[taskIndex(task)] : 0;
}
