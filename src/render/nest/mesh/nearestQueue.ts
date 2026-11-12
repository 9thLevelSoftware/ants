// Nearest-first queue for large backlogs (the whole nest after a load or a quality change: thousands of chunks).
// Keys are bucketed by distance to an ordering origin in steps of `bucketMm`; popping takes any key of the nearest
// non-empty bucket, so the order is nearest-first to within one bucket. The buckets are rebuilt (O(n), no sort)
// only when the camera has moved more than `reorderMm` from the origin, so a frame costs O(chunks popped).
// Deleted keys are skipped lazily.

interface Item { x: number; y: number; z: number }

export class NearestQueue {
  private items = new Map<number, Item>();
  private buckets: number[][] = [];
  private cursor = 0;
  private ordered = false;
  private ox = 0;
  private oy = 0;
  private oz = 0;
  /** Number of bucket rebuilds (tests, statistics). */
  reorders = 0;

  constructor(private readonly bucketMm: number, private readonly reorderMm: number, private readonly maxBuckets = 256) {}

  get size(): number {
    return this.items.size;
  }

  has(key: number): boolean {
    return this.items.has(key);
  }

  /** Adds a key with its position (no-op when present). */
  add(key: number, x: number, y: number, z: number): void {
    if (this.items.has(key)) return;
    this.items.set(key, { x, y, z });
    if (this.ordered) this.place(key, x, y, z);
  }

  delete(key: number): void {
    this.items.delete(key);
  }

  clear(): void {
    this.items.clear();
    this.buckets = [];
    this.cursor = 0;
    this.ordered = false;
  }

  /** Removes and returns a key nearest to (x, y, z) to within one bucket; undefined when empty. */
  pop(x: number, y: number, z: number): number | undefined {
    if (this.items.size === 0) return undefined;
    if (!this.ordered || Math.hypot(x - this.ox, y - this.oy, z - this.oz) > this.reorderMm) this.reorder(x, y, z);
    for (; this.cursor < this.buckets.length; this.cursor++) {
      const b = this.buckets[this.cursor];
      while (b.length > 0) {
        const key = b.pop()!;
        if (this.items.delete(key)) return key;
      }
    }
    // only stale entries were left (cannot happen while items is non-empty, but stay safe)
    this.reorder(x, y, z);
    return this.pop(x, y, z);
  }

  private reorder(x: number, y: number, z: number): void {
    this.ox = x; this.oy = y; this.oz = z;
    this.buckets = [];
    this.cursor = 0;
    this.ordered = true;
    this.reorders++;
    for (const [key, it] of this.items) this.place(key, it.x, it.y, it.z);
  }

  private place(key: number, x: number, y: number, z: number): void {
    const d = Math.hypot(x - this.ox, y - this.oy, z - this.oz);
    const i = Math.min(this.maxBuckets - 1, Math.floor(d / this.bucketMm));
    while (this.buckets.length <= i) this.buckets.push([]);
    this.buckets[i].push(key);
    if (i < this.cursor) this.cursor = i;
  }
}
