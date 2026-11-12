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
  // pea gravel: stones of an ant's own size, lying flat (GDD 08 11.6 "concrete grain = boulders")
  gravel: { density: 0.03, sizeMm: [2.2, 6.5], flat: [0.35, 0.6], chipShare: 0.35, colors: ['#9d968b', '#b8afa1', '#7d7368', '#a88f73', '#c7c0b4'], rough: 0.7 },
  loam: { density: 0.006, sizeMm: [0.5, 2.2], flat: [0.45, 0.8], chipShare: 0.2, colors: ['#4a3626', '#5a4330', '#3a2a1e', '#6e5a48', '#8a8073'], rough: 0.95 },
  clay: { density: 0.004, sizeMm: [0.6, 2.4], flat: [0.4, 0.7], chipShare: 0.4, colors: ['#7a5236', '#8c6444', '#6a4630'], rough: 0.9 },
  humus: { density: 0.008, sizeMm: [0.6, 2.8], flat: [0.3, 0.6], chipShare: 0.25, colors: ['#2f2219', '#3d2c20', '#4e3a2a', '#5e4a35'], rough: 0.95 },
  sand: { density: 0.012, sizeMm: [0.35, 1.0], flat: [0.6, 0.9], chipShare: 0.5, colors: ['#c9b38c', '#b89f78', '#d8c7a6', '#9c8a6c'], rough: 0.8 },
  asphalt: { density: 0.0025, sizeMm: [0.8, 2.6], flat: [0.45, 0.8], chipShare: 0.8, colors: ['#3a3a3a', '#5a5856', '#2a2a2a', '#7a7672'], rough: 0.75 },
  concrete: { density: 0.0012, sizeMm: [0.4, 1.4], flat: [0.5, 0.8], chipShare: 0.7, colors: ['#9a958c', '#7d786f', '#b4ada2'], rough: 0.85 },
  stone: { density: 0.0012, sizeMm: [0.4, 1.4], flat: [0.5, 0.8], chipShare: 0.7, colors: ['#9a958c', '#7d786f', '#b4ada2'], rough: 0.85 },
  rubber: { density: 0.003, sizeMm: [1.2, 3.0], flat: [0.5, 0.8], chipShare: 0.9, colors: ['#7a2a22', '#2a2a2a', '#2f5a2e'], rough: 0.9 },
  tile: { density: 0.0003, sizeMm: [0.3, 0.9], flat: [0.5, 0.8], chipShare: 0.5, colors: ['#d8cfbf', '#8c7a63', '#bfb4a3'], rough: 0.9 },
  'wood-sound': { density: 0.0003, sizeMm: [0.3, 0.9], flat: [0.5, 0.8], chipShare: 0.5, colors: ['#d8cfbf', '#8c7a63'], rough: 0.9 },
  mortar: { density: 0.002, sizeMm: [0.4, 1.4], flat: [0.5, 0.8], chipShare: 0.6, colors: ['#b8b0a2', '#9a9284'], rough: 0.9 },
};

/** Quality knobs: grains drawn at most, placement radius around the camera focus (mm at BU 4). */
export const GRIT_QUALITY: Record<QualityId, { max: number; radiusMm: number }> = {
  test: { max: 0, radiusMm: 0 },
  low: { max: 600, radiusMm: 90 },
  medium: { max: 1800, radiusMm: 130 },
  high: { max: 4000, radiusMm: 180 },
  ultra: { max: 6500, radiusMm: 240 },
};

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
