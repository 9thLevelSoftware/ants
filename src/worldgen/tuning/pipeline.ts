// Pipeline steps, budgets and validation constants (GDD 04 §4.1-4.3, §6.1, §6.3).

import type { SpeciesId, WorldSizeId } from '@/sim/types';

/** Pipeline step ids in GDD 04 §4.2 order, with RNG stream labels and progress weights. */
export const STEPS = [
  { id: 'zones', label: 'wg/zones', weight: 0.05 },
  { id: 'height', label: 'wg/height', weight: 0.15 },
  { id: 'structures', label: 'wg/structures', weight: 0.15 },
  { id: 'props', label: 'wg/props', weight: 0.1 },
  { id: 'plants', label: 'wg/plants', weight: 0.1 },
  { id: 'derived', label: 'wg/derived', weight: 0.2 },
  { id: 'resources', label: 'wg/resources', weight: 0.05 },
  { id: 'rivals', label: 'wg/rivals', weight: 0.03 },
  { id: 'cavities', label: 'wg/cavities', weight: 0.07 },
  { id: 'start', label: 'wg/start', weight: 0.02 },
  { id: 'validate', label: 'wg/validate', weight: 0.08 },
] as const;
export type StepId = (typeof STEPS)[number]['id'];
/** Steps that run registered placers. */
export const PLACER_STEPS = ['structures', 'props', 'plants', 'resources', 'rivals', 'cavities', 'start'] as const;
export type PlacerStep = (typeof PLACER_STEPS)[number];

export const WORLDGEN_MAX_ATTEMPTS = 8;
/** Count scale per size class for budgets and validation counts (compact x0.75, large x1.25). */
export const SIZE_SCALE: Record<WorldSizeId, number> = { compact: 0.75, standard: 1, large: 1.25 };

/** Budgets at standard size (GDD 04 §4.1). */
export const BUDGETS = {
  primTotal: 16000,
  props: 7000,
  plants: 600,
  trees: 12,
  precarveChunks: 800,
  climbRoutes: 1500,
};
export type BudgetCategory = 'props' | 'plants' | 'trees' | 'structures';
/** Worldgen wall-clock budgets, ms (reported, never used to change the output: DET-1). */
export const WORLDGEN_TIME_MS = { browser: 5000, node: 3000 };
/** Props below this largest dimension become decor; flat props thinner than `decalBu` become decals, BU. */
export const PROP_MIN_SOLID_BU = 0.75;
export const PROP_DECAL_BU = 0.15;

/** Placement rules for props (GDD 04 §4.2 step 4). */
export const PLACE = {
  /** Footprint points sampled for resting. */
  restPoints: 5,
  maxTiltDeg: 20,
  /** A prop may not intersect a structure primitive deeper than this, mm; floating tolerance, mm. */
  overlapTolMm: 1,
  floatTolMm: 1,
  /** Positions and sizes are quantised to 1/256 mm, angles to 1e-6 rad (DET-5). */
  posQuantum: 256,
  angleQuantum: 1e6,
  /** Climb-route node spacing, BU (GDD 04 §10). */
  routeNodeBu: 8,
};

/** Validation (GDD 04 §4.3). Counts are for standard size and scale with SIZE_SCALE. */
export const VALID = {
  foundGoodMin: 6,
  foundClusters: 2,
  foundClusterSepBu: 300,
  startRadiusBu: 250,
  startGoodMin: 2,
  connectShare: 0.95,
  /** Queen clearance, BU, and the good sites she must reach. */
  queenClearanceBu: 0.9,
  queenGoodMin: 2,
  foodMin: 3,
  foodRadiusBu: 600,
  foodKindRadiusBu: 900,
  startFloodMax: 0.3,
  startRivalMinBu: 800,
  startEdgeMinBu: 300,
  rivalSpacingBu: 600,
  rivalEdgeMinBu: 200,
  /** Downward probe below a terrain hole for its base primitive, mm. */
  holeProbeMaxMm: 600,
};

export const MICRO = {
  passClearK: 0.45,
  gapMinBu: 0.6,
  carveMinBu: 1,
  shortcutRatio: 1.4,
  shelterMinBu3: 64,
  usefulMin: { compact: 4, standard: 6, large: 8 } as Record<WorldSizeId, number>,
};

/** Start pose score weights (GDD 04 §12.5). */
export const START = { goodCap: 4, wGood: 0.5, wShelter: 0.3, wExposure: 0.2, candidates: 12 };

/** Repairs (GDD 04 §4.3). */
export const REPAIR = {
  /** R2: cells that get loam strata and cover, near the start and at a second cluster. */
  r2Near: 3,
  r2Far: 3,
  r2FarMinBu: 320,
  r2FarMaxBu: 700,
  /** R2 stone (Lasius, Messor, Atta): flattened ellipsoid, mm, embedded share of its height. */
  r2StoneSize: [110, 34, 80] as [number, number, number],
  r2StoneEmbed: 0.4,
  /** R2 log (Camponotus): lying cylinder diameter x length, mm, embedded share of the diameter. */
  r2LogSize: [180, 900] as [number, number],
  r2LogEmbed: 0.15,
  /** R3: baseline anchors within this distance of the start, BU. */
  r3RadiusBu: 400,
  r3MinBu: 120,
  /** R4: channel radius, BU, and depth of its axis below the ground, BU. */
  r4RadiusBu: 0.75,
  r4DepthBu: 2.5,
  /** R4 only bridges barriers up to this many nav cells wide. */
  r4MaxCells: 12,
};

/** Standard-worker BU per species (seed §3) used when the species registry has no definition yet. */
export const SPECIES_BU_MM: Record<SpeciesId, number> = {
  'lasius-niger': 4, 'camponotus-pennsylvanicus': 9, 'messor-barbarus': 7, 'atta-texana': 7,
};

/**
 * Zones (type or type/variant) where each human event kind has a lane or region (v-lanes, GDD 04 §15.2). Until the
 * human lanes exist (T2), a kind is enabled when the map has at least one of its zones.
 */
export const LANE_ZONES: Record<string, readonly string[]> = {
  footsteps: ['interior/kitchen', 'pavement', 'lawn', 'sand', 'rubber'],
  mowing: ['lawn/mown'],
  sweeping: ['pavement', 'interior/kitchen', 'asphalt/car-park'],
  vacuum: ['interior/kitchen'],
  'food-drop': ['interior/kitchen', 'pavement/patio', 'pavement/path', 'sand', 'rubber', 'asphalt/car-park'],
  spill: ['interior/kitchen', 'pavement/patio', 'sand', 'rubber', 'asphalt/car-park'],
  watering: ['lawn', 'garden-bed'],
  car: ['asphalt/car-park', 'asphalt/driveway'],
  children: ['sand', 'rubber', 'lawn/mown'],
  'bait-station': ['interior/kitchen'],
};
