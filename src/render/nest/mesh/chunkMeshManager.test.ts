import { describe, expect, it } from 'vitest';
import { MeshBasicMaterial, MeshDepthMaterial } from 'three';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { BATCH_MAX_FRAMES, ChunkMeshManager, type WallMaterialSet } from './chunkMeshManager';
import { BUILD_STAGES } from './chunkBuild';

const BU = 4;
const mats: WallMaterialSet = { wall: () => new MeshBasicMaterial(), depth: new MeshDepthMaterial() };

function setup(size = 400) {
  const kernel = createKernel(makeFlatWorld({ size, bu: BU, h0: 0 }), emptyCarve(BU));
  const src = nestSourceFromSim(kernelSim(kernel));
  const m = new ChunkMeshManager(mats);
  m.build = { refine: false, ao: false };
  return { kernel, src, m };
}

describe('ChunkMeshManager', () => {
  it('meshes every stored chunk on setSource and packs chunks into regions', () => {
    const { kernel, src, m } = setup();
    kernel.carveCapsule({ x: 60, y: -40, z: 60 }, { x: 300, y: -40, z: 70 }, 4, { force: true });
    m.setSource(src);
    m.flush();
    const s = m.stats();
    expect(s.pending).toBe(0);
    expect(s.chunks).toBeGreaterThan(8);
    expect(s.regions).toBeLessThan(s.chunks);
    expect(s.triangles).toBeGreaterThan(500);
    expect(m.group.children.length).toBe(s.draws);
    expect(s.draws).toBe(s.regions); // one material: one draw per region
  });

  it('rebuilds dirty chunks nearest to the camera first, within the budget, and commits a batch together', () => {
    const { kernel, src, m } = setup();
    m.setSource(src);
    m.flush();
    // two separate digs: one near the camera, one far away
    kernel.carveSphere({ x: 300, y: -40, z: 300 }, 6, { force: true });
    kernel.carveSphere({ x: 40, y: -40, z: 40 }, 6, { force: true });
    const before = m.commits;
    const st = m.update(40, -40, 40, 0); // budget 0: exactly one build stage per frame
    expect(st.steps).toBe(1);
    expect(st.committed).toBe(false); // the batch is not complete yet: nothing changes on screen
    expect(m.commits).toBe(before);
    // the first chunk built is the one near the camera
    let frames = 1;
    while (m.last.built === 0 && frames < 10) { m.update(40, -40, 40, 0); frames++; }
    const first = [...m.regions.values()].length; // nothing shown before the batch commits
    expect(first).toBe(0);
    while (m.stats().pending > 0 && frames < 200) { m.update(40, -40, 40, 0); frames++; }
    expect(m.commits).toBeGreaterThan(before);
    expect(m.stats().pending).toBe(0);
    expect(frames).toBeGreaterThanOrEqual(2);
  });

  it('builds the edit nearest to the camera first', () => {
    const { kernel, src, m } = setup();
    const calls: number[] = [];
    m.setSource({ ...src, meshChunk: (k) => { calls.push(k); return src.meshChunk(k); } });
    m.flush();
    kernel.carveSphere({ x: 300, y: -40, z: 300 }, 6, { force: true });
    kernel.carveSphere({ x: 40, y: -40, z: 40 }, 6, { force: true });
    calls.length = 0;
    m.update(40, -40, 40, 0);
    const c = { x: 0, y: 0, z: 0 };
    src.keyToChunk(calls[0], c);
    expect(Math.max(c.x, c.z)).toBeLessThan(3); // the chunk near (40, -40, 40), not the one near (300, -40, 300)
  });

  it('spreads a busy chunk over several frames at a small budget, whole stages per frame', () => {
    const { kernel, src, m } = setup();
    m.build = { refine: true, ao: true };
    for (let x = 98; x < 128; x += 5) for (let y = -94; y < -64; y += 5) for (let z = 98; z < 128; z += 5) {
      kernel.carveSphere({ x: x + ((y + z) % 3), y, z: z + ((x + y) % 2) }, 2.4, { force: true });
    }
    const busy = kernel.meshKeys().map((k) => ({ k, n: kernel.meshChunk(k)?.indices.length ?? 0 })).sort((a, b) => b.n - a.n)[0].k;
    m.setSource({ ...src, meshKeys: () => [] }); // nothing in the backlog
    m.markDirty([busy]);
    // warm the cost estimate on the same chunk, then rebuild it once more at a 0.5 ms budget
    for (let f = 0; f < 20 && m.pendingCount > 0; f++) m.update(0, 0, 0, 1000);
    m.markDirty([busy]);
    const frames: number[] = [];
    for (let f = 0; f < 20 && m.pendingCount > 0; f++) frames.push(m.update(0, 0, 0, 0.5).steps);
    expect(frames.length).toBeGreaterThan(1); // one chunk, several frames
    expect(Math.max(...frames)).toBeLessThan(BUILD_STAGES); // no frame ran the whole build
    expect(m.chunk(busy)).toBeDefined();
  });

  it('commits a long batch after BATCH_MAX_FRAMES even if digging continues', () => {
    const { kernel, src, m } = setup();
    m.setSource(src);
    m.flush();
    let committed = -1;
    for (let f = 0; f < 40 && committed < 0; f++) {
      kernel.carveSphere({ x: 40 + f * 6, y: -40, z: 40 + (f % 5) * 30 }, 5, { force: true });
      if (m.update(0, 0, 0, 0).committed) committed = f;
    }
    expect(committed).toBeGreaterThanOrEqual(0);
    expect(committed).toBeLessThanOrEqual(BATCH_MAX_FRAMES);
  });

  it('frees meshes of emptied chunks and drops empty regions', () => {
    const { kernel, src, m } = setup();
    kernel.carveSphere({ x: 200, y: -60, z: 200 }, 8, { force: true });
    m.setSource(src);
    m.flush();
    expect(m.stats().chunks).toBeGreaterThan(0);
    kernel.fillSphere({ x: 200, y: -60, z: 200 }, 12);
    m.flush();
    expect(m.stats().chunks).toBe(0);
    expect(m.stats().regions).toBe(0);
    expect(m.group.children.length).toBe(0);
  });

  it('handles thousands of chunks (a sprawling nest) with region batching', () => {
    const { kernel, src, m } = setup(1600);
    // a grid of long tunnels at several depths: >2000 chunks with surface
    for (let y = -20; y >= -220; y -= 50) {
      for (let z = 40; z < 1560; z += 64) kernel.carveCapsule({ x: 30, y, z }, { x: 1570, y, z: z + 10 }, 4, { force: true });
      for (let x = 40; x < 1560; x += 128) kernel.carveCapsule({ x, y: y - 6, z: 30 }, { x: x + 8, y: y - 6, z: 1570 }, 4, { force: true });
    }
    m.setSource(src);
    const t0 = performance.now();
    m.flush();
    const ms = performance.now() - t0;
    const s = m.stats();
    expect(s.chunks).toBeGreaterThan(2000);
    // one draw per region (single material): far fewer draws than chunks
    expect(s.draws).toBeLessThan(s.chunks / 6);
    for (const mesh of m.meshes()) expect(mesh.geometry.boundingSphere).not.toBeNull();
    // initial meshing stays well under a millisecond per chunk (no refinement / AO here)
    expect(ms / s.chunks).toBeLessThan(2);
    console.log(`NEST_MESH_SCALE chunks=${s.chunks} regions=${s.regions} draws=${s.draws} tris=${s.triangles} flushMs=${ms.toFixed(0)} perChunkMs=${(ms / s.chunks).toFixed(3)}`);
  }, 120000);
});
