// Turns the kernel's marching-cubes mesh of one chunk into render-ready arrays: optional silhouette refinement,
// per-vertex ambient occlusion, soil moisture, fresh-carving tick and ground openness, and triangles grouped by
// substrate material (soil, wood ...). Pure typed-array code (no three).
//
// A build runs in BUILD_STAGES steps (ChunkBuildJob) so the mesh manager can stop between two of them when the
// per-frame budget is used up: a busy chunk is spread over a few frames instead of blowing one frame.
import { MATERIAL_IDS, type MaterialId } from '@/sim/types';
import { HOLE_MARGIN_BU, HOLE_PROBE_DEPTH_BU } from '@/render/world/lighting/simAdapter';
import type { ChunkMesh, NestSource } from '../simAdapter';
import {
  AO_MIN, AO_TAPS_BU, HOLE_ATTR_CLAMP_MM, HOLE_ATTR_DEPTH_BU, NEST_ATTR, REFINE_EXACT_SOIL_BU, REFINE_FLAT_DEG, REFINE_MAX_MOVE_VOXELS,
} from '../params';
import { refineMesh, type MeshArrays } from './refine';

export interface BuildOptions {
  refine: boolean;
  ao: boolean;
  /** Tick at which the wall at a point was carved during play (fresh look), or a large negative number. */
  carvedAt?: (x: number, y: number, z: number) => number;
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
  /** Per vertex (NEST_ATTR): ambient occlusion 0..1, soil moisture 0..1, tick the wall was carved, ground openness. */
  nest: Float32Array;
  groups: MaterialGroup[];
  vertexCount: number;
  triangleCount: number;
  /** Marching-cubes triangles before refinement (the manager's cost estimates scale with it). */
  sourceTriangles: number;
}

const CODE: Map<string, number> = new Map(MATERIAL_IDS.map((m, i) => [m, i]));

export function materialIndex(m: MaterialId): number {
  return CODE.get(m) ?? 0;
}

/** carvedAt value of walls that are not fresh. */
export const NOT_FRESH = -1e9;
/** Number of steps of a ChunkBuildJob. */
export const BUILD_STAGES = 4;

/**
 * Signed openness of the ground above a point, mm (> 0: the terrain is cut open there). The same probe as the
 * world renderer's terrain hole mask (render-world fieldHoleProbe: carve cavity just below the terrain surface
 * minus the hole margin), so the walls keep their skin band exactly where the terrain is drawn.
 */
export function groundOpenness(src: NestSource, x: number, z: number): number {
  const y = src.height(x, z) - HOLE_PROBE_DEPTH_BU * src.bu;
  return src.cavity(x, y, z, null) - HOLE_MARGIN_BU * src.bu;
}

/** One chunk build, run stage by stage (`step()` until `done`). */
export class ChunkBuildJob {
  /** Next stage to run; BUILD_STAGES = finished. */
  stage = 0;
  /** The built chunk once done (null: no surface). */
  result: BuiltChunk | null = null;
  /** Marching-cubes triangles (known after stage 0). */
  sourceTriangles = 0;
  private arrays: MeshArrays | null = null;
  private parent: Int32Array | null = null;
  private original = 0;
  private mat: Uint8Array | null = null;
  private nest: Float32Array | null = null;
  private c3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly src: NestSource, readonly key: number, private readonly opts: BuildOptions) {}

  get done(): boolean {
    return this.stage >= BUILD_STAGES;
  }

  /** Runs the next stage. */
  step(): void {
    switch (this.stage) {
      case 0: this.mesh(); break;
      case 1: this.refine(); break;
      case 2: this.attributes(); break;
      default: this.finish();
    }
    if (this.stage < BUILD_STAGES) this.stage++;
  }

  /** Stage 0: the kernel's marching cubes (the one step that cannot be split further). */
  private mesh(): void {
    const m: ChunkMesh | null = this.src.meshChunk(this.key);
    if (!m || m.indices.length === 0) { this.stage = BUILD_STAGES; return; }
    this.sourceTriangles = m.indices.length / 3;
    this.arrays = { positions: m.positions, normals: m.normals, sub: m.substrate, indices: m.indices };
    this.original = m.positions.length / 3;
  }

  /** Stage 1: silhouette refinement (refine.ts). */
  private refine(): void {
    if (!this.opts.refine) return;
    const src = this.src;
    const r = refineMesh(this.arrays!, {
      soil: (x, y, z) => src.soil(x, y, z),
      maxMove: REFINE_MAX_MOVE_VOXELS * src.voxel,
      exactDepth: REFINE_EXACT_SOIL_BU * src.bu,
      flatCos: Math.cos((REFINE_FLAT_DEG * Math.PI) / 180),
    });
    this.arrays = r;
    this.parent = r.parent;
    this.original = r.originalCount;
  }

  /** Stage 2: per-vertex material, moisture, fresh-carving tick, ground openness. */
  private attributes(): void {
    const src = this.src, P = this.arrays!.positions, S = this.arrays!.sub;
    const nv = P.length / 3, A = NEST_ATTR, original = this.original;
    const mat = new Uint8Array(nv);
    const nest = new Float32Array(nv * A);
    const carvedAt = this.opts.carvedAt;
    const holeDepth = -HOLE_ATTR_DEPTH_BU * src.bu, clampMm = HOLE_ATTR_CLAMP_MM;
    for (let i = 0; i < original; i++) {
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2];
      mat[i] = materialIndex(src.materialAt(x, y, z));
      nest[i * A + 1] = src.moistureAt(x, y, z);
      nest[i * A + 2] = carvedAt ? carvedAt(x, y, z) : NOT_FRESH;
    }
    const parent = this.parent;
    if (parent) {
      for (let i = original; i < nv; i++) {
        const a = parent[i];
        mat[i] = mat[a]; nest[i * A + 1] = nest[a * A + 1]; nest[i * A + 2] = nest[a * A + 2];
      }
    }
    // ground openness (every vertex, midpoints too: it decides the skin band along the hole outline)
    for (let i = 0; i < nv; i++) {
      const open = S[i] > holeDepth ? groundOpenness(src, P[i * 3], P[i * 3 + 2]) : -clampMm;
      nest[i * A + 3] = Math.max(-clampMm, Math.min(clampMm, open));
    }
    this.mat = mat;
    this.nest = nest;
  }

  /** Stage 3: ambient occlusion and the per-material triangle groups. */
  private finish(): void {
    const src = this.src, arrays = this.arrays!, nest = this.nest!, mat = this.mat!;
    const { positions: P, normals: N } = arrays;
    const nv = P.length / 3, A = NEST_ATTR;
    // ambient occlusion: openness two taps along the normal (corners and pinches darken)
    const t1 = AO_TAPS_BU[0] * src.bu, t2 = AO_TAPS_BU[1] * src.bu;
    for (let i = 0; i < nv; i++) {
      if (!this.opts.ao) { nest[i * A] = 1; continue; }
      const x = P[i * 3], y = P[i * 3 + 1], z = P[i * 3 + 2], nx = N[i * 3], ny = N[i * 3 + 1], nz = N[i * 3 + 2];
      const o = 0.5 * (src.openness(x + nx * t1, y + ny * t1, z + nz * t1) + src.openness(x + nx * t2, y + ny * t2, z + nz * t2));
      nest[i * A] = AO_MIN + (1 - AO_MIN) * Math.min(1, Math.max(0, (o - 0.5) * 2));
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
    this.src.keyToChunk(this.key, this.c3);
    this.result = {
      key: this.key, cx: this.c3.x, cy: this.c3.y, cz: this.c3.z, positions: P, normals: N, sub: arrays.sub, nest, groups,
      vertexCount: nv, triangleCount: nt, sourceTriangles: this.sourceTriangles,
    };
    this.arrays = null; this.mat = null; this.nest = null; this.parent = null;
  }
}

/** Builds one chunk in one go; null when it has no surface. */
export function buildChunk(src: NestSource, key: number, opts: BuildOptions): BuiltChunk | null {
  const job = new ChunkBuildJob(src, key, opts);
  while (!job.done) job.step();
  return job.result;
}
