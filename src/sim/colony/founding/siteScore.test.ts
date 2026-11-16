// Founding-site quality (GDD 06 §5.7, App. E check 16) after directions §K's ruling: the read-out scores its seven
// factors with THE site-quality function and word table of the static suitability map. GDD 06's own worked
// examples (weighted geometric mean, Q 0.91 / 0.70 / 0.37) are superseded; the examples below are the map's
// calibration cases (SUIT: sunny stone excellent, open mown lawn fair, shaded damp hollow poor).
import { describe, expect, it } from 'vitest';
import {
  coverValueOf, COVER_LEVELS, floodFactorOf, moistFactor, quietFactorOf, rivalFactorAt, siteClass, siteQualityOf, warmFactorOf,
} from '@/worldgen/maps/suitability';
import { SUIT, SUITABILITY } from '@/worldgen/tuning/maps';
import { factorWord, mapFactorsOf, siteProfile, siteQuality, siteWordOf, toptOf } from './siteScore';

const LN = 'lasius-niger' as const;

describe('one scoring function and one word table (directions §K)', () => {
  it('siteQuality of the read-out factors is the map function on the same values, for every species profile', () => {
    const cases = [[1, 1, 1, 1, 1, 1, 1], [0.8, 0.3, 0.6, 0.15, 0.9, 1, 0.6], [0.5, 0.9, 0.2, 0.5, 0.4, 0.3, 1], [1, 0, 0, 0.05, 0, 0, 0]];
    for (const sp of ['lasius-niger', 'camponotus-pennsylvanicus', 'messor-barbarus', 'atta-texana'] as const) {
      for (const f of cases) {
        const m = { fDig: f[0], fMoist: f[1], fWarm: f[2], fCover: f[3], fFlood: f[4], fRival: f[5], fQuiet: f[6], fSpecial: 0 };
        expect(siteQuality(f, sp)).toBeCloseTo(siteQualityOf(SUITABILITY[sp].weights, m, false), 12);
      }
    }
    expect(mapFactorsOf([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7])).toEqual({ fDig: 0.1, fMoist: 0.2, fWarm: 0.3, fCover: 0.4, fFlood: 0.5, fRival: 0.6, fQuiet: 0.7, fSpecial: 0 });
  });

  it('the words are the map thresholds', () => {
    for (let q = 0; q <= 1.0001; q += 0.005) expect(siteWordOf(q)).toBe(siteClass(q));
    expect(siteWordOf(SUIT.fair - 1e-6)).toBe('poor');
    expect(siteWordOf(SUIT.fair)).toBe('fair');
    expect(siteWordOf(SUIT.good)).toBe('good');
    expect(siteWordOf(SUIT.excellent)).toBe('excellent');
    expect(siteWordOf(NaN)).toBe('poor');
  });

  it('not diggable vetoes the site (Q 0, poor)', () => {
    expect(siteQuality([0, 1, 1, 1, 1, 1, 1], LN)).toBe(0);
    expect(siteQuality([NaN, NaN, NaN, NaN, NaN, NaN, NaN], LN)).toBe(0);
  });
});

describe('Lasius worked examples on the map scale (App. E 16 as ruled by directions §K)', () => {
  const lawnQuiet = 0.6; // a mown lawn's disturbance passes
  it('under a sunny stone on loam, moist, raised: excellent', () => {
    const q = siteQuality([1, 1, warmFactorOf(0.1, true), coverValueOf('ceiling'), floodFactorOf(0.1), 1, 1], LN);
    expect(q).toBeGreaterThanOrEqual(SUIT.excellent);
    expect(siteWordOf(q)).toBe('excellent');
  });
  it('beside a stone in the sun: good', () => {
    const q = siteQuality([1, 0.9, warmFactorOf(0.2, true), coverValueOf('beside'), floodFactorOf(0.1), 1, lawnQuiet], LN);
    expect(siteWordOf(q)).toBe('good');
  });
  it('open sunny mown lawn: fair (Q about 0.76)', () => {
    const q = siteQuality([1, 0.9, warmFactorOf(0, false), coverValueOf('sward'), floodFactorOf(0.1), 1, lawnQuiet], LN);
    expect(Math.abs(q - 0.765)).toBeLessThanOrEqual(0.01);
    expect(siteWordOf(q)).toBe('fair');
  });
  it('a shaded damp hollow under litter: poor', () => {
    const q = siteQuality([1, moistFactor(siteProfile(LN).moist, 0.8), warmFactorOf(0.7, false), coverValueOf('litter'), floodFactorOf(0.6), 1, 1], LN);
    expect(siteWordOf(q)).toBe('poor');
  });
});

describe('factor rules (the map functions the read-out imports)', () => {
  const moist = siteProfile(LN).moist;
  it('moisture window 0.10 / 0.30-0.55 / 0.85; NaN reads 0', () => {
    expect(moistFactor(moist, 0.1)).toBe(0);
    expect(moistFactor(moist, 0.2)).toBeCloseTo(0.5, 6);
    expect(moistFactor(moist, 0.3)).toBe(1);
    expect(moistFactor(moist, 0.55)).toBe(1);
    expect(moistFactor(moist, 0.7)).toBeCloseTo(0.5, 6);
    expect(moistFactor(moist, 0.85)).toBe(0);
    expect(moistFactor(moist, NaN)).toBe(0);
  });
  it('cover levels are increasing; warmth is the sun with the warm-stone bonus; flood, quiet, rival', () => {
    const v = COVER_LEVELS.map(coverValueOf);
    for (let i = 1; i < v.length; i++) expect(v[i]).toBeGreaterThan(v[i - 1]);
    expect(coverValueOf('bare')).toBe(SUIT.coverBare);
    expect(coverValueOf('ceiling')).toBe(1);
    expect(warmFactorOf(0.5, false)).toBeCloseTo(0.5, 6);
    expect(warmFactorOf(0.5, true)).toBeCloseTo(0.5 * SUIT.warmStoneMult, 6);
    expect(warmFactorOf(0, true)).toBe(1);
    expect(floodFactorOf(0.2)).toBeCloseTo(0.8, 6);
    expect(quietFactorOf(0)).toBe(1);
    expect(quietFactorOf(1e9)).toBe(0);
    expect(rivalFactorAt([], 0, 0, 4)).toBe(1);
    expect(rivalFactorAt([{ origin: { x: 0, z: 0 } }], SUIT.rivalFullBu * 2, 0, 4)).toBeCloseTo(0.5, 6);
  });
  it('words', () => {
    expect(factorWord('diggability', 0)).toBe('Unbreakable');
    expect(factorWord('diggability', 1)).toBe('Loose');
    expect(factorWord('cover', 1)).toBe('Roofed');
    expect(factorWord('moisture', 0.5, 0.05)).toBe('Dry');
    // warmth is worded from its own value (the sun factor its dots show), whatever the cell temperature
    expect(factorWord('warmth', 1, 23, toptOf(LN))).toBe('Sun-baked');
    expect(factorWord('warmth', 0.05, 23, toptOf(LN))).toBe('Shaded');
    expect(factorWord('warmth', 0.5)).toBe('Mild');
    expect(factorWord('warmth', 0.8)).toBe('Warm');
    expect(factorWord('warmth', NaN)).toBe('Shaded');
  });
});
