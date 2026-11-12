// Line geometry of marker rings, plan / ghost outlines and the cross-hatch of refused ghosts (GDD 08 §4.3: validity
// is shown by pattern as well as colour). Pure (no three): flat arrays of segment end points, mm.
import type { Vec3 } from '@/core';

/** Segments per full circle. */
export const RING_SEGMENTS = 48;

/** A capsule (a..b, radius) and a yawed ellipsoid: the plan volume pieces (same as the nest module's PlanGeometry). */
export interface OutlineCapsule { a: Vec3; b: Vec3; r: number }
export interface OutlineEllipsoid { c: Vec3; hw: number; hh: number; hl: number; aw: Vec3; al: Vec3 }

/** Pushes a circle (centre c, unit axes u and v, radii ru and rv) as RING_SEGMENTS segments into out. */
export function pushEllipse(out: number[], c: Vec3, u: Vec3, v: Vec3, ru: number, rv: number, segs = RING_SEGMENTS): void {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2, a1 = ((i + 1) / segs) * Math.PI * 2;
    for (const a of [a0, a1]) {
      const cu = Math.cos(a) * ru, sv = Math.sin(a) * rv;
      out.push(c.x + u.x * cu + v.x * sv, c.y + u.y * cu + v.y * sv, c.z + u.z * cu + v.z * sv);
    }
  }
}

/** Two unit vectors perpendicular to unit d (and to each other). */
export function basisOf(d: Vec3): [Vec3, Vec3] {
  const t = Math.abs(d.y) < 0.9 ? { x: 0, y: 1, z: 0 } : { x: 1, y: 0, z: 0 };
  const u = { x: d.y * t.z - d.z * t.y, y: d.z * t.x - d.x * t.z, z: d.x * t.y - d.y * t.x };
  const lu = Math.hypot(u.x, u.y, u.z) || 1;
  u.x /= lu; u.y /= lu; u.z /= lu;
  const v = { x: d.y * u.z - d.z * u.y, y: d.z * u.x - d.x * u.z, z: d.x * u.y - d.y * u.x };
  return [u, v];
}

/** Capsule outline: rings at both ends and four lines along it. */
export function pushCapsule(out: number[], c: OutlineCapsule): void {
  const d = { x: c.b.x - c.a.x, y: c.b.y - c.a.y, z: c.b.z - c.a.z };
  const len = Math.hypot(d.x, d.y, d.z);
  if (len < 1e-9) { pushEllipse(out, c.a, { x: 1, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, c.r, c.r); return; }
  d.x /= len; d.y /= len; d.z /= len;
  const [u, v] = basisOf(d);
  pushEllipse(out, c.a, u, v, c.r, c.r);
  pushEllipse(out, c.b, u, v, c.r, c.r);
  for (const [su, sv] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const ox = (u.x * su + v.x * sv) * c.r, oy = (u.y * su + v.y * sv) * c.r, oz = (u.z * su + v.z * sv) * c.r;
    out.push(c.a.x + ox, c.a.y + oy, c.a.z + oz, c.b.x + ox, c.b.y + oy, c.b.z + oz);
  }
}

/** Ellipsoid outline: its three principal ellipses. */
export function pushEllipsoid(out: number[], e: OutlineEllipsoid): void {
  const up = { x: 0, y: 1, z: 0 };
  pushEllipse(out, e.c, e.aw, e.al, e.hw, e.hl);
  pushEllipse(out, e.c, e.aw, up, e.hw, e.hh);
  pushEllipse(out, e.c, e.al, up, e.hl, e.hh);
}

/**
 * Cross-hatch (refused ghosts): two families of parallel diagonal segments clipped to a disc of `radius` around c in
 * the plane facing `n`.
 */
export function pushHatch(out: number[], c: Vec3, n: Vec3, radius: number, lines = 7): void {
  const [u, v] = basisOf(n);
  for (const sign of [1, -1]) {
    // directions at +-45 degrees in the (u, v) plane
    const dx = (u.x + sign * v.x) / Math.SQRT2, dy = (u.y + sign * v.y) / Math.SQRT2, dz = (u.z + sign * v.z) / Math.SQRT2;
    const px = (u.x - sign * v.x) / Math.SQRT2, py = (u.y - sign * v.y) / Math.SQRT2, pz = (u.z - sign * v.z) / Math.SQRT2;
    for (let i = 0; i < lines; i++) {
      const off = ((i + 0.5) / lines * 2 - 1) * radius;
      const half = Math.sqrt(Math.max(0, radius * radius - off * off));
      const ox = c.x + px * off, oy = c.y + py * off, oz = c.z + pz * off;
      out.push(ox - dx * half, oy - dy * half, oz - dz * half, ox + dx * half, oy + dy * half, oz + dz * half);
    }
  }
}

/**
 * A ring on the ground: centre c, radius r, each vertex lifted to the terrain height + lift (draped). `height` null:
 * a flat ring at c.y (cavity markers).
 */
export function pushGroundRing(out: number[], c: Vec3, r: number, height: ((x: number, z: number) => number) | null, lift: number): void {
  const segs = RING_SEGMENTS;
  for (let i = 0; i < segs; i++) {
    for (const k of [i, i + 1]) {
      const a = (k / segs) * Math.PI * 2;
      const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
      out.push(x, (height ? height(x, z) : c.y) + lift, z);
    }
  }
}

/** Number of segments in a flat segment array. */
export function segmentCount(arr: readonly number[]): number {
  return arr.length / 6;
}
