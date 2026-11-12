// 2D grid over the X/Z footprints (AABBs) of the world's static primitives, kept in step with ctx.world.prims
// as placers append to it. Queries return primitive indices in ascending order (deterministic).

import type { PrimEntry } from '@/sim/world/primHash';
import type { Primitive } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { entryOf } from './column';

export class PrimIndex {
  readonly cell: number;
  readonly n: number;
  private cells: number[][];
  readonly entries: PrimEntry[] = [];
  private stamp = 0;
  private stamps: Uint32Array = new Uint32Array(64);

  constructor(size: number, cell: number) {
    this.cell = cell;
    this.n = Math.max(1, Math.ceil(size / cell));
    this.cells = Array.from({ length: this.n * this.n }, () => []);
  }

  /** Indexes prims[from..] (call after appending). VISUAL_ONLY primitives are skipped. */
  sync(prims: readonly Primitive[]): void {
    for (let i = this.entries.length; i < prims.length; i++) {
      const e = entryOf(prims[i]);
      this.entries.push(e);
      if ((prims[i].flags & PrimFlag.VISUAL_ONLY) !== 0) continue;
      const [i0, i1, k0, k1] = this.range(e.minX, e.maxX, e.minZ, e.maxZ);
      for (let k = k0; k <= k1; k++) for (let j = i0; j <= i1; j++) this.cells[k * this.n + j].push(i);
    }
    if (this.stamps.length < this.entries.length) {
      const s = new Uint32Array(this.entries.length * 2);
      s.set(this.stamps);
      this.stamps = s;
    }
  }

  private range(x0: number, x1: number, z0: number, z1: number): [number, number, number, number] {
    const c = this.cell, m = this.n - 1;
    const cl = (v: number) => (v < 0 ? 0 : v > m ? m : v);
    return [cl(Math.floor(x0 / c)), cl(Math.floor(x1 / c)), cl(Math.floor(z0 / c)), cl(Math.floor(z1 / c))];
  }

  /** Indices of primitives whose AABB overlaps the X/Z box (sorted ascending, into out). */
  query(x0: number, z0: number, x1: number, z1: number, out: number[]): number[] {
    out.length = 0;
    const st = ++this.stamp;
    const [i0, i1, k0, k1] = this.range(x0, x1, z0, z1);
    for (let k = k0; k <= k1; k++) {
      for (let j = i0; j <= i1; j++) {
        for (const idx of this.cells[k * this.n + j]) {
          if (this.stamps[idx] === st) continue;
          this.stamps[idx] = st;
          const e = this.entries[idx];
          if (e.maxX < x0 || e.minX > x1 || e.maxZ < z0 || e.minZ > z1) continue;
          out.push(idx);
        }
      }
    }
    return out.sort((a, b) => a - b);
  }
}
