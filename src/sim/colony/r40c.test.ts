// Ruling R40 c (colony-life direction 27, round 13; GDD 02 §2.8: larvae overwinter, pupae do not): a larva that would
// pupate while its chamber is at or under DIAPAUSE_COLD_C (outside spring), or from DIAPAUSE_DOY on, enters diapause
// instead. Round 13's trace (we #2, year two): larvae pupated on doy 16-18 as the chamber fell 12.0 -> 10.5 C, then sat
// at 2-5 C with their development stopped and died untended.

import { describe, expect, it } from 'vitest';
import type { Brood } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { DIAPAUSE_COLD_C } from '@/sim/balance';
import { addBrood, addChamber, colonyOf, establishQueen, makeColonySim } from './testkit';
import { broodStep } from './brood';
import { coreOf } from './core';

/** A grown, fed larva (progress just under 1) in a chamber at tempC on the given day. */
function grownLarva(season: 'spring' | 'summer' | 'autumn', day: number, tempC: number) {
  const sim = makeColonySim({ season, summerDay: day, climate: { chamberTemp: () => tempC } });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, royal);
  addBrood(sim, 'larva', 1, royal, 0.99999);
  const col = colonyOf(sim);
  const b = sim.stores.brood.list.find((x) => x.alive && x.stage === 'larva') as Brood;
  b.gutC = 0.2; b.gutP = 0.2;
  const step = () => broodStep(sim, b, col, coreOf(col), sim.getSpecies(col.species)!, 300);
  return { b, step };
}

const diapausing = (b: Brood) => (b.flags & BroodFlag.DIAPAUSE) !== 0;

describe('R40 c: a larva does not pupate into the cold', () => {
  it('autumn doy 16, chamber 1 C under DIAPAUSE_COLD_C: the grown larva diapauses, no pupa', () => {
    const { b, step } = grownLarva('autumn', 2, DIAPAUSE_COLD_C - 1);
    step();
    expect(b.stage).toBe('larva');
    expect(diapausing(b)).toBe(true);
    step(); // and stays a diapause larva (waits for the spring exit)
    expect(b.stage).toBe('larva');
    expect(diapausing(b)).toBe(true);
  });

  it('autumn doy 16 in a warm chamber: it pupates as before', () => {
    const { b, step } = grownLarva('autumn', 2, 18);
    step();
    expect(b.stage).toBe('pupa');
  });

  it('from DIAPAUSE_DOY (doy 19) even in a warm chamber: diapause, no pupa', () => {
    const { b, step } = grownLarva('autumn', 5, 18);
    step();
    expect(b.stage).toBe('larva');
    expect(diapausing(b)).toBe(true);
  });

  it('in spring a cold chamber does not hold a grown larva back: it pupates', () => {
    const { b, step } = grownLarva('spring', 5, DIAPAUSE_COLD_C - 1);
    step();
    expect(b.stage).toBe('pupa');
  });
});
