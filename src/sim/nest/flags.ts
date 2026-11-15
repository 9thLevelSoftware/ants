// Per-voxel flags LOOSE / NATURAL / PLUG (GDD 03 §1.1) in WorldDelta.carveFlags: chunk arrays parallel to the
// carve grid's chunks (same keys and sample order), present only for chunks with a non-zero flag. The arrays ARE
// the saved state; the key -> chunk Map is a cache rebuilt from them.

import type { CarveFlagsData } from '@/sim/types';
import { CHUNK3, chunkKey } from './carve/keys';

export class FlagStore {
  private readonly index = new Map<number, number>();

  /** Runtime counter of flag edits (add / clear): caches keyed on the flags compare it. */
  version = 0;
  constructor(readonly data: CarveFlagsData) {
    this.rebuild();
  }

  rebuild(): void {
    this.index.clear();
    for (let n = 0; n < this.data.keys.length; n++) this.index.set(this.data.keys[n], n);
  }

  /** Flag bits of sample (i, j, k). */
  get(i: number, j: number, k: number): number {
    const n = this.index.get(chunkKey(i >> 4, j >> 4, k >> 4));
    return n === undefined ? 0 : this.data.chunks[n][(i & 15) | ((j & 15) << 4) | ((k & 15) << 8)];
  }

  /** True when no flags are stored in the chunks overlapping the sample box. */
  noneIn(i0: number, j0: number, k0: number, i1: number, j1: number, k1: number): boolean {
    for (let cz = k0 >> 4; cz <= k1 >> 4; cz++)
      for (let cy = j0 >> 4; cy <= j1 >> 4; cy++)
        for (let cx = i0 >> 4; cx <= i1 >> 4; cx++) if (this.index.has(chunkKey(cx, cy, cz))) return false;
    return true;
  }

  /** ORs bits into sample (i, j, k). */
  add(i: number, j: number, k: number, bits: number): void {
    this.version++;
    if (bits === 0) return;
    const key = chunkKey(i >> 4, j >> 4, k >> 4);
    let n = this.index.get(key);
    if (n === undefined) {
      n = this.data.keys.length;
      this.data.keys.push(key);
      this.data.chunks.push(new Uint8Array(CHUNK3));
      this.index.set(key, n);
    }
    this.data.chunks[n][(i & 15) | ((j & 15) << 4) | ((k & 15) << 8)] |= bits;
  }

  /** Clears bits of sample (i, j, k); drops the chunk once it holds no flag. */
  clear(i: number, j: number, k: number, bits: number): void {
    this.version++;
    const key = chunkKey(i >> 4, j >> 4, k >> 4);
    const n = this.index.get(key);
    if (n === undefined) return;
    const a = this.data.chunks[n];
    const idx = (i & 15) | ((j & 15) << 4) | ((k & 15) << 8);
    if ((a[idx] & bits) === 0) return;
    a[idx] &= ~bits;
    if (a[idx] === 0 && isEmpty(a)) this.removeChunk(key, n);
  }

  /** Number of flagged samples (tests, stats). */
  count(bits: number): number {
    let c = 0;
    for (const a of this.data.chunks) for (let s = 0; s < CHUNK3; s++) if ((a[s] & bits) !== 0) c++;
    return c;
  }

  private removeChunk(key: number, n: number): void {
    const { keys, chunks } = this.data;
    const last = keys.length - 1;
    if (n !== last) {
      keys[n] = keys[last];
      chunks[n] = chunks[last];
      this.index.set(keys[n], n);
    }
    keys.pop();
    chunks.pop();
    this.index.delete(key);
  }
}

function isEmpty(a: Uint8Array): boolean {
  for (let s = 0; s < CHUNK3; s++) if (a[s] !== 0) return false;
  return true;
}
