// The animal-protein minimum (GDD 07 §6.3.7; App. E 19): a larva whose running animal share of protein is under
// 10 % grows at half rate, so its larval stage lasts twice as long as that of a larva fed >= 10 % animal protein.
// The colony's brood step is stood in for by a plain loop (progress and digested food rising together), and the
// granary's protein step runs after each, as in the tick order.

import { describe, expect, it } from 'vitest';
import type { Brood } from '@/sim/types';
import { addLarvae, messorKit } from './testkit';
import { stepLarvae } from './protein';

/** Steps of the stand-in brood loop until the larva's progress reaches 1, with the pool's animal share `f`. */
function stepsToPupa(animalShare: number): number {
  const k = messorKit();
  const col = k.sim.state.colonies[0];
  const mod = col.granary!;
  const def = k.sim.getSpecies(col.species)!;
  const [b] = addLarvae(k, 1, k.nest.chambers[1]) as [Brood];
  col.stores.p = 10;
  mod.poolAnimalP = 10 * animalShare;
  mod.poolPLast = 10;
  const dProg = 0.001, pPerProg = 0.45; // GDD 07 §5.3.2 minor larval cost 0.45 P
  let n = 0;
  stepLarvae(k.sim, col, mod, k.g, def.life.animalProteinMinFrac); // first sight: the record starts
  while (b.progress < 1 && n < 10_000) {
    b.progress += dProg;
    b.fedP += dProg * pPerProg;
    b.fedC += dProg * 0.15;
    stepLarvae(k.sim, col, mod, k.g, def.life.animalProteinMinFrac);
    n++;
  }
  return n;
}

describe('animal-protein minimum (E19)', () => {
  it('a larva fed only paste takes 2.0 +- 0.1 x as long as one with >= 10 % animal protein', () => {
    const fast = stepsToPupa(0.2);
    const slow = stepsToPupa(0);
    expect(slow / fast).toBeGreaterThan(1.9);
    expect(slow / fast).toBeLessThan(2.1);
  });

  it('the running share is kept on the larva (Brood.animalPShare)', () => {
    const k = messorKit();
    const col = k.sim.state.colonies[0];
    const [b] = addLarvae(k, 1, k.nest.chambers[1]);
    col.stores.p = 10;
    col.granary!.poolAnimalP = 3;
    col.granary!.poolPLast = 10;
    stepLarvae(k.sim, col, col.granary!, k.g, 0.1);
    b.progress += 0.1;
    b.fedP += 0.05;
    stepLarvae(k.sim, col, col.granary!, k.g, 0.1);
    expect(b.animalPShare).toBeCloseTo(0.3, 6);
  });
});
