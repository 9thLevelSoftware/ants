// Derived-map constants: moisture, nav grid, shade, water, nesting suitability (GDD 04 §2.4, §11-13).

import type { MaterialId, SpeciesId, ZoneType, ZoneVariant } from '@/sim/types';

/** Initial soil moisture theta0 per zone (GDD 04 §2.4 ZONE_THETA0) and its modifiers. */
export const ZONE_THETA0: Record<ZoneType, number> = {
  forest: 0.55, lawn: 0.4, 'garden-bed': 0.45, pavement: 0.35, asphalt: 0.2, sand: 0.15, rubber: 0.25, interior: 0.3,
};
export const THETA = { hollowK: 0.2, shadeK: 0.1, min: 0.02, max: 0.95 };

export const NAV = {
  /** Objects whose top is more than this above the cell ground block the cell (GDD 04 §11), BU. */
  overMaxBu: 40,
  /** Share of a nav cell's 4 BU samples that must be covered for `blocked-solid`. */
  blockedShare: 0.5,
  /** Ground difference between neighbours that makes a `step`, BU; climb cost per BU of height. */
  stepBu: 2,
  climbCostPerBu: 1.5,
  /** Soft edge margin (cells outside it are `edge`), BU (GDD 04 §14). */
  edgeMarginBu: 32,
  /** Cost byte unit: 10 = x1.0. */
  costUnit: 10,
  /** Clearance of the standard worker, BU (PASS_CLEAR_K = 0.45): lower gaps count as solid contact. */
  clearanceBu: 0.45,
};

/** Surface travel cost multiplier (GDD 04 §11), keyed by zone (and lawn variant). */
export const SURFACE_COST: Partial<Record<ZoneType, number>> = {
  forest: 1.25, lawn: 1.15, sand: 1.3,
};
export const SURFACE_COST_VARIANT: Partial<Record<ZoneVariant, number>> = { rough: 1.3 };
/** Per material (when the cell's surface is this material): gravel / mulch 1.4, fabric 1.2. */
export const SURFACE_COST_MATERIAL: Partial<Record<MaterialId, number>> = { gravel: 1.4, fabric: 1.2 };
/** Mulched garden beds: probability per bed zone and their cost (GDD 04 §2.1). */
export const MULCH = { p: 0.6, cost: 1.4, cover: 0.5 };

/** Litter/mulch cover per zone (0..1) and the forest-lawn litter fringe width, mm (GDD 04 §4.2 step 1g). */
export const LITTER: Partial<Record<ZoneType, number>> = { forest: 1 };
export const LITTER_FRINGE_MM = 1000;

/** Permeability (GDD 04 §2.4). Missing material = 1 (soil). */
export const PERMEABLE: Partial<Record<MaterialId, number>> = {
  asphalt: 0, concrete: 0, tile: 0, stone: 0, brick: 0, metal: 0, plastic: 0, glass: 0, ceramic: 0, rubber: 0.05,
  mortar: 0,
};
/** Hot surface materials (nav flag HOT). */
export const HOT_MATERIALS: readonly MaterialId[] = ['asphalt', 'rubber', 'metal'];

/** Sun positions for the shade samples (GDD 04 §12.3): +X east, +Z south, unit vectors toward the sun. */
export const SUN_HOURS: readonly number[] = [6, 8, 10, 12, 14, 16, 18];
export const SUN_DIRS: readonly [number, number, number][] = [
  [0.965926, 0.258819, 0], [0.72631, 0.544639, 0.419335], [0.321394, 0.766044, 0.55667], [0, 0.866025, 0.5],
  [-0.321394, 0.766044, 0.55667], [-0.72631, 0.544639, 0.419335], [-0.965926, 0.258819, 0],
];
/** Hours that make up `shadeMean` (08:00-18:00). */
export const SHADE_MEAN_FROM_INDEX = 1;
export const SHADE = {
  /** Ray step over the top-surface map, in nav cells. */
  stepCells: 0.5,
  /** Canopy transmittance (GDD 04 §5.1, §12.3). */
  canopyTransmittance: 0.3,
  /** Interior cells (no sky) are full shade. */
  interior: 255,
};

/** Water and flood (GDD 04 §13.4). */
export const WATER = {
  /** Puddles form where the fill depth is at least this, on cells with permeability below `impermeableBelow`. */
  puddleMinMm: 2,
  puddleCapMaxMm: 30,
  impermeableBelow: 0.3,
  /** Soils contribute this share of their area to the catchment. */
  soilRunoff: 0.3,
  /** hollow(p) = clamp((Hsmooth(p, 1 m) - H(p)) / 50 mm, 0, 1). */
  hollowRadius: 1000,
  hollowDepth: 50,
  /** floodRisk = clamp(0.5 hollow + 0.5 log10(1 + catch_m2) / log10(1 + 20)). */
  catchRefM2: 20,
};

/** Expected human passes per game day over a cell, by zone variant (placeholder for lanes; fQuiet). */
export const DISTURBANCE_PASSES: Partial<Record<ZoneVariant, number>> = {
  path: 3, sidewalk: 3, patio: 1.5, kitchen: 3, 'car-park': 2, driveway: 1, lane: 1, 'sand-pit': 2, poured: 2,
  mown: 0.3, rough: 0.1, flower: 0.1, vegetable: 0.2, shrub: 0.05, deciduous: 0.05,
};
/** disturbance = clamp(passes / DISTURBANCE_FULL, 0, 1). */
export const DISTURBANCE_FULL = 3;

/** Nesting suitability (GDD 04 §12). */
export interface SuitabilityProfile {
  weights: { dig: number; cover: number; warm: number; moist: number; flood: number; quiet: number; rival: number; special: number };
  /** Moisture window: 0 at lo0, 1 from lo1 to hi1, 0 at hi0 (linear ramps). */
  moist: { lo0: number; lo1: number; hi1: number; hi0: number; floorAboveHi?: number };
  /** Nests in wood (fDig from the wood primitive at the point). */
  woodNester: boolean;
}

export const SUITABILITY: Record<SpeciesId, SuitabilityProfile> = {
  'lasius-niger': {
    weights: { dig: 0.2, cover: 0.2, warm: 0.15, moist: 0.15, flood: 0.1, quiet: 0.1, rival: 0.1, special: 0 },
    moist: { lo0: 0.1, lo1: 0.3, hi1: 0.55, hi0: 0.85 }, woodNester: false,
  },
  'camponotus-pennsylvanicus': {
    weights: { dig: 0.15, cover: 0.15, warm: 0.05, moist: 0.3, flood: 0.05, quiet: 0.1, rival: 0.1, special: 0.1 },
    // 0 at 0.08, ideal 0.15-0.30, falls to 0.5 at 0.40 (mould) and stays there.
    moist: { lo0: 0.08, lo1: 0.15, hi1: 0.3, hi0: 0.5, floorAboveHi: 0.5 }, woodNester: true,
  },
  'messor-barbarus': {
    weights: { dig: 0.15, cover: 0.05, warm: 0.2, moist: 0.15, flood: 0.15, quiet: 0.1, rival: 0.1, special: 0.1 },
    moist: { lo0: 0.02, lo1: 0.1, hi1: 0.3, hi0: 0.55 }, woodNester: false,
  },
  'atta-texana': {
    weights: { dig: 0.2, cover: 0.05, warm: 0.1, moist: 0.15, flood: 0.15, quiet: 0.1, rival: 0.1, special: 0.15 },
    moist: { lo0: 0.05, lo1: 0.2, hi1: 0.45, hi0: 0.7 }, woodNester: false,
  },
};

export const SUIT = {
  /** Classes: good >= 0.6, fair >= 0.4 (GDD 04 §12.2). */
  good: 0.6,
  fair: 0.4,
  /** Founding band depths, BU (fDig samples). */
  bandBu: [2, 15] as [number, number],
  bandSamples: 4,
  /** fDig = clamp(digSpeed * mult / digNorm, 0, 1). */
  digNorm: 1.2,
  dampSandTheta: 0.25,
  dampSand: 0.9,
  drySand: 0.4,
  woodDecayed: 1,
  woodSound: 0.4,
  /** fCover levels. */
  coverCeiling: 1,
  coverLitter: 0.6,
  coverSward: 0.4,
  /** Ceiling within this height above the ground, and extending this far around, BU. */
  ceilingMaxBu: 3,
  ceilingAroundBu: 3,
  /** fWarm bonus under stone/slab/concrete cover. */
  warmStoneMult: 1.2,
  /** fRival = clamp(distance / 600 BU). */
  rivalFullBu: 600,
  /** Camponotus: decayed wood volume within 50 BU; Messor: open sky (shade < 0.3) and seeds within 300 BU. */
  woodVolumeBu3: 2000,
  woodRadiusBu: 50,
  seedOpenShade: 0.3,
  seedRadiusBu: 300,
  seedEach: 0.5,
  leafRadiusBu: 600,
  /** Leafy primitives within leafRadius that count as full leaf biomass (Atta, coarse T3 proxy). */
  leafPrimsFull: 50,
  pavingClearBu: 100,
};

/** Materials that make a founding ceiling (stone, slab, board, log, root, bark). */
export const CEILING_MATERIALS: readonly MaterialId[] = [
  'stone', 'concrete', 'brick', 'tile', 'wood-sound', 'wood-decayed', 'bark', 'plastic', 'rubber', 'ceramic', 'metal',
];
export const WARM_COVER_MATERIALS: readonly MaterialId[] = ['stone', 'concrete', 'brick', 'tile'];

/** Initial wood moisture (GDD 04 §13.6): base by decay + 0.08 ground contact + 0.05 shade - 0.05 (1 - shade). */
export const WOOD_MOIST = { sound: 0.12, decayed: 0.22, contact: 0.08, shadeK: 0.05, contactBu: 1 };
