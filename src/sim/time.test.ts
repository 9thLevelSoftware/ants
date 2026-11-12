import { describe, expect, it } from 'vitest';
import {
  calendarTickAt, currentSeason, dayOfSeason, dayOfYear, daysPerYear, scaleDays, scaleDoy, seasonOf, TICKS_PER_DAY,
  TICKS_PER_HOUR, timeOfDay, weekdayOf, yearOf,
} from '@/sim/time';
import { defaultGameConfig } from '@/sim/createGame';
import { makeTestSim } from '@/sim/testing';

describe('calendar helpers', () => {
  it('uses 6000 ticks per day and 250 per hour', () => {
    expect(TICKS_PER_DAY).toBe(6000);
    expect(TICKS_PER_HOUR).toBe(250);
    expect(timeOfDay(TICKS_PER_DAY / 2)).toBeCloseTo(0.5);
  });

  it('reads the season length instead of assuming 7', () => {
    for (const len of [5, 7, 10]) {
      const summerDay1 = calendarTickAt('summer', 1, 0, len);
      expect(seasonOf(summerDay1, len)).toBe('summer');
      expect(seasonOf(summerDay1 - 1, len)).toBe('spring');
      expect(dayOfSeason(summerDay1, len)).toBe(1);
      expect(dayOfYear(summerDay1, len)).toBe(len + 1);
      expect(yearOf(4 * len * TICKS_PER_DAY, len)).toBe(2);
      expect(seasonOf(4 * len * TICKS_PER_DAY - 1, len)).toBe('winter');
    }
  });

  it('keeps a 7-day week independent of season length', () => {
    expect(weekdayOf(0)).toBe(0);
    expect(weekdayOf(6 * TICKS_PER_DAY)).toBe(6);
    expect(weekdayOf(7 * TICKS_PER_DAY)).toBe(0);
  });

  it('scales default-year day numbers to the configured year', () => {
    expect(scaleDoy(1, 10)).toBe(1);
    expect(scaleDoy(8, 7)).toBe(8);
    expect(scaleDoy(8, 10)).toBe(11);
  });
});

describe('calendar helpers read the season length from the config (D1.2)', () => {
  const cfg = (len: number) => ({ rules: { seasonLengthDays: len } });

  it('agree with the plain-length form for 5, 7 and 10 day seasons', () => {
    for (const len of [5, 7, 10]) {
      const c = cfg(len);
      expect(daysPerYear(c)).toBe(4 * len);
      for (let day = 0; day < 9 * len; day += 3) {
        const t = day * TICKS_PER_DAY + 1234;
        expect(seasonOf(t, c)).toBe(seasonOf(t, len));
        expect(yearOf(t, c)).toBe(Math.floor(day / (4 * len)) + 1);
        expect(dayOfYear(t, c)).toBe((day % (4 * len)) + 1);
        expect(dayOfSeason(t, c)).toBe((day % len) + 1);
      }
      expect(seasonOf(calendarTickAt('autumn', len, 23, c), c)).toBe('autumn');
      expect(scaleDays(7, c)).toBeCloseTo(len); // "one season" written for the default year
    }
  });

  it('a new game uses its own season length everywhere', () => {
    for (const len of [5, 7, 10] as const) {
      const sim = makeTestSim({ config: { rules: { ...defaultGameConfig().rules, seasonLengthDays: len } } });
      const q = sim.state.ants[0].queen!;
      expect(q.layingLog.length).toBe(4 * len);
      expect(sim.state.colonies[0].honeydew!.yieldHistory.cap).toBe(len);
      expect(currentSeason(sim.state)).toBe('summer');
    }
  });
});

// ---- no hard-coded season or year length in src/sim (acceptance: constants derive from config) ----

const SIM_SOURCES = import.meta.glob('/src/sim/**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

/**
 * Named declarations allowed to hold the numbers: the default season length, the default (reference) year in
 * which the GDD writes day numbers, the week and the rule's options.
 */
const ALLOWED = [
  /DEFAULT_SEASON_LENGTH_DAYS = 7;/, /REFERENCE_DAYS_PER_YEAR = 28;/, /WEEK_DAYS = 7;/, /SEASON_LENGTHS = \[5, 7, 10\]/,
];

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g, "''");
}

describe('no hard-coded season or year length', () => {
  it('src/sim code never writes 7 or 28 next to a day / season / year / week term', () => {
    const bad: string[] = [];
    for (const [file, src] of Object.entries(SIM_SOURCES)) {
      if (file.endsWith('.test.ts') || file.includes('/species/data/')) continue; // species data: default-year windows
      codeOnly(src).split('\n').forEach((line, i) => {
        // A bare number only: the C1 names `d28` / `doy28` are identifiers, not hard-coded lengths.
        if (!/(?<![\w.])(7|28)(?![\w.])/.test(line) || !/day|season|year|week|doy/i.test(line)) return;
        if (ALLOWED.some((r) => r.test(line))) return;
        bad.push(`${file}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
