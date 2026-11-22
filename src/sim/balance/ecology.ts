// Ecology balance (GDD 05). Sections are owned by different tasks: keep each inside its own block.
// Re-exported from balance/index.ts (Stage 1A gate).

import type { CarrionStage, DifficultyId, FoodKind, FoodVariant, ItemKind, Season, ZoneType } from '@/sim/types';

// =====================================================================================================
// ---- sources (owner: sources-core; GDD 05 §0, §1.1-§1.3, §1.6-§1.9; registry C4, C13) ----
// =====================================================================================================

/**
 * Which tier's rules new sources follow (GDD 05 §0 tier map). Tier 1: static honeydew-film sites, T1 carrion
 * multiplier, no carrion stages, flowers always open. Raise to 2 when the Tier 2 ecology lands.
 */
export const ECOLOGY_TIER: 1 | 2 = 2;

/**
 * Age (gd) at which carrion without a stage clock (all carrion at T1) is removed. GDD 05 §1.2 writes the T1 age
 * only on the insect-small row ("T1: no decay, removed after 3 gd"); T1 drops the stages of every carrion row, so
 * the same age applies to all of them (decision, sources-core review: otherwise T1 carcasses never leave).
 */
export const T1_CARRION_REMOVE_GD = 3;

/** How a source is harvested (GDD 05 §1.1): drunk, picked up as whole units, or torn into carryCap pieces. */
export type SourceForm = 'liquid' | 'pick' | 'tear';

/** One row of the GDD 05 §1.2 catalogue. Amounts in reference loads (Lasius), per unit; liquids per load. */
export interface SourceDef {
  variant: FoodVariant;
  kind: FoodKind;
  tier: 1 | 2 | 3;
  form: SourceForm;
  /** Item a whole unit or a torn piece becomes. */
  item: ItemKind;
  /** Nutrients per unit (per load for liquids), loads. Water per load for water sources. */
  c: number;
  p: number;
  toxin: number;
  water: number;
  /** Bulk of one unit, loads of carry capacity (liquids: 1 = one load). */
  unitBulk: number;
  /** Length of one unit, mm (item size; cooperative-transport H rule). */
  unitMm: number;
  /** Units (liquids: loads) per node at creation, [min, max]. */
  units: [number, number];
  /** Pool cap of a renewable liquid, loads; 0 = not a pool. */
  poolCap: number;
  /** Refill per game day, loads (pools). */
  refillPerGd: number;
  /** Refill only between sunrise and sunset; the daily amount is spread over the daylight hours. */
  refillDaylightOnly: boolean;
  /** Liquid half-life, game days; 0 = none. */
  halfLifeGd: number;
  /** Removed this long after it appeared, game days; 0 = never. */
  lifetimeGd: number;
  /** Simultaneous feeding slots, [min, max] (rolled at creation). */
  slots: [number, number];
  /** Multiplies the harvest-liquid rate. */
  drinkRateMult: number;
  /** Multiplies TEAR_S. */
  hardness: number;
  /** Odour radius of a node, BU; and of a single unit when it differs (crumbs), 0 = same. */
  odourBu: number;
  odourSingleBu: number;
  quality: number;
  /** Active window in default-year days (doy28, inclusive), null = all year. */
  window: [number, number] | null;
  /** Renewable nodes stay when empty (pools, bowls); others are removed when depleted. */
  renewable: boolean;
  /** Decays through the carrion stages at Tier 2 (§1.6). */
  carrion: boolean;
  /** Radius of the node's footprint, BU (reach and slot queries; an estimate where GDD 05 gives no size). */
  footprintBu: number;
  /** Tier-1 overrides (GDD 05 §0). */
  t1?: Partial<Omit<SourceDef, 'variant' | 'kind' | 't1'>>;
}

type Row = Omit<SourceDef, 'toxin' | 'water' | 'refillDaylightOnly' | 'halfLifeGd' | 'lifetimeGd' | 'drinkRateMult'
  | 'hardness' | 'odourSingleBu' | 'window' | 'renewable' | 'carrion' | 'poolCap' | 'refillPerGd'> & Partial<SourceDef>;

function def(r: Row): SourceDef {
  return {
    toxin: 0, water: 0, poolCap: 0, refillPerGd: 0, refillDaylightOnly: false, halfLifeGd: 0, lifetimeGd: 0,
    drinkRateMult: 1, hardness: 1, odourSingleBu: 0, window: null, renewable: false, carrion: false, ...r,
  };
}

/** "Unlimited while present" water: a large renewable pool, loads. */
export const WATER_POOL_LOADS = 1000;

/** GDD 02 §4 default feeding slots where GDD 05 gives none. */
const DEFAULT_SLOTS: [number, number] = [8, 8];

/** The GDD 05 §1.2 catalogue, every variant. Comments name values that are estimates (no number in the GDD). */
export const SOURCE_CATALOGUE: Record<FoodVariant, SourceDef> = {
  // Honeydew. Herds are driven by the plants module (pool cap 1 + 0.02 A, tend slots 2 + floor(A/25)).
  'aphid-herd': def({
    variant: 'aphid-herd', kind: 'honeydew', tier: 2, form: 'liquid', item: 'food-piece', c: 1.0, p: 0.02,
    unitBulk: 1, unitMm: 0, units: [0, 0], poolCap: 1, slots: [2, 2], odourBu: 6, quality: 1.0, window: [1, 21],
    renewable: true, footprintBu: 3,
  }),
  // T2: fed by herd overflow, half-life 0.3 gd. T1: static site, cap 0.5, refill 1.0 C/gd, no decay (§0, E-109).
  'honeydew-film': def({
    variant: 'honeydew-film', kind: 'honeydew', tier: 2, form: 'liquid', item: 'food-piece', c: 1.0, p: 0,
    unitBulk: 1, unitMm: 0, units: [0, 0], poolCap: 0.5, halfLifeGd: 0.3, slots: DEFAULT_SLOTS,
    drinkRateMult: 0.25, odourBu: 12, quality: 0.6, renewable: true, footprintBu: 6,
    t1: { tier: 1, units: [0.5, 0.5], refillPerGd: 1.0, halfLifeGd: 0 },
  }),
  'scale-herd': def({
    variant: 'scale-herd', kind: 'honeydew', tier: 3, form: 'liquid', item: 'food-piece', c: 1.0, p: 0.02,
    unitBulk: 1, unitMm: 0, units: [0, 0], poolCap: 2, slots: [2, 2], odourBu: 6, quality: 0.9, window: [1, 21],
    renewable: true, footprintBu: 3,
  }),
  // Nectar. T2 flying-insect drain and the day-10 EFN decline are the plants module's.
  flower: def({
    variant: 'flower', kind: 'nectar', tier: 1, form: 'liquid', item: 'food-piece', c: 1.0, p: 0, unitBulk: 1,
    unitMm: 0, units: [1.5, 1.5], poolCap: 1.5, refillPerGd: 4, refillDaylightOnly: true, slots: [2, 2], odourBu: 10,
    quality: 0.8, window: [3, 18], renewable: true, footprintBu: 2, t1: { window: null },
  }),
  // 2 slots per petiole, 2-4 petioles.
  'extrafloral-nectary': def({
    variant: 'extrafloral-nectary', kind: 'nectar', tier: 2, form: 'liquid', item: 'food-piece', c: 1.0, p: 0,
    unitBulk: 1, unitMm: 0, units: [0.8, 0.8], poolCap: 0.8, refillPerGd: 6, slots: [4, 8], odourBu: 6,
    quality: 0.9, window: [1, 20], renewable: true, footprintBu: 2,
  }),
  // Fruit.
  berry: def({
    variant: 'berry', kind: 'fruit', tier: 2, form: 'liquid', item: 'food-piece', c: 1.0, p: 0, unitBulk: 1,
    unitMm: 8, units: [3, 3], lifetimeGd: 2, slots: [3, 3], odourBu: 20, quality: 0.7, window: [9, 14],
    footprintBu: 1,
  }),
  // Juice reserve in `units` (plum 20 C; apple 60 C + 0.5 P: WINDFALL_FRUITS); stages in WINDFALL_STAGES.
  windfall: def({
    variant: 'windfall', kind: 'fruit', tier: 2, form: 'liquid', item: 'food-piece', c: 1.0, p: 0, unitBulk: 1,
    unitMm: 50, units: [20, 20], lifetimeGd: 6, slots: [2, 2], hardness: 0.5, odourBu: 40, quality: 0.7,
    window: [15, 20], footprintBu: 6,
  }),
  // Carrion. T1: no stages; removed after T1_CARRION_REMOVE_GD (§1.2 on insect-small; applied to all carrion).
  'insect-small': def({
    variant: 'insect-small', kind: 'carrion', tier: 1, form: 'pick', item: 'carcass', c: 0.02, p: 0.5,
    unitBulk: 0.5, unitMm: 2.5, units: [1, 1], slots: [1, 1], odourBu: 8, quality: 0.9, carrion: true,
    footprintBu: 0.5, t1: { lifetimeGd: T1_CARRION_REMOVE_GD },
  }),
  // Slots = H/2 tearers with H = round(3 l / L) = 7 for a 9 mm carcass and a 4 mm worker (§1.5).
  'insect-medium': def({
    variant: 'insect-medium', kind: 'carrion', tier: 1, form: 'tear', item: 'food-piece', c: 0.1, p: 4,
    unitBulk: 5, unitMm: 9, units: [1, 1], slots: [3, 3], hardness: 1.5, odourBu: 20, quality: 0.9, carrion: true,
    footprintBu: 1.5, t1: { lifetimeGd: T1_CARRION_REMOVE_GD },
  }),
  // R38 item 4 (GDD 05 §1.2 deviation): bulk 40 -> 20 so a torn piece carries CARRION_TEAR_P_PER_BULK_MIN P per load
  'insect-large': def({
    variant: 'insect-large', kind: 'carrion', tier: 2, form: 'tear', item: 'food-piece', c: 0.5, p: 15,
    unitBulk: 20, unitMm: 18, units: [1, 1], slots: [4, 4], hardness: 3.0, odourBu: 30, quality: 0.8, carrion: true,
    footprintBu: 3,
  }),
  // Default profile = earthworm; slug / vertebrate in LARGE_CARCASS_TYPES. Bulk = mass / REF_CARRY_MG, at most
  // P / CARRION_TEAR_P_PER_BULK_MIN (R38 item 4: the worm's 500 -> 160, so the catalogue density is the worm's).
  'large-carcass': def({
    variant: 'large-carcass', kind: 'carrion', tier: 2, form: 'tear', item: 'food-piece', c: 5, p: 120,
    unitBulk: 160, unitMm: 100, units: [1, 1], slots: [12, 12], hardness: 1.0, odourBu: 60, quality: 0.9,
    carrion: true, footprintBu: 12,
  }),
  // Seeds. Elaiosome seeds left more than 2 gd germinate (removed).
  'elaiosome-seed': def({
    variant: 'elaiosome-seed', kind: 'seed', tier: 2, form: 'pick', item: 'seed', c: 0.2, p: 0.3, unitBulk: 0.8,
    unitMm: 2.5, units: [10, 30], lifetimeGd: 2, slots: DEFAULT_SLOTS, odourBu: 6, quality: 1.0, window: [3, 9],
    footprintBu: 2,
  }),
  // Granary species only (GDD 07 granary module defines its value); Lasius ignores it (quality 0).
  'grass-seed': def({
    variant: 'grass-seed', kind: 'seed', tier: 3, form: 'pick', item: 'seed', c: 0, p: 0, unitBulk: 0.3,
    unitMm: 1.5, units: [0, 0], slots: DEFAULT_SLOTS, odourBu: 0, quality: 0, window: [10, 20], footprintBu: 3,
  }),
  // Crumbs. A cluster smells at 15 BU, a single crumb at 6 BU.
  'crumb-starch': def({
    variant: 'crumb-starch', kind: 'crumb', tier: 1, form: 'pick', item: 'food-piece', c: 0.7, p: 0.05,
    unitBulk: 0.6, unitMm: 2.5, units: [5, 40], slots: DEFAULT_SLOTS, odourBu: 15, odourSingleBu: 6, quality: 0.6,
    footprintBu: 3,
  }),
  'crumb-fatty': def({
    variant: 'crumb-fatty', kind: 'crumb', tier: 2, form: 'pick', item: 'food-piece', c: 0.8, p: 0.05,
    unitBulk: 0.6, unitMm: 2.5, units: [5, 30], slots: DEFAULT_SLOTS, odourBu: 15, quality: 0.9, footprintBu: 3,
  }),
  // T2 also spoils like carrion after 1.5 gd (CRUMB_PROTEIN_SPOIL_GD).
  'crumb-protein': def({
    variant: 'crumb-protein', kind: 'crumb', tier: 1, form: 'pick', item: 'food-piece', c: 0.2, p: 0.6,
    unitBulk: 0.6, unitMm: 2.5, units: [3, 15], slots: DEFAULT_SLOTS, odourBu: 15, quality: 0.9, footprintBu: 3,
  }),
  // Dries: hardness CRUST_DRY_HARDNESS after CRUST_DRY_GD.
  crust: def({
    variant: 'crust', kind: 'crumb', tier: 2, form: 'tear', item: 'food-piece', c: 20, p: 1.5, unitBulk: 30,
    unitMm: 25, units: [1, 1], slots: [8, 8], hardness: 1.0, odourBu: 25, quality: 0.6, footprintBu: 4,
  }),
  // Sugar.
  'sugar-granules': def({
    variant: 'sugar-granules', kind: 'sugar', tier: 1, form: 'pick', item: 'food-piece', c: 0.5, p: 0,
    unitBulk: 0.3, unitMm: 0.75, units: [50, 300], slots: DEFAULT_SLOTS, odourBu: 10, quality: 0.8, footprintBu: 4,
  }),
  // Size, amount and slots from SPILL_SIZES; half-lives SPILL_HALF_LIFE_GD; residue below SPILL_RESIDUE_FRACTION.
  'sugary-spill': def({
    variant: 'sugary-spill', kind: 'sugar', tier: 2, form: 'liquid', item: 'food-piece', c: 1.0, p: 0, unitBulk: 1,
    unitMm: 50, units: [40, 40], slots: [24, 24], odourBu: 30, quality: 0.9, footprintBu: 6, t1: { tier: 1 },
  }),
  // Quality not stated; kept at the spill's.
  'sticky-residue': def({
    variant: 'sticky-residue', kind: 'sugar', tier: 2, form: 'liquid', item: 'food-piece', c: 1.0, p: 0,
    unitBulk: 1, unitMm: 50, units: [0, 0], lifetimeGd: 2, slots: [24, 24], drinkRateMult: 0.33, odourBu: 30,
    quality: 0.9, footprintBu: 6,
  }),
  // Pet food. One unit = one kibble (300 mg = bulk 150); the bowl refills at PET_BOWL_REFILL_HOURS.
  kibble: def({
    variant: 'kibble', kind: 'pet-food', tier: 2, form: 'tear', item: 'food-piece', c: 2.5, p: 4, unitBulk: 150,
    unitMm: 10, units: [20, 40], slots: [6, 6], hardness: 2.0, odourBu: 40, quality: 0.8, renewable: true,
    footprintBu: 10,
  }),
  // Dries after WET_FOOD_DRY_GD into a tear source of hardness WET_FOOD_DRY_HARDNESS.
  'wet-pet-food': def({
    variant: 'wet-pet-food', kind: 'pet-food', tier: 2, form: 'liquid', item: 'food-piece', c: 0.2, p: 0.6,
    unitBulk: 1, unitMm: 0, units: [25, 25], slots: [8, 8], drinkRateMult: 0.5, odourBu: 50, quality: 0.9,
    footprintBu: 10,
  }),
  // 3 slots per port, 2-4 ports; lasts 6 gd.
  'bait-gel': def({
    variant: 'bait-gel', kind: 'bait', tier: 2, form: 'liquid', item: 'food-piece', c: 1.0, p: 0, toxin: 1.0,
    unitBulk: 1, unitMm: 0, units: [40, 40], lifetimeGd: 6, slots: [6, 12], odourBu: 60, quality: 1.2,
    footprintBu: 4,
  }),
  // Water. A droplet holds 0.2 load; a full crop takes 10 s (rate x2). Dew fields are the environment's.
  dew: def({
    variant: 'dew', kind: 'dew', tier: 2, form: 'liquid', item: 'food-piece', c: 0, p: 0, water: 1, unitBulk: 1,
    unitMm: 0, units: [0.2, 0.2], slots: [1, 1], drinkRateMult: 2, odourBu: 4, quality: 0.5, footprintBu: 0.5,
  }),
  // "Unlimited while present": a large renewable pool.
  water: def({
    variant: 'water', kind: 'dew', tier: 2, form: 'liquid', item: 'food-piece', c: 0, p: 0, water: 1, unitBulk: 1,
    unitMm: 0, units: [WATER_POOL_LOADS, WATER_POOL_LOADS], poolCap: WATER_POOL_LOADS,
    refillPerGd: WATER_POOL_LOADS, slots: DEFAULT_SLOTS, odourBu: 10, quality: 0.5, renewable: true,
    footprintBu: 10,
  }),
};

/** Variant used for a food anchor or command that names only a kind. */
export const DEFAULT_VARIANT_BY_KIND: Record<FoodKind, FoodVariant | null> = {
  honeydew: 'honeydew-film', nectar: 'flower', fruit: 'berry', carrion: 'insect-small', prey: null,
  seed: 'elaiosome-seed', crumb: 'crumb-starch', sugar: 'sugar-granules', 'pet-food': 'kibble', bait: 'bait-gel',
  leaf: null, dew: 'dew',
};

// ---- harvesting and perception ----

/** harvest-liquid rate, loads per game s, before drinkRateMult (GDD 01 / registry C4 DRINK_RATE). */
export const SOURCE_DRINK_RATE = 0.05;
/** Reference carry: bulk 1.0 = 2 mg of item (GDD 05 §0 REF_CARRY_MG). */
export const REF_CARRY_MG = 2.0;
/** Smell range of a source with odour 1, BU (GDD 02 SMELL_RANGE_FOOD = 12 BU x odourStrength). */
export const SOURCE_ODOUR_REF_BU = 12;
/** An ant harvests within the footprint plus this, BU. */
export const SOURCE_REACH_BU = 1.5;
/** Ants waiting for a slot stand within this of the footprint, BU (GDD 02 forage.queue <= 4 BU). */
export const SOURCE_QUEUE_RADIUS_BU = 4;
/** A tear leaving less bulk than this hands the rest over with the piece (GDD 05 §1.5 rule 6). */
export const FINAL_PIECE_MIN_BULK = 0.5;
/** Below this many loads a liquid counts as empty. */
export const LIQUID_EMPTY_EPS = 1e-6;
/** Cell of the derived source lookup grid, BU (X/Z buckets). */
export const SOURCE_GRID_CELL_BU = 32;
/** A source displaced by more than this when re-projected is removed (GDD 05 §1.9), BU. */
export const SOURCE_REPROJECT_MAX_BU = 4;

// ---- T1 crumb rule (GDD 05 §0, §1.2 crumbs) ----

/** Share of consumed T1 crumb clusters re-placed daily. */
export const CRUMB_REPLACE_FRACTION = 0.3;
/** Hour of the daily re-placement. */
export const CRUMB_REPLACE_HOUR = 12;
/** Most live crumb clusters on the map. */
export const CRUMB_CLUSTER_CAP = 60;
/** Every n-th crumb anchor without a variant hint is a protein cluster (1 protein per 3 starch). */
export const CRUMB_PROTEIN_EVERY = 4;
/** T2: crumb-protein spoils like carrion after this many gd. */
export const CRUMB_PROTEIN_SPOIL_GD = 1.5;

// ---- carrion drops (GDD 05 §1.3 runtime table; §0 T1 protein) ----

/** Variants dropped at runtime, in carrionAcc order (CARRION_VARIANTS = 4). */
export const CARRION_DROP_VARIANTS: readonly FoodVariant[] = ['insect-small', 'insect-medium', 'insect-large', 'large-carcass'];
/** Drops per plot (100 x 100 BU) per gd, in CARRION_DROP_VARIANTS order. */
export const CARRION_DROP_PER_PLOT_GD = [0.02, 0.004, 0.0006, 0.0002];
/** Tier at which each drop variant starts. */
export const CARRION_DROP_TIER = [1, 1, 2, 2];
/** T1 multiplier on insect-small and insect-medium drops. */
export const T1_CARRION_MULT = 4;
export const CARRION_SEASON_MULT: Record<Season, number> = { spring: 0.8, summer: 1.0, autumn: 0.7, winter: 0 };
export const CARRION_ZONE_MULT: Record<ZoneType, number> = {
  forest: 1.5, 'garden-bed': 1.2, lawn: 1.0, pavement: 0.6, asphalt: 0.5, sand: 0.4, rubber: 0.4, interior: 0.3,
};
/** Difficulty `carrionMult` (GDD 05 §5; not in DifficultyParams yet). */
export const CARRION_MULT: Record<DifficultyId, number> = { gentle: 1.3, naturalist: 1.0, harsh: 0.8 };
/** Drops land at least this far from any ant, BU (no pop-in). */
export const CARRION_DROP_MIN_ANT_BU = 20;
/** Tries to find a drop point in the zone before giving up for this hour. */
export const CARRION_DROP_TRIES = 8;
/** One plot, BU per side. */
export const PLOT_BU = 100;

// ---- carrion stages (GDD 05 §1.6, Tier 2) ----

export interface CarrionStageDef {
  stage: CarrionStage;
  /** Stage clock (gd) at which it begins. */
  fromGd: number;
  quality: number;
}
export const CARRION_STAGE_DEFS: readonly CarrionStageDef[] = [
  { stage: 'fresh', fromGd: 0, quality: 0.9 },
  { stage: 'ripe', fromGd: 0.5, quality: 0.6 },
  { stage: 'putrid', fromGd: 1.5, quality: 0.3 },
  { stage: 'husk', fromGd: 4, quality: 0 },
];
/** Husks are removed at this stage clock, gd. */
export const CARRION_REMOVE_GD = 6;
/** Putrid carrion loses this fraction of its P per gd; it turns to husk below CARRION_PUTRID_MIN_P of its start. */
export const CARRION_PUTRID_P_LOSS_PER_GD = 0.4;
export const CARRION_PUTRID_MIN_P = 0.1;
/** Stage clock rate = 2^((T - ref) / per); frozen at or below the freeze temperature (°C). */
export const CARRION_CLOCK_REF_C = 20;
export const CARRION_CLOCK_PER_C = 10;
export const CARRION_FREEZE_C = 2;

// ---- other schedules (Tier 2 data) ----

/** Large carcasses (§1.2): nutrients, mass (mg), length (mm), hardness, slots, odour (BU). */
/**
 * R38 item 4 (direction 24; GDD 05 §1.2 deviation): a torn piece of any carrion carries at least this much protein per
 * load of carry capacity, the density of `insect-medium` (4 P in 5 bulk), which colonies do bring home. Total P per
 * carcass is unchanged; the carcass is fewer, richer pieces. Round 10: a found 120 P worm carcass (bulk 500, 0.24 P a
 * load) gave a colony of 15-20 3.2 P before it decayed, a found insect-large (15 P in 40) 0.2-0.6 P.
 */
export const CARRION_TEAR_P_PER_BULK_MIN = 0.75;
export const LARGE_CARCASS_TYPES = {
  worm: { c: 5, p: 120, massMg: 1000, mm: 100, hardness: 1.0, slots: 12, odourBu: 60 },
  // Slug and vertebrate masses are estimates (the GDD gives none).
  slug: { c: 2, p: 60, massMg: 500, mm: 60, hardness: 1.0, slots: 12, odourBu: 60 },
  vertebrate: { c: 20, p: 400, massMg: 8000, mm: 80, hardness: 2.0, slots: 16, odourBu: 100 },
} as const;
export type LargeCarcassType = keyof typeof LARGE_CARCASS_TYPES;

/** Windfall fruit (§1.2): juice reserve C and P, loads. */
export const WINDFALL_FRUITS = { plum: { c: 20, p: 0 }, apple: { c: 60, p: 0.5 } } as const;
export type WindfallFruit = keyof typeof WINDFALL_FRUITS;
/**
 * Windfall stages by age (gd): juice flow (C/gd), slots, quality. The juice reserve is drinkable directly; the flow
 * figures are kept as data for the diagnostics / a later flow cap.
 */
export const WINDFALL_STAGES = [
  { untilGd: 1.5, flowPerGd: 4, slots: 2, quality: 0.7 },
  { untilGd: 4, flowPerGd: 12, slots: 6, quality: 0.6 },
  { untilGd: 6, flowPerGd: 6, slots: 12, quality: 0.4 },
] as const;
/** Wasps drain this fraction of a windfall's juice per daylight hour (GDD 05 §1.2, abstract). */
export const WINDFALL_WASP_DRAIN_PER_H = 0.1;

/** Sugary spills (§1.2): diameter mm -> loads. Slots = perimeter / (1.5 L), at most SPILL_SLOTS_MAX. */
export const SPILL_SIZES = [
  { mm: 20, loads: 10 }, { mm: 50, loads: 40 }, { mm: 100, loads: 120 }, { mm: 200, loads: 300 },
] as const;
export const SPILL_SLOT_SPACING_L = 1.5;
export const SPILL_SLOTS_MAX = 24;
/** Liquid half-life, gd: sun (surface >= SPILL_SUN_C), shade, indoors. */
export const SPILL_HALF_LIFE_GD = { sun: 0.15, shade: 0.4, indoors: 1 } as const;
export const SPILL_SUN_C = 30;
/** Below this fraction of its start a spill becomes `sticky-residue`. */
export const SPILL_RESIDUE_FRACTION = 0.3;

export const CRUST_DRY_GD = 2;
export const CRUST_DRY_HARDNESS = 2.0;
export const WET_FOOD_DRY_GD = 0.5;
export const WET_FOOD_DRY_HARDNESS = 1.5;
/** Pet bowls are refilled at these hours (when the archetype has a pet). */
export const PET_BOWL_REFILL_HOURS: readonly number[] = [7, 18];
/** Extrafloral nectaries refill x this from day 10 (doy28). */
export const EFN_LATE_REFILL_MULT = 0.3;
export const EFN_LATE_FROM_DOY = 10;

// ---- human food and runtime carrion (GDD 05 §1.7, §1.3) ----

/** Share of food-drop events that leave a crust instead of crumbs (estimate; GDD 05 says "or a crust"). */
export const HUMAN_DROP_CRUST_SHARE = 0.2;
/** Crumb variants of a food drop by zone: pavement crisp / bread, interior cereal / cheese, playground sweets. */
export const HUMAN_DROP_CRUMBS: Record<ZoneType, FoodVariant[]> = {
  pavement: ['crumb-fatty', 'crumb-starch'], asphalt: ['crumb-fatty', 'crumb-starch'],
  interior: ['crumb-starch', 'crumb-protein'], sand: ['crumb-starch', 'sugar-granules'],
  rubber: ['crumb-starch', 'sugar-granules'], lawn: ['crumb-starch', 'crumb-protein', 'crumb-fatty'],
  'garden-bed': ['crumb-starch'], forest: ['crumb-starch'],
};
/** `children` events drop one of these plus sugar granules. */
export const CHILDREN_FOOD: FoodVariant[] = ['crumb-starch', 'crumb-fatty'];
/** Indoor spills are granules instead of liquid this often (GDD 05 §1.7: 50 %). */
export const SPILL_INDOOR_GRANULE_SHARE = 0.5;
/** Carcass bulk classes for corpses turned into carrion (largest bulk of each variant, loads). */
export const CARRION_BULK_CLASSES: readonly { maxBulk: number; variant: FoodVariant }[] = [
  { maxBulk: 1, variant: 'insect-small' }, { maxBulk: 10, variant: 'insect-medium' }, { maxBulk: 60, variant: 'insect-large' },
];
/** Large-carcass drops are slugs this often, else vertebrates (the table lists "slug / vertebrate"). */
export const LARGE_CARCASS_SLUG_SHARE = 0.5;

// ---- economy sanity budget (registry C13, Lasius, summer, Naturalist) ----

/** 300-worker colony: full daily need, loads/gd. */
export const BUDGET_N300_NEED = { c: 57.1, p: 77.3 } as const;
/** What C13 says the T1 static food set supplies within BUDGET_T1_RADIUS_BU of the nest (lower bounds). */
export const BUDGET_T1_SUPPLY_MIN = { c: 45, p: 25 } as const;
export const BUDGET_T1_RADIUS_BU = 900;

// =====================================================================================================
// ---- plants: honeydew herds, tenders, nectar (owner: ecology-plants; GDD 05 §1.2, §1.4; GDD 07 §6.1; GDD 02 §10.3) ----
// =====================================================================================================

import type { HostClass } from '@/sim/types';

/** Honeydew made per aphid per gd at `tend` 1 and temperature factor 1, C loads (GDD 05 HONEYDEW_PER_APHID). */
export const HONEYDEW_PER_APHID = 0.10;
/** Production factor of an untended herd: factor = UNTENDED_PROD + (1 - UNTENDED_PROD) x tend. */
export const UNTENDED_PROD = 0.5;
/** Herd pool cap = HERD_POOL_BASE + HERD_POOL_PER_APHID x A, loads (x foodAbundanceMult). */
export const HERD_POOL_BASE = 1.0;
export const HERD_POOL_PER_APHID = 0.02;
/** One `tend-aphid` cycle releases this much honeydew; none is released from a pool below it, loads. */
export const APHID_DROPLET = 0.15;
/** Seconds a tender drinks after each stroke (3 s stroke + 3 s drink = 0.025 load/s, GDD 02 TEND_SOLICIT_RATE). */
export const TEND_DRINK_S = 3;
/** Time constant of the tending level (EWMA), gd (GDD 05 TEND_TAU 0.1 gd = 60 s). */
export const TEND_TAU_GD = 0.1;
/** Tenders needed for tend 1: ceil(A / APHIDS_PER_TENDER). */
export const APHIDS_PER_TENDER = 50;
/** Tender slots of a herd: TEND_SLOTS_BASE + floor(A / TEND_SLOTS_PER_APHIDS), at most TEND_SLOTS_MAX. */
export const TEND_SLOTS_BASE = 2;
export const TEND_SLOTS_PER_APHIDS = 25;
export const TEND_SLOTS_MAX = 16;
/** A tender is a `tend` ant (or one stroking the herd) within this many body lengths of the herd. */
export const TENDER_RADIUS_L = 2;
/** The ant query around a herd covers TENDER_RADIUS_L lengths of the longest caste (TENDER_QUERY_L_MAX body units)
 * and at least TENDER_QUERY_MIN_BU (the herd's odour radius, for discovery). */
export const TENDER_QUERY_L_MAX = 3;
export const TENDER_QUERY_MIN_BU = 6;
/** Tender-seconds that decide the claiming colony are counted over this window, gd (EWMA). */
export const TENDER_WINDOW_GD = 0.25;
/** Carrying capacity by host class, aphids (a tree branch; a tree carries up to TREE_HERDS_MAX herds). */
export const HERD_K: Record<HostClass, number> = { herb: 80, shrub: 250, tree: 400 };
export const TREE_HERDS_MAX = 3;
/** Tending raises growth by x(1 + 0.3 tend) and K by x(1 + 0.25 tend). */
export const TEND_GROWTH_BONUS = 0.3;
export const TEND_K_BONUS = 0.25;
/** Host quality falls by this per gd from default-year day HOST_DECLINE_FROM_DOY, to the floor; 1.0 again on day 1. */
export const HOST_DECLINE_PER_GD = 0.08;
export const HOST_DECLINE_FROM_DOY = 10;
export const HOST_QUALITY_FLOOR = 0.5;

/** Growth rate r per gd by default-year day window (doy a-b inclusive); days 22-28 the herd is dormant. */
export const APHID_GROWTH_PHASES: readonly { from: number; to: number; r: number; phase: string }[] = [
  { from: 1, to: 7, r: 0.9, phase: 'spring growth' },
  { from: 8, to: 10, r: 0.6, phase: 'summer peak' },
  { from: 11, to: 14, r: 0.2, phase: 'host decline' },
  { from: 15, to: 17, r: -0.2, phase: 'return flight' },
  { from: 18, to: 21, r: -0.5, phase: 'sexual forms' },
];
/** First default-year day of the dormant (egg) phase. */
export const HERD_DORMANT_FROM_DOY = 22;
/** Stem mothers hatched from the eggs on day 1 at this clock hour: A = min(E, STEM_MOTHERS_MAX). */
export const STEM_MOTHERS_MAX = 8;
export const HERD_HATCH_HOUR = 6;
/** Overwintering eggs laid at the end of day 21: E = min(EGG_MAX, round(EGG_FRACTION x season max A)). */
export const EGG_FRACTION = 0.1;
export const EGG_MAX = 20;

/** Temperature factor fT of the air at the plant: piecewise linear (°C, factor). */
export const APHID_TEMP_CURVE: readonly (readonly [number, number])[] = [[8, 0], [18, 1], [28, 1], [34, 0.6]];
/** Parasitoids: PARASITOID_RATE x (1 - PARASITOID_TEND_CUT x tend) of A per gd, on default-year days in window. */
export const PARASITOID_RATE = 0.05;
export const PARASITOID_TEND_CUT = 0.6;
export const PARASITOID_DAYS: readonly [number, number] = [6, 18];
/** Dispersal: DISPERSAL_RATE x A per gd while A >= DISPERSAL_TRIGGER x K_eff, in batches of DISPERSAL_BATCH aphids. */
export const DISPERSAL_RATE = 0.15;
export const DISPERSAL_TRIGGER = 0.8;
export const DISPERSAL_BATCH = 5;
/** A dispersing batch settles on an unoccupied host within this, BU (else it is lost). */
export const DISPERSAL_RADIUS_BU = 400;
/** Winged migrants found a herd of MIGRANT_APHIDS on an unoccupied host with this probability per gd, in the window. */
export const MIGRANT_P_PER_GD = 0.12;
export const MIGRANT_DAYS: readonly [number, number] = [3, 12];
export const MIGRANT_APHIDS = 5;
/** Mowing a lawn host: A x MOW_A_MULT, K_eff x MOW_K_MULT recovering linearly over MOW_RECOVERY_GD. */
export const MOW_A_MULT = 0.2;
export const MOW_K_MULT = 0.3;
export const MOW_RECOVERY_GD = 3;
/** An hour of downpour or storm: A x DOWNPOUR_A_MULT. */
export const DOWNPOUR_A_MULT = 0.95;
/** A herd below this many aphids in the active season has died out (collapsed). */
export const HERD_EXTINCT_A = 0.5;
/** Culling: one aphid becomes a food piece of these values; the AI culls at most HERD_CULL_MAX_PER_GD of A per gd. */
export const CULL_PIECE = { bulk: 0.15, c: 0.02, p: 0.08 } as const;
export const HERD_CULL_MAX_PER_GD = 0.05;
/**
 * New Game: share of the worldgen herd sites that start with a herd (the others are unoccupied hosts for migrants
 * and dispersal; estimate, GDD 05 gives none). Sites without a herd keep the expected map aphids at peak inside
 * the §6 band of 1500-9000 on a standard map.
 */
export const HERD_INITIAL_OCCUPANCY = 0.6;
/** Temperature factor used to pre-grow the starting herds from day 1 to the start date (no past weather exists). */
export const HERD_PREGROW_FT = 0.6;

// ---- the tender (GDD 07 §6.1.4 with GDD 02 §10.3) ----

/** A rival's claim keeps other colonies from working a herd while its `tend` is above this (GDD 05 §1.4: a herd is
 * defended, and attacked by others, when tend > 0.2). */
export const RIVAL_TEND_GUARD = 0.2;
/** A `forage` marker over a herd multiplies its tenders wanted (GDD 07 HERD_FORAGE_MARKER_MULT); `avoid` sets 0. */
export const HERD_FORAGE_MARKER_MULT = 2.0;
/** Tenders arrive within this of the herd point, BU. */
export const HERD_ARRIVE_BU = 1.5;
/** At the herd: within HERD_ARRIVE_BU + TEND_AT_HERD_SLACK_BU, or within TEND_AT_HERD_TENDER_BU while counting as
 * a tender (the walker circles a thin stem). */
export const TEND_AT_HERD_SLACK_BU = 0.5;
export const TEND_AT_HERD_TENDER_BU = 2;
/** The herd's roster (tenders and guards of one colony) counts ants within this of the herd point, BU. */
export const TEND_ROSTER_RADIUS_BU = 3;
/** Approach radii: to the stroke place, to a predator (to bite), to a relay receiver, BU. */
export const TEND_STROKE_APPROACH_BU = 0.5;
export const TEND_BITE_APPROACH_BU = 0.4;
export const RELAY_APPROACH_BU = 0.3;
/** A tender gives up the herd after this many failed trips to it, and avoids it for TEND_HERD_BLOCK_GD. */
export const TEND_TRAVEL_TRIES = 3;
export const TEND_HERD_BLOCK_GD = 0.5;
/** At the herd: wait for the pool (GDD 07 WAIT_TIMEOUT_S) and leave when it stays empty, s. */
export const TEND_WAIT_TIMEOUT_S = 300;
/** Pool empty this long while soliciting -> wait (GDD 07 §6.1.4). */
export const TEND_SOLICIT_EMPTY_S = 60;
/** Guards: become one when fewer than this share of the herd's tenders guard; a shift lasts TEND_GUARD_SHIFT_GD. */
export const TEND_GUARD_FRACTION = 0.3;
export const TEND_GUARD_SHIFT_GD = 0.25;
/** A guard sips one droplet for its upkeep when its crop is below this, loads. */
export const TEND_GUARD_SIP_CROP = 0.1;
/** A herd predator within this of the herd turns tenders into defenders, BU. */
export const TEND_PREDATOR_RADIUS_BU = 4;
/** A defender flees below this share of its hp. */
export const TEND_FLEE_HP_FRAC = 0.3;
/** Honeydew relay (GDD 07 §6.1.2): to a nestmate within RELAY_RADIUS_BU whose crop is at most this share of its cap. */
export const RELAY_ENABLED = true;
export const RELAY_RADIUS_BU = 3;
export const RELAY_RECEIVER_MAX_CROP = 0.5;
/** A tender with a full crop looks for a receiver this long, then goes home itself, s (estimate). */
export const RELAY_TRY_S = 10;
/** A chosen receiver stays chosen while within RELAY_KEEP_MULT x RELAY_RADIUS_BU of the herd. */
export const RELAY_KEEP_MULT = 2;
/**
 * Local adapter, now off: the colony allocation computes the `tend` demand itself (colony/allocation/demand.ts calls
 * herdTendDemand, int-1B-sim). While on, the plants module added Σ tenders wanted right after each allocation pass.
 */
export const TEND_DEMAND_ADAPTER = false;

// ---- nectar (GDD 05 §1.2 flower / extrafloral-nectary rows; the refill itself is sources-core's) ----

/** Tier 2 flying-insect drain of flower nectar per hour, while air >= FLOWER_DRAIN_MIN_C and dry. */
export const FLOWER_DRAIN_PER_H = 0.15;
export const FLOWER_DRAIN_MIN_C = 15;
/** Flowers refill fully in their peak (default-year days); outside it (still open) x FLOWER_OFFPEAK_REFILL_MULT (estimate). */
export const FLOWER_PEAK_DAYS: readonly [number, number] = [5, 14];
export const FLOWER_OFFPEAK_REFILL_MULT = 0.5;
