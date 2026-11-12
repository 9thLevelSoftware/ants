// Edge-case tests for the rng helpers that callers use to index arrays (F1a-fixes).
import { describe, expect, it } from 'vitest';
import { rngChance, rngInt, rngNext, rngPick, rngRange, rngSeed, rngShuffle, type RngState } from './rng';

/** Multiplicative inverse of an odd number mod 2^32 (Newton iteration). */
function inv32(a: number): number {
  let x = a;
  for (let i = 0; i < 5; i++) x = Math.imul(x, 2 - Math.imul(a, x));
  return x >>> 0;
}

/** A state whose next rngNext() output is exactly `out`. */
function stateProducing(out: number): RngState {
  const y = Math.imul(out | 0, inv32(9)) >>> 0;
  const w = ((y >>> 7) | (y << 25)) >>> 0;
  return [123, Math.imul(w, inv32(5)) >>> 0, 456, 789];
}

const MAX = 0xffffffff;

describe('rngRange half-open guarantee', () => {
  const ranges: [number, number][] = [
    [0, 1], [-1, 0], [-5, -4], [1e9, 1e9 + 1], [-1e9 - 1, -1e9], [1e15, 1e15 + 1], [0, 1e-300],
    [-1e308, 1e308], [-Number.MAX_VALUE, Number.MAX_VALUE], [0, Number.MAX_VALUE], [5e-324, 1e-323],
  ];
  it('never returns hi at the largest draw, and returns lo at the smallest', () => {
    for (const [lo, hi] of ranges) {
      const top = rngRange(stateProducing(MAX), lo, hi);
      expect(top, `[${lo}, ${hi})`).toBeLessThan(hi);
      expect(top).toBeGreaterThanOrEqual(lo);
      expect(rngRange(stateProducing(0), lo, hi)).toBe(lo);
    }
  });

  it('stays inside [lo, hi) for many random draws', () => {
    const s = rngSeed(11);
    for (const [lo, hi] of ranges) {
      for (let i = 0; i < 2000; i++) {
        const v = rngRange(s, lo, hi);
        expect(v >= lo && v < hi).toBe(true);
      }
    }
  });

  it('lo === hi returns lo and consumes exactly one draw', () => {
    const a = rngSeed(3), b = rngSeed(3);
    expect(rngRange(a, 7.5, 7.5)).toBe(7.5);
    rngNext(b);
    expect(a).toEqual(b);
  });

  it('indexing an array with floor(rngRange(0, n)) is always in range', () => {
    for (const n of [1, 2, 3, 1000, 2 ** 24 + 1]) {
      expect(Math.floor(rngRange(stateProducing(MAX), 0, n))).toBeLessThanOrEqual(n - 1);
    }
  });
});

describe('rngInt / rngPick / rngShuffle / rngChance edges', () => {
  it('rngInt single value, negative ranges, full 2^32 span and extremes of the draw', () => {
    const s = rngSeed(5);
    for (let i = 0; i < 50; i++) expect(rngInt(s, 4, 4)).toBe(4);
    for (const out of [0, 1, MAX - 1, MAX]) {
      const v = rngInt(stateProducing(out), -10, -7);
      expect(v >= -10 && v <= -7).toBe(true);
    }
    expect(rngInt(stateProducing(MAX), -(2 ** 31), 2 ** 31 - 1)).toBe(2 ** 31 - 1);
    expect(rngInt(stateProducing(0), 0, MAX)).toBe(0);
    expect(rngInt(stateProducing(MAX), 0, MAX)).toBe(MAX);
    expect(() => rngInt(s, 5, 4)).toThrow(RangeError);
    expect(() => rngInt(s, 0, Number.NaN)).toThrow(RangeError);
    expect(() => rngInt(s, -1e300, 1e300)).toThrow(RangeError);
  });

  it('rngPick can reach both ends and never goes out of range', () => {
    const arr = ['a', 'b', 'c'];
    expect(rngPick(stateProducing(0), arr)).toBe('a');
    expect(rngPick(stateProducing(MAX - 1), arr)).toBe('c');
    expect(rngPick(rngSeed(1), ['only'])).toBe('only');
    expect(() => rngPick(rngSeed(1), [])).toThrow(RangeError);
    const s = rngSeed(9);
    for (let i = 0; i < 1000; i++) expect(arr).toContain(rngPick(s, arr));
  });

  it('rngShuffle keeps the multiset, handles length 0 and 1, and returns the same array', () => {
    const s = rngSeed(2);
    const empty: number[] = [], one = [1];
    expect(rngShuffle(s, empty)).toBe(empty);
    expect(rngShuffle(s, one)).toEqual([1]);
    const arr = Array.from({ length: 50 }, (_, i) => i);
    const out = rngShuffle(s, arr);
    expect(out).toBe(arr);
    expect([...out].sort((a, b) => a - b)).toEqual(Array.from({ length: 50 }, (_, i) => i));
  });

  it('rngChance: p <= 0 never, p >= 1 always (even at the largest draw), NaN never', () => {
    for (const out of [0, MAX]) {
      expect(rngChance(stateProducing(out), 0)).toBe(false);
      expect(rngChance(stateProducing(out), -1)).toBe(false);
      expect(rngChance(stateProducing(out), 1)).toBe(true);
      expect(rngChance(stateProducing(out), 2)).toBe(true);
      expect(rngChance(stateProducing(out), Number.NaN)).toBe(false);
    }
  });
});

describe('rngSeed mixes both 32-bit words', () => {
  it('distinct safe integers give distinct states (structured families)', () => {
    const seen = new Map<string, number>();
    const add = (seed: number) => {
      if ([...seen.values()].includes(seed)) return; // families overlap
      const key = rngSeed(seed).join(',');
      expect(seen.has(key), `seed ${seed} collides with ${seen.get(key)}`).toBe(false);
      seen.set(key, seed);
    };
    for (let k = 0; k < 300; k++) {
      add(k);
      add(-k - 1);
      add(2 ** 32 + k);
      add(2 * 2 ** 32 + k);
      add(2 ** 40 + k);
      add(2 ** 53 - 1 - k);
      add(-(2 ** 53 - 1) + k);
      add((k + 1) * 2 ** 32);
      add((k + 1) * 2 ** 32 + 0x9e3779b9);
    }
    add(0x9e3779b9);
  });

  it('seeds below 2^32 keep their historical stream', () => {
    const s = rngSeed(42);
    expect([rngNext(s), rngNext(s)]).toEqual([2837322924, 544945897]);
  });
});
