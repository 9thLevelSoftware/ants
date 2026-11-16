// Independent review of the rain look rules (task stage2-look-fix, defect 1): the streak colour comes from the scene's
// own haze, so a streak follows the exposure by day and by night and is never pure white; the on-screen size clamps
// hold for drawing buffers of any size and DPR, and for every class of drop.
import { describe, expect, it } from 'vitest';
import { FogExp2, Scene, Vector3 } from 'three';
import { autoExposureEV, computeLighting, type LightingInput } from '@/render/world/lighting/timeOfDay';
import { rainTint } from './rainTint';
import { depthFade, pixelMm, projectedWidthPx, streakLengthMm, type RainView } from './rainMath';
import { DROP_LOOK, RAIN_FADE_FAR_BU, RAIN_FADE_NEAR_BU, RAIN_MAX_LEN_FRAC, RAIN_MIN_WIDTH_MM, RAIN_PER_DROP_MIN, RAIN_TINT_MAX, RAIN_WIDTH_PER_DIAMETER } from './tuning';

const BU = 4;

function sceneAt(sunElevDeg: number): { scene: Scene; ev: number; haze: number } {
  const e = (sunElevDeg * Math.PI) / 180;
  const inp: LightingInput = {
    sunDir: new Vector3(Math.cos(e), Math.sin(e), 0.2).normalize(), sunElevDeg, moonDir: new Vector3(-0.3, 0.8, 0.2).normalize(), moonIllum: 0.6,
    weather: 'rain', cloud: 1, fog: 0, zone: 'pavement', bu: BU, under: 0, hazeScale: 1,
  };
  const l = computeLighting(inp);
  const scene = new Scene();
  scene.fog = new FogExp2(l.fogColor.getHex(), 0.001);
  (scene.fog as FogExp2).color.copy(l.fogColor);
  const haze = Math.max(l.fogColor.r, l.fogColor.g, l.fogColor.b);
  return { scene, ev: l.exposureEV ?? autoExposureEV(l), haze };
}

/** What one full-opacity drop head adds to the pixel, linear, after exposure (additive SrcAlpha/One, colour x a). */
function exposedAdd(scene: Scene, ev: number, opacity: number): number {
  const t = rainTint(scene);
  return Math.max(t[0], t[1], t[2]) * opacity * opacity * Math.pow(2, ev);
}

describe('rain brightness follows the scene light', () => {
  it('a downpour streak is dimmer at night than at noon after exposure, and never near pure white', () => {
    const noon = sceneAt(60), night = sceneAt(-30);
    const op = DROP_LOOK.storm.opacity;
    const day = exposedAdd(noon.scene, noon.ev, op), dark = exposedAdd(night.scene, night.ev, op);
    // measured on review: day 1.09, night 0.39 (linear, after exposure EV 1.09 / 3.29)
    expect(dark).toBeLessThan(day * 0.5);
    // a streak adds at most the haze's own exposed brightness x gain x opacity^2: the air, lifted, not a white line
    expect(day).toBeLessThanOrEqual(noon.haze * 2 * op * op * Math.pow(2, noon.ev) + 1e-9);
    expect(dark).toBeLessThan(0.5);
  });

  it('the colour itself never exceeds the cap, whatever the haze', () => {
    for (const elev of [-40, -5, 5, 20, 60]) {
      const t = rainTint(sceneAt(elev).scene);
      expect(Math.max(...t)).toBeLessThanOrEqual(RAIN_TINT_MAX + 1e-9);
      for (const c of t) expect(Number.isFinite(c) && c >= 0).toBe(true);
    }
  });
});

describe('rain streak size clamps under other drawing buffers', () => {
  const views: RainView[] = [
    { widthPx: 2560, heightPx: 1440, focal: 1 / Math.tan((50 * Math.PI) / 360) }, // DPR 2 at 1280 x 720
    { widthPx: 3840, heightPx: 2160, focal: 1 / Math.tan((20 * Math.PI) / 360) }, // 4K through a long photo lens
    { widthPx: 720, heightPx: 1280, focal: 1 / Math.tan((60 * Math.PI) / 360) }, // portrait
  ];
  it('width <= 0.4 % of the screen and length <= the cap, for the real (min-clamped) drop widths', () => {
    for (const v of views) for (const look of Object.values(DROP_LOOK)) for (let d = 0.5; d < 400 * BU; d *= 1.3) {
      const w = Math.max(RAIN_MIN_WIDTH_MM, look.diameterMm * RAIN_WIDTH_PER_DIAMETER);
      expect(projectedWidthPx(w, d, v)).toBeLessThanOrEqual(0.004 * v.widthPx);
      expect(streakLengthMm(look.streakMm, d, v) / pixelMm(d, v)).toBeLessThanOrEqual(RAIN_MAX_LEN_FRAC * v.heightPx + 1e-6);
    }
  });

  it('the near fade band starts beyond the crevice camera (1.8 BU) and ends before the far fade starts', () => {
    expect(RAIN_FADE_NEAR_BU[0]).toBeGreaterThan(1.8);
    expect(RAIN_FADE_NEAR_BU[1]).toBeLessThan(RAIN_FADE_FAR_BU[0]);
    expect(depthFade(1.8 * BU, BU)).toBe(0);
    // per-drop variation never makes a drop invisible in the working band
    expect(RAIN_PER_DROP_MIN).toBeGreaterThan(0);
  });
});
