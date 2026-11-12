// Nest-nav fields of one nest (GDD 03 §5.2): D_exit, D_seal and D_ch through services.registerNestTargets, plus
// one D_plan per active plan seeded at its slots. registerNestTargets removes every field of the nest first, so
// the plan fields are always re-added here.

import type { Nest, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { registerNestTargets } from '@/sim/services';

/** Plans whose slots are offered (non-terminal and not paused). */
export function planIsLive(status: string): boolean {
  return status === 'queued' || status === 'active' || status === 'stalled';
}

export function refreshNestFields(sim: Sim, nest: Nest): void {
  registerNestTargets(sim.nestNav, nest, sim.world.bu);
  for (const p of nest.digPlans) refreshPlanField(sim, nest, p.id);
}

/** (Re)defines the D_plan field of one plan from its current slots; removes it when the plan has none. */
export function refreshPlanField(sim: Sim, nest: Nest, planId: number): void {
  const plan = nest.digPlans.find((p) => p.id === planId);
  const id = nestFieldId(nest.id, { kind: 'plan', id: planId });
  if (!plan || !planIsLive(plan.status) || plan.slots.length === 0) {
    if (sim.nestNav.hasTarget(id)) sim.nestNav.removeTarget(id);
    return;
  }
  sim.nestNav.setTarget(id, { points: plan.slots.map((s) => s.pos), radius: sim.carve.voxel });
}
