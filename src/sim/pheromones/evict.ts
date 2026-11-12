// Weakest-first selection for the cell and chunk caps. Order-independent (a loaded field evicts exactly what the
// field it was saved from would): a log-scale histogram finds the threshold bin, and ties inside that bin are
// broken by (value, canonical cell code).

import type { LayerRuntime } from './layer';
import { PHERO_EVICT_BINS_PER_OCTAVE, PHERO_EVICT_CHUNK_FRACTION, PHERO_EVICT_FRACTION, PHERO_EPS } from './balance';

/** Fixed-point scale for exact chunk sums (30 ph x 4096 cells x 2^20 stays far below 2^53). */
const FIXED_SCALE = 1048576;

/** Histogram bins needed to cover PHERO_EPS..maxValue, plus bin 0 for zero / sub-floor values. */
function evictBinCount(maxValue: number): number {
  return 2 + Math.ceil(Math.log2(maxValue / PHERO_EPS) * PHERO_EVICT_BINS_PER_OCTAVE);
}

/** Histogram bin of a value: 0 below PHERO_EPS, then binsPerOctave bins per doubling. */
export function valueBin(v: number, binsPerOctave: number, nBins: number): number {
  if (!(v >= PHERO_EPS)) return 0;
  const b = 1 + Math.floor(Math.log2(v / PHERO_EPS) * binsPerOctave);
  return b < nBins ? b : nBins - 1;
}

/**
 * Lowest bin whose cumulative count reaches `target`. Everything in lower bins goes; `need` of the threshold bin
 * still has to go (chosen by pickWeakest).
 */
export function evictionThreshold(bins: Int32Array, target: number): { bin: number; need: number } {
  let acc = 0;
  for (let b = 0; b < bins.length; b++) {
    if (acc + bins[b] >= target) return { bin: b, need: target - acc };
    acc += bins[b];
  }
  return { bin: bins.length - 1, need: bins[bins.length - 1] };
}

/**
 * k-th smallest (0-based) of a[0..n), reordering a. Three-way quickselect with a median-of-three pivot: O(n) on
 * average and on all-equal input (equal deposits decayed alike are common). The result is a value, so it does not
 * depend on the pivot choices.
 */
export function kthSmallest(a: Float64Array, n: number, k: number): number {
  let lo = 0, hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const x = a[lo], y = a[mid], z = a[hi];
    const pivot = x < y ? (y < z ? y : x < z ? z : x) : (x < z ? x : y < z ? z : y);
    // Partition a[lo..hi] into < pivot | == pivot | > pivot.
    let lt = lo, i = lo, gt = hi;
    while (i <= gt) {
      const v = a[i];
      if (v < pivot) { a[i] = a[lt]; a[lt] = v; lt++; i++; }
      else if (v > pivot) { a[i] = a[gt]; a[gt] = v; gt--; }
      else i++;
    }
    if (k < lt) hi = lt - 1;
    else if (k > gt) lo = gt + 1;
    else return pivot;
  }
  return a[lo];
}

let scratch = new Float64Array(1024);

function scratchCopy(src: Float64Array, n: number): Float64Array {
  if (scratch.length < n) scratch = new Float64Array(Math.max(n, scratch.length * 2));
  scratch.set(src.subarray(0, n));
  return scratch;
}

/**
 * Flags (over the candidates) of the `need` weakest: smallest value first, then smallest code. Order-independent
 * (selection by value and code only).
 */
export function pickWeakest(values: Float64Array, codes: Float64Array, n: number, need: number): Uint8Array {
  const pick = new Uint8Array(n);
  if (need <= 0) return pick;
  if (need >= n) { pick.fill(1); return pick; }
  const vt = kthSmallest(scratchCopy(values, n), n, need - 1);
  let below = 0, ne = 0;
  for (let i = 0; i < n; i++) {
    if (values[i] < vt) { pick[i] = 1; below++; } else if (values[i] === vt) ne++;
  }
  const eq = new Float64Array(ne);
  for (let i = 0, j = 0; i < n; i++) if (values[i] === vt) eq[j++] = codes[i];
  const ct = kthSmallest(eq, ne, need - below - 1);
  for (let i = 0; i < n; i++) if (values[i] === vt && codes[i] <= ct) pick[i] = 1;
  return pick;
}

let binOf = new Uint16Array(1024);

/** Cell cap reached: drop exact zeros; if still full, evict the weakest PHERO_EVICT_FRACTION of the cells. */
export function evictWeakestCells(l: LayerRuntime): void {
  l.compact(0);
  if (l.nz < l.limits.maxCells) return;
  const sh = l.shift3, lm = l.n3 - 1, act = l.active, chunks = l.data.chunks, keys = l.data.keys;
  const nb = evictBinCount(l.limits.maxValue), bpo = PHERO_EVICT_BINS_PER_OCTAVE;
  const bins = new Int32Array(nb);
  if (binOf.length < l.count) binOf = new Uint16Array(Math.max(l.count, binOf.length * 2));
  for (let i = 0; i < l.count; i++) {
    const e = act[i];
    const b = valueBin(chunks[e >>> sh][e & lm], bpo, nb);
    binOf[i] = b;
    bins[b]++;
  }
  const cut = evictionThreshold(bins, Math.ceil(l.count * PHERO_EVICT_FRACTION));
  const tieV = new Float64Array(bins[cut.bin]), tieC = new Float64Array(bins[cut.bin]);
  let nt = 0;
  for (let i = 0; i < l.count; i++) {
    if (binOf[i] !== cut.bin) continue;
    const e = act[i];
    const v = chunks[e >>> sh][e & lm];
    tieV[nt] = v;
    tieC[nt++] = keys[e >>> sh] * l.n3 + (e & lm);
  }
  const pick = pickWeakest(tieV, tieC, nt, cut.need);
  const listed = l.listed, live = l.live;
  let w = 0, j = 0, strongest = 0;
  for (let i = 0, n = l.count; i < n; i++) {
    const e = act[i];
    const slot = e >>> sh, loc = e & lm;
    const vals = chunks[slot];
    const b = binOf[i];
    const evict = b < cut.bin || (b === cut.bin && pick[j++] === 1);
    if (!evict) {
      act[w++] = e;
    } else {
      if (vals[loc] > strongest) strongest = vals[loc];
      vals[loc] = 0;
      listed[slot][loc] = 0;
      live[slot]--;
      l.nz--;
    }
  }
  l.count = w;
  l.data.cellFloor = strongest;
  l.freeEmptyChunks();
}

/** Chunk cap reached: evict the PHERO_EVICT_CHUNK_FRACTION of chunks holding the least pheromone (sum of cells). */
export function evictWeakestChunks(l: LayerRuntime): void {
  l.compact(0);
  const n = l.data.keys.length;
  const sh = l.shift3, lm = l.n3 - 1, act = l.active, chunks = l.data.chunks, keys = l.data.keys;
  const nb = evictBinCount(l.limits.maxValue * l.n3), bpo = PHERO_EVICT_BINS_PER_OCTAVE;
  // Total content per chunk, summed in exact fixed point so the result does not depend on list order.
  const content = new Float64Array(n);
  for (let i = 0; i < l.count; i++) {
    const e = act[i];
    content[e >>> sh] += Math.round(chunks[e >>> sh][e & lm] * FIXED_SCALE);
  }
  for (let s = 0; s < n; s++) content[s] /= FIXED_SCALE;
  const bins = new Int32Array(nb);
  for (let s = 0; s < n; s++) bins[valueBin(content[s], bpo, nb)]++;
  const cut = evictionThreshold(bins, Math.ceil(n * PHERO_EVICT_CHUNK_FRACTION));
  const tieV = new Float64Array(bins[cut.bin]), tieC = new Float64Array(bins[cut.bin]), tieS = new Int32Array(bins[cut.bin]);
  let nt = 0;
  for (let s = 0; s < n; s++) {
    if (valueBin(content[s], bpo, nb) !== cut.bin) continue;
    tieV[nt] = content[s];
    tieC[nt] = keys[s];
    tieS[nt++] = s;
  }
  const pick = pickWeakest(tieV, tieC, nt, cut.need);
  const evict = new Uint8Array(n);
  for (let s = 0; s < n; s++) if (valueBin(content[s], bpo, nb) < cut.bin) evict[s] = 1;
  for (let t = 0; t < nt; t++) if (pick[t] === 1) evict[tieS[t]] = 1;
  let strongest = 0;
  for (let s = 0; s < n; s++) if (evict[s] === 1 && content[s] > strongest) strongest = content[s];
  l.data.chunkFloor = strongest;
  const listed = l.listed, live = l.live;
  let w = 0;
  for (let i = 0, c = l.count; i < c; i++) {
    const e = act[i];
    const slot = e >>> sh;
    if (evict[slot] === 0) {
      act[w++] = e;
    } else {
      chunks[slot][e & lm] = 0;
      listed[slot][e & lm] = 0;
      live[slot]--;
      l.nz--;
    }
  }
  l.count = w;
  l.freeEmptyChunks();
}
