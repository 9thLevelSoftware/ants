// Geometry of one wood primitive: signed distance (positive outside, as src/core/math/sdf.ts), grain axis, smallest
// cross-section, length and volume. Pure; no allocation in the distance query.

import type { Vec3 } from '@/core/math/vec3';
import { quatRotateVec3 } from '@/core/math/quat';
import { sdCappedCylinder, sdCapsule, sdEllipsoid, sdfToLocal, sdRoundBox } from '@/core/math/sdf';
import type { Primitive } from '@/sim/types';

const local = { x: 0, y: 0, z: 0 };

/** Signed distance from p to the primitive's surface, mm: negative inside, positive outside. */
export function primDistance(prim: Primitive, p: Vec3): number {
  sdfToLocal(local, p, prim.pos, prim.rot);
  const s = prim.size;
  switch (prim.shape) {
    case 'box': return sdRoundBox(local, s, prim.round);
    case 'cylinder': return sdCappedCylinder(local, s.x, s.y, prim.round);
    case 'capsule': return sdCapsule(local, s.y, s.x);
    default: return sdEllipsoid(local, s.x, s.y, s.z);
  }
}

/** Local unit axis of the primitive's longest extent: +Y for cylinders and capsules, the largest half extent else. */
function localLongAxis(prim: Primitive): Vec3 {
  if (prim.shape === 'cylinder' || prim.shape === 'capsule') {
    // a short wide cylinder (a stump disc) still has its grain along +Y: trees grow along their axis
    return { x: 0, y: 1, z: 0 };
  }
  const s = prim.size;
  if (s.x >= s.y && s.x >= s.z) return { x: 1, y: 0, z: 0 };
  if (s.y >= s.z) return { x: 0, y: 1, z: 0 };
  return { x: 0, y: 0, z: 1 };
}

/** World-space unit grain axis (GDD 07 §6.2.1: the long axis of the primitive). */
export function grainAxisOf(prim: Primitive): Vec3 {
  const out = { x: 0, y: 0, z: 0 };
  quatRotateVec3(out, prim.rot, localLongAxis(prim));
  const len = Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z) || 1;
  out.x /= len; out.y /= len; out.z /= len;
  return out;
}

/** Smallest cross-section (diameter or smallest box edge), mm. */
export function thicknessMm(prim: Primitive): number {
  const s = prim.size;
  if (prim.shape === 'box') return 2 * Math.min(s.x, s.y, s.z);
  if (prim.shape === 'cylinder') return 2 * Math.min(s.x, s.y);
  if (prim.shape === 'capsule') return 2 * s.x;
  return 2 * Math.min(s.x, s.y, s.z);
}

/** Length along the grain axis, mm. */
export function lengthMm(prim: Primitive): number {
  const s = prim.size;
  if (prim.shape === 'cylinder') return 2 * s.y;
  if (prim.shape === 'capsule') return 2 * s.y + 2 * s.x;
  return 2 * Math.max(s.x, s.y, s.z);
}

/** Solid volume, mm^3 (rounding ignored). */
export function volumeMm3(prim: Primitive): number {
  const s = prim.size;
  switch (prim.shape) {
    case 'box': return 8 * s.x * s.y * s.z;
    case 'cylinder': return Math.PI * s.x * s.x * 2 * s.y;
    case 'capsule': return Math.PI * s.x * s.x * 2 * s.y + (4 / 3) * Math.PI * s.x ** 3;
    default: return (4 / 3) * Math.PI * s.x * s.y * s.z;
  }
}

/**
 * Position of p along the grain as a fraction 0..1 from the primitive's −axis end (segment index source).
 * Points beyond the ends clamp.
 */
export function alongGrain(prim: Primitive, axis: Vec3, p: Vec3): number {
  const half = lengthMm(prim) / 2;
  const t = (p.x - prim.pos.x) * axis.x + (p.y - prim.pos.y) * axis.y + (p.z - prim.pos.z) * axis.z;
  return Math.max(0, Math.min(1, (t + half) / Math.max(1e-6, 2 * half)));
}
