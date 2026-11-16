// Reviewer's check of look-pass 2, work item 4 ("no visible ground-plane edge"): the skirt must meet the terrain at
// the map edge without a seam (edgeHaze.ts: "skirt and terrain meet without a seam at the edge"). The terrain takes
// only the scene's distance haze; the skirt takes max(edge haze, minHaze) on top of it, and the edge haze is 0 at the
// edge itself. Any skirt haze floor therefore shows as a hard line where the terrain ends.
//
// FAILS on the reviewed code: at night SKIRT_MIN_HAZE_NIGHT (0.6) is applied to the whole skirt, including the row
// that touches the terrain. In the real game (test-output/look2-verify/views/rv-night-edge-high.png, quality high,
// seed 1, 23:30 clear) the ground ends in a straight line at luma 0.076 and the skirt above it starts at 0.217,
// brighter than the night sky just above it (sRGB 44,61,70 against 40,49,76): the pale slab the task set out to remove.
import { describe, expect, it } from 'vitest';
import { Color, Scene, Vector3 } from 'three';
import { BoundaryRenderer } from './boundaryRenderer';

const light = (nightW: number) => ({
  skyHorizon: new Color(0.01, 0.012, 0.02), skyZenith: new Color(0.004, 0.006, 0.014), overcast: 0, sunDir: new Vector3(0, -0.5, 0.8).normalize(),
  sunGlow: 0, keyColor: new Color(0.6, 0.7, 1), nightW,
});
const skirtMin = (b: BoundaryRenderer) => (b as unknown as { skirtLook: { minHaze: { value: number } } }).skirtLook.minHaze.value;

describe('skirt meets the terrain without a seam', () => {
  it('by day the skirt has no haze floor (control case)', () => {
    const b = new BoundaryRenderer();
    b.init({ scene: new Scene() });
    b.update({}, light(0));
    expect(skirtMin(b)).toBe(0);
    b.dispose();
  });

  it('at night the skirt row at the map edge takes no more haze than the terrain next to it', () => {
    const b = new BoundaryRenderer();
    b.init({ scene: new Scene() });
    b.update({}, light(1));
    // the shader applies max(1 - exp(-d / k), uBdMin): at d = 0 that is uBdMin, which must be 0 for no seam
    expect(skirtMin(b)).toBe(0);
    b.dispose();
  });
});
