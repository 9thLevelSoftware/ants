// Terrain cost knobs per quality preset (the presets themselves live in src/render/app/quality.ts; these are the
// terrain-specific values keyed by preset id). Draw distance and anisotropy come from the preset.
import type { QualityId } from '@/render/app';

export interface TerrainQuality {
  /** Quads per clipmap level edge (multiple of 4). Triangles per level = 2 x n^2. */
  gridQuads: number;
  /** Finest vertex spacing as a fraction of the heightfield cell. */
  spacingCells: number;
  /** Edge of one texture-array layer, px (capped by the preset's maxTextureSize). */
  layerSize: number;
  /** Hole-mask tiles re-rasterised per frame while digging. */
  holeTilesPerFrame: number;
}

export const TERRAIN_QUALITY: Record<QualityId, TerrainQuality> = {
  test: { gridQuads: 48, spacingCells: 0.5, layerSize: 512, holeTilesPerFrame: 8 },
  low: { gridQuads: 48, spacingCells: 0.5, layerSize: 512, holeTilesPerFrame: 2 },
  medium: { gridQuads: 64, spacingCells: 0.5, layerSize: 512, holeTilesPerFrame: 2 },
  high: { gridQuads: 64, spacingCells: 0.5, layerSize: 1024, holeTilesPerFrame: 3 },
  ultra: { gridQuads: 96, spacingCells: 0.5, layerSize: 1024, holeTilesPerFrame: 4 },
};

/** Hole mask resolution: texel = 0.25 BU (1 mm for Lasius), 64 texels per tile, 16 x 16 atlas slots. */
export const HOLE_MASK_TEXEL_BU = 0.25;
export const HOLE_MASK_TILE_TEXELS = 64;
export const HOLE_MASK_ATLAS_SLOTS = 16;

/**
 * Static sky occlusion of the ground (skyOcclusion.ts). Cell = grid edge, mm; primitives narrower than minSizeMm
 * or whose footprint area exceeds maxCellsPerPrim cells (a room's ceiling or floor slab, ~70 000 cells: the interior
 * has its own light) are skipped; a parked car's body (~30 000 cells) is in.
 * Under an overhang the occlusion is `under` x max(highFloor, 1 - clearance / (openK x half width)); a footprint
 * resting on the ground counts `contact` (only its blurred ring shows: contact darkening round props).
 * `strength` scales the ground's indirect light: x (1 - strength x occlusion).
 * Beside a body at least skirtMinHeightMm tall, out to min(skirtK x its height, skirtMaxMm) from its footprint, the
 * ground loses the sky the body's flank hides: `skirt` x (wall formula 0.5 (1 - d / hypot(d, h)) for a flank standing
 * on the ground) x (azimuth it spans / PI), faded out over the outer half; computed on a grid skirtCoarse x coarser.
 */
export const SKY_OCCLUSION = {
  cellMm: 16,
  minSizeMm: 6,
  maxCellsPerPrim: 40000,
  groundContactMm: 2,
  contact: 0.9,
  under: 0.9,
  highFloor: 0.3,
  openK: 2,
  blurCells: 2,
  strength: 0.85,
  skirtMinHeightMm: 40,
  skirtK: 2,
  skirtMaxMm: 2000,
  skirt: 1,
  skirtCoarse: 4,
} as const;
