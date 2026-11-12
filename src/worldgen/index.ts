// World generator entry point. PLACEHOLDER written by F1b with the final signature: gentle noise terrain,
// uniform loam layers, no primitives, queen start in the middle. Replaced by worldgen-terrain (and the
// worldgen-outdoor / -interior / -life tasks).

import { fbm2 } from '@/core/math/noise';
import type { WorldData, WorldParams } from '@/sim/types';
import { PLACEHOLDER_TERRAIN_AMP_BU, PLACEHOLDER_TERRAIN_OCTAVES, PLACEHOLDER_TERRAIN_SCALE_BU } from '@/sim/balance';
import { requireSpecies } from '@/sim/species';
import { buildWorld } from '@/sim/testing/worldBuilder';
import { worldSizeMm } from './params';

export * from './params';

/** Deterministic: same params (and generator version) => identical WorldData. */
export function generateWorld(params: WorldParams): WorldData {
  const bu = requireSpecies(params.speciesId).buMm;
  const amp = PLACEHOLDER_TERRAIN_AMP_BU * bu;
  const inv = 1 / (PLACEHOLDER_TERRAIN_SCALE_BU * bu);
  return buildWorld({
    params, size: worldSizeMm(params, bu), bu,
    height: (x, z) => fbm2(x * inv, z * inv, params.seed, PLACEHOLDER_TERRAIN_OCTAVES) * amp,
  });
}
