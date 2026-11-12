// Seasonal availability of sources by year fraction (directions §K "calendar windows", registry C1).
// GDD day windows are default-year days (doy28): "doy a-b" holds while a - 1 <= d28 < b, d28 = yearFrac x 28.
// So the same window covers the same share of the year at season lengths 5, 7 and 10.

import type { FoodSource, Season, Sim } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { DEFAULT_SEASON_LENGTH_DAYS } from '@/sim/balance';
import { calendarNow } from '@/sim/environment';
import { defaultVariant, sourceDef } from './def';

/** Days in the default year that GDD day numbers refer to. */
const DEFAULT_YEAR_DAYS = DEFAULT_SEASON_LENGTH_DAYS * SEASONS.length;

/** Default-year day (fractional, 0-based) of a year fraction 0..1. */
export function d28Of(yearFrac: number): number {
  return yearFrac * DEFAULT_YEAR_DAYS;
}

/** Whether a doy28 window [a, b] (inclusive integer days, null = all year) holds at a year fraction. */
export function windowActive(days: readonly [number, number] | null, yearFrac: number): boolean {
  if (!days) return true;
  const d = d28Of(yearFrac);
  return d >= days[0] - 1 && d < days[1];
}

/** Season bit of the SEASONS index. */
export function seasonBit(season: Season): number {
  return 1 << SEASONS.indexOf(season);
}

/**
 * Whether the source is in season now: its catalogue window (for the game's tier: T1 flowers are always open) and
 * its season mask both allow it.
 */
export function isInSeason(sim: Sim, s: FoodSource): boolean {
  const cal = calendarNow(sim);
  if ((s.seasonMask & seasonBit(cal.season)) === 0) return false;
  const v = s.variant ?? defaultVariant(s.kind);
  return windowActive(v ? sourceDef(v).window : null, cal.yearFrac);
}
