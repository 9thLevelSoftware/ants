// Direction 27a item 2 (colony-life round 13): the forage demand divides the forage want by the loads a forager on
// `forage` actually brings home per game day (all assigned foragers, failed trips and waits included), not by a
// yield held up by a permanent prior. Before round 13: (loads + 1.5) / (forager-days + 1) for good.

import { describe, expect, it } from 'vitest';
import { YIELD_PER_FORAGER_DEFAULT, YIELD_PER_FORAGER_MIN } from '@/sim/balance';
import { yieldEstimate } from './economy';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { computeDemand, knownCapacity } from './allocation/demand';
import { censusOf } from './census';
import { intakeTarget } from './needs';
import { ti } from './taskIdx';
import { createSource } from '@/sim/ecology/sources/spawn';

describe('direction 27a item 2: the realised yield per forager', () => {
  it('no data: the default; one forager-day and more: the realised loads per forager-day alone', () => {
    expect(yieldEstimate(0, 0)).toBe(YIELD_PER_FORAGER_DEFAULT);
    expect(yieldEstimate(0.4, 0.5)).toBeCloseTo((0.4 + 0.5 * YIELD_PER_FORAGER_DEFAULT) / 1, 9);
    // 5 foragers over the last game day bringing 4 loads in all: 0.8 a forager-day (the old form read 0.92)
    expect(yieldEstimate(4, 5)).toBeCloseTo(0.8, 9);
    expect(yieldEstimate(2, 5)).toBeCloseTo(0.5, 9);
    expect(yieldEstimate(0, 5)).toBe(YIELD_PER_FORAGER_MIN);
  });

  it('foragers that succeed on half their trips: the forage demand is twice the all-succeed case (under the cap)', () => {
    const sim = makeColonySim();
    const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
    establishQueen(sim, royal);
    addWorkers(sim, 30, { chamber: royal });
    step(sim, 120);
    const col = colonyOf(sim);
    col.stores.c = 0; col.stores.p = 0;
    // two large known carcasses and two sugar spills keep both nutrients' known-capacity caps (R44) out of the way
    for (const [dx, variant] of [[200, 'large-carcass'], [260, 'large-carcass'], [230, 'sugar-granules'], [290, 'sugar-granules']] as const) {
      const s = createSource(sim, { variant, pos: { x: 100 + dx, y: 0, z: 100 } });
      col.knownSourceIds.push(s.id);
    }
    const demand = (y: number) => {
      col.yieldPerForager = y;
      return computeDemand(sim, col, censusOf(sim, col.id))[ti('forage')];
    };
    // 6 foragers: all trips succeed (1.2 loads a day each) against half (0.6)
    const full = yieldEstimate(6 * 1.2, 6), half = yieldEstimate(6 * 0.6, 6);
    expect(half).toBeCloseTo(full / 2, 9);
    col.yieldPerForager = half;
    const cap = knownCapacity(sim, col).ants + 1;
    expect(intakeTarget(col) / half).toBeLessThan(cap);
    expect(demand(half)).toBeCloseTo(2 * demand(full), 5);
  });
});
