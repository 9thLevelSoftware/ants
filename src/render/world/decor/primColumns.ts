// Primitives (static, moved and dynamic) bucketed by their XZ footprint, for the two questions placement asks (pure):
//  - is the ground at (x, z) covered by a solid (a slab over the joint sand, a stone, a log)?
//  - what is the top surface of the solid there (leaves on slabs lie on the slab, GDD 04 §9 "top-surface map")?
// Distances come from the sim's primitive evaluation (positive outside the solid), so decor and collision agree.
import { makePrimEntry, primEval, type PrimEntry } from '@/sim/world/primHash';
import { PrimFlag, type Primitive } from '@/sim/types';

const BUCKET_MM = 256;

export class PrimColumns {
  private readonly buckets = new Map<number, PrimEntry[]>();
  /** Every entry: the static primitives in world order, then later additions (dynamic, moved) in update order. */
  readonly entries: PrimEntry[] = [];
  private readonly byId = new Map<number, PrimEntry>();
  private readonly nb: number;

  /** `prims` are the world's primitives; DYNAMIC ones are skipped (they come from the simulation via update). */
  constructor(prims: readonly Primitive[], worldSize: number) {
    this.nb = Math.max(1, Math.ceil(worldSize / BUCKET_MM));
    for (const p of prims) if (!(p.flags & PrimFlag.DYNAMIC)) this.add(p);
  }

  /** XZ bounds of the current entry of a primitive id (null if absent). */
  boundsOf(id: number): { x0: number; z0: number; x1: number; z1: number } | null {
    const e = this.byId.get(id);
    return e ? { x0: e.minX, z0: e.minZ, x1: e.maxX, z1: e.maxZ } : null;
  }

  /**
   * Replaces the primitives in `set` (by id; added when new) and removes the ids in `remove`. An entry keeps its
   * place in `entries` when replaced, so the order (and every block's records) does not depend on update history.
   */
  update(set: readonly Primitive[], remove: readonly number[]): void {
    for (const id of remove) {
      const e = this.byId.get(id);
      if (!e) continue;
      this.unbucket(e);
      this.byId.delete(id);
      this.entries.splice(this.entries.indexOf(e), 1);
    }
    for (const p of set) {
      const old = this.byId.get(p.id);
      if (!old) { this.add(p); continue; }
      this.unbucket(old);
      const e = makePrimEntry(p, false);
      this.entries[this.entries.indexOf(old)] = e;
      this.byId.set(p.id, e);
      this.bucket(e);
    }
  }

  private add(p: Primitive): void {
    const e = makePrimEntry(p, false);
    this.entries.push(e);
    this.byId.set(p.id, e);
    this.bucket(e);
  }

  private bucket(e: PrimEntry): void {
    this.forBuckets(e, (key) => {
      let l = this.buckets.get(key);
      if (!l) this.buckets.set(key, (l = []));
      l.push(e);
    });
  }

  private unbucket(e: PrimEntry): void {
    this.forBuckets(e, (key) => {
      const l = this.buckets.get(key), i = l ? l.indexOf(e) : -1;
      if (i >= 0) l!.splice(i, 1);
    });
  }

  private forBuckets(e: PrimEntry, fn: (key: number) => void): void {
    const i0 = this.cl(e.minX), i1 = this.cl(e.maxX), k0 = this.cl(e.minZ), k1 = this.cl(e.maxZ);
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) fn(k * this.nb + i);
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
