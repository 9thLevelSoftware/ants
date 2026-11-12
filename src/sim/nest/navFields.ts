// Nest-nav fields of one nest (GDD 03 §5.2): D_exit, D_seal and D_ch through services.registerNestTargets, plus
// one D_plan per active plan seeded at its slots. registerNestTargets removes every field of the nest first, so
// the plan fields are always re-added here. D_seal is re-seeded at the plug voxels themselves (GDD 03: "seeds:
// plug voxels"), which reaches the nest side of a plug; seeding at the opening would only reach the mouth.

import type { Vec3 } from '@/core/math/vec3';
import type { Nest, Sim } from '@/sim/types';
import { VoxelFlag, nestFieldId } from '@/sim/types';
import { THROAT_BU } from '@/sim/balance/nest';
import { registerNestTargets } from '@/sim/services';
import { OPEN_MIN } from './carve/keys';
import { nestRuntime } from './runtime';

/** Most plug points used as D_seal seeds per nest. */
const MAX_PLUG_SEEDS = 64;

/** Plans whose slots are offered (non-terminal and not paused). */
export function planIsLive(status: string): boolean {
  return status === 'queued' || status === 'active' || status === 'stalled';
}

export function refreshNestFields(sim: Sim, nest: Nest): void {
  registerNestTargets(sim.nestNav, nest, sim.world.bu);
  const plugs = plugPoints(sim, nest);
  if (plugs.length > 0) sim.nestNav.setTarget(nestFieldId(nest.id, { kind: 'seal', id: -1 }), { points: plugs, radius: 1.5 * sim.carve.voxel });
  for (const p of nest.digPlans) refreshPlanField(sim, nest, p.id);
}

/** Closed PLUG samples in the throats of the nest's sealing / sealed entrances (strided to MAX_PLUG_SEEDS). */
function plugPoints(sim: Sim, nest: Nest): Vec3[] {
  const flags = nestRuntime(sim).flags, v = sim.carve.voxel, all: Vec3[] = [];
  for (const e of nest.entrances) {
    if (e.status === 'open') continue;
    const R = e.radius + THROAT_BU * sim.world.bu;
    for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
      for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
        for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
          if ((flags.get(i, j, k) & VoxelFlag.PLUG) === 0 || sim.carve.sampleAt(i, j, k) >= OPEN_MIN) continue;
          all.push({ x: i * v, y: j * v, z: k * v });
        }
  }
  if (all.length <= MAX_PLUG_SEEDS) return all;
  const step = all.length / MAX_PLUG_SEEDS;
  return Array.from({ length: MAX_PLUG_SEEDS }, (_, n) => all[Math.floor(n * step)]);
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
