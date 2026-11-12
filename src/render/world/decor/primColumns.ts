// Static primitives bucketed by their XZ footprint, for the two questions placement asks (pure):
//  - is the ground at (x, z) covered by a solid (a slab over the joint sand, a stone, a log)?
//  - what is the top surface of the solid there (leaves on slabs lie on the slab, GDD 04 §9 "top-surface map")?
// Distances come from the sim's primitive evaluation (positive outside the solid), so decor and collision agree.
import { makePrimEntry, primEval, type PrimEntry } from '@/sim/world/primHash';
import { PrimFlag, type Primitive } from '@/sim/types';

const BUCKET_MM = 256;

export class PrimColumns {
  private readonly buckets = new Map<number, PrimEntry[]>();
  /** Every static entry, in world order. */
  readonly entries: PrimEntry[] = [];
  private readonly nb: number;

  constructor(prims: readonly Primitive[], worldSize: number) {
    this.nb = Math.max(1, Math.ceil(worldSize / BUCKET_MM));
    for (const p of prims) {
      if (p.flags & PrimFlag.DYNAMIC) continue;
      const e = makePrimEntry(p, false);
      this.entries.push(e);
      const i0 = this.cl(e.minX), i1 = this.cl(e.maxX), k0 = this.cl(e.minZ), k1 = this.cl(e.maxZ);
      for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
        const key = k * this.nb + i;
        let l = this.buckets.get(key);
        if (!l) this.buckets.set(key, (l = []));
        l.push(e);
      }
    }
  }

  private cl(v: number): number {
    return Math.min(this.nb - 1, Math.max(0, Math.floor(v / BUCKET_MM)));
  }

  /** Entries whose XZ bounds contain (x, z). */
  at(x: number, z: number): PrimEntry[] {
    const l = this.buckets.get(this.cl(z) * this.nb + this.cl(x));
    if (!l) return [];
    return l.filter((e) => x >= e.minX && x <= e.maxX && z >= e.minZ && z <= e.maxZ);
  }

  /** Is the point (x, y, z) inside any solid (distance < -margin)? */
  inside(x: number, y: number, z: number, margin = 0): boolean {
    for (const e of this.at(x, z)) if (primEval(e, x, y, z, null) < -margin) return true;
    return false;
  }

  /**
   * Highest solid top over (x, z) that lies within [yMin, yMax], mm, with the primitive that owns it; null if the
   * column is free there. Found by scanning down and bisecting the surface.
   */
  topAt(x: number, z: number, yMin: number, yMax: number): { y: number; prim: Primitive } | null {
    let best: { y: number; prim: Primitive } | null = null;
    for (const e of this.at(x, z)) {
      const y = topOfEntry(e, x, z, yMin, yMax);
      if (y !== null && (!best || y > best.y)) best = { y, prim: e.prim };
    }
    return best;
  }
}

/** Highest surface point of one primitive over (x, z) within [yMin, yMax], mm; null if the column misses it. */
export function topOfEntry(e: PrimEntry, x: number, z: number, yMin: number, yMax: number): number | null {
  if (x < e.minX || x > e.maxX || z < e.minZ || z > e.maxZ) return null;
  const hi = Math.min(yMax, e.maxY + 0.5), lo = Math.max(yMin, e.minY - 0.5);
  if (hi <= lo || primEval(e, x, hi, z, null) <= 0) return null; // column top inside: no top in range
  const steps = 24, dy = (hi - lo) / steps;
  let prevY = hi;
  for (let s = 1; s <= steps; s++) {
    const y = hi - s * dy;
    if (primEval(e, x, y, z, null) <= 0) {
      let a = y, b = prevY; // a inside, b outside
      for (let it = 0; it < 18; it++) { const m = (a + b) / 2; if (primEval(e, x, m, z, null) <= 0) a = m; else b = m; }
      return a;
    }
    prevY = y;
  }
  return null;
}
