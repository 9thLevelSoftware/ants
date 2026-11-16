// The capture's file name (GDD 08 7.9): foundress-<seed>-y<year>-<season>-d<day>-<hhmm>.png. Pure.
import type { Sim } from '@/sim/types';
import { currentDayOfSeason, currentHour, currentSeason, currentYear } from '@/sim/time';

export interface FilenameParts {
  seed: number;
  year: number;
  season: string;
  day: number;
  /** Hour of day 0..24 (fractional). */
  hour: number;
}

const int = (n: number, min: number): number => (Number.isFinite(n) ? Math.max(min, Math.floor(n)) : min);
const two = (n: number): string => String(int(n, 0)).padStart(2, '0');

export function photoFilename(p: FilenameParts): string {
  const hour = Number.isFinite(p.hour) ? Math.max(0, p.hour) : 0;
  const h = Math.min(23, Math.floor(hour)), m = Math.min(59, Math.floor((hour - Math.floor(hour)) * 60));
  const season = p.season.toLowerCase().replace(/[^a-z]/g, '') || 'season';
  return `foundress-${Number.isFinite(p.seed) ? Math.trunc(p.seed) >>> 0 : 0}-y${int(p.year, 1)}-${season}-d${int(p.day, 1)}-${two(h)}${two(m)}.png`;
}

/** The parts from a running sim. */
export function filenamePartsOf(sim: Sim): FilenameParts {
  const s = sim.state;
  return { seed: s.config.world.seed, year: currentYear(s), season: currentSeason(s), day: currentDayOfSeason(s), hour: currentHour(s) };
}
