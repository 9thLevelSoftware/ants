// Silhouette refinement of a marching-cubes chunk mesh (spike-nest.md 5.8: an 8 mm tunnel is only 4 voxels across,
// so mouths and bends look polygonal although the shading normals are smooth).
//
// The MC vertices already lie on the true surface to ~0.02 mm (they are linear crossings along cell edges of a field
// that is an exact distance within the ramp), so moving them gains nothing: the facets come from the chords between
// them. Curved edges (endpoint normals more than REFINE_FLAT_DEG apart) are split at their midpoints - each triangle
// 1 -> 2, 3 or 4 by how many of its edges split, flat floors stay coarse - and every midpoint is relaxed off the chord
// onto the curved surface the two endpoint normals describe (the midpoint of the PN-triangle cubic edge curve).
// Projecting onto the trilinear iso instead was measured and rejected: trilinear interpolation of the distance
// samples is biased inward by ~h^2 / 8r (0.08 mm on a 2 BU tunnel), which kept 70 % of the sagitta error.
// A midpoint depends only on its two endpoints (taken in index-independent order), so a midpoint on a chunk seam is
// bit-identical in both chunks and the seams stay watertight.
//
// Pure typed-array code (no three): runs in Node tests and could move to a worker.
export interface MeshArrays {
  positions: Float32Array;
  normals: Float32Array;
  /** Per-vertex soil distance (discard attribute), mm. */
  sub: Float32Array;
  indices: Uint16Array | Uint32Array;
}

export interface RefinedMesh extends MeshArrays {
  /** For every vertex, the index of an original vertex it inherits per-vertex data from (identity for originals). */
  parent: Int32Array;
  /** Number of original vertices (they keep their indices). */
  originalCount: number;
}

export interface RefineParams {
  /** Soil distance for the discard attribute of midpoints near the surface. */
  soil: (x: number, y: number, z: number) => number;
  /** Largest move of a midpoint off its chord, mm. */
  maxMove: number;
  /** Midpoints whose endpoints are both deeper than this (soil distance < -exactDepth) interpolate the attribute. */
  exactDepth: number;
  /** Edges whose endpoint normals agree better than this cosine are flat enough: not split. */
  flatCos: number;
}

interface Scratch { cap: number; pos: Float32Array; nrm: Float32Array; sub: Float32Array; parent: Int32Array }
function makeScratch(n: number): Scratch {
  return { cap: n, pos: new Float32Array(n * 3), nrm: new Float32Array(n * 3), sub: new Float32Array(n), parent: new Int32Array(n) };
}
let scratch = makeScratch(0);

export function refineMesh(m: MeshArrays, p: RefineParams): RefinedMesh {
  const nv0 = m.positions.length / 3;
  const nt = m.indices.length / 3;
  const maxV = nv0 + nt * 3;
  // shared scratch (grown on demand) instead of per-chunk worst-case arrays: halves the garbage per rebuild
  if (scratch.cap < maxV) scratch = makeScratch(Math.max(maxV, scratch.cap * 2));
  const { pos, nrm, sub, parent } = scratch;
  pos.set(m.positions, 0);
  nrm.set(m.normals, 0);
  sub.set(m.sub, 0);
  for (let i = 0; i < nv0; i++) parent[i] = i;
  let nv = nv0;
  const edges = new Map<number, number>();
  const src = m.indices;
  const out = maxV > 65535 ? new Uint32Array(nt * 12) : new Uint16Array(nt * 12);
  let k = 0;

  const mid = (a: number, b: number): number => {
    const key = a < b ? a * nv0 + b : b * nv0 + a;
    const hit = edges.get(key);
    if (hit !== undefined) return hit;
    // order-independent arithmetic: a seam edge gives the same midpoint (and the same split decision) in both chunks
    const lo = a < b ? a : b, hi = a < b ? b : a;
    if (nrm[lo * 3] * nrm[hi * 3] + nrm[lo * 3 + 1] * nrm[hi * 3 + 1] + nrm[lo * 3 + 2] * nrm[hi * 3 + 2] > p.flatCos) {
      edges.set(key, -1);
      return -1;
    }
    const ax = pos[lo * 3], ay = pos[lo * 3 + 1], az = pos[lo * 3 + 2];
    const bx = pos[hi * 3], by = pos[hi * 3 + 1], bz = pos[hi * 3 + 2];
    const nax = nrm[lo * 3], nay = nrm[lo * 3 + 1], naz = nrm[lo * 3 + 2];
    const nbx = nrm[hi * 3], nby = nrm[hi * 3 + 1], nbz = nrm[hi * 3 + 2];
    // cubic edge curve with tangents = the edge projected into each endpoint's tangent plane (PN triangles);
    // its midpoint is (a + b) / 2 + ((b - a).nb nb - (b - a).na na) / 8
    const ex = bx - ax, ey = by - ay, ez = bz - az;
    const da = ex * nax + ey * nay + ez * naz, db = ex * nbx + ey * nby + ez * nbz;
    let ox = (db * nbx - da * nax) * 0.125, oy = (db * nby - da * nay) * 0.125, oz = (db * nbz - da * naz) * 0.125;
    const d = Math.sqrt(ox * ox + oy * oy + oz * oz);
    if (d > p.maxMove) { const f = p.maxMove / d; ox *= f; oy *= f; oz *= f; }
    const x = (ax + bx) * 0.5 + ox, y = (ay + by) * 0.5 + oy, z = (az + bz) * 0.5 + oz;
    const v = nv++;
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
    let nx = nrm[lo * 3] + nrm[hi * 3], ny = nrm[lo * 3 + 1] + nrm[hi * 3 + 1], nz = nrm[lo * 3 + 2] + nrm[hi * 3 + 2];
    const nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    nx /= nl; ny /= nl; nz /= nl;
    nrm[v * 3] = nx; nrm[v * 3 + 1] = ny; nrm[v * 3 + 2] = nz;
    const sa = sub[lo], sb = sub[hi];
    sub[v] = sa < -p.exactDepth && sb < -p.exactDepth ? (sa + sb) * 0.5 : p.soil(x, y, z);
    parent[v] = lo;
    edges.set(key, v);
    return v;
  };

  const tri = (x: number, y: number, z: number) => { out[k++] = x; out[k++] = y; out[k++] = z; };
  for (let t = 0; t < nt; t++) {
    const a = src[t * 3], b = src[t * 3 + 1], c = src[t * 3 + 2];
    const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
    // split pattern by which edges are curved enough (winding kept: every sub-triangle runs like a, b, c)
    switch ((ab >= 0 ? 1 : 0) | (bc >= 0 ? 2 : 0) | (ca >= 0 ? 4 : 0)) {
      case 0: tri(a, b, c); break;
      case 1: tri(a, ab, c); tri(ab, b, c); break;
      case 2: tri(a, b, bc); tri(a, bc, c); break;
      case 4: tri(a, b, ca); tri(ca, b, c); break;
      case 3: tri(ab, b, bc); tri(a, ab, bc); tri(a, bc, c); break;
      case 6: tri(ca, bc, c); tri(a, b, bc); tri(a, bc, ca); break;
      case 5: tri(a, ab, ca); tri(ab, b, c); tri(ab, c, ca); break;
      default: tri(a, ab, ca); tri(ab, b, bc); tri(ca, bc, c); tri(ab, bc, ca);
    }
  }
  return {
    positions: pos.slice(0, nv * 3), normals: nrm.slice(0, nv * 3), sub: sub.slice(0, nv), parent: parent.slice(0, nv),
    indices: out.slice(0, k), originalCount: nv0,
  };
}
