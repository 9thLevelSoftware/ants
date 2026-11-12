/**
 * Spreads brood and pile items (eggs, larvae, pupae, cocoons, soil pellets, seeds) so that none passes through
 * another. The sim may place a whole pile at one point, or items a little apart; every pile item keeps its own spot
 * when that spot is free, otherwise it moves to the nearest free slot of a brick lattice around it, spaced by the
 * item's own footprint. Pile items lie aligned (a common heading with a little jitter), so elongated larvae and pupae
 * pack side by side as in a real brood pile instead of crossing each other.
 *
 * Collision is an axis-aligned footprint test in x/z (all pile items share the heading) within a height band, on a
 * uniform hash grid rebuilt each frame. Allocation-free after warm-up.
 */

/** Footprint margin covering the heading jitter (±JITTER rad) of neighbours. */
const MARGIN = 1.06;
export const PILE_JITTER = 0.08;
/** Lattice slots tried around an item before it is stacked on top instead. */
const MAX_SLOTS = 256;

export interface Footprint {
  /** Full extents at the item's drawn size, mm: across (x), height (y), along (z). */
  x: number; y: number; z: number;
}

export class PileLayout {
  private px = new Float64Array(256); private py = new Float64Array(256); private pz = new Float64Array(256);
  private hx = new Float64Array(256); private hy = new Float64Array(256); private hz = new Float64Array(256);
  private next = new Int32Array(256);
  private n = 0;
  private cell = 1;
  private heads = new Map<number, number>();
  /** Brick-lattice slot order per aspect ratio bucket: [i0, j0, i1, j1, ...] sorted by distance. */
  private slotCache = new Map<number, Int16Array>();
  /** Output of place(). */
  readonly out = { x: 0, y: 0, z: 0 };

  /** Starts a frame; `maxExtentMm` = largest footprint extent of this frame's pile items (sets the grid cell). */
  begin(maxExtentMm: number): void {
    this.n = 0; this.heads.clear();
    this.cell = Math.max(0.05, maxExtentMm * MARGIN);
  }

  /** Places one pile item wanting to lie at (x, y, z); the result is in `out` and is reserved for later items. */
  place(x: number, y: number, z: number, f: Footprint): void {
    const sx = f.x * MARGIN, sz = f.z * MARGIN;
    const o = this.out;
    if (this.free(x, y, z, sx, f.y, sz)) { o.x = x; o.y = y; o.z = z; this.add(o.x, o.y, o.z, sx, f.y, sz); return; }
    const slots = this.slots(sx / sz);
    for (let k = 2; k < slots.length; k += 2) {
      const i = slots[k]!, j = slots[k + 1]!;
      const cx = x + (i + (j & 1) * 0.5) * sx, cz = z + j * sz;
      if (this.free(cx, y, cz, sx, f.y, sz)) { o.x = cx; o.y = y; o.z = cz; this.add(cx, y, cz, sx, f.y, sz); return; }
    }
    // the neighbourhood is full: lie on top
    let top = y;
    while (!this.free(x, top, z, sx, f.y, sz)) top += f.y * 0.9;
    o.x = x; o.y = top; o.z = z; this.add(x, top, z, sx, f.y, sz);
  }

  private free(x: number, y: number, z: number, sx: number, sy: number, sz: number): boolean {
    const c = this.cell;
    const ix = Math.floor(x / c), iy = Math.floor(y / c), iz = Math.floor(z / c);
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let d = -1; d <= 1; d++) {
      let p = this.heads.get(key(ix + a, iy + b, iz + d)) ?? -1;
      while (p >= 0) {
        if (Math.abs(this.px[p]! - x) < this.hx[p]! + hx && Math.abs(this.pz[p]! - z) < this.hz[p]! + hz
          && Math.abs(this.py[p]! - y) < (this.hy[p]! + hy) * 0.9) return false;
        p = this.next[p]!;
      }
    }
    return true;
  }

  private add(x: number, y: number, z: number, sx: number, sy: number, sz: number): void {
    if (this.n === this.px.length) this.grow();
    const i = this.n++;
    this.px[i] = x; this.py[i] = y; this.pz[i] = z; this.hx[i] = sx / 2; this.hy[i] = sy / 2; this.hz[i] = sz / 2;
    const c = this.cell; const k = key(Math.floor(x / c), Math.floor(y / c), Math.floor(z / c));
    this.next[i] = this.heads.get(k) ?? -1;
    this.heads.set(k, i);
  }

  private grow(): void {
    const g = (a: Float64Array) => { const b = new Float64Array(a.length * 2); b.set(a); return b; };
    this.px = g(this.px); this.py = g(this.py); this.pz = g(this.pz); this.hx = g(this.hx); this.hy = g(this.hy); this.hz = g(this.hz);
    const nx = new Int32Array(this.next.length * 2); nx.set(this.next); this.next = nx;
  }

  /** Lattice slots (i, j) around the origin, nearest first, for slot spacing ratio sx/sz (bucketed). */
  private slots(ratio: number): Int16Array {
    const bucket = Math.round(Math.log2(Math.max(1 / 16, Math.min(16, ratio))) * 8);
    let s = this.slotCache.get(bucket);
    if (!s) {
      const r = Math.pow(2, bucket / 8);
      const list: [number, number, number][] = [];
      for (let j = -24; j <= 24; j++) for (let i = -24; i <= 24; i++) {
        const dx = (i + (j & 1) * 0.5) * r, dz = j;
        list.push([i, j, dx * dx + dz * dz]);
      }
      list.sort((a, b) => a[2] - b[2] || a[1] - b[1] || a[0] - b[0]);
      s = new Int16Array(Math.min(list.length, MAX_SLOTS) * 2);
      for (let k = 0; k < s.length / 2; k++) { s[k * 2] = list[k]![0]; s[k * 2 + 1] = list[k]![1]; }
      this.slotCache.set(bucket, s);
    }
    return s;
  }
}

function key(ix: number, iy: number, iz: number): number {
  // exact for |i| < 2^20 (cells of >= 0.05 mm: a 50 m world fits)
  return ((ix + 1048576) * 2097152 + (iz + 1048576)) * 64 + ((iy & 63));
}
