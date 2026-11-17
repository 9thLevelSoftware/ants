// The granary's labour demand (GDD 07 §6.3.4, §6.3.6, §5.3.7), added to the colony's demand right after each
// allocation pass (same phase and cadence, later in module order) and the targets recomputed from it:
//   mill   while the paste stock is under pasteTargetGd days of demand and there is seed someone can crack;
//   store  granary care: ceil(germinating loads x gnawRadicleS / careWindowS) x granaryHygiene (directive);
//   patrol the morning patrollers while the gate is closed.

import type { Colony, Sim, System, Task } from '@/sim/types';
import { ti } from '@/sim/colony/taskIdx';
import { censusOf } from '@/sim/colony/census';
import { computeTargets } from '@/sim/colony/allocation/targets';
import { coreOf } from '@/sim/colony/core';
import { ALLOC_EVERY, ALLOC_OFFSET } from '@/sim/balance/cadence';
import { CARE_MAX_FRAC, MILL_LOADS_PER_MILLER_GD, MILL_MAX_FRAC, MILL_MIN } from '@/sim/balance/species-harvester';
import { granaryColonies } from './economy';
import type { GranaryParams } from './params';
import { pasteDemandPerGd } from './paste';
import { germinatingLoads } from './cohorts';
import { colonyStock } from './state';
import { patrolPending, patrollersWanted } from './rhythm';

/** Millers the colony asks for now. */
export function millDemand(col: Colony, g: GranaryParams, workers: number): number {
  const mod = col.granary!;
  if (colonyStock(mod) <= 0) return 0;
  const demand = pasteDemandPerGd(g, col);
  const target = g.pasteTargetGd * demand;
  if (mod.pasteLoads >= target) return 0;
  // paste per day to cover the demand and refill the stock within a day, as seed loads milled per day
  const seedPerGd = (demand + (target - mod.pasteLoads)) / g.pasteYield;
  return Math.min(MILL_MAX_FRAC * workers, Math.max(MILL_MIN, seedPerGd / MILL_LOADS_PER_MILLER_GD));
}

/** Granary-care workers the colony asks for now (GDD 07 §6.3.4 formula, x the granaryHygiene directive). */
export function careDemand(col: Colony, g: GranaryParams, workers: number): number {
  const mod = col.granary!;
  let germ = 0, sprouted = 0;
  for (const gr of mod.granaries) {
    germ += germinatingLoads(gr);
    for (const c of gr.cohorts) if (c.state === 'sprouted') sprouted += c.loads;
  }
  const loads = germ + sprouted;
  if (loads <= 0) return 0;
  const hygiene = col.directives.granaryHygiene ?? 1;
  const need = Math.ceil((loads * g.gnawRadicleS) / g.careWindowS) * Math.max(0, hygiene);
  return Math.min(CARE_MAX_FRAC * workers, need);
}

function add(d: Float32Array, t: Task, n: number): void {
  d[ti(t)] += n;
}

export function augmentDemand(sim: Sim, col: Colony, g: GranaryParams): void {
  const cen = censusOf(sim, col.id);
  const n = cen.workers;
  if (n === 0) return;
  const d = col.alloc.demand;
  add(d, 'mill', millDemand(col, g, n));
  add(d, 'store', careDemand(col, g, n));
  if (patrolPending(sim, col)) d[ti('patrol')] = Math.max(d[ti('patrol')], patrollersWanted(sim, col));
  const workforce = { all: cen.available, adult: cen.availableAdult, outside: cen.availableOutside };
  computeTargets(col, cen.available, (coreOf(col).acc['threat'] ?? 0) > 0, workforce);
}

export const granaryAllocationSystem: System = {
  name: 'granary-allocation', phase: 'colony-allocation', every: ALLOC_EVERY, offset: ALLOC_OFFSET,
  run(sim) {
    for (const { col, g } of granaryColonies(sim)) if (col.alloc.lastTick === sim.state.tick) augmentDemand(sim, col, g);
  },
};
