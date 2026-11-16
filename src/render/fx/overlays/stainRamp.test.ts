// The numeric rules of the temperature and moisture fills (review finding: dry ground darkened, wet ground a uniform
// dark blue, temperature invisible in uniform weather).
import { describe, expect, it } from 'vitest';
import { moistureStainAlpha, temperatureDeviation, temperatureStainAlpha } from './stainRamp';
import { FILL_ALPHA, MOISTURE_FILL_MAX, MOISTURE_STAIN_FULL, MOISTURE_STAIN_START, STAIN_CHROMA } from './tuning';
import { encodeTemp } from './samplers';

describe('moisture stain', () => {
  it('dry ground carries no tint: alpha is 0 from the dry end up to the start of the ramp', () => {
    for (const m of [0, 0.02, MOISTURE_STAIN_START]) expect(moistureStainAlpha(m)).toBe(0);
    expect(moistureStainAlpha(0.1)).toBeLessThan(0.1 * MOISTURE_FILL_MAX + 0.1);
  });

  it('the ramp is monotonic and reaches its cap at the lowest contour band (25 %), then stays flat', () => {
    let prev = 0;
    for (let m = 0; m <= 1.0001; m += 0.01) { const a = moistureStainAlpha(m); expect(a).toBeGreaterThanOrEqual(prev - 1e-12); prev = a; }
    expect(moistureStainAlpha(MOISTURE_STAIN_FULL)).toBeCloseTo(MOISTURE_FILL_MAX, 9);
    expect(moistureStainAlpha(1)).toBeCloseTo(MOISTURE_FILL_MAX, 9);
    expect(MOISTURE_STAIN_FULL).toBeLessThanOrEqual(0.25 + 0.06);
  });

  it('the strongest fill leaves the ground texture readable: at most 40 % opaque, a multiplier of the ground', () => {
    expect(MOISTURE_FILL_MAX).toBeLessThanOrEqual(0.4);
    expect(STAIN_CHROMA.moisture).toBeLessThan(2);
  });
});

describe('temperature stain', () => {
  const opt = encodeTemp(25);
  it('ground at the optimum stays as it is; a departure is a readable tint, saturating towards FILL_ALPHA', () => {
    expect(temperatureStainAlpha(opt, opt)).toBe(0);
    // an 8 K cold day (17 C) in uniform weather: a clear tint, not a trace
    const a17 = temperatureStainAlpha(encodeTemp(17), opt);
    expect(a17).toBeGreaterThan(0.2);
    expect(a17).toBeLessThan(FILL_ALPHA);
    expect(temperatureStainAlpha(0, opt)).toBeGreaterThan(a17);
    expect(temperatureStainAlpha(0, opt)).toBeLessThanOrEqual(FILL_ALPHA);
    expect(temperatureStainAlpha(1, opt)).toBeLessThanOrEqual(FILL_ALPHA);
  });

  it('the departure is symmetric in its own half of the scale', () => {
    expect(temperatureDeviation(0, opt)).toBeCloseTo(1, 9);
    expect(temperatureDeviation(1, opt)).toBeCloseTo(1, 9);
    expect(temperatureDeviation(opt, opt)).toBe(0);
  });
});
