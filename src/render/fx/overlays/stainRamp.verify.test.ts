// Independent review of the overlay fill rules (task stage2-look-fix, defect 2) against the simulation's own moisture
// classes (src/sim/balance/weather.ts WX_MOISTURE_CLASS_BOUNDS: dry < 0.15 < slightly damp < 0.35 < damp < 0.65 < wet
// < 0.9 < waterlogged) and the temperature scale of the legend.
import { describe, expect, it } from 'vitest';
import { WX_MOISTURE_CLASS_BOUNDS } from '@/sim/balance/weather';
import { moistureStainAlpha, temperatureAmp, temperatureStainAlpha, temperatureStainT } from './stainRamp';
import { encodeTemp } from './samplers';
import { FILL_ALPHA, MOISTURE_FILL_MAX } from './tuning';

describe('moisture fill by the simulation classes', () => {
  const [dry, slight, damp, wet] = WX_MOISTURE_CLASS_BOUNDS;
  it('"dry" soil carries no tint at all; "slightly damp" a trace', () => {
    for (let m = 0; m <= dry; m += 0.01) expect(moistureStainAlpha(m)).toBe(0);
    expect(moistureStainAlpha(slight)).toBeLessThan(0.25 * MOISTURE_FILL_MAX);
  });
  it('damp, wet and waterlogged are told apart (not one uniform sheet)', () => {
    const a = [moistureStainAlpha(slight), moistureStainAlpha(damp), moistureStainAlpha(wet), moistureStainAlpha(1)];
    for (let i = 1; i < a.length; i++) expect(a[i]!).toBeGreaterThanOrEqual(a[i - 1]!);
    // the step from slightly damp to damp is a clear one
    expect(a[1]! - a[0]!).toBeGreaterThan(0.1);
  });
  it('is finite and inside 0..cap for any input, including out-of-range and NaN-free edges', () => {
    for (const m of [-1, -0.01, 0, 0.5, 1, 1.5, 1e6, -1e6]) {
      const a = moistureStainAlpha(m);
      expect(Number.isFinite(a)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(a).toBeLessThanOrEqual(MOISTURE_FILL_MAX + 1e-12);
    }
  });
});

describe('temperature fill', () => {
  it('for every optimum the renderer can be given (uMid clamped to 0.1..0.9), the fill stays inside 0..FILL_ALPHA and the colour inside the ramp', () => {
    for (let mid = 0.1; mid <= 0.9001; mid += 0.1) {
      for (let v = 0; v <= 1.0001; v += 0.02) {
        const a = temperatureStainAlpha(v, mid), t = temperatureStainT(v, mid);
        expect(a).toBeGreaterThanOrEqual(0);
        expect(a).toBeLessThanOrEqual(FILL_ALPHA + 1e-12);
        expect(t).toBeGreaterThanOrEqual(-1e-12);
        expect(t).toBeLessThanOrEqual(1 + 1e-12);
        // the colour sits on the same side of the optimum as the value (cold stays blue, hot stays orange)
        if (v < mid) expect(t).toBeLessThanOrEqual(mid + 1e-12);
        if (v > mid) expect(t).toBeGreaterThanOrEqual(mid - 1e-12);
      }
    }
  });
  it('a 1 K departure is almost invisible, a 5 K one (one isotherm step) is a visible tint', () => {
    const mid = encodeTemp(25);
    expect(temperatureStainAlpha(encodeTemp(24), mid)).toBeLessThan(0.1);
    expect(temperatureStainAlpha(encodeTemp(20), mid)).toBeGreaterThan(0.15);
    expect(temperatureAmp(encodeTemp(30), mid)).toBeGreaterThan(0.2);
  });
});
