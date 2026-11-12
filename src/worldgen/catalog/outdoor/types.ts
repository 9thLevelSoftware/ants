// What an outdoor catalogue builder returns: the object template (primitives, climb routes, POIs, tags) plus the
// placement hints and the object's sockets in object-local space — pre-carve cavities, micro-connections and water
// bodies — which the placer transforms with the object's final pose and registers (place/outdoor/commit.ts).

import type { Vec3 } from '@/core/math/vec3';
import type { CavityKind, MicroKind, WaterBodyKind } from '@/sim/types';
import type { ObjectTemplate } from '../../kit/template';

/** Inputs every builder receives. */
export interface Env {
  /** Body unit, mm. */
  bu: number;
  /** Walker foot offset, mm (route nodes lie this far off the surface). */
  foot: number;
  /** The played species nests in wood (Camponotus): heart-rot and log galleries matter. */
  woodNester: boolean;
  /**
   * Ground height relative to the object's base at local (x, z), mm. Supplied for objects placed upright at a
   * fixed height (trees, posts) so that arches and feet follow the real terrain; default 0 (flat).
   */
  ground?: (lx: number, lz: number) => number;
}

/** A carve brush in object-local space (ellipsoids keep equal X/Z radii so a yaw does not change them). */
export interface LocalCarve {
  shape: 'sphere' | 'capsule' | 'ellipsoid';
  a: Vec3;
  /** Capsule end, or ellipsoid radii. */
  b: Vec3;
  r: number;
}

export interface LocalCavity {
  kind: CavityKind;
  carves: LocalCarve[];
  /** Openings (mouths) of the cavity: position, outward normal, radius (mm). */
  openings: { pos: Vec3; normal: Vec3; radius: number }[];
}

export interface LocalMicro {
  kind: MicroKind;
  /** Mouths, mm: the polyline a -> path -> b runs through the passage (the clearance test samples it). */
  a: Vec3;
  b: Vec3;
  /** Real gap, mm. */
  gapMm: number;
  /** Smallest clear dimension of the passage, mm. */
  clearMm: number;
  /** Passage length, mm (default |b - a|). */
  lengthMm?: number;
  /** Interior points of the passage centreline between a and b (bends), mm. */
  path?: Vec3[];
  /** Index into Built.cavities of the cavity this connection leads to (-1 none). */
  cavity?: number;
}

export interface LocalWater {
  kind: WaterBodyKind;
  pos: Vec3;
  radius: number;
  levelMm: number;
  capMm: number;
}

export interface Built {
  tpl: ObjectTemplate;
  /** Extra embedding below the resting height, mm (passed to placeObject). */
  embed?: number;
  /** Tilt to the support plane (default true). */
  tilt?: boolean;
  cavities?: LocalCavity[];
  micro?: LocalMicro[];
  water?: LocalWater[];
  /** Plant host data (PlantPlacement without the object id). */
  host?: { hostFlags: number; hostClass: 'herb' | 'shrub' | 'tree' };
  /** Heap raised in the terrain inside the object (compost), local rect centred at the origin, mm. */
  mound?: { w: number; d: number; h: number };
  /** Terrain holes under the object (drains, gullies): local axis-aligned rects, mm (yaw must be a multiple of 90 deg). */
  holes?: { x0: number; z0: number; x1: number; z1: number }[];
  /** Tree canopy disc in local space (visual + shade). */
  canopy?: { y: number; r: number };
}
