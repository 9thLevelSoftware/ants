// 00-index §D7 (second pass): default-year day numbers, thermal inputs, brood destined caste.
import { requireSpecies } from '@/sim/species';
import { describe, expect, it } from 'vitest';
import type { Brood, BroodCaste, ThermalInputs } from '@/sim/types';
import { BROOD_CASTES, CASTES } from '@/sim/types';
import {
  calendarTickAt, currentDefaultYearDoy, defaultYearDay, defaultYearDoy, inDefaultYearWindow, TICKS_PER_DAY,
} from '@/sim/time';
import * as environment from '@/sim/environment';
import { TERRAIN_CELL_BU } from '@/sim/balance';
import { makeTestSim } from '@/sim/testing';

describe('D7.1 default-year day numbers', () => {
  it('C1 examples: doy 9 = Summer Day 2 and doy 10 = Summer Day 3 in the default year', () => {
    const cfg = { rules: { seasonLengthDays: 7 } };
    expect(defaultYearDoy(calendarTickAt('summer', 2, 12, cfg), cfg)).toBe(9);
    expect(defaultYearDoy(calendarTickAt('summer', 3, 0, cfg), cfg)).toBe(10);
  });

  it('a default-year window covers the same share of the year for season lengths 5, 7 and 10', () => {
    for (const len of [5, 7, 10]) {
      const cfg = { rules: { seasonLengthDays: len } };
      const yearTicks = 4 * len * TICKS_PER_DAY;
      let inside = 0;
      const stepTicks = 30;
      const steps = yearTicks / stepTicks;
      for (let i = 0; i < steps; i++) if (inDefaultYearWindow(i * stepTicks, cfg, 9, 12)) inside++;
      expect(inside / steps, `len ${len}`).toBeCloseTo(4 / 28, 3); // doy 9-12 inclusive: d28 in [8, 12)
    }
  });

  it('d28 is 0-based and stays in [0, 28) for negative and multi-year ticks', () => {
    const cfg = { rules: { seasonLengthDays: 5 } };
    expect(defaultYearDay(0, cfg)).toBe(0);
    for (const t of [-1, -TICKS_PER_DAY * 3, 20 * TICKS_PER_DAY * 3 + 7]) {
      const d = defaultYearDay(t, cfg);
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThan(28);
    }
  });

  it('a new Lasius game starts inside its natural window doy 5-9 (ruling R20) for every season length', () => {
    for (const len of [5, 7, 10] as const) {
      const sim = makeTestSim({ config: { rules: { ...makeTestSim().state.config.rules, seasonLengthDays: len } } });
      const doy28 = currentDefaultYearDoy(sim.state);
      expect(doy28, `len ${len}`).toBeGreaterThanOrEqual(5);
      expect(doy28, `len ${len}`).toBeLessThanOrEqual(9);
    }
  });
});

describe('D7.2 thermal inputs and rain intensity', () => {
  it('thermalInputs fills the given record with finite temperatures; no inflow without rain', () => {
    const sim = makeTestSim();
    const out: ThermalInputs = { T_top: NaN, T_dayMean: NaN, T_seasonMean: NaN, T_annual: NaN };
    const r = environment.thermalInputs(sim, sim.state.ants[0].pos, out);
    expect(r).toBe(out);
    for (const v of Object.values(r)) expect(Number.isFinite(v)).toBe(true);
    // env-core picks the opening weather; a fresh game never starts in rain
    expect(environment.isRaining(sim)).toBe(false);
    expect(environment.rainIntensityAt(sim, sim.state.ants[0].pos)).toBe(0);
  });

  it('env.thermal sizes the EMA grid on the 4 BU heightfield cell and leaves the arrays to env-core', () => {
    const sim = makeTestSim();
    const th = sim.state.env.thermal;
    expect(th.emaCellMm).toBe(TERRAIN_CELL_BU * sim.world.bu);
    expect(th.emaCellNx).toBe(Math.ceil(sim.world.size / th.emaCellMm));
    expect(th.emaCellNz).toBe(th.emaCellNx);
    expect(th.emaCell).toBeInstanceOf(Float32Array);
    expect(th.emaCover).toBeInstanceOf(Float32Array);
    expect(th.emaCoverPrimIds).toEqual([]);
  });
});

describe('D7.3 brood destined caste', () => {
  it('BROOD_CASTES is every caste but queen', () => {
    expect([...BROOD_CASTES].sort()).toEqual(CASTES.filter((c) => c !== 'queen').sort());
  });

  it('the type refuses queen', () => {
    // @ts-expect-error a brood item is never destined to be a queen (gynes become queens)
    const bad: BroodCaste = 'queen';
    const destined: Brood['destined'] = 'major';
    expect([bad, destined]).toHaveLength(2);
  });

  it('cheat.spawnBrood refuses destined queen from untyped JSON and spawns nothing', () => {
    const sim = makeTestSim();
    const reasons: string[] = [];
    sim.events.on('command-rejected', (e) => reasons.push(e.reason));
    const n0 = sim.state.brood.length;
    sim.enqueue({
      type: 'cheat.spawnBrood', colonyId: sim.state.colonies[0].id, stage: 'egg', n: 2, chamberId: -1, progress: 0,
      destined: 'queen' as BroodCaste,
    });
    sim.enqueue({ type: 'cheat.spawnBrood', colonyId: sim.state.colonies[0].id, stage: 'egg', n: 1, chamberId: -1, progress: 0, destined: 'gyne' });
    sim.tick();
    expect(reasons).toEqual(['invalid-caste']);
    expect(sim.state.brood.length - n0).toBe(1);
    expect(sim.state.brood.at(-1)?.destined).toBe('gyne');
  });
});

describe('calendarNow cache (runtime only)', () => {
  it('sees a start-tick change within the same tick', () => {
    const sim = makeTestSim();
    const day0 = environment.calendarNow(sim).dayIndex;
    sim.state.env.calendar.startTick += TICKS_PER_DAY;
    expect(environment.calendarNow(sim).dayIndex).toBe(day0 + 1);
  });

  it('sees a season-length change within the same tick', () => {
    const sim = makeTestSim();
    // Lasius starts on its species startDoy (5 = Spring Day 5 since ruling R20); move to doy 9 = Summer Day 2, where
    // the season length decides the season
    const doy = 9;
    sim.state.env.calendar.startTick += (doy - requireSpecies('lasius-niger').opening.startDoy.default) * TICKS_PER_DAY;
    expect(environment.calendarNow(sim).season).toBe('summer');
    sim.state.config.rules = { ...sim.state.config.rules, seasonLengthDays: 10 };
    // the same calendar tick (day index doy - 1) now falls in a 10-day spring
    expect(environment.calendarNow(sim).season).toBe('spring');
    expect(environment.calendarNow(sim).dayOfSeason).toBe(doy);
  });
});
