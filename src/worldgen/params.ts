// World generation parameters (GDD 04 App. A `WorldParams`). The worldgen tasks extend this file.

import type { DifficultyId, SpeciesId, WorldParams, WorldSizeId } from '@/sim/types';
import { WORLD_SIZE_BU } from '@/sim/balance';

/** Bumped whenever the generator's output for the same params changes (saves record it). */
export const GENERATOR_VERSION = 1;
/** Generator versions whose worlds can still be regenerated for old saves. */
export const SUPPORTED_GENERATOR_VERSIONS: readonly number[] = [1];

/** Default region per species (GDD 04 §1). */
const SPECIES_REGION: Record<SpeciesId, WorldParams['region']> = {
  'lasius-niger': 'temperate-eu', 'camponotus-pennsylvanicus': 'ne-america',
  'messor-barbarus': 'mediterranean', 'atta-texana': 'southern-us',
};

/** Rival colonies per difficulty (GDD 04 §12, GDD 05 §5). */
const RIVALS_BY_DIFFICULTY: Record<DifficultyId, number> = { gentle: 2, naturalist: 3, harsh: 4 };
const INCIPIENT_BY_DIFFICULTY: Record<DifficultyId, number> = { gentle: 0, naturalist: 1, harsh: 2 };

export function defaultWorldParams(
  species: SpeciesId, seed: number, difficulty: DifficultyId = 'naturalist', sizeClass: WorldSizeId = 'standard',
): WorldParams {
  return {
    generatorVersion: GENERATOR_VERSION, seedText: '', seed: seed >>> 0, speciesId: species,
    archetype: 'suburban-garden', region: SPECIES_REGION[species], sizeClass, difficulty,
    rivalCount: RIVALS_BY_DIFFICULTY[difficulty], incipientCount: INCIPIENT_BY_DIFFICULTY[difficulty],
    humanActivity: 'normal',
  };
}

/** World edge length, mm, for params and a body unit. */
export function worldSizeMm(params: WorldParams, buMm: number): number {
  return WORLD_SIZE_BU[params.sizeClass] * buMm;
}
