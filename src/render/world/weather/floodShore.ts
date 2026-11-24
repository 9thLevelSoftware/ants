// The flood sheet's shape (app-seams-4, item 4): the surface of standing water in a flooded nest cavity is drawn as a
// lattice mesh over the carve samples, with the carve grid's own openness at the water level as a per-vertex "shore"
// value. The shader thresholds the interpolated value at 0.5 (the carve iso level), so the sheet ends exactly at the
// cavity's outline at that height, not at the squares of the voxel cells (the first sheet was a union of cell squares:
// a pale blocky slab with square corners). The value grows away from the wall, which gives the shader its soft
// shore, a meniscus line and the shallows' tint. Pure geometry: no sim imports.
import { BufferGeometry, Float32BufferAttribute } from 'three';

/** Water is drawn where the interpolated shore value is above this (the carve iso level, 127.5 / 255). */
export const SHORE_ISO = 0.5;
/** Water depth (mm) of a vertex when no floor is known: deep, so only the wall term cuts the sheet. */
export const NO_DEPTH_MM = 1000;
/** Most lattice vertices of one sheet: a larger flooded area keeps its cells but is meshed from every second sample. */
export const SHORE_MAX_VERTS = 60000;

/**
 * Lattice mesh of the water surface at height `y`. `cells` are the centres (x, z in mm, interleaved) of the surface
 * samples, `cell` the sample spacing, `open(i, k)` the openness 0..1 of the cavity at lattice sample (i, k) at the
 * water level (0.5 = the wall). Vertices that are neither surface samples nor next to one carry 0; a ring of
 * neighbours carries at most just under the iso so the sheet never spreads over open air beyond the flooded samples.
 * Returns null when no vertex is above the iso level.
 */
export function shoreGeometry(
  cells: number[], cell: number, y: number, open: (i: number, k: number) => number, depth?: (i: number, k: number) => number,
): BufferGeometry | null {
  const n = cells.length / 2;
  if (n === 0) return null;
  let i0 = Infinity, i1 = -Infinity, k0 = Infinity, k1 = -Infinity;
  const flooded = new Set<number>();
  const KEY = 1 << 15, OFF = 1 << 14;
  const key = (i: number, k: number) => (i + OFF) * KEY + (k + OFF);
  for (let c = 0; c < n; c++) {
    const i = Math.round(cells[c * 2]! / cell), k = Math.round(cells[c * 2 + 1]! / cell);
    flooded.add(key(i, k));
    if (i < i0) i0 = i; if (i > i1) i1 = i; if (k < k0) k0 = k; if (k > k1) k1 = k;
  }
  i0 -= 1; k0 -= 1; i1 += 1; k1 += 1;
  const W = i1 - i0 + 1, H = k1 - k0 + 1;
  // a larger area than the vertex budget: mesh from every `skip`-th sample (the shore value is still read per vertex)
  let skip = 1;
  while (Math.ceil(W / skip) * Math.ceil(H / skip) > SHORE_MAX_VERTS) skip++;
  const nx = Math.ceil((W - 1) / skip) + 1, nz = Math.ceil((H - 1) / skip) + 1;
  const pos = new Float32Array(nx * nz * 3), nor = new Float32Array(nx * nz * 3), shore = new Float32Array(nx * nz), dep = new Float32Array(nx * nz);
  let any = false;
  for (let a = 0; a < nx; a++) {
    for (let b = 0; b < nz; b++) {
      const i = Math.min(i1, i0 + a * skip), k = Math.min(k1, k0 + b * skip), v = b * nx + a;
      pos[v * 3] = i * cell; pos[v * 3 + 1] = y; pos[v * 3 + 2] = k * cell;
      nor[v * 3 + 1] = 1;
      let s = 0;
      if (flooded.has(key(i, k))) s = open(i, k);
      else if (nextToFlooded(flooded, key, i, k)) s = Math.min(open(i, k), SHORE_ISO - 0.05);
      shore[v] = s;
      dep[v] = depth ? depth(i, k) : NO_DEPTH_MM;
      if (s > SHORE_ISO) any = true;
    }
  }
  if (!any) return null;
  const idx: number[] = [];
  for (let a = 0; a < nx - 1; a++) {
    for (let b = 0; b < nz - 1; b++) {
      const v00 = b * nx + a, v10 = v00 + 1, v01 = v00 + nx, v11 = v01 + 1;
      if (shore[v00]! <= SHORE_ISO && shore[v10]! <= SHORE_ISO && shore[v01]! <= SHORE_ISO && shore[v11]! <= SHORE_ISO) continue;
      idx.push(v00, v01, v10, v10, v01, v11);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(nor, 3));
  g.setAttribute('aShore', new Float32BufferAttribute(shore, 1));
  g.setAttribute('aDepth', new Float32BufferAttribute(dep, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

function nextToFlooded(set: Set<number>, key: (i: number, k: number) => number, i: number, k: number): boolean {
  for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if ((a !== 0 || b !== 0) && set.has(key(i + a, k + b))) return true;
  return false;
}

/**
 * Depth of the water (mm) over the floor of column (i, k): the carve samples are read from the row at the water level downward until the openness
 * byte falls under the iso level (OPEN_MIN); the floor is where the byte crosses 127.5 between that solid row and the open one above it. A column
 * whose row at the level is itself solid is dry (negative: how far its floor stands above the level is not known, -1 mm). A floor deeper than
 * `maxRows` is taken as that deep. `byteAt(j)` is the openness byte of row j of the column; `jTop` the row at or under the level.
 */
export function waterDepthMm(byteAt: (j: number) => number, jTop: number, level: number, cell: number, maxRows = 24): number {
  const OPEN = 127.5;
  if (byteAt(jTop) < OPEN) return -1;
  for (let n = 1; n <= maxRows; n++) {
    const below = byteAt(jTop - n);
    if (below < OPEN) {
      const above = byteAt(jTop - n + 1), t = above > below ? (OPEN - below) / (above - below) : 0;
      return Math.max(0, level - (jTop - n + t) * cell);
    }
  }
  return maxRows * cell;
}

/** Openness 0..1 of a carve sample byte pair at the water level (linear between the sample row below and the one above). */
export function opennessAt(below: number, above: number, t: number): number {
  return Math.max(0, Math.min(1, ((1 - t) * below + t * above) / 255));
}
