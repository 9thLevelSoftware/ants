import { describe, expect, it } from 'vitest';
import { createKernel } from '@/sim/kernel';
import { emptyCarve, makeFlatWorld } from '@/sim/kernel.testWorld';
import { nestSourceFromSim } from '../simAdapter';
import { kernelSim } from '../testing/kernelSim';
import { buildChunk } from './chunkBuild';

const BU = 4;

function capsuleWorld() {
  const kernel = createKernel(makeFlatWorld({ size: 400, bu: BU, h0: 0 }), emptyCarve(BU));
  // a 2 BU tunnel (r = 4 mm) deep underground, along x, crossing chunk seams
  const a = { x: 100, y: -60, z: 131 }, b = { x: 230, y: -60, z: 131 };
  kernel.carveCapsule(a, b, 4, { force: true });
  return { kernel, src: nestSourceFromSim(kernelSim(kernel)), a, b, r: 4 };
}

/** Distance of a point from the capsule axis surface (mm, signed: > 0 outside the tube). */
function tubeError(x: number, y: number, z: number, a: { x: number; y: number; z: number }, b: typeof a, r: number): number {
  const t = Math.max(0, Math.min(1, (x - a.x) / (b.x - a.x)));
  const px = a.x + t * (b.x - a.x);
  return Math.hypot(x - px, y - a.y, z - a.z) - r;
}

/** Mean |error| of triangle centroids (the facet sagitta shows here, not at the vertices). */
function centroidError(keys: number[], refine: boolean, w: ReturnType<typeof capsuleWorld>): { err: number; tris: number } {
  let sum = 0, n = 0;
  for (const key of keys) {
    const c = buildChunk(w.src, key, { refine, ao: false });
    if (!c) continue;
    for (const g of c.groups) for (let t = 0; t < g.indices.length; t += 3) {
      let x = 0, y = 0, z = 0;
      for (let j = 0; j < 3; j++) { const v = g.indices[t + j]; x += c.positions[v * 3]; y += c.positions[v * 3 + 1]; z += c.positions[v * 3 + 2]; }
      x /= 3; y /= 3; z /= 3;
      if (x < w.a.x + 6 || x > w.b.x - 6) continue; // cylindrical part only
      sum += Math.abs(tubeError(x, y, z, w.a, w.b, w.r)); n++;
    }
  }
  return { err: sum / n, tris: n };
}

describe('silhouette refinement', () => {
  it('brings triangle centroids closer to the true tunnel surface', () => {
    const w = capsuleWorld();
    const keys = w.kernel.meshKeys();
    const coarse = centroidError(keys, false, w);
    const fine = centroidError(keys, true, w);
    expect(fine.tris).toBeGreaterThan(coarse.tris * 3); // a round tunnel is curved everywhere: nearly every edge splits
    // chord sagitta of a 4 mm radius tube with 2 mm voxels: ~0.1 mm; refinement must cut it substantially
    expect(fine.err).toBeLessThan(coarse.err * 0.5); // measured 0.119 -> 0.045 mm
    expect(fine.err).toBeLessThan(0.06);
  });

  it('keeps chunk seams watertight (every edge used by exactly two opposite triangles)', () => {
    const w = capsuleWorld();
    const id = new Map<string, number>();
    const vid = (x: number, y: number, z: number) => {
      const k = `${x},${y},${z}`;
      let v = id.get(k);
      if (v === undefined) { v = id.size; id.set(k, v); }
      return v;
    };
    const edges = new Map<string, number>();
    let chunks = 0;
    for (const key of w.kernel.meshKeys()) {
      const c = buildChunk(w.src, key, { refine: true, ao: false });
      if (!c) continue;
      chunks++;
      for (const g of c.groups) for (let t = 0; t < g.indices.length; t += 3) {
        const v = [0, 1, 2].map((j) => { const i = g.indices[t + j]; return vid(c.positions[i * 3], c.positions[i * 3 + 1], c.positions[i * 3 + 2]); });
        for (let j = 0; j < 3; j++) {
          const a = v[j], b = v[(j + 1) % 3];
          const k = a < b ? `${a}:${b}` : `${b}:${a}`;
          edges.set(k, (edges.get(k) ?? 0) + (a < b ? 1 : 1000));
        }
      }
    }
    expect(chunks).toBeGreaterThan(4); // the tunnel crosses several chunks
    let bad = 0;
    for (const n of edges.values()) if (n !== 1001) bad++;
    expect(bad).toBe(0);
  });

  it('bakes AO in 0..1 and groups triangles by substrate material', () => {
    const w = capsuleWorld();
    let total = 0;
    for (const key of w.kernel.meshKeys()) {
      const c = buildChunk(w.src, key, { refine: false, ao: true });
      if (!c) continue;
      for (let i = 0; i < c.vertexCount; i++) {
        expect(c.nest[i * 2]).toBeGreaterThanOrEqual(0);
        expect(c.nest[i * 2]).toBeLessThanOrEqual(1);
      }
      expect(c.groups.map((g) => g.code)).toEqual([0]); // all loam (code 0)
      total += c.groups.reduce((s, g) => s + g.indices.length / 3, 0);
    }
    expect(total).toBeGreaterThan(100);
  });
});
