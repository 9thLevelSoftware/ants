// Allocation-free vector helpers and deterministic per-walker noise for locomotion (no RNG stream is consumed:
// steering noise is a pure hash of walker id, tick and a salt, so it never disturbs other systems' streams).

import type { Vec3 } from '@/core/math/vec3';

/** Tangent part of v on the plane with unit normal n into out; returns its length (out unnormalised). */
export function tangentPart(out: Vec3, v: Vec3, n: Vec3): number {
  const d = v.x * n.x + v.y * n.y + v.z * n.z;
  out.x = v.x - n.x * d; out.y = v.y - n.y * d; out.z = v.z - n.z * d;
  return Math.sqrt(out.x * out.x + out.y * out.y + out.z * out.z);
}

/** Rotates v (perpendicular to unit axis n) about n by angle a (right-handed) into out; out may alias v. */
export function rotateTangent(out: Vec3, v: Vec3, n: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a);
  const cx = n.y * v.z - n.z * v.y, cy = n.z * v.x - n.x * v.z, cz = n.x * v.y - n.y * v.x;
  const x = v.x * c + cx * s, y = v.y * c + cy * s, z = v.z * c + cz * s;
  out.x = x; out.y = y; out.z = z;
  return out;
}

/** Signed angle (rad) from a to b about the unit normal n (both assumed roughly tangent). */
export function signedAngle(a: Vec3, b: Vec3, n: Vec3): number {
  const cx = a.y * b.z - a.z * b.y, cy = a.z * b.x - a.x * b.z, cz = a.x * b.y - a.y * b.x;
  return Math.atan2(cx * n.x + cy * n.y + cz * n.z, a.x * b.x + a.y * b.y + a.z * b.z);
}

export function normalizeInPlace(v: Vec3): number {
  const l = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (l > 1e-12) { v.x /= l; v.y /= l; v.z /= l; }
  return l;
}

export function dist3(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

export function distXZ(a: Vec3, b: Vec3): number {
  const dx = a.x - b.x, dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

export function set3(out: Vec3, x: number, y: number, z: number): Vec3 {
  out.x = x; out.y = y; out.z = z;
  return out;
}

export function copy3(out: Vec3, a: Vec3): Vec3 {
  out.x = a.x; out.y = a.y; out.z = a.z;
  return out;
}

/** 32-bit integer hash (lowbias32). */
function hash32(x: number): number {
  x = Math.imul(x ^ (x >>> 16), 0x7feb352d);
  x = Math.imul(x ^ (x >>> 15), 0x846ca68b);
  return (x ^ (x >>> 16)) >>> 0;
}

/** Deterministic uniform in [0, 1) from (id, tick, salt). */
export function noise01(id: number, tick: number, salt: number): number {
  const h = hash32((id | 0) ^ hash32((tick | 0) ^ hash32(salt | 0)));
  return h / 4294967296;
}

/** Deterministic, roughly normal noise (sum of three uniforms, variance 1). */
export function noiseGauss(id: number, tick: number, salt: number): number {
  const s = noise01(id, tick, salt) + noise01(id, tick, salt + 101) + noise01(id, tick, salt + 202);
  return (s - 1.5) * 2;
}
