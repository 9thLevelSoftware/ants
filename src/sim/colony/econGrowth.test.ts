// econ-growth rules (docs/design/tasks/econ-growth.md R9, R10) on the colony test sim: need-driven departures per
// nutrient at every colony size, the per-nutrient scout shortfall, the supply-bounded known capacity and the
// small-colony forager floor. Cheap fixtures; the whole-game effect is measured by tools/sim/life.ts.

import { describe, expect, it } from 'vitest';
import type { FoodVariant, Sim } from '@/sim/types';
import { ti } from './taskIdx';
import { FORAGER_TRIPS_PER_GD, NEED_SPONT_MULT, PHYSIO_EVERY, SCOUT_SHORTFALL_FRAC, SOURCE_SLOT_FORAGERS } from '@/sim/balance';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim } from './testkit';
import { recordDeliveryCount, spontaneousMultiplier } from './activation';
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

describe('R9/R10: need-driven departures per nutrient, every colony size', () => {
  it('a 300-worker colony short of protein that knows a carcass departs fast; knowing only sugar it does not', () => {
    const sim = colony(300);
    const col = colonyOf(sim);
    knownSource(sim, 'sugar', 'sugary-spill', 50);
    needs(sim, 0, 0.8);
    expect(spontaneousMultiplier(sim, col)).toBe(1); // only carbohydrate known: protein is a scout matter
    knownSource(sim, 'carrion', 'insect-medium', 1);
    expect(spontaneousMultiplier(sim, col)).toBe(NEED_SPONT_MULT);
  });

  it('a stocked colony (no need for either nutrient) keeps the base spontaneous rate', () => {
    const sim = colony(300);
    knownSource(sim, 'sugar', 'sugary-spill', 50);
    knownSource(sim, 'carrion', 'insect-medium', 1);
    needs(sim, 0, 0);
    expect(spontaneousMultiplier(sim, colonyOf(sim))).toBe(1);
    needs(sim, 0.4, 0);
    expect(spontaneousMultiplier(sim, colonyOf(sim))).toBe(NEED_SPONT_MULT);
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
    expect(mix.p).toBeGreaterThan(0.4);
  });
});

describe('econ-growth: a nurse does not top a crop up with carbohydrate when protein is short', () => {
  it('pool P empty: the nurse load carries only the C share of a larval feed (no C-only crops for larvae)', () => {
    const sim = colony(12);
    const col = colonyOf(sim);
    col.stores.c = 10; col.stores.p = 0;
    const mix = nurseLoadMix(sim, col.id, 0.6);
    expect(mix.p).toBe(0);
    expect(mix.c).toBeCloseTo(0.6 * 0.4 / 1.6, 9); // C_req / (P_req + C_req) of the load
    col.stores.p = 10;
    const full = nurseLoadMix(sim, col.id, 0.6);
    expect(full.p + full.c).toBeCloseTo(0.6, 9);
  });
});
