// The per-tick nest system (GDD 03 §16 budgets): breaches from other modules' carves, entrance states, plans,
// chamber detection on a budget (one nest per tick, every CHAMBER_DETECT_TICKS, only when its space changed),
// occupancy, microclimate, the founding-to-royal rule, pellet tamping, mound batches, nest milestones. Nav fields
// update lazily in the kernel (carve listener); the nest refreshes their seeds when entrances, chambers or plans
// change.

import type { Nest, NestMilestoneKind, Sim, System } from '@/sim/types';
import {
  CHAMBER_DETECT_TICKS, ENTRANCE_CHECK_TICKS, MICRO_UPDATE_TICKS, OCCUPANCY_TICKS, PLAN_UPDATE_TICKS, ROYAL_CHECK_TICKS,
} from '@/sim/balance/nest';
import { checkEntrances, processNewBreaches } from './entrances';
import { checkRoyal, detectNestChambers, updateMicroclimate, updateOccupancy } from './chambers/upkeep';
import { moundBatches, tampDuePellets } from './pellets';
import { dropOldPlans, updatePlan } from './plans/plans';
import { takeNestDirty } from './runtime';

const MILESTONES: { kind: NestMilestoneKind; value: (n: Nest) => number; at: number }[] = [
  { kind: 'depth-50', value: (n) => Math.max(0, ...n.chambers.map((c) => c.depthBu)), at: 50 },
  { kind: 'depth-100', value: (n) => Math.max(0, ...n.chambers.map((c) => c.depthBu)), at: 100 },
  { kind: 'chambers-10', value: (n) => n.chambers.length, at: 10 },
  { kind: 'volume-1000', value: (n) => n.volumeOpen, at: 1000 },
];

function detect(sim: Sim, nest: Nest): void {
  const before = MILESTONES.map((m) => m.value(nest));
  detectNestChambers(sim, nest);
  MILESTONES.forEach((m, n) => {
    const now = m.value(nest);
    if (before[n] < m.at && now >= m.at) sim.emit({ type: 'nest-milestone', kind: m.kind, value: now });
  });
}

export function runNestSystem(sim: Sim): void {
  const tick = sim.state.tick;
  processNewBreaches(sim);
  if (tick % ENTRANCE_CHECK_TICKS === 0) checkEntrances(sim);
  let detections = 0;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive) continue;
    for (const plan of [...nest.digPlans]) if ((tick + plan.id) % PLAN_UPDATE_TICKS === 0) updatePlan(sim, nest, plan);
    if ((tick + nest.id) % PLAN_UPDATE_TICKS === 0) dropOldPlans(sim, nest);
    if ((tick + nest.id) % CHAMBER_DETECT_TICKS === 0 && detections === 0 && takeNestDirty(sim, nest.id)) {
      detect(sim, nest);
      detections++;
    }
    if ((tick + nest.id) % OCCUPANCY_TICKS === 0) updateOccupancy(sim, nest);
    if ((tick + nest.id) % ROYAL_CHECK_TICKS === 0) checkRoyal(sim, nest);
    if ((tick + nest.id) % MICRO_UPDATE_TICKS === 0) updateMicroclimate(sim, nest);
  }
  tampDuePellets(sim);
  moundBatches(sim);
}

/** Carve ops, breaches / entrances, chamber detection, nav-field refresh, pellets and mounds (GDD 03). */
export const nestSystem: System = { name: 'nest', phase: 'nest', run: runNestSystem };
