import { describe, expect, it } from 'vitest';
import { boundsFor, GROUP_ORDER, moveShare, quantise, sharesSum, type Flags, type Shares } from './linkedShares';

const S = (forage: number, nurse: number, dig: number, defend: number): Shares => ({ forage, nurse, dig, defend });

describe('quantise', () => {
  it('turns floats into steps of 5 that sum to exactly 100', () => {
    const q = quantise(S(33.3, 33.3, 33.3, 0.1));
    expect(sharesSum(q)).toBe(100);
    for (const g of GROUP_ORDER) expect(q[g] % 5).toBe(0);
  });
  it('splits evenly when everything is zero', () => {
    expect(quantise(S(0, 0, 0, 0))).toEqual(S(25, 25, 25, 25));
  });
});

describe('moveShare', () => {
  it('moves one slider and takes the difference from the others in proportion', () => {
    const r = moveShare(S(40, 40, 20, 0), 'forage', 60);
    expect(r.applied).toBe(60);
    expect(sharesSum(r.shares)).toBe(100);
    expect(r.shares.defend).toBe(0); // a zero group stays zero
    expect(r.shares.nurse).toBeGreaterThan(r.shares.dig); // proportional: the bigger one gives more... and ends bigger
    expect(r.shares.nurse + r.shares.dig).toBe(40);
  });
  it('keeps locked groups where they are', () => {
    const locked: Flags = { nurse: true };
    const r = moveShare(S(25, 25, 25, 25), 'forage', 50, locked);
    expect(r.shares.nurse).toBe(25);
    expect(sharesSum(r.shares)).toBe(100);
    expect(r.shares.forage).toBe(50);
  });
  it('cannot move when every other group is locked', () => {
    const r = moveShare(S(25, 25, 25, 25), 'forage', 80, { nurse: true, dig: true, defend: true });
    expect(r.shares).toEqual(S(25, 25, 25, 25));
    expect(r.limited).toBe(true);
  });
  it('pulls the request in to what locks allow', () => {
    const r = moveShare(S(25, 25, 25, 25), 'forage', 100, { nurse: true });
    expect(r.applied).toBe(75);
    expect(r.limited).toBe(true);
    expect(sharesSum(r.shares)).toBe(100);
  });
  it('respects floors and caps of the other groups', () => {
    const bounds = { nurse: { min: 20, max: 100 }, defend: { min: 0, max: 5 } };
    const r = moveShare(S(25, 25, 25, 25), 'forage', 90, {}, bounds);
    expect(r.shares.nurse).toBeGreaterThanOrEqual(20);
    expect(r.shares.defend).toBeLessThanOrEqual(5);
    expect(sharesSum(r.shares)).toBe(100);
    expect(r.applied).toBeLessThan(90); // the floors and the cap leave less room than asked
  });
  it('respects the moved group own floor', () => {
    const r = moveShare(S(25, 25, 25, 25), 'nurse', 0, {}, { nurse: { min: 15, max: 100 } });
    expect(r.shares.nurse).toBe(15);
  });
  it('is a no-op when the value does not change', () => {
    const start = S(30, 30, 25, 15);
    expect(moveShare(start, 'dig', 25).shares).toEqual(start);
  });
  it('always sums to 100 and respects bounds for random moves (property)', () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let n = 0; n < 2000; n++) {
      let shares = quantise(S(rnd() * 100, rnd() * 100, rnd() * 100, rnd() * 100));
      const locked: Flags = {};
      const bounds: Record<string, { min: number; max: number }> = {};
      for (const g of GROUP_ORDER) {
        if (rnd() < 0.2) locked[g] = true;
        const min = Math.min(shares[g], Math.floor(rnd() * 3) * 5);
        const max = Math.max(shares[g], 100 - Math.floor(rnd() * 3) * 5);
        bounds[g] = { min, max };
      }
      const moved = GROUP_ORDER[Math.floor(rnd() * 4)];
      const r = moveShare(shares, moved, Math.round(rnd() * 20) * 5, locked, bounds);
      shares = r.shares;
      expect(sharesSum(shares)).toBe(100);
      for (const g of GROUP_ORDER) {
        expect(shares[g] % 5).toBe(0);
        expect(shares[g]).toBeGreaterThanOrEqual(bounds[g].min);
        expect(shares[g]).toBeLessThanOrEqual(bounds[g].max);
      }
    }
  });
});

describe('boundsFor', () => {
  it('gives a floor only to groups with real need', () => {
    const b = boundsFor({ forage: 8, nurse: 20, dig: 0, defend: 0 }, 40);
    expect(b.nurse?.min).toBeGreaterThan(0);
    expect(b.dig).toBeUndefined();
  });
  it('has no bounds without workers', () => {
    expect(boundsFor({ forage: 1, nurse: 1, dig: 1, defend: 1 }, 0)).toEqual({});
  });
});
