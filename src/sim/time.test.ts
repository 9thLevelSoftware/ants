import { describe, expect, it } from 'vitest';
import {
  calendarTickAt, dayOfSeason, dayOfYear, scaleDoy, seasonOf, TICKS_PER_DAY, TICKS_PER_HOUR, timeOfDay, weekdayOf,
  yearOf,
} from '@/sim/time';

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
