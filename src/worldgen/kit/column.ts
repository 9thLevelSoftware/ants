// Vertical extent of a primitive along the column (x, z): the interval [bottom, top] where the vertical line
// is inside the solid. Used for the top-surface map, nav, shade and resting.
//
// Two routines:
//  - `primColumn` (search): a shortcut for upright boxes and cylinders, otherwise a golden-section search for the
//    deepest point of the line plus bisection of both ends (about 53 distance evaluations). Placement (resting,
//    supportAt) keeps using it so that placed objects stay bit-identical.
//  - `primColumnAnalytic`: closed-form line/solid intersection for every tilted shape (slabs for boxes, quadratics
//    for cylinders, capsules and ellipsoids). Rounded rims are bracketed between the closed-form interval of the
//    outer (sharp) solid and that of a subset of the rounded one, then bisected; only a line that clips nothing
//    but a rounded rim falls back to the search. Same answer as the search within its bisection precision
//    (maps/maps.verify.test.ts); used by the derived maps.
// The upright shortcut, shared by both routines so the derived maps match the search: an upright box or cylinder
// reports its full height [py - s.y, py + s.y] wherever the line meets its mid cross-section. That is exact for a
// sharp shape; over the rounded rim of a rounded one the true ends lie up to `round` closer to the middle
// (kit/column.verify.test.ts bounds it), so a map cell at the very edge of a rounded slab or post reads its top up
// to the rounding radius too high. Exact rims here would make the derived maps differ from the search that
// placement uses, and steps 7-10 place content from those maps, which this task must not change.

import { makePrimEntry, primEval, SHAPE_BOX, SHAPE_CAPSULE, SHAPE_CYLINDER, SHAPE_ELLIPSOID, type PrimEntry } from '@/sim/world/primHash';
import { sdRoundBox as sdRoundBoxImp } from '@/core/math/sdf';
import type { Primitive } from '@/sim/types';

const sdRoundBox = sdRoundBoxImp;
const UPRIGHT = 0.999999;
const GOLDEN = 0.6180339887498949;
const MIN_ITERS = 24;
const EDGE_ITERS = 14;
/** Below this a direction component counts as parallel to a slab (no crossing). */
const PARALLEL = 1e-12;
const _p = { x: 0, y: 0, z: 0 };

/** Column result register: `hit` false when the line misses; bottom/top in mm. */
export interface ColumnHit { hit: boolean; bottom: number; top: number }

/** A column routine (search or analytic). */
export type ColumnFn = (e: PrimEntry, x: number, z: number, out: ColumnHit) => ColumnHit;

export function entryOf(p: Primitive): PrimEntry {
  return makePrimEntry(p, false);
}

/** Fills `out` with the column interval of `e` at (x, z) (search routine). */
export function primColumn(e: PrimEntry, x: number, z: number, out: ColumnHit): ColumnHit {
  out.hit = false;
  if (x < e.minX || x > e.maxX || z < e.minZ || z > e.maxZ) return out;
  if (e.m11 > UPRIGHT && (e.shape === SHAPE_BOX || e.shape === SHAPE_CYLINDER)) return uprightColumn(e, x, z, out);
  return searchColumn(e, x, z, out);
}

/** Fills `out` with the column interval of `e` at (x, z) (closed-form routine; upright shapes: see the header). */
export function primColumnAnalytic(e: PrimEntry, x: number, z: number, out: ColumnHit): ColumnHit {
  out.hit = false;
  if (x < e.minX || x > e.maxX || z < e.minZ || z > e.maxZ) return out;
  if (e.m11 > UPRIGHT && e.shape === SHAPE_BOX && e.round === 0) return uprightSharpBox(e, x, z, out);
  if (e.m11 > UPRIGHT && (e.shape === SHAPE_BOX || e.shape === SHAPE_CYLINDER)) return uprightColumn(e, x, z, out);
  // the line in local space: l(t) = o + t u, world y = py + t
  const dx = x - e.px, dz = z - e.pz;
  L.ox = e.m00 * dx + e.m20 * dz; L.oy = e.m01 * dx + e.m21 * dz; L.oz = e.m02 * dx + e.m22 * dz;
  L.ux = e.m10; L.uy = e.m11; L.uz = e.m12;
  const s = e.size;
  switch (e.shape) {
    case SHAPE_BOX: return roundedColumn(e, x, z, out, boxOuter(s), boxInner(s, e.round));
    case SHAPE_CYLINDER: return roundedColumn(e, x, z, out, cylOuter(s), cylInner(s, e.round));
    case SHAPE_CAPSULE: return exact(e, out, capsule(s.x, s.y));
    case SHAPE_ELLIPSOID: return exact(e, out, ellipsoid(s.x, s.y, s.z));
    default: return searchColumn(e, x, z, out);
  }
}

function uprightColumn(e: PrimEntry, x: number, z: number, out: ColumnHit): ColumnHit {
  const dx = x - e.px, dz = z - e.pz;
  const lx = e.m00 * dx + e.m20 * dz, lz = e.m02 * dx + e.m22 * dz;
  const s = e.size;
  if (e.shape === SHAPE_BOX) {
    _p.x = lx; _p.y = 0; _p.z = lz;
    if (sdRoundBox(_p, s, e.round) > 0) return out;
  } else if (lx * lx + lz * lz > s.x * s.x) return out;
  out.hit = true;
  out.bottom = e.py - s.y;
  out.top = e.py + s.y;
  return out;
}

/**
 * uprightColumn for a box without rounding: the same decision without the distance call (sdRoundBox with r = 0 at
 * local y = 0 is positive exactly when |lx| > s.x or |lz| > s.z). Slabs, walls and ceilings take most columns.
 */
function uprightSharpBox(e: PrimEntry, x: number, z: number, out: ColumnHit): ColumnHit {
  const dx = x - e.px, dz = z - e.pz, s = e.size;
  const lx = e.m00 * dx + e.m20 * dz, lz = e.m02 * dx + e.m22 * dz;
  if (Math.abs(lx) > s.x || Math.abs(lz) > s.z) return out;
  out.hit = true;
  out.bottom = e.py - s.y;
  out.top = e.py + s.y;
  return out;
}

function searchColumn(e: PrimEntry, x: number, z: number, out: ColumnHit): ColumnHit {
  let a = e.minY, b = e.maxY;
  // golden-section search for the deepest point of the line (the distance is convex along a line)
  let c = b - GOLDEN * (b - a), d = a + GOLDEN * (b - a);
  let fc = primEval(e, x, c, z, null), fd = primEval(e, x, d, z, null);
  for (let i = 0; i < MIN_ITERS; i++) {
    if (fc < fd) { b = d; d = c; fd = fc; c = b - GOLDEN * (b - a); fc = primEval(e, x, c, z, null); }
    else { a = c; c = d; fc = fd; d = a + GOLDEN * (b - a); fd = primEval(e, x, d, z, null); }
  }
  const ym = (a + b) / 2;
  if (primEval(e, x, ym, z, null) > 0) return out;
  out.hit = true;
  out.bottom = edge(e, x, z, e.minY, ym);
  out.top = edge(e, x, z, e.maxY, ym);
  return out;
}

/** Bisection between an outside point `yo` and an inside point `yi`. */
function edge(e: PrimEntry, x: number, z: number, yo: number, yi: number): number {
  for (let i = 0; i < EDGE_ITERS; i++) {
    const m = (yo + yi) / 2;
    if (primEval(e, x, m, z, null) > 0) yo = m; else yi = m;
  }
  return (yo + yi) / 2;
}

// ---- closed-form line intersections in local space (module registers: no allocation) ----

/** The current line (origin o at world y = py, unit direction u). */
const L = { ox: 0, oy: 0, oz: 0, ux: 0, uy: 0, uz: 0 };
/** Interval registers [lo, hi] (empty when lo > hi): A = outer solid, B = inner (subset) solid, T = scratch. */
const A = { lo: 0, hi: 0 }, B = { lo: 0, hi: 0 }, T = { lo: 0, hi: 0 };
type Iv = typeof A;

const empty = (r: Iv): Iv => { r.lo = Infinity; r.hi = -Infinity; return r; };
const all = (r: Iv): Iv => { r.lo = -Infinity; r.hi = Infinity; return r; };

/** Clips r to the slab |o + t u| <= h along one axis. */
function slab(r: Iv, o: number, u: number, h: number): Iv {
  if (u > -PARALLEL && u < PARALLEL) return o > h || o < -h ? empty(r) : r;
  let t0 = (-h - o) / u, t1 = (h - o) / u;
  if (t0 > t1) { const q = t0; t0 = t1; t1 = q; }
  if (t0 > r.lo) r.lo = t0;
  if (t1 < r.hi) r.hi = t1;
  return r;
}

/** r = the box with half extents (hx, hy, hz). */
function box(r: Iv, hx: number, hy: number, hz: number): Iv {
  all(r);
  slab(r, L.ox, L.ux, hx);
  slab(r, L.oy, L.uy, hy);
  return slab(r, L.oz, L.uz, hz);
}

/** Clips r to the solid quadratic a t^2 + 2 b t + c <= 0 (a >= 0). */
function quad(r: Iv, a: number, b: number, c: number): Iv {
  if (a < PARALLEL) return c > 0 ? empty(r) : r;
  const disc = b * b - a * c;
  if (disc < 0) return empty(r);
  const q = Math.sqrt(disc);
  const t0 = (-b - q) / a, t1 = (-b + q) / a;
  if (t0 > r.lo) r.lo = t0;
  if (t1 < r.hi) r.hi = t1;
  return r;
}

/** r = the cylinder along local y with radius rad and half height h. */
function cylinder(r: Iv, rad: number, h: number): Iv {
  all(r);
  quad(r, L.ux * L.ux + L.uz * L.uz, L.ox * L.ux + L.oz * L.uz, L.ox * L.ox + L.oz * L.oz - rad * rad);
  return slab(r, L.oy, L.uy, h);
}

/** r = the sphere of radius rad centred at local (0, cy, 0). */
function sphere(r: Iv, cy: number, rad: number): Iv {
  all(r);
  const oy = L.oy - cy;
  return quad(r, L.ux * L.ux + L.uy * L.uy + L.uz * L.uz, L.ox * L.ux + oy * L.uy + L.oz * L.uz, L.ox * L.ox + oy * oy + L.oz * L.oz - rad * rad);
}

/** Widens r to also cover s (both convex pieces of one convex solid). */
function join(r: Iv, s: Iv): void {
  if (s.lo > s.hi) return;
  if (s.lo < r.lo) r.lo = s.lo;
  if (s.hi > r.hi) r.hi = s.hi;
}

const boxOuter = (s: { x: number; y: number; z: number }): Iv => box(A, s.x, s.y, s.z);

/** The rounded box minus its rounded rims: the union of the inner box stretched to the outer faces per axis. */
function boxInner(s: { x: number; y: number; z: number }, round: number): Iv {
  const rr = Math.max(0, Math.min(round, s.x, s.y, s.z));
  if (rr === 0) { B.lo = A.lo; B.hi = A.hi; return B; }
  const ix = s.x - rr, iy = s.y - rr, iz = s.z - rr;
  empty(B);
  join(B, box(T, s.x, iy, iz));
  join(B, box(T, ix, s.y, iz));
  join(B, box(T, ix, iy, s.z));
  return B;
}

const cylOuter = (s: { x: number; y: number }): Iv => cylinder(A, s.x, s.y);

/** The rounded cylinder minus its rounded rim: the inner cylinder stretched radially and along the axis. */
function cylInner(s: { x: number; y: number }, round: number): Iv {
  const rr = Math.max(0, Math.min(round, s.x, s.y));
  if (rr === 0) { B.lo = A.lo; B.hi = A.hi; return B; }
  empty(B);
  join(B, cylinder(T, s.x - rr, s.y));
  join(B, cylinder(T, s.x, s.y - rr));
  return B;
}

/** The capsule along local y: half length h, radius rad (a cylinder and two end spheres). */
function capsule(rad: number, h: number): Iv {
  cylinder(A, rad, h);
  if (A.lo > A.hi) empty(A);
  join(A, sphere(T, h, rad));
  join(A, sphere(T, -h, rad));
  return A;
}

/** The ellipsoid with radii (rx, ry, rz): its zero set is exactly the distance function's. */
function ellipsoid(rx: number, ry: number, rz: number): Iv {
  const ax = L.ux / rx, ay = L.uy / ry, az = L.uz / rz, bx = L.ox / rx, by = L.oy / ry, bz = L.oz / rz;
  return quad(all(A), ax * ax + ay * ay + az * az, ax * bx + ay * by + az * bz, bx * bx + by * by + bz * bz - 1);
}

function exact(e: PrimEntry, out: ColumnHit, r: Iv): ColumnHit {
  if (r.lo > r.hi) return out;
  out.hit = true;
  out.bottom = e.py + r.lo;
  out.top = e.py + r.hi;
  return out;
}

/**
 * The column of a solid with rounded rims from the interval of its outer solid (a superset) and of its inner
 * pieces (a subset): equal ends are exact; a rim between them is bisected on the true distance.
 */
function roundedColumn(e: PrimEntry, x: number, z: number, out: ColumnHit, outer: Iv, inner: Iv): ColumnHit {
  if (outer.lo > outer.hi) return out;
  if (inner.lo > inner.hi) return searchColumn(e, x, z, out); // the line clips nothing but a rounded rim
  const py = e.py;
  out.hit = true;
  out.bottom = inner.lo - outer.lo > 1e-9 ? edge(e, x, z, py + outer.lo, py + inner.lo) : py + outer.lo;
  out.top = outer.hi - inner.hi > 1e-9 ? edge(e, x, z, py + outer.hi, py + inner.hi) : py + outer.hi;
  return out;
}
