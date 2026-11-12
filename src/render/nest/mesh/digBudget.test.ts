// Acceptance 3 at the mesh level (Node, no GL): 50 bites at a chamber wall like the demo's scripted digging, all at
// once and one per frame, with refinement and AO at the `test` preset's 4 ms budget. Records per-frame re-meshing
// time, the longest single build stage (the unit the budget cannot split) and the frames until the new space shows.
import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshDepthMaterial } from 'three';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { MESH_QUALITY } from '../params';
import { ChunkMeshManager } from './chunkMeshManager';

const BU = 4;
const BUDGET = MESH_QUALITY.test.budgetMs;

function scene() {
  const kernel = createKernel(makeFlatWorld({ size: 400, bu: BU, h0: 0 }), emptyCarve(BU));
  kernel.carveEllipsoid({ x: 200, y: -60, z: 200 }, { x: 24, y: 7, z: 20 }, { force: true }); // a chamber
  kernel.carveCapsule({ x: 120, y: -60, z: 200 }, { x: 200, y: -60, z: 200 }, 4, { force: true });
  const src = nestSourceFromSim(kernelSim(kernel));
  const m = new ChunkMeshManager({ wall: () => new MeshBasicMaterial(), depth: new MeshDepthMaterial() });
  m.build = { refine: true, ao: true };
  m.setSource(src);
  m.flush();
  let k = 0;
  // GDD 03 bite: 0.6 BU sphere; a spiral pushing a tunnel out of the chamber wall (as the demo's bite())
  const bite = () => {
    const a = k * 1.9, along = k * 0.22 * BU;
    kernel.carveSphere({ x: 222 + along, y: -61 + Math.sin(a) * 0.45 * BU, z: 204 + Math.cos(a) * 0.45 * BU }, 0.6 * BU);
    k++;
  };
  return { m, bite };
}

function run(m: ChunkMeshManager, bite: () => void, perFrame: boolean) {
  const frames: { ms: number; step: number; built: number; committed: boolean }[] = [];
  const step = () => { const s = m.update(222, -61, 204, BUDGET); frames.push({ ms: s.ms, step: s.maxStepMs, built: s.built, committed: s.committed }); };
  if (perFrame) for (let i = 0; i < 50; i++) { bite(); step(); }
  else for (let i = 0; i < 50; i++) bite();
  let g = 0;
  do step(); while (m.pendingCount > 0 && ++g < 200); // the first update drains the grid's dirty chunks
  return frames;
}

describe('re-meshing while digging (acceptance 3)', () => {
  it('50 bites at once and one per frame stay near the per-frame budget; the new space shows within a few frames', () => {
    const results: string[] = [];
    let burstVisible = 0, overSplit = 0, frameCount = 0;
    for (let rep = 0; rep < 3; rep++) {
      const { m, bite } = scene();
      run(m, bite, true); // warm-up
      const burst = run(m, bite, false);
      const cont = run(m, bite, true);
      burstVisible = Math.max(burstVisible, burst.findIndex((f) => f.committed) + 1);
      for (const f of [...burst, ...cont]) {
        frameCount++;
        // a frame may only go over the budget by the one stage that started inside it
        if (f.ms > BUDGET + f.step + 0.5) overSplit++;
      }
      const sum = (fs: typeof burst) => {
        const ms = fs.map((f) => f.ms).sort((a, b) => a - b);
        return `frames ${fs.length} max ${ms[ms.length - 1].toFixed(2)} p90 ${ms[Math.floor(ms.length * 0.9)].toFixed(2)} mean ${(ms.reduce((s, v) => s + v, 0) / ms.length).toFixed(2)} ms, longest stage ${Math.max(...fs.map((f) => f.step)).toFixed(2)} ms, over budget ${fs.filter((f) => f.ms > BUDGET).length}`;
      };
      results.push(`rep ${rep}: burst [${sum(burst)}; visible after ${burst.findIndex((f) => f.committed) + 1}] continuous [${sum(cont)}]`);
    }
    console.log(`NEST_DIG budget ${BUDGET} ms\n${results.join('\n')}`);
    expect(burstVisible).toBeGreaterThan(0);
    expect(burstVisible).toBeLessThanOrEqual(8);
    expect(overSplit / frameCount).toBeLessThan(0.05); // GC pauses aside, the stage scheduler holds the budget
  }, 60000);
});
