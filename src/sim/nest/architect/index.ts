// Nest architect (GDD 03 §8): watches each established nest's needs every ARCH_PERIOD_S (60 game s) and proposes
// validated dig plans (source `architect`, status `proposed`; the nest module queues them after ARCH_PROPOSAL_S in
// `auto` mode). Tier 1: modes `auto` / `off` (the `setAutoExpand` command, handled by the nest index), needs
// crowding, brood-space, food-space, missing-type. Tier 2 hooks: `suggest` mode (proposals wait for
// `acceptArchitectPlan`), per-need toggles (`ArchitectState.needToggles`, honoured), winter-depth / flood-safety /
// entrance-access needs (not evaluated: needCache stays 0).

import type { ArchitectNeed, Sim, System } from '@/sim/types';
import { ARCHITECT_EVERY, ARCHITECT_OFFSET } from '@/sim/balance/cadence';
import { planById } from '../plans/plans';
import { evaluateNest } from './evaluate';
import { evaluateNeeds, liveInputs } from './needs';

export { evaluateNest, nestEstablished, concurrentLimit, proposeFor } from './evaluate';
export { evaluateNeeds, liveInputs, missingType, type NeedInputs, type NeedRequest, type NeedEvaluation } from './needs';
export { choosePlacement, type Placement } from './place';
export { layoutNest, abstractInputs, type LayoutOptions, type LayoutResult } from './layout';
export { isBlacklisted, recordSiteFailure } from './sites';
export { architectRuntime, type ArchitectRuntime } from './runtime';
export { nestCapacity, type NestCapacity } from './capacity';

/** Runs the architect over every alive nest (GDD 03 §8.3 cadence). */
export function runArchitect(sim: Sim): void {
  for (const nest of sim.stores.nests.list) if (nest.alive) evaluateNest(sim, nest);
}

export const architectSystem: System = {
  name: 'architect', phase: 'nest', every: ARCHITECT_EVERY, offset: ARCHITECT_OFFSET, run: runArchitect,
};

/**
 * Current need pressures of a nest (diagnostics inputs, GDD 03 App. D `diag-nest-space`): crowding ρ, brood ρ_b,
 * food ratio, missing template types; computed now from the state, built space only. Null for an unknown nest.
 */
export function architectPressures(sim: Sim, nestId: number): Partial<Record<ArchitectNeed, number>> | null {
  const nest = sim.stores.nests.get(nestId);
  if (!nest) return null;
  const species = sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id;
  return evaluateNeeds(nest, species, liveInputs(sim, nest), false).pressures;
}

/**
 * T2 hook (`acceptPlan`, suggest mode): a `proposed` architect plan becomes `queued`. False when the plan is
 * unknown or not a proposal. Not wired: the nest index's `acceptPlan` handler is a no-op until T2.
 */
export function acceptArchitectPlan(sim: Sim, planId: number): boolean {
  const found = planById(sim, planId);
  if (!found || found.plan.status !== 'proposed') return false;
  found.plan.status = 'queued';
  found.plan.statusTick = sim.state.tick;
  sim.emit({ type: 'plan-status-changed', planId, status: 'queued', blockedReason: null });
  return true;
}
