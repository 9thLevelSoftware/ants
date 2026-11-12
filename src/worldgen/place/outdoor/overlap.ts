// Dense interpenetration test of two primitives: the smaller one is sampled on a lattice adapted to its own
// proportions (a thin branch through a thin fence panel slips between the kit's fixed 3 x 3 x 3 lattice).

import { primEval, type PrimEntry } from '@/sim/world/primHash';
import type { GenContext } from '../../kit/context';
import { entryOf } from '../../kit/column';
import { primIndex } from '../../kit/surface';

const MAX_PER_AXIS = 32;

/** True if a point lies more than `tol` mm inside both primitives. */
export function primsOverlap(a: PrimEntry, b: PrimEntry, tol: number): boolean {
  if (a.maxX < b.minX || b.maxX < a.minX || a.maxY < b.minY || b.maxY < a.minY || a.maxZ < b.minZ || b.maxZ < a.minZ) return false;
  const va = (a.maxX - a.minX) * (a.maxY - a.minY) * (a.maxZ - a.minZ), vb = (b.maxX - b.minX) * (b.maxY - b.minY) * (b.maxZ - b.minZ);
  const [s, o] = va <= vb ? [a, b] : [b, a];
  // only the part of the smaller box inside the other's box needs sampling
  const x0 = Math.max(s.minX, o.minX), x1 = Math.min(s.maxX, o.maxX), y0 = Math.max(s.minY, o.minY), y1 = Math.min(s.maxY, o.maxY);
  const z0 = Math.max(s.minZ, o.minZ), z1 = Math.min(s.maxZ, o.maxZ);
  const m = Math.max(1e-3, Math.min(s.maxX - s.minX, s.maxY - s.minY, s.maxZ - s.minZ)) / 2;
  const n = (e: number) => Math.max(2, Math.min(MAX_PER_AXIS, Math.ceil(e / m)));
  const nx = n(x1 - x0), ny = n(y1 - y0), nz = n(z1 - z0);
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) for (let k = 0; k < nz; k++) {
    const x = x0 + ((x1 - x0) * (i + 0.5)) / nx, y = y0 + ((y1 - y0) * (j + 0.5)) / ny, z = z0 + ((z1 - z0) * (k + 0.5)) / nz;
    if (primEval(s, x, y, z, null) < -tol && primEval(o, x, y, z, null) < -tol) return true;
  }
  return false;
}

const _hits: number[] = [];
/** True if a primitive of object `self` (prims [start, start + count)) overlaps a primitive of another object. */
export function objectOverlaps(ctx: GenContext, start: number, count: number, self: number, tol: number, ignore: readonly number[] = []): boolean {
  const ix = primIndex(ctx);
  for (let i = start; i < start + count; i++) {
    const e = entryOf(ctx.world.prims[i]);
    ix.query(e.minX, e.minZ, e.maxX, e.maxZ, _hits);
    for (const h of _hits) {
      const o = ix.entries[h];
      if (o.prim.objectId === self || ignore.includes(o.prim.objectId)) continue;
      if (primsOverlap(e, o, tol)) return true;
    }
  }
  return false;
}
