// Rulings R32b (direction 21) and R35 (direction 22): the colony forages for the brood its queen could have, not only
// the brood it has. A prospective protein demand = LARVA_P_REQ x the laying the gates withhold (potential less what
// is released), loads per gd, enters the forage side (desired protein share, protein need index, intake target,
// scouts' shortfall, the protein larder) and never the laying gates' days of stock. R35: it is bounded by the
// workforce (PROSPECTIVE_P_PER_WORKER x workers), it ramps in with the carbohydrate in store over its stock target
// (none at 1 x, all at 2 x) and is 0 under the path to the winter need; a colony short of sugar values sugar whatever
// its protein demand; the store's spoilage is no appetite on the forage side; and its forage demand is served after
// every other task, so the tenders' head-count does not depend on it.
import { describe, expect, it } from 'vitest';
import { LARVA_P_REQ, NEED_RATE_P_MIN, NUTRIENT_W_BASE, NUTRIENT_W_GAIN, PROSPECTIVE_P_PER_WORKER } from '@/sim/balance';
import { WINTER_STORES_TARGET_MARGIN } from '@/sim/balance/lifecycle';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { accSet, coreOf } from './core';
import {
  FORAGE_RATE_P_KEY, PROSPECTIVE_P_KEY, daysOfStock, desiredProteinShare, forageRates, intakeTarget, needRates,
  nutrientWeights, refreshNeedIndices, targetDays, updateNeeds,
} from './needs';
import { layingReleaseShare, prospectiveProteinRate, winterPathC } from './queen';
import { winterStoresNeed } from './overwinter/storesNeed';
import { computeTargets } from './allocation/targets';
import { ti } from './taskIdx';

function setup(o: Parameters<typeof makeColonySim>[0] = { summerDay: 3 }) {
  const sim = makeColonySim(o);
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, royal);
  addWorkers(sim, 12, { chamber: royal });
  step(sim, 120);
  return { sim, col: colonyOf(sim) };
}

/** Carbohydrate in store for `x` times the C stock target's days on the plain C rate. */
const cAt = (col: ReturnType<typeof colonyOf>, x: number) => x * targetDays(col).c * needRates(col).c;

describe('R32b / R35 prospective protein demand', () => {
  it('a summer queen held back by an empty protein store: LARVA_P_REQ per withheld egg, bounded by the workforce', () => {
    const { sim, col } = setup();
    const acc = coreOf(col).acc;
    col.stores.c = 40; col.stores.p = 0.5; // plenty of carbohydrate, almost no protein
    expect(daysOfStock(col).c).toBeGreaterThan(2 * targetDays(col).c);
    expect(col.stores.c).toBeGreaterThan(winterPathC(sim, col));
    accSet(coreOf(col), 'lay.potential', 0.2); // a small withheld laying: under the workforce bound
    const share = layingReleaseShare(sim, col);
    expect(share).toBeLessThan(1);
    expect(prospectiveProteinRate(sim, col)).toBeCloseTo(LARVA_P_REQ * 0.2 * (1 - share), 9);
    accSet(coreOf(col), 'lay.potential', 20); // R32b asked 1.2 x 20 = 24 loads/gd of a colony of 12
    const workers = coreOf(col).workers;
    expect(workers).toBe(12);
    const pros = prospectiveProteinRate(sim, col);
    expect(pros).toBeCloseTo(PROSPECTIVE_P_PER_WORKER * workers, 9);
    acc[PROSPECTIVE_P_KEY] = pros;
    const daysBefore = daysOfStock(col), plainP = Math.max(NEED_RATE_P_MIN, acc[FORAGE_RATE_P_KEY] ?? col.needs.rateP);
    refreshNeedIndices(col);
    expect(forageRates(col).p).toBeCloseTo(plainP + pros, 9);
    expect(col.needs.needP).toBeCloseTo(1 - col.stores.p / (targetDays(col).p * (plainP + pros)), 9);
    expect(intakeTarget(col)).toBeGreaterThan(intakeTarget(col, false));
    // ... the laying gates do not count it (their days of stock stay on the plain rates)
    expect(daysOfStock(col)).toEqual(daysBefore);
  });

  it('carbohydrate ramp: nothing at 1 x the C stock target, half at 1.5 x, all of it at 2 x', () => {
    const { sim, col } = setup();
    accSet(coreOf(col), 'lay.potential', 20);
    col.stores.p = 0.5;
    const full = () => { col.stores.c = cAt(col, 3); return prospectiveProteinRate(sim, col); };
    const f = full();
    expect(f).toBeGreaterThan(0);
    col.stores.c = cAt(col, 1);
    expect(prospectiveProteinRate(sim, col)).toBe(0);
    col.stores.c = cAt(col, 1.5);
    expect(winterPathC(sim, col)).toBeLessThan(col.stores.c); // doy 10: the winter path asks little yet
    expect(prospectiveProteinRate(sim, col)).toBeCloseTo(0.5 * f, 6);
    col.stores.c = cAt(col, 2);
    expect(prospectiveProteinRate(sim, col)).toBeCloseTo(f, 6);
  });

  it('the winter path: nothing asked in spring, half the winter need by doy 14, all of it by doy 21', () => {
    const spring = setup({ season: 'spring', summerDay: 5 }); // doy 5
    expect(winterPathC(spring.sim, spring.col)).toBe(0);
    const d14 = setup({ summerDay: 7 }); // doy 14
    const need14 = winterStoresNeed(d14.sim, d14.col).needC * WINTER_STORES_TARGET_MARGIN;
    expect(need14).toBeGreaterThan(0);
    expect(winterPathC(d14.sim, d14.col)).toBeCloseTo(0.5 * need14, 6);
    const d21 = setup({ season: 'autumn', summerDay: 7 }); // doy 21
    const { sim, col } = d21;
    const need21 = winterStoresNeed(sim, col).needC * WINTER_STORES_TARGET_MARGIN;
    expect(winterPathC(sim, col)).toBeCloseTo(need21, 6);
    // a colony far over its C stock target but under the path to the winter asks no protein for eggs not laid
    accSet(coreOf(col), 'lay.potential', 20);
    col.stores.p = 0.5;
    col.needs.rateC = 0; // the C need rate at its floor: any store is far over the C stock target
    col.stores.c = 0.9 * need21;
    expect(daysOfStock(col).c).toBeGreaterThan(2 * targetDays(col).c);
    expect(prospectiveProteinRate(sim, col)).toBe(0);
    col.stores.c = 1.1 * need21;
    expect(prospectiveProteinRate(sim, col)).toBeGreaterThan(0);
  });

  it('outside the laying season (potential 0) there is no prospective demand', () => {
    const { sim, col } = setup();
    col.stores.c = 40; col.stores.p = 0.5;
    accSet(coreOf(col), 'lay.potential', 0);
    expect(prospectiveProteinRate(sim, col)).toBe(0);
  });

  it('R35 point 3: a colony short of sugar values sugar at base + gain whatever its protein share', () => {
    const { col } = setup();
    for (const sP of [0.1, 0.5, 0.97]) {
      col.needs.needC = 1; col.needs.sP = sP;
      expect(nutrientWeights(col).wC).toBeCloseTo(NUTRIENT_W_BASE + NUTRIENT_W_GAIN, 9);
    }
    // unchanged where 1 - sP is the larger term
    col.needs.needC = 0.3; col.needs.sP = 0.2;
    expect(nutrientWeights(col).wC).toBeCloseTo(NUTRIENT_W_BASE + 0.3 * 0.8 * NUTRIENT_W_GAIN, 9);
    col.needs.needC = 0.6; col.needs.sP = 0.9;
    expect(nutrientWeights(col).wC).toBeCloseTo(NUTRIENT_W_BASE + 0.6 * 0.6 * NUTRIENT_W_GAIN, 9);
  });

  it('R35b: a colony short of protein values protein at base + gain whatever its protein share', () => {
    const { col } = setup();
    col.needs.needC = 0; col.needs.needP = 1; col.needs.sP = 0.1;
    expect(nutrientWeights(col).wP).toBeCloseTo(NUTRIENT_W_BASE + NUTRIENT_W_GAIN, 9);
    col.needs.needP = 0;
    expect(nutrientWeights(col).wP).toBeCloseTo(NUTRIENT_W_BASE, 9);
    // both needs at 1: equal weights, whatever the share
    for (const sP of [0.05, 0.5, 0.95]) {
      col.needs.needC = 1; col.needs.needP = 1; col.needs.sP = sP;
      const w = nutrientWeights(col);
      expect(w.wP).toBeCloseTo(w.wC, 9);
    }
    // unchanged where sP is the larger term
    col.needs.needP = 0.3; col.needs.sP = 0.7;
    expect(nutrientWeights(col).wP).toBeCloseTo(NUTRIENT_W_BASE + 0.3 * 0.7 * NUTRIENT_W_GAIN, 9);
  });

  it('R35 point 4: the store spoiling is no appetite on the forage side (a stocked larder, no larvae, no laying)', () => {
    const { col } = setup();
    const acc = coreOf(col).acc;
    acc[PROSPECTIVE_P_KEY] = 0;
    col.stores.p = 13; // a big protein store spoiling 1.0 load/gd, nothing eating it
    for (let i = 0; i < 400; i++) updateNeeds(col, { rateC: 0.6, rateP: 1.0 + 0.01, rateForageP: 0.01 }, 0.05);
    expect(needRates(col).p).toBeGreaterThan(0.9); // the GDD's rate (laying gates, starvation) keeps the spoilage
    expect(forageRates(col).p).toBeCloseTo(NEED_RATE_P_MIN, 6); // the forage side: the floor
    expect(col.needs.needP).toBe(0);
    expect(desiredProteinShare(col)).toBeLessThan(0.1);
  });

  it('R35 point 5: the tenders head-count is the same with and without the prospective forage demand', () => {
    const { col } = setup();
    const T = (t: string) => ti(t as never);
    const base = () => {
      col.alloc.demand.fill(0);
      col.alloc.demand[T('nurse')] = 3; col.alloc.demand[T('queen-care')] = 1; col.alloc.demand[T('store')] = 1;
      col.alloc.demand[T('tend')] = 6; col.alloc.demand[T('scout')] = 2; col.alloc.demand[T('dig')] = 1;
    };
    for (const workers of [8, 12, 16, 30]) {
      base(); col.alloc.demand[T('forage')] = 2.6;
      computeTargets(col, workers, false);
      const without = Array.from(col.alloc.target);
      base(); col.alloc.demand[T('forage')] = 2.6 + 6.7; // R32b's prospective part, as on pp #3 (9.3 against 2.6)
      computeTargets(col, workers, false, undefined, false, 6.7);
      const withP = Array.from(col.alloc.target);
      for (const t of ['nurse', 'queen-care', 'store', 'tend', 'scout', 'dig']) expect(withP[T(t)], `${t} at ${workers}`).toBe(without[T(t)]);
      expect(withP[T('forage')]).toBeGreaterThanOrEqual(without[T('forage')]);
      expect(withP.reduce((a, b) => a + b, 0)).toBe(workers);
    }
  });
});
