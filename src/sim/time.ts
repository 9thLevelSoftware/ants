// Time units and calendar helpers (directions §J/§K, GDD 06 §1, 00-index C1 and D1.1-D1.2).
//
// Two tick counts exist: `state.tick` counts from the start of this game; the CALENDAR tick adds
// `env.calendar.startTick` (the start day and hour), so calendar tick 0 is 00:00 on day 1 of spring, year 1.
// Season length is a custom rule (5, 7 or 10 days): every helper that depends on it takes the config (or the
// length itself). Nothing here assumes a season or year length.

import type { Season, SimState } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { DEFAULT_SEASON_LENGTH_DAYS, WEEK_DAYS } from '@/sim/balance';

export const TICKS_PER_SECOND = 10;
export const SECONDS_PER_DAY = 600;
export const HOURS_PER_DAY = 24;
export const TICKS_PER_DAY = TICKS_PER_SECOND * SECONDS_PER_DAY; // 6000
export const TICKS_PER_HOUR = TICKS_PER_DAY / HOURS_PER_DAY; // 250
export const SEASONS_PER_YEAR = SEASONS.length;

/** Where a helper reads the season length from: a GameConfig (or anything with `rules`) or the length itself. */
export type SeasonLengthSource = number | { rules: { seasonLengthDays: number } };

/** Season length in game days of a config (or a plain number). */
export function seasonLengthOf(src: SeasonLengthSource): number {
  return typeof src === 'number' ? src : src.rules.seasonLengthDays;
}

/** Game seconds -> ticks (rounded to an integer). */
export function secondsToTicks(s: number): number {
  return Math.round(s * TICKS_PER_SECOND);
}

/** Game days -> ticks (rounded to an integer). */
export function daysToTicks(d: number): number {
  return Math.round(d * TICKS_PER_DAY);
}

export function daysPerYear(cfg: SeasonLengthSource): number {
  return seasonLengthOf(cfg) * SEASONS_PER_YEAR;
}

export function ticksPerYear(cfg: SeasonLengthSource): number {
  return daysPerYear(cfg) * TICKS_PER_DAY;
}

/** 0-based game day since day 1 of spring, year 1. */
export function dayOf(calTick: number): number {
  return Math.floor(calTick / TICKS_PER_DAY);
}

/** Fraction of the current day elapsed, 0..1 (0 = midnight). */
export function timeOfDay(calTick: number): number {
  const t = calTick % TICKS_PER_DAY;
  return (t < 0 ? t + TICKS_PER_DAY : t) / TICKS_PER_DAY;
}

/** Hour of day 0..24 (fractional). */
export function hourOf(calTick: number): number {
  return timeOfDay(calTick) * HOURS_PER_DAY;
}

/** 1-based year. */
export function yearOf(calTick: number, cfg: SeasonLengthSource): number {
  return Math.floor(dayOf(calTick) / daysPerYear(cfg)) + 1;
}

/** 1-based day of the year (1 .. 4 * season length). */
export function dayOfYear(calTick: number, cfg: SeasonLengthSource): number {
  const n = daysPerYear(cfg);
  const d = dayOf(calTick) % n;
  return (d < 0 ? d + n : d) + 1;
}

/** Index 0..3 of the season (SEASONS order). */
export function seasonIndexOf(calTick: number, cfg: SeasonLengthSource): number {
  return Math.floor((dayOfYear(calTick, cfg) - 1) / seasonLengthOf(cfg));
}

export function seasonOf(calTick: number, cfg: SeasonLengthSource): Season {
  return SEASONS[seasonIndexOf(calTick, cfg)];
}

/** 1-based day within the current season. */
export function dayOfSeason(calTick: number, cfg: SeasonLengthSource): number {
  return ((dayOfYear(calTick, cfg) - 1) % seasonLengthOf(cfg)) + 1;
}

/** Fraction of the year elapsed, 0..1 (GDD 06 `d` / year length). */
export function yearFraction(calTick: number, cfg: SeasonLengthSource): number {
  const n = ticksPerYear(cfg);
  const t = calTick % n;
  return (t < 0 ? t + n : t) / n;
}

/** Weekday 0..WEEK_DAYS-1 (game day 1 is weekday 0); the week never depends on the season length. */
export function weekdayOf(calTick: number): number {
  const d = dayOf(calTick) % WEEK_DAYS;
  return d < 0 ? d + WEEK_DAYS : d;
}

/**
 * Converts a day-of-year written for the default year (as the GDD and species data write them) to the
 * configured year, keeping the same year fraction (directions §K "calendar windows", GDD 06 §1.7).
 */
export function scaleDoy(doyDefaultYear: number, cfg: SeasonLengthSource): number {
  return 1 + ((doyDefaultYear - 1) * seasonLengthOf(cfg)) / DEFAULT_SEASON_LENGTH_DAYS;
}

/** Converts a duration written in default-year game days (GDD "one season" EMAs etc.) to the configured year. */
export function scaleDays(daysDefaultYear: number, cfg: SeasonLengthSource): number {
  return (daysDefaultYear * seasonLengthOf(cfg)) / DEFAULT_SEASON_LENGTH_DAYS;
}

/** Calendar tick at the start of a 1-based day of a season, plus an hour. */
export function calendarTickAt(season: Season, dayInSeason: number, hour: number, cfg: SeasonLengthSource): number {
  const day = SEASONS.indexOf(season) * seasonLengthOf(cfg) + (dayInSeason - 1);
  return day * TICKS_PER_DAY + Math.round(hour * TICKS_PER_HOUR);
}

// ---- State-based helpers (read the season length from the state's config) ----

/** Season length of this game, from config. */
export function seasonLength(state: SimState): number {
  return state.config.rules.seasonLengthDays;
}

/** Calendar tick of the current simulation tick. */
export function calendarTick(state: SimState): number {
  return state.tick + state.env.calendar.startTick;
}

export function currentSeason(state: SimState): Season {
  return seasonOf(calendarTick(state), state.config);
}

export function currentDayOfYear(state: SimState): number {
  return dayOfYear(calendarTick(state), state.config);
}

export function currentDayOfSeason(state: SimState): number {
  return dayOfSeason(calendarTick(state), state.config);
}

export function currentYear(state: SimState): number {
  return yearOf(calendarTick(state), state.config);
}

export function currentHour(state: SimState): number {
  return hourOf(calendarTick(state));
}
