// The on-screen size rules of a rain streak (review finding: wide opaque white columns at ant height). Whatever the
// distance of the drop, its streak is at most RAIN_MAX_WIDTH_FRAC of the screen wide, no longer than RAIN_MAX_LEN_FRAC
// of its height, and invisible at the lens.
import { describe, expect, it } from 'vitest';
import { Color, Fog, HemisphereLight, Scene } from 'three';
import { depthFade, maxWidthPx, projectedWidthPx, streakLengthMm, streakWidthMm, pixelMm, type RainView } from './rainMath';
import { rainTint } from './rainTint';
import { DROP_LOOK, RAIN_FADE_NEAR_BU, RAIN_MAX_LEN_FRAC, RAIN_MAX_WIDTH_FRAC, RAIN_MIN_WIDTH_PX, RAIN_TINT_GAIN, RAIN_TINT_MAX } from './tuning';

const BU = 4;
const views: RainView[] = [
  { widthPx: 1280, heightPx: 720, focal: 1 / Math.tan((50 * Math.PI) / 360) },
  { widthPx: 1920, heightPx: 1080, focal: 1 / Math.tan((30 * Math.PI) / 360) }, // a long lens (photo mode)
  { widthPx: 640, heightPx: 360, focal: 1 / Math.tan((70 * Math.PI) / 360) },
];
/** From the lens to the far edge of the rain box, mm (1.8 BU is the crevice camera of the possession view). */
const depths = [1, 3, 7.2, 12, 20, 40, 80, 160, 320, 640];

describe('rain streak on-screen size', () => {
  it('never covers more than 0.4 % of the screen width, at any depth, for every drop class', () => {
    for (const v of views) for (const look of Object.values(DROP_LOOK)) for (const d of depths) {
      const w = (look.diameterMm * 0.12);
      const px = projectedWidthPx(w, d, v);
      expect(px).toBeLessThanOrEqual(0.004 * v.widthPx + 1e-9);
      expect(px).toBeLessThanOrEqual(maxWidthPx(v) + 1e-9);
      expect(px).toBeGreaterThanOrEqual(RAIN_MIN_WIDTH_PX - 1e-9);
    }
    expect(RAIN_MAX_WIDTH_FRAC).toBeLessThan(0.004);
  });

  it('a drop that is thin in the world is not widened beyond a hairline far away, and grows only up to the clamp near', () => {
    const v = views[0]!;
    // 0.54 mm wide drop: at 600 mm it is below one pixel (raised to the hairline minimum), at 8 mm it is clamped
    expect(projectedWidthPx(0.54, 600, v)).toBeCloseTo(RAIN_MIN_WIDTH_PX, 5);
    expect(projectedWidthPx(0.54, 8, v)).toBeCloseTo(maxWidthPx(v), 5);
    // between the two it is the true projected width
    const mid = 200;
    expect(streakWidthMm(0.54, mid, v)).toBeCloseTo(0.54, 6);
  });

  it('the projected length never exceeds a fraction of the screen height', () => {
    for (const v of views) for (const look of Object.values(DROP_LOOK)) for (const d of depths) {
      const len = streakLengthMm(look.streakMm, d, v);
      expect(len / pixelMm(d, v)).toBeLessThanOrEqual(RAIN_MAX_LEN_FRAC * v.heightPx + 1e-6);
    }
  });

  it('near streaks fade out instead of growing: invisible at the lens, full in the working band, thin in the haze', () => {
    expect(depthFade(0.5 * BU, BU)).toBe(0);
    expect(depthFade(1.8 * BU, BU)).toBe(0);
    expect(depthFade(RAIN_FADE_NEAR_BU[0] * BU, BU)).toBe(0);
    expect(depthFade(25 * BU, BU)).toBeCloseTo(1, 6);
    expect(depthFade(80 * BU, BU)).toBe(0);
    let prev = -1;
    for (let d = RAIN_FADE_NEAR_BU[0] * BU; d <= RAIN_FADE_NEAR_BU[1] * BU; d += BU / 4) { const f = depthFade(d, BU); expect(f).toBeGreaterThanOrEqual(prev); prev = f; }
  });
});

describe('rain colour follows the scene light', () => {
  it('is the fog colour lifted by the gain: dark at night, never above the haze x gain', () => {
    const scene = new Scene();
    scene.fog = new Fog(new Color(0.02, 0.025, 0.04), 1, 100);
    const night = Array.from(rainTint(scene));
    expect(night[0]).toBeCloseTo(0.02 * RAIN_TINT_GAIN, 6);
    scene.fog = new Fog(new Color(0.25, 0.27, 0.3), 1, 100);
    const day = Array.from(rainTint(scene));
    expect(day[2]).toBeGreaterThan(night[2]! * 5);
    expect(Math.max(...night)).toBeLessThan(0.1);
  });

  it('in a bright haze the colour is capped: no pure white rain, hue kept', () => {
    const scene = new Scene();
    scene.fog = new Fog(new Color(0.9, 0.95, 1.0), 1, 100);
    const t = Array.from(rainTint(scene));
    expect(Math.max(...t)).toBeLessThanOrEqual(RAIN_TINT_MAX + 1e-9);
    expect(t[2]! / t[0]!).toBeCloseTo(1 / 0.9, 6);
  });

  it('without fog it uses the sky ambient light', () => {
    const scene = new Scene();
    const hemi = new HemisphereLight(0x8899aa, 0x222222, 0.1);
    hemi.name = 'world:sky-ambient';
    scene.add(hemi);
    const dim = rainTint(scene)[0]!;
    hemi.intensity = 1;
    expect(rainTint(scene)[0]!).toBeGreaterThan(dim * 5);
  });
});
