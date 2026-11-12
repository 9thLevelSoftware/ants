/**
 * Marching cubes for carve-grid chunks. Pure TypeScript (no three).
 *
 * The 256-case triangle table is GENERATED at module load instead of being transcribed: for every case each cube face
 * contributes iso-segments (ambiguous faces with two diagonal open corners always SEPARATE the open corners, a rule
 * that depends only on the face's own corner signs, so both cubes sharing a face agree -> watertight). Segments are
 * oriented so the open side is consistently on one side, chained into loops and fan-triangulated. Triangles are
 * wound counter-clockwise when seen from the OPEN side (normal points into the cavity = "inward-facing" walls), so
 * the cavity renders with FrontSide from inside and is back-face culled from outside.
 *
 * Corner c of a cell is at offset (c&1, (c>>1)&1, (c>>2)&1). Edge e joins corners EDGES[e] = [a,b] with a < b along
 * axis EDGE_AXIS[e]; vertices are always interpolated from the lower-coordinate sample to the higher one, so a
 * vertex on a chunk seam is bit-identical in both chunks.
 */
import { CarveGrid, CH, chunkKey } from './carve';

export const EDGES: [number, number][] = [
  [0, 1], [2, 3], [4, 5], [6, 7], // x
  [0, 2], [1, 3], [4, 6], [5, 7], // y
  [0, 4], [1, 5], [2, 6], [3, 7], // z
];
export const EDGE_AXIS = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2];
const cornerPos = (c: number): [number, number, number] => [c & 1, (c >> 1) & 1, (c >> 2) & 1];

function edgeIndex(a: number, b: number): number {
  if (a > b) [a, b] = [b, a];
  for (let e = 0; e < 12; e++) if (EDGES[e][0] === a && EDGES[e][1] === b) return e;
  throw new Error('not an edge');
}

/** TRI_TABLE[case] = flat list of edge indices, 3 per triangle. case bit c set <=> corner c is OPEN (> iso). */
export const TRI_TABLE: number[][] = buildTable();

function buildTable(): number[][] {
  // faces: corners in cyclic order + outward normal
  const faces: { corners: number[]; n: [number, number, number] }[] = [];
  for (let ax = 0; ax < 3; ax++) for (let s = 0; s < 2; s++) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    const cyc: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const corners = cyc.map(([cu, cv]) => (s << ax) | (cu << u) | (cv << v));
    const n: [number, number, number] = [0, 0, 0];
    n[ax] = s ? 1 : -1;
    faces.push({ corners, n });
  }
  const mid = (e: number) => { const a = cornerPos(EDGES[e][0]), b = cornerPos(EDGES[e][1]); return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2]; };
  const table: number[][] = [];
  for (let cs = 0; cs < 256; cs++) {
    const open = (c: number) => ((cs >> c) & 1) === 1;
    const next = new Map<number, number>();
    for (const f of faces) {
      const segs: { e1: number; e2: number; o: number[] }[] = [];
      const cr = f.corners;
      const crossing: number[] = [];
      for (let i = 0; i < 4; i++) if (open(cr[i]) !== open(cr[(i + 1) % 4])) crossing.push(edgeIndex(cr[i], cr[(i + 1) % 4]));
      if (crossing.length === 0) continue;
      if (crossing.length === 2) {
        const oc = cr.filter(open).map(cornerPos);
        const cen = [0, 1, 2].map((k) => oc.reduce((s, p) => s + p[k], 0) / oc.length);
        const m1 = mid(crossing[0]), m2 = mid(crossing[1]);
        segs.push({ e1: crossing[0], e2: crossing[1], o: [0, 1, 2].map((k) => cen[k] - (m1[k] + m2[k]) / 2) });
      } else {
        // ambiguous face: two diagonal open corners -> one segment around each open corner (open corners separated)
        for (let i = 0; i < 4; i++) {
          if (!open(cr[i])) continue;
          const ea = edgeIndex(cr[i], cr[(i + 1) % 4]), eb = edgeIndex(cr[i], cr[(i + 3) % 4]);
          const p = cornerPos(cr[i]), m1 = mid(ea), m2 = mid(eb);
          segs.push({ e1: ea, e2: eb, o: [0, 1, 2].map((k) => p[k] - (m1[k] + m2[k]) / 2) });
        }
      }
      for (const s of segs) {
        // direction d = o x n (open side ends up on the left of travel seen from the open side; see header)
        const o = s.o, n = f.n;
        const d = [o[1] * n[2] - o[2] * n[1], o[2] * n[0] - o[0] * n[2], o[0] * n[1] - o[1] * n[0]];
        const m1 = mid(s.e1), m2 = mid(s.e2);
        const dd = (m2[0] - m1[0]) * d[0] + (m2[1] - m1[1]) * d[1] + (m2[2] - m1[2]) * d[2];
        if (dd > 0) next.set(s.e1, s.e2); else next.set(s.e2, s.e1);
      }
    }
    const tris: number[] = [];
    const used = new Set<number>();
    for (const start of next.keys()) {
      if (used.has(start)) continue;
      const loop: number[] = [];
      let e = start;
      while (!used.has(e)) { used.add(e); loop.push(e); const nx = next.get(e); if (nx === undefined) throw new Error('open loop ' + cs); e = nx; }
      for (let i = 1; i + 1 < loop.length; i++) tris.push(loop[0], loop[i], loop[i + 1]);
    }
    table.push(tris);
  }
  return table;
}

export interface ChunkMesh {
  key: number;
  positions: Float32Array; // world mm
  normals: Float32Array; // unit, pointing into the open cavity
  /** substrate distance (soil + hard primitives, carve grid ignored) per vertex: > 0 => vertex in open air */
  sub: Float32Array;
  indices: Uint16Array;
}

// scratch buffers (one chunk at a time)
const N = CH + 3; // samples -1 .. 17 along each axis (19)
const S = new Float32Array(N * N * N);
const GX = new Float32Array(N * N * N), GY = new Float32Array(N * N * N), GZ = new Float32Array(N * N * N);
const VCACHE = new Int32Array((CH + 1) * (CH + 1) * (CH + 1) * 3);
const MAXV = (CH + 1) * (CH + 1) * (CH + 1) * 3;
const POS = new Float32Array(MAXV * 3), NRM = new Float32Array(MAXV * 3), SUB = new Float32Array(MAXV);
const IDX = new Uint16Array(CH * CH * CH * 5 * 3 * 2);
const ISO = 127.5;

/**
 * Mesh one chunk. Reads samples -1..17 (one-voxel overlap for the seams, one more ring for the central-difference
 * normals). `substrate(x,y,z)` supplies the per-vertex discard attribute. Returns null if the chunk has no surface.
 */
export function meshChunk(grid: CarveGrid, cx: number, cy: number, cz: number,
  substrate: (x: number, y: number, z: number) => number): ChunkMesh | null {
  const bi = cx * CH, bj = cy * CH, bk = cz * CH, v = grid.voxel;
  // gather samples (-1..17)
  const own = grid.getChunk(cx, cy, cz);
  let any = false;
  for (let z = 0; z < N; z++) for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const li = x - 1, lj = y - 1, lk = z - 1;
    let s: number;
    if (own && li >= 0 && li < CH && lj >= 0 && lj < CH && lk >= 0 && lk < CH) s = own[li + (lj << 4) + (lk << 8)];
    else s = grid.sample(bi + li, bj + lj, bk + lk);
    S[x + N * (y + N * z)] = s;
    if (s > ISO) any = true;
  }
  if (!any) return null;
  // sample gradients (central differences) for samples 0..16 (local idx 1..17)
  for (let z = 1; z < N - 1; z++) for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = x + N * (y + N * z);
    GX[i] = S[i + 1] - S[i - 1]; GY[i] = S[i + N] - S[i - N]; GZ[i] = S[i + N * N] - S[i - N * N];
  }
  VCACHE.fill(-1);
  let nv = 0, ni = 0;
  const M = CH + 1;
  const vertexFor = (lx: number, ly: number, lz: number, e: number): number => {
    // edge e of the cell at local (lx,ly,lz): base corner a, axis
    const a = EDGES[e][0], ax = EDGE_AXIS[e];
    const ex = lx + (a & 1), ey = ly + ((a >> 1) & 1), ez = lz + ((a >> 2) & 1);
    const ck = ((ez * M + ey) * M + ex) * 3 + ax;
    const cached = VCACHE[ck];
    if (cached >= 0) return cached;
    const i0 = (ex + 1) + N * ((ey + 1) + N * (ez + 1));
    const i1 = ax === 0 ? i0 + 1 : ax === 1 ? i0 + N : i0 + N * N;
    const s0 = S[i0], s1 = S[i1];
    const t = (ISO - s0) / (s1 - s0);
    let gx = bi + ex, gy = bj + ey, gz = bk + ez;
    if (ax === 0) gx += t; else if (ax === 1) gy += t; else gz += t;
    const px = gx * v, py = gy * v, pz = gz * v;
    const o = nv * 3;
    POS[o] = px; POS[o + 1] = py; POS[o + 2] = pz;
    let nx = GX[i0] + (GX[i1] - GX[i0]) * t, ny = GY[i0] + (GY[i1] - GY[i0]) * t, nz = GZ[i0] + (GZ[i1] - GZ[i0]) * t;
    const l = Math.hypot(nx, ny, nz) || 1;
    // openness increases into the cavity, so +grad points into open space (the inward-facing wall normal)
    NRM[o] = nx / l; NRM[o + 1] = ny / l; NRM[o + 2] = nz / l;
    SUB[nv] = substrate(px, py, pz);
    VCACHE[ck] = nv;
    return nv++;
  };
  for (let z = 0; z < CH; z++) for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const i = (x + 1) + N * ((y + 1) + N * (z + 1));
    let cs = 0;
    if (S[i] > ISO) cs |= 1;
    if (S[i + 1] > ISO) cs |= 2;
    if (S[i + N] > ISO) cs |= 4;
    if (S[i + N + 1] > ISO) cs |= 8;
    if (S[i + N * N] > ISO) cs |= 16;
    if (S[i + N * N + 1] > ISO) cs |= 32;
    if (S[i + N * N + N] > ISO) cs |= 64;
    if (S[i + N * N + N + 1] > ISO) cs |= 128;
    if (cs === 0 || cs === 255) continue;
    const tri = TRI_TABLE[cs];
    for (let t = 0; t < tri.length; t++) IDX[ni++] = vertexFor(x, y, z, tri[t]);
  }
  if (ni === 0) return null;
  return {
    key: chunkKey(cx, cy, cz),
    positions: POS.slice(0, nv * 3), normals: NRM.slice(0, nv * 3), sub: SUB.slice(0, nv), indices: IDX.slice(0, ni),
  };
}
