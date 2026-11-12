// Primitive -> instance data (pure, tested): which shared geometry draws it, its per-instance size vector, tint
// colour, bounding radius, and the bucket key it batches under.
import type { Primitive } from '@/sim/types';
import { HASH_SEED, hashNum, hashStr } from '../lighting/signature';

export type GeomKind = 'box' | 'cyl' | 'sphere';
/** Levels of detail: detailed near the camera, coarse farther, and a minimal shape for primitives a few pixels big. */
export type Lod = 'near' | 'far' | 'tiny';
export const LODS: readonly Lod[] = ['near', 'far', 'tiny'];

export interface InstanceShape {
  geom: GeomKind;
  /** Vertex expansion family of the shader patch. */
  family: 'rounded' | 'ellipsoid';
  /** iSize = (x, y, z, round) in mm. */
  size: [number, number, number, number];
  /** Bounding-sphere radius around pos, mm. */
  radius: number;
}

export function instanceShape(p: Primitive): InstanceShape {
  const s = p.size;
  switch (p.shape) {
    case 'box': {
      const r = Math.max(0, Math.min(p.round, s.x, s.y, s.z));
      return { geom: 'box', family: 'rounded', size: [s.x, s.y, s.z, r], radius: Math.hypot(s.x, s.y, s.z) };
    }
    case 'cylinder': {
      const r = Math.max(0, Math.min(p.round, s.x, s.y));
      return { geom: 'cyl', family: 'rounded', size: [s.x, s.y, s.x, r], radius: Math.hypot(s.x, s.y) };
    }
    case 'capsule':
      // inner segment half length y, radius x: a rounded cylinder whose rounding equals its radius
      return { geom: 'cyl', family: 'rounded', size: [s.x, s.y + s.x, s.x, s.x], radius: s.y + s.x };
    case 'ellipsoid':
    default:
      return { geom: 'sphere', family: 'ellipsoid', size: [s.x, s.y, s.z, 0], radius: Math.max(s.x, s.y, s.z) };
  }
}

/** Per-instance colour multiplier from the primitive's tint (0..1) or, without one, from its id. */
export function tintColor(p: Primitive, out: [number, number, number]): [number, number, number] {
  let t = p.tint;
  if (t === undefined) {
    let h = Math.imul(p.id ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    t = ((h >>> 0) % 1000) / 1000 * 0.5 + 0.25; // gentle variation around the middle
  }
  const b = 0.84 + 0.32 * t;
  const warm = (t - 0.5) * 0.06;
  out[0] = b * (1 + warm); out[1] = b; out[2] = b * (1 - warm);
  return out;
}

export function bucketKey(geom: GeomKind, material: string, diggable: boolean, lod: Lod): string {
  return `${geom}|${material}|${diggable ? 'd' : '-'}|${lod}`;
}

/** Big primitives keep their detailed geometry this many of their radii farther away. */
export const LOD_SIZE_K = 12;

/**
 * Past this many of its radii a primitive covers about 3 px or less (1080p, 50 degree field of view) and is drawn
 * with the minimal shape.
 */
export const LOD_TINY_K = 500;

/** Level of detail for a primitive whose bounding sphere is `d` mm away (surface distance). */
export function lodAt(d: number, radius: number, nearMm: number): Lod {
  if (d < nearMm + radius * LOD_SIZE_K) return 'near';
  return d > radius * LOD_TINY_K ? 'tiny' : 'far';
}

/**
 * Level of detail for a primitive seen from (cx, cy, cz): near within `nearMm` of its bounding sphere, or while it
 * still covers a large angle (radius x LOD_SIZE_K farther for big objects); tiny once it is a few pixels big.
 */
export function lodFor(p: Primitive, radius: number, cx: number, cy: number, cz: number, nearMm: number): Lod {
  return lodAt(Math.hypot(p.pos.x - cx, p.pos.y - cy, p.pos.z - cz) - radius, radius, nearMm);
}

/** Change signature of a primitive (everything that affects drawing); a number, so per-frame checks allocate nothing. */
export function primSignature(p: Primitive): number {
  let h = hashStr(HASH_SEED, p.shape);
  h = hashNum(h, p.pos.x); h = hashNum(h, p.pos.y); h = hashNum(h, p.pos.z);
  h = hashNum(h, p.rot.x); h = hashNum(h, p.rot.y); h = hashNum(h, p.rot.z); h = hashNum(h, p.rot.w);
  h = hashNum(h, p.size.x); h = hashNum(h, p.size.y); h = hashNum(h, p.size.z);
  h = hashNum(h, p.round); h = hashStr(h, p.material); h = hashNum(h, p.flags);
  return hashNum(h, p.tint ?? Number.NaN);
}
