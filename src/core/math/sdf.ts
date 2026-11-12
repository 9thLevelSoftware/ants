// Signed distance functions for solid primitives, in the primitive's LOCAL space (centred at the origin).
//
// SIGN CONVENTION HERE: positive OUTSIDE the shape, negative inside, 0 on the surface (the usual SDF convention).
// The world field f(p) (docs/01-design-seed.md §3) is positive in FREE space. How the two meet:
//  - a shape used as a SOLID (stone, table leg): free space is outside it, so f-contribution = +sd(p)
//    (fSubstrate = min over solids of sd(p));
//  - a shape used as a CAVITY (carve brush, crack, void): free space is inside it, so f-contribution = -sd(p)
//    (fCavity = max over cavities of -sd(p)); f = max(fSubstrate, fCavity).
// Always say which convention a value uses.
//
// All functions are exact Euclidean distances except sdEllipsoid (see its comment; sdEllipsoidExact is exact). No allocation.

import type { Quat } from './quat';
import type { Vec3 } from './vec3';

export function sdSphere(p: Vec3, r: number): number {
  return Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z) - r;
}

/**
 * Box with rounded edges. `half` = OUTER half extents (the rounded box fits exactly inside the box with these
 * half extents), `r` = edge radius, clamped to [0, min(half)]. r = 0 gives a sharp box.
 */
export function sdRoundBox(p: Vec3, half: Vec3, r: number): number {
  const rr = Math.max(0, Math.min(r, half.x, half.y, half.z));
  const qx = Math.abs(p.x) - half.x + rr;
  const qy = Math.abs(p.y) - half.y + rr;
  const qz = Math.abs(p.z) - half.z + rr;
  const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0, oz = qz > 0 ? qz : 0;
  const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
  const inside = Math.min(Math.max(qx, qy, qz), 0);
  return outside + inside - rr;
}

/**
 * Cylinder along local Y with flat caps. `radius` and `halfHeight` are OUTER sizes; `rounding` rounds the
 * rim edges (clamped to [0, min(radius, halfHeight)]).
 */
export function sdCappedCylinder(p: Vec3, radius: number, halfHeight: number, rounding = 0): number {
  const rr = Math.max(0, Math.min(rounding, radius, halfHeight));
  const dx = Math.sqrt(p.x * p.x + p.z * p.z) - radius + rr;
  const dy = Math.abs(p.y) - halfHeight + rr;
  const ox = dx > 0 ? dx : 0, oy = dy > 0 ? dy : 0;
  return Math.min(Math.max(dx, dy), 0) + Math.sqrt(ox * ox + oy * oy) - rr;
}

/** Capsule along local Y: the segment from (0,-halfLength,0) to (0,halfLength,0) swept by a sphere of `radius`. */
export function sdCapsule(p: Vec3, halfLength: number, radius: number): number {
  const y = p.y < -halfLength ? p.y + halfLength : p.y > halfLength ? p.y - halfLength : 0;
  return Math.sqrt(p.x * p.x + y * y + p.z * p.z) - radius;
}

/** Capsule between two arbitrary points a and b (any space), radius r. */
export function sdCapsuleSegment(p: Vec3, a: Vec3, b: Vec3, r: number): number {
  const pax = p.x - a.x, pay = p.y - a.y, paz = p.z - a.z;
  const bax = b.x - a.x, bay = b.y - a.y, baz = b.z - a.z;
  const bb = bax * bax + bay * bay + baz * baz;
  let h = bb > 0 ? (pax * bax + pay * bay + paz * baz) / bb : 0;
  h = h < 0 ? 0 : h > 1 ? 1 : h;
  const dx = pax - bax * h, dy = pay - bay * h, dz = paz - baz * h;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) - r;
}

/**
 * Axis-aligned ellipsoid with radii (rx, ry, rz): the bound-corrected approximation k0 (k0 - 1) / k1 with
 * k0 = |p / r| and k1 = |p / r^2| (Quilez), with the interior value clamped to >= -min(rx, ry, rz).
 * Measured against the exact distance (sdEllipsoidExact) at ~10000 random interior points per shape, longest :
 * shortest radius = a : 1; worst |approx| / |exact| inside (the unclamped formula alone reaches 2.4x at 3:1 and
 * 4.8x at 6:1, roughly 0.8 * a, which the clamp reduces to):
 *   1:1 -> 1.0   1.5:1 -> 1.2   2:1 -> 1.35   3:1 -> 1.55   4:1 -> 1.7   6:1 -> 2.0
 * Guarantees:
 *  - sign is exact, the zero set is exactly the ellipsoid, the slope is exactly 1 on the surface, and it is
 *    exact for spheres and along the principal axes;
 *  - within 0.1 * minRadius of the surface (both sides) it is within 5 % of the true distance (ratios <= 3:1);
 *  - OUTSIDE it never overestimates (safe for sphere tracing from outside); within 2 * minRadius of the
 *    surface it underestimates by at most 27 % for ratios up to 3:1 (12 % for 2:1, far less when nearly round);
 *  - INSIDE it never UNDERestimates the depth but can overestimate it by the factors above, and its gradient is
 *    not unit there. The depth is capped at minRadius (the inscribed sphere, the deepest any interior point can
 *    be), so the value is finite, negative and continuous through the centre, where it equals -minRadius.
 * Good for surface walking (walkers sit within a fraction of a BU of the surface) and outside ray marching;
 * for true interior depth use sdEllipsoidExact.
 */
export function sdEllipsoid(p: Vec3, rx: number, ry: number, rz: number): number {
  const ax = p.x / rx, ay = p.y / ry, az = p.z / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const bx = ax / rx, by = ay / ry, bz = az / rz;
  const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
  const minR = Math.min(rx, ry, rz);
  if (k1 === 0) return -minR;
  const d = (k0 * (k0 - 1)) / k1;
  return d < -minR ? -minR : d;
}

const ELLIPSOID_EXACT_ITERATIONS = 50;
/** Relative size of the pole offset / degenerate-axis test in sdEllipsoidExact (fraction of minRadius^2). */
const ELLIPSOID_EXACT_EPS = 1e-9;

/**
 * Exact signed distance to an axis-aligned ellipsoid (negative inside, true Euclidean depth). Solves for the
 * closest surface point with 50 bisection steps on the monotone secular equation (about 50 * 15 flops and a
 * few sqrt: roughly 30-60x the cost of sdEllipsoid), so use it for occasional queries (interior depth, carve
 * brushes, tests), not per-voxel inner loops. Accurate to ~1e-12 relative. Also valid at the centre and on the
 * symmetry planes.
 */
export function sdEllipsoidExact(p: Vec3, rx: number, ry: number, rz: number): number {
  const r0 = rx, r1 = ry, r2 = rz;
  const p0 = Math.abs(p.x), p1 = Math.abs(p.y), p2 = Math.abs(p.z);
  const r0s = r0 * r0, r1s = r1 * r1, r2s = r2 * r2;
  const rmin2 = Math.min(r0s, r1s, r2s);
  const inside = (p0 / r0) ** 2 + (p1 / r1) ** 2 + (p2 / r2) ** 2 < 1;
  // F(t) = sum (r_i p_i / (t + r_i^2))^2 - 1 is decreasing on t > -rmin2; its root gives the closest point.
  let lo = -rmin2 * (1 - ELLIPSOID_EXACT_EPS * 1e-4);
  let hi = Math.max(0, Math.sqrt(3) * Math.max(r0 * p0, r1 * p1, r2 * p2) - rmin2);
  for (let k = 0; k < ELLIPSOID_EXACT_ITERATIONS; k++) {
    const t = 0.5 * (lo + hi);
    const q0 = (r0 * p0) / (t + r0s), q1 = (r1 * p1) / (t + r1s), q2 = (r2 * p2) / (t + r2s);
    if (q0 * q0 + q1 * q1 + q2 * q2 > 1) lo = t; else hi = t;
  }
  const t = 0.5 * (lo + hi);
  const d0 = t + r0s, d1 = t + r1s, d2 = t + r2s;
  const tiny = ELLIPSOID_EXACT_EPS * rmin2;
  // Closest-point coordinates; an axis whose denominator vanishes (p on the symmetry plane of the shortest
  // axis, inside the ellipsoid) is fixed by the surface equation instead.
  let x0 = d0 > tiny ? (r0s * p0) / d0 : NaN;
  let x1 = d1 > tiny ? (r1s * p1) / d1 : NaN;
  let x2 = d2 > tiny ? (r2s * p2) / d2 : NaN;
  const rest = (a: number, ra: number, b: number, rb: number) =>
    (Number.isNaN(a) ? 0 : (a / ra) ** 2) + (Number.isNaN(b) ? 0 : (b / rb) ** 2);
  if (Number.isNaN(x0)) x0 = r0 * Math.sqrt(Math.max(0, 1 - rest(x1, r1, x2, r2)));
  else if (Number.isNaN(x1)) x1 = r1 * Math.sqrt(Math.max(0, 1 - rest(x0, r0, x2, r2)));
  else if (Number.isNaN(x2)) x2 = r2 * Math.sqrt(Math.max(0, 1 - rest(x0, r0, x1, r1)));
  // Ties for the shortest axis (spheroids, the exact centre): the closest point lies on one axis only.
  if (Number.isNaN(x0)) x0 = 0;
  if (Number.isNaN(x1)) x1 = 0;
  if (Number.isNaN(x2)) x2 = 0;
  const dist = Math.hypot(p0 - x0, p1 - x1, p2 - x2);
  return inside ? -dist : dist;
}

/**
 * Transforms world point p into a primitive's local space, given the primitive's world position and UNIT
 * rotation quaternion (local -> world): out = conj(rot) * (p - pos). `out` may alias p.
 */
export function sdfToLocal(out: Vec3, p: Vec3, pos: Vec3, rot: Quat): Vec3 {
  const vx = p.x - pos.x, vy = p.y - pos.y, vz = p.z - pos.z;
  // Rotate by the conjugate (-x, -y, -z, w), same formula as quatRotateVec3.
  const qx = -rot.x, qy = -rot.y, qz = -rot.z, qw = rot.w;
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  out.x = vx + qw * tx + (qy * tz - qz * ty);
  out.y = vy + qw * ty + (qz * tx - qx * tz);
  out.z = vz + qw * tz + (qx * ty - qy * tx);
  return out;
}

/** Inverse of sdfToLocal: local point -> world (out = rot * local + pos). `out` may alias local. */
export function sdfToWorld(out: Vec3, local: Vec3, pos: Vec3, rot: Quat): Vec3 {
  const vx = local.x, vy = local.y, vz = local.z;
  const tx = 2 * (rot.y * vz - rot.z * vy);
  const ty = 2 * (rot.z * vx - rot.x * vz);
  const tz = 2 * (rot.x * vy - rot.y * vx);
  out.x = vx + rot.w * tx + (rot.y * tz - rot.z * ty) + pos.x;
  out.y = vy + rot.w * ty + (rot.z * tx - rot.x * tz) + pos.y;
  out.z = vz + rot.w * tz + (rot.x * ty - rot.y * tx) + pos.z;
  return out;
}
