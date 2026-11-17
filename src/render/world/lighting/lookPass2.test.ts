// Look pass 2, work item 1: night is readable. The numeric rules (moonlit sky fill, exposure metering with a floor
// and a cap, soft moon shadows) live in constants.ts NIGHT_LOOK; the real measurements are tests/e2e/lib/look2.mjs.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { NIGHT_LOOK, SUN_INTENSITY } from './constants';
import { computeLighting, groundDisplayLuma, groundIrradiance, nightExposureEV, nightWeight, type LightingInput } from './timeOfDay';

function input(elev: number, over: Partial<LightingInput> = {}): LightingInput {
  const e = (elev * Math.PI) / 180;
  return {
    sunDir: new Vector3(0, Math.sin(e), Math.cos(e)), sunElevDeg: elev, moonDir: new Vector3(0, 0.62, -0.78).normalize(), moonIllum: 0.8,
    weather: 'clear', cloud: 0.1, fog: 0, zone: 'lawn', bu: 4, under: 0, hazeScale: 1, ...over,
  };
}
/**
 * Effective linear albedo that makes the NIGHT model agree with the game: measured in the real frames (tests/e2e/lib/
 * look2.mjs, quality high, seed 1, ground within 20 body lengths, n = 140 samples) clear night 0.18, night rain 0.17;
 * the model gives 0.184 for both at this albedo. The model is a night model only: by day and dusk the ground is also lit
 * by the sky environment map, which the model leaves out (noon: model 0.22, game 0.31). The 12..25 % test below pins the
 * model; the evidence for the acceptance target is the screenshots' numbers.
 */
const GROUND_ALBEDO = 0.06;
/**
 * Look pass 3: the night is darker and cooler than look pass 2 left it (it read as an overcast day: saturated grass, a
 * mid-blue sky, ground 0.164). Measured in the game (tests/e2e/look3.mjs, same pose, quality high, seed 1): clear night
 * ground 0.164 -> 0.111, night rain 0.160 -> 0.103, frame median 0.207 -> 0.149 (at targetE 1.7); the model gives 0.147 at GROUND_ALBEDO for targetE 1.9.
 * The exposure pins follow from targetE 2.45 -> 1.9 and minEV 2.6 -> 2.3 (1.7 / 2.2 first; lifted a little after the founding night picture showed a fresh mound at 02:49 under cloud almost black).
 */
const EV_CLEAR = 3.051, EV_RAIN = 3.226;
const noon0 = () => input(60);
const night = (over: Partial<LightingInput> = {}) => computeLighting(input(-30, over));

describe('night weight', () => {
  it('is 0 by day, 1 deep into the night, and rises monotonically through the dusk', () => {
    expect(nightWeight(30)).toBe(0);
    expect(nightWeight(NIGHT_LOOK.nightFromDeg)).toBe(0);
    expect(nightWeight(NIGHT_LOOK.nightToDeg)).toBe(1);
    expect(nightWeight(-40)).toBe(1);
    let prev = -1;
    for (let e = 10; e >= -10; e -= 0.5) { const w = nightWeight(e); expect(w).toBeGreaterThanOrEqual(prev); prev = w; }
  });
});

describe('night exposure metering', () => {
  it('stays inside [minEV, maxEV] whatever the moon does (the floor and the cap)', () => {
    for (const cloud of [0, 0.5, 1]) for (const illum of [0, 0.3, 1]) {
      for (const weather of ['clear', 'overcast', 'rain', 'storm'] as const) {
        const ev = night({ cloud, moonIllum: illum, weather }).exposureEV;
        expect(ev).toBeGreaterThanOrEqual(NIGHT_LOOK.minEV - 1e-9);
        expect(ev).toBeLessThanOrEqual(NIGHT_LOOK.maxEV + 1e-9);
      }
    }
  });
  it('a darker night is exposed longer: new moon under cloud > full moon, clear', () => {
    const bright = night({ moonIllum: 1, cloud: 0 }).exposureEV;
    const dark = night({ moonIllum: 0, cloud: 1, weather: 'overcast' }).exposureEV;
    expect(dark).toBeGreaterThan(bright);
  });
  it('replaces the GDD column and the weather EV at night (rain does not add 0.4 on top)', () => {
    const l = night({ weather: 'rain', cloud: 0.9 });
    expect(l.exposureEV).toBeCloseTo(nightExposureEV(l), 9);
  });
  it('pins the clear-night exposure the measurements were tuned at (full dusk blend done, moon 0.8, cloud 0.1)', () => {
    expect(night().exposureEV).toBeCloseTo(EV_CLEAR, 2);
    expect(night({ weather: 'rain', cloud: 1 }).exposureEV).toBeCloseTo(EV_RAIN, 2);
  });
  it('a night storm keeps its -0.7 EV against night rain (GDD 08 11.4), inside the floor', () => {
    const rain = night({ weather: 'rain', cloud: 1 }), storm = night({ weather: 'storm', cloud: 1 });
    expect(storm.exposureEV).toBeCloseTo(rain.exposureEV - 0.7, 6);
    expect(storm.exposureEV).toBeGreaterThanOrEqual(NIGHT_LOOK.minEV);
  });
});

describe('night looks like night, and is readable', () => {
  it('the ground shows 9..17 % display luminance in clear, overcast and rain, full moon to new moon (look pass 3: dark, still readable)', () => {
    const cases: Partial<LightingInput>[] = [
      { weather: 'clear', cloud: 0.1, moonIllum: 1 }, { weather: 'clear', cloud: 0.1, moonIllum: 0.5 },
      { weather: 'overcast', cloud: 0.9, moonIllum: 0.8 }, { weather: 'rain', cloud: 1, moonIllum: 0.8 }, { weather: 'rain', cloud: 1, moonIllum: 0.2 },
    ];
    for (const c of cases) {
      const luma = groundDisplayLuma(night(c), GROUND_ALBEDO);
      expect(luma, JSON.stringify(c)).toBeGreaterThanOrEqual(0.09);
      expect(luma, JSON.stringify(c)).toBeLessThanOrEqual(0.17);
    }
  });
  it('never reads as day: far darker than a clear noon and cool (blue over red in the key and in the fill)', () => {
    const noon = computeLighting(input(60));
    const l = night();
    expect(groundDisplayLuma(l, GROUND_ALBEDO)).toBeLessThan(0.9 * groundDisplayLuma(noon, GROUND_ALBEDO)); // measured in game: night 0.18 vs noon 0.31
    // the scene-referred light (what the exposure then lifts) is more than 10x below noon's: the camera, not the light, makes it readable
    expect(groundIrradiance(l)).toBeLessThan(0.1 * groundIrradiance(noon));
    expect(l.keyColor.b).toBeGreaterThan(l.keyColor.r);
    expect(l.hemiSky.b).toBeGreaterThan(l.hemiSky.r * 1.3);
    expect(l.saturation).toBeLessThan(0.6); // look pass 3: low saturation, leaves must not stay daylight-green
    expect(l.envIntensity).toBeLessThan(0.5 * computeLighting(noon0()).envIntensity); // the sky reflection is not lifted with the exposure
    expect(l.keyIntensity).toBeLessThan(0.1 * SUN_INTENSITY);
  });
  it('the moon key is soft (wide penumbra) and not removed by cloud', () => {
    expect(night().penumbra).toBeGreaterThanOrEqual(NIGHT_LOOK.penumbra);
    const clear = night({ cloud: 0 }).keyIntensity, cloudy = night({ cloud: 1, weather: 'overcast' }).keyIntensity;
    expect(cloudy / clear).toBeCloseTo(NIGHT_LOOK.cloudKeep, 3);
  });
  it('fades in through the dusk without jumps: the exposure and the fill change by small steps', () => {
    let prev = computeLighting(input(10));
    for (let e = 9.5; e >= -10; e -= 0.5) {
      const l = computeLighting(input(e));
      expect(Math.abs(l.exposureEV - prev.exposureEV), `elev ${e}`).toBeLessThan(0.6); // per half degree of sun elevation
      expect(Math.abs(l.hemiIntensity - prev.hemiIntensity), `elev ${e}`).toBeLessThan(0.25);
      prev = l;
    }
  });
});
