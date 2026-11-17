// The granary's labour demand (GDD 07 §6.3.4, §6.3.6, §5.3.7), added to the colony's demand right after each
// allocation pass (same phase and cadence, later in module order) and the targets recomputed from it:
//   mill   while the paste stock is under pasteTargetGd days of demand and there is seed someone can crack;
//   store  granary care: gnawing work before the seeds sprout, over the work rate, x granaryHygiene;
//   forage SEED_FORAGE_FRAC of the workers while the granaries hold less than targetStockGd days of seed (and
//          scouts while no seed source is known);
//   patrol the morning patrollers while the gate is closed;
//   tend   none: a harvester does not tend aphids (the colony's demand would send tenders to known herds).

import type { Colony, Sim, System, Task } from '@/sim/types';
import { ti } from '@/sim/colony/taskIdx';
import { censusOf, isWorkerCaste } from '@/sim/colony/census';
import { computeTargets } from '@/sim/colony/allocation/targets';
import { coreOf } from '@/sim/colony/core';
import { ALLOC_EVERY, ALLOC_OFFSET } from '@/sim/balance/cadence';
import {
  CARE_ANTICIPATE_G, CARE_MAX_FRAC, CARE_RATE_FLOOR, CARE_WINDOW_MIN_S, MILL_LOADS_PER_MILLER_GD, MILL_MAX_FRAC, MILL_MIN,
  SEED_FORAGE_FRAC, SEED_SCOUTS_MIN,
} from '@/sim/balance/species-harvester';
import { workRate } from '@/sim/ants/actions/workRate';
import { GRANARY_HYGIENE_DEFAULT } from '@/sim/balance/colony';
import { granaryColonies } from './economy';
import type { GranaryParams } from './params';
import { pasteDemandPerGd } from './paste';
import { germRatePerGd } from './cohorts';
import { SECONDS_PER_DAY } from '@/sim/time';
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

/**
 * Gnawing work the granaries need per game second now, in work-seconds per second: for every cohort that is
 * germinating, sprouted, or damp with its clock past CARE_ANTICIPATE_G of germinatingG, its loads x gnawRadicleS
 * over the time it leaves (germinating -> sprouted at its present clock speed), but at most careWindowS (GDD 07
 * §6.3.4: "ceil(loadsGerminating x 5 s / 150 s)"). A cohort turns germinating all at once, so the workers are asked
 * for before it does.
 */
export function careWorkRate(g: GranaryParams, col: Colony): number {
  let need = 0;
  for (const gr of col.granary!.granaries) {
    for (const c of gr.cohorts) {
      const atRisk = c.state === 'germinating' || c.state === 'sprouted'
        || (!c.degermed && c.u > g.uDamp && c.g >= CARE_ANTICIPATE_G * g.germinatingG);
      if (!atRisk || c.loads <= 0) continue;
      const speed = germRatePerGd(g, c, gr.tempC ?? 20);
      const leftS = speed > 0 ? ((g.sproutedG - Math.max(c.g, g.germinatingG)) / speed) * SECONDS_PER_DAY : Infinity;
      const windowS = Math.max(CARE_WINDOW_MIN_S, Math.min(g.careWindowS, leftS));
      need += (c.loads * g.gnawRadicleS) / windowS;
    }
  }
  return need;
}

/**
 * Granary-care workers the colony asks for now: the gnawing work rate above over the workers' mean work rate (a
 * cold nest works slowly), x the granaryHygiene directive.
 */
export function careDemand(sim: Sim, col: Colony, g: GranaryParams, workers: number): number {
  const work = careWorkRate(g, col);
  if (work <= 0) return 0;
  // the directive's default (GRANARY_HYGIENE_DEFAULT) is neutral: 0 asks for nobody, 1 for twice the formula
  const hygiene = Math.max(0, col.directives.granaryHygiene ?? GRANARY_HYGIENE_DEFAULT) / GRANARY_HYGIENE_DEFAULT;
  const rate = Math.max(CARE_RATE_FLOOR, meanWorkRate(sim, col));
  return Math.min(CARE_MAX_FRAC * workers, Math.ceil(work / rate) * hygiene);
}

/** Mean work rate of the colony's workers inside the nest (1 when none). */
function meanWorkRate(sim: Sim, col: Colony): number {
  let sum = 0, n = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || a.nestId < 0 || !isWorkerCaste(a.caste)) continue;
    sum += workRate(sim, a);
    n++;
  }
  return n > 0 ? sum / n : 1;
}

/**
 * Extra foragers for the granary (GDD 07 §6.3.5: the colony keeps targetStockGd days of seed): the colony's own
 * demand follows the pool's need only, so a harvester with a fed pool and an empty granary would not gather.
 * SEED_FORAGE_FRAC of the workers x the share of the target stock missing.
 */
export function seedForageDemand(col: Colony, g: GranaryParams, workers: number): number {
  const perGd = pasteDemandPerGd(g, col) / g.pasteYield;
  if (!(perGd > 0)) return 0;
  const target = g.targetStockGd * perGd;
  const short = Math.max(0, Math.min(1, (target - colonyStock(col.granary!)) / target));
  return SEED_FORAGE_FRAC * workers * short;
}

/** Whether the colony knows a live seed source. */
function knowsSeed(sim: Sim, col: Colony): boolean {
  for (const id of col.knownSourceIds) if (sim.stores.sources.get(id)?.kind === 'seed') return true;
  return false;
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
  add(d, 'store', careDemand(sim, col, g, n));
  if (patrolPending(sim, col)) d[ti('patrol')] = Math.max(d[ti('patrol')], patrollersWanted(sim, col));
  add(d, 'forage', seedForageDemand(col, g, n));
  if (seedForageDemand(col, g, n) > 0 && !knowsSeed(sim, col)) d[ti('scout')] = Math.max(d[ti('scout')], Math.min(SEED_SCOUTS_MIN, n));
  // GDD 07 §5.3.5: a harvester does not tend aphids (honeydew preference 0): no tenders for the herds it knows
  if (!((sim.getSpecies(col.species)?.diet.foods.honeydew?.pref ?? 0) > 0)) d[ti('tend')] = 0;
  const workforce = { all: cen.available, adult: cen.availableAdult, outside: cen.availableOutside };
  computeTargets(col, cen.available, (coreOf(col).acc['threat'] ?? 0) > 0, workforce);
}

export const granaryAllocationSystem: System = {
  name: 'granary-allocation', phase: 'colony-allocation', every: ALLOC_EVERY, offset: ALLOC_OFFSET,
  run(sim) {
    for (const { col, g } of granaryColonies(sim)) if (col.alloc.lastTick === sim.state.tick) augmentDemand(sim, col, g);
  },
};
