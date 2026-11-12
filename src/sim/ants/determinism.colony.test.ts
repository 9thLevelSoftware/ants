// sim-fix-ants acceptance 6: a whole colony (in-nest behaviours, foragers, the new care primitives, deliver first,
// home marks, an avoid marker command) gives the same state hash from the same seed and commands. The hash is also
// written to test-output/reports/determinism-hash.json, so two separate processes can be compared.
import { describe, expect, it } from 'vitest';
import { stateHash } from '@/sim/save/hash';
import { writeReport } from '@/sim/ants/testing/report';
import { makeNestColony } from '@/sim/ants/behaviours/nest/testkit';

function run(): string {
  const k = makeNestColony({
    workers: 40, seed: 9, stores: { c: 60, p: 30 },
    brood: [{ stage: 'egg', n: 6, chamber: 'nursery' }, { stage: 'larva', n: 8, chamber: 'nursery' }, { stage: 'pupa', n: 4, chamber: 'nursery', progress: 0.95 }],
  });
  const { sim, entrance } = k;
  const bu = sim.world.bu;
  for (let t = 0; t < 600; t++) sim.tick();
  const x = entrance.pos.x + 40 * bu, z = entrance.pos.z;
  sim.enqueue({ type: 'placeMarker', kind: 'avoid', pos: { x, y: sim.field.height(x, z), z }, radius: 15 * bu });
  for (let t = 0; t < 900; t++) sim.tick();
  return stateHash(sim.state);
}

describe('determinism of a whole colony (sim-fix-ants acceptance 6)', () => {
  it('same seed and commands: same state hash', async () => {
    const a = run(), b = run();
    await writeReport('determinism-hash', { hash: a });
    expect(b).toBe(a);
  }, 120_000);
});
