// World generation parameters (GDD 04 §4.1, App. A `WorldParams`) and the grid dimensions they imply.

import type { ArchetypeId, ClimateId, DifficultyId, RegionId, SpeciesId, WorldParams, WorldSizeId } from '@/sim/types';
import { ARCHETYPES } from '@/sim/types';
import { DIFFICULTY_PARAMS, NAV_CELL_BU, presetHumanActivity, presetRivals, TERRAIN_CELL_BU, WORLD_SIZE_BU } from '@/sim/balance';
import { getSpecies } from '@/sim/species';
import { hash2u } from '@/core/math/noise';
import { ARCHETYPE_DEFS } from './tuning/archetypes';
import { SPECIES_BU_MM } from './tuning/pipeline';

/**
 * Bumped whenever the generator's output for the same params changes (saves record it).
 * 1 = the F1b placeholder; 2 = the zone/terrain/maps generator (worldgen-terrain).
 */
export const GENERATOR_VERSION = 2;
/** Generator versions whose worlds can still be regenerated for old saves. */
export const SUPPORTED_GENERATOR_VERSIONS: readonly number[] = [2];

/** Default region per species (GDD 04 §1). */
const SPECIES_REGION: Record<SpeciesId, WorldParams['region']> = {
  'lasius-niger': 'temperate-eu', 'camponotus-pennsylvanicus': 'ne-america',
  'messor-barbarus': 'mediterranean', 'atta-texana': 'southern-us',
};

/** Climate profile of a region (GDD 00-index B5: region -> chapter 06 climate). */
export const REGION_CLIMATE: Record<RegionId, ClimateId> = {
  'temperate-eu': 'temperate-maritime', 'ne-america': 'temperate-continental', mediterranean: 'mediterranean', 'southern-us': 'subtropical',
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

/** Body unit of the species, mm (species data, else the seed's standard-worker table). */
export function speciesBuMm(species: SpeciesId): number {
  return getSpecies(species)?.buMm ?? SPECIES_BU_MM[species];
}

/** World edge length, mm, for params and a body unit. */
export function worldSizeMm(params: WorldParams, buMm: number): number {
  return WORLD_SIZE_BU[params.sizeClass] * buMm;
}

/**
 * Seed from the text the player typed (GDD 04 §4.1): a plain decimal number below 2^32 is used as is,
 * anything else is FNV-1a 32 of its UTF-16 code units. '' gives 0.
 */
export function seedFromText(text: string): number {
  const t = text.trim();
  if (/^\d{1,10}$/.test(t) && Number(t) < 4294967296) return Number(t);
  let h = 0x811c9dc5;
  for (let i = 0; i < t.length; i++) {
    h ^= t.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** "Random" archetype for New Game: species-fit weights (0 excluded), Tier 1 only unless `allowT3`. */
export function pickArchetype(species: SpeciesId, seed: number, allowT3 = false): ArchetypeId {
  const pool = ARCHETYPES.filter((a) => ARCHETYPE_DEFS[a].fit[species] > 0 && (allowT3 || ARCHETYPE_DEFS[a].tier === 1));
  let total = 0;
  for (const a of pool) total += ARCHETYPE_DEFS[a].fit[species];
  let u = (hash2u(seed | 0, 0x5eed) / 4294967296) * total;
  for (const a of pool) {
    u -= ARCHETYPE_DEFS[a].fit[species];
    if (u < 0) return a;
  }
  return pool[pool.length - 1];
}

/** Grid dimensions of a world (GDD 04 §1.1). All lengths mm. */
export interface WorldDims {
  bu: number;
  /** Map side L. */
  size: number;
  /** Terrain cell (4 BU), cells per side, heightfield samples per side (cells + 1). */
  cell: number;
  cells: number;
  samples: number;
  /** Nav cell (16 BU) and cells per side (the last may be partial). */
  navCell: number;
  navN: number;
  /** Terrain cells per nav cell (4). */
  sub: number;
}

export function worldDims(params: WorldParams): WorldDims {
  const bu = speciesBuMm(params.speciesId);
  const size = worldSizeMm(params, bu);
  const cell = TERRAIN_CELL_BU * bu;
  const cells = Math.round(size / cell);
  const navCell = NAV_CELL_BU * bu;
  return {
    bu, size, cell, cells, samples: cells + 1, navCell, navN: Math.ceil(size / navCell - 1e-9),
    sub: Math.round(NAV_CELL_BU / TERRAIN_CELL_BU),
  };
}

/** Throws on params the generator cannot honour. */
export function checkParams(params: WorldParams): void {
  if (!SUPPORTED_GENERATOR_VERSIONS.includes(params.generatorVersion)) {
    throw new Error(`worldgen: generator version ${params.generatorVersion} is not supported (have ${SUPPORTED_GENERATOR_VERSIONS.join(', ')})`);
  }
  if (!ARCHETYPE_DEFS[params.archetype]) throw new Error(`worldgen: unknown archetype ${params.archetype}`);
  if (!WORLD_SIZE_BU[params.sizeClass]) throw new Error(`worldgen: unknown size class ${params.sizeClass}`);
}
