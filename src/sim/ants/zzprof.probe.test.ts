import { it } from 'vitest';
import { makeNestColony } from '@/sim/ants/behaviours/nest/testkit';
it('prof', () => {
  const workers = 800;
  const k = makeNestColony({ workers, seed: 2, stores: { c: 4 * workers, p: 2 * workers },
    brood: [{ stage: 'egg', n: 66, chamber: 'nursery' }, { stage: 'larva', n: 66, chamber: 'nursery' }, { stage: 'pupa', n: 66, chamber: 'royal' }] });
  for (let i = 0; i < 1200; i++) k.sim.tick();
}, 600000);
