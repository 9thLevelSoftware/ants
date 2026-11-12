// Sun, moon and light (GDD 06 §1.4): sun direction for rendering and rules, insolation, ambient light level.
// All functions are allocation-free (results go into scalars or an `out` vector).

import type { Vec3 } from '@/core/math/vec3';
import type { Sim } from '@/sim/types';
import {
  BURIAL_LIGHT_E_FOLD_MM, MOONLESS_CLOUD_MAX, MOONLESS_ILLUM_MAX, MOONLIGHT_BASE, MOONLIGHT_CLOUD_CUT, MOONLIGHT_ILLUM,
  PEAK_SOLAR_MAX, PEAK_SOLAR_MIN, SHADE_LIGHT_CUT, SUN_NADIR_DEG, SUN_NOON_ELEV_MAX_DEG, SUN_NOON_ELEV_MIN_DEG, WEATHER_DEFS,
} from '@/sim/balance';
import { byteAt } from '@/sim/world/terrainSample';
import { calendarNow, peakSolarOf, sunElevOf } from './calendar';

const DEG = Math.PI / 180;

/** Direct-sun strength 0..1 (GDD 06 §1.4 `insolation`): sun height * seasonal sun height * weather sun multiplier. */
export function insolation(sim: Sim): number {
  const cal = calendarNow(sim);
  return sunElevOf(cal.hour, cal.sunrise, cal.dayLength) * peakSolarOf(cal.dayLength) * WEATHER_DEFS[sim.state.env.weather.state].sunMult;
}

/** Moonlight 0.04..0.10, dimmed by cloud (GDD 06 §1.4). */
export function moonlight(sim: Sim): number {
  const cal = calendarNow(sim);
  return (MOONLIGHT_BASE + MOONLIGHT_ILLUM * cal.moonIllum) * (1 - MOONLIGHT_CLOUD_CUT * sim.state.env.weather.cloud);
}

/** `light` of GDD 06 §1.4 at open sky: max(daylight * cloudAtten, moonlight), 0..1. */
export function skyLight(sim: Sim): number {
  const cal = calendarNow(sim);
  const day = cal.daylight * WEATHER_DEFS[sim.state.env.weather.state].cloudAtten;
  const moon = moonlight(sim);
  return day > moon ? day : moon;
}

/** No moon and not too cloudy (Atta nuptial flights, GDD 06 §1.4). */
export function isMoonless(sim: Sim): boolean {
  return calendarNow(sim).moonIllum < MOONLESS_ILLUM_MAX && sim.state.env.weather.cloud < MOONLESS_CLOUD_MAX;
}

/**
 * Light level at p, 0 (dark) .. 1 (full daylight), including map shade and burial under ground. Without p it is
 * the open-sky level (`skyLight`).
 */
export function lightLevel(sim: Sim, p?: Vec3): number {
  const sky = skyLight(sim);
  if (!p) return sky;
  const w = sim.world;
  const shade = byteAt(w.maps.shade, p.x, p.z) / 255;
  const day = sky * (1 - SHADE_LIGHT_CUT * shade);
  const depth = sim.field.height(p.x, p.z) - p.y;
  if (depth <= 0) return day;
  return day * Math.exp(-depth / BURIAL_LIGHT_E_FOLD_MM);
}

/**
 * Unit direction TOWARDS the sun into out; y < 0 below the horizon. Axes: X east, Z south, Y up (the sun rises in
 * +X, is highest in +Z at noon, sets in -X). A simple circular path: the elevation follows the sun height curve with a
 * seasonal noon elevation of 20..66 degrees; at night the sun runs below the horizon through the north.
 */
export function sunDirection(sim: Sim, out: Vec3): Vec3 {
  const cal = calendarNow(sim);
  const hour = cal.hour;
  const peak01 = (peakSolarOf(cal.dayLength) - PEAK_SOLAR_MIN) / (PEAK_SOLAR_MAX - PEAK_SOLAR_MIN);
  const noonElev = (SUN_NOON_ELEV_MIN_DEG + (SUN_NOON_ELEV_MAX_DEG - SUN_NOON_ELEV_MIN_DEG) * peak01) * DEG;
  if (hour >= cal.sunrise && hour <= cal.sunset) {
    const phi = (Math.PI * (hour - cal.sunrise)) / cal.dayLength;
    const sinEl = Math.sin(noonElev) * Math.sin(phi);
    const cosEl = Math.sqrt(1 - sinEl * sinEl);
    out.x = cosEl * Math.cos(phi);
    out.y = sinEl;
    out.z = cosEl * Math.sin(phi);
    return out;
  }
  const nightLen = 24 - cal.dayLength;
  const since = hour > cal.sunset ? hour - cal.sunset : hour + 24 - cal.sunset;
  const phi = (Math.PI * since) / nightLen;
  const sinEl = -Math.sin(SUN_NADIR_DEG * DEG) * Math.sin(phi);
  const cosEl = Math.sqrt(1 - sinEl * sinEl);
  out.x = -cosEl * Math.cos(phi);
  out.y = sinEl;
  out.z = -cosEl * Math.sin(phi);
  return out;
}
