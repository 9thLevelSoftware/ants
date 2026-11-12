// Identifier sets for species data, economy modules and their directives (GDD 07 A.0, GDD 02 §12).

export const ECONOMY_MODULES = ['honeydew-ranching', 'wood-nesting', 'granary', 'fungus-garden'] as const;
export type EconomyModuleId = (typeof ECONOMY_MODULES)[number];

export const FOUNDING_MODES = ['claustral', 'claustral-wood', 'claustral-fungus'] as const;
export type FoundingMode = (typeof FOUNDING_MODES)[number];

/** Individual size classes (GDD 07 A.0; not the map size classes, which are WORLD_SIZES). */
export const ANT_SIZE_CLASSES = ['nanitic', 'small-media'] as const;
export type AntSizeClass = (typeof ANT_SIZE_CLASSES)[number];

export const SEED_CLASSES = ['S', 'M', 'L'] as const;
export type SeedClass = (typeof SEED_CLASSES)[number];

export const SEED_COHORT_STATES = ['stored', 'damp', 'germinating', 'sprouted', 'rotting', 'rotten', 'milled'] as const;
export type SeedCohortState = (typeof SEED_COHORT_STATES)[number];

export const GARDEN_STATES = ['seeded', 'establishing', 'healthy', 'stressed', 'infected', 'collapsing', 'dead'] as const;
export type GardenState = (typeof GARDEN_STATES)[number];

/** Task subtypes `<task>:<subtype>` (GDD 07 A.0). */
export const TASK_SUBTYPES = [
  'tend:relay', 'tend:relocate-aphid', 'nurse:shuttle', 'haul:frass', 'haul:garden-waste', 'store:granary-care',
  'garden:process', 'garden:plant', 'garden:tend-fungus', 'garden:weed', 'guard:hitchhike',
] as const;
export type TaskSubtype = (typeof TASK_SUBTYPES)[number];

export const NEST_SITE_ROLES = ['parent', 'satellite'] as const;
export type NestSiteRole = (typeof NEST_SITE_ROLES)[number];
export const NEST_SITE_STATES = ['candidate', 'founding', 'active', 'isolated', 'abandoned'] as const;
export type NestSiteState = (typeof NEST_SITE_STATES)[number];

export const WOOD_PLACEMENTS = [
  'buried-log', 'log-on-soil', 'stump', 'standing-dead', 'living-tree-wound', 'firewood', 'fence-post',
  'structural-dry', 'structural-leak', 'window-sill', 'door-frame-ext',
] as const;
export type WoodPlacement = (typeof WOOD_PLACEMENTS)[number];

/** Directive values (GDD 02 §12). Production is the `alateInvestment` number (the UI presets send 0 / 0.5 / 1). */
export const STOCK_TARGETS = ['low', 'normal', 'high'] as const;
export type StockTarget = (typeof STOCK_TARGETS)[number];

/** Species-specific directive keys (GDD 07 §3.14). */
export const DIRECTIVE_EXTRAS = [
  'casteEmphasis', 'granaryHygiene', 'leafSelectivity', 'satelliteAuto', 'hideFrass', 'hitchhikerEscort', 'externalHeap',
] as const;
export type DirectiveExtra = (typeof DIRECTIVE_EXTRAS)[number];

export const SUBFAMILIES = ['formicinae', 'myrmicinae'] as const;
export type Subfamily = (typeof SUBFAMILIES)[number];

export const LARVA_FOODS = ['trophallaxis+solid', 'seed-paste+solid', 'staphylae'] as const;
export type LarvaFood = (typeof LARVA_FOODS)[number];

/** Where an accepted food goes (GDD 07 §3.7). */
export const FOOD_ROUTES = ['crop-c', 'crop-cp', 'solid-p', 'solid-cp', 'granary', 'substrate', 'water', 'refuse'] as const;
export type FoodRoute = (typeof FOOD_ROUTES)[number];

export const MOUND_STYLES = ['crater', 'soft-mound', 'none'] as const;
export type MoundStyle = (typeof MOUND_STYLES)[number];

export const MIDDEN_STYLES = ['surface-pile', 'entrance-midden', 'frass-pile', 'detritus-chamber+heap'] as const;
export type MiddenStyle = (typeof MIDDEN_STYLES)[number];

export const ALARM_MODES = ['pheromone', 'drumming', 'stridulation'] as const;
export type AlarmMode = (typeof ALARM_MODES)[number];

export const SPECIES_TIERS = ['T1', 'T2', 'T3'] as const;
export type SpeciesTier = (typeof SPECIES_TIERS)[number];

export const FLIGHT_SYNCHRONY = ['regional', 'individual'] as const;
export type FlightSynchrony = (typeof FLIGHT_SYNCHRONY)[number];

/** Lineage records' outcome for daughters (GDD 06 §12). */
export const DAUGHTER_STATES = ['available', 'founded', 'lost'] as const;
export type DaughterState = (typeof DAUGHTER_STATES)[number];
