// Distance along a trail from the colony's entrances, in cells (hop count through neighbouring trail cells). The
// chevrons point to increasing distance: out along the trail towards the food, also where a trail bends back
// towards the nest (GDD 08 §10.1, "along the gradient toward the source"). Straight-line distance from the
// entrance gets that wrong on any detour.
//
// One layer at a time, as a budgeted job spread over frames: seed the cells near an entrance, breadth-first
// through the layer's cells, then each part not connected to an entrance (beyond a gap in the trail) from its
// cell nearest to an entrance; then publish. Values are published only when a job completes, so a half-done job never
// flips chevrons back and forth.
import type { Vec3 } from '@/core';
import type { SlotIndex } from './slotIndex';
import { GEO_SEED_CELLS } from './tuning';

/** What the job needs from the scent cache. */
export interface TrailGraph {
  readonly cellMm: number;
  /** Slots [0, high) may be in use. */
  readonly high: number;
  /** Integer cell coordinates per slot (xyz). */
  readonly cellXYZ: Int32Array;
  /** The slot holds a cell (pending or drawn) of layer li. */
  isCellOf(s: number, li: number): boolean;
  indexOf(li: number): SlotIndex | null;
  originsOf(li: number): readonly Vec3[];
  /** The next trail layer whose cells changed since its last job (and clears the mark), -1 = none. */
  nextDirtyLayer(): number;
  /** A slot's published distance changed: re-evaluate its chevron direction. */
  touched(s: number): void;
}

const IDLE = 0, SEED = 1, BFS = 2, PARTS = 3, PUBLISH = 4;
/** Steps of one part in the PARTS phase. */
const NONE = 0, FLOOD = 1, NEAREST = 2, SPREAD = 3;
/** Slots inspected per unit of budget in the linear scans (seed, parts, publish). */
const SCAN_PER_UNIT = 16;

export class TrailDistance {
  /** Published distance per slot, cells; NaN = unknown (fall back to the straight-line rule). */
  readonly dist: Float32Array;
  private readonly next: Float32Array;
  private readonly stamp: Uint32Array;
  private readonly queue: Int32Array;
  private readonly queue2: Int32Array;
  private readonly nb = new Int32Array(26);
  private job = 0;
  private li = -1;
  private phase = IDLE;
  private scan = 0;
  private head = 0;
  private tail = 0;
  private sub = NONE;
  private head2 = 0;
  private tail2 = 0;
  private best = 0;
  private bestD = Infinity;

  constructor(capacity: number, private readonly g: TrailGraph) {
    this.dist = new Float32Array(capacity).fill(NaN);
    this.next = new Float32Array(capacity);
    this.stamp = new Uint32Array(capacity);
    this.queue = new Int32Array(capacity);
    this.queue2 = new Int32Array(capacity);
  }

  /** A slot was (re)allocated: forget what it held. */
  reset(s: number): void {
    this.stamp[s] = 0;
    this.dist[s] = NaN;
  }

  /** Layer i was removed and the layers after it moved down one index. */
  layerRemoved(i: number): void {
    if (this.li === i) { this.phase = IDLE; this.li = -1; } else if (this.li > i) this.li--;
  }

  get busy(): boolean { return this.phase !== IDLE; }

  /** Does up to `budget` units of work (one unit ~ one cell visited); returns the units used. */
  step(budget: number): number {
    let used = 0;
    while (used < budget) {
      if (this.phase === IDLE) {
        const li = this.g.nextDirtyLayer();
        if (li < 0) break;
        this.start(li);
      }
      used += this.work(budget - used);
    }
    return used;
  }

  private start(li: number): void {
    this.li = li;
    this.job = (this.job + 1) >>> 0 || 1;
    this.phase = SEED;
    this.sub = NONE;
    this.scan = 0;
    this.head = 0;
    this.tail = 0;
  }

  private work(budget: number): number {
    switch (this.phase) {
      case SEED: return this.seed(budget);
      case BFS: return this.spread(budget);
      case PARTS: return this.parts(budget);
      case PUBLISH: return this.publish(budget);
      default: return budget;
    }
  }

  /** Cells within GEO_SEED_CELLS of an entrance start at 0. */
  private seed(budget: number): number {
    const g = this.g, li = this.li, xyz = g.cellXYZ, c = g.cellMm;
    const origins = g.originsOf(li);
    const r2 = (GEO_SEED_CELLS * c) ** 2;
    const end = Math.min(g.high, this.scan + budget * SCAN_PER_UNIT);
    for (let s = this.scan; s < end; s++) {
      if (!g.isCellOf(s, li)) continue;
      const x = (xyz[s * 3] + 0.5) * c, y = (xyz[s * 3 + 1] + 0.5) * c, z = (xyz[s * 3 + 2] + 0.5) * c;
      for (let i = 0; i < origins.length; i++) {
        const o = origins[i];
        if ((o.x - x) ** 2 + (o.y - y) ** 2 + (o.z - z) ** 2 > r2) continue;
        this.stamp[s] = this.job;
        this.next[s] = 0;
        this.queue[this.tail++] = s;
        break;
      }
    }
    const used = Math.ceil((end - this.scan) / SCAN_PER_UNIT) || 1;
    this.scan = end;
    if (end >= g.high) { this.phase = BFS; this.scan = 0; }
    return used;
  }

  /** Breadth-first from the seeds through neighbouring cells of the layer. */
  private spread(budget: number): number {
    let used = 0;
    while (this.head < this.tail && used < budget) {
      this.expand(this.queue[this.head++], true);
      used++;
    }
    if (this.head >= this.tail) { this.phase = PARTS; this.sub = NONE; this.scan = 0; }
    return used || 1;
  }

  /**
   * Visits the neighbours of s: with `stampNew`, unvisited cells of the layer get stamped (distance = s's + 1)
   * and queued in queue; otherwise (second pass over a part) stamped cells still at Infinity get their distance
   * and are queued in queue2.
   */
  private expand(s: number, stampNew: boolean): void {
    const g = this.g, li = this.li;
    if (!g.isCellOf(s, li)) return;
    const index = g.indexOf(li);
    if (!index) return;
    const xyz = g.cellXYZ, nb = this.nb;
    index.neighbours(xyz[s * 3], xyz[s * 3 + 1], xyz[s * 3 + 2], nb);
    const d = this.next[s] + 1;
    for (let k = 0; k < 26; k++) {
      const n = nb[k];
      if (n < 0 || !g.isCellOf(n, li)) continue;
      if (stampNew) {
        if (this.stamp[n] === this.job) continue;
        this.stamp[n] = this.job;
        this.next[n] = d;
        this.queue[this.tail++] = n;
      } else if (this.stamp[n] === this.job && this.next[n] === Infinity) {
        this.next[n] = d;
        this.queue2[this.tail2++] = n;
      }
    }
  }

  /**
   * Parts not connected to an entrance (gaps in a trail), each in three budgeted steps: flood it (members stamped,
   * distance Infinity, listed in queue), find its cell nearest to an entrance, then breadth-first from that cell.
   */
  private parts(budget: number): number {
    const g = this.g, li = this.li;
    let used = 0;
    while (used < budget) {
      if (this.sub === FLOOD) {
        while (this.head < this.tail && used < budget) { this.expand(this.queue[this.head++], true); used++; }
        if (this.head < this.tail) break;
        for (let i = 0; i < this.tail; i++) this.next[this.queue[i]] = Infinity;
        used += this.tail / SCAN_PER_UNIT;
        // without an entrance the direction is unknown: the part stays at Infinity (published as unknown)
        this.sub = g.originsOf(li).length > 0 ? NEAREST : NONE;
        this.head = 0;
        this.best = this.queue[0];
        this.bestD = Infinity;
      } else if (this.sub === NEAREST) {
        const xyz = g.cellXYZ, c = g.cellMm, origins = g.originsOf(li);
        const end = Math.min(this.tail, this.head + Math.ceil((budget - used) * SCAN_PER_UNIT));
        for (let i = this.head; i < end; i++) {
          const s = this.queue[i];
          const x = (xyz[s * 3] + 0.5) * c, y = (xyz[s * 3 + 1] + 0.5) * c, z = (xyz[s * 3 + 2] + 0.5) * c;
          for (let k = 0; k < origins.length; k++) {
            const o = origins[k];
            const d2 = (o.x - x) ** 2 + (o.y - y) ** 2 + (o.z - z) ** 2;
            if (d2 < this.bestD) { this.bestD = d2; this.best = s; }
          }
        }
        used += (end - this.head) / SCAN_PER_UNIT;
        this.head = end;
        if (this.head < this.tail) break;
        this.next[this.best] = 0;
        this.head2 = 0;
        this.tail2 = 0;
        this.queue2[this.tail2++] = this.best;
        this.sub = SPREAD;
      } else if (this.sub === SPREAD) {
        while (this.head2 < this.tail2 && used < budget) { this.expand(this.queue2[this.head2++], false); used++; }
        if (this.head2 < this.tail2) break;
        this.sub = NONE;
      } else {
        if (this.scan >= g.high) { this.phase = PUBLISH; this.scan = 0; break; }
        const s = this.scan++;
        used += 1 / SCAN_PER_UNIT;
        if (!g.isCellOf(s, li) || this.stamp[s] === this.job) continue;
        this.head = 0;
        this.tail = 0;
        this.stamp[s] = this.job;
        this.next[s] = Infinity;
        this.queue[this.tail++] = s;
        this.sub = FLOOD;
      }
    }
    return Math.max(1, Math.ceil(used));
  }

  /** Publishes the finished job's distances for the layer; slots whose distance changed are re-evaluated. */
  private publish(budget: number): number {
    const g = this.g, li = this.li;
    const end = Math.min(g.high, this.scan + budget * SCAN_PER_UNIT);
    for (let s = this.scan; s < end; s++) {
      if (!g.isCellOf(s, li)) continue;
      const v = this.stamp[s] === this.job && this.next[s] !== Infinity ? this.next[s] : NaN;
      const old = this.dist[s];
      if (v === old || (v !== v && old !== old)) continue;
      this.dist[s] = v;
      g.touched(s);
    }
    const used = Math.ceil((end - this.scan) / SCAN_PER_UNIT) || 1;
    this.scan = end;
    if (end >= g.high) { this.phase = IDLE; this.li = -1; }
    return used;
  }
}
