// GDD 06 App. E check 16 (site quality worked examples) and the factor rules of §5.7.
import { describe, expect, it } from 'vitest';
import {
  coverFactor, diggabilityFactor, exposureFactor, factorWord, floodSafetyFactor, moistureFactor, rivalScentFactor,
  siteProfile, siteQuality, siteWordOf, warmthFactor,
} from './siteScore';

describe('site quality (GDD 06 §5.7, App. E 16)', () => {
  it('under a stone on loam: Q 0.91 +- 0.01, Excellent', () => {
    const q = siteQuality([1, 0.9, 0.9, 1, 0.8, 1, 0.7], 'lasius-niger');
    expect(q).toBeCloseTo(0.91, 2);
    expect(siteWordOf(q)).toBe('excellent');
  });
  // Words: directions §K (binding, precedence over GDD 06) recalibrated the thresholds so that open mown lawn reads
  // fair (GDD 06 E16 said Good) and the map distribution meets its targets; dry paving sand is "fair or worse".
  it('open lawn: Q 0.70 +- 0.01, Fair (directions §K; GDD 06 E16: Good)', () => {
    const q = siteQuality([1, 0.8, 0.7, 0.35, 0.7, 1, 0.5], 'lasius-niger');
    expect(Math.abs(q - 0.7)).toBeLessThanOrEqual(0.01);
    expect(siteWordOf(q)).toBe('fair');
  });
  it('dry paving-joint sand: Q 0.37 +- 0.01, Poor (directions §K; GDD 06 E16: Fair)', () => {
    const q = siteQuality([0.4, 0.3, 0.6, 0.1, 0.6, 1, 0.5], 'lasius-niger');
    expect(Math.abs(q - 0.37)).toBeLessThanOrEqual(0.01);
    expect(siteWordOf(q)).toBe('poor');
  });
  it('one terrible factor drags the whole (floor 0.05); the word thresholds', () => {
    const q = siteQuality([1, 0, 1, 1, 1, 1, 1], 'lasius-niger');
    expect(q).toBeCloseTo(Math.pow(0.05, 0.2), 6);
    expect(siteWordOf(0.67)).toBe('poor');
    expect(siteWordOf(0.68)).toBe('fair');
    expect(siteWordOf(0.74)).toBe('good');
    expect(siteWordOf(0.89)).toBe('excellent');
  });
});

describe('factor rules', () => {
  const lasius = siteProfile('lasius-niger');
  it('moisture trapezoid: 0 at <= 0.10, 1 over 0.35..0.65, 0 at >= 0.95', () => {
    expect(moistureFactor(lasius.moist, 0.1)).toBe(0);
    expect(moistureFactor(lasius.moist, 0.35)).toBe(1);
    expect(moistureFactor(lasius.moist, 0.5)).toBe(1);
    expect(moistureFactor(lasius.moist, 0.65)).toBe(1);
    expect(moistureFactor(lasius.moist, 0.8)).toBeCloseTo(0.5, 6);
    expect(moistureFactor(lasius.moist, 0.95)).toBe(0);
  });
  it('warmth: 1 inside 20-26 C, linear to 0 at 10 C beyond', () => {
    expect(warmthFactor(lasius.toptC, 23)).toBe(1);
    expect(warmthFactor(lasius.toptC, 15)).toBeCloseTo(0.5, 6);
    expect(warmthFactor(lasius.toptC, 36)).toBe(0);
  });
  it('diggability from the species site table; dry sand collapses; unknown materials 0', () => {
    const t = { loam: 1, humus: 0.9, sand: 0.8, clay: 0.5, gravel: 0.4 };
    expect(diggabilityFactor(t, 'loam', 0.3)).toBe(1);
    expect(diggabilityFactor(t, 'sand', 0.5)).toBeCloseTo(0.8, 6);
    expect(diggabilityFactor(t, 'sand', 0)).toBeCloseTo(0.32, 6);
    expect(diggabilityFactor(t, 'concrete', 0.3)).toBe(0);
  });
  it('cover, flood, rival, exposure', () => {
    expect(coverFactor('roof')).toBe(1);
    expect(coverFactor('litter')).toBe(0.5);
    expect(coverFactor('grass')).toBe(0.15);
    expect(coverFactor('bare')).toBe(0.1);
    expect(floodSafetyFactor(0.2)).toBeCloseTo(0.8, 6);
    expect(rivalScentFactor(0)).toBe(1);
    expect(rivalScentFactor(0.25)).toBeCloseTo(0.5, 6);
    expect(rivalScentFactor(2)).toBe(0);
    expect(exposureFactor(0, 0)).toBe(1);
    expect(exposureFactor(0.5, 1)).toBeCloseTo(0.3, 6);
  });
  it('words', () => {
    expect(factorWord('diggability', 0)).toBe('Unbreakable');
    expect(factorWord('diggability', 1)).toBe('Loose');
    expect(factorWord('cover', 1)).toBe('Roofed');
    expect(factorWord('moisture', 0.5, 0.05)).toBe('Dry');
    expect(factorWord('warmth', 1, 23, lasius.toptC)).toBe('Mild');
  });
});
