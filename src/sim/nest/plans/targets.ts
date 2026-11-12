// Target voxels of a plan (GDD 03 §7.2): samples with g > 0 inside the substrate that the species can dig, per
// plan and per sphere, cached per Sim (a pure function of the plan record and the world; rebuilt after a load).

import type { DigPlan, Nest, Sim, SpeciesId } from '@/sim/types';
import { digFactor } from '@/sim/balance/nest';
import { OPEN_MIN } from '../carve/keys';
import { nestRuntime } from '../runtime';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';
import { buildGeometry, planG, type PlanGeometry } from './geometry';

export interface PlanCache {
  geometry: PlanGeometry;
  /** Diggable target samples (packed, ascending). */
  targets: number[];
  /** Target samples per sphere (indices into `targets`). */
  sphereTargets: number[][];
  /** Closed samples with g > 0 the species cannot dig, per sphere (hidden stones, roots: `obstructed`). */
  sphereNonDig: number[];
}

export function planSpecies(sim: Sim, nest: Nest): SpeciesId {
  return (sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id) as SpeciesId;
}

/** Can the species open this sample (open already, or diggable material that the kernel's predicate allows)? */
export function sampleDiggable(sim: Sim, species: SpeciesId, i: number, j: number, k: number): boolean {
  if (sim.carve.sampleAt(i, j, k) >= OPEN_MIN) return true;
  const v = sim.carve.voxel, x = i * v, y = j * v, z = k * v;
  return sim.kernel.canDigAt(x, y, z) && digFactor(species, sim.field.materialAt({ x, y, z })) > 0;
}

/**
 * Is the sample outside every solid (open air above the ground, a gap between primitives), carve grid ignored?
 * Such samples are not plan targets: a bite has nothing to remove there, so a shaft that overshoots the surface
 * would otherwise never complete. The test ignores the carve grid so the target set does not depend on when the
 * cache was built (it is rebuilt after a load).
 */
export function sampleInOpenAir(sim: Sim, i: number, j: number, k: number): boolean {
  const v = sim.carve.voxel;
  return sim.field.substrateXYZ(i * v, j * v, k * v) > 0;
}

/** Calls fn for every sample with g > 0 (fixed order: z, y, x ascending). */
export function forPlanSamples(sim: Sim, g: PlanGeometry, fn: (i: number, j: number, k: number) => void): void {
  const v = sim.carve.voxel;
  for (let k = Math.floor(g.min.z / v); k <= Math.ceil(g.max.z / v); k++)
    for (let j = Math.floor(g.min.y / v); j <= Math.ceil(g.max.y / v); j++)
      for (let i = Math.floor(g.min.x / v); i <= Math.ceil(g.max.x / v); i++) if (planG(g, i * v, j * v, k * v) > 0) fn(i, j, k);
}

/** The plan's cached geometry and targets (built on first use), or null when the record has no geometry. */
export function planCache(sim: Sim, nest: Nest, plan: DigPlan): PlanCache | null {
  const rt = nestRuntime(sim);
  const have = rt.geom.get(plan.id);
  if (have) return have;
  if (plan.kind === 'seal' || plan.kind === 'reopen') return null;
  const species = planSpecies(sim, nest);
  const geometry = buildGeometry(plan, species, sim.world.bu);
  if (!geometry) return null;
  const targets: number[] = [], hard: number[] = [];
  forPlanSamples(sim, geometry, (i, j, k) => {
    if (!sampleInOpenAir(sim, i, j, k)) (sampleDiggable(sim, species, i, j, k) ? targets : hard).push(packSample(i, j, k));
  });
  return storePlanCache(sim, plan, geometry, targets, hard);
}

/**
 * Stores the cache of a new plan from the target split its validation just computed (the same samples planCache
 * would collect: same geometry, same world, same tick), saving a second scan of the plan volume.
 */
export function seedPlanCache(sim: Sim, plan: DigPlan, geometry: PlanGeometry, targets: number[], hard: number[]): PlanCache {
  return storePlanCache(sim, plan, geometry, targets, hard);
}

function storePlanCache(sim: Sim, plan: DigPlan, geometry: PlanGeometry, targets: number[], hard: number[]): PlanCache {
  targets.sort((a, b) => a - b);
  const v = sim.carve.voxel;
  const sphereTargets = plan.spheres.map(() => [] as number[]);
  const sphereNonDig = plan.spheres.map(() => 0);
  for (const key of hard) {
    const x = sampleI(key) * v, y = sampleJ(key) * v, z = sampleK(key) * v;
    for (let s = 0; s < plan.spheres.length; s++) {
      const sp = plan.spheres[s];
      if ((x - sp.c.x) ** 2 + (y - sp.c.y) ** 2 + (z - sp.c.z) ** 2 <= sp.r * sp.r) sphereNonDig[s]++;
    }
  }
  for (let t = 0; t < targets.length; t++) {
    const x = sampleI(targets[t]) * v, y = sampleJ(targets[t]) * v, z = sampleK(targets[t]) * v;
    for (let s = 0; s < plan.spheres.length; s++) {
      const sp = plan.spheres[s];
      if ((x - sp.c.x) ** 2 + (y - sp.c.y) ** 2 + (z - sp.c.z) ** 2 <= sp.r * sp.r) sphereTargets[s].push(t);
    }
  }
  const cache: PlanCache = { geometry, targets, sphereTargets, sphereNonDig };
  nestRuntime(sim).geom.set(plan.id, cache);
  return cache;
}

/** Closed target samples of the plan now. */
export function remainingTargets(sim: Sim, cache: PlanCache): number {
  let n = 0;
  for (const key of cache.targets) if (sim.carve.sampleAt(sampleI(key), sampleJ(key), sampleK(key)) < OPEN_MIN) n++;
  return n;
}
