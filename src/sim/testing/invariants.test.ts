// The soak invariants catch what they claim to (and a clean small nest passes all of them).
import { describe, expect, it } from 'vitest';
import { checkInvariants, collectInvariants, CORE_INVARIANTS, type InvariantViolation } from './invariants';
import { makeTestSim } from './testWorld';

describe('soak invariants', () => {
  it('a fresh game with the small nest and 20 workers has no violations', () => {
    const sim = makeTestSim({ nest: 'small', workers: 20, systems: [] });
    const out: InvariantViolation[] = [];
    expect(checkInvariants(sim, collectInvariants(), out)).toBe(0);
  });

  it('reports NaN kinematics, a walker inside solid and negative stores', () => {
    const sim = makeTestSim({ nest: 'small', workers: 3, systems: [] });
    const [, a, b] = sim.state.ants;
    a.pos.x = NaN;
    b.pos.y -= 3 * sim.world.bu; // into the chamber floor
    sim.state.colonies[0].stores.c = -1;
    const out: InvariantViolation[] = [];
    checkInvariants(sim, CORE_INVARIANTS, out);
    const names = out.map((v) => v.invariant);
    expect(names).toContain('walker-finite');
    expect(names).toContain('walker-free-space');
    expect(names).toContain('non-negative');
    expect(names).toContain('state-encodes'); // NaN does not encode
    expect(out.find((v) => v.invariant === 'walker-free-space')!.detail).toContain(`ant ${b.id}`);
  });
});
