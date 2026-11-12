// Shared geometric world types: the static solids every system queries.
// Written by the orchestrator as the common ground between the kernel (field, carve grid, walker)
// and the wider contracts. Extend additively only.
//
// Conventions (docs/01-design-seed.md §3): millimetres, Y up, right-handed.
// The world field f(p) is POSITIVE IN FREE SPACE and negative inside solids:
//   f = max(fSubstrate, fCavity)
//   fSubstrate = min(terrain term, primitive distances)  — the primitive functions in
//                src/core/math/sdf.ts are positive outside the solid, so they are used as they are;
//   fCavity    = positive inside carved space, negative in un-carved material.

import type { Vec3 } from '@/core/math/vec3';
import type { Quat } from '@/core/math/quat';

/** Physical/visual material of a surface or solid. Order is the numeric code used in byte maps. */
export const MATERIAL_IDS = [
  'loam', 'humus', 'sand', 'clay', 'gravel', 'concrete', 'asphalt', 'stone', 'brick', 'tile',
  'wood-sound', 'wood-decayed', 'bark', 'plant', 'leaf', 'metal', 'plastic', 'rubber', 'glass',
  'fabric', 'ceramic', 'paper', 'food', 'water', 'plaster',
] as const;
export type MaterialId = (typeof MATERIAL_IDS)[number];

/** Numeric code of a material in byte maps (index into MATERIAL_IDS). */
export function materialCode(m: MaterialId): number {
  return MATERIAL_IDS.indexOf(m);
}
export function materialFromCode(code: number): MaterialId {
  return MATERIAL_IDS[code] ?? 'loam';
}

/** Solid primitive shapes. Local axis of cylinder and capsule is +Y. */
export type PrimShape = 'box' | 'cylinder' | 'capsule' | 'ellipsoid';

/** Bit flags on primitives. */
export const PrimFlag = {
  /** AI may plan climbs on it (the possessed ant can climb anything with grip). */
  CLIMBABLE: 1 << 0,
  /** Can be excavated by species that dig this material (wood for carpenter ants). */
  DIGGABLE: 1 << 1,
  /** Low grip: steep faces cannot be held (see surface properties in GDD 04). */
  SLIPPERY: 1 << 2,
  /** Gives rain/sun shelter to what is beneath it. */
  SHELTER: 1 << 3,
  /** Created or moved at runtime (mounds, moved objects); lives in SimState.worldDelta. */
  DYNAMIC: 1 << 4,
  /** Tall enough to block the coarse navigation grid. */
  NAV_BLOCK: 1 << 5,
  /** Rendered but ignored by the field (pure decoration with volume). */
  VISUAL_ONLY: 1 << 6,
} as const;

export interface Primitive {
  /** Unique within the world; dynamic primitives use ids from SimState.nextId. */
  id: number;
  shape: PrimShape;
  /** Centre, mm. */
  pos: Vec3;
  /** Orientation (local -> world). */
  rot: Quat;
  /**
   * box: half extents (x, y, z).
   * cylinder: x = radius, y = half height, z unused.
   * capsule: x = radius, y = half length of the inner segment, z unused.
   * ellipsoid: radii (x, y, z).
   */
  size: Vec3;
  /** Edge rounding radius in mm (box and cylinder); 0 for capsule/ellipsoid. */
  round: number;
  material: MaterialId;
  /** PrimFlag bits. */
  flags: number;
  /** Owning world object id, -1 if none. */
  objectId: number;
  /** Optional per-primitive colour variation 0..1 for rendering. */
  tint?: number;
}

/** Regular heightfield. Height at grid point (ix, iz) is data[iz * nx + ix]; world x = ix * cell. */
export interface HeightField {
  /** mm per cell. */
  cell: number;
  /** Number of grid points along x and z. */
  nx: number;
  nz: number;
  /** Heights in mm. */
  data: Float32Array;
}

/** Generic per-cell byte map aligned to the world origin: value at cell (ix, iz) is data[iz * nx + ix]. */
export interface ByteMap {
  /** mm per cell. */
  cell: number;
  nx: number;
  nz: number;
  data: Uint8Array;
}

/**
 * What the ground is made of, for digging, sound, heat and rendering.
 * At a point at depth d below the terrain surface: if d < crust thickness the material is the
 * surface material (hard crusts such as asphalt, concrete, tile cannot be dug); deeper, it is the
 * subsoil material.
 */
export interface GroundLayers {
  /** Surface material code per terrain cell (MATERIAL_IDS index). */
  surface: ByteMap;
  /** Crust thickness in mm per terrain cell (0-255). */
  crustMm: ByteMap;
  /** Subsoil material code per terrain cell. */
  subsoil: ByteMap;
}

/** A sphere where carved space crosses the substrate surface; used to open visible holes. */
export interface Breach {
  pos: Vec3;
  /** mm */
  r: number;
}

/** Sparse carve data as stored in SimState.worldDelta: parallel arrays of chunk keys and 16^3 openness bytes. */
export interface CarveData {
  /** mm per voxel (0.5 BU). */
  voxel: number;
  keys: number[];
  /** One Uint8Array(4096) per key: openness 0 (solid) .. 255 (open), iso at 127.5. */
  chunks: Uint8Array[];
  breaches: Breach[];
}
