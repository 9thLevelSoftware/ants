// Chamber detection (GDD 03 §6.2) over a nest's carved space: core voxels (in-layer support >= CORE_HALF and a
// vertical open run >= CORE_RUN), 26-connected core components, regions = core opened by the CORE_HALF disk and
// dilated by CHAMBER_DILATE inside open voxels, regions below CHAMBER_MIN_VOLUME dropped. Pure reads of the carve
// grid in fixed scan orders (deterministic). The core test is local (it reads CORE_APRON samples around each
// sample), so its result per chunk is cached by the caller and recomputed only for chunks near a carve.

import type { Nest, Sim } from '@/sim/types';
import {
  CHAMBER_CORE_HALF_BU, CHAMBER_CORE_RUN_BU, CHAMBER_DILATE_BU, CHAMBER_MIN_VOLUME, nestTemplate,
} from '@/sim/balance/nest';
import { CARVE_VOXEL_BU } from '@/sim/balance/world';
import { CHUNK as CHUNKImp, OPEN_MIN as OPEN_MINImp, keyCx, keyCy, keyCz, type VoxelBox } from '../carve/keys';

// Hot imports re-bound as local consts (docs/design/tdd/02-kernel.md §2.11: Vitest reads imports through getters).
const CHUNK = CHUNKImp, OPEN_MIN = OPEN_MINImp;
import { packSample as packSampleImp, sampleI as sampleIImp, sampleJ as sampleJImp, sampleK as sampleKImp } from '../voxelKey';
const sampleI = sampleIImp, sampleJ = sampleJImp, sampleK = sampleKImp, packSample = packSampleImp;
import { PassGrid, delta } from './tiles';

/** Samples around a sample that its core test reads (in-layer disk radius, vertical run), + 1 for safety. */
export const CORE_APRON = Math.ceil(Math.max(CHAMBER_CORE_HALF_BU, CHAMBER_CORE_RUN_BU) / CARVE_VOXEL_BU) + 1;

export interface Region {
  /** Packed sample keys (voxelKey), ascending. */
  keys: number[];
  /** Core samples of the region, ascending. */
  core: number[];
}

/** Sample box a nest can occupy: its footprint around the origin and its depth range (template). */
export function nestSampleBox(sim: Sim, nest: Nest): VoxelBox {
  const t = nestTemplate(sim.stores.colonies.get(nest.colony)?.species ?? sim.species.id);
  const v = sim.carve.voxel, bu = sim.world.bu;
  const r = (t.footprintR + 8) * bu, o = nest.origin;
  return {
    i0: Math.floor((o.x - r) / v), i1: Math.ceil((o.x + r) / v),
    k0: Math.floor((o.z - r) / v), k1: Math.ceil((o.z + r) / v),
    j0: Math.floor((o.y - (t.maxDepth + 16) * bu) / v), j1: Math.ceil((o.y + 16 * bu) / v),
  };
}

/** In-layer offsets with 0 < d^2 < R^2 (voxels), nearest first (an early refusal is likely close by). */
function diskOffsets(R: number): number[] {
  const out: [number, number, number][] = [];
  const m = Math.ceil(R);
  for (let dk = -m; dk <= m; dk++) for (let di = -m; di <= m; di++) {
    const d2 = di * di + dk * dk;
    if (d2 > 0 && d2 < R * R - 1e-9) out.push([d2, di, dk]);
  }
  out.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1]);
  return out.flatMap((o) => [o[1], o[2]]);
}

/** 3D offsets with 0 < d^2 <= R^2 (voxels). */
function ballOffsets(R: number): number[] {
  const out: number[] = [];
  const m = Math.floor(R);
  for (let dk = -m; dk <= m; dk++) for (let dj = -m; dj <= m; dj++) for (let di = -m; di <= m; di++) {
    const d2 = di * di + dj * dj + dk * dk;
    if (d2 > 0 && d2 <= R * R + 1e-9) out.push(di, dj, dk);
  }
  return out;
}

/**
 * Openness of a chunk with an apron (`ax` samples in x and z, `ay` in y) copied from its neighbours, so the core
 * test indexes one local array instead of the sparse grid. Layout: x fastest, then z, then y.
 */
function paddedBlock(sim: Sim, key: number, ax: number, ay: number, out: Uint8Array): void {
  const carve = sim.carve, sx = CHUNK + 2 * ax, sy = CHUNK + 2 * ay;
  const bi = keyCx(key) * CHUNK - ax, bj = keyCy(key) * CHUNK - ay, bk = keyCz(key) * CHUNK - ax;
  out.fill(0);
  for (let cz = Math.floor(bk / CHUNK); cz <= Math.floor((bk + sx - 1) / CHUNK); cz++)
    for (let cy = Math.floor(bj / CHUNK); cy <= Math.floor((bj + sy - 1) / CHUNK); cy++)
      for (let cx = Math.floor(bi / CHUNK); cx <= Math.floor((bi + sx - 1) / CHUNK); cx++) {
        const a = carve.chunk(cx, cy, cz);
        if (!a) continue;
        const i0 = Math.max(bi, cx * CHUNK), i1 = Math.min(bi + sx - 1, cx * CHUNK + CHUNK - 1);
        const j0 = Math.max(bj, cy * CHUNK), j1 = Math.min(bj + sy - 1, cy * CHUNK + CHUNK - 1);
        const k0 = Math.max(bk, cz * CHUNK), k1 = Math.min(bk + sx - 1, cz * CHUNK + CHUNK - 1);
        for (let j = j0; j <= j1; j++) for (let k = k0; k <= k1; k++) {
          const src = (j & 15) * 16 + (k & 15) * 256, dst = ((j - bj) * sx + (k - bk)) * sx - bi;
          for (let i = i0; i <= i1; i++) out[dst + i] = a[(i & 15) + src];
        }
      }
}

/** Core-test geometry (voxels) and scratch, shared by the chunks of one detection pass. */
interface CoreScan { ax: number; ay: number; sx: number; runNeed: number; layer: number; diskIdx: Int32Array; block: Uint8Array }

function coreScan(sim: Sim): CoreScan {
  const v = sim.carve.voxel, bu = sim.world.bu;
  const halfV = (CHAMBER_CORE_HALF_BU * bu) / v;
  const runNeed = Math.ceil((CHAMBER_CORE_RUN_BU * bu) / v - 1e-9);
  const disk = diskOffsets(halfV);
  const ax = Math.ceil(halfV), ay = runNeed - 1, sx = CHUNK + 2 * ax, sy = CHUNK + 2 * ay;
  const diskIdx = new Int32Array(disk.length / 2);
  for (let n = 0; n < diskIdx.length; n++) diskIdx[n] = disk[2 * n] + disk[2 * n + 1] * sx;
  return { ax, ay, sx, runNeed, layer: sx * sx, diskIdx, block: new Uint8Array(sx * sx * sy) };
}

/** Core samples of one chunk (packed keys, scan order): open, vertical open run >= CORE_RUN, full in-layer disk. */
function chunkCore(sim: Sim, key: number, sc: CoreScan): number[] {
  const { ax, ay, sx, runNeed, layer, diskIdx, block } = sc;
  paddedBlock(sim, key, ax, ay, block);
  const bi = keyCx(key) * CHUNK, bj = keyCy(key) * CHUNK, bk = keyCz(key) * CHUNK;
  const out: number[] = [];
  for (let lj = 0; lj < CHUNK; lj++) for (let lk = 0; lk < CHUNK; lk++) for (let li = 0; li < CHUNK; li++) {
    const at = ((lj + ay) * sx + (lk + ax)) * sx + li + ax;
    if (block[at] < OPEN_MIN) continue;
    let run = 1;
    for (let d = 1; run < runNeed && block[at + d * layer] >= OPEN_MIN; d++) run++;
    for (let d = 1; run < runNeed && block[at - d * layer] >= OPEN_MIN; d++) run++;
    if (run < runNeed) continue;
    let ok = true;
    for (let n = 0; n < diskIdx.length; n++) if (block[at + diskIdx[n]] < OPEN_MIN) { ok = false; break; }
    if (ok) out.push(packSample(bi + li, bj + lj, bk + lk));
  }
  return out;
}

/**
 * Regions of the open samples inside `box`, in the order of their smallest core sample. `coreCache` (chunk key ->
 * core samples) is read and filled; the caller drops entries of chunks within CORE_APRON samples of a carve.
 * `grid` is reusable scratch (any PassGrid; a new one when omitted).
 */
export function detectRegions(sim: Sim, box: VoxelBox, coreCache?: Map<number, number[]>, grid: PassGrid = new PassGrid()): Region[] {
  const carve = sim.carve, v = carve.voxel, bu = sim.world.bu;
  const halfV = (CHAMBER_CORE_HALF_BU * bu) / v;
  const disk = diskOffsets(halfV);
  const ball = ballOffsets((CHAMBER_DILATE_BU * bu) / v);
  const inBox = (i: number, j: number, k: number) => i >= box.i0 && i <= box.i1 && j >= box.j0 && j <= box.j1 && k >= box.k0 && k <= box.k1;

  // 1. core samples (packed keys), chunk by chunk in key order (cached per chunk), kept inside the box
  let sc: CoreScan | null = null;
  const keys = carve.data.keys.filter((key) => {
    const ci = keyCx(key) * CHUNK, cj = keyCy(key) * CHUNK, ck = keyCz(key) * CHUNK;
    return ci + CHUNK > box.i0 && ci <= box.i1 && cj + CHUNK > box.j0 && cj <= box.j1 && ck + CHUNK > box.k0 && ck <= box.k1;
  }).sort((a, b) => a - b);
  grid.reset(carve, keys, box);
  const g = grid, isCore = g.core, compOf = g.comp, owner = g.owner, openB = g.open;
  const core: number[] = [];
  for (const key of keys) {
    let list = coreCache?.get(key);
    if (!list) {
      list = chunkCore(sim, key, sc ?? (sc = coreScan(sim)));
      coreCache?.set(key, list);
    }
    for (const s of list) {
      const i = sampleI(s), j = sampleJ(s), k = sampleK(s);
      if (!inBox(i, j, k)) continue;
      core.push(s);
      isCore[g.at(i, j, k)] = 1;
    }
  }
  core.sort((a, b) => a - b);
  // index of an in-box sample of the pass, else -1
  const idx = (i: number, j: number, k: number) => (inBox(i, j, k) ? g.at(i, j, k) : -1);
  // neighbour offsets: [di, dj, dk] triples with their slot-index and packed-key deltas (interior fast path)
  const P0 = packSample(0, 0, 0);
  const offsets = (tr: number[]) => {
    const d = new Int32Array(tr.length / 3), p = new Float64Array(tr.length / 3);
    for (let n = 0; n < d.length; n++) { d[n] = delta(tr[3 * n], tr[3 * n + 1], tr[3 * n + 2]); p[n] = packSample(tr[3 * n], tr[3 * n + 1], tr[3 * n + 2]) - P0; }
    return { tr, d, p };
  };
  const n26: number[] = [];
  for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) n26.push(di, dj, dk);
  const N26 = offsets(n26);
  const diskTr: number[] = [];
  for (let n = 0; n < disk.length; n += 2) diskTr.push(disk[n], 0, disk[n + 1]);
  const DISK = offsets(diskTr), BALL = offsets(ball), N4 = offsets([1, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, -1]);
  const N6 = offsets([1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1]);
  const mDisk = Math.ceil(halfV), mBall = Math.floor((CHAMBER_DILATE_BU * bu) / v);
  /** Calls fn(index, packed) for each offset of `o` around sample s (index x); m / my: the offsets' reach. */
  const around = (s: number, x: number, o: ReturnType<typeof offsets>, m: number, my: number, fn: (y: number, p: number) => void) => {
    if (g.interior(x, m, my)) {
      for (let n = 0; n < o.d.length; n++) fn(x + o.d[n], s + o.p[n]);
      return;
    }
    // near a chunk face: offsets that stay in the chunk (inside the box) by delta, the others by lookup
    const l = x & 4095, li = l & 15, lj = (l >> 4) & 15, lk = l >> 8, inside = g.slotInside(x), tr = o.tr;
    let i = 0, j = 0, k = 0, decoded = false;
    for (let n = 0; n < o.d.length; n++) {
      const a = li + tr[3 * n], b = lj + tr[3 * n + 1], c = lk + tr[3 * n + 2];
      if (inside && a >= 0 && a < 16 && b >= 0 && b < 16 && c >= 0 && c < 16) { fn(x + o.d[n], s + o.p[n]); continue; }
      if (!decoded) { i = sampleI(s); j = sampleJ(s); k = sampleK(s); decoded = true; }
      const y = idx(i + tr[3 * n], j + tr[3 * n + 1], k + tr[3 * n + 2]);
      if (y >= 0) fn(y, s + o.p[n]);
    }
  };
  /** Do all offsets of `o` around s satisfy test(index)? (outside the pass counts as false) */
  const allAround = (s: number, x: number, o: ReturnType<typeof offsets>, test: (y: number) => boolean) => {
    if (g.interior(x, 1, 1)) {
      for (let n = 0; n < o.d.length; n++) if (!test(x + o.d[n])) return false;
      return true;
    }
    const i = sampleI(s), j = sampleJ(s), k = sampleK(s), tr = o.tr;
    for (let n = 0; n < o.d.length; n++) {
      const y = idx(i + tr[3 * n], j + tr[3 * n + 1], k + tr[3 * n + 2]);
      if (y < 0 || !test(y)) return false;
    }
    return true;
  };

  // 2. 26-connected components of the core (compOf = component index + 1)
  const comps: number[][] = [];
  for (const start of core) {
    const x0 = g.at(sampleI(start), sampleJ(start), sampleK(start));
    if (compOf[x0] !== 0) continue;
    const id = comps.length + 1, list = [start], xs = [x0];
    compOf[x0] = id;
    const visit = (y: number, p: number) => {
      if (isCore[y] !== 1 || compOf[y] !== 0) return;
      compOf[y] = id;
      list.push(p); xs.push(y);
    };
    const d26 = N26.d, p26 = N26.p;
    for (let q = 0; q < list.length; q++) {
      const x = xs[q];
      if (!g.interior(x, 1, 1)) { around(list[q], x, N26, 1, 1, visit); continue; }
      for (let n = 0; n < d26.length; n++) {
        const y = x + d26[n];
        if (isCore[y] !== 1 || compOf[y] !== 0) continue;
        compOf[y] = id;
        list.push(list[q] + p26[n]); xs.push(y);
      }
    }
    comps.push(list.sort((a, b) => a - b));
  }

  // 3. regions: opening by the core disk, then dilation inside open samples (first component wins a sample;
  //    owner = component index + 1)
  const regions: Region[] = [];
  const minCount = CHAMBER_MIN_VOLUME / (v / bu) ** 3;
  const isCoreAt = (y: number) => isCore[y] === 1;
  for (let c = 0; c < comps.length; c++) {
    const id = c + 1, list: number[] = [], xs: number[] = [];
    const claim = (y: number, p: number) => {
      if (owner[y] !== 0) return;
      owner[y] = id;
      list.push(p); xs.push(y);
    };
    const cxs = comps[c].map((s) => g.at(sampleI(s), sampleJ(s), sampleK(s)));
    comps[c].forEach((s, n) => claim(cxs[n], s));
    // the disk union of the core equals that of its in-layer boundary (a far point's segment exits the core there)
    comps[c].forEach((s, n) => {
      if (allAround(s, cxs[n], N4, isCoreAt)) return;
      around(s, cxs[n], DISK, mDisk, 0, claim);
    });
    const opened = list.length;
    const mine = (y: number) => owner[y] === id;
    const claimOpen = (y: number, p: number) => { if (openB[y] >= OPEN_MIN) claim(y, p); };
    const d6 = N6.d, dB = BALL.d, pB = BALL.p;
    for (let q = 0; q < opened; q++) {
      const x = xs[q];
      if (!g.interior(x, mBall, mBall)) {
        // dilation only grows from the boundary of the opened region
        if (!allAround(list[q], x, N6, mine)) around(list[q], x, BALL, mBall, mBall, claimOpen);
        continue;
      }
      let inner = true;
      for (let n = 0; n < 6; n++) if (owner[x + d6[n]] !== id) { inner = false; break; }
      if (inner) continue;
      for (let n = 0; n < dB.length; n++) {
        const y = x + dB[n];
        if (openB[y] < OPEN_MIN || owner[y] !== 0) continue;
        owner[y] = id;
        list.push(list[q] + pB[n]); xs.push(y);
      }
    }
    if (list.length < minCount) continue;
    regions.push({ keys: list.sort((a, b) => a - b), core: comps[c] });
  }
  return regions;
}
