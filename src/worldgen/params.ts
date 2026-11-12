// World generation parameters (GDD 04 App. A `WorldParams`). The worldgen tasks extend this file.

import type { DifficultyId, SpeciesId, WorldParams, WorldSizeId } from '@/sim/types';
import { DIFFICULTY_PARAMS, presetHumanActivity, presetRivals, WORLD_SIZE_BU } from '@/sim/balance';

/** Bumped whenever the generator's output for the same params changes (saves record it). */
export const GENERATOR_VERSION = 1;
/** Generator versions whose worlds can still be regenerated for old saves. */
export const SUPPORTED_GENERATOR_VERSIONS: readonly number[] = [1];

/** Default region per species (GDD 04 §1). */
const SPECIES_REGION: Record<SpeciesId, WorldParams['region']> = {
  'lasius-niger': 'temperate-eu', 'camponotus-pennsylvanicus': 'ne-america',
  'messor-barbarus': 'mediterranean', 'atta-texana': 'southern-us',
};

/** Rule values the generator reads; by default those of the difficulty preset (balance/difficulty.ts). */
export type WorldRuleInputs = Pick<WorldParams, 'rivalCount' | 'incipientCount' | 'humanActivity'>;

/**
 * World params for a species, seed and preset. `rules` overrides the preset's rival count, incipient count and
 * human activity (the New Game custom rules: pass `worldRuleInputs(config)` from createGame).
 */
export function defaultWorldParams(
  species: SpeciesId, seed: number, difficulty: DifficultyId = 'naturalist', sizeClass: WorldSizeId = 'standard',
  rules: Partial<WorldRuleInputs> = {},
): WorldParams {
  return {
    generatorVersion: GENERATOR_VERSION, seedText: '', seed: seed >>> 0, speciesId: species,
    archetype: 'suburban-garden', region: SPECIES_REGION[species], sizeClass, difficulty,
    rivalCount: rules.rivalCount ?? presetRivals(difficulty),
    incipientCount: rules.incipientCount ?? DIFFICULTY_PARAMS[difficulty].incipientRivals,
    humanActivity: rules.humanActivity ?? presetHumanActivity(difficulty),
  };
}

/** World edge length, mm, for params and a body unit. */
export function worldSizeMm(params: WorldParams, buMm: number): number {
  return WORLD_SIZE_BU[params.sizeClass] * buMm;
}
