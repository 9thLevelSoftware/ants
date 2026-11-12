import { it } from 'vitest';
import { archSim } from './architectTestKit';
import { layoutNest } from './layout';
import { architectRuntime } from './runtime';
it('prof', () => {
  for (let n = 0; n < 4; n++) {
    const { sim, nest } = archSim({ seed: 21 + n, terrain: 'noise', architect: false, template: false });
    let probes = 0;
    architectRuntime(sim).probe = () => { probes++; };
    const t0 = performance.now();
    const r = layoutNest(sim, nest.id, 400);
    console.log(`ms ${(performance.now() - t0).toFixed(0)} plans ${r.planIds.length} steps ${r.steps} unplaced ${r.unplaced} probes ${probes} vol ${nest.volumeOpen.toFixed(0)} chambers ${nest.chambers.map((c) => c.type).join(',')}`);
  }
}, 300000);
