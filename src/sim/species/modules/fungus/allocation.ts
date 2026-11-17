// The fungus garden's labour demand (GDD 07 §6.4.2, §6.4.6), added to the colony's demand right after each
// allocation pass (same phase and cadence, later in module order) and the targets recomputed from it:
//   garden  GARDENERS_PER_GU x Σ G tenders, plus the processing, planting and waste work waiting (at least
//           GARDEN_MIN while a garden lives; at most GARDEN_MAX_FRAC of the workers);
//   cut     the substrate the gardens need (1.8 LU per GU per GD) over what a cutter brings in a game day, more while
//           the gardens are short (at least CUT_MIN while the surface is workable; at most CUT_MAX_FRAC);
//   tend    none: a leafcutter keeps no aphids (honeydew preference 0).
// A colony without a cutting caste (the first minims) cuts through its gardeners (behaviourGarden.ts, deviation).

import type { Colony, Sim, System, Task } from '@/sim/types';
import { ti } from '@/sim/colony/taskIdx';
import { censusOf } from '@/sim/colony/census';
import { computeTargets } from '@/sim/colony/allocation/targets';
import { coreOf } from '@/sim/colony/core';
import { surfaceActivityOf } from '@/sim/colony/envAdapter';
import { ALLOC_EVERY, ALLOC_OFFSET } from '@/sim/balance/cadence';
import {
  CUT_ACTIVITY_MIN, CUT_LU_PER_CUTTER_GD, CUT_MAX_FRAC, CUT_MIN, GARDEN_MAX_FRAC, GARDEN_MIN, PROCESS_BATCH_LU,
} from '@/sim/balance/species-leafcutter';
import type { FungusParams } from './params';
import { atColonies } from './economy';
import { liveGardens, totalGarden } from './state';
import { lotsLu } from './cache';
import { substrateInputs } from './substrate';

/** Gardeners the colony asks for now. */
export function gardenDemand(col: Colony, P: FungusParams, workers: number): number {
  const mod = col.fungus!;
  const live = liveGardens(mod);
  if (live.length === 0) return mod.gardens.some((g) => g.waste > 1e-6) ? 1 : 0;
  let work = 0;
  for (const g of live) {
    work += P.gardenersPerGu * g.biomass;
    // processing and planting waiting: one gardener per PROCESS_BATCH_LU x 4 waiting LU (a rough work share)
    work += (lotsLu(g.cache) + lotsLu(g.pulp)) / (4 * PROCESS_BATCH_LU);
    if (g.infection > 0) work += P.weedersPerGu * g.biomass;
    if (g.waste > 0.2 * g.biomass) work += 1;
  }
  return Math.min(GARDEN_MAX_FRAC * workers, Math.max(GARDEN_MIN, work));
}

/** Cutters the colony asks for now (0 while the surface is closed). */
export function cutDemand(sim: Sim, col: Colony, P: FungusParams, workers: number): number {
  const mod = col.fungus!;
  const G = totalGarden(mod);
  if (G <= 0 || surfaceActivityOf(sim, col.species) < CUT_ACTIVITY_MIN) return 0;
  let supplied = 0, cached = 0;
  for (const g of liveGardens(mod)) { supplied += substrateInputs(g, sim.state.tick).subIn1Gd; cached += lotsLu(g.cache) + lotsLu(g.pulp); }
  const need = P.subNeedPerGu * G;
  const short = Math.max(0, Math.min(1, (need - supplied - cached) / need));
  const n = (need / CUT_LU_PER_CUTTER_GD) * (1 + short);
  return Math.min(CUT_MAX_FRAC * workers, Math.max(CUT_MIN, n));
}

function setAtLeast(d: Float32Array, t: Task, n: number): void {
  d[ti(t)] = Math.max(d[ti(t)], n);
}

export function augmentDemand(sim: Sim, col: Colony, P: FungusParams): void {
  const cen = censusOf(sim, col.id);
  const n = cen.workers;
  if (n === 0) return;
  const d = col.alloc.demand;
  setAtLeast(d, 'garden', gardenDemand(col, P, n));
  setAtLeast(d, 'cut', cutDemand(sim, col, P, n));
  // GDD 07 §5.4.5: no honeydew; and leaves are not food: no prey or carrion foragers either (pref 0)
  d[ti('tend')] = 0;
  const workforce = { all: cen.available, adult: cen.availableAdult, outside: cen.availableOutside };
  computeTargets(col, cen.available, (coreOf(col).acc['threat'] ?? 0) > 0, workforce);
}

export const fungusAllocationSystem: System = {
  name: 'fungus-allocation', phase: 'colony-allocation', every: ALLOC_EVERY, offset: ALLOC_OFFSET,
  run(sim) {
    for (const { col, P } of atColonies(sim)) if (col.alloc.lastTick === sim.state.tick) augmentDemand(sim, col, P);
  },
};

/** Cut trips the colony's gardeners make while it has no cutting caste: the cut demand, rounded up. */
export function minimCutTrips(sim: Sim, col: Colony, P: FungusParams): number {
  const n = censusOf(sim, col.id).workers;
  return Math.ceil(cutDemand(sim, col, P, n));
}
