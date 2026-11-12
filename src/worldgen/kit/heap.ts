// Binary min-heap of (key, tie, value) triples in typed arrays: ties broken by `tie`, then `value` (GDD 04 DET-3:
// explicit tie-breaks, so Dijkstra-style growth is deterministic).

export class MinHeap {
  private k: Float64Array;
  private t: Float64Array;
  private v: Int32Array;
  size = 0;

  constructor(capacity = 1024) {
    this.k = new Float64Array(capacity);
    this.t = new Float64Array(capacity);
    this.v = new Int32Array(capacity);
  }

  private less(i: number, j: number): boolean {
    const a = this.k[i], b = this.k[j];
    if (a !== b) return a < b;
    if (this.t[i] !== this.t[j]) return this.t[i] < this.t[j];
    return this.v[i] < this.v[j];
  }

  private swap(i: number, j: number): void {
    const k = this.k[i], t = this.t[i], v = this.v[i];
    this.k[i] = this.k[j]; this.t[i] = this.t[j]; this.v[i] = this.v[j];
    this.k[j] = k; this.t[j] = t; this.v[j] = v;
  }

  push(key: number, tie: number, value: number): void {
    if (this.size === this.k.length) {
      const n = this.size * 2;
      const k = new Float64Array(n), t = new Float64Array(n), v = new Int32Array(n);
      k.set(this.k); t.set(this.t); v.set(this.v);
      this.k = k; this.t = t; this.v = v;
    }
    let i = this.size++;
    this.k[i] = key; this.t[i] = tie; this.v[i] = value;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      this.swap(i, p);
      i = p;
    }
  }

  /** Key, tie and value of the minimum (valid while size > 0). */
  topKey(): number { return this.k[0]; }
  topTie(): number { return this.t[0]; }
  topValue(): number { return this.v[0]; }

  pop(): void {
    const n = --this.size;
    if (n === 0) return;
    this.k[0] = this.k[n]; this.t[0] = this.t[n]; this.v[0] = this.v[n];
    let i = 0;
    for (;;) {
      const l = 2 * i + 1, r = l + 1;
      let m = i;
      if (l < n && this.less(l, m)) m = l;
      if (r < n && this.less(r, m)) m = r;
      if (m === i) break;
      this.swap(i, m);
      i = m;
    }
  }
}
