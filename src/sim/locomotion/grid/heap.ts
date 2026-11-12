// Binary min-heap of integer items keyed by a float priority, on typed arrays (grows when full). Ties pop in
// insertion-independent but deterministic order (lower item index first), so planning is reproducible.

export class MinHeap {
  private items: Int32Array;
  private keys: Float64Array;
  size = 0;

  constructor(capacity = 1024) {
    this.items = new Int32Array(capacity);
    this.keys = new Float64Array(capacity);
  }

  clear(): void {
    this.size = 0;
  }

  push(item: number, key: number): void {
    if (this.size === this.items.length) this.grow();
    let i = this.size++;
    const items = this.items, keys = this.keys;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(key, item, keys[p], items[p])) break;
      items[i] = items[p]; keys[i] = keys[p];
      i = p;
    }
    items[i] = item; keys[i] = key;
  }

  /** Smallest item (the heap must not be empty). */
  pop(): number {
    const items = this.items, keys = this.keys;
    const top = items[0];
    const n = --this.size;
    if (n > 0) {
      const item = items[n], key = keys[n];
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const r = l + 1;
        const c = r < n && this.less(keys[r], items[r], keys[l], items[l]) ? r : l;
        if (!this.less(keys[c], items[c], key, item)) break;
        items[i] = items[c]; keys[i] = keys[c];
        i = c;
      }
      items[i] = item; keys[i] = key;
    }
    return top;
  }

  /** Key of the smallest item. */
  peekKey(): number {
    return this.keys[0];
  }

  private less(ka: number, ia: number, kb: number, ib: number): boolean {
    return ka < kb || (ka === kb && ia < ib);
  }

  private grow(): void {
    const n = this.items.length * 2;
    const it = new Int32Array(n), k = new Float64Array(n);
    it.set(this.items); k.set(this.keys);
    this.items = it; this.keys = k;
  }
}
