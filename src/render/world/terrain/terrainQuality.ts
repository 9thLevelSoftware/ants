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
