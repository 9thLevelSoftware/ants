// The visual skirt around the map (GDD 04 §14): a low-detail ring of ground 0.5 L wide beyond every edge, its relief
// extrapolated from the map (skirtHeight.ts), its colour from the zone it mirrors. Builds plain arrays only (no GPU
// objects): the renderer turns them into one mesh.
//
// The terrain renderer keeps drawing beyond the edge: it clamps its height lookup, so outside the map it continues as
// a ridge extruded from the edge profile. The skirt must cover that ridge everywhere, not only at its vertices, and
// must meet the terrain exactly at the edge. So:
//  - one strip per side, in rows parallel to the edge. The rows next to the map put a vertex on every terrain grid
//    line, so the edge row IS the terrain's edge profile (bilinear along a grid line is linear between nodes) and the
//    triangles there cover the ridge, which is linear inside each cell, as soon as their vertices do;
//  - farther out the spacing along the edge doubles from row to row (2:1 stitches, no T-junctions). Every triangle
//    that spans more than one terrain cell lifts its vertices to the ridge's maximum over its own extent, so its flat
//    face can never be pierced either;
//  - a corner patch at each corner, where the ridge is flat (the clamped corner height).
import { Color } from 'three';
import { fbm2 } from '@/core/math/noise';
import type { WorldData } from '@/sim/types';
import { zoneTypeAt } from '../lighting/simAdapter';
import { makeSkirtHeight, outsideDistance, reflectInto, skirtLift, terrainMaxInRect, withinOneCell } from './skirtHeight';
import {
  SKIRT_FAR_HEX, SKIRT_FAR_MIX, SKIRT_FINE_ROWS, SKIRT_FIRST_ROW_BU, SKIRT_MIN_SEGMENTS, SKIRT_ROW_GROWTH, SKIRT_STEP_PER_OFFSET,
  SKIRT_WIDTH_L, SKIRT_ZONE_HEX,
} from './tuning';

export interface SkirtArrays {
  positions: Float32Array;
  normals: Float32Array;
  /** Linear RGB. */
  colors: Float32Array;
  index: Uint32Array;
  /** Skirt width beyond each edge, mm. */
  width: number;
}

/** Offsets of the rows from the edge, mm: 0 (the edge itself), then geometric, ending exactly at `width`. */
export function skirtRows(bu: number, width: number): number[] {
  const rows = [0];
  for (let r = SKIRT_FIRST_ROW_BU * bu; r < width; r *= SKIRT_ROW_GROWTH) rows.push(r);
  rows.push(width);
  return rows;
}

/**
 * Spacing level of each row along the edge (spacing = cell x 2^level): 0 for the first SKIRT_FINE_ROWS rows, then
 * growing with the offset, by at most one per row, capped so a side keeps SKIRT_MIN_SEGMENTS segments.
 */
export function rowLevels(rows: readonly number[], cell: number, cellsPerSide: number): number[] {
  const cap = Math.max(0, Math.floor(Math.log2(Math.max(1, cellsPerSide / SKIRT_MIN_SEGMENTS))));
  const out: number[] = [];
  for (let k = 0; k < rows.length; k++) {
    const want = k < SKIRT_FINE_ROWS ? 0 : Math.max(0, Math.floor(Math.log2((rows[k] * SKIRT_STEP_PER_OFFSET) / cell)));
    out.push(Math.min(cap, want, k === 0 ? 0 : out[k - 1] + 1));
  }
  return out;
}

/** Positions along an edge of length `size` at spacing `step`: 0, step, 2 step, ... and `size` itself. */
export function alongEdge(size: number, step: number): number[] {
  const out: number[] = [];
  for (let k = 0; k * step < size - 0.25 * step; k++) out.push(k * step);
  out.push(size);
  return out;
}

/** The four sides as (along u, outward r) -> (x, z). */
function sidePoint(side: number, S: number, u: number, r: number): [number, number] {
  switch (side) {
    case 0: return [u, -r];
    case 1: return [S + r, u];
    case 2: return [u, S + r];
    default: return [-r, u];
  }
}

/** Collects deduplicated vertices and upward-facing triangles. */
class SkirtMesh {
  readonly x: number[] = [];
  readonly z: number[] = [];
  readonly tris: number[] = [];
  private readonly ids = new Map<string, number>();

  vertex(x: number, z: number): number {
    const key = `${x}|${z}`;
    let id = this.ids.get(key);
    if (id === undefined) { id = this.x.length; this.ids.set(key, id); this.x.push(x); this.z.push(z); }
    return id;
  }

  /** Adds a triangle wound counter-clockwise seen from above (+Y); degenerate ones are dropped. */
  tri(a: number, b: number, c: number): void {
    const X = this.x, Z = this.z;
    const cross = (Z[b] - Z[a]) * (X[c] - X[a]) - (X[b] - X[a]) * (Z[c] - Z[a]);
    if (cross === 0 || a === b || b === c || a === c) return;
    if (cross > 0) this.tris.push(a, b, c); else this.tris.push(a, c, b);
  }
}

/** Strip of one side: rows of vertices along the edge, stitched 2:1 where the spacing doubles. */
function buildStrip(m: SkirtMesh, side: number, S: number, rows: number[], levels: number[], cell: number): void {
  const row = (k: number) => alongEdge(S, cell * 2 ** levels[k]).map((u) => m.vertex(...sidePoint(side, S, u, rows[k])));
  const us = (k: number) => alongEdge(S, cell * 2 ** levels[k]);
  for (let k = 0; k + 1 < rows.length; k++) {
    const fine = row(k), coarse = row(k + 1);
    if (levels[k + 1] === levels[k]) {
      for (let i = 0; i + 1 < fine.length; i++) { m.tri(fine[i], fine[i + 1], coarse[i]); m.tri(fine[i + 1], coarse[i + 1], coarse[i]); }
      continue;
    }
    // every coarse position is also a fine one: fan the fine vertices of each coarse segment to its two ends
    const fu = us(k), cu = us(k + 1);
    let a = 0;
    for (let j = 0; j + 1 < cu.length; j++) {
      let b = a;
      while (fu[b] < cu[j + 1]) b++;
      const mid = a + Math.ceil((b - a) / 2);
      for (let i = a; i < mid; i++) m.tri(fine[i], fine[i + 1], coarse[j]);
      m.tri(fine[mid], coarse[j + 1], coarse[j]);
      for (let i = mid; i < b; i++) m.tri(fine[i], fine[i + 1], coarse[j + 1]);
      a = b;
    }
  }
}

/** Corner patch: the rows of the two meeting sides as a small grid. */
function buildCorner(m: SkirtMesh, cx: number, cz: number, sx: number, sz: number, rows: number[]): void {
  const id = (i: number, j: number) => m.vertex(cx + sx * rows[i], cz + sz * rows[j]);
  for (let j = 0; j + 1 < rows.length; j++) for (let i = 0; i + 1 < rows.length; i++) {
    m.tri(id(i, j), id(i + 1, j), id(i, j + 1));
    m.tri(id(i + 1, j), id(i + 1, j + 1), id(i, j + 1));
  }
}

const _c = new Color(), _far = new Color();

/** Builds the skirt mesh arrays for a world. */
export function buildSkirt(world: WorldData): SkirtArrays {
  const S = world.size, bu = world.bu, hf = world.terrain, cell = hf.cell, width = SKIRT_WIDTH_L * S;
  const rows = skirtRows(bu, width);
  const levels = rowLevels(rows, cell, S / cell);
  const m = new SkirtMesh();
  for (let side = 0; side < 4; side++) buildStrip(m, side, S, rows, levels, cell);
  buildCorner(m, 0, 0, -1, -1, rows);
  buildCorner(m, S, 0, 1, -1, rows);
  buildCorner(m, S, S, 1, 1, rows);
  buildCorner(m, 0, S, -1, 1, rows);

  // heights: the skirt's own surface, raised where a triangle spans several terrain cells (see the header)
  const h = makeSkirtHeight(world), n = m.x.length, X = m.x, Z = m.z;
  const floor = new Float64Array(n).fill(-Infinity);
  for (let t = 0; t < m.tris.length; t += 3) {
    const a = m.tris[t], b = m.tris[t + 1], c = m.tris[t + 2];
    const x0 = Math.min(X[a], X[b], X[c]), x1 = Math.max(X[a], X[b], X[c]);
    const z0 = Math.min(Z[a], Z[b], Z[c]), z1 = Math.max(Z[a], Z[b], Z[c]);
    if (withinOneCell(hf, x0, x1, z0, z1)) continue;
    const top = terrainMaxInRect(hf, x0, x1, z0, z1);
    for (const v of [a, b, c]) if (top > floor[v]) floor[v] = top;
  }

  const positions = new Float32Array(n * 3), normals = new Float32Array(n * 3), colors = new Float32Array(n * 3);
  _far.set(SKIRT_FAR_HEX);
  const seed = world.params.seed | 0;
  for (let v = 0; v < n; v++) {
    const x = X[v], z = Z[v], d = outsideDistance(x, z, S);
    const y = Math.max(h(x, z), floor[v] + skirtLift(d));
    positions.set([x, y, z], v * 3);
    // normal from the skirt's own height function; the step grows outward with the row spacing so far rows stay smooth
    const e = Math.max(bu, 0.25 * d);
    const nx = h(x - e, z) - h(x + e, z), nz = h(x, z - e) - h(x, z + e), ny = 2 * e;
    const len = Math.hypot(nx, ny, nz) || 1;
    normals.set([nx / len, ny / len, nz / len], v * 3);
    // colour: the zone it mirrors, toward the far-ground tone outward, a little brightness noise
    const zone = zoneTypeAt(world, reflectInto(x, S), reflectInto(z, S));
    _c.set(SKIRT_ZONE_HEX[zone] ?? SKIRT_ZONE_HEX.lawn);
    _c.lerp(_far, SKIRT_FAR_MIX * Math.min(1, d / width));
    const k = 0.9 + 0.2 * (0.5 + 0.5 * fbm2(x / (8 * bu), z / (8 * bu), seed + 7, 2));
    colors.set([_c.r * k, _c.g * k, _c.b * k], v * 3);
  }
  return { positions, normals, colors, index: Uint32Array.from(m.tris), width };
}
