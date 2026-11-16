// Spill heights of a nest (GDD 03 §11.2): where the water goes as it rises. A derived cache per nest, rebuilt on
// demand when the nest's carved space, entrances or chambers changed (a pure function of persisted state, so save /
// load and replays agree):
//   1. the nest's cavity = open carve samples below the ground, 6-connected to its entrance throats;
//   2. the pool bottom = the lowest sample water reaches by running downhill (and level) from the entrances;
//   3. H*(v) = minimax path height from the pool bottom to v (a bucket "priority flood" on sample layers), so a
//      side chamber fills only once the water rises over its sill;
//   4. samples sorted by H* with cumulative volume, wet wall area and wall drainage (V(L), A(L), sum K A).
//      Only the samples connected to the pool bottom are sorted: they are the basin; a part of the cavity that is not
//      connected to it (a trial pit beside a plugged founding cell) is not in the cache.
// The water level L for a volume W is then a binary search; voxels with sorted index < flooded count are flooded.

import type { Chamber, Entrance, Nest, Sim } from '@/sim/types';
import { VoxelFlag } from '@/sim/types';
import { FLOOD_K_DRAIN, FLOOD_K_DRAIN_LOOSE_MULT, FLOOD_MAX_VOXELS, FLOOD_WALL_FACE_BU2 } from '@/sim/balance/weather';
import { OPEN_FRACTION, OPEN_MIN } from '../carve/keys';
import { nestRuntime } from '../runtime';

/**
 * Integer value per carve sample, -1 where unset: chunked Int32Arrays keyed by a small-integer chunk key (Maps with
 * the packed 45-bit sample keys were most of the build cost).
 */
export class SampleTable {
  private readonly chunks = new Map<number, Int32Array>();
  private lastKey = -1;
  private last: Int32Array | undefined;

  private chunkOf(i: number, j: number, k: number, create: boolean): Int32Array | undefined {
    const key = ((i >> 4) & 1023) | (((j >> 4) & 1023) << 10) | (((k >> 4) & 1023) << 20);
    if (key === this.lastKey) return this.last;
    let a = this.chunks.get(key);
    if (!a) {
      if (!create) return undefined;
      a = new Int32Array(4096).fill(-1);
      this.chunks.set(key, a);
    }
    this.lastKey = key;
    this.last = a;
    return a;
  }

  get(i: number, j: number, k: number): number {
    const a = this.chunkOf(i, j, k, false);
    return a === undefined ? -1 : a[(i & 15) | ((j & 15) << 4) | ((k & 15) << 8)];
  }

  set(i: number, j: number, k: number, v: number): void {
    this.chunkOf(i, j, k, true)![(i & 15) | ((j & 15) << 4) | ((k & 15) << 8)] = v;
  }
}

export interface SpillCache {
  nestId: number;
  /** Sample indices in H* order. */
  si: Int32Array;
  sj: Int32Array;
  sk: Int32Array;
  /** Spill height of each sorted sample, in sample layers (water level j * voxel mm). */
  level: Int32Array;
  /** Cumulative open volume (BU^3), wet wall area (BU^2) and K x area (BU^3/s) of the first n samples (length n + 1). */
  cumVol: Float64Array;
  cumWall: Float64Array;
  cumKA: Float64Array;
  /** Sample -> sorted index (-1: not in the cavity). */
  index: SampleTable;
  /** Per chamber id: sorted indices of its samples, ascending. */
  chamberSamples: Map<number, Int32Array>;
  /** Bounding box of the cavity, sample indices (inclusive). */
  box: { i0: number; j0: number; k0: number; i1: number; j1: number; k1: number };
  /** Carve version, entrance and chamber signature the cache was built from. */
  carveVersion: number;
  sig: string;
  /** True when the cavity was larger than FLOOD_MAX_VOXELS (the rest is ignored). */
  truncated: boolean;
}

const N6 = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];

/** Entrance and chamber geometry the cache depends on. */
export function nestSignature(nest: Nest): string {
  let s = '';
  for (const e of nest.entrances) s += `e${e.id}:${Math.round(e.pos.x)},${Math.round(e.pos.y)},${Math.round(e.pos.z)},${Math.round(e.radius)};`;
  for (const c of nest.chambers) s += `c${c.id}:${Math.round(c.center.x)},${Math.round(c.center.y)},${Math.round(c.center.z)},${Math.round(c.radii.x)},${Math.round(c.radii.y)},${Math.round(c.radii.z)};`;
  return s;
}

function isCavity(sim: Sim, i: number, j: number, k: number): boolean {
  if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) return false;
  const v = sim.carve.voxel;
  return sim.field.substrateXYZ(i * v, j * v, k * v) < 0;
}

/** Visits the samples of an entrance's throat region (within radius + 2 BU of the opening). */
function forThroat(sim: Sim, e: Entrance, fn: (i: number, j: number, k: number) => void): void {
  const v = sim.carve.voxel, bu = sim.world.bu;
  const r = e.radius + bu;
  const i0 = Math.floor((e.pos.x - r) / v), i1 = Math.ceil((e.pos.x + r) / v);
  const j0 = Math.floor((e.pos.y - r - bu) / v), j1 = Math.ceil((e.pos.y + r) / v);
  const k0 = Math.floor((e.pos.z - r) / v), k1 = Math.ceil((e.pos.z + r) / v);
  for (let k = k0; k <= k1; k++) for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    if ((i * v - e.pos.x) ** 2 + (j * v - e.pos.y) ** 2 + (k * v - e.pos.z) ** 2 > (r + bu) ** 2) continue;
    fn(i, j, k);
  }
}

/** Throat samples of the nest's entrances (cavity samples within radius + 2 BU of each opening). */
function seedsOf(sim: Sim, nest: Nest): number[] {
  const v = sim.carve.voxel, out: number[] = [];
  for (const e of nest.entrances) forThroat(sim, e, (i, j, k) => { if (isCavity(sim, i, j, k)) out.push(i, j, k); });
  // a nest without entrances (sealed-in founding cell whose opening record is gone): its chambers
  if (out.length === 0) {
    for (const c of nest.chambers) {
      const i = Math.round(c.center.x / v), j = Math.round(c.center.y / v), k = Math.round(c.center.z / v);
      if (isCavity(sim, i, j, k)) out.push(i, j, k);
    }
  }
  return out;
}

/** Labels of visited non-members in the cavity table: a solid sample (a wall) and an open one (air, overflow). */
const SEEN_SOLID = -2;
const SEEN_OPEN = -3;

/**
 * Breadth-first cavity component from the seeds (6-connected), in deterministic order. `at` ends with the cavity
 * index of every member and a SEEN_* label for every visited neighbour, so the wall test needs no grid reads.
 */
function cavityOf(sim: Sim, seeds: number[], at: SampleTable): { i: number[]; j: number[]; k: number[]; seeds: number; truncated: boolean } {
  const I: number[] = [], J: number[] = [], K: number[] = [];
  for (let s = 0; s < seeds.length; s += 3) {
    if (at.get(seeds[s], seeds[s + 1], seeds[s + 2]) !== -1) continue;
    at.set(seeds[s], seeds[s + 1], seeds[s + 2], I.length);
    I.push(seeds[s]); J.push(seeds[s + 1]); K.push(seeds[s + 2]);
  }
  const seedCount = I.length;
  let truncated = false;
  for (let q = 0; q < I.length; q++) {
    for (let d = 0; d < 18; d += 3) {
      const i = I[q] + N6[d], j = J[q] + N6[d + 1], k = K[q] + N6[d + 2];
      if (at.get(i, j, k) !== -1) continue;
      if (sim.carve.sampleAt(i, j, k) < OPEN_MIN) { at.set(i, j, k, SEEN_SOLID); continue; }
      if (!isCavity(sim, i, j, k)) { at.set(i, j, k, SEEN_OPEN); continue; }
      if (I.length >= FLOOD_MAX_VOXELS) { truncated = true; at.set(i, j, k, SEEN_OPEN); continue; }
      at.set(i, j, k, I.length);
      I.push(i); J.push(j); K.push(k);
    }
  }
  return { i: I, j: J, k: K, seeds: seedCount, truncated };
}

/** Lowest sample reachable from the seeds without climbing (index into the cavity arrays). */
function poolBottom(n: number, I: number[], J: number[], K: number[], at: SampleTable, seedCount: number): number {
  const seen = new Uint8Array(n);
  const queue: number[] = [];
  for (let q = 0; q < seedCount && q < n; q++) { seen[q] = 1; queue.push(q); }
  let best = 0;
  for (let h = 0; h < queue.length; h++) {
    const q = queue[h];
    if (J[q] < J[best] || (J[q] === J[best] && q < best)) best = q;
    for (let d = 0; d < 18; d += 3) {
      if (N6[d + 1] > 0) continue; // never climb
      const r = at.get(I[q] + N6[d], J[q] + N6[d + 1], K[q] + N6[d + 2]);
      if (r < 0 || seen[r]) continue;
      seen[r] = 1;
      queue.push(r);
    }
  }
  return best;
}

function drainK(sim: Sim, i: number, j: number, k: number): number {
  const v = sim.carve.voxel;
  const m = sim.field.materialAt({ x: i * v, y: j * v, z: k * v });
  let kd = FLOOD_K_DRAIN[m] ?? 0;
  if ((nestRuntime(sim).flags.get(i, j, k) & VoxelFlag.LOOSE) !== 0) kd *= FLOOD_K_DRAIN_LOOSE_MULT;
  return kd;
}

function chamberQ(c: Chamber, x: number, y: number, z: number, pad: number): number {
  return ((x - c.center.x) / (c.radii.x + pad)) ** 2 + ((y - c.center.y) / (c.radii.y + pad)) ** 2 + ((z - c.center.z) / (c.radii.z + pad)) ** 2;
}

/** Sorted indices of the cache samples inside a chamber's ellipsoid (+ half a voxel). */
function chamberMembers(c: Chamber, si: Int32Array, sj: Int32Array, sk: Int32Array, v: number): Int32Array {
  const pad = v / 2;
  const i0 = (c.center.x - c.radii.x - pad) / v, i1 = (c.center.x + c.radii.x + pad) / v;
  const j0 = (c.center.y - c.radii.y - pad) / v, j1 = (c.center.y + c.radii.y + pad) / v;
  const k0 = (c.center.z - c.radii.z - pad) / v, k1 = (c.center.z + c.radii.z + pad) / v;
  const list: number[] = [];
  for (let s = 0; s < si.length; s++) {
    const i = si[s], j = sj[s], k = sk[s];
    if (i < i0 || i > i1 || j < j0 || j > j1 || k < k0 || k > k1) continue;
    if (chamberQ(c, i * v, j * v, k * v, pad) <= 1) list.push(s);
  }
  return Int32Array.from(list);
}

/** Builds the spill cache of a nest from the current carve grid and records. */
export function buildSpill(sim: Sim, nest: Nest): SpillCache {
  const v = sim.carve.voxel, bu = sim.world.bu, vox = (v / bu) ** 3;
  const seeds = seedsOf(sim, nest);
  const at = new SampleTable();
  const cav = cavityOf(sim, seeds, at);
  const n = cav.i.length, I = cav.i, J = cav.j, K = cav.k;
  let si = new Int32Array(n), sj = new Int32Array(n), sk = new Int32Array(n), level = new Int32Array(n);
  const index = new SampleTable();
  const box = { i0: 1e9, j0: 1e9, k0: 1e9, i1: -1e9, j1: -1e9, k1: -1e9 };
  // only the samples the priority flood reaches from the pool bottom form the basin: a part of the cavity that is
  // not connected to it (a trial pit beside a plugged founding cell) holds none of this water
  let out = 0;
  if (n > 0) {
    // bucket priority flood on layers from the pool bottom: level(v) = max(level(u), j(v))
    let jMin = Infinity, jMax = -Infinity;
    for (let q = 0; q < n; q++) { if (J[q] < jMin) jMin = J[q]; if (J[q] > jMax) jMax = J[q]; }
    const buckets: number[][] = [];
    for (let b = 0; b <= jMax - jMin; b++) buckets.push([]);
    const done = new Uint8Array(n);
    const start = poolBottom(n, I, J, K, at, cav.seeds);
    buckets[J[start] - jMin].push(start);
    done[start] = 1;
    for (let b = 0; b < buckets.length; b++) {
      const list = buckets[b];
      for (let h = 0; h < list.length; h++) {
        const q = list[h];
        si[out] = I[q]; sj[out] = J[q]; sk[out] = K[q]; level[out] = b + jMin;
        index.set(I[q], J[q], K[q], out);
        out++;
        for (let d = 0; d < 18; d += 3) {
          const r = at.get(I[q] + N6[d], J[q] + N6[d + 1], K[q] + N6[d + 2]);
          if (r < 0 || done[r]) continue;
          done[r] = 1;
          buckets[Math.max(b, J[r] - jMin)].push(r);
        }
      }
    }
    if (out < n) { si = si.slice(0, out); sj = sj.slice(0, out); sk = sk.slice(0, out); level = level.slice(0, out); }
  }
  const cumVol = new Float64Array(out + 1), cumWall = new Float64Array(out + 1), cumKA = new Float64Array(out + 1);
  // cumulative tables in sorted order
  for (let s = 0; s < out; s++) {
    const i = si[s], j = sj[s], k = sk[s];
    let wall = false;
    for (let d = 0; d < 18 && !wall; d += 3) if (at.get(i + N6[d], j + N6[d + 1], k + N6[d + 2]) === SEEN_SOLID) wall = true;
    const vol = OPEN_FRACTION[sim.carve.sampleAt(i, j, k)] * vox;
    cumVol[s + 1] = cumVol[s] + vol;
    cumWall[s + 1] = cumWall[s] + (wall ? FLOOD_WALL_FACE_BU2 : 0);
    cumKA[s + 1] = cumKA[s] + (wall ? FLOOD_WALL_FACE_BU2 * drainK(sim, i, j, k) : 0);
  }
  // the box spans the whole cavity, the unreached parts too: a carve there (a trial pit dug below the cell) can
  // move the pool bottom, so it must mark the cache stale (runtime.ts carve listener)
  for (let q = 0; q < n; q++) {
    const i = I[q], j = J[q], k = K[q];
    if (i < box.i0) box.i0 = i; if (i > box.i1) box.i1 = i;
    if (j < box.j0) box.j0 = j; if (j > box.j1) box.j1 = j;
    if (k < box.k0) box.k0 = k; if (k > box.k1) box.k1 = k;
  }
  const chamberSamples = new Map<number, Int32Array>();
  for (const c of nest.chambers) chamberSamples.set(c.id, chamberMembers(c, si, sj, sk, v));
  return {
    nestId: nest.id, si, sj, sk, level, cumVol, cumWall, cumKA, index, chamberSamples, box,
    carveVersion: sim.carve.version, sig: nestSignature(nest), truncated: cav.truncated,
  };
}

/** Total open volume of the cavity, BU^3. */
export function spillVolume(c: SpillCache): number {
  return c.cumVol[c.cumVol.length - 1];
}

/** Number of flooded samples for a water volume W (BU^3): the smallest n with cumVol[n] >= W. */
export function floodedCount(c: SpillCache, water: number): number {
  const n = c.si.length;
  if (water <= 0 || n === 0) return 0;
  if (water >= c.cumVol[n]) return n;
  let lo = 0, hi = n;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (c.cumVol[mid + 1] < water) lo = mid + 1;
    else hi = mid;
  }
  return lo + 1;
}

/**
 * Water level, mm, for a water volume: the spill level of the last flooded sample, raised within its layer by the
 * share of that layer's volume filled (a smooth level for rendering). -1e9 when dry.
 */
export function waterLevelMm(c: SpillCache, water: number, voxel: number): number {
  const nf = floodedCount(c, water);
  if (nf === 0) return -1e9;
  const lv = c.level[nf - 1];
  let a = nf - 1, b = nf - 1;
  while (a > 0 && c.level[a - 1] === lv) a--;
  while (b + 1 < c.si.length && c.level[b + 1] === lv) b++;
  const v0 = c.cumVol[a], v1 = c.cumVol[b + 1];
  const f = v1 > v0 ? Math.min(1, Math.max(0, (water - v0) / (v1 - v0))) : 1;
  return (lv - 0.5 + f) * voxel;
}

/** Flooded share of a chamber's samples for a flooded count (0 for an unknown chamber). */
export function chamberFloodedShare(c: SpillCache, chamberId: number, nFlooded: number): number {
  const list = c.chamberSamples.get(chamberId);
  if (!list || list.length === 0) return 0;
  let lo = 0, hi = list.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (list[mid] < nFlooded) lo = mid + 1;
    else hi = mid;
  }
  return lo / list.length;
}

/** Is the sample nearest p flooded (sorted index below the flooded count)? */
export function floodedAt(c: SpillCache, voxel: number, x: number, y: number, z: number, nFlooded: number): boolean {
  if (nFlooded <= 0) return false;
  const i = Math.round(x / voxel), j = Math.round(y / voxel), k = Math.round(z / voxel);
  if (i < c.box.i0 - 1 || i > c.box.i1 + 1 || j < c.box.j0 - 1 || j > c.box.j1 + 1 || k < c.box.k0 - 1 || k > c.box.k1 + 1) return false;
  const s = c.index.get(i, j, k);
  return s >= 0 && s < nFlooded;
}

/** Column floor search: how many samples above / below the point's own sample a body may sit off the cavity. */
const COLUMN_PROBE = [0, 1, -1];

/**
 * The rest of the 3x3x3 neighbourhood (di, dj, dk triples, same layer first, then above, then below), tried when the
 * column misses: a body on a wall or a slope has its centre within its foot offset of the surface, which can put it
 * in the solid sample beside the cavity rather than above or below one (nest-fix3 review: an ant on the wall of a
 * full sealed nest read "off the basin", so she neither drowned nor fled).
 */
const SIDE_PROBE: number[] = (() => {
  const out: number[] = [];
  for (const dj of [0, 1, -1])
    for (const dk of [0, -1, 1])
      for (const di of [0, -1, 1]) if (di !== 0 || dk !== 0) out.push(di, dj, dk);
  return out;
})();

/**
 * Depth of the water standing over a point, mm (task weather-fix2 review, finding 3): the level minus the higher of
 * `baseY` (the feet, the brood's floor point) and the bottom of the spill layer of the point's column floor (the
 * lowest basin sample straight below the point, contiguous). The floor's spill layer, not the point's own sample:
 * the flooded set is a prefix of the spill order (E22), so which samples of a partly filled layer count as flooded is
 * an artefact of the order; the level is not. A floor behind a sill has the sill's spill layer, so the depth there
 * stays 0 until the water has risen over the sill. A point beside the basin rather than over it (a body on a wall)
 * takes the column of the first basin sample of its neighbourhood (SIDE_PROBE). -Infinity where the point is not at
 * the basin.
 */
export function waterDepthOver(c: SpillCache, voxel: number, x: number, y: number, z: number, level: number, baseY: number): number {
  let i = Math.round(x / voxel), k = Math.round(z / voxel);
  const j0 = Math.round(y / voxel);
  if (i < c.box.i0 - 1 || i > c.box.i1 + 1 || k < c.box.k0 - 1 || k > c.box.k1 + 1 || j0 < c.box.j0 - 1 || j0 > c.box.j1 + 1) return -Infinity;
  let j = Number.NaN;
  for (const d of COLUMN_PROBE) if (c.index.get(i, j0 + d, k) >= 0) { j = j0 + d; break; }
  if (Number.isNaN(j)) {
    for (let n = 0; n < SIDE_PROBE.length; n += 3) {
      if (c.index.get(i + SIDE_PROBE[n], j0 + SIDE_PROBE[n + 1], k + SIDE_PROBE[n + 2]) < 0) continue;
      i += SIDE_PROBE[n]; j = j0 + SIDE_PROBE[n + 1]; k += SIDE_PROBE[n + 2];
      break;
    }
  }
  if (Number.isNaN(j)) return -Infinity;
  while (c.index.get(i, j - 1, k) >= 0) j--;
  const floorLayer = c.level[c.index.get(i, j, k)];
  return level - Math.max(baseY, (floorLayer - 0.5) * voxel);
}

/**
 * Does the entrance open the cache's basin to the air: a basin sample in its throat region next to a sample in open
 * air (outside the substrate, carve grid ignored)? False for a throat closed by a plug (the samples under it are
 * basin, the dent over it is not), and for an opening into a part of the cavity the basin is not connected to.
 */
export function entranceOpensBasin(sim: Sim, c: SpillCache, e: Entrance): boolean {
  const v = sim.carve.voxel;
  let open = false;
  forThroat(sim, e, (i, j, k) => {
    if (open || c.index.get(i, j, k) < 0) return;
    for (let d = 0; d < 18 && !open; d += 3) {
      const a = i + N6[d], b = j + N6[d + 1], q = k + N6[d + 2];
      if (c.index.get(a, b, q) < 0 && sim.field.substrateXYZ(a * v, b * v, q * v) >= 0) open = true;
    }
  });
  return open;
}
