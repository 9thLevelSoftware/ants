// Reviewer edge cases for the calendar helpers and the new-game calendar anchor.
import { describe, expect, it } from 'vitest';
import {
  calendarTickAt, dayOfSeason, dayOfYear, scaleDoy, seasonOf, TICKS_PER_DAY, timeOfDay, weekdayOf, yearFraction,
  yearOf, currentSeason,
} from '@/sim/time';
import { SEASON_LENGTHS, SEASONS } from '@/sim/types';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { makeTestWorld } from '@/sim/testing';

describe('F1b verify: calendar', () => {
  it('season boundaries are exact for every allowed season length', () => {
    for (const L of SEASON_LENGTHS) {
      for (let s = 0; s < 4; s++) {
        const first = calendarTickAt(SEASONS[s], 1, 0, L);
        const last = calendarTickAt(SEASONS[s], L, 0, L) + TICKS_PER_DAY - 1;
        expect(seasonOf(first, L)).toBe(SEASONS[s]);
        expect(seasonOf(last, L)).toBe(SEASONS[s]);
        expect(dayOfSeason(first, L)).toBe(1);
        expect(dayOfSeason(last, L)).toBe(L);
        expect(seasonOf(last + 1, L)).toBe(SEASONS[(s + 1) % 4]);
      }
      const yearTicks = 4 * L * TICKS_PER_DAY;
      expect(yearOf(yearTicks - 1, L)).toBe(1);
      expect(yearOf(yearTicks, L)).toBe(2);
      expect(dayOfYear(yearTicks, L)).toBe(1);
      expect(yearFraction(yearTicks, L)).toBe(0);
    }
  });

  it('helpers stay in range for negative calendar ticks', () => {
    expect(timeOfDay(-1)).toBeGreaterThanOrEqual(0);
    expect(timeOfDay(-1)).toBeLessThan(1);
    expect(weekdayOf(-1)).toBe(6);
    expect(dayOfYear(-1, 7)).toBe(28);
    expect(seasonOf(-1, 7)).toBe('winter');
  });

  it('scaleDoy keeps the year fraction', () => {
    expect(scaleDoy(1, 5)).toBe(1);
    expect(scaleDoy(29, 10)).toBe(41);
    expect(scaleDoy(15, 5)).toBe(11);
  });

  it('a new game starts in the configured season even with short custom seasons', () => {
    const world = makeTestWorld();
    const cfg = defaultGameConfig('lasius-niger', 3);
    // A config written for 7-day seasons (start on day 7 of summer), then the player picks 5-day seasons.
    const custom = { ...cfg, world: world.params, startDayOfSeason: 7, rules: { ...cfg.rules, seasonLengthDays: 5 as const } };
    const { state } = createNewGame(custom, world);
    expect(currentSeason(state)).toBe(custom.startSeason);
  });
});
