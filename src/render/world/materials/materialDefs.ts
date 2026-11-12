// Material library data: how every MaterialId (src/sim/types/geom.ts) looks. One row per material; the same row
// drives the terrain splat layers, the primitive materials and the mound soil. Units: mm per texture tile, linear
// RGB multipliers. Texture sets are names from public/assets/manifest.json; `null` = procedural (procedural.ts).
//
// Scales follow the look spike (spike-look.md 2.7: soil 95, humus grit 150, joint sand 40, asphalt 260, bark trunk
// 700, brick ~1000 mm per tile) and GDD 08 11.6: everyday textures must read "at the wrong size" (concrete grain =
// boulders, rubber crumbs the size of an ant's head). Concrete is procedural (cement paste with sand grains and air
// voids): the gravel scan read as loose gravel at ant scale (look-pass audit) and the concrete_paving scan shows block
// joints. Stone uses the gravel scan at mineral-grain size, gravel ground the same scan at pea-gravel size.
import { MATERIAL_IDS, type MaterialId } from '@/sim/types';

export interface ProceduralLook {
  /** Base colour, sRGB hex. */
  base: string;
  /** Second colour the noise blends toward, sRGB hex. */
  alt: string;
  /** Feature size of the noise, as a fraction of the tile (1 = one blob per tile). */
  grain: number;
  /** Normal-map strength 0..1. */
  bump: number;
  /** Roughness 0..1 (before the material's roughness multiplier). */
  rough: number;
  /** Fibres along u (fabric, wood-like), 0 = isotropic. */
  fibre?: number;
  /** Over-and-under weave of two thread directions (fabric), threads per tile. */
  weave?: number;
  /** Share of light / dark sand grains scattered over the base (concrete, stone), 0..1. */
  speckle?: number;
  /** Density of small pits (air voids in concrete, pores in stone, pinholes in a glaze), 0..1. */
  pores?: number;
  /** Texture edge, px (default PROCEDURAL_TEXTURE_SIZE). */
  size?: number;
}

export interface MaterialDef {
  id: MaterialId;
  /** Manifest texture set, or null for a procedural set. */
  texture: string | null;
  procedural?: ProceduralLook;
  /** mm per texture tile (world-scale mapping: big objects never stretch). */
  scaleMm: number;
  /** Linear albedo multiplier. */
  tint: [number, number, number];
  /** Multiplier on the roughness map (procedural: on its rough value). */
  roughness: number;
  metalness: number;
  normalScale: number;
  /**
   * Albedo multiplier when soaked: GDD 08 11.4 rain look x0.7 on every porous surface (soil, stone, wood, asphalt,
   * rubber). Non-porous surfaces (glass, glazed tile, plastic, paint, living leaves) do not soak up water and only
   * turn glossy: 0.9-1 (a recorded refinement of the GDD's single number).
   */
  wetDarken: number;
  /** Lowest roughness when soaked (soil stays rough or it turns into a Fresnel mirror at grazing angles). */
  wetRough: number;
  /** Lowest roughness (scans with glossy roughness maps would otherwise shine like wet glass), 0 = none. */
  roughMin: number;
  /** How much ground-material borders wander (1 soft ground .. ~0.15 laid hard surfaces with crisp edges). */
  edgeJitter: number;
  /** Second, coarser texture scale multiplier for anti-tiling (0 = single scale). */
  dualScale: number;
  /** Overrides when the material is a solid object rather than ground (e.g. wood floor -> furniture wood). */
  prim?: Partial<Omit<MaterialDef, 'id' | 'prim'>>;
}

type Row = Omit<MaterialDef, 'id'>;

const SOIL: Row = {
  texture: 'soil_garden', scaleMm: 95, tint: [0.66, 0.78, 1.05], roughness: 1, metalness: 0, normalScale: 1,
  wetDarken: 0.7, wetRough: 0.72, roughMin: 0.6, edgeJitter: 1, dualScale: 6.3,
};
const HARD: Pick<Row, 'metalness' | 'edgeJitter' | 'roughMin'> = { metalness: 0, edgeJitter: 0.15, roughMin: 0 };

/** Every MaterialId has a row (a test checks completeness). */
export const MATERIAL_DEFS: Record<MaterialId, MaterialDef> = withIds({
  loam: SOIL,
  humus: { ...SOIL, texture: 'humus_forest', scaleMm: 150, tint: [0.78, 0.74, 0.7], normalScale: 1.2 },
  sand: { ...SOIL, texture: 'sand_playground', scaleMm: 70, tint: [1, 0.98, 0.95], wetDarken: 0.7, wetRough: 0.6 },
  clay: { ...SOIL, tint: [0.92, 0.7, 0.55], scaleMm: 120, normalScale: 0.6, wetRough: 0.5 },
  gravel: { ...SOIL, texture: 'gravel_fine', scaleMm: 420, tint: [0.9, 0.89, 0.87], roughMin: 0.65, wetDarken: 0.7, wetRough: 0.3 },
  // cement paste with sand grains and air voids (GDD 08 11.6: aggregate and pores at ant scale, not noise)
  concrete: { ...HARD, texture: null, procedural: { base: '#a29e95', alt: '#8f8b83', grain: 0.06, bump: 0.45, rough: 0.9, speckle: 0.5, pores: 0.12, size: 512 }, scaleMm: 90, tint: [0.95, 0.94, 0.92], roughMin: 0.7, roughness: 1, normalScale: 1, wetDarken: 0.7, wetRough: 0.35, dualScale: 6 },
  asphalt: { ...HARD, texture: 'asphalt', scaleMm: 260, tint: [0.85, 0.85, 0.85], roughness: 1, normalScale: 1.2, wetDarken: 0.7, wetRough: 0.18, dualScale: 5 },
  // fine-grained rock (flags, pebbles, walls): the gravel scan shrunk to mineral-grain size (grains ~0.2 mm read as
  // granite / sandstone at ant scale; at 70 mm per tile they read as loose gravel: look-pass audit)
  stone: { ...HARD, texture: 'gravel_fine', scaleMm: 28, tint: [0.66, 0.64, 0.6], roughMin: 0.75, roughness: 1, normalScale: 0.45, wetDarken: 0.7, wetRough: 0.18, dualScale: 5 },
  brick: { ...HARD, texture: 'brick', scaleMm: 1050, tint: [1, 1, 1], roughness: 1, normalScale: 1, wetDarken: 0.7, wetRough: 0.35, dualScale: 0 },
  tile: { ...HARD, texture: 'tile_ceramic', scaleMm: 1200, tint: [0.85, 0.84, 0.8], roughness: 0.6, normalScale: 0.8, wetDarken: 0.95, wetRough: 0.08, dualScale: 0 },
  'wood-sound': { ...HARD, texture: 'wood_floor', scaleMm: 800, tint: [1, 1, 1], roughness: 0.9, normalScale: 1, wetDarken: 0.7, wetRough: 0.3, dualScale: 0, prim: { texture: 'wood_furniture', scaleMm: 450 } },
  'wood-decayed': { ...HARD, texture: 'wood_decayed', scaleMm: 400, tint: [0.95, 0.92, 0.88], roughness: 1, normalScale: 1.3, wetDarken: 0.7, wetRough: 0.5, dualScale: 0 },
  bark: { ...HARD, texture: 'bark_oak', scaleMm: 300, tint: [0.72, 0.66, 0.6], roughness: 1, normalScale: 1.4, wetDarken: 0.7, wetRough: 0.4, dualScale: 0 },
  plant: { ...HARD, texture: null, procedural: { base: '#5a7f34', alt: '#7a9a46', grain: 0.12, bump: 0.25, rough: 0.6, fibre: 0.8 }, scaleMm: 40, tint: [1, 1, 1], roughness: 1, normalScale: 0.6, wetDarken: 0.9, wetRough: 0.25, dualScale: 0 },
  leaf: { ...HARD, texture: null, procedural: { base: '#4c7430', alt: '#6c8f3e', grain: 0.2, bump: 0.2, rough: 0.55, fibre: 0.4 }, scaleMm: 60, tint: [1, 1, 1], roughness: 1, normalScale: 0.6, wetDarken: 0.9, wetRough: 0.2, dualScale: 0 },
  metal: { ...HARD, texture: 'metal_painted', scaleMm: 400, tint: [1, 1, 1], roughness: 0.8, metalness: 0.3, normalScale: 0.8, wetDarken: 0.9, wetRough: 0.15, dualScale: 0 },
  // neutral moulded plastic (looks.ts gives the colour): faint orange-peel and flow marks
  plastic: { ...HARD, texture: null, procedural: { base: '#b9b7b1', alt: '#b1afa9', grain: 0.12, bump: 0.06, rough: 0.42, pores: 0.04 }, scaleMm: 60, tint: [1, 1, 1], roughness: 1, normalScale: 0.4, wetDarken: 0.95, wetRough: 0.15, dualScale: 0 },
  rubber: { ...HARD, texture: 'rubber_playground', scaleMm: 200, tint: [1, 1, 1], roughness: 1, normalScale: 1.2, wetDarken: 0.7, wetRough: 0.45, dualScale: 0, prim: { texture: 'rubber_black', scaleMm: 70 } },
  glass: { ...HARD, texture: null, procedural: { base: '#b9c6c4', alt: '#c4d0cd', grain: 0.6, bump: 0.02, rough: 0.06 }, scaleMm: 200, tint: [1, 1, 1], roughness: 1, normalScale: 0.2, wetDarken: 1, wetRough: 0.04, dualScale: 0 },
  fabric: { ...HARD, texture: null, procedural: { base: '#6b5640', alt: '#8a7254', grain: 0.04, bump: 0.6, rough: 0.95, fibre: 1, weave: 24 }, scaleMm: 30, tint: [1, 1, 1], roughness: 1, normalScale: 1, wetDarken: 0.7, wetRough: 0.7, dualScale: 0 },
  ceramic: { ...HARD, texture: null, procedural: { base: '#b5653f', alt: '#c27652', grain: 0.12, bump: 0.2, rough: 0.7, speckle: 0.2, pores: 0.08 }, scaleMm: 80, tint: [1, 1, 1], roughness: 1, normalScale: 0.6, wetDarken: 0.7, wetRough: 0.3, dualScale: 0 },
  paper: { ...HARD, texture: null, procedural: { base: '#d6cfbd', alt: '#c9c1ad', grain: 0.08, bump: 0.15, rough: 0.9, fibre: 0.5 }, scaleMm: 40, tint: [1, 1, 1], roughness: 1, normalScale: 0.5, wetDarken: 0.7, wetRough: 0.6, dualScale: 0 },
  food: { ...HARD, texture: null, procedural: { base: '#c79a5c', alt: '#a8783e', grain: 0.15, bump: 0.6, rough: 0.75, speckle: 0.3, pores: 0.3 }, scaleMm: 20, tint: [1, 1, 1], roughness: 1, normalScale: 0.8, wetDarken: 0.85, wetRough: 0.4, dualScale: 0 },
  water: { ...HARD, texture: null, procedural: { base: '#2f3c3f', alt: '#34454a', grain: 0.5, bump: 0.03, rough: 0.05 }, scaleMm: 200, tint: [1, 1, 1], roughness: 1, normalScale: 0.2, wetDarken: 1, wetRough: 0.04, dualScale: 0 },
  plaster: { ...HARD, texture: 'plaster_wall', scaleMm: 500, tint: [1, 1, 1], roughness: 1, normalScale: 0.8, wetDarken: 0.7, wetRough: 0.5, dualScale: 0 },
  insulation: { ...HARD, texture: null, procedural: { base: '#d1b86f', alt: '#e0cb88', grain: 0.05, bump: 0.7, rough: 1, fibre: 0.7 }, scaleMm: 60, tint: [1, 1, 1], roughness: 1, normalScale: 1, wetDarken: 0.7, wetRough: 0.8, dualScale: 0 },
  mortar: { ...HARD, texture: 'plaster_wall', scaleMm: 120, tint: [0.95, 0.92, 0.86], roughness: 1, normalScale: 0.8, wetDarken: 0.7, wetRough: 0.4, dualScale: 0 },
});

function withIds(rows: Record<MaterialId, Row>): Record<MaterialId, MaterialDef> {
  const out = {} as Record<MaterialId, MaterialDef>;
  for (const id of MATERIAL_IDS) out[id] = { id, ...rows[id] };
  return out;
}

/** The row as used for a solid primitive (applies `prim` overrides). */
export function primMaterialDef(id: string): MaterialDef {
  const d = materialDef(id);
  return d.prim ? { ...d, ...d.prim, id: d.id } : d;
}

/** Row for a material id; unknown strings (mound piles name item kinds) fall back to loam. */
export function materialDef(id: string): MaterialDef {
  return (MATERIAL_DEFS as Record<string, MaterialDef>)[id] ?? MATERIAL_DEFS.loam;
}

/** Granular pile soil of mounds and spoil heaps (GDD 03 1.4): fresh, crumbly, darker than the surrounding loam. */
export const MOUND_SOIL: MaterialDef = {
  ...MATERIAL_DEFS.loam, id: 'loam', scaleMm: 45, tint: [0.56, 0.62, 0.8], normalScale: 1.6, dualScale: 0,
};
