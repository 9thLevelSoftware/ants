// gate-sim-2 (time.test "no hard-coded season length"): R35's winter path (queen.ts winterPathC) ramps over days of
// the default year. It read the calendar's own day of the year, so with 10-day seasons the ramp began on day 7 of
// spring (a default-year doy of 5) and stood at 0.93 where the default year has 0.5.
import { describe, expect, it } from 'vitest';
import { WINTER_STORES_TARGET_MARGIN } from '@/sim/balance/lifecycle';
import { TICKS_PER_DAY } from '@/sim/time';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { winterPathC } from './queen';
import { winterStoresNeed } from './overwinter/storesNeed';

/** A colony in a game of 10-day seasons, on 1-based calendar day `doy` (of 40). */
function at10DaySeasons(doy: number) {
  const sim = makeColonySim({ summerDay: 3 });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, royal);
  addWorkers(sim, 12, { chamber: royal });
  step(sim, 120);
  sim.state.config.rules.seasonLengthDays = 10;
  sim.state.env.calendar.startTick = (doy - 1) * TICKS_PER_DAY + TICKS_PER_DAY / 2 - sim.state.tick;
  const col = colonyOf(sim);
  return { sim, col, need: winterStoresNeed(sim, col).needC * WINTER_STORES_TARGET_MARGIN };
}

describe('winter path on the default year (gate-sim-2)', () => {
  it('10-day seasons: nothing on the last day of spring, half the need at a default-year doy of 14', () => {
    const spring = at10DaySeasons(10); // default-year day 6.65: spring
    expect(spring.need).toBeGreaterThan(0);
    expect(winterPathC(spring.sim, spring.col)).toBe(0);
    const mid = at10DaySeasons(20); // default-year day 13.65 -> doy28 14
    expect(winterPathC(mid.sim, mid.col)).toBeCloseTo(0.5 * mid.need, 6);
  });
});
