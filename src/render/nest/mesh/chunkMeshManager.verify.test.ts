// Reviewer tests (render-nest): chunk mesh manager under sustained digging, material changes, and seams of refined
// meshes around chunk corners.
import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshDepthMaterial } from 'three';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import type { MaterialId } from '@/sim/types';
import { nestSourceFromSim, type NestSource } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { ChunkMeshManager, type WallMaterialSet } from './chunkMeshManager';
import { buildChunk, materialIndex } from './chunkBuild';

const BU = 4;
const mats: WallMaterialSet = { wall: () => new MeshBasicMaterial(), depth: new MeshDepthMaterial() };

function setup(size = 400) {
  const kernel = createKernel(makeFlatWorld({ size, bu: BU, h0: 0 }), emptyCarve(BU));
  const src = nestSourceFromSim(kernelSim(kernel));
  const m = new ChunkMeshManager(mats);
  m.build = { refine: false, ao: false };
  return { kernel, src, m };
}

describe('ChunkMeshManager (review)', () => {
  it('a far edit is eventually displayed while digging continues next to the camera (no starvation)', () => {
    const { kernel, src, m } = setup();
    // chunk size is 16 voxels * 2 mm = 32 mm; dig well inside one chunk near the camera
    kernel.carveSphere({ x: 48, y: -48, z: 48 }, 4, { force: true });
    m.setSource(src);
    m.flush();
    // one edit far from the camera
    kernel.carveSphere({ x: 336, y: -48, z: 336 }, 4, { force: true });
    const farKeys = new Set(src.takeDirty());
    m.markDirty([...farKeys]);
    // the player keeps digging next to the camera: one bite per frame inside the same chunk
    // (budget 0 = one chunk per frame, the "at least one chunk" rule; the same happens whenever one frame's budget
    // only fits the chunks the nearby digging re-dirties)
    // (the loop runs all 200 frames: stopping at the first display would leave `changed` far below 100 for any
    // implementation that shows the far edit early, which is what this test asks for)
    let farShown = false, changed = 0;
    for (let f = 0; f < 200; f++) {
      const v0 = kernel.carve.version;
      const a = f * 1.9; // a spiral that keeps opening new samples, all inside chunk (1, -2, 1)
      kernel.carveSphere({ x: 48 + 5 * Math.cos(a), y: -48 + 5 * Math.sin(a), z: 40 + f * 0.08 }, 2.5, { force: true });
      if (kernel.carve.version !== v0) changed++;
      m.update(48, -48, 48, 0);
      farShown ||= [...farKeys].every((k) => m.chunk(k) !== undefined);
    }
    expect(changed).toBeGreaterThan(100); // the digging really went on
    expect(farShown).toBe(true);
  });

  it('a chunk whose substrate material changes moves to the other material buffer and leaves no stale triangles', () => {
    const { kernel, src, m } = setup();
    kernel.carveSphere({ x: 200, y: -60, z: 200 }, 8, { force: true });
    let mat: MaterialId = 'loam';
    const wrapped: NestSource = { ...src, materialAt: () => mat };
    m.setSource(wrapped);
    m.flush();
    const tris = m.stats().triangles;
    const loamDraws = m.stats().draws;
    expect(tris).toBeGreaterThan(50);
    mat = 'wood-decayed';
    m.rebuildAll();
    m.flush();
    const s = m.stats();
    expect(s.triangles).toBe(tris);
    expect(s.draws).toBe(loamDraws); // the loam buffers were freed, one wood buffer per region instead
    for (const r of m.regions.values()) {
      expect([...r.buffers.keys()]).toEqual([materialIndex('wood-decayed')]);
    }
  });

  it('a chunk rebuilt while its earlier build waits for the batch commit shows the newer data', () => {
    const { kernel, src, m } = setup();
    m.setSource(src);
    m.flush();
    kernel.carveSphere({ x: 48, y: -48, z: 48 }, 4, { force: true });
    kernel.carveSphere({ x: 300, y: -48, z: 300 }, 4, { force: true });
    m.update(48, -48, 48, 0); // builds the near chunk, the far one keeps the batch open
    kernel.carveSphere({ x: 48, y: -48, z: 48 }, 7, { force: true }); // the near chunk changes again
    for (let i = 0; i < 50 && m.pendingCount > 0; i++) m.update(48, -48, 48, 0);
    // compare with a fresh build of the final state
    const keys = [...m.regions.values()].flatMap((r) => [...r.chunks]);
    for (const k of keys) {
      const fresh = buildChunk(src, k, m.build)!;
      expect(m.chunk(k)!.triangleCount).toBe(fresh.triangleCount);
    }
  });

  it('refined meshes stay watertight around chunk corners (spheres and an ellipsoid straddling 8 chunks)', () => {
    const { kernel, src } = setup();
    // chunk corners at multiples of 32 mm
    kernel.carveSphere({ x: 64, y: -64, z: 64 }, 7, { force: true });
    kernel.carveSphere({ x: 128.7, y: -96.3, z: 95.2 }, 5.5, { force: true });
    kernel.carveEllipsoid({ x: 192, y: -64, z: 160 }, { x: 22, y: 6.5, z: 15 }, { force: true });
    kernel.carveCapsule({ x: 64, y: -64, z: 64 }, { x: 192, y: -64, z: 160 }, 4, { force: true });
    const id = new Map<string, number>();
    const vid = (x: number, y: number, z: number) => {
      const k = `${x},${y},${z}`;
      let v = id.get(k);
      if (v === undefined) { v = id.size; id.set(k, v); }
      return v;
    };
    const edges = new Map<string, number>();
    let chunks = 0;
    for (const key of kernel.meshKeys()) {
      const c = buildChunk(src, key, { refine: true, ao: true });
      if (!c) continue;
      chunks++;
      for (const g of c.groups) for (let t = 0; t < g.indices.length; t += 3) {
        const v = [0, 1, 2].map((j) => { const i = g.indices[t + j]; return vid(c.positions[i * 3], c.positions[i * 3 + 1], c.positions[i * 3 + 2]); });
        for (let j = 0; j < 3; j++) {
          const a = v[j], b = v[(j + 1) % 3];
          if (a === b) continue;
          const k = a < b ? `${a}:${b}` : `${b}:${a}`;
          edges.set(k, (edges.get(k) ?? 0) + (a < b ? 1 : 1000));
        }
      }
      for (let i = 0; i < c.positions.length; i++) expect(Number.isFinite(c.positions[i])).toBe(true);
      for (let i = 0; i < c.nest.length; i++) expect(Number.isFinite(c.nest[i])).toBe(true);
    }
    expect(chunks).toBeGreaterThan(8);
    let bad = 0;
    for (const n of edges.values()) if (n !== 1001) bad++;
    expect(bad).toBe(0);
  });

  it('setSource(null) frees everything and update() is then a no-op', () => {
    const { kernel, src, m } = setup();
    kernel.carveSphere({ x: 200, y: -60, z: 200 }, 8, { force: true });
    m.setSource(src);
    m.flush();
    expect(m.group.children.length).toBeGreaterThan(0);
    m.setSource(null);
    expect(m.group.children.length).toBe(0);
    expect(m.stats().chunks).toBe(0);
    const st = m.update(0, 0, 0, 4);
    expect(st.built).toBe(0);
  });
});

describe('ChunkMeshManager per-frame overhead with a large backlog (review)', () => {
  it('reports the frame cost of the nearest-first ordering while thousands of chunks are pending', () => {
    const { kernel, src, m } = setup(1600);
    for (let y = -20; y >= -220; y -= 50) {
      for (let z = 40; z < 1560; z += 64) kernel.carveCapsule({ x: 30, y, z }, { x: 1570, y, z: z + 10 }, 4, { force: true });
    }
    m.setSource(src); // the game path: setSim() without flush() queues every stored chunk
    const pending = m.pendingCount;
    m.update(800, -100, 800, 4); // warm-up
    const t0 = performance.now();
    let built = 0;
    for (let i = 0; i < 20; i++) built += m.update(800, -100, 800, 4).built; // the test/ultra budget, 4 ms
    const perFrame = (performance.now() - t0) / 20;
    console.log(`NEST_REVIEW backlog ${pending} chunks: ${perFrame.toFixed(2)} ms per frame (budget 4) for ${built / 20} chunk(s) built per frame`);
    expect(pending).toBeGreaterThan(1000);
    // the ordering alone must not eat the budget: several chunks per frame and a frame near the budget
    expect(built / 20).toBeGreaterThan(2);
    expect(perFrame).toBeLessThan(4 * 2);
  }, 60000);
});
