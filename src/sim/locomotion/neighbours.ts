// Crowding neighbour grid for separation (viab-loco item 6). The separation term needs only a handful of nestmates
// within sepR, but in a crowded chamber hundreds of ants share one cell (the gate's 1,500-worker case: up to 323 in
// one 1.1 BU cell), and a full radius query returned ~450 ids per ant, every second tick. This grid stops after
// `max` hits, visiting the walker's own cell first, so a query costs O(max) however dense the crowd.
//
// Uniform hash over cells of the separation radius; entries in insertion order (ant list order) per cell, so the
// hits are a deterministic function of the positions at the start of the tick. Runtime only, rebuilt every tick.

const BUCKET_BITS = 12;

export class NeighbourGrid {
  private readonly inv: number;
  private readonly mask = (1 << BUCKET_BITS) - 1;
  private readonly head = new Int32Array(1 << BUCKET_BITS);
  private readonly stampOf = new Uint32Array(1 << BUCKET_BITS);
  private stamp = 1;
  private n = 0;
  private cap = 0;
  private ids = new Int32Array(0);
  /** A small integer per entry (the ant's colony) that a query may require. */
  private tags = new Int32Array(0);
  private xs = new Float64Array(0);
  private ys = new Float64Array(0);
  private zs = new Float64Array(0);
  private cx = new Int32Array(0);
  private cy = new Int32Array(0);
  private cz = new Int32Array(0);
  /** Next entry in the same bucket (insertion order kept by appending at the tail). */
  private next = new Int32Array(0);
  private readonly tail = new Int32Array(1 << BUCKET_BITS);

  constructor(cell: number) {
    this.inv = 1 / cell;
  }

  clear(): void {
    this.n = 0;
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) { this.stampOf.fill(0); this.stamp = 1; }
  }

  insert(id: number, x: number, y: number, z: number, tag = 0): void {
    if (this.n === this.cap) this.grow(Math.max(256, 2 * this.cap));
    const i = this.n++;
    const cx = Math.floor(x * this.inv) | 0, cy = Math.floor(y * this.inv) | 0, cz = Math.floor(z * this.inv) | 0;
    this.ids[i] = id; this.tags[i] = tag; this.xs[i] = x; this.ys[i] = y; this.zs[i] = z; this.cx[i] = cx; this.cy[i] = cy; this.cz[i] = cz;
    this.next[i] = -1;
    const b = this.bucket(cx, cy, cz);
    if (this.stampOf[b] !== this.stamp) { this.stampOf[b] = this.stamp; this.head[b] = i; }
    else this.next[this.tail[b]] = i;
    this.tail[b] = i;
  }

  /**
   * Up to `max` ids other than `self` within r (exclusive) of (x, y, z) into out (cleared): the walker's own cell
   * first, then the other cells the sphere touches, each in insertion order; with `tag`, only entries inserted with
   * that tag. Returns the count.
   */
  near(x: number, y: number, z: number, r: number, self: number, max: number, out: number[], tag?: number): number {
    out.length = 0;
    if (this.n === 0 || max <= 0) return 0;
    const r2 = r * r, inv = this.inv;
    const ox = Math.floor(x * inv), oy = Math.floor(y * inv), oz = Math.floor(z * inv);
    const any = tag === undefined, want = tag ?? 0;
    if (this.scan(ox, oy, oz, x, y, z, r2, self, max, out, any, want)) return out.length;
    const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
    const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
    const z0 = Math.floor((z - r) * inv), z1 = Math.floor((z + r) * inv);
    for (let cz = z0; cz <= z1; cz++) for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
      if (cx === ox && cy === oy && cz === oz) continue;
      if (this.scan(cx, cy, cz, x, y, z, r2, self, max, out, any, want)) return out.length;
    }
    return out.length;
  }

  /** Adds the hits of one cell; true once out holds max ids. */
  private scan(cx: number, cy: number, cz: number, x: number, y: number, z: number, r2: number, self: number, max: number, out: number[],
    any: boolean, want: number): boolean {
    const b = this.bucket(cx, cy, cz);
    if (this.stampOf[b] !== this.stamp) return false;
    for (let i = this.head[b]; i >= 0; i = this.next[i]) {
      if (this.cx[i] !== cx || this.cy[i] !== cy || this.cz[i] !== cz || this.ids[i] === self || (!any && this.tags[i] !== want)) continue;
      const dx = this.xs[i] - x, dy = this.ys[i] - y, dz = this.zs[i] - z;
      if (dx * dx + dy * dy + dz * dz < r2) { out.push(this.ids[i]); if (out.length >= max) return true; }
    }
    return false;
  }

  private bucket(cx: number, cy: number, cz: number): number {
    let h = Math.imul(cx, 0x8da6b343) ^ Math.imul(cy, 0xd8163841) ^ Math.imul(cz, 0xcb1ab31f);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 13;
    return h & this.mask;
  }

  private grow(cap: number): void {
    const i32 = (a: Int32Array) => { const b = new Int32Array(cap); b.set(a.subarray(0, this.n)); return b; };
    const f64 = (a: Float64Array) => { const b = new Float64Array(cap); b.set(a.subarray(0, this.n)); return b; };
    this.ids = i32(this.ids); this.tags = i32(this.tags); this.xs = f64(this.xs); this.ys = f64(this.ys); this.zs = f64(this.zs);
    this.cx = i32(this.cx); this.cy = i32(this.cy); this.cz = i32(this.cz); this.next = i32(this.next);
    this.cap = cap;
  }
}
