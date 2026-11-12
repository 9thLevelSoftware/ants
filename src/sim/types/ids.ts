// Canonical identifier sets (docs/02-design-directions.md §J) plus the additions named in the GDD digests.
// Every set is a string-literal union with an iterable `as const` array of the same name in UPPER_CASE.
// Additive evolution only: append new members, never rename or remove (saves store these strings).
// The topic-specific sets live in ./ids/*.ts and are re-exported here; import everything from '@/sim/types'.

import { MATERIAL_IDS, type MaterialId } from './geom';
import type { RivalSpeciesId } from './ids/ecology';
import { CODEX_IDS } from './ids/progression';

export * from './ids/ants';
export * from './ids/nest';
export * from './ids/world';
export * from './ids/ecology';
export * from './ids/progression';
export * from './ids/species';

/** Playable species (directions §J). Rival-only species are in ids/ecology.ts (`RIVAL_SPECIES_IDS`). */
export const SPECIES_IDS = ['lasius-niger', 'camponotus-pennsylvanicus', 'messor-barbarus', 'atta-texana'] as const;
export type SpeciesId = (typeof SPECIES_IDS)[number];
/** Any species a colony can belong to (player-playable or rival-only). */
export type ColonySpeciesId = SpeciesId | RivalSpeciesId;

export const CASTES = ['queen', 'gyne', 'male', 'worker', 'minor', 'media', 'major'] as const;
export type Caste = (typeof CASTES)[number];

export const BROOD_STAGES = ['egg', 'larva', 'pupa'] as const;
export type BroodStage = (typeof BROOD_STAGES)[number];

/** Tasks. Order is the index used by per-task typed arrays (thresholds, allocation demand/target/actual). */
export const TASKS = [
  'idle', 'rest', 'nurse', 'queen-care', 'scout', 'forage', 'tend', 'store', 'dig', 'haul',
  'guard', 'patrol', 'fight', 'flee', 'garden', 'cut', 'mill',
  'raid', // GDD 05 (rival and player raids)
] as const;
export type Task = (typeof TASKS)[number];
/** Length of every per-task typed array (thresholds, allocation demand/target/actual): 17 J tasks + `raid`. */
export const TASK_COUNT = TASKS.length;

/** Index of a task in TASKS (for typed arrays indexed by task). */
export function taskIndex(t: Task): number {
  return TASKS.indexOf(t);
}

export const CHAMBER_TYPES = ['founding', 'royal', 'nursery', 'food', 'granary', 'fungus', 'midden', 'rest', 'general'] as const;
export type ChamberType = (typeof CHAMBER_TYPES)[number];

export const ZONE_TYPES = ['forest', 'lawn', 'garden-bed', 'pavement', 'asphalt', 'sand', 'rubber', 'interior'] as const;
export type ZoneType = (typeof ZONE_TYPES)[number];

/** Materials: the canonical list lives in geom.ts (its order is the byte-map code). */
export const MATERIALS = MATERIAL_IDS;
export type Material = MaterialId;

export const FOOD_KINDS = [
  'honeydew', 'nectar', 'fruit', 'carrion', 'prey', 'seed', 'crumb', 'sugar', 'pet-food', 'bait', 'leaf', 'dew',
] as const;
export type FoodKind = (typeof FOOD_KINDS)[number];

export const CREATURE_KINDS = [
  'aphid', 'ladybird', 'ladybird-larva', 'lacewing-larva', 'springtail', 'mite', 'fly-larva', 'caterpillar',
  'fruit-fly', 'woodlouse', 'earthworm', 'snail', 'millipede', 'jumping-spider', 'wolf-spider', 'ant-spider',
  'antlion', 'centipede', 'rove-beetle', 'phorid-fly', 'bird',
] as const;
export type CreatureKind = (typeof CREATURE_KINDS)[number];

export const WEATHER_STATES = ['clear', 'overcast', 'rain', 'storm', 'heat', 'frost'] as const;
export type WeatherState = (typeof WEATHER_STATES)[number];

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;
export type Season = (typeof SEASONS)[number];

/** Allowed custom season lengths in game days (directions §K, registry B6 `seasonLengthDays`). */
export const SEASON_LENGTHS = [5, 7, 10] as const;
export type SeasonLengthDays = (typeof SEASON_LENGTHS)[number];

export const MARKER_KINDS = [
  'dig', 'forage', 'avoid', 'rally', 'entrance', 'move-brood', 'move-queen',
  'satellite', // GDD 07 (Camponotus satellite nests)
] as const;
export type MarkerKind = (typeof MARKER_KINDS)[number];

export const PHERO_CHANNELS = ['trail', 'home', 'alarm'] as const;
export type PheroChannel = (typeof PHERO_CHANNELS)[number];

export const HUMAN_EVENT_KINDS = [
  'footsteps', 'mowing', 'sweeping', 'vacuum', 'food-drop', 'spill', 'watering', 'car', 'children', 'bait-station',
] as const;
export type HumanEventKind = (typeof HUMAN_EVENT_KINDS)[number];

export const DIFFICULTY_IDS = ['gentle', 'naturalist', 'harsh'] as const;
export type DifficultyId = (typeof DIFFICULTY_IDS)[number];

/** Every concrete codex id: the fixed entries plus the species, material and habitat families (registry B6). */
export function allCodexIds(): string[] {
  return [
    ...CODEX_IDS,
    ...SPECIES_IDS.map((id) => `cx-species-${id}`),
    ...MATERIALS.map((m) => `cx-material-${m}`),
    ...ZONE_TYPES.map((z) => `cx-habitat-${z}`),
  ];
}

/** True if `v` is a member of the const array `set` (narrows the type). */
export function isOneOf<T extends string>(set: readonly T[], v: string): v is T {
  return (set as readonly string[]).includes(v);
}
