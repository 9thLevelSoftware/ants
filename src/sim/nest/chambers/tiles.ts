// Dense scratch arrays of one chamber-detection pass, laid out per carve chunk: every chunk of the pass gets a
// slot of CHUNK3 samples, and a small chunk-index grid over the chunks' bounding range maps (cx, cy, cz) to the
// slot. Sample lookups are plain index arithmetic (no Map per sample), which is what makes the 26-neighbour,
// disk and ball scans of detect.ts cheap. Samples in chunks outside the pass read as solid / unclaimed.
// The buffers are kept between passes (per Sim) and only the used part is cleared.

import type { CarveGrid } from '@/sim/types';
import { CHUNK3 as CHUNK3Imp, keyCx, keyCy, keyCz, type VoxelBox } from '../carve/keys';

// hot import re-bound as a local const (docs/design/tdd/02-kernel.md §2.11: Vitest reads imports through getters)
const CHUNK3 = CHUNK3Imp;

export class PassGrid {
  /** Openness bytes (copied from the carve chunks). */
  open = new Uint8Array(0);
  /** 1 = core sample. */
  core = new Uint8Array(0);
  /** Component index + 1 of a core sample (0 none). */
  comp = new Int32Array(0);
  /** Region (component index + 1) that claimed the sample (0 none). */
  owner = new Int32Array(0);
  private slots = new Int32Array(0);
  /** Per slot: 1 when the whole chunk lies inside the pass box. */
  private inside = new Uint8Array(0);
  private cx0 = 0; private cy0 = 0; private cz0 = 0;
  private nx = 0; private ny = 0; private nz = 0;

  /** Prepares the grid for the given chunk keys (all must be stored chunks of `carve`) and the pass box. */
  reset(carve: CarveGrid, keys: readonly number[], box: VoxelBox): void {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const key of keys) {
      const cx = keyCx(key), cy = keyCy(key), cz = keyCz(key);
      if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy; if (cz < z0) z0 = cz; if (cz > z1) z1 = cz;
    }
    if (keys.length === 0) { x0 = y0 = z0 = 0; x1 = y1 = z1 = -1; }
    this.cx0 = x0; this.cy0 = y0; this.cz0 = z0;
    this.nx = x1 - x0 + 1; this.ny = y1 - y0 + 1; this.nz = z1 - z0 + 1;
    const cells = this.nx * this.ny * this.nz;
    if (this.slots.length < cells) this.slots = new Int32Array(cells);
    this.slots.fill(-1, 0, cells);
    const n = keys.length * CHUNK3;
    if (this.open.length < n) {
      this.open = new Uint8Array(n); this.core = new Uint8Array(n); this.comp = new Int32Array(n); this.owner = new Int32Array(n);
    } else {
      this.core.fill(0, 0, n); this.comp.fill(0, 0, n); this.owner.fill(0, 0, n);
    }
    if (this.inside.length < keys.length) this.inside = new Uint8Array(keys.length);
    keys.forEach((key, s) => {
      const cx = keyCx(key), cy = keyCy(key), cz = keyCz(key);
      this.inside[s] = cx * 16 >= box.i0 && cx * 16 + 15 <= box.i1 && cy * 16 >= box.j0 && cy * 16 + 15 <= box.j1
        && cz * 16 >= box.k0 && cz * 16 + 15 <= box.k1 ? 1 : 0;
      this.slots[((cz - this.cz0) * this.ny + (cy - this.cy0)) * this.nx + (cx - this.cx0)] = s;
      const a = carve.chunk(cx, cy, cz);
      if (a) this.open.set(a, s * CHUNK3); else this.open.fill(0, s * CHUNK3, (s + 1) * CHUNK3);
    });
  }

  /**
   * True when every sample within `m` (in x and z) and `my` (in y) of sample index `x` (from at()) lies in the same
   * chunk, and that chunk lies inside the pass box: its neighbours are then at `x + delta(di, dj, dk)`.
   */
  interior(x: number, m: number, my: number): boolean {
    const l = x & 4095, li = l & 15, lj = (l >> 4) & 15, lk = l >> 8;
    return li >= m && li <= 15 - m && lk >= m && lk <= 15 - m && lj >= my && lj <= 15 - my && this.inside[x >> 12] === 1;
  }

  /** Does the chunk of sample index `x` lie wholly inside the pass box? */
  slotInside(x: number): boolean {
    return this.inside[x >> 12] === 1;
  }

  /** Index of sample (i, j, k) in the arrays, or -1 when its chunk is not part of the pass. */
  at(i: number, j: number, k: number): number {
    const cx = (i >> 4) - this.cx0, cy = (j >> 4) - this.cy0, cz = (k >> 4) - this.cz0;
    if (cx < 0 || cy < 0 || cz < 0 || cx >= this.nx || cy >= this.ny || cz >= this.nz) return -1;
    const s = this.slots[(cz * this.ny + cy) * this.nx + cx];
    return s < 0 ? -1 : s * CHUNK3 + ((i & 15) | ((j & 15) << 4) | ((k & 15) << 8));
  }
}

/** Index offset of a neighbour (di, dj, dk) inside one chunk slot (layout i | j << 4 | k << 8). */
export function delta(di: number, dj: number, dk: number): number {
  return di + dj * 16 + dk * 256;
}
