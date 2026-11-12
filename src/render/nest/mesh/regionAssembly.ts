// Packs the built chunks of one region (REGION_CHUNKS^3 chunks) into one set of vertex arrays with triangles
// sorted by material, so a region is one geometry with one draw group per wall material. Pure typed arrays.
import type { BuiltChunk } from './chunkBuild';

export interface RegionArrays {
  positions: Float32Array;
  normals: Float32Array;
  sub: Float32Array;
  nest: Float32Array;
  indices: Uint16Array | Uint32Array;
  /** Draw groups in index order: material code, first index, index count. */
  groups: { code: number; start: number; count: number }[];
  vertexCount: number;
  triangleCount: number;
}

/** Region key of a chunk (region coordinates in [-512, 511]); decoded in ChunkMeshManager.regionBounds. */
export function regionKey(cx: number, cy: number, cz: number, r: number): number {
  const rx = Math.floor(cx / r) + 512, ry = Math.floor(cy / r) + 512, rz = Math.floor(cz / r) + 512;
  return rx + ry * 1024 + rz * 1048576;
}

export function assembleRegion(chunks: readonly BuiltChunk[]): RegionArrays {
  let nv = 0, ni = 0;
  for (const c of chunks) { nv += c.vertexCount; for (const g of c.groups) ni += g.indices.length; }
  const positions = new Float32Array(nv * 3), normals = new Float32Array(nv * 3), sub = new Float32Array(nv), nest = new Float32Array(nv * 2);
  const indices = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  const base = new Map<BuiltChunk, number>();
  let v = 0;
  for (const c of chunks) {
    base.set(c, v);
    positions.set(c.positions, v * 3);
    normals.set(c.normals, v * 3);
    sub.set(c.sub, v);
    nest.set(c.nest, v * 2);
    v += c.vertexCount;
  }
  const codes = [...new Set(chunks.flatMap((c) => c.groups.map((g) => g.code)))].sort((a, b) => a - b);
  const groups: RegionArrays['groups'] = [];
  let k = 0;
  for (const code of codes) {
    const start = k;
    for (const c of chunks) {
      const b = base.get(c)!;
      for (const g of c.groups) {
        if (g.code !== code) continue;
        const src = g.indices;
        for (let i = 0; i < src.length; i++) indices[k++] = src[i] + b;
      }
    }
    groups.push({ code, start, count: k - start });
  }
  return { positions, normals, sub, nest, indices, groups, vertexCount: nv, triangleCount: ni / 3 };
}
