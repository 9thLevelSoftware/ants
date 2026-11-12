// Vertical extent of a primitive along the column (x, z): the interval [bottom, top] where the vertical line
// is inside the solid. Analytic for boxes and cylinders with an upright axis (yaw-only rotations, the common
// case); a convex search on the signed distance otherwise. Used for the top-surface map, nav, shade and resting.

import { makePrimEntry, primEval, SHAPE_BOX, SHAPE_CYLINDER, type PrimEntry } from '@/sim/world/primHash';
import { sdRoundBox } from '@/core/math/sdf';
import type { Primitive } from '@/sim/types';

const UPRIGHT = 0.999999;
const GOLDEN = 0.6180339887498949;
const MIN_ITERS = 24;
const EDGE_ITERS = 14;
const _p = { x: 0, y: 0, z: 0 };

/** Column result register: `hit` false when the line misses; bottom/top in mm. */
export interface ColumnHit { hit: boolean; bottom: number; top: number }

export function entryOf(p: Primitive): PrimEntry {
  return makePrimEntry(p, false);
}

/** Fills `out` with the column interval of `e` at (x, z). */
export function primColumn(e: PrimEntry, x: number, z: number, out: ColumnHit): ColumnHit {
  out.hit = false;
  if (x < e.minX || x > e.maxX || z < e.minZ || z > e.maxZ) return out;
  if (e.m11 > UPRIGHT && (e.shape === SHAPE_BOX || e.shape === SHAPE_CYLINDER)) return uprightColumn(e, x, z, out);
  return searchColumn(e, x, z, out);
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
