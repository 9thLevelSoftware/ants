// Reviewer's checks of the look-pass 2 night look (constants.ts NIGHT_LOOK, timeOfDay.ts computeLighting).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { NIGHT_LOOK } from './constants';
import { computeLighting, groundDisplayLuma, type LightingInput } from './timeOfDay';

function input(elev: number, over: Partial<LightingInput> = {}): LightingInput {
  const e = (elev * Math.PI) / 180;
  return {
    sunDir: new Vector3(0, Math.sin(e), Math.cos(e)), sunElevDeg: elev, moonDir: new Vector3(0, 0.62, -0.78).normalize(), moonIllum: 0.8,
    weather: 'clear', cloud: 0.1, fog: 0, zone: 'lawn', bu: 4, under: 0, hazeScale: 1, ...over,
  };
}
const ALBEDO = 0.04;

describe('night look (reviewer)', () => {
  // FAILS on the reviewed code. GDD 08 11.4: storm = "rain look + sky darkening (exposure -0.7 EV)". By day the
  // storm keeps its -0.7 EV (WEATHER_LOOK.storm.meterSunMult). At night the metering (nightExposureEV) replaces the
  // weather EV and neither the moon key nor the fill uses the weather's sunMult, so a night storm is exactly as bright
  // as night rain (both 0.127 in this model) - the GDD's storm darkening is lost at night, and the departure is not
  // recorded in constants.ts or the report.
  it('a night storm stays darker than night rain (GDD 08 11.4, -0.7 EV)', () => {
    const rain = computeLighting(input(-30, { weather: 'rain', cloud: 1 }));
    const storm = computeLighting(input(-30, { weather: 'storm', cloud: 1 }));
    expect(storm.exposureEV).toBeLessThan(rain.exposureEV - 0.5);
    expect(groundDisplayLuma(storm, ALBEDO)).toBeLessThan(groundDisplayLuma(rain, ALBEDO));
  });

  it('the dusk blend has no exposure step larger than 0.3 EV per quarter degree of sun elevation', () => {
    let prev = computeLighting(input(8)).exposureEV;
    for (let e = 7.75; e >= -12; e -= 0.25) {
      const ev = computeLighting(input(e)).exposureEV;
      expect(Math.abs(ev - prev), `elev ${e}`).toBeLessThan(0.3);
      prev = ev;
    }
  });

  it('night exposure stays inside the floor and cap for extreme and broken inputs', () => {
    for (const over of [{ moonIllum: 0, cloud: 1 }, { moonIllum: 1, cloud: 0 }, { moonIllum: 5, cloud: -1 }, { moonIllum: 0, cloud: 1, weather: 'storm' as const }]) {
      const l = computeLighting(input(-40, over));
      expect(Number.isFinite(l.exposureEV)).toBe(true);
      expect(l.exposureEV).toBeGreaterThanOrEqual(NIGHT_LOOK.minEV - 1e-9);
      expect(l.exposureEV).toBeLessThanOrEqual(NIGHT_LOOK.maxEV + 1e-9);
    }
  });

  it('underground at night uses the underground exposure, not the night metering', () => {
    const l = computeLighting(input(-30, { under: 1 }));
    expect(l.exposureEV).toBeCloseTo(1.7, 6);
    expect(l.nightW).toBe(1);
  });

  it('the night look is cool and desaturated in every weather', () => {
    for (const weather of ['clear', 'overcast', 'rain', 'storm', 'frost'] as const) {
      const l = computeLighting(input(-30, { weather, cloud: weather === 'clear' || weather === 'frost' ? 0.1 : 1 }));
      expect(l.hemiSky.b, weather).toBeGreaterThan(l.hemiSky.r);
      expect(l.saturation, weather).toBeLessThan(0.8);
    }
  });
});
