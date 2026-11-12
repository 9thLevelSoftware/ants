// Chamber detection (GDD 03 §6.2) over a nest's carved space: core voxels (in-layer support >= CORE_HALF and a
// vertical open run >= CORE_RUN), 26-connected core components, regions = core opened by the CORE_HALF disk and
// dilated by CHAMBER_DILATE inside open voxels, regions below CHAMBER_MIN_VOLUME dropped. Pure reads of the carve
// grid in fixed scan orders (deterministic).

import type { Nest, Sim } from '@/sim/types';
import {
  CHAMBER_CORE_HALF_BU, CHAMBER_CORE_RUN_BU, CHAMBER_DILATE_BU, CHAMBER_MIN_VOLUME, nestTemplate,
} from '@/sim/balance/nest';
import { CHUNK, OPEN_MIN, keyCx, keyCy, keyCz, type VoxelBox } from '../carve/keys';
import { packSample, sampleI, sampleJ, sampleK } from '../voxelKey';

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

/** Regions of the open samples inside `box`, in the order of their smallest core sample. */
export function detectRegions(sim: Sim, box: VoxelBox): Region[] {
  const carve = sim.carve, v = carve.voxel, bu = sim.world.bu;
  const halfV = (CHAMBER_CORE_HALF_BU * bu) / v;
  const runNeed = Math.ceil((CHAMBER_CORE_RUN_BU * bu) / v - 1e-9);
  const disk = diskOffsets(halfV);
  const ball = ballOffsets((CHAMBER_DILATE_BU * bu) / v);
  const open = (i: number, j: number, k: number) => carve.sampleAt(i, j, k) >= OPEN_MIN;

  const isCore = (i: number, j: number, k: number): boolean => {
    let run = 1;
    for (let d = 1; run < runNeed && open(i, j + d, k); d++) run++;
    for (let d = 1; run < runNeed && open(i, j - d, k); d++) run++;
    if (run < runNeed) return false;
    for (let n = 0; n < disk.length; n += 2) if (!open(i + disk[n], j, k + disk[n + 1])) return false;
    return true;
  };

  // 1. core samples, scanned chunk by chunk in key order
  const keys = carve.data.keys.filter((key) => {
    const ci = keyCx(key) * CHUNK, cj = keyCy(key) * CHUNK, ck = keyCz(key) * CHUNK;
    return ci + CHUNK > box.i0 && ci <= box.i1 && cj + CHUNK > box.j0 && cj <= box.j1 && ck + CHUNK > box.k0 && ck <= box.k1;
  }).sort((a, b) => a - b);
  const core: number[] = [];
  for (const key of keys) {
    carve.forEachOpenSample(key, (i, j, k) => {
      if (i < box.i0 || i > box.i1 || j < box.j0 || j > box.j1 || k < box.k0 || k > box.k1) return;
      if (isCore(i, j, k)) core.push(packSample(i, j, k));
    });
  }
  core.sort((a, b) => a - b);
  const coreSet = new Set(core);

  // 2. 26-connected components of the core
  const comp = new Map<number, number>();
  const comps: number[][] = [];
  for (const start of core) {
    if (comp.has(start)) continue;
    const id = comps.length, list = [start];
    comp.set(start, id);
    for (let q = 0; q < list.length; q++) {
      const s = list[q], i = sampleI(s), j = sampleJ(s), k = sampleK(s);
      for (let dk = -1; dk <= 1; dk++) for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const nkey = packSample(i + di, j + dj, k + dk);
        if (coreSet.has(nkey) && !comp.has(nkey)) { comp.set(nkey, id); list.push(nkey); }
      }
    }
    comps.push(list.sort((a, b) => a - b));
  }

  // 3. regions: opening by the core disk, then dilation inside open samples (first component wins a sample)
  const owner = new Map<number, number>();
  const regions: Region[] = [];
  const minCount = CHAMBER_MIN_VOLUME / (v / bu) ** 3;
  for (let c = 0; c < comps.length; c++) {
    const list: number[] = [];
    const claim = (key: number) => { if (!owner.has(key)) { owner.set(key, c); list.push(key); } };
    for (const s of comps[c]) {
      const i = sampleI(s), j = sampleJ(s), k = sampleK(s);
      claim(s);
      for (let n = 0; n < disk.length; n += 2) claim(packSample(i + disk[n], j, k + disk[n + 1]));
    }
    const opened = list.length;
    for (let q = 0; q < opened; q++) {
      const s = list[q], i = sampleI(s), j = sampleJ(s), k = sampleK(s);
      for (let n = 0; n < ball.length; n += 3) {
        const ni = i + ball[n], nj = j + ball[n + 1], nk = k + ball[n + 2];
        if (open(ni, nj, nk)) claim(packSample(ni, nj, nk));
      }
    }
    if (list.length < minCount) continue;
    regions.push({ keys: list.sort((a, b) => a - b), core: comps[c] });
  }
  return regions;
}
