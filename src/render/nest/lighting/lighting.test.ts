import { describe, expect, it } from 'vitest';
import { createNestLook, updateNestLook } from './undergroundLook';
import { NEST_LOOK } from '../params';

const BU = 4;

describe('underground look', () => {
  it('switches with hysteresis at the substrate surface', () => {
    const look = createNestLook();
    updateNestLook(look, 5, BU, 0, 0); // 5 mm above ground
    expect(look.underground).toBe(false);
    updateNestLook(look, -0.2 * BU, BU, 0, 0); // just below: inside the hysteresis band
    expect(look.underground).toBe(false);
    updateNestLook(look, -0.5 * BU, BU, 0, 0);
    expect(look.underground).toBe(true);
    updateNestLook(look, -0.2 * BU, BU, 0, 0); // back up into the band: stays underground
    expect(look.underground).toBe(true);
    updateNestLook(look, 0, BU, 0, 0);
    expect(look.underground).toBe(false);
  });

  it('eases exposure over about 1 real s (GDD 01 6.1) without jumps', () => {
    const look = createNestLook();
    updateNestLook(look, 10, BU, 0, 0.5);
    let prev = look.exposureEV, maxStep = 0, t = 0;
    while (t < 2) {
      updateNestLook(look, -10, BU, 1 / 60, 0.5);
      maxStep = Math.max(maxStep, Math.abs(look.exposureEV - prev));
      prev = look.exposureEV;
      t += 1 / 60;
      if (Math.abs(t - 1) < 1e-9 + 1 / 120) expect(look.under).toBeGreaterThan(0.94);
    }
    expect(look.under).toBeGreaterThan(0.995);
    expect(look.exposureEV).toBeCloseTo(NEST_LOOK.exposureEV, 1);
    expect(maxStep).toBeLessThan(0.1); // a smooth ramp, not a switch
    expect(look.fogDensity).toBeCloseTo(1 / (NEST_LOOK.fogVisBU * BU));
  });
});
