// Runtime view of one persisted PheromoneLayer: a chunk index and an active-cell list over the plain arrays in
// SimState (layer.keys / layer.chunks). Nothing here is persisted; `rebuild` recreates it from the state on load.
//
// Invariants (checked by tests):
// - a cell is in `active` exactly once iff its `listed` flag is set; every nonzero cell is listed. A listed cell
//   may be 0 for a while (wiped) until the next compaction, which also removes cells below PHERO_EPS.
// - `live[slot]` counts the listed cells of a chunk. Chunks are freed only by `freeEmptyChunks` (decay steps and
//   evictions), never on load, so a loaded field and the field it was saved from keep identical chunk orders.

import type { PheroChannel, PheromoneLayer } from '@/sim/types';
import { PHERO_EVICT_BINS_PER_OCTAVE, PHERO_EVICT_FRACTION, PHERO_EPS } from './balance';
import { evictionThreshold, pickWeakest, valueBin } from './evict';

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
  limits: LayerLimits;

  /** Per slot (parallel to data.keys): listed flags, listed count, chunk coordinates. */
  listed: Uint8Array[] = [];
  live = new Int32Array(16);
  ccx = new Int32Array(16);
  ccy = new Int32Array(16);
  ccz = new Int32Array(16);
  /** Active cells: slot << shift3 | local index. */
  active = new Int32Array(64);
  count = 0;
  /** Bumped whenever cell values or the cell set change. */
  version = 0;

  private index = new Map<number, number>();
  private lastKey = -1;
  private lastSlot = -1;
  private readonly pool: ChunkPool;

  constructor(data: PheromoneLayer, chunkCells: number, limits: LayerLimits, pool: ChunkPool) {
    this.data = data;
    this.channel = data.channel;
    this.colony = data.colony;
    this.shift = Math.round(Math.log2(chunkCells));
    this.mask = chunkCells - 1;
    this.shift3 = this.shift * 3;
    this.n3 = chunkCells * chunkCells * chunkCells;
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
    this.count = 0;
    for (let s = 0; s < w; s++) {
      const key = keys[s];
      this.index.set(key, s);
      this.ccx[s] = (key % KEY_Y) - KEY_OFF;
      this.ccy[s] = (Math.floor(key / KEY_Y) % KEY_Y) - KEY_OFF;
      this.ccz[s] = Math.floor(key / KEY_Z) - KEY_OFF;
      const vals = chunks[s];
      const flags = new Uint8Array(this.n3);
      this.listed.push(flags);
      for (let i = 0; i < this.n3; i++) {
        const v = vals[i];
        if (v !== 0) {
          if (!(v > 0) || !Number.isFinite(v)) { vals[i] = 0; continue; } // repair NaN / negative from a bad save
          flags[i] = 1;
          this.live[s]++;
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
    this.lastKey = -1;
    this.lastSlot = -1;
  }

  /** Slot of a chunk key, -1 if absent. */
  slotOf(key: number): number {
    if (key === this.lastKey) return this.lastSlot;
    const s = this.index.get(key);
    this.lastKey = key;
    this.lastSlot = s === undefined ? -1 : s;
    return this.lastSlot;
  }

  /** Value of cell (ix, iy, iz), 0 when absent. */
  get(ix: number, iy: number, iz: number): number {
    const s = this.shift;
    const cx = ix >> s, cy = iy >> s, cz = iz >> s;
    if (!chunkInRange(cx, cy, cz)) return 0;
    const slot = this.slotOf(pheroChunkKey(cx, cy, cz));
    if (slot < 0) return 0;
    const m = this.mask;
    return this.data.chunks[slot][(ix & m) | ((iy & m) << s) | ((iz & m) << (2 * s))];
  }

  /**
   * Adds amount to a cell (clamped to the channel maximum), creating chunk and list entry as needed. May evict
   * the weakest cells or chunks first when a cap is reached. Returns false if the cell is out of range.
   */
  add(ix: number, iy: number, iz: number, amount: number): boolean {
    const s = this.shift;
    const cx = ix >> s, cy = iy >> s, cz = iz >> s;
    if (!chunkInRange(cx, cy, cz)) return false;
    const key = pheroChunkKey(cx, cy, cz);
    const m = this.mask;
    const local = (ix & m) | ((iy & m) << s) | ((iz & m) << (2 * s));
    let slot = this.slotOf(key);
    if (slot < 0 || this.listed[slot][local] === 0) {
      if (this.count >= this.limits.maxCells) {
        this.makeRoomForCell();
        slot = this.slotOf(key);
      }
      if (slot < 0) {
        slot = this.createChunk(key, cx, cy, cz);
        if (slot < 0) return false;
      }
    }
    const vals = this.data.chunks[slot];
    const v = vals[local] + amount;
    vals[local] = v < this.limits.maxValue ? v : this.limits.maxValue;
    const flags = this.listed[slot];
    if (flags[local] === 0) {
      flags[local] = 1;
      this.live[slot]++;
      this.pushActive((slot << this.shift3) | local);
    }
    this.version++;
    return true;
  }

  private createChunk(key: number, cx: number, cy: number, cz: number): number {
    if (this.data.keys.length >= this.limits.maxChunks) this.evictChunks();
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
    }
    this.live[slot] = 0;
    this.ccx[slot] = cx;
    this.ccy[slot] = cy;
    this.ccz[slot] = cz;
    this.index.set(key, slot);
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

  /** Cell cap reached: drop exact zeros; if still full, evict the weakest PHERO_EVICT_FRACTION of the cells. */
  private makeRoomForCell(): void {
    this.compact(0);
    if (this.count < this.limits.maxCells) return;
    const sh = this.shift3, lm = this.n3 - 1, act = this.active, chunks = this.data.chunks, keys = this.data.keys;
    const nb = evictBinCount(this.limits.maxValue), bpo = PHERO_EVICT_BINS_PER_OCTAVE;
    const bins = new Int32Array(nb);
    for (let i = 0; i < this.count; i++) {
      const e = act[i];
      bins[valueBin(chunks[e >>> sh][e & lm], bpo, nb)]++;
    }
    const cut = evictionThreshold(bins, Math.ceil(this.count * PHERO_EVICT_FRACTION));
    const tieV = new Float64Array(bins[cut.bin]), tieC = new Float64Array(bins[cut.bin]);
    let nt = 0;
    for (let i = 0; i < this.count; i++) {
      const e = act[i];
      const v = chunks[e >>> sh][e & lm];
      if (valueBin(v, bpo, nb) !== cut.bin) continue;
      tieV[nt] = v;
      tieC[nt++] = keys[e >>> sh] * this.n3 + (e & lm);
    }
    const pick = pickWeakest(tieV, tieC, nt, cut.need);
    const listed = this.listed, live = this.live;
    let w = 0, j = 0;
    for (let i = 0, n = this.count; i < n; i++) {
      const e = act[i];
      const slot = e >>> sh, loc = e & lm;
      const vals = chunks[slot];
      const b = valueBin(vals[loc], bpo, nb);
      const evict = b < cut.bin || (b === cut.bin && pick[j++] === 1);
      if (!evict) {
        act[w++] = e;
      } else {
        vals[loc] = 0;
        listed[slot][loc] = 0;
        live[slot]--;
      }
    }
    this.count = w;
    this.freeEmptyChunks();
  }

  /** Chunk cap reached: evict the PHERO_EVICT_FRACTION of chunks whose strongest cell is weakest. */
  private evictChunks(): void {
    this.compact(0);
    const n = this.data.keys.length;
    const sh = this.shift3, lm = this.n3 - 1, act = this.active, chunks = this.data.chunks, keys = this.data.keys;
    const nb = evictBinCount(this.limits.maxValue), bpo = PHERO_EVICT_BINS_PER_OCTAVE;
    const peak = new Float64Array(n);
    for (let i = 0; i < this.count; i++) {
      const e = act[i];
      const v = chunks[e >>> sh][e & lm];
      if (v > peak[e >>> sh]) peak[e >>> sh] = v;
    }
    const bins = new Int32Array(nb);
    for (let s = 0; s < n; s++) bins[valueBin(peak[s], bpo, nb)]++;
    const cut = evictionThreshold(bins, Math.ceil(n * PHERO_EVICT_FRACTION));
    const tieV = new Float64Array(bins[cut.bin]), tieC = new Float64Array(bins[cut.bin]), tieS = new Int32Array(bins[cut.bin]);
    let nt = 0;
    for (let s = 0; s < n; s++) {
      if (valueBin(peak[s], bpo, nb) !== cut.bin) continue;
      tieV[nt] = peak[s];
      tieC[nt] = keys[s];
      tieS[nt++] = s;
    }
    const pick = pickWeakest(tieV, tieC, nt, cut.need);
    const evict = new Uint8Array(n);
    for (let s = 0; s < n; s++) if (valueBin(peak[s], bpo, nb) < cut.bin) evict[s] = 1;
    for (let t = 0; t < nt; t++) if (pick[t] === 1) evict[tieS[t]] = 1;
    const listed = this.listed, live = this.live;
    let w = 0;
    for (let i = 0, c = this.count; i < c; i++) {
      const e = act[i];
      const slot = e >>> sh;
      if (evict[slot] === 0) {
        act[w++] = e;
      } else {
        chunks[slot][e & lm] = 0;
        listed[slot][e & lm] = 0;
        live[slot]--;
      }
    }
    this.count = w;
    this.freeEmptyChunks();
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
    this.data.chunks[e >>> this.shift3][e & (this.n3 - 1)] = v;
  }

  /** Invariant check (tests, soak runs): returns problems found, empty when consistent. O(chunks x 4096). */
  validate(): string[] {
    const bad: string[] = [];
    const tag = `${this.colony}/${this.channel}`;
    const { keys, chunks } = this.data;
    const nc = keys.length;
    if (chunks.length !== nc || this.listed.length !== nc) bad.push(`${tag}: parallel arrays differ`);
    if (nc > this.limits.maxChunks) bad.push(`${tag}: ${nc} chunks > cap`);
    if (this.count > this.limits.maxCells) bad.push(`${tag}: ${this.count} cells > cap`);
    const seen = new Set<number>();
    const perSlot = new Int32Array(nc);
    for (let i = 0; i < this.count; i++) {
      const e = this.active[i];
      const slot = e >>> this.shift3, loc = e & (this.n3 - 1);
      if (seen.has(e)) bad.push(`${tag}: duplicate entry`);
      seen.add(e);
      if (slot >= nc) { bad.push(`${tag}: entry slot out of range`); continue; }
      if (this.listed[slot][loc] !== 1) bad.push(`${tag}: entry not flagged`);
      perSlot[slot]++;
    }
    for (let s = 0; s < nc; s++) {
      if (perSlot[s] !== this.live[s]) bad.push(`${tag}: live count ${this.live[s]} != ${perSlot[s]}`);
      if (this.index.get(keys[s]) !== s) bad.push(`${tag}: index mismatch`);
      const vals = chunks[s], flags = this.listed[s];
      for (let i = 0; i < this.n3; i++) {
        const v = vals[i];
        if (!(v >= 0) || !Number.isFinite(v) || v > this.limits.maxValue) bad.push(`${tag}: bad value ${v}`);
        if (v !== 0 && flags[i] !== 1) bad.push(`${tag}: nonzero cell not listed`);
        if (bad.length > 20) return bad;
      }
    }
    return bad;
  }

  /** Bytes held by this layer's arrays (values, flags, runtime arrays). */
  bytes(): number {
    return this.data.keys.length * this.n3 * 5 + (this.active.length + this.live.length * 4) * 4;
  }
}

/** Histogram bins needed to cover PHERO_EPS..maxValue, plus bin 0 for zero / sub-floor values. */
function evictBinCount(maxValue: number): number {
  return 2 + Math.ceil(Math.log2(maxValue / PHERO_EPS) * PHERO_EVICT_BINS_PER_OCTAVE);
}
