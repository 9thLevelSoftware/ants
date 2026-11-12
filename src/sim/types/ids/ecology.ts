// Identifier sets for items, food, creatures, rivals and combat (GDD 02, 05, 07).

/** Items (loose or stored things). Brood is never an item (own entity). See contracts map for the reconciliation. */
export const ITEM_KINDS = [
  'soil-pellet', 'frass', 'chaff', 'pebble', 'food-piece', 'seed', 'seed-paste', 'leaf-fragment', 'leaf-pulp',
  'staphylae', 'fungus-piece', 'garden-waste', 'waste', 'corpse', 'carcass', 'live-aphid',
] as const;
export type ItemKind = (typeof ITEM_KINDS)[number];

export const WASTE_KINDS = ['meconium', 'cocoon', 'spoiled-food', 'brood-corpse'] as const;
export type WasteKind = (typeof WASTE_KINDS)[number];

/** Food variants (GDD 05 §1.2). A source/item has a FoodKind and optionally one of these. */
export const FOOD_VARIANTS = [
  'aphid-herd', 'honeydew-film', 'scale-herd', 'flower', 'extrafloral-nectary', 'berry', 'windfall',
  'insect-small', 'insect-medium', 'insect-large', 'large-carcass', 'elaiosome-seed', 'grass-seed', 'crumb-starch',
  'crumb-fatty', 'crumb-protein', 'crust', 'sugar-granules', 'sugary-spill', 'sticky-residue', 'kibble',
  'wet-pet-food', 'bait-gel', 'dew', 'water',
] as const;
export type FoodVariant = (typeof FOOD_VARIANTS)[number];

export const CARRION_STAGES = ['fresh', 'ripe', 'putrid', 'husk'] as const;
export type CarrionStage = (typeof CARRION_STAGES)[number];

export const HOST_CLASSES = ['herb', 'shrub', 'tree'] as const;
export type HostClass = (typeof HOST_CLASSES)[number];

/** Herd kinds (GDD 07 A.0). */
export const HERD_KINDS = ['aphid', 'scale', 'root'] as const;
export type HerdKind = (typeof HERD_KINDS)[number];

export const CREATURE_VARIANTS = ['small', 'medium', 'hairy', 'thrush', 'sparrow', 'woodpecker'] as const;
export type CreatureVariant = (typeof CREATURE_VARIANTS)[number];

export const HAZARD_KINDS = ['antlion-pit', 'spill-pool', 'slime-trail'] as const;
export type HazardKind = (typeof HAZARD_KINDS)[number];

/** Species that appear only as rival colonies (GDD 05 §3.1). */
export const RIVAL_SPECIES_IDS = [
  'tetramorium-immigrans', 'myrmica-rubra', 'formica-rufa', 'solenopsis-fugax', 'lasius-flavus',
  'formica-subsericea', 'tapinoma-sessile', 'linepithema-humile', 'tapinoma-nigerrimum', 'pheidole-pallidula',
  'solenopsis-invicta', 'solenopsis-molesta',
] as const;
export type RivalSpeciesId = (typeof RIVAL_SPECIES_IDS)[number];

/**
 * Behaviour profile of a rival-only species (GDD 05 §3.1 notes column): how its fielded agents and abstract model
 * behave. Interpreted by the rivals module.
 */
export const RIVAL_PROFILES = [
  'generalist', 'mass-grappler', 'aggressive-stinger', 'predatory-raider', 'thief', 'subterranean', 'repellent',
  'supercolony', 'dimorphic',
] as const;
export type RivalProfile = (typeof RIVAL_PROFILES)[number];

/** Nest layouts worldgen carves for rival colonies (GDD 05 §3.4). */
export const RIVAL_NEST_TEMPLATES = ['soil-galleries', 'under-stone', 'thatch-mound', 'turf-mound', 'pavement-joint'] as const;
export type RivalNestTemplate = (typeof RIVAL_NEST_TEMPLATES)[number];

export const RELATION_STATES = ['peace', 'tension', 'skirmish', 'war', 'truce'] as const;
export type RelationState = (typeof RELATION_STATES)[number];

/** Rally marker modes (GDD 05 replaces the provisional "Gather"). */
export const RALLY_MODES = ['defend', 'attack'] as const;
export type RallyMode = (typeof RALLY_MODES)[number];

/** Colony combat stance directive (GDD 05 §4.9). */
export const STANCES = ['cautious', 'defensive', 'aggressive'] as const;
export type Stance = (typeof STANCES)[number];

/** Combat damage kinds in `combat-hit`. */
export const HIT_KINDS = ['bite', 'sting', 'acid', 'predator'] as const;
export type HitKind = (typeof HIT_KINDS)[number];

/** Outcome of a rival encounter. */
export const ENCOUNTER_OUTCOMES = ['fight', 'display', 'withdraw'] as const;
export type EncounterOutcome = (typeof ENCOUNTER_OUTCOMES)[number];

/** Weapons a species may have (GDD 07 §3.11). */
export const WEAPONS = ['bite', 'bite-hold', 'spray-acid', 'sting'] as const;
export type Weapon = (typeof WEAPONS)[number];
