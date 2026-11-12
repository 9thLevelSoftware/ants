// Visual-only decor descriptors (GDD 04 §9), written by worldgen (worldgen-outdoor) into WorldData.decor for the
// renderer. Decor is never collidable, never in SimState and never queried by the sim; the renderer places the
// actual items from hash(seed, layer, tile) inside these rules (DET-8). Additive contract (worldgen-outdoor).

import type { DecorLayer, ZoneType, ZoneVariant } from './ids';
import type { ByteMap } from './geom';

/** Seasonal density multipliers [spring, summer, autumn, winter]. */
export type SeasonMult = [number, number, number, number];

/** One decor layer inside a zone. */
export interface DecorLayerRule {
  layer: DecorLayer;
  /** Nominal density at High quality, items per m^2 (Medium x0.5, Low x0.25, test 0). */
  densityPerM2: number;
  /** Item length range, mm (blade length, leaf length, chip size ...). */
  sizeMm: [number, number];
  /** Item width range, mm. */
  widthMm: [number, number];
  /** Palette id the renderer resolves (e.g. 'grass-mown', 'leaf-oak', 'litter-wrapper'). */
  palette: string;
  /** Seasonal multipliers (default all 1). */
  season?: SeasonMult;
  /**
   * Where in the zone: 'area' everywhere, 'edge' within `bandMm` of a zone edge, 'shade' on cells with shade >= 0.4
   * (moss), 'near' only where the layer's density map is non-zero.
   */
  where: 'area' | 'edge' | 'shade' | 'near';
  /** Band width for 'edge', mm. */
  bandMm?: number;
}

export interface ZoneDecor {
  /** ZoneDef.id. */
  zoneId: number;
  type: ZoneType;
  variant: ZoneVariant | null;
  layers: DecorLayerRule[];
}

/**
 * Density multiplier map of a layer on a coarse grid (cell = tile size): value / 255 x `maxPerM2` items per m^2,
 * added to the zone rules' density. Used for things tied to objects: leaves within 3 m of trees, litter near bins,
 * petals under flowering shrubs and fruit trees.
 */
export interface DecorDensityMap {
  layer: DecorLayer;
  maxPerM2: number;
  map: ByteMap;
  palette: string;
  sizeMm: [number, number];
  widthMm: [number, number];
  season?: SeasonMult;
}

/** Flat decal on a surface (painted bay line, asphalt crack, rubber tile seam). Polyline in X/Z, mm. */
export interface DecorDecal {
  kind: 'painted-line' | 'crack' | 'seam';
  /** Polyline x0, z0, x1, z1, ... mm. */
  pts: number[];
  widthMm: number;
  /** Palette id. */
  palette: string;
}

export interface WorldDecor {
  /** Decor placement tile edge, BU (GDD 04 §9: 64 BU). */
  tileBu: number;
  zones: ZoneDecor[];
  maps: DecorDensityMap[];
  decals: DecorDecal[];
}
