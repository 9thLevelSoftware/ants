import { describe, expect, it } from 'vitest';
import {
  hashString, rngChance, rngClone, rngFloat, rngFork, rngGauss, rngInt, rngNext, rngPick, rngRange, rngReseed, rngSeed,
  rngShuffle,
} from './rng';

function draw(s: number[], n: number): number[] {
  return Array.from({ length: n }, () => rngNext(s));
}

describe('rng', () => {
  it('state is four plain uint32 numbers that survive JSON', () => {
    const s = rngSeed(123);
    expect(s).toHaveLength(4);
    for (const w of s) expect(Number.isInteger(w) && w >= 0 && w < 2 ** 32).toBe(true);
    const restored = JSON.parse(JSON.stringify(s));
    expect(draw(restored, 10)).toEqual(draw(s, 10));
  });

  it('is deterministic: same seed -> same sequence, pinned to fixed values', () => {
    expect(draw(rngSeed(7), 50)).toEqual(draw(rngSeed(7), 50));
    expect(draw(rngSeed(7), 5)).not.toEqual(draw(rngSeed(8), 5));
    // Golden values: changing the generator changes every save and world. Bump versions deliberately.
    expect(draw(rngSeed(42), 4)).toMatchInlineSnapshot(`
      [
        2837322924,
        544945897,
        479756282,
        3500138142,
      ]
    `);
  });

  it('rngNext matches the xoshiro128** reference implementation', () => {
    // Reference output of the C implementation (Blackman & Vigna) from state {1, 2, 3, 4}.
    expect(draw([1, 2, 3, 4], 10)).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597, 4258142804,
    ]);
  });

  it('uses the full seed: large integers, negatives and fractional truncation', () => {
    expect(draw(rngSeed(2 ** 40), 3)).not.toEqual(draw(rngSeed(0), 3)); // high word matters
    expect(draw(rngSeed(2 ** 40 + 1), 3)).not.toEqual(draw(rngSeed(2 ** 40), 3));
    expect(draw(rngSeed(-5), 3)).not.toEqual(draw(rngSeed(5), 3));
    expect(draw(rngSeed(5.9), 3)).toEqual(draw(rngSeed(5), 3));
    expect(draw(rngSeed(Number.NaN), 3)).toEqual(draw(rngSeed(0), 3));
    const s = rngSeed(1);
    rngReseed(s, 99);
    expect(s).toEqual(rngSeed(99));
  });

  it('never produces the all-zero state and clone is independent', () => {
    for (let seed = 0; seed < 2000; seed++) {
      const s = rngSeed(seed);
      expect(s[0] | s[1] | s[2] | s[3]).not.toBe(0);
    }
    const a = rngSeed(3);
    const b = rngClone(a);
    rngNext(a);
    expect(b).toEqual(rngSeed(3));
  });

  it('rngFloat is in [0, 1) with a uniform histogram (chi-square)', () => {
    const s = rngSeed(2024);
    const bins = new Array(20).fill(0);
    const n = 200_000;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const f = rngFloat(s);
      expect(f >= 0 && f < 1).toBe(true);
      bins[Math.floor(f * 20)]++;
      sum += f;
    }
    const e = n / 20;
    const chi2 = bins.reduce((acc, b) => acc + ((b - e) ** 2) / e, 0);
    expect(chi2).toBeLessThan(45); // 19 dof, p ~ 0.0007
    expect(Math.abs(sum / n - 0.5)).toBeLessThan(0.005);
  });

  it('rngInt covers inclusive bounds uniformly, including negative and single-value ranges', () => {
    const s = rngSeed(11);
    const counts = new Map<number, number>();
    const n = 70_000;
    for (let i = 0; i < n; i++) {
      const v = rngInt(s, -3, 3);
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    expect([...counts.keys()].sort((a, b) => a - b)).toEqual([-3, -2, -1, 0, 1, 2, 3]);
    const e = n / 7;
    const chi2 = [...counts.values()].reduce((acc, c) => acc + ((c - e) ** 2) / e, 0);
    expect(chi2).toBeLessThan(25); // 6 dof
    expect(rngInt(s, 5, 5)).toBe(5);
    expect(() => rngInt(s, 3, 2)).toThrow(RangeError);
    const full = rngInt(s, 0, 2 ** 32 - 1);
    expect(full >= 0 && full < 2 ** 32).toBe(true);
  });

  it('rngInt is unbiased for a range that does not divide 2^32', () => {
    // range 3 * 2^30: plain modulo would make the first third of values twice as likely as the rest
    const s = rngSeed(5);
    const range = 3 * 2 ** 30;
    let low = 0;
    const n = 60_000;
    for (let i = 0; i < n; i++) if (rngInt(s, 0, range - 1) < 2 ** 30) low++;
    expect(low / n).toBeGreaterThan(0.32);
    expect(low / n).toBeLessThan(0.347);
  });

  it('rngRange, rngChance and rngPick', () => {
    const s = rngSeed(8);
    for (let i = 0; i < 1000; i++) {
      const r = rngRange(s, -2, 5);
      expect(r >= -2 && r < 5).toBe(true);
    }
    let hits = 0;
    for (let i = 0; i < 20_000; i++) if (rngChance(s, 0.3)) hits++;
    expect(hits / 20_000).toBeCloseTo(0.3, 1);
    expect(rngChance(s, 0)).toBe(false);
    expect(rngChance(s, 1)).toBe(true);
    const items = ['a', 'b', 'c'];
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) seen.add(rngPick(s, items));
    expect([...seen].sort()).toEqual(items);
    expect(() => rngPick(s, [])).toThrow(RangeError);
  });

  it('rngGauss has the requested mean and standard deviation', () => {
    const s = rngSeed(99);
    const n = 50_000;
    let sum = 0, sq = 0, within1 = 0;
    for (let i = 0; i < n; i++) {
      const g = rngGauss(s, 10, 2);
      sum += g;
      sq += g * g;
      if (Math.abs(g - 10) <= 2) within1++;
    }
    const mean = sum / n;
    const sd = Math.sqrt(sq / n - mean * mean);
    expect(mean).toBeCloseTo(10, 1);
    expect(sd).toBeCloseTo(2, 1);
    expect(within1 / n).toBeCloseTo(0.6827, 1);
  });

  it('rngShuffle is an in-place permutation, deterministic per seed', () => {
    const a = Array.from({ length: 50 }, (_, i) => i);
    const out = rngShuffle(rngSeed(1), a);
    expect(out).toBe(a);
    expect([...a].sort((x, y) => x - y)).toEqual(Array.from({ length: 50 }, (_, i) => i));
    expect(a).not.toEqual(Array.from({ length: 50 }, (_, i) => i));
    const b = rngShuffle(rngSeed(1), Array.from({ length: 50 }, (_, i) => i));
    expect(b).toEqual(a);
    // every element can land in position 0
    const first = new Set<number>();
    const s = rngSeed(4);
    for (let i = 0; i < 400; i++) first.add(rngShuffle(s, [0, 1, 2, 3, 4])[0]);
    expect(first.size).toBe(5);
  });

  it('forks: same name -> same stream, different names/seeds -> independent streams', () => {
    expect(draw(rngFork(7, 'terrain'), 20)).toEqual(draw(rngFork(7, 'terrain'), 20));
    const names = ['terrain', 'terrainA', 'terrainB', 'plants', 'rocks', ''];
    const streams = names.map((n) => draw(rngFork(7, n), 200));
    for (let i = 0; i < streams.length; i++) {
      for (let j = i + 1; j < streams.length; j++) {
        expect(streams[i][0]).not.toBe(streams[j][0]);
        // correlation of the float streams stays near zero
        let c = 0;
        for (let k = 0; k < 200; k++) c += (streams[i][k] / 2 ** 32 - 0.5) * (streams[j][k] / 2 ** 32 - 0.5);
        expect(Math.abs(c / 200)).toBeLessThan(0.03); // sd of the mean product ~ 1/(12 sqrt(200)) = 0.006
      }
    }
    expect(draw(rngFork(7, 'terrain'), 5)).not.toEqual(draw(rngFork(8, 'terrain'), 5));
    expect(draw(rngFork(7, 'terrain'), 5)).not.toEqual(draw(rngSeed(7), 5));
    // consuming one stream does not disturb another
    const a = rngFork(1, 'a');
    const bBefore = draw(rngFork(1, 'b'), 5);
    draw(a, 1000);
    expect(draw(rngFork(1, 'b'), 5)).toEqual(bBefore);
  });

  it('hashString is stable and sensitive to every character', () => {
    expect(hashString('foundress')).toBe(hashString('foundress'));
    expect(hashString('ab')).not.toBe(hashString('ba'));
    expect(hashString('')).not.toBe(hashString(' '));
    const h = hashString('nest');
    expect(Number.isInteger(h) && h >= 0 && h < 2 ** 32).toBe(true);
  });
});
