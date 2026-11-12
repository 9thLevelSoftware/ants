// Environment API: calendar, weather, temperatures, moisture, human events. STUB written by F1b.
// Owners: env-core (calendar, temperature, weather, system), weather-effects (effects, moisture, flooding),
// human-events (environment/human). Until then the T1 degraded constants apply (GDD 06 §0).

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, SpeciesId, System } from '@/sim/types';
import {
  DEGRADED_AIR_C, DEGRADED_RH, DEGRADED_SOIL_C, DEGRADED_SURFACE_ACTIVITY, ENV_FAST_EVERY, ENV_MOISTURE_EVERY,
  ENV_MOISTURE_OFFSET, WEEKEND_FROM,
} from '@/sim/balance';
import { calendarTick, weekdayOf } from '@/sim/time';

/** Refreshes env.calendar.derived and emits time.* events. Stub: env-core. */
export const calendarSystem: System = { name: 'calendar', run: () => {} };
/** Weather state machine, wind, dew, temperature fields. Stub: env-core. */
export const weatherSystem: System = { name: 'weather', every: ENV_FAST_EVERY, run: () => {} };
/** Human activity schedule, telegraphs, impacts. Stub: human-events. */
export const humanEventsSystem: System = { name: 'human-events', run: () => {} };
/** Soil moisture, puddles, flooding inputs, trail washing. Stub: weather-effects. */
export const environmentEffectsSystem: System = {
  name: 'environment-effects', every: ENV_MOISTURE_EVERY, offset: ENV_MOISTURE_OFFSET, run: () => {},
};

/** Air temperature at p, °C. Stub: constant (env-core). */
export function airTemp(_sim: Sim, _p: Vec3): number {
  return DEGRADED_AIR_C;
}

/** Surface temperature at p (material, shade), °C. Stub: air temperature (env-core). */
export function surfaceTemp(sim: Sim, p: Vec3): number {
  return airTemp(sim, p);
}

/** Soil temperature at p (depth damping), °C. Stub: constant (env-core). */
export function soilTemp(_sim: Sim, _p: Vec3): number {
  return DEGRADED_SOIL_C;
}

/** Chamber temperature, °C. Stub: soil constant (env-core / nestops). */
export function chamberTemp(_sim: Sim, _chamberId: number): number {
  return DEGRADED_SOIL_C;
}

/** Relative humidity at p, 0..1. Stub: constant (env-core). */
export function relHumidity(_sim: Sim, _p: Vec3): number {
  return DEGRADED_RH;
}

/** Willingness of the species to be active on the surface now, 0..1. Stub: 1 (env-core). */
export function surfaceActivity(_sim: Sim, _species: SpeciesId): number {
  return DEGRADED_SURFACE_ACTIVITY;
}

/** Speed multiplier from body temperature (GDD 06 §2.6 curve). Stub: 1 (env-core). */
export function speedMult(_tb: number, _species: SpeciesId): number {
  return 1;
}

/** Local rain rate at p, mm/h (sprinklers included). Stub: 0 (env-core / human-events). */
export function rainRate(_sim: Sim, _p: Vec3): number {
  return 0;
}

/** No overhead cover within 3 BU. Stub: false (weather-effects). */
export function isExposed(_sim: Sim, _p: Vec3): boolean {
  return false;
}

/** Weekend day (7-day week, game day 1 = weekday 0). */
export function isWeekend(sim: Sim): boolean {
  return weekdayOf(calendarTick(sim.state)) >= WEEKEND_FROM;
}
