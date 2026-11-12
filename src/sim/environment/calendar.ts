// Calendar values derived from the calendar tick (GDD 06 §1): day length, sunrise/sunset, day phases, moon, plus
// year-fraction helpers for windows written in default-year day numbers. Pure; the derived record is a runtime cache.

import type { CalendarDerived, DayPhase, Sim, SimState, System } from '@/sim/types';
import {
  DAY_LENGTH_AMP_H, DAY_LENGTH_MEAN_H, MOON_PERIOD_DAYS, PEAK_SOLAR_L_MIN_H, PEAK_SOLAR_L_SPAN_H, PEAK_SOLAR_MAX,
  PEAK_SOLAR_MIN, PHASE_MIDDAY_END_H, PHASE_MIDDAY_START_H, REFERENCE_DAYS_PER_YEAR, TWILIGHT_HALF_H, WEEKEND_FROM,
} from '@/sim/balance';
import { smoothstep } from '@/core/math/scalar';
import {
  calendarTick, dayOf, dayOfSeason, dayOfYear, hourOf, seasonIndexOf, seasonOf, TICKS_PER_DAY, TICKS_PER_HOUR,
  weekdayOf, yearFraction, yearOf, type SeasonLengthSource,
} from '@/sim/time';

/** Day length in hours at a year fraction (GDD 06 §1.3; one curve for all climates, deviation D1). */
export function dayLengthH(yearFrac: number): number {
  return DAY_LENGTH_MEAN_H + DAY_LENGTH_AMP_H * Math.sin(2 * Math.PI * yearFrac);
}

/** Seasonal sun height `peakSolar` 0.25 (midwinter) .. 1.0 (midsummer) from the day length. */
export function peakSolarOf(dayLength: number): number {
  return PEAK_SOLAR_MIN + ((PEAK_SOLAR_MAX - PEAK_SOLAR_MIN) * (dayLength - PEAK_SOLAR_L_MIN_H)) / PEAK_SOLAR_L_SPAN_H;
}

/** Day phase from the hour and the day's sunrise/sunset (GDD 06 §1.3 table). */
export function phaseOf(hour: number, sunrise: number, sunset: number): DayPhase {
  if (hour < sunrise - TWILIGHT_HALF_H || hour >= sunset + TWILIGHT_HALF_H) return 'night';
  if (hour < sunrise + TWILIGHT_HALF_H) return 'dawn';
  if (hour >= sunset - TWILIGHT_HALF_H) return 'dusk';
  if (hour < PHASE_MIDDAY_START_H) return 'morning';
  return hour < PHASE_MIDDAY_END_H ? 'midday' : 'afternoon';
}

/** Moon phase 0..1 (0 = new moon) at a calendar tick. */
export function moonPhaseOf(calTick: number, moonPhase0: number): number {
  const p = calTick / (MOON_PERIOD_DAYS * TICKS_PER_DAY) + moonPhase0;
  return p - Math.floor(p);
}

/** Moon illumination 0..1 from the phase. */
export function moonIllumOf(moonPhase: number): number {
  return 0.5 * (1 - Math.cos(2 * Math.PI * moonPhase));
}

/** Sun height factor 0..1 at an hour (GDD 06 §1.4 `sunElev`): a half sine between sunrise and sunset. */
export function sunElevOf(hour: number, sunrise: number, dayLength: number): number {
  if (hour < sunrise || hour > sunrise + dayLength) return 0;
  return Math.max(0, Math.sin((Math.PI * (hour - sunrise)) / dayLength));
}

/** Ambient brightness before cloud (GDD 06 §1.4 `daylight`). */
export function daylightOf(hour: number, sunrise: number, sunset: number): number {
  return smoothstep(sunrise - TWILIGHT_HALF_H, sunrise + TWILIGHT_HALF_H, hour)
    * (1 - smoothstep(sunset - TWILIGHT_HALF_H, sunset + TWILIGHT_HALF_H, hour));
}

function newDerived(): CalendarDerived {
  return {
    dayIndex: 0, year: 1, doy: 1, season: 'spring', dayOfSeason: 1, hour: 0, yearFrac: 0, sunrise: 6, sunset: 18,
    dayLength: 12, phase: 'night', daylight: 0, moonIllum: 0, weekday: 0,
  };
}

/** Fills `out` (a new record when omitted) with the calendar values of a calendar tick (pure). */
export function deriveCalendar(
  calTick: number, cfg: SeasonLengthSource, moonPhase0 = 0, out: CalendarDerived = newDerived(),
): CalendarDerived {
  const yf = yearFraction(calTick, cfg);
  const dayLength = dayLengthH(yf);
  const sunrise = 12 - dayLength / 2, sunset = 12 + dayLength / 2;
  const hour = hourOf(calTick);
  out.dayIndex = dayOf(calTick);
  out.year = yearOf(calTick, cfg);
  out.doy = dayOfYear(calTick, cfg);
  out.season = seasonOf(calTick, cfg);
  out.dayOfSeason = dayOfSeason(calTick, cfg);
  out.hour = hour;
  out.yearFrac = yf;
  out.sunrise = sunrise;
  out.sunset = sunset;
  out.dayLength = dayLength;
  out.phase = phaseOf(hour, sunrise, sunset);
  out.daylight = daylightOf(hour, sunrise, sunset);
  out.moonIllum = moonIllumOf(moonPhaseOf(calTick, moonPhase0));
  out.weekday = weekdayOf(calTick);
  return out;
}

interface CacheEntry { calTick: number; moon0: number; seasonLen: number; value: CalendarDerived }
const cache = new WeakMap<SimState, CacheEntry>();

/**
 * Calendar values of the current tick, memoised per calendar tick. The returned record is reused and overwritten
 * when the tick changes: read it, do not keep it across ticks (copy the fields you need).
 */
export function calendarNow(sim: { state: SimState }): CalendarDerived {
  const s = sim.state;
  const ct = calendarTick(s);
  const moon0 = s.env.calendar.moonPhase0;
  const len = s.config.rules.seasonLengthDays;
  let hit = cache.get(s);
  if (hit && hit.calTick === ct && hit.moon0 === moon0 && hit.seasonLen === len) return hit.value;
  if (!hit) {
    hit = { calTick: ct, moon0, seasonLen: len, value: newDerived() };
    cache.set(s, hit);
  }
  hit.calTick = ct;
  hit.moon0 = moon0;
  hit.seasonLen = len;
  return deriveCalendar(ct, s.config, moon0, hit.value);
}

/** Weekend day (7-day week, game day 1 = weekday 0). */
export function isWeekend(sim: Sim): boolean {
  return weekdayOf(calendarTick(sim.state)) >= WEEKEND_FROM;
}

// ---- default-year windows (directions §K "calendar windows", GDD 06 §1.7, 00-index C1/D7.1) ----

/** Day of the default 28-day year, 0-based fractional (`d28`), at a calendar tick: scaled by the year fraction. */
export function defaultYearDayOf(calTick: number, cfg: SeasonLengthSource): number {
  return yearFraction(calTick, cfg) * REFERENCE_DAYS_PER_YEAR;
}

/** Day of the default year, 1-based integer (`doy28`). */
export function defaultYearDoyOf(calTick: number, cfg: SeasonLengthSource): number {
  return Math.floor(defaultYearDayOf(calTick, cfg)) + 1;
}

/** True while the default-year window `doy a..b` (inclusive) holds: `a - 1 <= d28 < b`. */
export function inDefaultWindow(calTick: number, cfg: SeasonLengthSource, doyFrom: number, doyTo: number): boolean {
  const d = defaultYearDayOf(calTick, cfg);
  return d >= doyFrom - 1 && d < doyTo;
}

/** Default-year window of the current tick of a sim. */
export function inWindow(sim: { state: SimState }, doyFrom: number, doyTo: number): boolean {
  return inDefaultWindow(calendarTick(sim.state), sim.state.config, doyFrom, doyTo);
}

/** Calendar tick at which the next season starts after `calTick`. */
export function nextSeasonStartTick(calTick: number, cfg: SeasonLengthSource): number {
  const len = typeof cfg === 'number' ? cfg : cfg.rules.seasonLengthDays;
  const daysLeft = len - ((dayOfYear(calTick, cfg) - 1) % len);
  return (dayOf(calTick) + daysLeft) * TICKS_PER_DAY;
}

// ---- events ----

const prevScratch = newDerived();

/** Refreshes the calendar cache and emits time.* events (stateless: compares this tick with the previous one). */
export const calendarSystem: System = {
  name: 'calendar',
  phase: 'environment',
  run(sim) {
    const s = sim.state;
    const ct = calendarTick(s);
    const now = calendarNow(sim);
    const prev = deriveCalendar(ct - 1, s.config, s.env.calendar.moonPhase0, prevScratch);
    if (ct % TICKS_PER_HOUR === 0) sim.emit({ type: 'time.hour', hour: Math.floor(now.hour) });
    if (ct % TICKS_PER_DAY === 0) {
      sim.emit({ type: 'time.day', dayIndex: now.dayIndex, doy: now.doy, weekday: now.weekday, isWeekend: now.weekday >= WEEKEND_FROM });
    }
    if (seasonIndexOf(ct - 1, s.config) !== seasonIndexOf(ct, s.config)) sim.emit({ type: 'time.season', season: now.season, year: now.year });
    if (prev.year !== now.year) sim.emit({ type: 'time.year', year: now.year });
    if (prev.phase !== now.phase) sim.emit({ type: 'time.phase', phase: now.phase });
  },
};
