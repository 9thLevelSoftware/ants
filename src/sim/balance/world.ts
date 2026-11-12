// World scale and grid resolutions (docs/01-design-seed.md §3, GDD 04 §1). Lengths in BU unless stated.

import type { WorldSizeId } from '@/sim/types';

/** World edge per size class, BU. */
export const WORLD_SIZE_BU: Record<WorldSizeId, number> = { compact: 3000, standard: 4000, large: 5000 };
/** BU in mm used when a colony's species has no definition (rival-only species), mm. */
export const FALLBACK_BU_MM = 4;
/** Terrain heightfield cell, BU. */
export const TERRAIN_CELL_BU = 4;
/** Pheromone cell, BU; cells per pheromone chunk edge. */
export const PHERO_CELL_BU = 4;
export const PHERO_CHUNK_CELLS = 16;
/** Coarse nav-grid cell, BU (also soil-moisture and grass cells). */
export const NAV_CELL_BU = 16;
/** Carve-grid voxel, BU. */
export const CARVE_VOXEL_BU = 0.5;

/** Placeholder generator / test world terrain: gentle fbm noise. */
export const PLACEHOLDER_TERRAIN_AMP_BU = 3;
export const PLACEHOLDER_TERRAIN_SCALE_BU = 400;
export const PLACEHOLDER_TERRAIN_OCTAVES = 4;
/** Base soil moisture written by the placeholder generator, 0..255. */
export const PLACEHOLDER_MOISTURE = 102;
/** Entity spatial-hash cell, BU (about the typical perception radius). */
export const INDEX_CELL_BU = 8;
