// Turns the kernel's marching-cubes mesh of one chunk into render-ready arrays: optional silhouette refinement,
// per-vertex ambient occlusion and soil moisture, and triangles grouped by substrate material (soil, wood ...).
// Pure typed-array code (no three).
import { MATERIAL_IDS, type MaterialId } from '@/sim/types';
import type { NestSource } from '../simAdapter';
import { AO_MIN, AO_TAPS_BU, REFINE_EXACT_SOIL_BU, REFINE_FLAT_DEG, REFINE_MAX_MOVE_VOXELS } from '../params';
import { refineMesh, type MeshArrays } from './refine';

export interface BuildOptions {
  refine: boolean;
  ao: boolean;
}

/** Triangles of one material: indices into the chunk's vertex arrays. */
export interface MaterialGroup {
  /** Index into MATERIAL_IDS. */
  code: number;
  indices: Uint32Array;
}

export interface BuiltChunk {
  key: number;
  cx: number; cy: number; cz: number;
  positions: Float32Array;
  normals: Float32Array;
  /** Soil distance per vertex, mm (> -skin: discarded). */
  sub: Float32Array;
  /** Per vertex: x = ambient occlusion 0..1, y = soil moisture 0..1. */
  nest: Float32Array;
  groups: MaterialGroup[];
  vertexCount: number;
  triangleCount: number;
}

const CODE: Map<string, number> = new Map(MATERIAL_IDS.map((m, i) => [m, i]));

export function materialIndex(m: MaterialId): number {
  return CODE.get(m) ?? 0;
}

const c3 = { x: 0, y: 0, z: 0 };

/** Builds one chunk; null when it has no surface. */
export function buildChunk(src: NestSource, key: number, opts: BuildOptions): BuiltChunk | null {
  const m = src.meshChunk(key);
  if (!m || m.indices.length === 0) return null;
  src.keyToChunk(key, c3);
  let arrays: MeshArrays = { positions: m.positions, normals: m.normals, sub: m.substrate, indices: m.indices };
  let parent: Int32Array | null = null;
  let original = m.positions.length / 3;
  if (opts.refine) {
    const r = refineMesh(arrays, {
      soil: (x, y, z) => src.soil(x, y, z),
      maxMove: REFINE_MAX_MOVE_VOXELS * src.voxel,
      exactDepth: REFINE_EXACT_SOIL_BU * src.bu,
      flatCos: Math.cos((REFINE_FLAT_DEG * Math.PI) / 180),
    });
    arrays = r;
    parent = r.parent;
    original = r.originalCount;
  }
  const { positions: P, normals: N } = arrays;
  const nv = P.length / 3;

  // per original vertex: material code and moisture; midpoints inherit from their parent
  const mat = new Uint8Array(nv);
  const nest = new Float32Array(nv * 2);
  for (let i = 0; i < original; i++) {
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
    mat[i] = materialIndex(src.materialAt(x, y, z));
    nest[i * 2 + 1] = src.moistureAt(x, y, z);
  }
  if (parent) for (let i = original; i < nv; i++) { const a = parent[i]; mat[i] = mat[a]; nest[i * 2 + 1] = nest[a * 2 + 1]; }

  // ambient occlusion: openness two taps along the normal (corners and pinches darken)
  const t1 = AO_TAPS_BU[0] * src.bu, t2 = AO_TAPS_BU[1] * src.bu;
  for (let i = 0; i < nv; i++) {
    if (!opts.ao) { nest[i * 2] = 1; continue; }
    const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
    const o = 0.5 * (src.openness(x + nx * t1, y + ny * t1, z + nz * t1) + src.openness(x + nx * t2, y + ny * t2, z + nz * t2));
    nest[i * 2] = AO_MIN + (1 - AO_MIN) * Math.min(1, Math.max(0, (o - 0.5) * 2));
  }

  // triangles grouped by the majority material of their corners
  const I = arrays.indices;
  const nt = I.length / 3;
  const triMat = new Uint8Array(nt);
  const counts = new Map<number, number>();
  for (let t = 0; t < nt; t++) {
    const a = mat[I[t * 3]], b = mat[I[t * 3 + 1]], c = mat[I[t * 3 + 2]];
    const code = a === b || a === c ? a : b === c ? b : a;
    triMat[t] = code;
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const groups: MaterialGroup[] = [];
  for (const [code, count] of [...counts.entries()].sort((x, y) => x[0] - y[0])) {
    const idx = new Uint32Array(count * 3);
    let k = 0;
    for (let t = 0; t < nt; t++) {
      if (triMat[t] !== code) continue;
      idx[k++] = I[t * 3]; idx[k++] = I[t * 3 + 1]; idx[k++] = I[t * 3 + 2];
    }
    groups.push({ code, indices: idx });
  }
  return {
    key, cx: c3.x, cy: c3.y, cz: c3.z, positions: P, normals: N, sub: arrays.sub, nest, groups, vertexCount: nv, triangleCount: nt,
  };
}
