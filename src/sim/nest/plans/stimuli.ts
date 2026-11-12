// Task-allocation stimuli published by the nest (GDD 03 §7.7) and the `no-haulers` diagnostic factor (§7.8,
// Appendix D `diag-dig-progress`). Read-only queries for the colony and diagnostics modules.

import type { Sim } from '@/sim/types';
import { HAUL_CLUTTER_WEIGHT, PLAN_PRIORITY_WEIGHT } from '@/sim/balance/nest';
import { loosePellets, pelletHaulUrgency } from '../pellets';
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

/**
 * Dig demand of a colony in worker-equivalents (GDD 02 §6.2 `digDemand` from the nest chapter): over the plans that
 * offer slots, the occupied slots plus the free slots weighted by priority relative to 'normal' (so a normal plan
 * asks for exactly its slots; the occupied ones keep counting, or allocation would pull its diggers away).
 */
export function digDemand(sim: Sim, colonyId: number): number {
  let d = 0;
  const norm = PLAN_PRIORITY_WEIGHT.normal;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== colonyId) continue;
    for (const plan of nest.digPlans) {
      if (!offersSlots(plan)) continue;
      let free = 0;
      for (const x of plan.slots) if (x.antId < 0) free++;
      d += plan.slots.length - free + (free * PLAN_PRIORITY_WEIGHT[plan.priority]) / norm;
    }
  }
  return d;
}

/**
 * Haul stimulus of a colony (GDD 03 §7.7): spoil-pile pellets + HAUL_CLUTTER_WEIGHT x clutter pellets in its nests,
 * each weighted by its haul urgency (pelletHaulUrgency: rising toward tamping age).
 */
export function haulStimulus(sim: Sim, colonyId: number): number {
  let s = 0;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== colonyId) continue;
    for (const it of loosePellets(sim, nest.id)) s += (it.spoilPlanId >= 0 ? 1 : HAUL_CLUTTER_WEIGHT) * pelletHaulUrgency(sim, it);
  }
  return s;
}

/**
 * Pellet load of a colony for the haul demand (GDD 02 §6.2 `loosePellets`): its lying in-nest pellets, each
 * weighted by its haul urgency, so demand rises while spoil waits and haulers are allocated before it tamps.
 */
export function haulPelletLoad(sim: Sim, colonyId: number): number {
  let s = 0;
  for (const nest of sim.stores.nests.list) {
    if (!nest.alive || nest.colony !== colonyId) continue;
    for (const it of loosePellets(sim, nest.id)) s += pelletHaulUrgency(sim, it);
  }
  return s;
}

/** Is the plan's spoil pile full for NO_HAULERS_S (`no-haulers`: slowed, not stalled)? False for unknown plans. */
export function planNoHaulers(sim: Sim, planId: number): boolean {
  const found = planById(sim, planId);
  return !!found && noHaulers(sim, found.plan);
}
