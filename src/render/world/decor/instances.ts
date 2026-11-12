// Instance buffers of the decor (pure): fixed-stride float records, sorted by a per-instance random `rank` so that
// drawing the first N instances is a uniform thinning (density LOD and seasonal density without regeneration).

/** Growable float records of a fixed stride. */
export class InstanceBuilder {
  private data: Float32Array;
  count = 0;

  constructor(readonly stride: number, capacity = 256) {
    this.data = new Float32Array(stride * capacity);
  }

  push(...v: number[]): void {
    if ((this.count + 1) * this.stride > this.data.length) {
      const d = new Float32Array(this.data.length * 2);
      d.set(this.data);
      this.data = d;
    }
    this.data.set(v, this.count * this.stride);
    this.count++;
  }

  /** The records, sorted ascending by the float at `rankAt` (stable: ties keep insertion order). */
  sorted(rankAt: number): Float32Array {
    const s = this.stride, n = this.count, src = this.data;
    const order = new Uint32Array(n);
    for (let i = 0; i < n; i++) order[i] = i;
    order.sort((a, b) => src[a * s + rankAt] - src[b * s + rankAt] || a - b);
    const out = new Float32Array(n * s);
    for (let i = 0; i < n; i++) out.set(src.subarray(order[i] * s, order[i] * s + s), i * s);
    return out;
  }
}

/** Number of leading records (sorted by rank) whose rank is below `keep`. */
export function countBelow(sorted: Float32Array, stride: number, rankAt: number, keep: number): number {
  let lo = 0, hi = sorted.length / stride;
  while (lo < hi) {
    const m = (lo + hi) >> 1;
    if (sorted[m * stride + rankAt] < keep) lo = m + 1; else hi = m;
  }
  return lo;
}

/** FNV-1a over the bytes of float arrays (determinism checks: a revisited block must hash the same). */
export function hashFloats(...arrays: Float32Array[]): number {
  let h = 0x811c9dc5;
  for (const a of arrays) {
    const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
    for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  }
  return h >>> 0;
}

// ---- record layouts ---------------------------------------------------------------------------------------------

/** Grass blade: root x, y, z, rank | height, width, yaw, rnd | lean, curve, hue, strip. */
export const BLADE_STRIDE = 12;
export const BLADE_RANK = 3;

/**
 * Draped item: x, z, yaw, rank | length, width, curl, fixedY (NO_FIXED_Y = drape on the terrain) |
 * kind, rndA (atlas cell), rndB (freshness / tint), order (stacking 0..3).
 */
export const DRAPED_STRIDE = 12;
export const DRAPED_RANK = 3;
export const NO_FIXED_Y = -1e9;

/** Kinds of draped items (shader switch). */
export const DRAPED_KIND = {
  leaf: 0, smallLeaf: 1, needle: 2, petal: 3, wrapper: 4, receipt: 5, moss: 6, chip: 7, grit: 8, pebble: 9,
} as const;
export type DrapedKind = keyof typeof DRAPED_KIND;
