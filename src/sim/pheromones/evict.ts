// Weakest-first selection for the cell and chunk caps. Order-independent (a loaded field evicts exactly what the
// field it was saved from would): a log-scale histogram finds the threshold bin, and ties inside that bin are
// broken by (value, canonical cell code).

import { PHERO_EPS } from './balance';

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
 * Indices (into values/codes) of the `need` weakest candidates: smallest value first, then smallest code.
 * Returns a Set-like flag array over the candidates.
 */
export function pickWeakest(values: Float64Array, codes: Float64Array, n: number, need: number): Uint8Array {
  const order = new Int32Array(n);
  for (let i = 0; i < n; i++) order[i] = i;
  order.sort((a, b) => (values[a] - values[b]) || (codes[a] - codes[b]));
  const pick = new Uint8Array(n);
  for (let i = 0; i < need && i < n; i++) pick[order[i]] = 1;
  return pick;
}
