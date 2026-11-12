// Reviewer tests (render-nest): cost of one chunk rebuild (the unit the per-frame budget cannot split) for a busy
// chunk, and how the fresh-wall lookup scales with the number of recent carve edits of an active colony.
import { describe, expect, it } from 'vitest';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { FreshWalls } from '../lighting/freshWalls';
import { FRESH_WALL } from '../params';
import { buildChunk } from './chunkBuild';

const BU = 4;

function spongeChunk() {
  const kernel = createKernel(makeFlatWorld({ size: 400, bu: BU, h0: 0 }), emptyCarve(BU));
  // a busy chunk (chunk (3, -3, 3) spans 96..128 mm): a lattice of bite-sized holes, like a heavily dug chamber wall
  for (let x = 98; x < 128; x += 5) for (let y = -94; y < -64; y += 5) for (let z = 98; z < 128; z += 5) {
    kernel.carveSphere({ x: x + ((y + z) % 3), y, z: z + ((x + y) % 2) }, 2.4, { force: true });
  }
  const src = nestSourceFromSim(kernelSim(kernel));
  const key = kernel.meshKeys().map((k) => ({ k, n: kernel.meshChunk(k)?.indices.length ?? 0 })).sort((a, b) => b.n - a.n)[0].k;
  return { kernel, src, key };
}

function median(fn: () => unknown, n = 7): number {
  fn();
  const t: number[] = [];
  for (let i = 0; i < n; i++) { const t0 = performance.now(); fn(); t.push(performance.now() - t0); }
  return t.sort((a, b) => a - b)[n >> 1];
}

function timeBuild(fn: () => unknown, n = 5): number {
  fn(); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < n; i++) fn();
  return (performance.now() - t0) / n;
}

describe('chunk build cost (review)', () => {
  it('reports the cost of rebuilding the busiest chunk with refinement + AO (one uninterruptible unit of the budget)', () => {
    const { src, key } = spongeChunk();
    const plain = timeBuild(() => buildChunk(src, key, { refine: false, ao: false }));
    const full = timeBuild(() => buildChunk(src, key, { refine: true, ao: true }));
    const c = buildChunk(src, key, { refine: true, ao: true })!;
    console.log(`NEST_REVIEW busy chunk: ${c.triangleCount} tris after refine; build plain ${plain.toFixed(2)} ms, refine+ao ${full.toFixed(2)} ms`);
    expect(c.triangleCount).toBeGreaterThan(3000);
  });

  it('fresh-wall lookup stays cheap with the carve edits of 50 diggers over one game hour (~1250 boxes)', () => {
    const { src, key } = spongeChunk();
    const none = timeBuild(() => buildChunk(src, key, { refine: true, ao: true }));
    const fresh = new FreshWalls(FRESH_WALL.ticks, 2);
    // 50 diggers x 1 bite per game second x 25 game s (1 game hour = 250 ticks) spread over a 400 mm nest
    for (let i = 0; i < 1250; i++) {
      const x = (i * 37) % 400, y = -((i * 53) % 200), z = (i * 71) % 400;
      fresh.add({ kind: 'carve', x0: x - 3, y0: y - 3, z0: z - 3, x1: x + 3, y1: y + 3, z1: z + 3 }, Math.floor(i / 5));
    }
    const c = buildChunk(src, key, { refine: false, ao: false })!;
    const P = c.positions;
    let sink = 0;
    const scan = () => { for (let i = 0; i < c.vertexCount; i++) sink += fresh.carvedAt(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); };
    const scanMs = median(() => scan());
    const buildMs = median(() => buildChunk(src, key, { refine: true, ao: true }));
    console.log(`NEST_REVIEW fresh walls: ${fresh.size} recent edits; lookup for ${c.vertexCount} vertices ${scanMs.toFixed(2)} ms vs whole rebuild without it ${buildMs.toFixed(2)} ms (${none.toFixed(2)}) [${sink > 0}]`);
    // a linear scan per vertex should not cost a large part of a rebuild
    expect(scanMs).toBeLessThan(buildMs * 0.5);
  });
});
