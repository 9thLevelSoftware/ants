// Admission counters for a full layer. At a cap, a deposit into a NEW cell (or chunk) is not stored at once: it
// accumulates here under the cell code (chunk key) until the total beats the layer's eviction floor, and only then
// is the newcomer admitted (evicting the weakest). So repeated weak deposits add up, and a heavily reinforced new
// trail wins its slot within a pass or two, while one stray dab cannot force an eviction (no thrash).
//
// Persisted as a flat number[] of (code, value) pairs in the layer; the code -> index map is rebuilt on load. The
// table is small and fixed in size; when full, a newcomer replaces the weakest entry (ties: smallest code) only if
// it is stronger, so the content never depends on anything but the call sequence.

import { PHERO_EPS } from './balance';

export class PendingTable {
  /** Flat (code, value) pairs: the persisted array itself. */
  readonly data: number[];
  readonly max: number;
  private readonly index = new Map<number, number>();

  constructor(data: number[], max: number) {
    this.data = data;
    this.max = max;
    this.rebuild();
  }

  get size(): number {
    return this.data.length >> 1;
  }

  /** Rebuilds the index; drops malformed, duplicate, non-positive and surplus entries. */
  rebuild(): void {
    const d = this.data;
    this.index.clear();
    let w = 0;
    for (let r = 0; r + 1 < d.length; r += 2) {
      const code = d[r], v = d[r + 1];
      if (!Number.isSafeInteger(code) || !(v > 0) || !Number.isFinite(v) || this.index.has(code)) continue;
      if ((w >> 1) >= this.max) break;
      d[w] = code; d[w + 1] = v;
      this.index.set(code, w);
      w += 2;
    }
    d.length = w;
  }

  /** Adds amount to the entry of `code` (creating it if there is room or it beats the weakest) and returns its total. */
  accumulate(code: number, amount: number): number {
    const d = this.data;
    const at = this.index.get(code);
    if (at !== undefined) return (d[at + 1] += amount);
    if (this.size < this.max) {
      this.index.set(code, d.length);
      d.push(code, amount);
      return amount;
    }
    let weak = 0;
    for (let i = 2; i < d.length; i += 2) {
      if (d[i + 1] < d[weak + 1] || (d[i + 1] === d[weak + 1] && d[i] < d[weak])) weak = i;
    }
    if (!(amount > d[weak + 1])) return amount;
    this.index.delete(d[weak]);
    d[weak] = code; d[weak + 1] = amount;
    this.index.set(code, weak);
    return amount;
  }

  /** Removes the entry of `code` (swap with the last pair). */
  remove(code: number): void {
    const at = this.index.get(code);
    if (at === undefined) return;
    const d = this.data, last = d.length - 2;
    this.index.delete(code);
    if (at !== last) {
      d[at] = d[last]; d[at + 1] = d[last + 1];
      this.index.set(d[at], at);
    }
    d.length = last;
  }

  /** Multiplies every entry by f and drops those below PHERO_EPS (order of the rest kept). */
  scale(f: number): void {
    const d = this.data;
    if (d.length === 0) return;
    let w = 0;
    for (let r = 0; r < d.length; r += 2) {
      const v = d[r + 1] * f;
      if (!(v >= PHERO_EPS)) continue;
      d[w] = d[r]; d[w + 1] = v;
      w += 2;
    }
    if (w !== d.length) {
      d.length = w;
      this.index.clear();
      for (let i = 0; i < w; i += 2) this.index.set(d[i], i);
    }
  }

  /** Invariant problems (tests): empty when consistent. */
  validate(tag: string): string[] {
    const bad: string[] = [];
    const d = this.data;
    if (d.length % 2 !== 0) bad.push(`${tag}: odd pending array`);
    if (this.size > this.max) bad.push(`${tag}: pending over capacity`);
    if (this.index.size !== this.size) bad.push(`${tag}: pending index size`);
    for (let i = 0; i < d.length; i += 2) {
      if (this.index.get(d[i]) !== i) bad.push(`${tag}: pending index mismatch`);
      if (!(d[i + 1] > 0)) bad.push(`${tag}: pending value ${d[i + 1]}`);
    }
    return bad;
  }
}
