// Time units and calendar helpers (directions §J/§K, GDD 06 §1).
//
// Two tick counts exist: `state.tick` counts from the start of this game; the CALENDAR tick adds
// `env.calendar.startOffsetTicks` (the start day and hour), so calendar tick 0 is 00:00 on day 1 of spring,
// year 1. Season length is a custom rule (5, 7 or 10 days): every helper that needs it takes it as a parameter
// or reads it from the state's config. Nothing here assumes 7.

import type { Season, SeasonLengthDays, SimState } from '@/sim/types';
import { SEASONS } from '@/sim/types';

export const TICKS_PER_SECOND = 10;
export const SECONDS_PER_DAY = 600;
export const HOURS_PER_DAY = 24;
export const TICKS_PER_DAY = TICKS_PER_SECOND * SECONDS_PER_DAY; // 6000
export const TICKS_PER_HOUR = TICKS_PER_DAY / HOURS_PER_DAY; // 250
export const SEASONS_PER_YEAR = 4;
/** The human-activity week is always 7 game days, independent of season length (directions §K). */
export const DAYS_PER_WEEK = 7;
/** Default season length; used only to build default configs, never as an assumption in calendar maths. */
export const DEFAULT_SEASON_LENGTH: SeasonLengthDays = 7;

/** Game seconds -> ticks (rounded to an integer). */
export function secondsToTicks(s: number): number {
  return Math.round(s * TICKS_PER_SECOND);
}

/** Game days -> ticks (rounded to an integer). */
export function daysToTicks(d: number): number {
  return Math.round(d * TICKS_PER_DAY);
}

export function daysPerYear(seasonLengthDays: number): number {
  return seasonLengthDays * SEASONS_PER_YEAR;
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
export function yearOf(calTick: number, seasonLengthDays: number): number {
  return Math.floor(dayOf(calTick) / daysPerYear(seasonLengthDays)) + 1;
}

/** 1-based day of the year (1 .. 4 * seasonLengthDays). */
export function dayOfYear(calTick: number, seasonLengthDays: number): number {
  const n = daysPerYear(seasonLengthDays);
  const d = dayOf(calTick) % n;
  return (d < 0 ? d + n : d) + 1;
}

/** Index 0..3 of the season (SEASONS order). */
export function seasonIndexOf(calTick: number, seasonLengthDays: number): number {
  return Math.floor((dayOfYear(calTick, seasonLengthDays) - 1) / seasonLengthDays);
}

export function seasonOf(calTick: number, seasonLengthDays: number): Season {
  return SEASONS[seasonIndexOf(calTick, seasonLengthDays)];
}

/** 1-based day within the current season. */
export function dayOfSeason(calTick: number, seasonLengthDays: number): number {
  return ((dayOfYear(calTick, seasonLengthDays) - 1) % seasonLengthDays) + 1;
}

/** Fraction of the year elapsed, 0..1 (GDD 06 `d` / 28 for the default year). */
export function yearFraction(calTick: number, seasonLengthDays: number): number {
  const ticksPerYear = daysPerYear(seasonLengthDays) * TICKS_PER_DAY;
  const t = calTick % ticksPerYear;
  return (t < 0 ? t + ticksPerYear : t) / ticksPerYear;
}

/** Weekday 0..6 (game day 1 is weekday 0); 5 and 6 are the weekend. */
export function weekdayOf(calTick: number): number {
  const d = dayOf(calTick) % DAYS_PER_WEEK;
  return d < 0 ? d + DAYS_PER_WEEK : d;
}

/**
 * Converts a day-of-year written for the default 28-day year (as the GDD writes them) to the configured year,
 * keeping the same year fraction (directions §K "calendar windows").
 */
export function scaleDoy(doyDefaultYear: number, seasonLengthDays: number): number {
  return 1 + ((doyDefaultYear - 1) * seasonLengthDays) / DEFAULT_SEASON_LENGTH;
}

/** Calendar tick at the start of a 1-based day of a season, plus an hour, for the given season length. */
export function calendarTickAt(season: Season, dayInSeason: number, hour: number, seasonLengthDays: number): number {
  const day = SEASONS.indexOf(season) * seasonLengthDays + (dayInSeason - 1);
  return day * TICKS_PER_DAY + Math.round(hour * TICKS_PER_HOUR);
}

// ---- State-based helpers (read the season length from config) ----

/** Season length of this game, from config. */
export function seasonLength(state: SimState): number {
  return state.config.rules.seasonLengthDays;
}

/** Calendar tick of the current simulation tick. */
export function calendarTick(state: SimState): number {
  return state.tick + state.env.calendar.startOffsetTicks;
}

export function currentSeason(state: SimState): Season {
  return seasonOf(calendarTick(state), seasonLength(state));
}

export function currentDayOfYear(state: SimState): number {
  return dayOfYear(calendarTick(state), seasonLength(state));
}

export function currentYear(state: SimState): number {
  return yearOf(calendarTick(state), seasonLength(state));
}

export function currentHour(state: SimState): number {
  return hourOf(calendarTick(state));
}
