// Reviewer's checks of winter-sugar arm T (the tend floor, D45): the positive path of demand.ts tendFloor on real
// herds (the implementer's tests only inject a floor value or check the zero cases), its wiring through
// computeDemand's core.acc key, and planTargets' edge cases (threat order, hygiene order, the outside pool, a floor
// above the tend demand, and demand that fits the workforce).
import { describe, expect, it } from 'vitest';
import { colonySlotBit } from '@/sim/entities';
import { herdSourceOf } from '@/sim/ecology';
import { surfaceActivityOf } from '../envAdapter';
import { addHerd, plantSim } from '@/sim/ecology/plants/testkit';
import { SCOUT_MIN_ACTIVITY } from '@/sim/balance';
import { censusOf } from '../census';
import { coreOf } from '../core';
import { ti } from '../taskIdx';
import { computeDemand, TEND_FLOOR_KEY, tendFloor, tendKeep } from './demand';
import { computeTargets } from './targets';

const T = (t: string) => ti(t as never);

/** A colony of 15 with herds of the given sizes; `known` of them discovered by it. */
function colonyWithHerds(aphids: number[], known: number, needC: number) {
  const herbs = aphids.map((_, i) => ({ dx: 60 + 30 * i, dz: 30 }));
  const { sim, plants } = plantSim({ workers: 15, sizeBu: 400, herbs, seed: 1 });
  const col = sim.state.colonies[0];
  const herds = aphids.map((a, i) => {
    const h = addHerd(sim, plants[i], a, { kMax: a + 50 });
    if (i < known) herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
    return h;
  });
  col.needs.rateC = 1; col.needs.rateP = 0.5; col.needs.needC = needC; col.needs.needP = 0.5;
  col.stores.c = 0; col.stores.p = 0;
  return { sim, col, herds };
}

describe('the tend floor on real herds (reviewer, winter-sugar arm T)', () => {
  it('two known herds of 20 and 250 aphids: the floor is the sum of their keeps, at most the tend demand', () => {
    const { sim, col } = colonyWithHerds([20, 250], 2, 1);
    const keep = tendKeep(20) + tendKeep(250);
    expect(keep).toBe(3);
    expect(tendFloor(sim, col, true, 10)).toBe(keep);
    expect(tendFloor(sim, col, true, 2)).toBe(2);
    expect(tendFloor(sim, col, true, 0)).toBe(0);
  });

  it('a herd the colony has not discovered adds nothing', () => {
    const { sim, col } = colonyWithHerds([20, 20], 1, 1);
    expect(tendFloor(sim, col, true, 10)).toBe(tendKeep(20));
  });

  it('computeDemand writes the floor to core.acc from its own tend demand and workable surface', () => {
    const { sim, col } = colonyWithHerds([20, 20], 2, 1);
    computeDemand(sim, col, censusOf(sim, col.id));
    const workable = surfaceActivityOf(sim, col.species) >= SCOUT_MIN_ACTIVITY;
    const want = tendFloor(sim, col, workable, col.alloc.demand[T('tend')]);
    expect(coreOf(col).acc[TEND_FLOOR_KEY]).toBe(want);
    expect(workable, "surface workable at tick 0 of plantSim").toBe(true);
    expect(want).toBe(2);
  });
});

describe('planTargets with a tend floor (reviewer)', () => {
  function col10() {
    const { sim } = plantSim({ workers: 10, sizeBu: 160, seed: 1 });
    return sim.state.colonies[0];
  }
  const fill = (d: Float32Array) => {
    d.fill(0);
    d[T('nurse')] = 6; d[T('queen-care')] = 1; d[T('forage')] = 9; d[T('store')] = 2; d[T('tend')] = 8;
  };

  it('under threat (guard first) the floor is still served', () => {
    const col = col10();
    fill(col.alloc.demand);
    col.alloc.demand[T('guard')] = 2;
    computeTargets(col, 10, true, undefined, false, 0, 0, 0, 3);
    expect(col.alloc.target[T('tend')]).toBe(3);
  });

  it('with brood among waste (haul after queen-care) the floor is served after the haul half', () => {
    const col = col10();
    fill(col.alloc.demand);
    col.alloc.demand[T('haul')] = 2;
    computeTargets(col, 10, false, undefined, true, 0, 0, 0, 3);
    expect(col.alloc.target[T('tend')]).toBe(3);
    expect(col.alloc.target[T('haul')]).toBeGreaterThanOrEqual(1);
  });

  it('the floor never takes more than the outside pool and never sums over the workforce', () => {
    const col = col10();
    fill(col.alloc.demand);
    computeTargets(col, 10, false, { all: 10, adult: 10, outside: 1 }, false, 0, 0, 0, 3);
    const t = col.alloc.target;
    expect(t[T('tend')] + t[T('forage')] + t[T('scout')]).toBeLessThanOrEqual(1);
    let sum = 0;
    for (let i = 0; i < t.length; i++) { expect(t[i]).toBeGreaterThanOrEqual(0); sum += t[i]; }
    expect(sum).toBeLessThanOrEqual(10);
  });

  it('a floor above the tend demand is capped by the demand', () => {
    const col = col10();
    fill(col.alloc.demand);
    col.alloc.demand[T('tend')] = 2;
    computeTargets(col, 10, false, undefined, false, 0, 0, 0, 5);
    expect(col.alloc.target[T('tend')]).toBe(2);
  });

  it('demand that fits the workforce: the floor changes nothing', () => {
    const col = col10();
    const d = col.alloc.demand;
    d.fill(0);
    d[T('nurse')] = 2; d[T('forage')] = 3; d[T('tend')] = 2;
    computeTargets(col, 10, false, undefined, false, 0, 0, 0, 0);
    const before = Array.from(col.alloc.target);
    computeTargets(col, 10, false, undefined, false, 0, 0, 0, 2);
    expect(Array.from(col.alloc.target)).toEqual(before);
  });
});
