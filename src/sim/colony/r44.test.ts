// Ruling R44 (colony-life direction 28a, round 13): the forage demand counted per nutrient. Each nutrient's forage
// want over the realised yield, capped by the forager-equivalents of the known sources carrying it, summed, plus at
// most one forager for the want nothing known can take. A carbohydrate want with no carbohydrate source known no
// longer staffs protein trips.

import { describe, expect, it } from 'vitest';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { coreOf } from './core';
import { FORAGE_RATE_P_KEY, PROSPECTIVE_P_KEY } from './needs';
import { forageDemand, forageWant, type KnownCapacity } from './allocation/demand';

/** A colony of 15 wanting 6 loads C and 0.5 loads P a game day (stores over both targets: the wants are the rates). */
function colony() {
  const sim = makeColonySim();
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, royal);
  addWorkers(sim, 15, { chamber: royal });
  step(sim, 120);
  const col = colonyOf(sim);
  col.needs.rateC = 6;
  const acc = coreOf(col).acc;
  acc[FORAGE_RATE_P_KEY] = 0.5; acc[PROSPECTIVE_P_KEY] = 0;
  col.stores.c = 1000; col.stores.p = 1000;
  col.yieldPerForager = 1.5;
  return col;
}

const known = (antsC: number, antsP: number): KnownCapacity => ({ ants: antsC + antsP, loads: 0, loadsC: 0, loadsP: 0, antsC, antsP });

describe('R44: the forage demand per nutrient', () => {
  it('no carbohydrate source known, one prey patch good for 4 foragers: the protein side only (+1), not 5', () => {
    const col = colony();
    const w = forageWant(col);
    expect(w.c).toBeCloseTo(6, 6);
    expect(w.p).toBeCloseTo(0.5, 6);
    const d = forageDemand(col, known(0, 4));
    // protein side 0.5 / 1.5 = 0.33, + 1 for the carbohydrate nobody knows where to get
    expect(d).toBeCloseTo(0.5 / 1.5 + 1, 6);
    // the old single cap: min((6 + 0.5) / 1.5, 4 + 1) = 4.33
    expect(d).toBeLessThan(2);
  });

  it('a flower good for 3 foragers known as well: the carbohydrate side min(want / yield, 3) + the protein side', () => {
    const col = colony();
    expect(forageDemand(col, known(3, 4))).toBeCloseTo(3 + 0.5 / 1.5 + 1, 6);
  });

  it('both wants covered by the known sources: as before (want / yield)', () => {
    const col = colony();
    expect(forageDemand(col, known(10, 4))).toBeCloseTo((6 + 0.5) / 1.5, 6);
  });

  it('the prospective protein is capped by the protein side only', () => {
    const col = colony();
    coreOf(col).acc[PROSPECTIVE_P_KEY] = 30; // a large withheld laying
    const full = forageDemand(col, known(10, 2)), plain = forageDemand(col, known(10, 2), false);
    expect(plain).toBeCloseTo((6 + 0.5) / 1.5, 6);
    expect(full).toBeCloseTo(6 / 1.5 + 2 + 1, 6);
  });
});
