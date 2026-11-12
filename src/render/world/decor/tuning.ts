// Every tunable number of the decor renderers (vegetation, draped decor, water) in one place.
// Sources: GDD 04 §9 (decor layers: zones, sizes, densities, seasons), §13 (water), GDD 06 §3.8 (dew),
// GDD 08 §11 (palette and look), spike-look.md §2.8 (grass technique, parting, counts per preset).
// Units: mm unless the name says BU; densities per m² of host zone at High quality (GDD 04 §9 "nominal at High").
import type { QualityId } from '@/render/app';

/** Placement tile edge (GDD 04 §9: positions come from hash(seed, layer, tile 64 BU)). */
export const DECOR_TILE_BU = 64;
/** Streaming / draw unit: BLOCK_TILES x BLOCK_TILES tiles share one draw call per layer. */
export const BLOCK_TILES = 4;

/**
 * Quality factor on all decor densities (GDD 04 §9: High x1, Medium x0.5, Low x0.25, test 0). Multiplied by the
 * ratio of the preset's current density to its default, so the Settings density slider still works.
 */
export const DECOR_QUALITY_FACTOR: Record<QualityId, number> = { test: 0, low: 0.25, medium: 0.5, high: 1, ultra: 1.25 };

/** Streaming radius per preset, BU (instances fade out before it). */
export const DECOR_RADIUS_BU: Record<QualityId, number> = { test: 0, low: 250, medium: 400, high: 600, ultra: 800 };
/** Blocks farther than radius x this are disposed (hysteresis so a block does not flicker in and out). */
export const DECOR_DISPOSE_K = 1.25;
/** Time budget for block generation per frame, ms (at least one block is always generated). */
export const DECOR_BUDGET_MS = 3;

// ------------------------------------------------------------------------------------------------- grass

export const GRASS = {
  /** GDD 04 §9 decor-grass: blades per m² near the camera, mown / rough. */
  densityMown: 3000,
  densityRough: 1500,
  /** Blade width range, mm (2-6). */
  widthMm: [2, 6] as const,
  /** Rough sward length range, mm (100-300); mown length = the dynamic sward height. */
  roughLenMm: [100, 300] as const,
  /** Default mown sward height when the sim has no grassHeightMm yet (GDD 04 §15.5 starts 40-60). */
  mownDefaultMm: 50,
  /** Spread of a mown blade's length around the sward height (x). */
  mownLenK: [0.7, 1.2] as const,
  /** Full density within this distance of the camera, BU; beyond, kept fraction (D0 / d)^LOD_POW. */
  lodFullBU: 70,
  lodPow: 1.25,
  /** Far blades widen to keep coverage: width x min(maxWiden, keep^-widenPow). */
  lodWidenPow: 0.5,
  lodMaxWiden: 3.5,
  /** Rows per blade at each preset (spike 2.8: 4 flat / 5 / 7 / 9 folded); far blocks use half. */
  rows: { test: 3, low: 4, medium: 5, high: 7, ultra: 9 } as Record<QualityId, number>,
  folded: { test: false, low: false, medium: true, high: true, ultra: true } as Record<QualityId, boolean>,
  /** Blocks nearer than this (BU, nearest point) use the full row count and cast shadows. */
  nearBlockBU: 120,
  /** Roots sink this far below the ground so blade bases never float, mm. */
  rootSinkMm: 1,
  /** Atlas strips of the straightened CC0 grass atlas (spike 2.8). */
  strips: 7,
} as const;

/** decor-grass-tuft: tufts per m² in the 1 m band along edges (sand, rubber, pavement, kerbs) / forest clearings. */
export const GRASS_TUFT = {
  densityEdge: 200,
  densityClearing: 100,
  /** Band width along zone edges, mm. */
  bandMm: 1000,
  /** Tuft blade length, mm (30-120), blades per tuft and tuft radius, mm. */
  lenMm: [30, 120] as const,
  blades: [4, 9] as const,
  radiusMm: 6,
} as const;

/**
 * Parting and fading around the line of sight (GDD 04 §9: blades within 1.5 BU of the camera ray fade, within 1 BU
 * of the possessed ant bend away; spike 2.8 for the shape of the effect).
 */
export const PARTING = {
  /** Per-vertex dither fade within this distance of the camera->subject segment, BU. */
  rayFadeBU: 1.5,
  /** Blades whose root is within (bendBU + bendHeightK x height) of the segment in XZ bend away. */
  bendBU: 1.0,
  bendHeightK: 0.25,
  /** Extra bend at the tip, radians, at the segment. */
  bendMaxRad: 1.3,
  /** Eye proximity fade: invisible within near BU of the camera, fully visible beyond far BU. */
  eyeNearBU: 2.8,
  eyeFarBU: 3.2,
  /** The segment continues this far beyond the subject, BU (so blades just behind the ant also part). */
  beyondBU: 1.5,
} as const;

/** Wind sway (spike 2.8): radians of extra tip bend per m/s of wind at 2 m, clamped. */
export const WIND = {
  radPerMs: 0.035,
  minRad: 0.02,
  maxRad: 0.22,
  /** Gust wave number along the wind, 1/mm, and speed, rad/s. */
  waveK: 0.006,
  waveSpeed: 1.7,
} as const;

// ------------------------------------------------------------------------------------------------- draped decor

/** Hug rules: draped decor stays within this band above the ground, so an ant (feet on the ground) is on top. */
export const DRAPE = {
  /** Base lift above the ground, BU (the walker's foot offset is 0.15 BU). */
  liftBU: 0.004,
  /** Extra lift at a curled rim, BU, at curl 1. */
  curlBU: 0.03,
  /** Toward-camera depth bias: max(linK x d, depthUnits x one depth step at d). */
  viewBiasLinK: 2.5e-4,
  viewBiasDepthUnits: 6,
  /** Grid quads (along length x across) of the shared draped card per block LOD. */
  lodGrid: [[10, 6], [5, 3], [2, 1]] as const,
  /** Block LOD switch distances (nearest point of the block), BU. */
  lodBU: [80, 220] as const,
  /** Full instance density within this distance, BU; beyond, kept fraction (D0/d)^pow. */
  lodFullBU: 120,
  lodPow: 1.2,
} as const;

/** GDD 04 §9 decor-leaf. Seasonal forest density per m²: index = season (spring, summer, autumn, winter). */
export const LEAF = {
  forestDensity: [400, 250, 600, 400] as const,
  /** Leaf length x width, mm; 30 % birch-like 30-50. */
  lengthMm: [60, 120] as const,
  aspect: [0.55, 0.7] as const,
  smallShare: 0.3,
  smallLengthMm: [30, 50] as const,
  /** Lawn / pavement within this distance of a tree, density linear to 0, mm. */
  fringeMm: 3000,
  /** Autumn window, default-year doy (inclusive): 600/m² (GDD 04 §9). */
  autumnDoy: [15, 21] as const,
  /** Curl 0..1 of a leaf (drawn as rim lift + rim normal bend). */
  curl: [0.2, 1] as const,
} as const;

/** decor-needle [T3]: pine-hardwood forest, 1 x 40-150 mm, 2000/m². */
export const NEEDLE = { density: 2000, lengthMm: [40, 150] as const, widthMm: 1 } as const;

/** decor-petal [T2]: within 1.5 m of flowering shrubs and fruit trees, 8-20 mm, 80/m² in spring doy 2-6. */
export const PETAL = { density: 80, sizeMm: [8, 16] as const, radiusMm: 1500, doy: [2, 6] as const } as const;

/** decor-litter: pavement, asphalt, playground; 0.05/m², 0.5/m² within 1 m of bins; wrappers 50-150 mm. */
export const LITTER = { density: 0.05, binDensity: 0.5, binRadiusMm: 1000, sizeMm: [50, 150] as const, receiptShare: 0.35 } as const;

/** decor-grit: asphalt edges, gravel, sand margins: grains below PROP_MIN_SOLID_BU (0.75), 500/m². */
export const GRIT = { density: 500, sizeBU: [0.12, 0.6] as const, edgeBandMm: 400 } as const;

/** decor-mulch-fine / decor-pebble-fine: x3 their solid categories (mulch chip 12/m², pebble 3/m²). */
export const MULCH_FINE = { density: 36, sizeMm: [6, 20] as const } as const;
export const PEBBLE_FINE = { density: 9, sizeBU: [0.3, 0.7] as const } as const;

/**
 * decor-moss-lichen: on stones, walls, logs where shade >= 0.4 (GDD 04 §9); in paving joints (moss in the sand of
 * the joints, the demo's "paving joints with moss"), candidates per m² of pavement before the joint test.
 */
export const MOSS = {
  minShade: 0.4,
  jointCandidates: 9000,
  /** Joint moss everywhere on pavement gets this share; shaded cells (shade >= minShade) get all. */
  jointSunShare: 0.45,
  jointSizeMm: [8, 24] as const,
  primPerM2: 30,
  primSizeMm: [12, 40] as const,
  primMaterials: ['stone', 'brick', 'concrete', 'bark', 'wood-decayed', 'wood-sound'] as const,
  /** Grid of a baked moss patch on a primitive (vertices per edge). */
  primGrid: 6,
  /** Lift above the primitive surface, mm. */
  primLiftMm: 0.05,
} as const;

/** Object templates the decor reacts to (GDD 04 §5 ids). */
export const DECOR_OBJECTS = {
  trees: ['standing-tree', 'fruit-tree', 'park-tree', 'tree-pit'] as const,
  flowering: ['shrub', 'fruit-tree', 'perennial-plant'] as const,
  bins: ['litter-bin', 'pedal-bin'] as const,
} as const;

// ------------------------------------------------------------------------------------------------- dew and water

/** Dew droplets on blades (GDD 06 §3.8: droplet size 0.2-2 mm; dewLevel 0..1). */
export const DEW = {
  /** Only blocks nearer than this (nearest point) get droplets, BU. */
  radiusBU: 60,
  /** Share of blades with droplets at dewLevel 1, and droplets per such blade. */
  bladeShare: 0.45,
  perBlade: [1, 4] as const,
  radiusMm: [0.25, 1.1] as const,
} as const;

export const WATER = {
  /** Meniscus band at the waterline, mm (bright rim, slight alpha boost). */
  meniscusMm: 0.2,
  /** Depth at which the water reaches its full darkening, mm. */
  fullDepthMm: 8,
  /** Clear water in vessels darkens over this depth, mm. */
  clearFullDepthMm: 120,
  /** Puddle cells with less water than this are dry, mm. */
  minPuddleMm: 0.3,
  /** Water tint (linear) seen through shallow water and at depth. */
  shallowTint: [0.62, 0.6, 0.52] as const,
  deepTint: [0.05, 0.06, 0.05] as const,
  roughness: 0.04,
  /** Ground under a puddle surface is drawn this far below the water plane only (wet seam), mm. */
  seamMm: 0.15,
} as const;

// ------------------------------------------------------------------------------------------------- palettes

/** Seasonal leaf palette (linear multipliers on the atlas colour): spring, summer, autumn, winter. GDD 08 11.3. */
export const LEAF_PALETTE = {
  /** Share of fresh-coloured (maple atlas) leaves per season; the rest are dry oak-type leaves. */
  freshShare: [0.12, 0.1, 0.65, 0.05] as const,
  /** Tint of dry litter per season (old leaves darken and grey over winter). */
  dryTint: [[0.78, 0.72, 0.64], [0.86, 0.8, 0.7], [1.0, 0.92, 0.82], [0.58, 0.52, 0.46]] as const,
  /** Tint of fresh leaves per season. */
  freshTint: [[0.9, 0.95, 0.8], [0.85, 0.95, 0.75], [1.05, 1.0, 0.95], [0.7, 0.65, 0.6]] as const,
  /** Saturation per season (1 = atlas). */
  saturation: [0.85, 0.9, 0.95, 0.7] as const,
} as const;
