// Nest architect (GDD 03 §8): watches each established nest's needs every ARCH_PERIOD_S (60 game s, nests
// staggered) and proposes validated dig plans (source `architect`, status `proposed`; the nest module queues them
// after ARCH_PROPOSAL_S in `auto` mode; in `off` the architect queues proposals still waiting itself). Tier 1:
// modes `auto` / `off` (the `setAutoExpand` command, handled by the nest index), needs crowding, brood-space,
// food-space, missing-type. Tier 2 hooks: `suggest` mode (proposals wait for `acceptArchitectPlan`), per-need
// toggles (`ArchitectState.needToggles`, honoured), winter-depth / flood-safety / entrance-access needs (not
// evaluated: needCache stays 0).

import type { ArchitectNeed, Nest, Sim, System } from '@/sim/types';
import { ARCHITECT_EVERY, ARCHITECT_OFFSET } from '@/sim/balance/cadence';
import { ARCH_NESTS_PER_SLOT, ARCH_SLOT_TICKS } from '@/sim/balance/architect';
import { planById } from '../plans/plans';
import { evaluateNest, queueProposal } from './evaluate';
import { evaluateNeeds, liveInputs } from './needs';

export { evaluateNest, nestEstablished, concurrentLimit, proposeFor, volumeRoom } from './evaluate';
export { evaluateNeeds, liveInputs, missingType, type NeedInputs, type NeedRequest, type NeedEvaluation } from './needs';
export { choosePlacement, type Placement, type PlacementOptions } from './place';
export { layoutNest, abstractInputs, type LayoutOptions, type LayoutResult } from './layout';
export { isBlacklisted, recordSiteFailure } from './sites';
export { architectRuntime, type ArchitectRuntime } from './runtime';
export { nestCapacity, type NestCapacity } from './capacity';

/** First tick a never-evaluated nest is due (the architect's original cadence slot). */
const FIRST_EVAL_TICK = ARCHITECT_EVERY - ARCHITECT_OFFSET;

/** Tick from which the nest's next evaluation is due: ARCHITECT_EVERY after its last one. */
export function architectDueTick(nest: Nest): number {
  const last = nest.architect.lastEvalTick;
  return last < 0 ? FIRST_EVAL_TICK : last + ARCHITECT_EVERY;
}

/**
 * GDD 03 §8.3: every nest is evaluated every ARCH_PERIOD_S, staggered. The system runs every ARCH_SLOT_TICKS
 * and evaluates at most ARCH_NESTS_PER_SLOT due nests (most overdue first, ties: store order), so nests that
 * fall due together are spread over consecutive slots and keep that spacing afterwards.
 */
export function runArchitect(sim: Sim): void {
  const now = sim.state.tick;
  const due = sim.stores.nests.list.filter((n) => n.alive && architectDueTick(n) <= now);
  due.sort((a, b) => architectDueTick(a) - architectDueTick(b));
  for (const nest of due.slice(0, ARCH_NESTS_PER_SLOT)) evaluateNest(sim, nest);
}

export const architectSystem: System = {
  name: 'architect', phase: 'nest', every: ARCH_SLOT_TICKS, offset: ARCHITECT_OFFSET % ARCH_SLOT_TICKS, run: runArchitect,
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
  return !!found && found.plan.source === 'architect' && queueProposal(sim, found.plan);
}
