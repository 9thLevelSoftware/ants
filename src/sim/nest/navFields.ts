// Nest-nav fields of one nest (GDD 03 §5.2): D_exit, D_seal and D_ch through services.registerNestTargets, plus
// one D_plan per active plan seeded at its slots. registerNestTargets removes every field of the nest first, so
// the plan fields are always re-added here. D_seal is re-seeded at the plug voxels themselves (GDD 03: "seeds:
// plug voxels"), which reaches the nest side of a plug; seeding at the opening would only reach the mouth.
//
// The fields are derived caches: their seeds are a pure function of the persisted state, so a Sim built after a
// load must get the same set. createSim (services.ts) only calls registerNestTargets; ensureNestFields completes
// the set once per Sim before the first tick's readers, and registerNestFields is the hook createServices should
// call so the set is complete even before the first tick.

import type { Vec3 } from '@/core/math/vec3';
import type { CarveGrid, Nest, NestNav, Sim, SimState } from '@/sim/types';
import { VoxelFlag, nestFieldId } from '@/sim/types';
import { THROAT_BU } from '@/sim/balance/nest';
import { registerNestTargets } from '@/sim/services';
import { OPEN_MIN } from './carve/keys';
import { FlagStore } from './flags';
import { nestRuntime } from './runtime';

/** Most plug points used as D_seal seeds per nest. */
const MAX_PLUG_SEEDS = 64;

/** Plans whose slots are offered (non-terminal and not paused). */
export function planIsLive(status: string): boolean {
  return status === 'queued' || status === 'active' || status === 'stalled';
}

export function refreshNestFields(sim: Sim, nest: Nest): void {
  writeNestFields(sim.nestNav, sim.carve, nestRuntime(sim).flags, nest, sim.world.bu);
}

/** Every field of one nest from its record, the carve grid and the voxel flags. */
function writeNestFields(nav: NestNav, carve: CarveGrid, flags: FlagStore, nest: Nest, bu: number): void {
  registerNestTargets(nav, nest, bu);
  const plugs = plugPoints(carve, flags, nest, bu);
  if (plugs.length > 0) nav.setTarget(nestFieldId(nest.id, { kind: 'seal', id: -1 }), { points: plugs, radius: 1.5 * carve.voxel });
  for (const p of nest.digPlans) writePlanField(nav, carve, nest, p.id);
}

const BUILT = new WeakSet<Sim>();

/** Rebuilds the full field set of every nest once per Sim (after createSim); later changes refresh it in place. */
export function ensureNestFields(sim: Sim): void {
  if (BUILT.has(sim)) return;
  BUILT.add(sim);
  for (const nest of sim.stores.nests.list) if (nest.alive) refreshNestFields(sim, nest);
}

/**
 * The complete field set of every alive nest, for createServices (it has the state and the services but no Sim
 * yet): replaces its registerNestTargets loop.
 */
export function registerNestFields(nav: NestNav, carve: CarveGrid, state: SimState, bu: number): void {
  const flags = new FlagStore(state.worldDelta.carveFlags);
  for (const nest of state.nests) if (nest.alive) writeNestFields(nav, carve, flags, nest, bu);
}

/** Closed PLUG samples in the throats of the nest's sealing / sealed entrances (strided to MAX_PLUG_SEEDS). */
function plugPoints(carve: CarveGrid, flags: FlagStore, nest: Nest, bu: number): Vec3[] {
  const v = carve.voxel, all: Vec3[] = [];
  for (const e of nest.entrances) {
    if (e.status === 'open') continue;
    const R = e.radius + THROAT_BU * bu;
    for (let k = Math.floor((e.pos.z - R) / v); k <= Math.ceil((e.pos.z + R) / v); k++)
      for (let j = Math.floor((e.pos.y - R) / v); j <= Math.ceil((e.pos.y + R) / v); j++)
        for (let i = Math.floor((e.pos.x - R) / v); i <= Math.ceil((e.pos.x + R) / v); i++) {
          if ((flags.get(i, j, k) & VoxelFlag.PLUG) === 0 || carve.sampleAt(i, j, k) >= OPEN_MIN) continue;
          all.push({ x: i * v, y: j * v, z: k * v });
        }
  }
  if (all.length <= MAX_PLUG_SEEDS) return all;
  const step = all.length / MAX_PLUG_SEEDS;
  return Array.from({ length: MAX_PLUG_SEEDS }, (_, n) => all[Math.floor(n * step)]);
}

/** (Re)defines the D_plan field of one plan from its current slots; removes it when the plan has none. */
export function refreshPlanField(sim: Sim, nest: Nest, planId: number): void {
  writePlanField(sim.nestNav, sim.carve, nest, planId);
}

function writePlanField(nav: NestNav, carve: CarveGrid, nest: Nest, planId: number): void {
  const plan = nest.digPlans.find((p) => p.id === planId);
  const id = nestFieldId(nest.id, { kind: 'plan', id: planId });
  if (!plan || !planIsLive(plan.status) || plan.slots.length === 0) {
    if (nav.hasTarget(id)) nav.removeTarget(id);
    return;
  }
  nav.setTarget(id, { points: plan.slots.map((s) => s.pos), radius: carve.voxel });
}
