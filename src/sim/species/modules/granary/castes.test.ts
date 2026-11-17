// Caste destiny of the harvester (GDD 07 §2.6, §5.3.2; App. E 5): majors only from N >= 40 workers and only while
// the colony's protein covers MAJOR_GATE_GD days of larval demand; the first brood are nanitic minors.

import { describe, expect, it } from 'vitest';
import type { Brood } from '@/sim/types';
import { BroodFlag } from '@/sim/types';
import { MAJOR_GATE_GD } from '@/sim/balance/species-harvester';
import { addLarvae, messorKit, type GranaryKit } from './testkit';
import { casteDestinySystem, destine, proteinCoverGd } from './castes';

/** 100 undecided worker larvae, the P store set to `coverGd` days of their demand; destines them at N workers. */
function destineHundred(k: GranaryKit, workers: number, coverGd: number): Brood[] {
  const col = k.sim.state.colonies[0];
  const def = k.sim.getSpecies(col.species)!;
  const larvae = addLarvae(k, 100, k.nest.chambers[1], 'worker');
  col.granary!.pasteLoads = 0;
  col.stores.p = 1;
  col.stores.p = coverGd / proteinCoverGd(k.sim, col, k.g, def); // cover is linear in the P store
  expect(proteinCoverGd(k.sim, col, k.g, def)).toBeCloseTo(coverGd, 6);
  for (const b of larvae) destine(k.sim, col, k.g, def, b, workers);
  return larvae;
}

const majors = (bs: Brood[]) => bs.filter((b) => b.destined === 'major').length;

describe('caste destiny (App. E 5)', () => {
  it('N = 39 with 5 GD of protein: no larva is destined major', () => {
    const bs = destineHundred(messorKit(), 39, 5);
    expect(majors(bs)).toBe(0);
    expect(bs.every((b) => b.destined === 'minor' || b.destined === 'media')).toBe(true);
  });

  it('N = 40 with 5 GD of protein: majors appear among the new larvae', () => {
    const bs = destineHundred(messorKit(), 40, 5);
    expect(majors(bs)).toBeGreaterThan(0);
    for (const b of bs.filter((x) => x.destined === 'major')) {
      expect(b.destinedLengthBu).toBeGreaterThanOrEqual(1.3);
      expect(b.destinedLengthBu).toBeLessThanOrEqual(1.85);
    }
  });

  it(`N = 300 with protein for only 1 GD (gate ${MAJOR_GATE_GD} GD): no major`, () => {
    const bs = destineHundred(messorKit(), 300, 1);
    expect(majors(bs)).toBe(0);
  });

  it('N = 300 with 5 GD of protein: the mix heads for the target (about 20 % majors)', () => {
    const bs = destineHundred(messorKit(), 300, 5);
    expect(majors(bs)).toBeGreaterThanOrEqual(15);
    expect(majors(bs)).toBeLessThanOrEqual(25);
  });

  it('the system destines nanitic eggs as minors at once; the first major marks the unlock', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    const [nan] = addLarvae(k, 1, k.nest.chambers[1], 'worker');
    nan.flags |= BroodFlag.NANITIC;
    nan.stage = 'egg';
    casteDestinySystem.run(k.sim);
    expect(nan.destined).toBe('minor');
    expect(nan.destinedLengthBu).toBeLessThan(0.7);
    destineHundred(k, 300, 5);
    expect(col.granary!.majorsUnlocked).toBe(true);
  });
});
