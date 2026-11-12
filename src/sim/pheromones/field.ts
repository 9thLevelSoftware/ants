// The runtime pheromone field over SimState.phero (GDD 02 §8). Works in place on the persisted arrays: the state
// is always current, and createPheromoneField(state.phero) after a load rebuilds every index (no toState step).

import type { Vec3 } from '@/core/math/vec3';
import type {
  PheroCellTest, PheroCellVisitor, PheroChannel, PheroChannelFactors, PheroDecayModifier, PheroHooks,
  PheromoneField, PheromoneLayer, PheromoneState, PheroRegion, PheroWipeOptions,
} from '@/sim/types';
import { PHERO_CHANNELS } from '@/sim/types';
import { PHERO_CELL_BU, PHERO_CHUNK_CELLS } from '@/sim/balance';
import {
  PHERO_CHUNK_POOL_MAX, PHERO_EPS, PHERO_MAX, PHERO_MAX_CELLS, PHERO_MAX_CHUNKS, PHERO_STEER_REACH_BU,
  PHERO_SHARED_CHANNELS, PHERO_SHARED_COLONY,
} from './balance';
import { decayLayer, diffuseLayer, PHERO_DECAY_GROUPS, uniformDt } from './decay';
import { chunkInRange, type ChunkPool, type LayerLimits, LayerRuntime, pheroChunkKey } from './layer';
import { cellBoxOf, cellBoxSize, type CellBox, clampCellBox, regionExtent, regionTest, regionValid } from './region';
import { type PointRead, readPoint, type SenseReading, senseLayer } from './sampling';

export interface PheroFieldOptions {
  /** Per-channel cap overrides (tests, perf runs). */
  limits?: Partial<Record<PheroChannel, Partial<Pick<LayerLimits, 'maxCells' | 'maxChunks'>>>>;
}

export interface PheroFieldStats {
  layers: number;
  cells: number;
  chunks: number;
  /** Bytes held in chunk values, runtime flags and lists. */
  bytes: number;
}

/** The full runtime surface (every optional PheromoneField method implemented). */
export interface PheromoneRuntime extends Required<PheromoneField> {
  readonly data: PheromoneState;
  /** Cell edge, mm. */
  readonly cellMm: number;
  /** L / C / R readings and turn angle of the last sense() call. */
  readonly lastSense: SenseReading;
  /**
   * Staggered decay (pheromoneSystem): decays the chunks of stagger group g by dtByGroup[g] seconds (0 = skip),
   * then diffuses alarm over diffuseDt seconds (0 = not this call). step(dt) is the unstaggered equivalent.
   */
  decayStaggered(dtByGroup: ArrayLike<number>, diffuseDt: number): void;
  stats(): PheroFieldStats;
  /** Invariant check of every layer (tests, soak runs); empty = consistent. Slow: O(chunks x 4096). */
  validate(): string[];
}

const CH_INDEX: Readonly<Record<PheroChannel, number>> = { trail: 0, home: 1, alarm: 2 };

function isPow2(n: number): boolean {
  return Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;
}

function clamp01(f: number): number {
  return f > 0 ? (f < 1 ? f : 1) : 0;
}

function finiteVec(p: Vec3): boolean {
  return Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z);
}

/** Factor of one channel: a number applies to all channels; alarm defaults to the trail factor. Clamped 0..1. */
function factorOf(factors: number | PheroChannelFactors, ch: PheroChannel): number {
  if (typeof factors === 'number') return Number.isFinite(factors) ? clamp01(factors) : 1;
  const f = ch === 'alarm' ? (factors.alarm ?? factors.trail) : factors[ch];
  return Number.isFinite(f) ? clamp01(f) : 1;
}

export function createPheromoneField(data: PheromoneState, opts: PheroFieldOptions = {}): PheromoneRuntime {
  if (!(data.cell > 0)) data.cell = PHERO_CELL_BU * 4;
  if (!isPow2(data.chunkCells)) data.chunkCells = PHERO_CHUNK_CELLS;
  if (!Array.isArray(data.layers)) data.layers = [];
  if (!Number.isFinite(data.lastDecayTick)) data.lastDecayTick = 0;
  const cell = data.cell, inv = 1 / cell, n = data.chunkCells;
  const reach = PHERO_STEER_REACH_BU * (cell / PHERO_CELL_BU);
  const pool: ChunkPool = { values: [], flags: [], max: PHERO_CHUNK_POOL_MAX };
  const layers: LayerRuntime[] = [];
  const byKey = new Map<number, LayerRuntime>();
  const hooks: { decayModifier: PheroDecayModifier | null; isFree: PheroCellTest | null } = {
    decayModifier: null, isFree: null,
  };
  const read: PointRead = { smooth: 0, cell: 0 };
  const lastSense: SenseReading = { left: 0, centre: 0, right: 0, angle: 0 };
  const empty = new LayerRuntime({ colony: -2, channel: 'trail', keys: [], chunks: [] }, n,
    { maxCells: 0, maxChunks: 0, maxValue: 0 }, pool);
  let lastLK = NaN;
  let lastL: LayerRuntime | undefined;

  const limitsFor = (ch: PheroChannel): LayerLimits => ({
    maxCells: opts.limits?.[ch]?.maxCells ?? PHERO_MAX_CELLS[ch],
    maxChunks: opts.limits?.[ch]?.maxChunks ?? PHERO_MAX_CHUNKS[ch],
    maxValue: PHERO_MAX[ch],
  });
  const storeColony = (colony: number, ch: PheroChannel): number => (PHERO_SHARED_CHANNELS[ch] ? PHERO_SHARED_COLONY : colony);
  const keyOf = (colony: number, ch: PheroChannel): number => colony * 4 + CH_INDEX[ch];

  function adopt(d: PheromoneLayer): LayerRuntime {
    const l = new LayerRuntime(d, n, limitsFor(d.channel), pool);
    layers.push(l);
    byKey.set(keyOf(d.colony, d.channel), l);
    return l;
  }

  // Load: keep well-formed layers in their saved order; drop duplicates and layers the sharing rule never reads.
  const saved = data.layers;
  data.layers = [];
  for (const d of saved) {
    if (!d || !(d.channel in CH_INDEX) || !Number.isInteger(d.colony)) continue;
    if (storeColony(d.colony, d.channel) !== d.colony || byKey.has(keyOf(d.colony, d.channel))) continue;
    if (!Array.isArray(d.keys) || !Array.isArray(d.chunks)) continue;
    data.layers.push(d);
    adopt(d);
  }

  function layerOf(colony: number, ch: PheroChannel, create: boolean): LayerRuntime | undefined {
    if (!(ch in CH_INDEX)) return undefined;
    const c = storeColony(colony, ch);
    if (!Number.isInteger(c)) return undefined;
    const k = keyOf(c, ch);
    if (k === lastLK) return lastL;
    let l = byKey.get(k);
    if (!l && create) {
      const d: PheromoneLayer = { colony: c, channel: ch, keys: [], chunks: [] };
      data.layers.push(d);
      l = adopt(d);
    }
    if (l) { lastLK = k; lastL = l; }
    return l;
  }

  function matchesColony(l: LayerRuntime, colony: number | undefined): boolean {
    return colony === undefined || l.colony === colony || l.colony === PHERO_SHARED_COLONY;
  }

  const box: CellBox = { x0: 0, y0: 0, z0: 0, x1: 0, y1: 0, z1: 0 };
  const cellLimit = empty.cellLimit;
  const dtAll = new Float64Array(PHERO_DECAY_GROUPS);
  const ext = new Float64Array(6);
  const centre = { x: 0, y: 0, z: 0 };

  /** Scales the cells of `l` in the cell box that pass `test`; enumerates the box (small regions). */
  function scaleBoxCells(l: LayerRuntime, f: number, test: PheroCellTest): number {
    const s = l.shift, m = l.mask;
    let changed = 0;
    for (let cz = box.z0 >> s; cz <= box.z1 >> s; cz++) {
      for (let cy = box.y0 >> s; cy <= box.y1 >> s; cy++) {
        for (let cx = box.x0 >> s; cx <= box.x1 >> s; cx++) {
          if (!chunkInRange(cx, cy, cz)) continue;
          const slot = l.slotOf(pheroChunkKey(cx, cy, cz));
          if (slot < 0) continue;
          const vals = l.data.chunks[slot];
          const ox = cx << s, oy = cy << s, oz = cz << s;
          const ax = Math.max(box.x0, ox), bx = Math.min(box.x1, ox + m);
          const ay = Math.max(box.y0, oy), by = Math.min(box.y1, oy + m);
          const az = Math.max(box.z0, oz), bz = Math.min(box.z1, oz + m);
          for (let iz = az; iz <= bz; iz++) for (let iy = ay; iy <= by; iy++) for (let ix = ax; ix <= bx; ix++) {
            const loc = (ix - ox) | ((iy - oy) << s) | ((iz - oz) << (2 * s));
            const v = vals[loc];
            if (v === 0 || !test((ix + 0.5) * cell, (iy + 0.5) * cell, (iz + 0.5) * cell)) continue;
            const nv = v * f;
            if (nv >= PHERO_EPS) vals[loc] = nv;
            else { vals[loc] = 0; l.nz--; }
            changed++;
          }
        }
      }
    }
    if (changed > 0) l.version++;
    return changed;
  }

  /** Scales active cells of `l` passing `test` (large regions, washes). */
  function scaleListedCells(l: LayerRuntime, f: number, test: PheroCellTest): number {
    return l.scaleBy((e) => {
      l.centreOf(e, cell, centre);
      return test(centre.x, centre.y, centre.z) ? f : 1;
    });
  }

  function wipe(region: PheroRegion, factors: number | PheroChannelFactors, o: PheroWipeOptions | undefined): number {
    if (!region || !regionValid(region)) return 0;
    const inside = regionTest(region);
    const filter = o?.filter ?? null;
    const test: PheroCellTest = filter ? (x, y, z) => inside(x, y, z) && filter(x, y, z) : inside;
    regionExtent(region, ext);
    cellBoxOf(ext, cell, box);
    clampCellBox(box, cellLimit);
    const size = cellBoxSize(box);
    if (size === 0) return 0;
    let changed = 0;
    for (const l of layers) {
      if (!matchesColony(l, o?.colony)) continue;
      const f = factorOf(factors, l.channel);
      if (f === 1 || l.count === 0) continue;
      changed += size <= l.count ? scaleBoxCells(l, f, test) : scaleListedCells(l, f, test);
    }
    return changed;
  }

  function strongest(l: LayerRuntime, p: Vec3, radius: number, out: Vec3, minValue: number): number {
    const rr = radius * radius;
    let best = 0, bestCode = Infinity, bx = 0, by = 0, bz = 0;
    const consider = (v: number, code: number, x: number, y: number, z: number): void => {
      if (!(v >= minValue) || !(v > 0) || v < best || (v === best && code >= bestCode)) return;
      const dx = x - p.x, dy = y - p.y, dz = z - p.z;
      if (dx * dx + dy * dy + dz * dz > rr) return;
      best = v; bestCode = code; bx = x; by = y; bz = z;
    };
    ext[0] = p.x - radius; ext[1] = p.y - radius; ext[2] = p.z - radius;
    ext[3] = p.x + radius; ext[4] = p.y + radius; ext[5] = p.z + radius;
    cellBoxOf(ext, cell, box);
    clampCellBox(box, cellLimit);
    const s = l.shift, m = l.mask;
    if (cellBoxSize(box) <= l.count) {
      for (let iz = box.z0; iz <= box.z1; iz++) for (let iy = box.y0; iy <= box.y1; iy++) for (let ix = box.x0; ix <= box.x1; ix++) {
        const v = l.get(ix, iy, iz);
        if (v === 0) continue;
        const code = pheroChunkKey(ix >> s, iy >> s, iz >> s) * l.n3 + ((ix & m) | ((iy & m) << s) | ((iz & m) << (2 * s)));
        consider(v, code, (ix + 0.5) * cell, (iy + 0.5) * cell, (iz + 0.5) * cell);
      }
    } else {
      for (let i = 0; i < l.count; i++) {
        const e = l.active[i];
        const v = l.valueOf(e);
        if (v === 0) continue;
        l.centreOf(e, cell, centre);
        consider(v, l.data.keys[e >>> l.shift3] * l.n3 + (e & (l.n3 - 1)), centre.x, centre.y, centre.z);
      }
    }
    if (best > 0) { out.x = bx; out.y = by; out.z = bz; }
    return best;
  }

  function releaseLayer(l: LayerRuntime): void {
    for (const c of l.data.chunks) {
      if (pool.values.length >= pool.max) break;
      c.fill(0);
      pool.values.push(c);
    }
    for (const f of l.listed) {
      if (pool.flags.length >= pool.max) break;
      f.fill(0);
      pool.flags.push(f);
    }
  }

  const field: PheromoneRuntime = {
    data,
    cellMm: cell,
    lastSense,

    deposit(colony, channel, p, amount) {
      if (!(amount > 0) || !finiteVec(p)) return;
      const l = layerOf(colony, channel, true);
      if (l) l.add(Math.floor(p.x * inv), Math.floor(p.y * inv), Math.floor(p.z * inv), amount);
    },

    sample(colony, channel, p) {
      const l = layerOf(colony, channel, false);
      if (!l || !finiteVec(p)) return 0;
      readPoint(l, p.x, p.y, p.z, inv, read);
      return read.cell > read.smooth ? read.cell : read.smooth;
    },

    sampleCell(colony, channel, p) {
      const l = layerOf(colony, channel, false);
      if (!l || !finiteVec(p)) return 0;
      return l.get(Math.floor(p.x * inv), Math.floor(p.y * inv), Math.floor(p.z * inv));
    },

    sense(colony, channel, p, fwd, up, out) {
      const l = (finiteVec(p) ? layerOf(colony, channel, false) : undefined) ?? empty;
      return senseLayer(l, p, fwd, up, reach, inv, out, lastSense);
    },

    strongestNear(colony, channel, p, radius, out, minValue = PHERO_EPS) {
      const l = layerOf(colony, channel, false);
      if (!l || l.count === 0 || !finiteVec(p) || !(radius >= 0) || !Number.isFinite(radius)) return 0;
      return strongest(l, p, radius, out, minValue);
    },

    step(dtSeconds) {
      if (!(dtSeconds > 0) || !Number.isFinite(dtSeconds)) return;
      field.decayStaggered(uniformDt(dtSeconds, dtAll), dtSeconds);
    },

    decayStaggered(dtByGroup, diffuseDt) {
      for (let i = 0; i < layers.length; i++) {
        const l = layers[i];
        decayLayer(l, dtByGroup, cell, hooks.decayModifier);
        if (diffuseDt > 0 && Number.isFinite(diffuseDt)) diffuseLayer(l, diffuseDt, cell, hooks.isFree);
      }
    },

    decay(channel, factor) {
      const f = Number.isFinite(factor) ? clamp01(factor) : 1;
      if (f === 1) return;
      for (const l of layers) {
        if (l.channel !== channel) continue;
        l.scaleAll(f);
        l.freeEmptyChunks();
      }
    },

    scaleRegion(channel, center, radius, factor) {
      const f = { trail: 1, home: 1, alarm: 1 };
      f[channel] = factor;
      wipe({ kind: 'sphere', center, radius }, f, undefined);
    },

    washExposed(factors, isExposed) {
      if (typeof isExposed !== 'function') return 0;
      let changed = 0;
      for (const l of layers) {
        const f = factorOf(factors, l.channel);
        if (f !== 1 && l.count > 0) changed += scaleListedCells(l, f, isExposed);
      }
      return changed;
    },

    wipeRegion(region, factors, o) {
      return wipe(region, factors, o);
    },

    clearColony(colony) {
      for (let i = layers.length - 1; i >= 0; i--) {
        const l = layers[i];
        if (l.colony !== colony) continue;
        releaseLayer(l);
        layers.splice(i, 1);
        byKey.delete(keyOf(l.colony, l.channel));
        const di = data.layers.indexOf(l.data);
        if (di >= 0) data.layers.splice(di, 1);
      }
      lastLK = NaN;
      lastL = undefined;
    },

    forEachActiveCell(colony, channel, fn: PheroCellVisitor) {
      const l = layerOf(colony, channel, false);
      if (!l) return 0;
      let visited = 0;
      for (let i = 0, c = l.count; i < c; i++) {
        const e = l.active[i];
        const v = l.valueOf(e);
        if (v === 0) continue;
        l.centreOf(e, cell, centre);
        fn(centre.x, centre.y, centre.z, v);
        visited++;
      }
      return visited;
    },

    activeCellCount(colony, channel) {
      let total = 0;
      for (const l of layers) {
        if (channel !== undefined && l.channel !== channel) continue;
        if (colony !== undefined && l.colony !== storeColony(colony, l.channel)) continue;
        total += l.nz;
      }
      return total;
    },

    layerVersion(colony, channel) {
      return layerOf(colony, channel, false)?.version ?? 0;
    },

    setHooks(h: PheroHooks) {
      if ('decayModifier' in h) hooks.decayModifier = h.decayModifier ?? null;
      if ('isFree' in h) hooks.isFree = h.isFree ?? null;
    },

    stats() {
      let cells = 0, chunks = 0, bytes = 0;
      for (const l of layers) {
        cells += l.nz;
        chunks += l.chunkCount;
        bytes += l.bytes();
      }
      return { layers: layers.length, cells, chunks, bytes };
    },

    validate() {
      const bad: string[] = [];
      if (layers.length !== data.layers.length) bad.push('runtime and state layer counts differ');
      for (const l of layers) bad.push(...l.validate());
      return bad;
    },
  };
  return field;
}

/** All channels, in canonical order (re-exported for callers iterating layers). */
export const PHERO_CHANNEL_LIST: readonly PheroChannel[] = PHERO_CHANNELS;
