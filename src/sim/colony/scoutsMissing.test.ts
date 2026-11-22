// R38 item 1 (colony-life direction 24): scouts for a missing nutrient. A nutrient is missing while the colony needs
// it and its known capacity covers under half of its forage want; then the scout demand is at least
// max(2 (1 below 8 workers), 0.2 x workers), capped at 0.25 x workers, and the auto allocation fills it after the
// brood's care, before `forage`.
import { describe, expect, it } from 'vitest';
import { SCOUT_MAX_FRAC, SMALL_SCOUTS_MIN } from '@/sim/balance';
import { createSource } from '@/sim/ecology/sources/spawn';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { coreOf } from './core';
import { censusOf } from './census';
import { surfaceActivityOf } from './envAdapter';
import { SCOUT_FLOOR_KEY, computeDemand, missingScoutFloor } from './allocation/demand';
import { computeTargets } from './allocation/targets';
import { ti } from './taskIdx';

const T = (t: string) => ti(t as never);

/** A summer-noon colony of `workers` that knows one flower; protein wanted, none known. */
function setup(workers: number) {
  const sim = makeColonySim({ summerDay: 3 });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, royal);
  addWorkers(sim, workers, { chamber: royal });
  step(sim, 120);
  const col = colonyOf(sim);
  const flower = createSource(sim, { variant: 'flower', pos: { x: 300, y: 0, z: 300 } });
  col.knownSourceIds.push(flower.id);
  col.stores.c = 40; col.stores.p = 0;
  col.needs.needC = 0; col.needs.needP = 0.8;
  return { sim, col };
}

function demandAndTargets(sim: ReturnType<typeof setup>['sim'], col: ReturnType<typeof setup>['col'], workers: number) {
  computeDemand(sim, col, censusOf(sim, col.id));
  const floor = coreOf(col).acc[SCOUT_FLOOR_KEY] ?? 0;
  // a busy colony: herds and sugar ask for more workers than it has, so the fill order decides
  col.alloc.demand[T('tend')] = workers; col.alloc.demand[T('forage')] = Math.max(col.alloc.demand[T('forage')], workers);
  computeTargets(col, workers, false, undefined, false, 0, floor > 0);
  return { floor, scoutDemand: col.alloc.demand[T('scout')], scouts: col.alloc.target[T('scout')] };
}

describe('R38 item 1: scouts for a missing nutrient', () => {
  it('15 workers, sugar known, no protein known, protein needed: 3 scouts in the targets, before forage', () => {
    const { sim, col } = setup(15);
    expect(surfaceActivityOf(sim, col.species)).toBeGreaterThan(0.1);
    const r = demandAndTargets(sim, col, 15);
    expect(r.floor).toBeCloseTo(3, 9);
    expect(r.scouts).toBe(3);
  });

  it('6 workers: the missing-nutrient floor is one scout (the small-colony floor of 2 stays on top of it)', () => {
    expect(missingScoutFloor(6)).toBeCloseTo(1.2, 9);
    const { sim, col } = setup(6);
    const r = demandAndTargets(sim, col, 6);
    expect(r.floor).toBeCloseTo(1.2, 9);
    // the small-colony rule (viab-economy R3) still asks 2 scouts until 2 sources of each needed nutrient are known
    expect(r.scouts).toBe(SMALL_SCOUTS_MIN);
    // the floor alone, in a busy colony: 1 scout, served before forage
    col.alloc.demand.fill(0);
    col.alloc.demand[T('nurse')] = 2; col.alloc.demand[T('forage')] = 12; col.alloc.demand[T('scout')] = 1.2;
    computeTargets(col, 6, false, undefined, false, 0, true);
    expect(col.alloc.target[T('scout')]).toBe(1);
    computeTargets(col, 6, false, undefined, false, 0, false);
    expect(col.alloc.target[T('scout')]).toBe(0); // GDD order: forage took them first
  });

  it('the floor is capped at a quarter of the workers and at least 2 from 8 workers', () => {
    expect(missingScoutFloor(8)).toBe(2);
    expect(missingScoutFloor(40)).toBe(8);
    expect(missingScoutFloor(4)).toBe(1);
    expect(missingScoutFloor(3)).toBe(0.75);
  });

  it('everything known: no floor, the present base demand', () => {
    const { sim, col } = setup(15);
    for (let i = 0; i < 2; i++) {
      const c = createSource(sim, { variant: 'large-carcass', pos: { x: 320 + 40 * i, y: 0, z: 300 } });
      col.knownSourceIds.push(c.id);
    }
    const r = demandAndTargets(sim, col, 15);
    expect(r.floor).toBe(0);
    expect(r.scoutDemand).toBeLessThanOrEqual(Math.max(SCOUT_MAX_FRAC * 15, SMALL_SCOUTS_MIN));
  });

  it('a colony that needs nothing has no floor', () => {
    const { sim, col } = setup(15);
    col.needs.needP = 0;
    expect(demandAndTargets(sim, col, 15).floor).toBe(0);
  });
});
