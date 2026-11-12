// A complete small nest laid out at once, without running the simulation (GDD 03 §15: rival and generated
// nests): the founding template (shaft + cell), then architect growth replayed from abstract numbers, a population
// growing step by step to `workers`; each step's needs are placed with the same placement and validation as the
// live architect and carved instantly; the spoil goes onto the entrance mound. Deterministic for a given RNG.

import type { RngState } from '@/core/rng';
import { rngFork } from '@/core/rng';
import type { Nest, PlanSource, Sim } from '@/sim/types';
import { BULKING, PLAN_CLIP_BU, nestTemplate } from '@/sim/balance/nest';
import { removeItem } from '@/sim/entities';
import {
  LAYOUT_BROOD_PER_WORKER, LAYOUT_CANDIDATES, LAYOUT_GROWTH, LAYOUT_PLANS_PER_STEP, LAYOUT_START_WORKERS,
} from '@/sim/balance/architect';
import { nestOpenVolume } from '../chambers/upkeep';
import { carveTemplateNest } from '../lifecycle';
import { carveSphere } from '../carveOps';
import { createMound, deposit, moundById, publishMound } from '../mounds';
import { isPellet } from '../pellets';
import { planG } from '../plans/geometry';
import { completePlan, createPlanImpl, planById } from '../plans/plans';
import { planCache } from '../plans/targets';
import { evaluateNeeds, type NeedInputs } from './needs';
import { choosePlacement } from './place';
import { architectRuntime } from './runtime';

export interface LayoutOptions {
  /** Plan source recorded on the plans (validation is strict for every non-player source). Default 'worldgen'. */
  source?: PlanSource;
  /** RNG for the candidate draws. Default: a fork of the world seed named after the nest. */
  rng?: RngState;
  /** Carve the founding template first (default true; false when the nest already has its cavity). */
  founding?: boolean;
}

export interface LayoutResult {
  nest: Nest;
  /** Plans carved, in order. */
  planIds: number[];
  /** Population steps replayed. */
  steps: number;
  /** Needs that found no valid site at some step (count). */
  unplaced: number;
}

/**
 * Carves one plan at once like the nest module's instantCarvePlan (every sphere clipped to the plan volume with
 * the dig predicate, then completion: snap, chamber registration), but the spoil is only counted: the completion
 * pellets are taken out of the nest and everything goes onto the mound once, at the end of the layout (one mound
 * relaxation instead of one per plan). Returns the removed volume, BU^3.
 */
function carveAtOnce(sim: Sim, nest: Nest, planId: number): number {
  const found = planById(sim, planId);
  const cache = found ? planCache(sim, nest, found.plan) : null;
  if (!found || !cache) return 0;
  const bu = sim.world.bu, g = cache.geometry, clip = PLAN_CLIP_BU * bu;
  const canDig = (x: number, y: number, z: number) => planG(g, x, y, z) > -clip && sim.kernel.canDigAt(x, y, z);
  let removed = 0;
  for (const sp of found.plan.spheres) removed += carveSphere(sim, sp.c, sp.r, { canDig }).volume;
  completePlan(sim, nest, found.plan, cache);
  let vol = removed / bu ** 3;
  for (const it of sim.stores.items.list) {
    if (!it.alive || !isPellet(it) || it.nestId !== nest.id || it.carrierIds.length > 0) continue;
    vol += it.volume;
    removeItem(sim, it.id, 'layout');
  }
  return vol;
}

/** Puts the layout's spoil (BU^3, x BULKING) on the mound of the nest's first entrance (GDD 03 §15). */
function depositSpoil(sim: Sim, nest: Nest, volBu3: number): void {
  const e = nest.entrances[0], bu = sim.world.bu;
  if (!e || volBu3 <= 0) return;
  const m = (e.moundId >= 0 ? moundById(sim, e.moundId) : undefined) ?? createMound(sim, nest, e, e.pos.x, e.pos.z, nest.substrate);
  deposit(sim, m, e.pos.x + e.radius + 2 * bu, e.pos.z, volBu3 * BULKING * bu ** 3);
  publishMound(sim, m);
}

/** Abstract need inputs of a colony of `workers` standard workers with a queen. */
export function abstractInputs(workers: number): NeedInputs {
  return {
    workers, adultUnits: workers, broodUnits: workers * LAYOUT_BROOD_PER_WORKER, foodLoads: 0, looseFoodItems: 0,
    queenAlive: true, diggers: workers,
  };
}

/** Lays out the nest of a colony of `workers` adult workers (see the file comment). */
export function layoutNest(sim: Sim, nestId: number, workers: number, opts: LayoutOptions = {}): LayoutResult {
  const nest = sim.stores.nests.get(nestId);
  if (!nest) throw new Error(`layoutNest: no nest ${nestId}`);
  const species = sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id;
  const rng = opts.rng ?? rngFork(sim.state.config.world.seed, `architect-layout-${nestId}`);
  const source = opts.source ?? 'worldgen';
  if (opts.founding !== false) carveTemplateNest(sim, nestId, { chambers: [], royal: workers >= nestTemplate(species).royalAt });
  nest.volumeOpen = nestOpenVolume(sim, nest);
  const out: LayoutResult = { nest, planIds: [], steps: 0, unplaced: 0 };
  let p = Math.min(workers, LAYOUT_START_WORKERS), spoil = 0;
  for (;;) {
    out.steps++;
    const inputs = abstractInputs(p);
    const failed = new Set<string>();
    for (let n = 0; n < LAYOUT_PLANS_PER_STEP; n++) {
      const req = evaluateNeeds(nest, species, inputs, true).requests.find((r) => !failed.has(r.need));
      if (!req) break;
      let id = -1;
      choosePlacement(sim, nest, req, rng, (spec) => {
        architectRuntime(sim).probe?.(spec, req);
        id = createPlanImpl(sim, spec, source);
        return id >= 0;
      }, LAYOUT_CANDIDATES);
      if (id < 0) { failed.add(req.need); out.unplaced++; continue; }
      const plan = nest.digPlans.find((q) => q.id === id);
      if (plan) plan.need = req.need;
      spoil += carveAtOnce(sim, nest, id);
      nest.volumeOpen = nestOpenVolume(sim, nest);
      out.planIds.push(id);
    }
    if (p >= workers) break;
    p = Math.min(workers, Math.max(p + 1, Math.ceil(p * LAYOUT_GROWTH)));
  }
  depositSpoil(sim, nest, spoil);
  return out;
}
