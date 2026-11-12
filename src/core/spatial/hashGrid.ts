// Uniform 3D spatial hash for point entities with numeric ids (ants, items, creatures, ...).
//
// Typical use per tick: clear(), insert every entity, then any number of queries. Storage is typed arrays and
// a fixed bucket table; clear() is O(1) (bucket generation stamps), and nothing allocates once the entry
// capacity has grown to the population size. Cells are cubes of `cellSize` mm; any coordinate (including
// negative) is valid. Buckets are shared between cells whose hashes collide, so every entry remembers its cell
// and queries filter on it (no duplicates, no misses).

import type { Vec3 } from '../math/vec3';

const DEFAULT_BUCKET_BITS = 12;
const INITIAL_CAPACITY = 256;
/** Cell coordinates are stored as int32; queries reaching beyond fall back to a linear scan. */
const MIN_CELL = -2147483648;
const MAX_CELL = 2147483647;

export class HashGrid3 {
  readonly cellSize: number;
  private readonly invCell: number;
  private readonly mask: number;
  // bucket table
  private readonly bucketHead: Int32Array;
  private readonly bucketStamp: Uint32Array;
  private stamp = 1;
  // entries (parallel arrays)
  private cap = 0;
  private n = 0;
  private ids = new Float64Array(0);
  private xs = new Float64Array(0);
  private ys = new Float64Array(0);
  private zs = new Float64Array(0);
  private cx = new Int32Array(0);
  private cy = new Int32Array(0);
  private cz = new Int32Array(0);
  private next = new Int32Array(0);

  /**
   * @param cellSize cube edge in mm; choose about the typical query radius.
   * @param bucketBits log2 of the bucket count (default 4096 buckets).
   */
  constructor(cellSize: number, bucketBits = DEFAULT_BUCKET_BITS, initialCapacity = INITIAL_CAPACITY) {
    if (!(cellSize > 0)) throw new RangeError('HashGrid3: cellSize must be > 0');
    this.cellSize = cellSize;
    this.invCell = 1 / cellSize;
    const buckets = 1 << bucketBits;
    this.mask = buckets - 1;
    this.bucketHead = new Int32Array(buckets);
    this.bucketStamp = new Uint32Array(buckets);
    this.grow(initialCapacity);
  }

  /** Number of inserted entries since the last clear(). */
  get count(): number {
    return this.n;
  }

  /** Removes all entries in O(1). */
  clear(): void {
    this.n = 0;
    this.stamp = (this.stamp + 1) >>> 0;
    if (this.stamp === 0) {
      // Wrapped after 2^32 clears: reset stamps so stale buckets cannot look current.
      this.bucketStamp.fill(0);
      this.stamp = 1;
    }
  }

  insert(id: number, x: number, y: number, z: number): void {
    if (this.n === this.cap) this.grow(this.cap * 2);
    const i = this.n++;
    const cx = Math.floor(x * this.invCell) | 0;
    const cy = Math.floor(y * this.invCell) | 0;
    const cz = Math.floor(z * this.invCell) | 0;
    this.ids[i] = id;
    this.xs[i] = x;
    this.ys[i] = y;
    this.zs[i] = z;
    this.cx[i] = cx;
    this.cy[i] = cy;
    this.cz[i] = cz;
    const b = this.bucketOf(cx, cy, cz);
    this.next[i] = this.bucketStamp[b] === this.stamp ? this.bucketHead[b] : -1;
    this.bucketHead[b] = i;
    this.bucketStamp[b] = this.stamp;
  }

  /** Clears `out`, fills it with ids within distance r (inclusive) of (x, y, z), returns the count. */
  queryRadius(x: number, y: number, z: number, r: number, out: number[]): number {
    out.length = 0;
    if (!(r >= 0) || this.n === 0) return 0;
    const r2 = r * r;
    const x0 = Math.floor((x - r) * this.invCell), x1 = Math.floor((x + r) * this.invCell);
    const y0 = Math.floor((y - r) * this.invCell), y1 = Math.floor((y + r) * this.invCell);
    const z0 = Math.floor((z - r) * this.invCell), z1 = Math.floor((z + r) * this.invCell);
    // Huge query relative to the population (or beyond int32 cell coords): a linear scan is cheaper.
    if (!this.cellRangeSmall(x0, x1, y0, y1, z0, z1)) {
      for (let i = 0; i < this.n; i++) {
        const dx = this.xs[i] - x, dy = this.ys[i] - y, dz = this.zs[i] - z;
        if (dx * dx + dy * dy + dz * dz <= r2) out.push(this.ids[i]);
      }
      return out.length;
    }
    for (let cz = z0; cz <= z1; cz++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const b = this.bucketOf(cx, cy, cz);
          if (this.bucketStamp[b] !== this.stamp) continue;
          for (let i = this.bucketHead[b]; i >= 0; i = this.next[i]) {
            if (this.cx[i] !== cx || this.cy[i] !== cy || this.cz[i] !== cz) continue;
            const dx = this.xs[i] - x, dy = this.ys[i] - y, dz = this.zs[i] - z;
            if (dx * dx + dy * dy + dz * dz <= r2) out.push(this.ids[i]);
          }
        }
      }
    }
    return out.length;
  }

  /** Same as queryRadius with a Vec3 centre. */
  queryRadiusV(p: Vec3, r: number, out: number[]): number {
    return this.queryRadius(p.x, p.y, p.z, r, out);
  }

  /** Clears `out`, fills it with ids inside the closed axis-aligned box, returns the count. */
  queryBox(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, out: number[]): number {
    out.length = 0;
    if (this.n === 0 || !(maxX >= minX && maxY >= minY && maxZ >= minZ)) return 0;
    const x0 = Math.floor(minX * this.invCell), x1 = Math.floor(maxX * this.invCell);
    const y0 = Math.floor(minY * this.invCell), y1 = Math.floor(maxY * this.invCell);
    const z0 = Math.floor(minZ * this.invCell), z1 = Math.floor(maxZ * this.invCell);
    if (!this.cellRangeSmall(x0, x1, y0, y1, z0, z1)) {
      for (let i = 0; i < this.n; i++) {
        if (this.inBox(i, minX, minY, minZ, maxX, maxY, maxZ)) out.push(this.ids[i]);
      }
      return out.length;
    }
    for (let cz = z0; cz <= z1; cz++) {
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const b = this.bucketOf(cx, cy, cz);
          if (this.bucketStamp[b] !== this.stamp) continue;
          for (let i = this.bucketHead[b]; i >= 0; i = this.next[i]) {
            if (this.cx[i] !== cx || this.cy[i] !== cy || this.cz[i] !== cz) continue;
            if (this.inBox(i, minX, minY, minZ, maxX, maxY, maxZ)) out.push(this.ids[i]);
          }
        }
      }
    }
    return out.length;
  }

  /** True when visiting the cell range is worthwhile: fewer cells than entries and int32 cell coordinates. */
  private cellRangeSmall(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): boolean {
    const cells = (x1 - x0 + 1) * (y1 - y0 + 1) * (z1 - z0 + 1);
    return cells <= this.n && x0 >= MIN_CELL && y0 >= MIN_CELL && z0 >= MIN_CELL && x1 <= MAX_CELL && y1 <= MAX_CELL && z1 <= MAX_CELL;
  }

  private inBox(i: number, minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number): boolean {
    const x = this.xs[i], y = this.ys[i], z = this.zs[i];
    return x >= minX && x <= maxX && y >= minY && y <= maxY && z >= minZ && z <= maxZ;
  }

  private bucketOf(cx: number, cy: number, cz: number): number {
    let h = Math.imul(cx, 0x8da6b343) ^ Math.imul(cy, 0xd8163841) ^ Math.imul(cz, 0xcb1ab31f);
    h ^= h >>> 15;
    h = Math.imul(h, 0x2c1b3c6d);
    h ^= h >>> 13;
    return h & this.mask;
  }

  private grow(newCap: number): void {
    const cap = Math.max(newCap, 1);
    const f64 = (old: Float64Array) => { const a = new Float64Array(cap); a.set(old.subarray(0, this.n)); return a; };
    const i32 = (old: Int32Array) => { const a = new Int32Array(cap); a.set(old.subarray(0, this.n)); return a; };
    this.ids = f64(this.ids);
    this.xs = f64(this.xs);
    this.ys = f64(this.ys);
    this.zs = f64(this.zs);
    this.cx = i32(this.cx);
    this.cy = i32(this.cy);
    this.cz = i32(this.cz);
    this.next = i32(this.next);
    this.cap = cap;
  }
}
