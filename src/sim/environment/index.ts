// Environment API: calendar, time controls, weather, temperatures, light, moisture, human events.
// STUB written by F1b/F1c with final signatures. Owners: env-core (calendar, time controls, temperature, weather,
// light), weather-effects (effects, moisture, flooding), human-events (environment/human). Until they land the T1
// degraded constants apply (GDD 06 §0).

import type { Vec3 } from '@/core/math/vec3';
import type {
  CalendarDerived, ColonySpeciesId, CommandHandlerMap, DayPhase, Sim, SimState, SpeedLevel, System, ThermalInputs,
} from '@/sim/types';
import { isSpeedLevel } from '@/sim/types';
import {
  DAY_LENGTH_AMP_H, DAY_LENGTH_MEAN_H, DEGRADED_AIR_C, DEGRADED_RH, DEGRADED_SOIL_C, DEGRADED_SURFACE_ACTIVITY,
  ENV_FAST_EVERY, ENV_MOISTURE_EVERY, ENV_MOISTURE_OFFSET, MIDDAY_HALF_H, OPENING_MAX_SPEED, POSSESS_MAX_SPEED,
  TWILIGHT_HALF_H, WEEKEND_FROM,
} from '@/sim/balance';
import {
  calendarTick, dayOf, dayOfSeason, dayOfYear, hourOf, seasonOf, weekdayOf, yearFraction, yearOf,
  type SeasonLengthSource,
} from '@/sim/time';

/** Refreshes the calendar cache and emits time.* events. Stub: env-core. */
export const calendarSystem: System = { name: 'calendar', phase: 'environment', run: () => {} };
/** Weather state machine, wind, dew, temperature fields. Stub: env-core. */
export const weatherSystem: System = { name: 'weather', phase: 'environment', every: ENV_FAST_EVERY, run: () => {} };
/** Human activity schedule, telegraphs, impacts. Stub: human-events. */
export const humanEventsSystem: System = { name: 'human-events', phase: 'environment', run: () => {} };
/** Soil moisture, puddles, flooding inputs, trail washing. Stub: weather-effects. */
export const environmentEffectsSystem: System = {
  name: 'environment-effects', phase: 'environment', every: ENV_MOISTURE_EVERY, offset: ENV_MOISTURE_OFFSET, run: () => {},
};

export const systems: readonly System[] = [calendarSystem, weatherSystem, humanEventsSystem, environmentEffectsSystem];

// ---- calendar (owner: env-core). Derived values are a runtime cache, never persisted (D1.1). ----

/** Day phase from the hour and the day's sunrise/sunset (placeholder light model until env-core). */
function phaseOf(hour: number, sunrise: number, sunset: number): DayPhase {
  if (hour < sunrise - TWILIGHT_HALF_H || hour >= sunset + TWILIGHT_HALF_H) return 'night';
  if (hour < sunrise + TWILIGHT_HALF_H) return 'dawn';
  if (hour >= sunset - TWILIGHT_HALF_H) return 'dusk';
  const mid = (sunrise + sunset) / 2;
  if (hour < mid - MIDDAY_HALF_H) return 'morning';
  return hour < mid + MIDDAY_HALF_H ? 'midday' : 'afternoon';
}

/** Calendar values for a calendar tick (pure). Placeholder day-length model: env-core replaces it per climate. */
export function deriveCalendar(calTick: number, cfg: SeasonLengthSource): CalendarDerived {
  const yf = yearFraction(calTick, cfg);
  const dayLength = DAY_LENGTH_MEAN_H + DAY_LENGTH_AMP_H * Math.sin(2 * Math.PI * yf);
  const sunrise = 12 - dayLength / 2, sunset = 12 + dayLength / 2;
  const hour = hourOf(calTick);
  return {
    dayIndex: dayOf(calTick), year: yearOf(calTick, cfg), doy: dayOfYear(calTick, cfg), season: seasonOf(calTick, cfg),
    dayOfSeason: dayOfSeason(calTick, cfg), hour, yearFrac: yf, sunrise, sunset, dayLength,
    phase: phaseOf(hour, sunrise, sunset), daylight: hour >= sunrise && hour < sunset ? 1 : 0, moonIllum: 0,
    weekday: weekdayOf(calTick),
  };
}

interface CalendarCacheEntry { calTick: number; seasonLen: number; value: Readonly<CalendarDerived> }
const calendarCache = new WeakMap<SimState, CalendarCacheEntry>();

/**
 * Calendar values of the current tick (runtime only). Memoised on the calendar tick (so a change of
 * `env.calendar.startTick` within a tick, e.g. cheat.setTime, is seen at once) and on the season length.
 * The record is shared by every caller: read-only (frozen), copy what you need to keep.
 */
export function calendarNow(sim: { state: SimState }): Readonly<CalendarDerived> {
  const s = sim.state;
  const calTick = calendarTick(s);
  const seasonLen = s.config.rules.seasonLengthDays;
  const hit = calendarCache.get(s);
  if (hit && hit.calTick === calTick && hit.seasonLen === seasonLen) return hit.value;
  const value = Object.freeze(deriveCalendar(calTick, s.config));
  calendarCache.set(s, { calTick, seasonLen, value });
  return value;
}

/** Weekend day (7-day week, game day 1 = weekday 0). */
export function isWeekend(sim: Sim): boolean {
  return weekdayOf(calendarTick(sim.state)) >= WEEKEND_FROM;
}

// ---- temperatures, light, rain (owner: env-core; rain at a point also weather-effects / human-events) ----

/** Air temperature at p, °C. Stub: constant. */
export function airTemp(_sim: Sim, _p: Vec3): number {
  return DEGRADED_AIR_C;
}

/** Surface temperature at p (material, shade), °C. Stub: air temperature. */
export function surfaceTemp(sim: Sim, p: Vec3): number {
  return airTemp(sim, p);
}

/** Soil temperature at p (depth damping), °C. Stub: constant. */
export function soilTemp(_sim: Sim, _p: Vec3): number {
  return DEGRADED_SOIL_C;
}

/**
 * Chamber temperature, °C: the GDD 03 §9.1 thermal-column value at the chamber centre, built from
 * `thermalInputs` (D7.2). Stub: soil constant (env-core / nestops).
 */
export function chamberTemp(_sim: Sim, _chamberId: number): number {
  return DEGRADED_SOIL_C;
}

/**
 * Inputs of the GDD 03 §9.1 thermal column at ground position p (D7.2, GDD 06 §2.5), written into `out`.
 * Stub (T1 constants of GDD 06 §0.2): surface and day mean = air, season and annual mean = soil. Owner: env-core.
 */
export function thermalInputs(sim: Sim, p: Vec3, out: ThermalInputs = newThermalInputs()): ThermalInputs {
  out.T_top = surfaceTemp(sim, p);
  out.T_dayMean = out.T_top;
  out.T_seasonMean = DEGRADED_SOIL_C;
  out.T_annual = DEGRADED_SOIL_C;
  return out;
}

export function newThermalInputs(): ThermalInputs {
  return { T_top: 0, T_dayMean: 0, T_seasonMean: 0, T_annual: 0 };
}

/**
 * Entrance inflow intensity `I` at p, 0..1 (GDD 03 §11; balance RAIN_INTENSITY by class, storm 1.0, sprinkler or
 * hose 0.5, indoors 0; D7.2). Stub: 0 (no rain). Owners: env-core (weather), human-events (sprinklers).
 */
export function rainIntensityAt(_sim: Sim, _p: Vec3): number {
  return 0;
}

/** Relative humidity at p, 0..1. Stub: constant. */
export function relHumidity(_sim: Sim, _p: Vec3): number {
  return DEGRADED_RH;
}

/** Speed multiplier from body temperature (GDD 06 §2.6 curve, = GDD 01 tempFactor). Stub: 1. */
export function speedMult(_sim: Sim, _tb: number, _species: ColonySpeciesId): number {
  return 1;
}

/** Light level at p, 0 (dark) .. 1 (full daylight), including shade and burial. Stub: daylight of the hour. */
export function lightLevel(sim: Sim, _p: Vec3): number {
  return calendarNow(sim).daylight;
}

/** Unit direction TOWARDS the sun into out (y < 0 below the horizon); returns out. Stub: straight up. */
export function sunDirection(_sim: Sim, out: Vec3): Vec3 {
  out.x = 0; out.y = 1; out.z = 0;
  return out;
}

/** Whether it is raining (at p when given; sprinklers count). Stub: false. */
export function isRaining(_sim: Sim, _p?: Vec3): boolean {
  return false;
}

/** Local rain rate at p, mm/h (sprinklers included). Stub: 0. */
export function rainRate(_sim: Sim, _p: Vec3): number {
  return 0;
}

/** Willingness of the species to be active on the surface now, 0..1. Stub: 1. */
export function surfaceActivity(_sim: Sim, _species: ColonySpeciesId): number {
  return DEGRADED_SURFACE_ACTIVITY;
}

/** No overhead cover within 3 BU. Stub: false (weather-effects). */
export function isExposed(_sim: Sim, _p: Vec3): boolean {
  return false;
}

// ---- time controls (owner: env-core; ruling 6: sim state written by commands, read by the game loop) ----

/** Opening phases in which time runs at most OPENING_MAX_SPEED (GDD 06 §4, E-17). */
const SLOW_OPENING_PHASES = new Set(['search', 'dig', 'seal', 'lay']);

function setSpeed(sim: Sim, speed: SpeedLevel): void {
  const time = sim.state.env.time;
  // Commands arrive as untyped JSON from the debug API: anything but 0/1/2/4/8 is refused and changes nothing.
  if (!isSpeedLevel(speed)) {
    return sim.emit({ type: 'command-rejected', commandType: 'setSpeed', reason: 'invalid-speed', detail: String(speed) });
  }
  const from: SpeedLevel = time.paused ? 0 : time.speed;
  if (speed > POSSESS_MAX_SPEED && sim.state.player.possessedAntId !== -1) {
    return sim.emit({ type: 'speed-refused', speed, reason: 'possession' });
  }
  const phase = sim.state.player.opening?.phase;
  if (speed > OPENING_MAX_SPEED && phase !== undefined && SLOW_OPENING_PHASES.has(phase)) {
    return sim.emit({ type: 'speed-refused', speed, reason: 'opening' });
  }
  if (speed === 0) {
    time.paused = true;
  } else {
    time.paused = false;
    time.speed = speed;
    time.requested = speed;
  }
  if (from !== speed) sim.emit({ type: 'time.speed-changed', from, to: speed, reason: 'command' });
}

export const commandHandlers: Partial<CommandHandlerMap> = {
  setSpeed: (sim, c) => setSpeed(sim, c.speed),
  togglePause: (sim) => setSpeed(sim, sim.state.env.time.paused ? sim.state.env.time.speed : 0),
  setAutoSlow: (sim, c) => {
    sim.state.env.time.autoSlow = c.mode;
  },
  skipToNextEvent: () => {}, // owner: env-core (the game loop executes it; target tick in env.time.skipUntil)
  'cheat.setTime': () => {}, // owner: env-core
  'cheat.setWeather': () => {}, // owner: env-core
  'cheat.setWind': () => {}, // owner: env-core
  'cheat.setAnomaly': () => {}, // owner: env-core
  'cheat.noLag': () => {}, // owner: env-core (thermal lag)
  'cheat.setSoilMoisture': () => {}, // owner: weather-effects
  'cheat.setRain': () => {}, // owner: weather-effects
  'cheat.setDrainScale': () => {}, // owner: weather-effects
  'cheat.setWater': () => {}, // owner: weather-effects
  'cheat.humanEvent': () => {}, // owner: human-events
  'cheat.setGrass': () => {}, // owner: human-events
};
