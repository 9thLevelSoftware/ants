// Ruling R32b (direction 21): the colony forages for the brood its queen could have, not only the brood it has. A
// prospective protein demand = LARVA_P_REQ x the laying the gates withhold (potential less what is released), loads
// per gd, enters the forage side (desired protein share, protein need index, intake target, scouts' shortfall, the
// protein larder) and never the laying gates' days of stock; carbohydrate comes first while the C in store is under
// the adults' need for the days of stock target.
import { describe, expect, it } from 'vitest';
import { LARVA_P_REQ } from '@/sim/balance';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { accSet, coreOf } from './core';
import { PROSPECTIVE_P_KEY, daysOfStock, desiredProteinShare, forageRates, intakeTarget, needRates, refreshNeedIndices, targetDays } from './needs';
import { layingReleaseShare, prospectiveProteinRate } from './queen';

function setup() {
  const sim = makeColonySim({ summerDay: 3 });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, royal);
  addWorkers(sim, 12, { chamber: royal });
  step(sim, 120);
  return { sim, col: colonyOf(sim) };
}

describe('R32b prospective protein demand', () => {
  it('a summer queen held back by an empty protein store: the forage side asks LARVA_P_REQ per withheld egg', () => {
    const { sim, col } = setup();
    const acc = coreOf(col).acc;
    col.stores.c = 40; col.stores.p = 0.5; // plenty of carbohydrate, almost no protein
    accSet(coreOf(col), 'lay.potential', 20);
    const share = layingReleaseShare(sim, col);
    expect(share).toBeLessThan(1);
    const pros = prospectiveProteinRate(sim, col);
    expect(pros).toBeCloseTo(LARVA_P_REQ * 20 * (1 - share), 9);
    acc[PROSPECTIVE_P_KEY] = pros;
    const base = needRates(col), daysBefore = daysOfStock(col);
    refreshNeedIndices(col);
    // the forage side counts it ...
    expect(forageRates(col).p).toBeCloseTo(base.p + pros, 9);
    expect(desiredProteinShare(col)).toBeGreaterThan(0.9);
    expect(col.needs.needP).toBeCloseTo(1 - col.stores.p / (targetDays(col).p * (base.p + pros)), 9);
    expect(intakeTarget(col)).toBeGreaterThan(base.c + base.p + pros);
    // ... the laying gates do not (their days of stock stay on the plain rates)
    expect(daysOfStock(col)).toEqual(daysBefore);
  });

  it('carbohydrate first: nothing prospective while C in store is under the adults need for the stock target', () => {
    const { sim, col } = setup();
    accSet(coreOf(col), 'lay.potential', 20);
    const acc = coreOf(col).acc;
    const adultC = (acc['inst.upkeepC'] ?? 0) + (acc['inst.queenC'] ?? 0);
    expect(adultC).toBeGreaterThan(0);
    col.stores.p = 0.5;
    col.stores.c = 0.9 * adultC * targetDays(col).c;
    expect(prospectiveProteinRate(sim, col)).toBe(0);
    col.stores.c = 1.1 * adultC * targetDays(col).c;
    expect(prospectiveProteinRate(sim, col)).toBeGreaterThan(0);
  });

  it('outside the laying season (potential 0) there is no prospective demand', () => {
    const { sim, col } = setup();
    col.stores.c = 40; col.stores.p = 0.5;
    accSet(coreOf(col), 'lay.potential', 0);
    expect(prospectiveProteinRate(sim, col)).toBe(0);
  });
});
