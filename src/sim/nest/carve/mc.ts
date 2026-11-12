// Marching cubes for one carve-grid chunk, output as plain typed arrays (pure: runs in a worker or in Node).
//
// A chunk meshes the cells between its samples 0..16 (one-sample overlap with the +x/+y/+z neighbours) and
// reads samples -1..17 for central-difference normals. Vertices are always interpolated from the lower sample
// to the higher one along an edge, so a vertex on a chunk seam is bit-identical in both chunks (watertight
// after merging by position). Triangles face the cavity (see mcTables.ts).

import type { Vec3 } from '@/core/math/vec3';
import { CHUNK, ISO as ISOImp, chunkKey } from './keys';
import { EDGES, EDGE_AXIS, MAX_CASE_EDGES, TRI_COUNT as TRI_COUNTImp, TRI_EDGES as TRI_EDGESImp } from './mcTables';
import type { CarveGrid } from './grid';

// Hot imports re-bound as local consts: under Vitest (vite-node) an imported binding is read through a getter
// on a module object, several times slower in tight loops; in the browser build both forms are equivalent.
const ISO = ISOImp, TRI_COUNT = TRI_COUNTImp, TRI_EDGES = TRI_EDGESImp;

export interface ChunkMesh {
  key: number;
  cx: number; cy: number; cz: number;
  /** World positions, mm (xyz per vertex). */
  positions: Float32Array;
  /** Unit normals pointing into the open cavity. */
  normals: Float32Array;
  /**
   * Per-vertex substrate distance (mm; the diggable group: terrain + diggable objects, carve ignored).
   * > 0 means the vertex lies in open air: renderers discard those fragments (cavity parts poking out of
   * the ground at entrances). -1e6 when no substrate function was given.
   */
  substrate: Float32Array;
  /** Triangle list, counter-clockwise seen from inside the cavity. */
  indices: Uint16Array;
}

export interface MeshOptions {
  /** Substrate distance for the per-vertex discard attribute (see ChunkMesh.substrate). */
  substrate?: ((x: number, y: number, z: number) => number) | null;
  /**
   * Optional normal source, e.g. the world field gradient (normalised here). Default: central differences of
   * the openness samples interpolated along the edge (the gradient of the cavity term; smooth and seam-exact).
   */
  gradient?: ((x: number, y: number, z: number, out: Vec3) => void) | null;
}

const N = CHUNK + 3; // samples -1 .. 17 per axis
const NN = N * N;
const M = CHUNK + 1; // vertex-cache grid 0 .. 16
const S = new Float32Array(N * N * N);
const GX = new Float32Array(N * N * N), GY = new Float32Array(N * N * N), GZ = new Float32Array(N * N * N);
const VCACHE = new Int32Array(M * M * M * 3);
const MAXV = M * M * M * 3;
const POS = new Float32Array(MAXV * 3), NRM = new Float32Array(MAXV * 3), SUB = new Float32Array(MAXV);
const IDX = new Uint16Array(CHUNK * CHUNK * CHUNK * MAX_CASE_EDGES);
const EDGE_A = new Int8Array(EDGES.map((e) => e[0]));
const EDGE_AX = new Int8Array(EDGE_AXIS);
const _n: Vec3 = { x: 0, y: 0, z: 0 };

/** Meshes chunk (cx, cy, cz). Returns null when the chunk has no iso surface. Allocates only the output arrays. */
export function meshChunk(grid: CarveGrid, cx: number, cy: number, cz: number, opts: MeshOptions = {}): ChunkMesh | null {
  const bi = cx * CHUNK, bj = cy * CHUNK, bk = cz * CHUNK, v = grid.voxel;
  if (!gatherSamples(grid, bi, bj, bk)) return null;
  for (let z = 1; z < N - 1; z++) for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = x + N * (y + N * z);
    GX[i] = S[i + 1] - S[i - 1]; GY[i] = S[i + N] - S[i - N]; GZ[i] = S[i + NN] - S[i - NN];
  }
  VCACHE.fill(-1);
  const substrate = opts.substrate ?? null, gradient = opts.gradient ?? null;
  let nv = 0, ni = 0;

  const vertexFor = (lx: number, ly: number, lz: number, e: number): number => {
    const a = EDGE_A[e], ax = EDGE_AX[e];
    const ex = lx + (a & 1), ey = ly + ((a >> 1) & 1), ez = lz + ((a >> 2) & 1);
    const ck = ((ez * M + ey) * M + ex) * 3 + ax;
    const cached = VCACHE[ck];
    if (cached >= 0) return cached;
    const i0 = (ex + 1) + N * ((ey + 1) + N * (ez + 1));
    const i1 = ax === 0 ? i0 + 1 : ax === 1 ? i0 + N : i0 + NN;
    const s0 = S[i0], s1 = S[i1];
    const t = (ISO - s0) / (s1 - s0);
    let gx = bi + ex, gy = bj + ey, gz = bk + ez;
    if (ax === 0) gx += t; else if (ax === 1) gy += t; else gz += t;
    const px = gx * v, py = gy * v, pz = gz * v;
    const o = nv * 3;
    POS[o] = px; POS[o + 1] = py; POS[o + 2] = pz;
    let nx: number, ny: number, nz: number;
    if (gradient) {
      gradient(px, py, pz, _n);
      nx = _n.x; ny = _n.y; nz = _n.z;
    } else {
      // openness increases into the cavity: +gradient points into open space
      nx = GX[i0] + (GX[i1] - GX[i0]) * t; ny = GY[i0] + (GY[i1] - GY[i0]) * t; nz = GZ[i0] + (GZ[i1] - GZ[i0]) * t;
    }
    const l = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    NRM[o] = nx / l; NRM[o + 1] = ny / l; NRM[o + 2] = nz / l;
    SUB[nv] = substrate ? substrate(px, py, pz) : -1e6;
    VCACHE[ck] = nv;
    return nv++;
  };

  for (let z = 0; z < CHUNK; z++) for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) {
    const i = (x + 1) + N * ((y + 1) + N * (z + 1));
    let cs = 0;
    if (S[i] > ISO) cs |= 1;
    if (S[i + 1] > ISO) cs |= 2;
    if (S[i + N] > ISO) cs |= 4;
    if (S[i + N + 1] > ISO) cs |= 8;
    if (S[i + NN] > ISO) cs |= 16;
    if (S[i + NN + 1] > ISO) cs |= 32;
    if (S[i + NN + N] > ISO) cs |= 64;
    if (S[i + NN + N + 1] > ISO) cs |= 128;
    if (cs === 0 || cs === 255) continue;
    const base = cs * MAX_CASE_EDGES, cnt = TRI_COUNT[cs];
    for (let t = 0; t < cnt; t++) IDX[ni++] = vertexFor(x, y, z, TRI_EDGES[base + t]);
  }
  if (ni === 0) return null;
  return {
    key: chunkKey(cx, cy, cz), cx, cy, cz,
    positions: POS.slice(0, nv * 3), normals: NRM.slice(0, nv * 3), substrate: SUB.slice(0, nv), indices: IDX.slice(0, ni),
  };
}

/** Fills S with samples -1..17 around the chunk. Returns false when no sample in the meshed range is open. */
function gatherSamples(grid: CarveGrid, bi: number, bj: number, bk: number): boolean {
  let any = false;
  for (let z = 0; z < N; z++) {
    const k = bk + z - 1;
    for (let y = 0; y < N; y++) {
      const j = bj + y - 1;
      for (let x = 0; x < N; x++) {
        const s = grid.sampleAt(bi + x - 1, j, k);
        S[x + N * (y + N * z)] = s;
        if (s > ISO && x >= 1 && x <= CHUNK + 1 && y >= 1 && y <= CHUNK + 1 && z >= 1 && z <= CHUNK + 1) any = true;
      }
    }
  }
  return any;
}
