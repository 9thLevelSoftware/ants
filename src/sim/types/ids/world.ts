// Identifier sets for the world, its generation and human activity (GDD 04 §0-15).

export const ARCHETYPES = [
  'woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door', 'field-margin',
] as const;
export type ArchetypeId = (typeof ARCHETYPES)[number];

/** Biogeographic regions (GDD 04 names; GDD 05's `temperate-europe`/`south-us` map to these). */
export const REGIONS = ['temperate-eu', 'ne-america', 'mediterranean', 'southern-us'] as const;
export type RegionId = (typeof REGIONS)[number];

/** Map size classes (GDD 04 "size classes"; edge 3000 / 4000 / 5000 BU). */
export const WORLD_SIZES = ['compact', 'standard', 'large'] as const;
export type WorldSizeId = (typeof WORLD_SIZES)[number];

export const ZONE_VARIANTS = [
  'deciduous', 'pine-hardwood', 'mown', 'rough', 'flower', 'vegetable', 'shrub', 'fallow', 'patio', 'path',
  'sidewalk', 'car-park', 'driveway', 'lane', 'sand-pit', 'gravel', 'poured', 'tile', 'kitchen', 'sealed',
] as const;
export type ZoneVariant = (typeof ZONE_VARIANTS)[number];

export const FOOTSTEP_CLASSES = [
  'soft-soil', 'grit', 'litter', 'hard', 'wood', 'plant', 'metal', 'plastic', 'muffled', 'food', 'wet',
] as const;
export type FootstepClass = (typeof FOOTSTEP_CLASSES)[number];

export const MICRO_KINDS = [
  'paving-joint', 'expansion-gap', 'asphalt-crack', 'door-crack', 'kerb-gap', 'fence-gap', 'pipe-penetration',
  'drain-grille', 'root-channel', 'kick-space', 'skirting-gap', 'weep-vent', 'wall-crevice', 'sleeve-gap',
  'mat-seam', 'window-sill-gap',
] as const;
export type MicroKind = (typeof MICRO_KINDS)[number];

/** Pre-existing cavities written to the carve grid (GDD 04 §7 names; GDD 03 aliases mapped in the contracts map). */
export const CAVITY_KINDS = [
  'under-stone', 'under-slab', 'kerb-void', 'crack-slot', 'pipe-tube', 'subfloor-void', 'root-gallery',
  'log-gallery', 'compost-void', 'worm-burrow', 'rival-nest', 'abandoned-burrow',
] as const;
export type CavityKind = (typeof CAVITY_KINDS)[number];

export const POI_KINDS = [
  'food-spot', 'aphid-site', 'nectar-site', 'seed-site', 'water-spot', 'bin-gap', 'vantage', 'shelter', 'nest-site',
] as const;
export type PoiKind = (typeof POI_KINDS)[number];

export const CLIMB_ROUTE_KINDS = [
  'trunk-to-branch', 'stem', 'log-over', 'stump-top', 'wall-face', 'fence-rail', 'leg-to-top', 'leg-to-seat',
  'cabinet-to-counter', 'bin-to-rim', 'bowl-to-rim', 'ladder-to-platform', 'chute', 'post-to-top', 'pot-to-soil',
  'side-to-tap', 'tyre-to-arch',
] as const;
export type ClimbRouteKind = (typeof CLIMB_ROUTE_KINDS)[number];

/** Coarse nav-grid cell classes (GDD 04 §11). Byte value = index. */
export const NAV_CLASSES = ['open', 'blocked-solid', 'step', 'water-body', 'hole', 'edge'] as const;
export type NavClass = (typeof NAV_CLASSES)[number];

export const WATER_BODY_KINDS = ['puddle', 'bowl-water', 'gully-water', 'wet-patch'] as const;
export type WaterBodyKind = (typeof WATER_BODY_KINDS)[number];

export const DECOR_LAYERS = [
  'decor-grass', 'decor-grass-tuft', 'decor-leaf', 'decor-needle', 'decor-petal', 'decor-litter', 'decor-grit',
  'decor-clippings', 'decor-mulch-fine', 'decor-pebble-fine', 'decor-moss-lichen',
] as const;
export type DecorLayer = (typeof DECOR_LAYERS)[number];

export const WORLDGEN_CHECKS = [
  'v-found', 'v-connect', 'v-food', 'v-micro', 'v-rivals', 'v-rest', 'v-budget', 'v-start', 'v-lanes', 'v-enclose',
] as const;
export type WorldgenCheck = (typeof WORLDGEN_CHECKS)[number];

/** Variants of human events (registry B5), one flat set across kinds. */
export const HUMAN_VARIANTS = [
  'adult', 'child', 'paw', 'motor', 'reel', 'broom', 'wipe', 'blower', 'crumb-fall', 'pet-feed',
  'litter-drop', 'sweets', 'sugary', 'water', 'oil', 'sprinkler', 'hose', 'can', 'arrive', 'depart',
  'play-session', 'station', 'gel',
] as const;
export type HumanVariant = (typeof HUMAN_VARIANTS)[number];

/** Telegraph cue kinds an ant can sense before a human impact (GDD 04 §15.3). */
export const HUMAN_CUE_KINDS = ['tremor', 'shadow', 'sound', 'airflow', 'spray'] as const;
export type HumanCueKind = (typeof HUMAN_CUE_KINDS)[number];

export const AMBIENT_STATES = ['door-open', 'lights-on'] as const;
export type AmbientState = (typeof AMBIENT_STATES)[number];

/** Nesting suitability classes and factors (GDD 04 §12). */
export const SUITABILITY_CLASSES = ['good', 'fair', 'poor'] as const;
export type SuitabilityClass = (typeof SUITABILITY_CLASSES)[number];
export const SUITABILITY_FACTORS = ['fDig', 'fCover', 'fWarm', 'fMoist', 'fFlood', 'fQuiet', 'fRival', 'fSpecial'] as const;
export type SuitabilityFactor = (typeof SUITABILITY_FACTORS)[number];

/** Plant host flags (GDD 04 §8); bit = index. */
export const HOST_FLAGS = ['aphid', 'efn', 'nectar', 'elaiosome', 'seed', 'scale'] as const;
export type HostFlag = (typeof HOST_FLAGS)[number];
