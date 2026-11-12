// Reviewer tests for the linked workforce sliders (GDD 08 4.2, GDD 02 6.3). A FAILING test here documents a defect.
import { describe, expect, it } from 'vitest';
import { boundsFor, GROUP_ORDER, moveShare, quantise, sharesSum, type BoundsMap, type Flags, type Shares } from './linkedShares';

const S = (forage: number, nurse: number, dig: number, defend: number): Shares => ({ forage, nurse, dig, defend });

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

describe('few workers, large need (GDD 08 4.2: "Too few workers ... but allow edits")', () => {
  it('the floors boundsFor derives never add up to more than 100 %', () => {
    // a founding colony with one nanitic: nurse need 3, forage need 2 (worker-equivalents)
    const b = boundsFor({ forage: 2, nurse: 3, dig: 1, defend: 0 }, 1);
    const floors = GROUP_ORDER.reduce((a, g) => a + (b[g]?.min ?? 0), 0);
    expect(floors).toBeLessThanOrEqual(100);
  });

  it('with those bounds at least one slider can still be moved', () => {
    const bounds = boundsFor({ forage: 2, nurse: 3, dig: 1, defend: 0 }, 1);
    const start = S(25, 25, 25, 25);
    let anyMoved = false;
    for (const g of GROUP_ORDER) {
      for (const v of [0, 50, 100]) {
        const r = moveShare(start, g, v, {}, bounds);
        if (GROUP_ORDER.some((k) => r.shares[k] !== start[k])) anyMoved = true;
      }
    }
    expect(anyMoved).toBe(true);
  });
});

describe('moveShare invariants for any start, locks and feasible bounds (property)', () => {
  it('sum is exactly 100, steps of 5, locked groups unchanged, never negative', () => {
    const rnd = rng(777);
    for (let n = 0; n < 3000; n++) {
      // start NOT necessarily inside the bounds (auto shares come from the colony's own targets)
      const start = quantise(S(rnd() * 100, rnd() * 100, rnd() * 100, rnd() * 100));
      const locked: Flags = {};
      const bounds: BoundsMap = {};
      let minSum = 0;
      for (const g of GROUP_ORDER) {
        if (rnd() < 0.25) locked[g] = true;
        const min = Math.floor(rnd() * 5) * 5;
        if (minSum + min <= 100) { minSum += min; bounds[g] = { min, max: 100 - Math.floor(rnd() * 3) * 5 }; }
      }
      const moved = GROUP_ORDER[Math.floor(rnd() * 4)];
      const r = moveShare(start, moved, Math.round(rnd() * 20) * 5, locked, bounds);
      expect(sharesSum(r.shares)).toBe(100);
      for (const g of GROUP_ORDER) {
        expect(r.shares[g] % 5).toBe(0);
        expect(r.shares[g]).toBeGreaterThanOrEqual(0);
        if (locked[g] && g !== moved) expect(r.shares[g]).toBe(start[g]);
      }
    }
  });

  it('a non-finite request leaves the shares valid', () => {
    const r = moveShare(S(40, 30, 20, 10), 'dig', Number.NaN);
    expect(sharesSum(r.shares)).toBe(100);
    for (const g of GROUP_ORDER) expect(Number.isFinite(r.shares[g])).toBe(true);
  });

  it('quantise survives NaN and negative inputs', () => {
    const q = quantise(S(Number.NaN, -20, 50, 50));
    expect(sharesSum(q)).toBe(100);
  });
});
