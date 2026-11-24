// Reviewer tests (app-seams-4 item 2): the stores-full note of the possessed panel, edges of its rule.
import { describe, expect, it } from 'vitest';
import { installFakes, makeAntSim, worker } from '@/sim/ants/actions/testkit';
import { TROPH_DONOR_MIN } from '@/sim/balance/actions';
import { carriesIntoFullStores } from './hudSlices';

describe('carriesIntoFullStores edges (reviewer)', () => {
  it('a crop at the donor floor counts as empty; just above it with full stores counts', () => {
    const sim = makeAntSim();
    const fakes = installFakes(sim);
    try {
      const col = sim.state.colonies[0];
      const w = worker(sim, 5, 5);
      col.stores.c = 1e4;
      w.cropC = TROPH_DONOR_MIN; w.cropP = 0;
      expect(carriesIntoFullStores(sim, w)).toBe(false);
      w.cropC = TROPH_DONOR_MIN + 0.01;
      expect(carriesIntoFullStores(sim, w)).toBe(true);
    } finally { fakes.restore(); }
  });

  it('never for the queen or sexuals (they do not unload into the pool), nor for an ant of an unknown colony', () => {
    const sim = makeAntSim();
    const fakes = installFakes(sim);
    try {
      const col = sim.state.colonies[0];
      col.stores.c = 1e4;
      for (const caste of ['queen', 'gyne', 'male'] as const) {
        const a = worker(sim, 6, 6, caste);
        a.cropC = 1;
        expect(carriesIntoFullStores(sim, a), caste).toBe(false);
      }
      const w = worker(sim, 7, 7);
      w.cropC = 1;
      w.colony = 98765;
      expect(carriesIntoFullStores(sim, w)).toBe(false);
    } finally { fakes.restore(); }
  });
});
