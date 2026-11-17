// Messor founding variation (GDD 06 §5.15): the first-brood lapse reaches winter, the winter step is applied to the
// queen and brood only and the calendar moves to spring; the brood stays arrested (the spring hold) while the cell
// is colder than FOUND_SPRING_RESUME_C, so it does not pay the founding hazard for days of almost no development.

import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { calendarTickAt, currentDefaultYearDoy, currentSeason } from '@/sim/time';
import { setClimateOverride } from '../../envAdapter';
import { FOUND_SPRING_HOLD_MAX_GD, FOUND_SPRING_RESUME_C } from '@/sim/balance/species-harvester';
import { timeHandlers } from '@/sim/environment';
import { phase, queen, stepUntil } from '../testkit';
import { lapseSpringHold, lapseWinterJump } from './messor';

/** A Messor founding in its time-lapse, the clock set to the first tick of winter. */
function lapseAtWinter(cellTemp: (doy: number) => number) {
  const sim = makeTestSim({ species: 'messor-barbarus', sizeBu: 128, seed: 2 });
  setClimateOverride(sim, {
    chamberTemp: () => cellTemp(currentDefaultYearDoy(sim.state)),
    pointTemp: () => cellTemp(currentDefaultYearDoy(sim.state)),
  });
  sim.enqueue({ type: 'cheat.completeFounding', workers: 6 });
  stepUntil(sim, () => phase(sim) === 'timelapse', 20_000);
  expect(phase(sim)).toBe('timelapse');
  const cfg = sim.state.config;
  timeHandlers['cheat.setTime']!(sim, { type: 'cheat.setTime', tick: calendarTickAt('winter', 1, 0, cfg) + 1 });
  return sim;
}

describe('Messor winter inside the founding lapse (GDD 06 §5.15)', () => {
  it('jumps to spring, then holds the brood until the cell is warm enough', () => {
    // spring days 1-3 cold (12 °C), warm from doy 3.5 on
    const sim = lapseAtWinter((doy) => (doy < 3.5 ? 12 : 22));
    const q = queen(sim);
    const r0 = q.queen!.founding!.reserveLoads;
    const days = lapseWinterJump(sim);
    expect(days).toBeGreaterThan(0);
    expect(currentSeason(sim.state)).toBe('spring');
    const held = lapseSpringHold(sim);
    expect(held).toBeGreaterThan(2);
    expect(held).toBeLessThanOrEqual(FOUND_SPRING_HOLD_MAX_GD);
    expect(currentDefaultYearDoy(sim.state)).toBeGreaterThanOrEqual(3.5);
    expect(q.queen!.founding!.reserveLoads).toBeLessThan(r0);
    expect(lapseSpringHold(sim)).toBe(0); // once only
  });

  it('a warm spring cell is not held, and the hold never passes its cap', () => {
    const warm = lapseAtWinter(() => FOUND_SPRING_RESUME_C + 4);
    lapseWinterJump(warm);
    expect(lapseSpringHold(warm)).toBe(0);
    const cold = lapseAtWinter(() => 5);
    lapseWinterJump(cold);
    expect(lapseSpringHold(cold)).toBe(FOUND_SPRING_HOLD_MAX_GD);
  });
});
