import { describe, expect, it } from 'vitest';
import type { CarveData } from '@/sim/types/geom';
import { createCarveGrid, type CarveGrid } from './grid';
import { keyCx, keyCy, keyCz } from './keys';
import { meshChunk, type ChunkMesh } from './mc';
import { TRI_COUNT } from './mcTables';

const V = 2;
const vec = (x: number, y: number, z: number) => ({ x, y, z });

function meshAll(g: CarveGrid, opts = {}): ChunkMesh[] {
  const out: ChunkMesh[] = [];
  for (const key of g.meshKeys()) {
    const m = meshChunk(g, keyCx(key), keyCy(key), keyCz(key), opts);
    if (m) out.push(m);
  }
  return out;
}

/** Merges vertices by exact position and returns triangles as position ids. */
function weld(meshes: ChunkMesh[]): { tris: number[]; pos: number[] } {
  const ids = new Map<string, number>();
  const pos: number[] = [];
  const tris: number[] = [];
  for (const m of meshes) {
    const local: number[] = [];
    for (let v = 0; v < m.positions.length / 3; v++) {
      const k = `${m.positions[v * 3]},${m.positions[v * 3 + 1]},${m.positions[v * 3 + 2]}`;
      let id = ids.get(k);
      if (id === undefined) { id = pos.length / 3; ids.set(k, id); pos.push(m.positions[v * 3], m.positions[v * 3 + 1], m.positions[v * 3 + 2]); }
      local.push(id);
    }
    for (const i of m.indices) tris.push(local[i]);
  }
  return { tris, pos };
}

describe('marching cubes tables', () => {
  it('has no triangles for empty/full cells and at most 5 per case', () => {
    expect(TRI_COUNT[0]).toBe(0);
    expect(TRI_COUNT[255]).toBe(0);
    for (let c = 1; c < 255; c++) {
      expect(TRI_COUNT[c] % 3).toBe(0);
      expect(TRI_COUNT[c]).toBeGreaterThan(0);
      expect(TRI_COUNT[c]).toBeLessThanOrEqual(15);
    }
  });
});

describe('meshChunk', () => {
  it('a closed cavity spanning 8 chunks is watertight and consistently oriented across seams', () => {
    const data: CarveData = { voxel: V, keys: [], chunks: [], breaches: [] };
    const g = createCarveGrid(data);
    // a lumpy blob around the corner shared by 8 chunks (world 32, 32, 32 mm), plus a tunnel through a seam
    g.carveSphere(vec(32, 32, 32), 9);
    g.carveSphere(vec(40.3, 27.1, 35.6), 6.5);
    g.carveCapsule(vec(20, 30, 31), vec(50, 36, 30), 3.3);
    g.carveEllipsoid(vec(30, 40.5, 25), vec(10, 3, 7));
    const meshes = meshAll(g);
    expect(meshes.length).toBeGreaterThanOrEqual(8);
    const { tris } = weld(meshes);
    const directed = new Map<string, number>();
    for (let t = 0; t < tris.length; t += 3) {
      const a = tris[t], b = tris[t + 1], c = tris[t + 2];
      expect(a !== b && b !== c && a !== c).toBe(true);
      for (const [u, v] of [[a, b], [b, c], [c, a]]) {
        const k = `${u}>${v}`;
        directed.set(k, (directed.get(k) ?? 0) + 1);
      }
    }
    let bad = 0;
    for (const [k, n] of directed) {
      const [u, v] = k.split('>');
      if (n !== 1 || directed.get(`${v}>${u}`) !== 1) bad++;
    }
    expect(bad).toBe(0); // every edge shared by exactly two triangles with opposite directions
  });

  it('normals and winding face into the cavity', () => {
    const g = createCarveGrid({ voxel: V, keys: [], chunks: [], breaches: [] });
    const c = vec(20.3, -15.2, 18.7);
    g.carveSphere(c, 10);
    const grad = (x: number, y: number, z: number, out: { x: number; y: number; z: number }) => { g.cavity(x, y, z, out); };
    for (const opts of [{}, { gradient: grad }]) {
      const meshes = meshAll(g, opts);
      let n = 0;
      for (const m of meshes) {
        const P = m.positions, Nn = m.normals;
        for (let v = 0; v < P.length / 3; v++) {
          const tx = c.x - P[v * 3], ty = c.y - P[v * 3 + 1], tz = c.z - P[v * 3 + 2];
          expect(Nn[v * 3] * tx + Nn[v * 3 + 1] * ty + Nn[v * 3 + 2] * tz).toBeGreaterThan(0);
          n++;
        }
        for (let t = 0; t < m.indices.length; t += 3) {
          const a = m.indices[t] * 3, b = m.indices[t + 1] * 3, d = m.indices[t + 2] * 3;
          const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2];
          const vx = P[d] - P[a], vy = P[d + 1] - P[a + 1], vz = P[d + 2] - P[a + 2];
          const gx = uy * vz - uz * vy, gy = uz * vx - ux * vz, gz = ux * vy - uy * vx;
          const nx = Nn[a] + Nn[b] + Nn[d], ny = Nn[a + 1] + Nn[b + 1] + Nn[d + 1], nz = Nn[a + 2] + Nn[b + 2] + Nn[d + 2];
          if (Math.hypot(gx, gy, gz) > 1e-6) expect(gx * nx + gy * ny + gz * nz).toBeGreaterThan(0);
        }
      }
      expect(n).toBeGreaterThan(100);
    }
  });

  it('fills the substrate attribute and returns null for chunks without surface', () => {
    const g = createCarveGrid({ voxel: V, keys: [], chunks: [], breaches: [] });
    g.carveSphere(vec(10, 0, 10), 5);
    const meshes = meshAll(g, { substrate: (_x: number, y: number) => y });
    const all = meshes.flatMap((m) => [...m.substrate]);
    expect(Math.max(...all)).toBeGreaterThan(0);
    expect(Math.min(...all)).toBeLessThan(0);
    expect(meshChunk(g, 20, 20, 20)).toBeNull();
  });
});
