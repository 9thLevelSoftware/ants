import { it } from 'vitest';
import { archSim } from './architectTestKit';
import { layoutNest } from './layout';
it('prof', () => {
  for (let n = 0; n < 16; n++) {
    const { sim, nest } = archSim({ seed: 21 + (n % 5), terrain: 'noise', architect: false, template: false });
    layoutNest(sim, nest.id, 400);
  }
}, 300000);
