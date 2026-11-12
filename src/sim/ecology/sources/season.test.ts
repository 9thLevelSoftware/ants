// Acceptance 5: seasonal availability follows year fractions for season lengths 5, 7 and 10.

import { describe, expect, it } from 'vitest';
import type { SeasonLengthDays, Sim } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { TICKS_PER_DAY, TICKS_PER_HOUR, ticksPerYear } from '@/sim/time';
import { createSource } from './spawn';
import { sourceDef } from './def';
import { isInSeason, windowActive } from './season';
import { takeFromSource } from './harvest';
import { nearestSource } from './discovery';
import { addWorker, centre, makeSourceSim } from './testkit';

const LENGTHS: SeasonLengthDays[] = [5, 7, 10];

function simWithSeasonLength(len: SeasonLengthDays): Sim {
  const base = defaultGameConfig('lasius-niger', 1, 'naturalist', len);
  return makeSourceSim({ config: { rules: base.rules, startSeason: base.startSeason, startDayOfSeason: base.startDayOfSeason } });
}

/** Moves the sim's clock to a year fraction of year 2 (calendar tick = state tick + start tick). */
function setYearFrac(sim: Sim, yf: number): void {
  const year = ticksPerYear(sim.state.config);
  sim.state.tick = Math.round(year * (1 + yf)) - sim.state.env.calendar.startTick;
}

describe('windows by year fraction', () => {
  it.each(LENGTHS)('season length %d: "doy a-b" holds for the same share of the year', (len) => {
    const window = sourceDef('berry', 2).window;
    expect(window).toEqual([9, 14]);
    if (!window) return;
    const year = 4 * len * 24; // hourly samples
    let first = -1, last = -1, n = 0;
    for (let h = 0; h < year; h++) {
      if (!windowActive(window, h / year)) continue;
      if (first < 0) first = h;
      last = h;
      n++;
    }
    expect(first / year).toBeCloseTo(8 / 28, 2);
    expect((last + 1) / year).toBeCloseTo(14 / 28, 2);
    expect(n / year).toBeCloseTo(6 / 28, 2);
  });

  it.each(LENGTHS)('season length %d: a berry is out of season before day 9 and after day 14 (default-year days)', (len) => {
    const sim = simWithSeasonLength(len);
    expect(sim.state.config.rules.seasonLengthDays).toBe(len);
    const s = createSource(sim, { variant: 'berry', pos: centre(sim), tier: 2 });
    const ant = addWorker(sim, s.pos);
    const at = (doy28: number): boolean => {
      setYearFrac(sim, doy28 / 28);
      return isInSeason(sim, s);
    };
    expect(at(7.9)).toBe(false);
    expect(at(8.05)).toBe(true);
    expect(at(13.95)).toBe(true);
    expect(at(14.05)).toBe(false);
    setYearFrac(sim, 7.5 / 28);
    expect(takeFromSource(sim, ant, s.id, 1).status).toBe('out-of-season');
    expect(nearestSource(sim, ant.colony, s.pos, 100)).toBe(-1);
    setYearFrac(sim, 10 / 28);
    expect(takeFromSource(sim, ant, s.id, 1).status).toBe('ok');
  });

  it.each(LENGTHS)('season length %d: the season mask of an anchor switches a T1 source by season', (len) => {
    const sim = simWithSeasonLength(len);
    const summerOnly = 1 << 1;
    const s = createSource(sim, { variant: 'flower', pos: centre(sim), seasonMask: summerOnly });
    setYearFrac(sim, 0.3); // summer
    expect(isInSeason(sim, s)).toBe(true);
    setYearFrac(sim, 0.1); // spring
    expect(isInSeason(sim, s)).toBe(false);
    setYearFrac(sim, 0.6); // autumn
    expect(isInSeason(sim, s)).toBe(false);
  });

  it('T1 flowers are open all year; out of season a T2 window also stops the refill', () => {
    const sim = simWithSeasonLength(7);
    const flower = createSource(sim, { variant: 'flower', pos: centre(sim) });
    for (const yf of [0.01, 0.3, 0.6, 0.9]) {
      setYearFrac(sim, yf);
      expect(isInSeason(sim, flower)).toBe(true);
    }
    const efn = createSource(sim, { variant: 'extrafloral-nectary', pos: centre(sim), tier: 2, empty: true });
    setYearFrac(sim, 21 / 28); // past day 20
    const t0 = sim.state.tick;
    while (sim.state.tick < t0 + TICKS_PER_DAY) sim.tick();
    expect(efn.units).toBe(0);
    setYearFrac(sim, 2 / 28);
    const t1 = sim.state.tick;
    while (sim.state.tick < t1 + TICKS_PER_HOUR * 2) sim.tick();
    expect(efn.units).toBeGreaterThan(0);
  });
});
