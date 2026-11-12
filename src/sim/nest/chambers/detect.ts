// Chamber detection (GDD 03 §6.2) over a nest's carved space: core voxels (in-layer support >= CORE_HALF and a
// vertical open run >= CORE_RUN), 26-connected core components, regions = core opened by the CORE_HALF disk and
// dilated by CHAMBER_DILATE inside open voxels, regions below CHAMBER_MIN_VOLUME dropped. Pure reads of the carve
// grid in fixed scan orders (deterministic).

import type { Nest, Sim } from '@/sim/types';
import {
  CHAMBER_CORE_HALF_BU, CHAMBER_CORE_RUN_BU, CHAMBER_DILATE_BU, CHAMBER_MIN_VOLUME, nestTemplate,
} from '@/sim/balance/nest';
import { CHUNK as CHUNKImp, OPEN_MIN as OPEN_MINImp, keyCx, keyCy, keyCz, type VoxelBox } from '../carve/keys';

// Hot imports re-bound as local consts (docs/design/tdd/02-kernel.md §2.11: Vitest reads imports through getters).
const CHUNK = CHUNKImp, OPEN_MIN = OPEN_MINImp;
import { packSample as packSampleImp } from '../voxelKey';

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

/** Regions of the open samples inside `box`, in the order of their smallest core sample. */
export function detectRegions(sim: Sim, box: VoxelBox): Region[] {
  const carve = sim.carve, v = carve.voxel, bu = sim.world.bu;
  const packSample = packSampleImp;
  const halfV = (CHAMBER_CORE_HALF_BU * bu) / v;
  const runNeed = Math.ceil((CHAMBER_CORE_RUN_BU * bu) / v - 1e-9);
  const disk = diskOffsets(halfV);
  const ball = ballOffsets((CHAMBER_DILATE_BU * bu) / v);
  const open = (i: number, j: number, k: number) => carve.sampleAt(i, j, k) >= OPEN_MIN;

  // 1. core samples, scanned chunk by chunk in key order over padded local blocks
  const ax = Math.ceil(halfV), ay = runNeed - 1, sx = CHUNK + 2 * ax, sy = CHUNK + 2 * ay;
  const block = new Uint8Array(sx * sx * sy);
  const diskIdx = new Int32Array(disk.length / 2);
  for (let n = 0; n < diskIdx.length; n++) diskIdx[n] = disk[2 * n] + disk[2 * n + 1] * sx;
  const layer = sx * sx;
  const keys = carve.data.keys.filter((key) => {
    const ci = keyCx(key) * CHUNK, cj = keyCy(key) * CHUNK, ck = keyCz(key) * CHUNK;
    return ci + CHUNK > box.i0 && ci <= box.i1 && cj + CHUNK > box.j0 && cj <= box.j1 && ck + CHUNK > box.k0 && ck <= box.k1;
  }).sort((a, b) => a - b);
  const core: number[] = [];
  for (const key of keys) {
    paddedBlock(sim, key, ax, ay, block);
    const bi = keyCx(key) * CHUNK, bj = keyCy(key) * CHUNK, bk = keyCz(key) * CHUNK;
    for (let lj = 0; lj < CHUNK; lj++) for (let lk = 0; lk < CHUNK; lk++) for (let li = 0; li < CHUNK; li++) {
      const at = ((lj + ay) * sx + (lk + ax)) * sx + li + ax;
      if (block[at] < OPEN_MIN) continue;
      const i = bi + li, j = bj + lj, k = bk + lk;
      if (i < box.i0 || i > box.i1 || j < box.j0 || j > box.j1 || k < box.k0 || k > box.k1) continue;
      let run = 1;
      for (let d = 1; run < runNeed && block[at + d * layer] >= OPEN_MIN; d++) run++;
      for (let d = 1; run < runNeed && block[at - d * layer] >= OPEN_MIN; d++) run++;
      if (run < runNeed) continue;
      let ok = true;
      for (let n = 0; n < diskIdx.length; n++) if (block[at + diskIdx[n]] < OPEN_MIN) { ok = false; break; }
      if (ok) core.push((i - box.i0) + ((j - box.j0) + (k - box.k0) * (box.j1 - box.j0 + 1)) * (box.i1 - box.i0 + 1));
    }
  }
  core.sort((a, b) => a - b);
  const coreSet = new Set(core);
  // local integer keys (small integers hash fast; packed keys only for the output)
  const nx = box.i1 - box.i0 + 1, ny = box.j1 - box.j0 + 1;
  const L = (i: number, j: number, k: number): number =>
    i < box.i0 || i > box.i1 || j < box.j0 || j > box.j1 || k < box.k0 || k > box.k1 ? -1 : (i - box.i0) + ((j - box.j0) + (k - box.k0) * ny) * nx;
  const li = (key: number) => key % nx + box.i0;
  const lj = (key: number) => Math.floor(key / nx) % ny + box.j0;
  const lk = (key: number) => Math.floor(key / (nx * ny)) + box.k0;

  // 2. 26-connected components of the core
  const comp = new Map<number, number>();
  const comps: number[][] = [];
  for (const start of core) {
    if (comp.has(start)) continue;
    const id = comps.length, list = [start];
    comp.set(start, id);
    for (let q = 0; q < list.length; q++) {
      const s = list[q], i = li(s), j = lj(s), k = lk(s);
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const nkey = L(i + di, j + dj, k + dk);
        if (nkey >= 0 && coreSet.has(nkey) && !comp.has(nkey)) { comp.set(nkey, id); list.push(nkey); }
      }
    }
    comps.push(list.sort((a, b) => a - b));
  }

  // 3. regions: opening by the core disk, then dilation inside open samples (first component wins a sample)
  const owner = new Map<number, number>();
  const regions: Region[] = [];
  const minCount = CHAMBER_MIN_VOLUME / (v / bu) ** 3;
  const toPacked = (keys: number[]) => keys.map((key) => packSample(li(key), lj(key), lk(key)));
  for (let c = 0; c < comps.length; c++) {
    const list: number[] = [];
    const claim = (key: number) => { if (key >= 0 && !owner.has(key)) { owner.set(key, c); list.push(key); } };
    for (const s of comps[c]) claim(s);
    // the disk union of the core equals that of its in-layer boundary (a far point's segment exits the core there)
    for (const s of comps[c]) {
      const i = li(s), j = lj(s), k = lk(s);
      if (coreSet.has(L(i + 1, j, k)) && coreSet.has(L(i - 1, j, k)) && coreSet.has(L(i, j, k + 1)) && coreSet.has(L(i, j, k - 1))) continue;
      for (let n = 0; n < disk.length; n += 2) claim(L(i + disk[n], j, k + disk[n + 1]));
    }
    const opened = list.length;
    for (let q = 0; q < opened; q++) {
      const s = list[q], i = li(s), j = lj(s), k = lk(s);
      // dilation only grows from the boundary of the opened region
      if (owner.get(L(i + 1, j, k)) === c && owner.get(L(i - 1, j, k)) === c && owner.get(L(i, j + 1, k)) === c
        && owner.get(L(i, j - 1, k)) === c && owner.get(L(i, j, k + 1)) === c && owner.get(L(i, j, k - 1)) === c) continue;
      for (let n = 0; n < ball.length; n += 3) {
        const ni = i + ball[n], nj = j + ball[n + 1], nk = k + ball[n + 2];
        if (open(ni, nj, nk)) claim(L(ni, nj, nk));
      }
    }
    if (list.length < minCount) continue;
    regions.push({ keys: toPacked(list.sort((a, b) => a - b)), core: toPacked(comps[c]) });
  }
  return regions;
}
