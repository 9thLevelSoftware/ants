// Ruling R40 a (colony-life direction 27, round 13): the winter-reserve gate (viab-economy R5) holds laying protein only
// until the colony's first winter. (Its second half, the winter path counted in the forage want, was taken out again in
// round 14 by direction 29a, with its tests.)

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { WINTER_RESERVE_FROM_D28 } from '@/sim/balance';
import { daysPerYear, TICKS_PER_DAY } from '@/sim/time';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { colonyHasWintered, layingProteinPermitted, winterReserveShort } from './queen';
import { setClimateOverride } from './envAdapter';

/** viability.test's R5 colony: 12 workers, C in store c, 10 P, at default-year day d28. */
function small(c: number, d28: number): Sim {
  const sim = makeColonySim();
  const ch = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 });
  establishQueen(sim, ch);
  addWorkers(sim, 12, { chamber: ch, ageGd: 3 });
  sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c, p: 10 });
  sim.applyPendingCommands();
  step(sim, 200);
  setClimateOverride(sim, { d28: () => d28 });
  return sim;
}

/** The colony was founded a year before now: it has wintered once. */
function winterOnce(sim: Sim): void {
  colonyOf(sim).foundedTick -= daysPerYear(sim.state.config) * TICKS_PER_DAY;
}

describe('R40 a: the winter-reserve gate only until the first winter', () => {
  it('a first-year colony of 12 at d28 12 short of the R5 reserve withholds laying protein (as before)', () => {
    const sim = small(1, WINTER_RESERVE_FROM_D28 + 2);
    const col = colonyOf(sim);
    expect(colonyHasWintered(sim, col)).toBe(false);
    expect(winterReserveShort(sim, col, 12)).toBe(true);
    expect(layingProteinPermitted(sim, col)).toBe(false);
  });

  it('the same colony after its first winter: the gate is off and laying protein is permitted', () => {
    const sim = small(1, WINTER_RESERVE_FROM_D28 + 2);
    winterOnce(sim);
    const col = colonyOf(sim);
    expect(colonyHasWintered(sim, col)).toBe(true);
    expect(winterReserveShort(sim, col, 12)).toBe(false);
    expect(layingProteinPermitted(sim, col)).toBe(true);
  });

  it('the winter lapse keeps the founding year: foundedTick and the calendar anchor move together', () => {
    const sim = small(40, 3);
    const col = colonyOf(sim);
    const jump = 5 * TICKS_PER_DAY;
    col.foundedTick -= jump;
    sim.state.env.calendar.startTick += jump; // what overwinter/begin.ts and cheat.setTime do together
    expect(colonyHasWintered(sim, col)).toBe(false);
  });
});
