// Ruling R41 (colony-life direction 27a item 1, round 13): one carbohydrate stock wanted,
// carbStockWanted = max(target days x rate, winterPathC), read by the forage want (R40 a), by the carbohydrate need
// index behind the nutrient weights (needC counts the shortfall to it) and by the scout floor's "short" test. Sweep 12's
// we #3 went into winter with 1.07 C of 6.16: its foragers brought protein while carbohydrate stood under the winter
// path and protein over its own target.

import { describe, expect, it } from 'vitest';
import { LAYING_LARVAL_HUNGER_MAX } from '@/sim/balance';
import { addBrood, addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { coreOf } from './core';
import { carbStockWanted, forageRates, needRates, nutrientWeights, refreshNeedIndices, targetDays, WINTER_PATH_C_KEY } from './needs';
import { winterPathC } from './queen';
import { forageWant, knownCapacity, missingScoutFloor, nutrientShortfalls, scoutFloor } from './allocation/demand';
import { censusOf } from './census';

/** A colony of 12 on `doy` (summer days 8-14, autumn 15-21) with protein well over its target. */
function colony(season: 'summer' | 'autumn', day: number) {
  const sim = makeColonySim({ season, summerDay: day });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, royal);
  addWorkers(sim, 12, { chamber: royal });
  step(sim, 120);
  const col = colonyOf(sim);
  col.stores.p = 30;
  return { sim, col, royal };
}

/** Carbohydrate in store at `frac` of the winter path; the path written as the colony cycle writes it. */
function underPath(sim: ReturnType<typeof colony>['sim'], col: ReturnType<typeof colony>['col'], frac: number): number {
  const path = winterPathC(sim, col);
  coreOf(col).acc[WINTER_PATH_C_KEY] = path;
  col.stores.c = frac * path;
  refreshNeedIndices(col);
  return path;
}

describe('R41: one carbohydrate stock wanted', () => {
  it('doy 16, C under the winter path, P over its target, no hungry larvae: wC > wP', () => {
    const { sim, col } = colony('autumn', 2); // doy 16
    const path = underPath(sim, col, 0.3);
    expect(path).toBeGreaterThan(0);
    expect(col.stores.p).toBeGreaterThan(targetDays(col).p * forageRates(col).p); // protein over target
    expect(col.needs.needP).toBe(0);
    expect(col.needs.needC).toBeGreaterThan(0);
    const w = nutrientWeights(col);
    expect(w.wC).toBeGreaterThan(w.wP);
  });

  it('doy 14, carbohydrate over its days-of-stock target but under the path: needC > 0 (it read 0 before R41)', () => {
    const { sim, col } = colony('summer', 7); // doy 14: path = half the winter need
    const path = winterPathC(sim, col);
    coreOf(col).acc[WINTER_PATH_C_KEY] = path;
    const targetLoads = targetDays(col).c * needRates(col).c;
    expect(path).toBeGreaterThan(targetLoads); // the case R41 is about: the path asks more than the stock target
    col.stores.c = (targetLoads + path) / 2;
    refreshNeedIndices(col);
    expect(carbStockWanted(col)).toBeCloseTo(path, 9);
    expect(col.needs.needC).toBeCloseTo(1 - col.stores.c / path, 9);
    expect(nutrientWeights(col).wC).toBeGreaterThan(nutrientWeights(col).wP);
  });

  it('hungry larvae under the same carbohydrate shortfall: protein is still asked for at its rate', () => {
    const { sim, col, royal } = colony('autumn', 2);
    addBrood(sim, 'larva', 6, royal, 0.3);
    step(sim, 1200); // the larvae get hungry and enter the colony's rates
    for (const b of sim.stores.brood.list) if (b.alive && b.stage === 'larva') b.hunger = 1;
    expect(censusOf(sim, col.id).meanLarvalHunger).toBeGreaterThan(LAYING_LARVAL_HUNGER_MAX);
    underPath(sim, col, 0.3);
    col.stores.p = 30; // still over the protein target (the larvae eat from it)
    refreshNeedIndices(col);
    const want = forageWant(col), w = nutrientWeights(col);
    // the split: protein over its target has no refill want and base weight; carbohydrate under its path carries the
    // refill and the weight; protein keeps its rate in the forage want (and in the intake target)
    expect(want.p).toBeGreaterThan(0);
    expect(want.p).toBeCloseTo(forageRates(col).p, 9);
    expect(want.c).toBeGreaterThan(want.p);
    expect(w.wC).toBeGreaterThan(w.wP);
  });

  it('the scout floor counts carbohydrate missing for a colony under its path that knows no live carbohydrate source', () => {
    const { sim, col } = colony('autumn', 2);
    underPath(sim, col, 0.3);
    const known = knownCapacity(sim, col);
    expect(known.loadsC).toBe(0);
    expect(nutrientShortfalls(col, known).c).toBe(1);
    expect(nutrientShortfalls(col, known).p).toBe(0); // protein over target: not the trigger
    expect(scoutFloor(col, known, { c: 0, p: 1 }, 12)).toBe(missingScoutFloor(12));
  });
});
