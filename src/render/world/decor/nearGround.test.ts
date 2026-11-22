// Near-ground floor of the quality density (look pass 4): the lowest tiers keep grass and litter within 30 BU of the camera.
import { describe, expect, it } from 'vitest';
import { GRIT_QUALITY } from '../dressing/tuning';
import { NEAR_GROUND, nearFloorDensity, nearGroundMm } from './tuning';

describe('near-ground density floor', () => {
  it('raises a low tier to the floor within the near distance and eases back to the tier\'s own density by twice that', () => {
    expect(nearFloorDensity(0.25, NEAR_GROUND.grass, 0)).toBeCloseTo(NEAR_GROUND.grass);
    expect(nearFloorDensity(0.25, NEAR_GROUND.grass, nearGroundMm(4))).toBeCloseTo(NEAR_GROUND.grass);
    expect(nearFloorDensity(0.25, NEAR_GROUND.grass, 2 * nearGroundMm(4))).toBeCloseTo(0.25);
    const mid = nearFloorDensity(0.25, NEAR_GROUND.grass, 1.5 * nearGroundMm(4));
    expect(mid).toBeGreaterThan(0.25);
    expect(mid).toBeLessThan(NEAR_GROUND.grass);
  });
  it('never lowers a tier that is already above the floor', () => {
    for (const d of [0, 60, 120, 180, 400]) expect(nearFloorDensity(1, NEAR_GROUND.litter, d)).toBeCloseTo(1);
  });
  it('30 BU at BU 4 is 120 mm, and the two lowest grit tiers reach it', () => {
    expect(nearGroundMm(4)).toBe(30 * 4);
    expect(GRIT_QUALITY.test.max).toBeGreaterThan(0);
    expect(GRIT_QUALITY.test.radiusMm).toBeGreaterThanOrEqual(nearGroundMm(4));
    expect(GRIT_QUALITY.low.radiusMm).toBeGreaterThanOrEqual(nearGroundMm(4));
  });
  it('the distance follows the BU of the world (30 BU is 270 mm at BU 9), through the same twin the shaders mirror with uDcBu', () => {
    expect(nearGroundMm(9)).toBe(270);
    expect(nearFloorDensity(0.25, NEAR_GROUND.grass, 200, nearGroundMm(9))).toBeCloseTo(NEAR_GROUND.grass); // 200 mm is inside 270
    expect(nearFloorDensity(0.25, NEAR_GROUND.grass, 200, nearGroundMm(4))).toBeLessThan(NEAR_GROUND.grass); // but past 120
  });
});
