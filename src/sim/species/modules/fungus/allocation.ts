// The fungus garden's labour demand (GDD 07 §6.4.2, §6.4.6), added to the colony's demand right after each
// allocation pass (same phase and cadence, later in module order) and the targets recomputed from it:
//   garden  GARDENERS_PER_GU x Σ G tenders, plus the processing and planting work waiting (at least
//           GARDEN_MIN while a garden lives; at most GARDEN_MAX_FRAC of the workers);
//   cut     the substrate the gardens need (1.8 LU per GU per GD) over what a cutter brings in a game day, more while
//           the gardens are short (at least CUT_MIN while the surface is workable; at most CUT_MAX_FRAC);
//   haul    one garden-waste hauler more per garden whose waste is due and can be dumped; refuse workers first,
//           then small media and media are moved to `haul` (they become refuse workers, refuse.ts);
//   tend    none: a leafcutter keeps no aphids (honeydew preference 0);
//   queen-care none: the gardeners feed the queen in the garden (queenFeed.ts).
// A colony without a cutting caste (the first minims) cuts through its gardeners (behaviourGarden.ts, deviation).

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Colony, Sim, System, Task } from '@/sim/types';
import { ti } from '@/sim/colony/taskIdx';
import { censusOf } from '@/sim/colony/census';
import { reassignable, switchTask } from '@/sim/colony/allocation/assign';
import { computeTargets } from '@/sim/colony/allocation/targets';
import { coreOf } from '@/sim/colony/core';
import { surfaceActivityOf } from '@/sim/colony/envAdapter';
import { ALLOC_EVERY, ALLOC_OFFSET } from '@/sim/balance/cadence';
import {
  CUT_ACTIVITY_MIN, CUT_TRIPS_PER_ANT_GD, CUT_MAX_FRAC, CUT_MIN, GARDEN_MAX_FRAC, GARDEN_MIN, PROCESS_BATCH_LU,
} from '@/sim/balance/species-leafcutter';
import type { FungusParams } from './params';
import { atColonies } from './economy';
import { liveGardens, totalGarden } from './state';
import { lotsLu } from './cache';
import { substrateInputs } from './substrate';
import { cutsLeaves, isSmallMedia, wasteDue } from './work';
import { noCutters } from './actions';
import { isRefuse, mayHaulGardenWaste } from './refuse';
import { wasteDumpPoint } from './wasteDump';

/** Gardeners the colony asks for now. */
export function gardenDemand(col: Colony, P: FungusParams, workers: number): number {
  const mod = col.fungus!;
  const live = liveGardens(mod);
  if (live.length === 0) return 0;
  let work = 0;
  for (const g of live) {
    work += P.gardenersPerGu * g.biomass;
    // processing and planting waiting: one gardener per PROCESS_BATCH_LU x 4 waiting LU (a rough work share)
    work += (lotsLu(g.cache) + lotsLu(g.pulp)) / (4 * PROCESS_BATCH_LU);
    if (g.infection > 0) work += P.weedersPerGu * g.biomass;
  }
  return Math.min(GARDEN_MAX_FRAC * workers, Math.max(GARDEN_MIN, work));
}

/** Mean carry capacity of the colony's cutters (media and majors), or of its minims while it has no cutter. */
function cutterCarry(sim: Sim, col: Colony): number {
  let sum = 0, n = 0, minim = 0, nm = 0;
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id) continue;
    if (cutsLeaves(a)) { sum += a.carryCap; n++; } else if (a.caste === 'minor') { minim += a.carryCap; nm++; }
  }
  return n > 0 ? sum / n : nm > 0 ? minim / nm : 1;
}

/**
 * Cutters the colony asks for now (0 while the surface is closed): the substrate the gardens need over what one
 * cutter of the colony's size brings in a game day (CUT_TRIPS_PER_ANT_GD trips of a full 15 s fragment), more
 * while the gardens are short.
 */
export function cutDemand(sim: Sim, col: Colony, P: FungusParams, workers: number): number {
  const mod = col.fungus!;
  const G = totalGarden(mod);
  if (G <= 0 || surfaceActivityOf(sim, col.species) < CUT_ACTIVITY_MIN) return 0;
  let supplied = 0, cached = 0;
  for (const g of liveGardens(mod)) { supplied += substrateInputs(g, sim.state.tick).subIn1Gd; cached += lotsLu(g.cache) + lotsLu(g.pulp); }
  const need = P.subNeedPerGu * G;
  const short = Math.max(0, Math.min(1, (need - supplied - cached) / need));
  const perAnt = Math.max(0.05, cutterCarry(sim, col)) * CUT_TRIPS_PER_ANT_GD;
  const n = (need / perAnt) * (1 + short);
  return Math.min(CUT_MAX_FRAC * workers, Math.max(CUT_MIN, n));
}

function setAtLeast(d: Float32Array, t: Task, n: number): void {
  d[ti(t)] = Math.max(d[ti(t)], n);
}

const dumpScratch: Vec3 = { x: 0, y: 0, z: 0 };

/** Gardens whose waste is due and has somewhere to go (a dump point in the garden's nest). */
export function wasteJobs(sim: Sim, col: Colony): number {
  let n = 0;
  for (const nid of col.nestIds) {
    const nest = sim.stores.nests.get(nid);
    if (!nest || !wasteDumpPoint(sim, nest, dumpScratch)) continue;
    for (const g of col.fungus!.gardens) if (wasteDue(g) && nest.chambers.some((c) => c.id === g.chamberId)) n++;
  }
  return n;
}

/** Hauler preference: refuse workers (already lost to the gardens), then small media, then media. */
function haulerRank(a: Ant): number {
  return isRefuse(a) ? 0 : isSmallMedia(a) ? 1 : 2;
}

/**
 * Puts garden-waste haulers on `haul` until there are `jobs` of them (refuse workers first). The colony's own
 * allocator does not know which of its ants may carry garden waste, so it would fill `haul` with minims.
 */
export function ensureWasteHaulers(sim: Sim, col: Colony, jobs: number): number {
  if (jobs <= 0) return 0;
  let have = 0;
  const pool: Ant[] = [];
  for (const a of sim.stores.ants.list) {
    if (!a.alive || a.colony !== col.id || !mayHaulGardenWaste(a)) continue;
    if (a.task === 'haul') have++;
    else if (reassignable(a) && (isRefuse(a) || a.task === 'garden' || a.task === 'idle')) pool.push(a);
  }
  pool.sort((x, y) => haulerRank(x) - haulerRank(y) || x.id - y.id);
  let moved = 0;
  for (const a of pool) {
    if (have + moved >= jobs) break;
    switchTask(sim, col, a, 'haul', 'job:garden-waste');
    moved++;
  }
  return moved;
}

export function augmentDemand(sim: Sim, col: Colony, P: FungusParams): void {
  const cen = censusOf(sim, col.id);
  const n = cen.workers;
  if (n === 0) return;
  const d = col.alloc.demand;
  const cut = cutDemand(sim, col, P, n);
  // first-brood deviation: without a cutting caste the cut trips are the gardeners' (behaviourGarden.ts)
  if (noCutters(sim, col)) setAtLeast(d, 'garden', Math.min(n, gardenDemand(col, P, n) + Math.ceil(cut)));
  else {
    setAtLeast(d, 'garden', gardenDemand(col, P, n));
    setAtLeast(d, 'cut', cut);
  }
  // GDD 07 §5.4.5: no honeydew; and leaves are not food: no prey or carrion foragers either (pref 0)
  d[ti('tend')] = 0;
  // the queen lives in the garden and is fed fungus there by its gardeners (queenFeed.ts): no queen-care carers
  // (the shared queen-care never feeds from a minim's crop, which is too small for its feed threshold)
  d[ti('queen-care')] = 0;
  const waste = wasteJobs(sim, col);
  d[ti('haul')] += waste;
  const workforce = { all: cen.available, adult: cen.availableAdult, outside: cen.availableOutside };
  computeTargets(col, cen.available, (coreOf(col).acc['threat'] ?? 0) > 0, workforce);
  ensureWasteHaulers(sim, col, waste);
}

export const fungusAllocationSystem: System = {
  name: 'fungus-allocation', phase: 'colony-allocation', every: ALLOC_EVERY, offset: ALLOC_OFFSET,
  run(sim) {
    for (const { col, P } of atColonies(sim)) if (col.alloc.lastTick === sim.state.tick) augmentDemand(sim, col, P);
  },
};

/**
 * Cut trips the colony's gardeners make while it has no cutting caste: the cut demand, rounded up, at most half the
 * minims (the others tend, harvest and feed), and half of it while the gardens are fully supplied.
 */
export function minimCutTrips(sim: Sim, col: Colony, P: FungusParams): number {
  const n = censusOf(sim, col.id).workers;
  let minims = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id && a.caste === 'minor') minims++;
  let supplied = 0, need = 0;
  for (const g of liveGardens(col.fungus!)) { supplied += substrateInputs(g, sim.state.tick).subIn1Gd; need += P.subNeedPerGu * g.biomass; }
  const d = cutDemand(sim, col, P, n) * (supplied >= need ? 0.5 : 1);
  return Math.min(Math.ceil(d), Math.max(1, Math.floor(minims / 2)));
}
