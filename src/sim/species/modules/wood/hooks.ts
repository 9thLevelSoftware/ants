// The wood-nesting module's rules plugged into other modules' optional hooks (each hook is additive and inert for
// species without the module): the dig-bite time and refusal (ants/actions), the depth of a nest sample (nest
// founding readiness), and the `drum` action primitive added to the catalogue. Installed once when the module loads.

import type { Ant, Nest, Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { VoxelFlag } from '@/sim/types';
import { digBiteRules } from '@/sim/ants/actions/defs/dig';
import { ACTION_DEFS } from '@/sim/ants/actions/defs';
import { drumDef } from './drum';
import { nestDepthRule } from '@/sim/nest/chambers/registry';
import { flagsAt } from '@/sim/nest/substrate';
import { woodBiteRefusal, woodBiteSeconds } from './biteRule';
import { colonyWoodParams } from './params';
import { depthInWood, woodAt } from './woodState';

/** Plug fill and other loose voxels are not wood to chew: the default (fast, loose) rule applies to them. */
function loose(sim: Sim, p: Vec3): boolean {
  return (flagsAt(sim, p) & VoxelFlag.LOOSE) !== 0;
}

export function biteSeconds(sim: Sim, ant: Ant, sample: Vec3): number | null {
  return loose(sim, sample) ? null : woodBiteSeconds(sim, ant, sample);
}

export function biteRefusal(sim: Sim, ant: Ant, sample: Vec3): 'not-allowed-here' | null {
  return !loose(sim, sample) && woodBiteRefusal(sim, ant, sample) ? 'not-allowed-here' : null;
}

/** Depth of a sample of a wood-nesting colony's nest: into the wood (0 outside wood); null for other nests. */
export function woodNestDepthMm(sim: Sim, nest: Nest, x: number, y: number, z: number): number | null {
  if (!colonyWoodParams(sim, sim.stores.colonies.get(nest.colony))) return null;
  const p = { x, y, z };
  const hit = woodAt(sim, p);
  return hit ? depthInWood(hit.prim, p) : 0;
}

let installed = false;

export function installWoodHooks(): void {
  if (installed) return;
  installed = true;
  digBiteRules.seconds = biteSeconds;
  digBiteRules.refuse = biteRefusal;
  nestDepthRule.depthMm = woodNestDepthMm;
  // the `drum` primitive (GDD 07 A.0) joins the catalogue; only wood-nesting colonies pass its check
  ACTION_DEFS.drum ??= drumDef;
}
