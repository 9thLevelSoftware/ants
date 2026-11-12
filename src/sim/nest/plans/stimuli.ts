// Task-allocation stimuli published by the nest (GDD 03 §7.7) and the `no-haulers` diagnostic factor (§7.8,
// Appendix D `diag-dig-progress`). Read-only queries for the colony and diagnostics modules.

import type { Sim } from '@/sim/types';
import { HAUL_CLUTTER_WEIGHT, PLAN_PRIORITY_WEIGHT } from '@/sim/balance/nest';
import { loosePellets } from '../pellets';
import { offersSlots } from './frontier';
import { noHaulers, planById } from './plans';

/** Dig stimulus of a colony: sum over its plans that offer slots of free slots x priority weight. */
export function digStimulus(sim: Sim, colonyId: number): number {
  let s = 0;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== colonyId) continue;
    for (const plan of nest.digPlans) {
      if (!offersSlots(plan)) continue;
      const free = plan.slots.filter((x) => x.antId < 0).length;
      s += free * PLAN_PRIORITY_WEIGHT[plan.priority];
    }
  }
  return s;
}

/** Haul stimulus of a colony: spoil-pile pellets + HAUL_CLUTTER_WEIGHT x clutter pellets in its nests. */
export function haulStimulus(sim: Sim, colonyId: number): number {
  let s = 0;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== colonyId) continue;
    for (const it of loosePellets(sim, nest.id)) s += it.spoilPlanId >= 0 ? 1 : HAUL_CLUTTER_WEIGHT;
  }
  return s;
}

/** Is the plan's spoil pile full for NO_HAULERS_S (`no-haulers`: slowed, not stalled)? False for unknown plans. */
export function planNoHaulers(sim: Sim, planId: number): boolean {
  const found = planById(sim, planId);
  return !!found && noHaulers(sim, found.plan);
}
