// GDD 06 §1 and App. E 1-3: day length, phases, seasons, weekdays, moon, season-length scaling, time events.

import { describe, expect, it } from 'vitest';
import { seasonalMeanNow } from './temperature';
import { calendarSystem, deriveCalendar, inWindow, isWeekend, moonPhaseOf, peakSolarOf, sunElevOf } from './calendar';
import { collect, envSim, setClockD } from './envTestKit';
import { MOON_PERIOD_DAYS } from '@/sim/balance';
import { calendarTickAt, TICKS_PER_DAY, TICKS_PER_HOUR, ticksPerYear } from '@/sim/time';
import { SEASONS } from '@/sim/types';

const CFG7 = { rules: { seasonLengthDays: 7 } };

/** Calendar tick of default-year day d28 (0-based, fractional) for a season length. */
function tickOfD(d28: number, len: number): number {
  return Math.round((d28 / 28) * ticksPerYear(len));
}

describe('day length, sunrise and sunset (E2)', () => {
  it.each([
    [7.0, 4.0, 20.0],
    [21.0, 8.0, 16.0],
    [10.5, 4.586, 19.414],
    [24.5, 7.4, 16.6],
  ])('d=%d: sunrise %d, sunset %d', (d, sr, ss) => {
    const c = deriveCalendar(tickOfD(d, 7), CFG7);
    expect(c.sunrise).toBeCloseTo(sr, 1);
    expect(Math.abs(c.sunrise - sr)).toBeLessThan(0.02);
    expect(Math.abs(c.sunset - ss)).toBeLessThan(0.02);
  });

  it('day length is 12 h at the equinoxes and peakSolar spans 0.25 .. 1.0', () => {
    expect(deriveCalendar(0, CFG7).dayLength).toBeCloseTo(12, 6);
    expect(deriveCalendar(tickOfD(14, 7), CFG7).dayLength).toBeCloseTo(12, 6);
    expect(peakSolarOf(8)).toBeCloseTo(0.25, 9);
    expect(peakSolarOf(16)).toBeCloseTo(1, 9);
    expect(peakSolarOf(14.828)).toBeCloseTo(0.8905, 3);
  });

  it('sun height is a half sine between sunrise and sunset', () => {
    expect(sunElevOf(12, 4.586, 14.828)).toBeCloseTo(1, 3);
    expect(sunElevOf(3, 4.586, 14.828)).toBe(0);
    expect(sunElevOf(21, 4.586, 14.828)).toBe(0);
  });
});

describe('day phases (E3)', () => {
  it.each([[3, 'night'], [4, 'dawn'], [8, 'morning'], [12, 'midday'], [16, 'afternoon'], [19, 'dusk'], [21, 'night']] as const)(
    'at d=10.5 hour %d is %s', (hour, phase) => {
      expect(deriveCalendar(10 * TICKS_PER_DAY + hour * TICKS_PER_HOUR, CFG7).phase).toBe(phase);
    });

  it('every phase boundary follows the day: phases cycle night, dawn, morning, midday, afternoon, dusk', () => {
    for (const d of [3, 10, 17, 24]) {
      const seen: string[] = [];
      for (let t = 0; t < TICKS_PER_DAY; t += TICKS_PER_HOUR / 5) {
        const ph = deriveCalendar(d * TICKS_PER_DAY + t, CFG7).phase;
        if (seen[seen.length - 1] !== ph) seen.push(ph);
      }
      expect(seen).toEqual(['night', 'dawn', 'morning', 'midday', 'afternoon', 'dusk', 'night']);
    }
  });
});

describe('seasons, weekdays and years (E1)', () => {
  it('default calendar: spring 1-7, summer 8-14, autumn 15-21, winter 22-28; the 29th day is year 2 spring', () => {
    for (let doy = 1; doy <= 28; doy++) {
      const c = deriveCalendar((doy - 1) * TICKS_PER_DAY, CFG7);
      expect(c.doy).toBe(doy);
      expect(c.season).toBe(SEASONS[Math.floor((doy - 1) / 7)]);
      expect(c.dayOfSeason).toBe(((doy - 1) % 7) + 1);
      expect(c.year).toBe(1);
    }
    const y2 = deriveCalendar(28 * TICKS_PER_DAY, CFG7);
    expect([y2.year, y2.doy, y2.season]).toEqual([2, 1, 'spring']);
  });

  it('weekday = day index mod 7; days 5 and 6 are the weekend, whatever the season length', () => {
    for (const len of [5, 7, 10]) {
      const cfg = { rules: { seasonLengthDays: len } };
      for (let day = 0; day < 4 * len * 3; day++) {
        const c = deriveCalendar(day * TICKS_PER_DAY + 10, cfg);
        expect(c.weekday).toBe(day % 7);
      }
    }
    const sim = envSim();
    for (let day = 0; day < 14; day++) {
      sim.state.env.calendar.startTick = day * TICKS_PER_DAY;
      sim.state.tick = 0;
      expect(isWeekend(sim)).toBe(day % 7 >= 5);
    }
  });

  it('hour at tick 250 is 1.0 and the calendar never overflows', () => {
    expect(deriveCalendar(250, CFG7).hour).toBe(1);
    expect(deriveCalendar(2 ** 40, CFG7).hour).toBeGreaterThanOrEqual(0);
  });
});

describe('season length 5, 7 and 10: every seasonal window scales by year fraction', () => {
  it('season boundaries sit at quarter-year fractions for each length', () => {
    for (const len of [5, 7, 10]) {
      const cfg = { rules: { seasonLengthDays: len } };
      for (let s = 0; s < 4; s++) {
        const start = deriveCalendar(calendarTickAt(SEASONS[s], 1, 0, cfg), cfg);
        expect(start.yearFrac).toBeCloseTo(s / 4, 9);
        expect(start.season).toBe(SEASONS[s]);
        expect(start.dayOfSeason).toBe(1);
        const lastDay = deriveCalendar(calendarTickAt(SEASONS[s], len, 23.9, cfg), cfg);
        expect(lastDay.season).toBe(SEASONS[s]);
      }
    }
  });

  it('sunrise, sunset and day phases depend on the year fraction only', () => {
    for (const f of [0.1, 0.25, 0.375, 0.6, 0.875]) {
      const ref = deriveCalendar(Math.round(f * ticksPerYear(7)), CFG7);
      for (const len of [5, 10]) {
        const cfg = { rules: { seasonLengthDays: len } };
        const c = deriveCalendar(Math.round(f * ticksPerYear(len)), cfg);
        expect(c.sunrise).toBeCloseTo(ref.sunrise, 2);
        expect(c.sunset).toBeCloseTo(ref.sunset, 2);
        expect(c.yearFrac).toBeCloseTo(ref.yearFrac, 4);
      }
    }
  });

  it('a default-year window covers the same share of the year for every length (inWindow)', () => {
    for (const len of [5, 7, 10] as const) {
      const sim = envSim({ seasonLengthDays: len });
      let inside = 0;
      const steps = 4 * len * 40;
      for (let i = 0; i < steps; i++) {
        sim.state.tick = 0;
        sim.state.env.calendar.startTick = Math.round((i * ticksPerYear(len)) / steps);
        if (inWindow(sim, 9, 12)) inside++;
      }
      expect(inside / steps).toBeCloseTo(4 / 28, 2);
    }
  });

  it('the seasonal mean temperature at a year fraction does not depend on the season length', () => {
    const temps: number[] = [];
    for (const len of [5, 7, 10] as const) {
      const sim = envSim({ seasonLengthDays: len });
      setClockD(sim, 17.5);
      temps.push(seasonalMeanNow(sim));
    }
    expect(temps[0]).toBeCloseTo(temps[1], 3);
    expect(temps[2]).toBeCloseTo(temps[1], 3);
  });
});

describe('moon', () => {
  it('has a period of 2.265 game days and starts new at phase 0', () => {
    expect(moonPhaseOf(0, 0)).toBe(0);
    expect(moonPhaseOf(MOON_PERIOD_DAYS * TICKS_PER_DAY, 0)).toBeCloseTo(0, 6);
    expect(moonPhaseOf((MOON_PERIOD_DAYS / 2) * TICKS_PER_DAY, 0)).toBeCloseTo(0.5, 6);
    expect(deriveCalendar(Math.round((MOON_PERIOD_DAYS / 2) * TICKS_PER_DAY), CFG7).moonIllum).toBeCloseTo(1, 3);
  });
});

describe('calendar system events', () => {
  it('emits hour, day, phase and season events exactly once at their boundaries', () => {
    const sim = envSim();
    const hours = collect<{ hour: number }>(sim, 'time.hour');
    const days = collect<{ dayIndex: number; weekday: number; isWeekend: boolean }>(sim, 'time.day');
    const phases = collect<{ phase: string }>(sim, 'time.phase');
    const seasons = collect<{ season: string; year: number }>(sim, 'time.season');
    const years = collect<{ year: number }>(sim, 'time.year');
    // start 6 ticks before the end of summer day 7's last hour... simply start two days before the year ends
    sim.state.tick = 0;
    sim.state.env.calendar.startTick = 28 * TICKS_PER_DAY - 2 * TICKS_PER_DAY;
    for (let i = 0; i < 4 * TICKS_PER_DAY; i++) {
      calendarSystem.run(sim);
      sim.events.flush();
      sim.state.tick++;
    }
    expect(hours.length).toBe(4 * 24);
    expect(days.length).toBe(4);
    expect(days.map((d) => d.weekday)).toEqual([26 % 7, 27 % 7, 28 % 7, 29 % 7]);
    expect(seasons).toEqual([{ type: 'time.season', season: 'spring', year: 2 }]);
    expect(years).toEqual([{ type: 'time.year', year: 2 }]);
    // Four days of phases: night, dawn, morning, midday, afternoon, dusk repeated.
    expect(phases.length).toBeGreaterThanOrEqual(4 * 6 - 1);
    expect(phases.slice(0, 6).map((p) => p.phase)).toContain('dawn');
  });
});
