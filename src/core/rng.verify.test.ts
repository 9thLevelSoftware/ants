// Adversarial review tests for rng.ts (F1a review).
import { describe, expect, it } from 'vitest';
import { rngFloat, rngFork, rngInt, rngNext, rngRange, rngSeed, type RngState } from './rng';

/** Multiplicative inverse of an odd number mod 2^32 (Newton iteration). */
function inv32(a: number): number {
  let x = a;
  for (let i = 0; i < 5; i++) x = Math.imul(x, 2 - Math.imul(a, x));
  return x >>> 0;
}

/** A state whose next rngNext() output is exactly `out` (only s[1] determines the output of xoshiro128**). */
function stateProducing(out: number): RngState {
  const y = Math.imul(out | 0, inv32(9)) >>> 0; // undo * 9
  const w = ((y >>> 7) | (y << 25)) >>> 0; // undo rotl 7
  const s1 = Math.imul(w, inv32(5)) >>> 0; // undo * 5
  return [123, s1, 456, 789];
}

describe('rng (review)', () => {
  it('the forced-output helper works', () => {
    expect(rngNext(stateProducing(0xffffffff))).toBe(0xffffffff);
    expect(rngNext(stateProducing(0))).toBe(0);
  });

  it('rngFloat stays below 1 and rngInt stays inside inclusive bounds at the extreme draw', () => {
    expect(rngFloat(stateProducing(0xffffffff))).toBeLessThan(1);
    expect(rngInt(stateProducing(0xffffffff), -3, 3)).toBeLessThanOrEqual(3);
    expect(rngInt(stateProducing(0), -3, 3)).toBe(-3);
    expect(rngInt(stateProducing(0xffffffff), -(2 ** 31), 2 ** 31 - 1)).toBe(2 ** 31 - 1);
  });

  it('rngRange stays in [lo, hi) for realistic world ranges (mm, angles)', () => {
    for (const [lo, hi] of [[0, 36000], [-Math.PI, Math.PI], [0, 2 * Math.PI], [35990, 36000], [0, 1e-3]]) {
      const v = rngRange(stateProducing(0xffffffff), lo, hi);
      expect(v).toBeGreaterThanOrEqual(lo);
      expect(v).toBeLessThan(hi);
    }
  });

  // Regression (fixed): lo + (hi - lo) * (1 - 2^-32) used to round up to hi when |lo| >> hi - lo.
  it('rngRange never returns hi (large offset, small span)', () => {
    expect(rngRange(stateProducing(0xffffffff), 1e9, 1e9 + 1)).toBeLessThan(1e9 + 1);
  });

  // Regression (fixed): the seed used to be folded into one 32-bit word, so 2^32 and 0x9e3779b9 collided.
  it('distinct integer seeds give distinct streams (2^32 vs 0x9e3779b9)', () => {
    expect(rngSeed(2 ** 32)).not.toEqual(rngSeed(0x9e3779b9));
  });

  it('forks of adjacent seeds with the same name are uncorrelated (first outputs)', () => {
    // Pearson correlation of the first float of fork(seed, 'terrain') against fork(seed + 1, 'terrain').
    const n = 4000;
    const a: number[] = [], b: number[] = [];
    for (let seed = 0; seed < n; seed++) {
      a.push(rngFloat(rngFork(seed, 'terrain')));
      b.push(rngFloat(rngFork(seed + 1, 'terrain')));
    }
    const mean = (v: number[]) => v.reduce((x, y) => x + y, 0) / v.length;
    const ma = mean(a), mb = mean(b);
    let cov = 0, va = 0, vb = 0;
    for (let i = 0; i < n; i++) {
      cov += (a[i] - ma) * (b[i] - mb);
      va += (a[i] - ma) ** 2;
      vb += (b[i] - mb) ** 2;
    }
    expect(Math.abs(cov / Math.sqrt(va * vb))).toBeLessThan(0.06);
  });

  it('forks with names differing in one character, and the empty name, give distinct streams', () => {
    const names = ['', 'a', 'b', 'ab', 'ba', 'stream1', 'stream2', 'Stream1', 'é', 'e'];
    const firsts = new Set(names.map((nm) => rngNext(rngFork(42, nm))));
    expect(firsts.size).toBe(names.length);
  });

  it('rngInt rejects non-finite and reversed bounds instead of looping', () => {
    const s = rngSeed(1);
    expect(() => rngInt(s, 5, 4)).toThrow(RangeError);
    expect(() => rngInt(s, 0, Number.NaN)).toThrow(RangeError);
    expect(() => rngInt(s, 0, Infinity)).toThrow(RangeError);
    expect(() => rngInt(s, 0, 2 ** 32)).toThrow(RangeError);
  });

  it('state words stay uint32 after many draws (plain-data invariant)', () => {
    const s = rngSeed(99);
    for (let i = 0; i < 10000; i++) rngNext(s);
    for (const w of s) expect(Number.isInteger(w) && w >= 0 && w <= 0xffffffff).toBe(true);
  });
});
