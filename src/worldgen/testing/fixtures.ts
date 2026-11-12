// Test support: generated worlds per (archetype, seed, size, species), cached per test file, and the Tier 1
// archetype list. Seed counts honour FOUNDRESS_WORLDGEN_FULL=1 (the full acceptance sweeps).

import type { ArchetypeId, SpeciesId, WorldSizeId } from '@/sim/types';
import { defaultWorldParams } from '../params';
import { generateWorldReport, type GenerateOptions, type WorldgenReport } from '../pipeline';

export const T1_ARCHETYPES: readonly ArchetypeId[] = ['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door'];

declare const process: { env: Record<string, string | undefined> } | undefined;
const env = typeof process !== 'undefined' ? process.env : {};
/** Full sweeps (20 seeds per archetype) only with FOUNDRESS_WORLDGEN_FULL=1; the default suite uses fewer. */
export const FULL = env.FOUNDRESS_WORLDGEN_FULL === '1';
/** Strict wall-clock budgets only with FOUNDRESS_PERF_STRICT=1 (the machine is shared and often loaded). */
export const PERF_STRICT = env.FOUNDRESS_PERF_STRICT === '1';

const cache = new Map<string, WorldgenReport>();

export function report(archetype: ArchetypeId, seed = 1, size: WorldSizeId = 'standard', species: SpeciesId = 'lasius-niger', opts: GenerateOptions = {}): WorldgenReport {
  const key = `${archetype}|${seed}|${size}|${species}`;
  const useCache = Object.keys(opts).length === 0;
  const hit = useCache ? cache.get(key) : undefined;
  if (hit) return hit;
  const params = { ...defaultWorldParams(species, seed, 'naturalist', size), archetype };
  const r = generateWorldReport(params, opts);
  if (useCache) cache.set(key, r);
  return r;
}

export function paramsFor(archetype: ArchetypeId, seed = 1, size: WorldSizeId = 'standard', species: SpeciesId = 'lasius-niger') {
  return { ...defaultWorldParams(species, seed, 'naturalist', size), archetype };
}
