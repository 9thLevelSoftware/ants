// Ruling R40 a (colony-life direction 27, round 13): the winter-reserve gate (viab-economy R5) holds laying protein only
// until the colony's first winter; after it the carbohydrate the colony wants counts the path to its winter need as
// stock still wanted (needs.ts carbStockWanted = max(target days x rate, winterPathC)), read by the forage want and so
// by the tenders. One rule asks for the carbohydrate, none withholds eggs for it.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { WINTER_RESERVE_FROM_D28 } from '@/sim/balance';
import { colonySlotBit } from '@/sim/entities';
import { herdSourceOf } from '@/sim/ecology';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { daysPerYear, TICKS_PER_DAY } from '@/sim/time';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { colonyHasWintered, layingProteinPermitted, winterReserveShort } from './queen';
import { setClimateOverride } from './envAdapter';
import { carbStockWanted, needRates, targetDays, WINTER_PATH_C_KEY } from './needs';
import { forageWant, knownCapacity, tendDemand } from './allocation/demand';
import { coreOf } from './core';

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

/** A colony of 15 with two known herds (4 slots), C rate 1, stock stockC; the winter path set to pathC. */
function herdColony(stockC: number, pathC: number) {
  const { sim, plants } = plantSim({ workers: 15, sizeBu: 400, herbs: [{ dx: 60, dz: 30 }, { dx: 90, dz: 30 }], seed: 1 });
  const col = sim.state.colonies[0];
  for (const p of plants) herdSourceOf(sim, addHerd(sim, p, 20, { kMax: 70 }))!.discoveredBy |= colonySlotBit(sim, col.id);
  col.needs.rateC = 1; col.needs.rateP = 0.5; col.needs.needC = 0; col.needs.needP = 0.5;
  col.stores.c = stockC; col.stores.p = 0;
  coreOf(col).acc[WINTER_PATH_C_KEY] = pathC;
  return { sim, col };
}

describe('R40 a / R41: the carbohydrate stock wanted covers the path to the winter', () => {
  it('stock over target x rate but under winterPathC: the want and the tenders rise', () => {
    const base = herdColony(40, 0);
    const targetLoads = targetDays(base.col).c * needRates(base.col).c;
    expect(base.col.stores.c).toBeGreaterThanOrEqual(targetLoads);
    expect(carbStockWanted(base.col)).toBeCloseTo(targetLoads, 9);
    const tendBase = tendDemand(base.sim, base.col, knownCapacity(base.sim, base.col), true);
    expect(tendBase).toBe(2); // the keep (tendDemand.test case 1)

    const path = herdColony(40, 60); // the same colony 20 loads under its path to the winter
    expect(carbStockWanted(path.col)).toBe(60);
    expect(forageWant(path.col).c).toBeGreaterThan(forageWant(base.col).c);
    expect(tendDemand(path.sim, path.col, knownCapacity(path.sim, path.col), true)).toBeGreaterThan(tendBase);
  });

  it('over its path and its target: unchanged', () => {
    const a = herdColony(40, 0), b = herdColony(40, 30);
    expect(forageWant(b.col).c).toBeCloseTo(forageWant(a.col).c, 9);
  });
});
