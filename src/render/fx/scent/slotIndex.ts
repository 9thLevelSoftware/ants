// Cell -> slot index of one scent layer, chunked like the pheromone field (16^3 cells per chunk, the same local
// layout lx | ly << 4 | lz << 8), so the chunk scan finds a cell's slot with one array read per cell and one Map
// lookup per chunk. Chunk arrays are pooled; element 4096 counts the chunk's slots.
const SHIFT = 4;
const MASK = 15;
const N3 = 4096;
const OFF = 512;

const pool: Int32Array[] = [];
const POOL_MAX = 256;

/** Chunk key of a cell (fits 30 bits: a small-integer Map key). */
export function chunkKeyOf(ix: number, iy: number, iz: number): number {
  return ((ix >> SHIFT) + OFF) + ((iy >> SHIFT) + OFF) * 1024 + ((iz >> SHIFT) + OFF) * 1048576;
}

/** Index of a cell inside its chunk. */
export function localOf(ix: number, iy: number, iz: number): number {
  return (ix & MASK) | ((iy & MASK) << SHIFT) | ((iz & MASK) << (2 * SHIFT));
}

/** Unit directions of the 26 neighbours, in the order SlotIndex.neighbours writes them (xyz per neighbour). */
export const NEIGHBOUR_DIRS: Float32Array = (() => {
  const d = new Float32Array(26 * 3);
  let o = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dy === 0 && dz === 0) continue;
    const inv = 1 / Math.sqrt(dx * dx + dy * dy + dz * dz);
    d[o++] = dx * inv; d[o++] = dy * inv; d[o++] = dz * inv;
  }
  return d;
})();

export class SlotIndex {
  private readonly chunks = new Map<number, Int32Array>();
  size = 0;

  /** The slot array of a chunk (index by localOf), undefined if the chunk has no slots. */
  chunk(key: number): Int32Array | undefined {
    return this.chunks.get(key);
  }

  get(ix: number, iy: number, iz: number): number {
    const a = this.chunks.get(chunkKeyOf(ix, iy, iz));
    return a ? a[localOf(ix, iy, iz)] : -1;
  }

  /**
   * The slots of the 26 neighbours of a cell into out[0..25] (-1 = none), in dz, dy, dx order (-1..1, the centre
   * skipped). Consecutive neighbours mostly share a chunk, so this costs a few Map lookups instead of 26.
   */
  neighbours(ix: number, iy: number, iz: number, out: Int32Array): void {
    let lastKey = -1;
    let a: Int32Array | undefined;
    let o = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0 && dz === 0) continue;
      const x = ix + dx, y = iy + dy, z = iz + dz;
      const k = chunkKeyOf(x, y, z);
      if (k !== lastKey) { lastKey = k; a = this.chunks.get(k); }
      out[o++] = a ? a[localOf(x, y, z)] : -1;
    }
  }

  set(ix: number, iy: number, iz: number, slot: number): void {
    const k = chunkKeyOf(ix, iy, iz);
    let a = this.chunks.get(k);
    if (!a) {
      a = pool.pop() ?? new Int32Array(N3 + 1).fill(-1);
      a[N3] = 0;
      this.chunks.set(k, a);
    }
    const l = localOf(ix, iy, iz);
    if (a[l] < 0) { a[N3]++; this.size++; }
    a[l] = slot;
  }

  remove(ix: number, iy: number, iz: number): void {
    const k = chunkKeyOf(ix, iy, iz);
    const a = this.chunks.get(k);
    if (!a) return;
    const l = localOf(ix, iy, iz);
    if (a[l] < 0) return;
    a[l] = -1;
    this.size--;
    if (--a[N3] > 0) return;
    this.chunks.delete(k);
    if (pool.length < POOL_MAX) pool.push(a);
  }

  clear(): void {
    for (const a of this.chunks.values()) {
      a.fill(-1);
      if (pool.length < POOL_MAX) pool.push(a);
    }
    this.chunks.clear();
    this.size = 0;
  }
}
