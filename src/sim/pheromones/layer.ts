// Runtime view of one persisted PheromoneLayer: a chunk index and an active-cell list over the plain arrays in
// SimState (layer.keys / layer.chunks). Nothing here is persisted; `rebuild` recreates it from the state on load.
//
// Invariants (checked by tests):
// - a cell is in `active` exactly once iff its `listed` flag is set; every nonzero cell is listed. A listed cell
//   may be 0 for a while (wiped) until the next compaction, which also removes cells below PHERO_EPS.
// - `nz` counts nonzero cells; the caps test nz (a reload preserves it), so a reloaded field evicts and frees
//   exactly what the original would.
// - `live[slot]` counts the listed cells of a chunk. Chunks are freed only by `freeEmptyChunks` (decay steps and
//   evictions), never on load, so a loaded field and the field it was saved from keep identical chunk orders.

import type { PheroChannel, PheromoneLayer } from '@/sim/types';
import { PHERO_DECAY_EVERY } from '@/sim/balance';
import { PHERO_EPS } from './balance';
import { evictWeakestCells, evictWeakestChunks } from './evict';
import { validateLayer } from './validate';

/** Chunk-key packing shared with the carve grid: (c + 512) + (c + 512) * 1024 + (c + 512) * 1048576. */
const KEY_OFF = 512;
const KEY_Y = 1024;
const KEY_Z = 1048576;

export function pheroChunkKey(cx: number, cy: number, cz: number): number {
  return (cx + KEY_OFF) + (cy + KEY_OFF) * KEY_Y + (cz + KEY_OFF) * KEY_Z;
}

/** True if chunk coordinates fit the key packing. */
export function chunkInRange(cx: number, cy: number, cz: number): boolean {
  return cx >= -KEY_OFF && cx < KEY_OFF && cy >= -KEY_OFF && cy < KEY_OFF && cz >= -KEY_OFF && cz < KEY_OFF;
}

/**
 * Decay stagger group of a chunk (0 .. PHERO_DECAY_EVERY - 1): a hash of its key, so it does not depend on slot
 * order and a reloaded field decays the same chunks on the same ticks.
 */
export function pheroChunkGroup(key: number): number {
  return (Math.imul(key, 0x9e3779b1) >>> 0) % PHERO_DECAY_EVERY;
}

/** Recycled zeroed chunk arrays, shared by all layers of a field. */
export interface ChunkPool {
  values: Float32Array[];
  flags: Uint8Array[];
  max: number;
}

export interface LayerLimits {
  maxCells: number;
  maxChunks: number;
  maxValue: number;
}

function grow(a: Int32Array<ArrayBuffer>, need: number): Int32Array<ArrayBuffer> {
  if (need <= a.length) return a;
  let n = Math.max(16, a.length);
  while (n < need) n *= 2;
  const b = new Int32Array(n);
  b.set(a);
  return b;
}

export class LayerRuntime {
  readonly data: PheromoneLayer;
  readonly channel: PheroChannel;
  readonly colony: number;
  /** log2(chunkCells), chunkCells - 1, log2(chunkCells^3). */
  readonly shift: number;
  readonly mask: number;
  readonly shift3: number;
  readonly n3: number;
  /** Cell coordinates must lie in [-cellLimit, cellLimit) on every axis (the chunk-key range). */
  readonly cellLimit: number;
  limits: LayerLimits;

  /** Per slot (parallel to data.keys): listed flags, listed count, chunk coordinates. */
  listed: Uint8Array[] = [];
  live = new Int32Array(16);
  ccx = new Int32Array(16);
  ccy = new Int32Array(16);
  ccz = new Int32Array(16);
  /** Decay stagger group per slot (pheroChunkGroup of its key). */
  grp = new Int32Array(16);
  /** Active cells: slot << shift3 | local index. */
  active = new Int32Array(64);
  count = 0;
  /** Nonzero cells (count also holds cells wiped to 0 until the next compaction; caps use nz, which a reload preserves). */
  nz = 0;
  /** Bumped whenever cell values or the cell set change. */
  version = 0;


  /** Chunk key -> slot. */
  readonly index = new Map<number, number>();
  // Two-entry chunk cache (reads near a chunk face alternate between two chunks).
  private lastKey = -1;
  private lastSlot = -1;
  private prevKey = -1;
  private prevSlot = -1;
  private readonly pool: ChunkPool;

  constructor(data: PheromoneLayer, chunkCells: number, limits: LayerLimits, pool: ChunkPool) {
    this.data = data;
    this.channel = data.channel;
    this.colony = data.colony;
    this.shift = Math.round(Math.log2(chunkCells));
    this.mask = chunkCells - 1;
    this.shift3 = this.shift * 3;
    this.n3 = chunkCells * chunkCells * chunkCells;
    this.cellLimit = KEY_OFF * chunkCells;
    this.limits = limits;
    this.pool = pool;
    this.rebuild();
  }

  get chunkCount(): number {
    return this.data.keys.length;
  }

  /** Rebuilds the index, flags and active list from the persisted arrays (drops malformed chunks). */
  rebuild(): void {
    const { keys, chunks } = this.data;
    let w = 0;
    for (let i = 0; i < keys.length; i++) {
      const c = chunks[i];
      if (!(c instanceof Float32Array) || c.length !== this.n3 || !Number.isInteger(keys[i])) continue;
      keys[w] = keys[i];
      chunks[w] = c;
      w++;
    }
    keys.length = w;
    chunks.length = w;
    this.index.clear();
    this.listed = [];
    this.live = new Int32Array(Math.max(16, w));
    this.ccx = new Int32Array(this.live.length);
    this.ccy = new Int32Array(this.live.length);
    this.ccz = new Int32Array(this.live.length);
    this.grp = new Int32Array(this.live.length);
    this.count = 0;
    this.nz = 0;
    for (let s = 0; s < w; s++) {
      const key = keys[s];
      this.index.set(key, s);
      this.ccx[s] = (key % KEY_Y) - KEY_OFF;
      this.ccy[s] = (Math.floor(key / KEY_Y) % KEY_Y) - KEY_OFF;
      this.ccz[s] = Math.floor(key / KEY_Z) - KEY_OFF;
      this.grp[s] = pheroChunkGroup(key);
      const vals = chunks[s];
      const flags = new Uint8Array(this.n3);
      this.listed.push(flags);
      for (let i = 0; i < this.n3; i++) {
        const v = vals[i];
        if (v !== 0) {
          if (!(v > 0) || !Number.isFinite(v)) { vals[i] = 0; continue; } // repair NaN / negative from a bad save
          flags[i] = 1;
          this.live[s]++;
          this.nz++;
          this.pushActive((s << this.shift3) | i);
        }
      }
    }
    this.invalidateCache();
    this.version++;
  }

  private pushActive(e: number): void {
    if (this.count >= this.active.length) this.active = grow(this.active, this.count + 1);
    this.active[this.count++] = e;
  }

  private invalidateCache(): void {
    this.lastKey = this.prevKey = -1;
    this.lastSlot = this.prevSlot = -1;
  }

  /** Slot of a chunk key, -1 if absent. */
  slotOf(key: number): number {
    if (key === this.lastKey) return this.lastSlot;
    let s: number;
    if (key === this.prevKey) {
      s = this.prevSlot;
    } else {
      const found = this.index.get(key);
      s = found === undefined ? -1 : found;
    }
    this.prevKey = this.lastKey;
    this.prevSlot = this.lastSlot;
    this.lastKey = key;
    this.lastSlot = s;
    return s;
  }

  /** Value array of chunk (cx, cy, cz), null when absent. */
  chunkAt(cx: number, cy: number, cz: number): Float32Array | null {
    if (!chunkInRange(cx, cy, cz)) return null;
    const slot = this.slotOf(pheroChunkKey(cx, cy, cz));
    return slot < 0 ? null : this.data.chunks[slot];
  }

  /**
   * True if integer cell coordinates lie inside the chunk-key range. Checked BEFORE any shift: `>>` truncates to
   * int32, so a huge finite coordinate would otherwise wrap onto a real cell.
   */
  cellInRange(ix: number, iy: number, iz: number): boolean {
    const L = this.cellLimit;
    return ix >= -L && ix < L && iy >= -L && iy < L && iz >= -L && iz < L;
  }

  /** Value of cell (ix, iy, iz), 0 when absent. */
  get(ix: number, iy: number, iz: number): number {
    if (!this.cellInRange(ix, iy, iz)) return 0;
    const s = this.shift;
    const cx = ix >> s, cy = iy >> s, cz = iz >> s;
    if (!chunkInRange(cx, cy, cz)) return 0;
    const slot = this.slotOf(pheroChunkKey(cx, cy, cz));
    if (slot < 0) return 0;
    const m = this.mask;
    return this.data.chunks[slot][(ix & m) | ((iy & m) << s) | ((iz & m) << (2 * s))];
  }

  /**
   * Adds amount to a cell (clamped to the channel maximum), creating chunk and list entry as needed. A deposit is
   * never refused for being weak: at a cap the weakest cells (chunks) are evicted first, so a newcomer always gets
   * its slot and keeps it if it is reinforced before the next eviction (each eviction frees 1/16 of the cells or 1/8
   * of the chunks, which bounds how often it runs). Returns the amount actually stored (0 only out of range).
   */
  add(ix: number, iy: number, iz: number, amount: number): number {
    if (!this.cellInRange(ix, iy, iz)) return 0;
    const s = this.shift;
    const cx = ix >> s, cy = iy >> s, cz = iz >> s;
    const key = pheroChunkKey(cx, cy, cz);
    const m = this.mask;
    const local = (ix & m) | ((iy & m) << s) | ((iz & m) << (2 * s));
    let slot = this.slotOf(key);
    if (slot < 0 || this.data.chunks[slot][local] === 0) {
      if (this.nz >= this.limits.maxCells) {
        evictWeakestCells(this);
        slot = this.slotOf(key); // the eviction may have freed this chunk
      }
      if (slot < 0) {
        slot = this.createChunk(key, cx, cy, cz);
        if (slot < 0) return 0;
      }
    }
    return this.store(slot, local, amount);
  }

  /** Adds amount to a cell only if it is listed (no chunk creation, no eviction). Returns the amount stored. */
  addExisting(ix: number, iy: number, iz: number, amount: number): number {
    if (!this.cellInRange(ix, iy, iz)) return 0;
    const s = this.shift, m = this.mask;
    const slot = this.slotOf(pheroChunkKey(ix >> s, iy >> s, iz >> s));
    if (slot < 0) return 0;
    const local = (ix & m) | ((iy & m) << s) | ((iz & m) << (2 * s));
    if (this.listed[slot][local] === 0) return 0;
    return this.store(slot, local, amount);
  }

  private store(slot: number, local: number, amount: number): number {
    const vals = this.data.chunks[slot];
    const old = vals[local];
    if (old === 0) this.nz++;
    const v = old + amount;
    vals[local] = v < this.limits.maxValue ? v : this.limits.maxValue;
    const flags = this.listed[slot];
    if (flags[local] === 0) {
      flags[local] = 1;
      this.live[slot]++;
      this.pushActive((slot << this.shift3) | local);
    }
    this.version++;
    return vals[local] - old;
  }

  private createChunk(key: number, cx: number, cy: number, cz: number): number {
    if (this.data.keys.length >= this.limits.maxChunks) evictWeakestChunks(this);
    if (this.data.keys.length >= this.limits.maxChunks) return -1;
    const slot = this.data.keys.length;
    const vals = this.pool.values.pop() ?? new Float32Array(this.n3);
    const flags = this.pool.flags.pop() ?? new Uint8Array(this.n3);
    this.data.keys.push(key);
    this.data.chunks.push(vals);
    this.listed.push(flags);
    if (slot >= this.live.length) {
      this.live = grow(this.live, slot + 1);
      this.ccx = grow(this.ccx, this.live.length);
      this.ccy = grow(this.ccy, this.live.length);
      this.ccz = grow(this.ccz, this.live.length);
      this.grp = grow(this.grp, this.live.length);
    }
    this.live[slot] = 0;
    this.grp[slot] = pheroChunkGroup(key);
    this.ccx[slot] = cx;
    this.ccy[slot] = cy;
    this.ccz[slot] = cz;
    this.index.set(key, slot);
    if (this.prevKey === key) this.prevKey = -1;
    this.lastKey = key;
    this.lastSlot = slot;
    return slot;
  }

  /**
   * Removes list entries that are 0 or below `floor` (setting them to exactly 0). floor = 0 removes only exact
   * zeros, which never changes a value. Returns the number of chunks left with no listed cell.
   */
  compact(floor: number): number {
    const sh = this.shift3, lm = this.n3 - 1;
    const act = this.active, chunks = this.data.chunks, listed = this.listed, live = this.live;
    let w = 0, emptied = 0;
    for (let i = 0, n = this.count; i < n; i++) {
      const e = act[i];
      const slot = e >>> sh, loc = e & lm;
      const vals = chunks[slot];
      const v = vals[loc];
      if (v > 0 && v >= floor) {
        act[w++] = e;
      } else {
        if (v !== 0) this.nz--;
        vals[loc] = 0;
        listed[slot][loc] = 0;
        if (--live[slot] === 0) emptied++;
      }
    }
    if (w !== this.count) this.version++;
    this.count = w;
    return emptied;
  }

  /** Multiplies every active cell by f and drops cells below PHERO_EPS. Returns chunks left empty. */
  scaleAll(f: number): number {
    const sh = this.shift3, lm = this.n3 - 1;
    const act = this.active, chunks = this.data.chunks, listed = this.listed, live = this.live;
    let w = 0, emptied = 0;
    for (let i = 0, n = this.count; i < n; i++) {
      const e = act[i];
      const slot = e >>> sh, loc = e & lm;
      const vals = chunks[slot];
      const v = vals[loc] * f;
      if (v >= PHERO_EPS) {
        vals[loc] = v;
        act[w++] = e;
      } else {
        if (vals[loc] !== 0) this.nz--;
        vals[loc] = 0;
        listed[slot][loc] = 0;
        if (--live[slot] === 0) emptied++;
      }
    }
    this.count = w;
    this.version++;
    return emptied;
  }

  /**
   * Multiplies each active cell by factorOf(entry) (1 = untouched) and drops cells below PHERO_EPS. Returns the
   * number of cells whose value changed.
   */
  scaleBy(factorOf: (e: number) => number): number {
    const sh = this.shift3, lm = this.n3 - 1;
    const act = this.active, chunks = this.data.chunks, listed = this.listed, live = this.live;
    let w = 0, changed = 0;
    for (let i = 0, n = this.count; i < n; i++) {
      const e = act[i];
      const f = factorOf(e);
      if (f === 1) { act[w++] = e; continue; }
      const slot = e >>> sh, loc = e & lm;
      const vals = chunks[slot];
      const old = vals[loc];
      const v = old * f;
      if (old !== 0) changed++;
      if (v >= PHERO_EPS) {
        vals[loc] = v;
        act[w++] = e;
      } else {
        if (old !== 0) this.nz--;
        vals[loc] = 0;
        listed[slot][loc] = 0;
        live[slot]--;
      }
    }
    this.count = w;
    if (changed > 0) this.version++;
    return changed;
  }

  /** Frees chunks with no listed cell, keeping the order of the rest; remaps active entries. */
  freeEmptyChunks(): void {
    const n = this.data.keys.length;
    let any = false;
    for (let s = 0; s < n; s++) if (this.live[s] === 0) { any = true; break; }
    if (!any) return;
    const { keys, chunks } = this.data;
    const remap = new Int32Array(n);
    let w = 0;
    for (let s = 0; s < n; s++) {
      if (this.live[s] === 0) {
        remap[s] = -1;
        if (this.pool.values.length < this.pool.max) {
          this.pool.values.push(chunks[s]); // all zero: every nonzero cell is listed
          this.pool.flags.push(this.listed[s]);
        }
        continue;
      }
      remap[s] = w;
      keys[w] = keys[s];
      chunks[w] = chunks[s];
      this.listed[w] = this.listed[s];
      this.live[w] = this.live[s];
      this.ccx[w] = this.ccx[s];
      this.ccy[w] = this.ccy[s];
      this.ccz[w] = this.ccz[s];
      this.grp[w] = this.grp[s];
      w++;
    }
    keys.length = w;
    chunks.length = w;
    this.listed.length = w;
    this.index.clear();
    for (let s = 0; s < w; s++) this.index.set(keys[s], s);
    const sh = this.shift3, lm = this.n3 - 1, act = this.active;
    for (let i = 0; i < this.count; i++) {
      const e = act[i];
      act[i] = (remap[e >>> sh] << sh) | (e & lm);
    }
    this.invalidateCache();
    this.version++;
  }

  /** Cell centre of an active entry into out (world mm, cell edge `cell`). */
  centreOf(e: number, cell: number, out: { x: number; y: number; z: number }): void {
    const slot = e >>> this.shift3, loc = e & (this.n3 - 1);
    const s = this.shift, m = this.mask;
    out.x = ((this.ccx[slot] << s) + (loc & m) + 0.5) * cell;
    out.y = ((this.ccy[slot] << s) + ((loc >> s) & m) + 0.5) * cell;
    out.z = ((this.ccz[slot] << s) + ((loc >> (2 * s)) & m) + 0.5) * cell;
  }

  /** Integer cell coordinates of an active entry. */
  cellX(e: number): number {
    return (this.ccx[e >>> this.shift3] << this.shift) + (e & this.mask);
  }
  cellY(e: number): number {
    return (this.ccy[e >>> this.shift3] << this.shift) + ((e >> this.shift) & this.mask);
  }
  cellZ(e: number): number {
    return (this.ccz[e >>> this.shift3] << this.shift) + ((e >> (2 * this.shift)) & this.mask);
  }

  /** Value of an active entry. */
  valueOf(e: number): number {
    return this.data.chunks[e >>> this.shift3][e & (this.n3 - 1)];
  }

  /** Overwrites the value of an active (listed) entry; 0 is allowed (removed at the next compaction). */
  setValue(e: number, v: number): void {
    const vals = this.data.chunks[e >>> this.shift3], loc = e & (this.n3 - 1);
    if (vals[loc] !== 0 && v === 0) this.nz--;
    else if (vals[loc] === 0 && v !== 0) this.nz++;
    vals[loc] = v;
  }

  /** Invariant check (tests, soak runs): problems found, empty when consistent. O(chunks x 4096). */
  validate(): string[] {
    return validateLayer(this);
  }

  /** Bytes held by this layer's arrays (values, flags, runtime arrays). */
  bytes(): number {
    return this.data.keys.length * this.n3 * 5 + (this.active.length + this.live.length * 4) * 4;
  }
}
