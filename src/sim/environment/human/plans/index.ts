// Plan builders by kind and the per-sim plan cache (plans are derived from the saved instance, never saved).

import type { HumanEventInst, HumanEventKind, Sim } from '@/sim/types';
import type { HumanPlan, PlanBuilder } from '../plan';
import { buildCar } from './car';
import { buildChildren } from './children';
import { buildBait, buildFoodDrop, buildSpill } from './drop';
import { buildMowing, buildSweeping, buildVacuum } from './sweep';
import { buildFootsteps } from './walk';
import { buildWatering } from './water';

export { isQuietImpact } from './car';
export { cueLeadTicks, leadTicks } from './lead';
export { waterOrigin, WATER_WALK_IN_S } from './water';

const BUILDERS: Record<HumanEventKind, PlanBuilder> = {
  footsteps: buildFootsteps, mowing: buildMowing, sweeping: buildSweeping, vacuum: buildVacuum, 'food-drop': buildFoodDrop,
  spill: buildSpill, watering: buildWatering, car: buildCar, children: buildChildren, 'bait-station': buildBait,
};

const cache = new WeakMap<Sim, Map<number, HumanPlan | null>>();

function plansOf(sim: Sim): Map<number, HumanPlan | null> {
  let m = cache.get(sim);
  if (!m) { m = new Map(); cache.set(sim, m); }
  return m;
}

/** The plan of an instance (built once; null when the site cannot host it). Impacts are sorted by time. */
export function humanPlan(sim: Sim, inst: HumanEventInst): HumanPlan | null {
  const m = plansOf(sim);
  if (m.has(inst.id)) return m.get(inst.id) ?? null;
  const p = BUILDERS[inst.kind](sim, inst);
  if (p) p.impacts.sort((a, b) => a.t - b.t);
  m.set(inst.id, p);
  return p;
}

/** Drops a finished run's plan from the cache. */
export function forgetPlan(sim: Sim, instId: number): void {
  plansOf(sim).delete(instId);
}

/** Index of the first impact with t >= tMin (impacts sorted by t). */
export function firstImpactAtOrAfter(plan: HumanPlan, tMin: number): number {
  let lo = 0, hi = plan.impacts.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (plan.impacts[mid].t < tMin) lo = mid + 1; else hi = mid;
  }
  return lo;
}
