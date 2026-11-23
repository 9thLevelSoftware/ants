// Tunable numbers of the render-only dressing (look-pass): ground grit with volume near the camera. Units: mm at
// the reference BU (Lasius, 4 mm) unless the name says BU; sizes scale with the world's BU (a 4 mm ant on pea
// gravel stands among stones its own size, a 9 mm Camponotus among proportionally bigger ones would look wrong,
// so grit sizes are physical: they are NOT scaled; radii and counts are).
import type { QualityId } from '@/render/app';
import type { MaterialId } from '@/sim/types';

/** One kind of loose grain lying on a ground material. */
export interface GritSpec {
  /** Grains per mm² of ground (before the quality cap). */
  density: number;
  /** Grain diameter range, mm (physical). */
  sizeMm: readonly [number, number];
  /** Height / width of a grain (flat crumbs < 1 < upright chips). */
  flat: readonly [number, number];
  /** Share of angular chips (the rest are rounded crumbs). */
  chipShare: number;
  /** Colours (sRGB hex) the grains are drawn from. */
  colors: readonly string[];
  /** Roughness of the grains. */
  rough: number;
}

/** Loose grains per ground material (GDD 04 §9 decor-grit / pebble-fine, at the scale the macro camera sees). */
export const GRIT: Partial<Record<MaterialId, GritSpec>> = {
  // pea gravel: stones of an ant's own size, lying flat and touching (GDD 08 11.6 "concrete grain = boulders")
  gravel: { density: 0.06, sizeMm: [1.5, 6.5], flat: [0.35, 0.6], chipShare: 0.3, colors: ['#9d968b', '#b8afa1', '#7d7368', '#a88f73', '#c7c0b4', '#8e8a84'], rough: 0.7 },
  // garden soil: crumbs a quarter to half an ant long, lighter dry crust on top, a few mineral grains
  loam: { density: 0.016, sizeMm: [0.4, 2.6], flat: [0.45, 0.85], chipShare: 0.25, colors: ['#6b5038', '#7a5c40', '#5a4330', '#8a7058', '#857d70', '#4a3626', '#8f7d66'], rough: 0.95 },
  clay: { density: 0.008, sizeMm: [0.6, 2.4], flat: [0.4, 0.7], chipShare: 0.4, colors: ['#7a5236', '#8c6444', '#6a4630', '#9a7656'], rough: 0.9 },
  humus: { density: 0.014, sizeMm: [0.5, 3.0], flat: [0.3, 0.6], chipShare: 0.25, colors: ['#3d2c20', '#4e3a2a', '#5e4a35', '#6e5840', '#2f2219', '#7d7468'], rough: 0.95 },
  sand: { density: 0.02, sizeMm: [0.35, 1.0], flat: [0.6, 0.9], chipShare: 0.5, colors: ['#c9b38c', '#b89f78', '#d8c7a6', '#9c8a6c'], rough: 0.8 },
  asphalt: { density: 0.004, sizeMm: [0.8, 2.6], flat: [0.45, 0.8], chipShare: 0.8, colors: ['#3a3a3a', '#5a5856', '#2a2a2a', '#7a7672'], rough: 0.75 },
  concrete: { density: 0.0012, sizeMm: [0.4, 1.4], flat: [0.5, 0.8], chipShare: 0.7, colors: ['#9a958c', '#7d786f', '#b4ada2'], rough: 0.85 },
  stone: { density: 0.0012, sizeMm: [0.4, 1.4], flat: [0.5, 0.8], chipShare: 0.7, colors: ['#9a958c', '#7d786f', '#b4ada2'], rough: 0.85 },
  rubber: { density: 0.003, sizeMm: [0.8, 2.0], flat: [0.5, 0.8], chipShare: 0.9, colors: ['#6a2e27', '#2a2a2a', '#3a2c28'], rough: 0.9 },
  tile: { density: 0.0003, sizeMm: [0.3, 0.9], flat: [0.5, 0.8], chipShare: 0.5, colors: ['#d8cfbf', '#8c7a63', '#bfb4a3'], rough: 0.9 },
  'wood-sound': { density: 0.0003, sizeMm: [0.3, 0.9], flat: [0.5, 0.8], chipShare: 0.5, colors: ['#d8cfbf', '#8c7a63'], rough: 0.9 },
  mortar: { density: 0.002, sizeMm: [0.4, 1.4], flat: [0.5, 0.8], chipShare: 0.6, colors: ['#b8b0a2', '#9a9284'], rough: 0.9 },
};

/**
 * Quality knobs: grains drawn at most, how many of the nearest use the fine mesh and cast shadows, placement radius
 * around the camera focus (mm at BU 4).
 */
export const GRIT_QUALITY: Record<QualityId, { max: number; near: number; radiusMm: number }> = {
  // look pass 4: the first-play quality (test) had no grit at all, and low only the nearest 22 BU: both read as an empty plane at worker
  // height. Both now fill 30 BU (120 mm) round the camera focus (grains are instanced: no new draw call, about 0.02 grains per mm2)
  test: { max: 700, near: 0, radiusMm: 120 },
  low: { max: 1000, near: 0, radiusMm: 120 },
  medium: { max: 1800, near: 400, radiusMm: 130 },
  high: { max: 4000, near: 900, radiusMm: 180 },
  ultra: { max: 6500, near: 1500, radiusMm: 240 },
};

/** Shading of the grains: icosphere detail near / far, mottling (relative), specks and the buried side's darkening. */
export const GRIT_LOOK = {
  nearDetail: 1,
  farDetail: 0,
  /** Mottle pattern frequency on the unit grain and its amplitude (x 1 +- mottle). */
  mottleScale: 2.2,
  mottle: 0.22,
  /** Light mineral specks: hash threshold (higher = fewer) and brightening. */
  speckCut: 0.86,
  speck: 0.35,
  /** Albedo factor at the bottom of a grain (soil-stained, shaded). */
  bottomDark: 0.55,
} as const;

/** Placement lattice cell, mm: each cell rolls its own grains from a hash (world-anchored: grains never swim). */
export const GRIT_CELL_MM = 8;
/** Grains protrude at most this share of their height above the ground (the rest is buried). */
export const GRIT_EXPOSED = 0.55;
/**
 * Protrusion cap, BU: visual relief stays low enough that a walking ant's legs straddle a grain instead of the
 * body passing through it (the walker follows the simulation's ground, which has no grit).
 */
export const GRIT_MAX_RISE_BU = 0.38;
/** The focus moves this far (mm) before the grains are re-placed. */
export const GRIT_REPLACE_MM = 12;
/** Grains shrink to nothing over the outer share of the radius (no popping at the edge). */
export const GRIT_EDGE_FADE = 0.25;

/** Flower heads built from parts (flowerParts.ts): counts and proportions per head kind. */
export const FLOWER_PARTS = {
  /** Dandelion: rings of ligules (outer count; inner rings hold fewer), strap width / head radius, bracts. */
  dandelion: { rings: 6, outer: 34, widthK: 0.16, bracts: 14 },
  /** Daisy: ray petals per ring (two rings), petal width / head radius. */
  daisy: { petals: 17, widthK: 0.2 },
  /** Seed clock: seeds on the sphere, sphere radius / head radius. */
  seedClock: { seeds: 110, radiusK: 1.05 },
  clover: { florets: 70 },
  umbel: { florets: 36 },
} as const;

/**
 * Flower dressing per quality: heads within this distance of the camera are built from parts (mm at BU 4; the
 * shader finish of the head switches to its "receptacle" form inside the same radius), at most `maxParts` parts.
 * Low keeps the shader-only heads.
 */
export const FLOWER_QUALITY: Record<QualityId, { radiusMm: number; maxParts: number }> = {
  test: { radiusMm: 0, maxParts: 0 },
  low: { radiusMm: 0, maxParts: 0 },
  medium: { radiusMm: 450, maxParts: 6000 },
  high: { radiusMm: 750, maxParts: 12000 },
  ultra: { radiusMm: 1100, maxParts: 20000 },
};
/** The camera moves this far (mm) before the dressed heads are re-selected; heads are built this much farther out. */
export const FLOWER_REPLACE_MM = 40;

/**
 * Injection-moulded plastic (finishes.ts `plastic`, finishGlsl.ts wrPlastic). Millimetres, physical (not scaled by BU): the features are
 * 1 to 22 mm, which at 5 to 50 BU of ant-height distance read as surface (look pass 5: play equipment and garden furniture were single-colour faces).
 */
export const PLASTIC = {
  /** Orange-peel stipple: cell size, albedo amplitude, roughness amplitude. */
  grainMm: 1.4, grainAlbedo: 0.16, grainRough: 0.12,
  /** Mould part line: width, darkening. */
  seamMm: 0.7, seamDark: 0.3,
  /** Recessed rim on a big flat face: smallest half extent that gets one, inset as a share of the face's smaller half extent and its mm limits, width, darkening. */
  rimMinMm: 60, rimInset: 0.09, rimInsetMm: [4, 22] as readonly [number, number], rimMm: 1.0, rimDark: 0.26,
  /** Worn light edges: share of the lightening. */
  wearMix: 0.55,
  /** Dirt at the foot: height above the object's foot range (mm) over which it fades out, blotch size, strength. */
  dirtMm: [10, 110] as readonly [number, number], dirtBlotchMm: 12, dirtMix: 1.0,
} as const;
