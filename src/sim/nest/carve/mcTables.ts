// Marching-cubes lookup tables, GENERATED at module load (no transcription risk; ported from the nest spike).
//
// Corner c of a cell sits at offset (c & 1, (c >> 1) & 1, (c >> 2) & 1). Edge e joins corners EDGES[e] = [a, b]
// with a < b along axis EDGE_AXIS[e]. Case bit c is set when corner c is OPEN (> iso).
//
// For every case each cube face contributes iso segments. An ambiguous face (two diagonal open corners) always
// SEPARATES the open corners; this depends only on the face's own corners, so both cells sharing a face agree
// and the mesh is watertight. Segments are oriented so the open side is consistently on one side, chained into
// loops and fan-triangulated (at most 5 triangles per case). Triangles wind counter-clockwise seen from the
// OPEN side: the geometric normal points into the cavity ("inward-facing" walls).

export const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [2, 3], [4, 5], [6, 7], // along x
  [0, 2], [1, 3], [4, 6], [5, 7], // along y
  [0, 4], [1, 5], [2, 6], [3, 7], // along z
];
export const EDGE_AXIS: readonly number[] = [0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2];

/** Max edge indices per case (5 triangles). */
export const MAX_CASE_EDGES = 15;
/** Number of edge indices (3 per triangle) for each of the 256 cases. */
export const TRI_COUNT = new Uint8Array(256);
/** Edge indices, case c at [c * 15, c * 15 + TRI_COUNT[c]). */
export const TRI_EDGES = new Int8Array(256 * MAX_CASE_EDGES);

const cornerPos = (c: number): [number, number, number] => [c & 1, (c >> 1) & 1, (c >> 2) & 1];

function edgeIndex(a: number, b: number): number {
  if (a > b) [a, b] = [b, a];
  for (let e = 0; e < 12; e++) if (EDGES[e][0] === a && EDGES[e][1] === b) return e;
  throw new Error('mcTables: not an edge');
}

function edgeMid(e: number): [number, number, number] {
  const a = cornerPos(EDGES[e][0]), b = cornerPos(EDGES[e][1]);
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
}

interface Face { corners: number[]; n: [number, number, number] }

function cubeFaces(): Face[] {
  const faces: Face[] = [];
  for (let ax = 0; ax < 3; ax++) for (let s = 0; s < 2; s++) {
    const u = (ax + 1) % 3, v = (ax + 2) % 3;
    const cyc: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const corners = cyc.map(([cu, cv]) => (s << ax) | (cu << u) | (cv << v));
    const n: [number, number, number] = [0, 0, 0];
    n[ax] = s ? 1 : -1;
    faces.push({ corners, n });
  }
  return faces;
}

function caseTriangles(cs: number, faces: Face[]): number[] {
  const open = (c: number) => ((cs >> c) & 1) === 1;
  const next = new Map<number, number>();
  for (const f of faces) {
    const cr = f.corners;
    const segs: { e1: number; e2: number; o: number[] }[] = [];
    const crossing: number[] = [];
    for (let i = 0; i < 4; i++) if (open(cr[i]) !== open(cr[(i + 1) % 4])) crossing.push(edgeIndex(cr[i], cr[(i + 1) % 4]));
    if (crossing.length === 0) continue;
    if (crossing.length === 2) {
      const oc = cr.filter(open).map(cornerPos);
      const cen = [0, 1, 2].map((k) => oc.reduce((s, p) => s + p[k], 0) / oc.length);
      const m1 = edgeMid(crossing[0]), m2 = edgeMid(crossing[1]);
      segs.push({ e1: crossing[0], e2: crossing[1], o: [0, 1, 2].map((k) => cen[k] - (m1[k] + m2[k]) / 2) });
    } else {
      // ambiguous face: one segment around each open corner (open corners separated)
      for (let i = 0; i < 4; i++) {
        if (!open(cr[i])) continue;
        const ea = edgeIndex(cr[i], cr[(i + 1) % 4]), eb = edgeIndex(cr[i], cr[(i + 3) % 4]);
        const p = cornerPos(cr[i]), m1 = edgeMid(ea), m2 = edgeMid(eb);
        segs.push({ e1: ea, e2: eb, o: [0, 1, 2].map((k) => p[k] - (m1[k] + m2[k]) / 2) });
      }
    }
    for (const s of segs) {
      // travel direction d = o x n_face keeps the open side on the same hand for every face
      const o = s.o, n = f.n;
      const d = [o[1] * n[2] - o[2] * n[1], o[2] * n[0] - o[0] * n[2], o[0] * n[1] - o[1] * n[0]];
      const m1 = edgeMid(s.e1), m2 = edgeMid(s.e2);
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
    while (!used.has(e)) {
      used.add(e);
      loop.push(e);
      const nx = next.get(e);
      if (nx === undefined) throw new Error('mcTables: open loop in case ' + cs);
      e = nx;
    }
    for (let i = 1; i + 1 < loop.length; i++) tris.push(loop[0], loop[i], loop[i + 1]);
  }
  return tris;
}

(function buildTables() {
  const faces = cubeFaces();
  for (let cs = 0; cs < 256; cs++) {
    const tris = caseTriangles(cs, faces);
    if (tris.length > MAX_CASE_EDGES) throw new Error('mcTables: too many triangles in case ' + cs);
    TRI_COUNT[cs] = tris.length;
    for (let t = 0; t < tris.length; t++) TRI_EDGES[cs * MAX_CASE_EDGES + t] = tris[t];
  }
})();
