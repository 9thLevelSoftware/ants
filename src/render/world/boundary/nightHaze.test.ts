// Look pass 2, work item 4: at night the backdrop shapes dissolve into the horizon band (a moonlit fence panel against
// the dark sky read as a pale slab), and the fence is not a ruler-straight band.
import { describe, expect, it } from 'vitest';
import { Color, Scene, Vector3 } from 'three';
import { BoundaryRenderer } from './boundaryRenderer';
import { BACKDROP_MIN_HAZE, BACKDROP_MIN_HAZE_NIGHT, FENCE_GAP_P, FENCE_HEIGHT_VARY } from './tuning';

const light = (nightW: number | undefined) => ({
  skyHorizon: new Color(0.01, 0.012, 0.02), skyZenith: new Color(0.004, 0.006, 0.014), overcast: 0, sunDir: new Vector3(0, -0.5, 0.8).normalize(),
  sunGlow: 0, keyColor: new Color(0.6, 0.7, 1), nightW,
});
const minHaze = (b: BoundaryRenderer) => (b as unknown as { backdropLook: { minHaze: { value: number } } }).backdropLook.minHaze.value;

describe('backdrop haze floor', () => {
  it('rises from the day value to the night value with the night weight, and is the day value without one', () => {
    const b = new BoundaryRenderer();
    b.init({ scene: new Scene() });
    b.update({}, light(undefined));
    expect(minHaze(b)).toBeCloseTo(BACKDROP_MIN_HAZE, 9);
    b.update({}, light(0));
    expect(minHaze(b)).toBeCloseTo(BACKDROP_MIN_HAZE, 9);
    b.update({}, light(0.5));
    expect(minHaze(b)).toBeCloseTo((BACKDROP_MIN_HAZE + BACKDROP_MIN_HAZE_NIGHT) / 2, 9);
    b.update({}, light(1));
    expect(minHaze(b)).toBeCloseTo(BACKDROP_MIN_HAZE_NIGHT, 9);
    expect(BACKDROP_MIN_HAZE_NIGHT).toBeGreaterThan(0.5);
    b.dispose();
  });
  it('fence panels vary in height and a few are missing (tuning sanity)', () => {
    expect(FENCE_HEIGHT_VARY[0]).toBeLessThan(1);
    expect(FENCE_HEIGHT_VARY[1]).toBeGreaterThan(FENCE_HEIGHT_VARY[0]);
    expect(FENCE_GAP_P).toBeGreaterThan(0);
    expect(FENCE_GAP_P).toBeLessThan(0.2);
  });
});
