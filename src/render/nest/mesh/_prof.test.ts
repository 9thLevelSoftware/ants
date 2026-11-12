import { it } from 'vitest';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { buildChunk } from './chunkBuild';
function t(name: string, fn: () => unknown, n = 10) { fn(); const t0 = performance.now(); for (let i = 0; i < n; i++) fn(); console.log(name, ((performance.now() - t0) / n).toFixed(3)); }
it('prof', () => {
  const kernel = createKernel(makeFlatWorld({ size: 400, bu: 4, h0: 0 }), emptyCarve(4));
  for (let x = 98; x < 128; x += 5) for (let y = -94; y < -64; y += 5) for (let z = 98; z < 128; z += 5) kernel.carveSphere({ x: x + ((y + z) % 3), y, z: z + ((x + y) % 2) }, 2.4, { force: true });
  kernel.carveSphere({ x: 200, y: -60, z: 200 }, 12, { force: true });
  const src = nestSourceFromSim(kernelSim(kernel));
  const keys = kernel.meshKeys().map((k) => ({ k, n: kernel.meshChunk(k)?.indices.length ?? 0 })).sort((a, b) => b.n - a.n);
  for (const { k, n } of [keys[0], keys.find(e => e.n > 0 && e.n < 3000)!]) {
    console.log('key', k, 'idx', n);
    t('mesh', () => src.meshChunk(k));
    t('plain', () => buildChunk(src, k, { refine: false, ao: false }));
    t('refine', () => buildChunk(src, k, { refine: true, ao: false }));
    t('ao', () => buildChunk(src, k, { refine: false, ao: true }));
    t('full', () => buildChunk(src, k, { refine: true, ao: true }));
    const m = src.meshChunk(k)!; const P = m.positions;
    t('mat', () => { for (let i = 0; i < P.length; i += 3) src.materialAt(P[i], P[i+1], P[i+2]); });
    t('moist', () => { for (let i = 0; i < P.length; i += 3) src.moistureAt(P[i], P[i+1], P[i+2]); });
    t('soil', () => { for (let i = 0; i < P.length; i += 3) src.soil(P[i], P[i+1], P[i+2]); });
    t('open', () => { for (let i = 0; i < P.length; i += 3) src.openness(P[i], P[i+1], P[i+2]); });
  }
});
