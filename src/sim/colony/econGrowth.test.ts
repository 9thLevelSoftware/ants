// econ-growth rules (docs/design/tasks/econ-growth.md R9, R10) on the colony test sim: need-driven departures per
// nutrient at every colony size, the per-nutrient scout shortfall, the supply-bounded known capacity and the
// small-colony forager floor. Cheap fixtures; the whole-game effect is measured by tools/sim/life.ts.

import { describe, expect, it } from 'vitest';
import type { FoodVariant, Sim } from '@/sim/types';
import { ti } from './taskIdx';
import {
  FORAGER_TRIPS_PER_GD, LEAD_VALID_S, NEED_SPONT_MULT, NEED_URGENT_FROM, NEED_URGENT_FULL, SPONT_RATE_MAX_S, PHYSIO_EVERY, SCOUT_SHORTFALL_FRAC,
  SOURCE_SLOT_FORAGERS, LARVA_C_REQ, LARVA_P_REQ,
} from '@/sim/balance';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim } from './testkit';
import {
  antSpontMultiplier, needSpontMult, privateSourceNeed, recordDeliveryCount, spontaneousMultiplier, spontaneousRate,
} from './activation';
import { TICKS_PER_SECOND } from '@/sim/time';
import { accGet, coreOf } from './core';
import { computeDemand, knownCapacity, scoutShortfall } from './allocation/demand';
import { censusOf } from './census';
import { layingReleaseShare, winterReserveShort } from './queen';
import { nurseLoadMix } from './index';
import { setD28 } from '@/sim/ecology/plants/testkit';

function colony(workers: number): Sim {
  const sim = makeColonySim({ noAllocation: true });
  const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
  establishQueen(sim, ch);
  addWorkers(sim, workers, { chamber: ch, ageGd: 8 });
  for (let i = 0; i <= PHYSIO_EVERY; i++) sim.tick(); // one colony cycle: the worker count is known
  return sim;
}

/** A source of the variant 100 BU from the nest, known to the colony; returns its id. */
function knownSource(sim: Sim, kind: 'sugar' | 'carrion' | 'nectar', variant: FoodVariant, units: number): number {
  const col = colonyOf(sim);
  const x = 100 + 100 * sim.world.bu, z = 100;
  sim.enqueue({ type: 'cheat.spawnFood', kind, variant, pos: { x, y: sim.field.height(x, z), z }, units, stage: null });
  sim.applyPendingCommands();
  const s = sim.state.sources[sim.state.sources.length - 1];
  col.knownSourceIds.push(s.id);
  return s.id;
}

function needs(sim: Sim, needC: number, needP: number): void {
  Object.assign(colonyOf(sim).needs, { needC, needP });
}

describe('R9/R10: need-driven departures per nutrient, every colony size (econ-growth review rule)', () => {
  it('colony urgency: above NEED_URGENT_FROM of a nutrient it knows a source of, every forager departs faster', () => {
    const sim = colony(300);
    const col = colonyOf(sim);
    knownSource(sim, 'sugar', 'sugary-spill', 50);
    needs(sim, 0, 1);
    expect(spontaneousMultiplier(sim, col)).toBe(1); // only carbohydrate known: protein is a scout matter
    knownSource(sim, 'carrion', 'insect-medium', 1);
    expect(spontaneousMultiplier(sim, col)).toBe(NEED_SPONT_MULT);
    needs(sim, 0, NEED_URGENT_FROM); // GDD 02 App. E 12 is set at need 0.5: the GDD's spontaneous rate
    expect(spontaneousMultiplier(sim, col)).toBe(1);
    needs(sim, 0, (NEED_URGENT_FROM + NEED_URGENT_FULL) / 2);
    expect(spontaneousMultiplier(sim, col)).toBeCloseTo((1 + NEED_SPONT_MULT) / 2, 9);
    needs(sim, 0, NEED_URGENT_FULL);
    expect(spontaneousMultiplier(sim, col)).toBeCloseTo(NEED_SPONT_MULT, 9);
    needs(sim, 0, 0);
    expect(spontaneousMultiplier(sim, col)).toBe(1); // stocked: the base rate
  });

  it('private information: a forager who knows a source of what the colony needs departs faster at any need', () => {
    const sim = colony(300);
    const col = colonyOf(sim);
    const carcass = knownSource(sim, 'carrion', 'insect-medium', 1);
    const sugar = knownSource(sim, 'sugar', 'sugary-spill', 50);
    const [fresh, worked, led, sweet] = sim.state.ants.filter((a) => a.caste === 'worker');
    needs(sim, 0, 0.3);
    worked.mem.knownSourceId = carcass;
    led.mem.lead = { sourceId: carcass, pos: { x: 0, y: 0, z: 0 }, tick: sim.state.tick };
    sweet.mem.knownSourceId = sugar;
    const m = (a: typeof fresh) => antSpontMultiplier(sim, col, a, spontaneousMultiplier(sim, col));
    expect(m(fresh)).toBe(1); // no source of her own: she waits for recruitment (GDD 02 §6.6)
    expect(m(worked)).toBeCloseTo(needSpontMult(0.3), 9);
    expect(m(led)).toBeCloseTo(needSpontMult(0.3), 9); // a valid lead is information too (§6.7)
    expect(m(sweet)).toBe(1); // she knows sugar; the colony is short of protein only
    expect(privateSourceNeed(sim, col, worked)).toBeCloseTo(0.3, 9);
    // an expired lead, or a source she found depleted, does not count
    led.mem.lead.tick = sim.state.tick - (LEAD_VALID_S + 1) * TICKS_PER_SECOND;
    expect(m(led)).toBe(1);
    worked.mem.depleted[0] = { sourceId: carcass, untilTick: sim.state.tick + 100 };
    expect(m(worked)).toBe(1);
    expect(needSpontMult(1)).toBe(NEED_SPONT_MULT);
  });

  it('GDD 02 §10.2: stacked multipliers do not take the mean wait below 30 s; the moderate-need wait is the GDD\'s', () => {
    expect(1 / spontaneousRate(1, 1, true, NEED_SPONT_MULT)).toBeCloseTo(1 / SPONT_RATE_MAX_S, 9);
    expect(1 / spontaneousRate(0.5, 1, false, 1)).toBeCloseTo(320, 6);
  });
});

describe('R9: the scout shortfall is per nutrient', () => {
  it('short of protein with only sugar known: full shortfall and scouts at the shortfall share', () => {
    const sim = colony(300);
    const col = colonyOf(sim);
    knownSource(sim, 'sugar', 'sugary-spill', 300);
    col.needs.rateC = 30; col.needs.rateP = 10;
    col.stores.c = 200; col.stores.p = 0;
    needs(sim, 0, 1);
    const known = knownCapacity(sim, col);
    expect(known.loadsP).toBeCloseTo(0, 6);
    expect(scoutShortfall(col, known)).toBe(1);
    const d = computeDemand(sim, col, censusOf(sim, col.id));
    expect(d[ti('scout')]).toBeGreaterThanOrEqual(SCOUT_SHORTFALL_FRAC * 300);
  });

  it('carbohydrate stocked and no protein need: no shortfall from the sugar it knows', () => {
    const sim = colony(300);
    const col = colonyOf(sim);
    knownSource(sim, 'sugar', 'sugary-spill', 300);
    needs(sim, 0, 0);
    expect(scoutShortfall(col, knownCapacity(sim, col))).toBe(0);
  });
});

describe('R10: known capacity is bounded by the food a source holds or refills', () => {
  it('a flower (refill 4 loads/gd, 2 slots) keeps about two foragers busy, not 2 x SOURCE_SLOT_FORAGERS', () => {
    const sim = colony(100);
    const id = knownSource(sim, 'nectar', 'flower', 1.5);
    const s = sim.stores.sources.get(id)!;
    const k = knownCapacity(sim, colonyOf(sim));
    expect(k.ants).toBeLessThan(Math.max(1, s.slots) * SOURCE_SLOT_FORAGERS);
    expect(k.ants).toBeCloseTo((s.units + s.refillPerGd) / 0.8 / FORAGER_TRIPS_PER_GD, 6);
  });

  it('a one-unit small carcass counts as a fraction of a forager', () => {
    const sim = colony(100);
    knownSource(sim, 'carrion', 'insect-small', 1);
    expect(knownCapacity(sim, colonyOf(sim)).ants).toBeCloseTo(1 / FORAGER_TRIPS_PER_GD, 6);
  });
});

describe('R3 floor: a small colony that knows a source sends at least one forager', () => {
  it('7 workers, one live source known, stores under target: forage demand >= 1', () => {
    const sim = colony(7);
    const col = colonyOf(sim);
    knownSource(sim, 'sugar', 'sugary-spill', 50);
    needs(sim, 0.5, 0.5);
    const d = computeDemand(sim, col, censusOf(sim, col.id));
    expect(Math.round(d[ti('forage')])).toBeGreaterThanOrEqual(1);
    expect(d[ti('scout')]).toBeGreaterThanOrEqual(2);
  });
});

describe('R10: yield per forager counts forage-task ants only (GDD 02 §6.2)', () => {
  it("a scout's or tender's delivery does not raise the foragers' yield", () => {
    const sim = colony(20);
    const col = colonyOf(sim);
    const [scout, forager] = sim.state.ants.filter((a) => a.caste === 'worker');
    scout.task = 'scout'; forager.task = 'forage';
    const y0 = accGet(coreOf(col), 'yield.loads');
    recordDeliveryCount(sim, scout, -1, 'sugar', 0.8, 0);
    expect(accGet(coreOf(col), 'yield.loads')).toBe(y0);
    recordDeliveryCount(sim, forager, -1, 'sugar', 0.8, 0);
    expect(accGet(coreOf(col), 'yield.loads')).toBeCloseTo(y0 + 0.8, 9);
  });
});

describe('R9: the winter reserve stops laying, never the feeding of larvae that exist', () => {
  it('small colony late in the season, pool short of its winter carbohydrate: laying protein withheld, nurses still load protein', () => {
    const sim = colony(12);
    const col = colonyOf(sim);
    setD28(sim, 15.5); // autumn, after WINTER_RESERVE_FROM_D28
    for (let i = 0; i <= PHYSIO_EVERY; i++) sim.tick();
    col.stores.c = 0.2; col.stores.p = 2;
    expect(winterReserveShort(sim, col, 12)).toBe(true);
    expect(layingReleaseShare(sim, col)).toBe(0);
    const mix = nurseLoadMix(sim, col.id, 0.6);
    // the larval protein share of the load, P_req / (P_req + C_req) (0.45 of 0.6 at 1.2 P per larva, 0.40 at R43's 0.8)
    expect(mix.p).toBeCloseTo((0.6 * LARVA_P_REQ) / (LARVA_P_REQ + LARVA_C_REQ), 9);
  });
});

describe('econ-growth: a nurse does not top a crop up with carbohydrate when protein is short', () => {
  it('pool P empty: the nurse load carries only the C share of a larval feed (no C-only crops for larvae)', () => {
    const sim = colony(12);
    const col = colonyOf(sim);
    col.stores.c = 10; col.stores.p = 0;
    const mix = nurseLoadMix(sim, col.id, 0.6);
    expect(mix.p).toBe(0);
    expect(mix.c).toBeCloseTo((0.6 * LARVA_C_REQ) / (LARVA_P_REQ + LARVA_C_REQ), 9); // C_req / (P_req + C_req) of the load
    col.stores.p = 10;
    const full = nurseLoadMix(sim, col.id, 0.6);
    expect(full.p + full.c).toBeCloseTo(0.6, 9);
  });
});
