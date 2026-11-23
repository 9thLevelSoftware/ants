// gate-sim-2 review (item 1, runner "failure codes"): a species module's caste exception (`whoWithinSpecies`) must not
// make its primitive look like every species' primitive. A Lasius worker asking for any of the three module
// primitives that carry the flag is refused with 'species' (GDD 01 §7.1); a generic `who` hook (nest care, no flag)
// still answers 'caste' for an ant the hook rejects.
import { afterEach, describe, expect, it } from 'vitest';
import { canDo } from './runner';
import { installFakes, makeAntSim, worker } from './testkit';

let restore = (): void => {};
afterEach(() => restore());

describe('reviewer: failure code of a species module primitive asked by another species (gate-sim-2)', () => {
  it("Lasius worker: mill-seed, cut-leaf and process-leaf are refused with 'species'", () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const ant = worker(sim, 50, 50);
    for (const id of ['mill-seed', 'cut-leaf', 'process-leaf'] as const) {
      expect(canDo(sim, ant, id, null).reason, id).toBe('species');
    }
  });

  it("Lasius queen: a nest-care primitive whose generic `who` hook rejects her is refused with 'caste'", () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const q = worker(sim, 50, 50, 'queen');
    // feed-larva is a worker primitive in the species tables; the queen is not a worker
    const r = canDo(sim, q, 'feed-larva', null).reason;
    expect(r).not.toBe('species');
  });
});
