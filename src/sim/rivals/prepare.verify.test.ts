// sim-seams review: the rival nests built at game creation (prepare.ts) on a short-lived set-up Sim. The state it
// leaves must be deterministic, plain (it is the new game's first save), and a game loaded from it must run like the
// game that built it.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { stateHash } from '@/sim/save/hash';
import { rivalSim, rivalsOf, run } from './testkit';
import { colExt } from './state';
import { prepareRivalNests } from './prepare';

const RIVALS = [
  { species: 'tetramorium-immigrans' as const, dx: 90, dz: 0 },
  { species: 'lasius-niger' as const, dx: -90, dz: 40, incipient: true },
];

function make(seed = 1): Sim {
  return rivalSim({ seed, nest: 'small', workers: 2, rivals: RIVALS });
}

/** First tick (checked every 25) at which a loaded copy and the live game differ, or -1. */
function divergence(live: Sim, ticks: number): number {
  const loaded = createSim(restore(snapshot(live)).state, live.world, { systems: live.systems });
  if (stateHash(loaded.state) !== stateHash(live.state)) return 0;
  for (let i = 1; i <= ticks; i++) {
    live.tick();
    loaded.tick();
    if (i % 25 === 0 && stateHash(live.state) !== stateHash(loaded.state)) return i;
  }
  return -1;
}

describe('rival nests prepared at creation (review)', () => {
  it('two games of the same seed have the same state at creation and after 100 ticks', () => {
    const a = make(), b = make();
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    run(a, 100);
    run(b, 100);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });

  it('preparing again is a no-op (every colony is set up; nothing is re-carved or re-spawned)', () => {
    const sim = make();
    const before = stateHash(sim.state);
    prepareRivalNests(sim.state, sim.world);
    expect(stateHash(sim.state)).toBe(before);
    for (const c of rivalsOf(sim)) expect(colExt(sim.state, c.id).setupDone).toBe(true);
  });

  it('a save of the freshly created game loads to the same state and runs equally for 300 ticks', () => {
    expect(divergence(make(), 300)).toBe(-1);
  });
});
