// colony-life direction 12 (sim-seams review finding 2): a module that imports only createGame must create the same
// game as one that has the sim loaded. Vitest gives every test file its own module graph, so this file sees exactly
// what createGame's own imports load: the rivals' heavy half must be bound, or initRivals leaves the rival nests to
// the first tick and hands out entity ids in another order.
import { describe, expect, it } from 'vitest';
import '@/sim/createGame';
import { rivalsImplIfLoaded } from '@/sim/rivals/late';

describe('createGame loads what game creation needs', () => {
  it('the rivals heavy half is bound by importing createGame alone (rival nests built at creation)', () => {
    expect(rivalsImplIfLoaded()).not.toBeNull();
  });
});
