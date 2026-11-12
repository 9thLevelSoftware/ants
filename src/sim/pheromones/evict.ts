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
 * Flags (over the candidates) of the `need` weakest: smallest value first, then smallest code. Uses native numeric
 * sorts only (candidates often share one value: equal deposits decayed alike).
 */
export function pickWeakest(values: Float64Array, codes: Float64Array, n: number, need: number): Uint8Array {
  const pick = new Uint8Array(n);
  if (need <= 0) return pick;
  if (need >= n) { pick.fill(1); return pick; }
  const sorted = values.slice(0, n).sort();
  const vt = sorted[need - 1];
  let below = 0;
  for (let i = 0; i < n; i++) if (values[i] < vt) { pick[i] = 1; below++; }
  const eq: number[] = [];
  for (let i = 0; i < n; i++) if (values[i] === vt) eq.push(codes[i]);
  const eqCodes = Float64Array.from(eq).sort();
  const ct = eqCodes[need - below - 1];
  for (let i = 0; i < n; i++) if (values[i] === vt && codes[i] <= ct) pick[i] = 1;
  return pick;
}

/** Cell cap reached: drop exact zeros; if still full, evict the weakest PHERO_EVICT_FRACTION of the cells. */
export function evictWeakestCells(l: LayerRuntime): void {
  l.compact(0);
  if (l.nz < l.limits.maxCells) return;
  const sh = l.shift3, lm = l.n3 - 1, act = l.active, chunks = l.data.chunks, keys = l.data.keys;
  const nb = evictBinCount(l.limits.maxValue), bpo = PHERO_EVICT_BINS_PER_OCTAVE;
  const bins = new Int32Array(nb);
  for (let i = 0; i < l.count; i++) {
    const e = act[i];
    bins[valueBin(chunks[e >>> sh][e & lm], bpo, nb)]++;
  }
  const cut = evictionThreshold(bins, Math.ceil(l.count * PHERO_EVICT_FRACTION));
  const tieV = new Float64Array(bins[cut.bin]), tieC = new Float64Array(bins[cut.bin]);
  let nt = 0;
  for (let i = 0; i < l.count; i++) {
    const e = act[i];
    const v = chunks[e >>> sh][e & lm];
    if (valueBin(v, bpo, nb) !== cut.bin) continue;
    tieV[nt] = v;
    tieC[nt++] = keys[e >>> sh] * l.n3 + (e & lm);
  }
  const pick = pickWeakest(tieV, tieC, nt, cut.need);
  const listed = l.listed, live = l.live;
  let w = 0, j = 0;
  for (let i = 0, n = l.count; i < n; i++) {
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
      l.nz--;
    }
  }
  l.count = w;
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
