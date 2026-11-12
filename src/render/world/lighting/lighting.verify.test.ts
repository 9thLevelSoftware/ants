// Adversarial checks of the light model against GDD 08 11.2-11.5 (reviewer tests).
import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { WeatherState } from '@/sim/types';
import { HAZE_VIS_BU, WEATHER_LOOK } from './constants';
import { snapShadowCenter } from './shadowSnap';
import { computeLighting, type LightingInput } from './timeOfDay';

function input(elev: number, over: Partial<LightingInput> = {}): LightingInput {
  const e = (elev * Math.PI) / 180;
  return {
    sunDir: new Vector3(0, Math.sin(e), Math.cos(e)), sunElevDeg: elev, moonDir: new Vector3(0, 0.6, -0.8), moonIllum: 1,
    weather: 'clear', cloud: 0.1, fog: 0, zone: 'lawn', bu: 4, under: 0, hazeScale: 1, ...over,
  };
}

describe('GDD 08 11.4 weather looks', () => {
  it('overcast haze is +20 % denser than clear (not +44 %)', () => {
    const clear = computeLighting(input(50));
    const ov = computeLighting(input(50, { weather: 'overcast', cloud: 0.9 }));
    // BUG: WEATHER_LOOK.overcast.hazeMult (1.2) and the cloud-cover term (1 + 0.2 * overcast) are both applied,
    // although sunMult avoids exactly this double count with `cloudy = 0` for weather states with their own look
    expect(ov.fogDensity / clear.fogDensity).toBeCloseTo(1.2, 2);
  });

  it('a cloudy "clear" sky never gets denser haze than the overcast state itself', () => {
    const cloudyClear = computeLighting(input(50, { cloud: 0.95 }));
    const ov = computeLighting(input(50, { weather: 'overcast', cloud: 0.95 }));
    expect(cloudyClear.fogDensity).toBeLessThanOrEqual(ov.fogDensity + 1e-12);
  });

  it('storm = rain look with the sky 0.7 EV darker', () => {
    const rain = computeLighting(input(50, { weather: 'rain', cloud: 1 }));
    const storm = computeLighting(input(50, { weather: 'storm', cloud: 1 }));
    // BUG (spec): storm exposure is 0.94 EV vs rain 1.12 EV (only -0.18 EV); the auto-exposure also re-brightens the
    // dimmer storm key light, so the storm frame ends up barely darker than rain
    expect(storm.exposureEV).toBeLessThanOrEqual(rain.exposureEV - 0.7 + 0.05);
  });

  it('every weather state has a look and produces finite lighting at day and night', () => {
    for (const w of Object.keys(WEATHER_LOOK) as WeatherState[]) {
      for (const elev of [60, 5, -1, -20]) {
        const l = computeLighting(input(elev, { weather: w, cloud: 1, fog: 1 }));
        for (const v of [l.keyIntensity, l.hemiIntensity, l.fogDensity, l.exposureEV, l.envIntensity]) expect(Number.isFinite(v)).toBe(true);
        expect(l.keyDir.y).toBeGreaterThan(0);
        expect(l.keyIntensity).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

describe('GDD 08 11.3 haze and 11.5 underground', () => {
  it('every habitat has a visibility; the zone the camera is in sets the density', () => {
    for (const z of Object.keys(HAZE_VIS_BU) as (keyof typeof HAZE_VIS_BU)[]) {
      const l = computeLighting(input(50, { zone: z, hazeVisBU: null }));
      expect(l.fogDensity).toBeCloseTo(1 / (HAZE_VIS_BU[z] * 4), 9);
    }
  });

  it('half-way underground blends smoothly (no jump at the switch)', () => {
    let prev = computeLighting(input(50, { under: 0 })).fogDensity;
    for (let u = 0.05; u <= 1.0001; u += 0.05) {
      const d = computeLighting(input(50, { under: u })).fogDensity;
      expect(Math.abs(d - prev)).toBeLessThan(0.0005);
      prev = d;
    }
  });
});

describe('shadow snapping is stable for small camera moves', () => {
  it('sub-texel moves of the focus leave the snapped centre in place or move it by whole texels', () => {
    const toLight = new Vector3(-0.4, 0.5, 0.75).normalize();
    const a = new Vector3(), b = new Vector3();
    const half = 140 * 4, size = 2048, texel = (2 * half) / size;
    snapShadowCenter(new Vector3(6000, 2, 6000), toLight, half, size, a);
    for (let k = 1; k < 20; k++) {
      snapShadowCenter(new Vector3(6000 + k * 0.013, 2, 6000 - k * 0.007), toLight, half, size, b);
      const d = a.distanceTo(b);
      // either the same texel, or an integer number of texels in the light plane (plus a depth shift along the light)
      const lateral = b.clone().sub(a).sub(toLight.clone().multiplyScalar(b.clone().sub(a).dot(toLight)));
      expect(d < 1e-6 || Math.abs(lateral.length() / texel - Math.round(lateral.length() / texel)) < 1e-3 || lateral.length() > texel * 0.99).toBe(true);
    }
  });
});
