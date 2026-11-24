// app-seams-4 item 2: a worker who carries food into a nest whose stores are full is told why she cannot hand it over (GDD 02 stores-full).
import { describe, expect, it } from 'vitest';
import { installFakes, makeAntSim, worker } from '@/sim/ants/actions/testkit';
import { poolSpace } from '@/sim/colony';
import { STORES_FULL_SPACE } from '@/sim/balance/colony';
import { STORES_FULL_NOTE } from '@/content/text';
import { carriesIntoFullStores, possessedOf } from './hudSlices';

describe('stores-full feedback for the possessed worker', () => {
  it('says so only when she carries food and the pool has no room for it', () => {
    const sim = makeAntSim();
    const fakes = installFakes(sim);
    try {
      const col = sim.state.colonies[0];
      const w = worker(sim, 5, 5);
      sim.enqueue({ type: 'possess', antId: w.id });
      sim.applyPendingCommands();
      // empty stores, loaded crop: there is room
      col.stores.c = 0; col.stores.p = 0; w.cropC = 0.6; w.cropP = 0;
      expect(poolSpace(col).c).toBeGreaterThan(STORES_FULL_SPACE);
      expect(carriesIntoFullStores(sim, w)).toBe(false);
      expect(possessedOf(sim, true)?.storesFull).toBe(false);
      // stores past the cap: no room for sugar, and she carries sugar
      col.stores.c = 1e4;
      expect(poolSpace(col).c).toBeLessThan(STORES_FULL_SPACE);
      expect(carriesIntoFullStores(sim, w)).toBe(true);
      expect(possessedOf(sim, true)?.storesFull).toBe(true);
      // an empty crop has nothing to refuse; a protein load is judged against the protein room, not the sugar room
      w.cropC = 0;
      expect(carriesIntoFullStores(sim, w)).toBe(false);
      w.cropP = 0.6;
      col.stores.p = 0;
      expect(carriesIntoFullStores(sim, w)).toBe(poolSpace(col).p < STORES_FULL_SPACE);
    } finally { fakes.restore(); }
  });

  it('the note names the remedy (a food chamber) and the state, in plain words', () => {
    expect(STORES_FULL_NOTE).toBe('Stores full - dig a food chamber');
  });
});
