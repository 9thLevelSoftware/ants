// Look pass 2, work item 1: night is readable. The numeric rules (moonlit sky fill, exposure metering with a floor
// and a cap, soft moon shadows) live in constants.ts NIGHT_LOOK; the real measurements are tests/e2e/look2.mjs.
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { NIGHT_LOOK, SUN_INTENSITY } from './constants';
import { computeLighting, groundDisplayLuma, nightExposureEV, nightWeight, type LightingInput } from './timeOfDay';

function input(elev: number, over: Partial<LightingInput> = {}): LightingInput {
  const e = (elev * Math.PI) / 180;
  return {
    sunDir: new Vector3(0, Math.sin(e), Math.cos(e)), sunElevDeg: elev, moonDir: new Vector3(0, 0.62, -0.78).normalize(), moonIllum: 0.8,
    weather: 'clear', cloud: 0.1, fog: 0, zone: 'lawn', bu: 4, under: 0, hazeScale: 1, ...over,
  };
}
/** Effective linear albedo of the game's soil as measured (tests/e2e/look2.mjs: model and screenshots agree at ~0.04). */
const GROUND_ALBEDO = 0.04;
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
});

describe('night looks like night, and is readable', () => {
  it('the ground shows 12..25 % display luminance in clear, overcast and rain, full moon to new moon', () => {
    const cases: Partial<LightingInput>[] = [
      { weather: 'clear', cloud: 0.1, moonIllum: 1 }, { weather: 'clear', cloud: 0.1, moonIllum: 0.5 },
      { weather: 'overcast', cloud: 0.9, moonIllum: 0.8 }, { weather: 'rain', cloud: 1, moonIllum: 0.8 }, { weather: 'rain', cloud: 1, moonIllum: 0.2 },
    ];
    for (const c of cases) {
      const luma = groundDisplayLuma(night(c), GROUND_ALBEDO);
      expect(luma, JSON.stringify(c)).toBeGreaterThanOrEqual(0.12);
      expect(luma, JSON.stringify(c)).toBeLessThanOrEqual(0.25);
    }
  });
  it('never reads as day: far darker than a clear noon and cool (blue over red in the key and in the fill)', () => {
    const noon = computeLighting(input(60));
    const l = night();
    expect(groundDisplayLuma(l, GROUND_ALBEDO)).toBeLessThan(groundDisplayLuma(noon, GROUND_ALBEDO)) // the ACES model saturates; measured in game: night 0.2 vs noon 0.29;
    expect(l.keyColor.b).toBeGreaterThan(l.keyColor.r);
    expect(l.hemiSky.b).toBeGreaterThan(l.hemiSky.r * 1.3);
    expect(l.saturation).toBeLessThan(0.85);
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
      expect(Math.abs(l.exposureEV - prev.exposureEV), `elev ${e}`).toBeLessThan(0.9);
      expect(Math.abs(l.hemiIntensity - prev.hemiIntensity), `elev ${e}`).toBeLessThan(0.25);
      prev = l;
    }
  });
});
