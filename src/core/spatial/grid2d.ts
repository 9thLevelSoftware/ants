// Typed 2D grid over the world X/Z plane (Y up), stored as plain data so it can live in saved state.
//
// Cell (i, j) covers x in [originX + i*cellSize, originX + (i+1)*cellSize) and z likewise with j; i runs along
// +X, j along +Z, index = j * w + i. A cell's value is located at its CENTRE: bilinear sampling interpolates
// between centres and clamps beyond the outer centres. (For node-based data such as a heightfield whose samples
// sit on cell corners, set origin = cornerOrigin - cellSize / 2.)
// Uint8 grids store integers 0..255 with wrap-around on set (typed array semantics); clamp before writing.

export type Grid2DData = Float32Array | Uint8Array;

export interface Grid2D<D extends Grid2DData = Grid2DData> {
  w: number; // cells along X
  h: number; // cells along Z
  cellSize: number; // mm
  originX: number; // mm, world X of the grid's min corner
  originZ: number; // mm, world Z of the grid's min corner
  data: D; // length w * h
}

/** Output of grid2dGradient: d(value)/dx and d(value)/dz per mm. Any {x, z} object (e.g. a Vec3) works. */
export interface Grad2 {
  x: number;
  z: number;
}

export function createGrid2DF32(w: number, h: number, cellSize: number, originX = 0, originZ = 0): Grid2D<Float32Array> {
  return { w, h, cellSize, originX, originZ, data: new Float32Array(w * h) };
}

export function createGrid2DU8(w: number, h: number, cellSize: number, originX = 0, originZ = 0): Grid2D<Uint8Array> {
  return { w, h, cellSize, originX, originZ, data: new Uint8Array(w * h) };
}

/** Cell column containing world x (may be outside [0, w)). */
export function grid2dCellX(g: Grid2D, x: number): number {
  return Math.floor((x - g.originX) / g.cellSize);
}

/** Cell row containing world z (may be outside [0, h)). */
export function grid2dCellZ(g: Grid2D, z: number): number {
  return Math.floor((z - g.originZ) / g.cellSize);
}

/** World X of the centre of column i. */
export function grid2dCenterX(g: Grid2D, i: number): number {
  return g.originX + (i + 0.5) * g.cellSize;
}

/** World Z of the centre of row j. */
export function grid2dCenterZ(g: Grid2D, j: number): number {
  return g.originZ + (j + 0.5) * g.cellSize;
}

export function grid2dInBounds(g: Grid2D, i: number, j: number): boolean {
  return i >= 0 && j >= 0 && i < g.w && j < g.h;
}

/** Value of cell (i, j) with indices clamped to the grid. */
export function grid2dGet(g: Grid2D, i: number, j: number): number {
  const ci = i < 0 ? 0 : i >= g.w ? g.w - 1 : i;
  const cj = j < 0 ? 0 : j >= g.h ? g.h - 1 : j;
  return g.data[cj * g.w + ci];
}

/** Writes cell (i, j); out-of-bounds writes are ignored. */
export function grid2dSet(g: Grid2D, i: number, j: number, v: number): void {
  if (i >= 0 && j >= 0 && i < g.w && j < g.h) g.data[j * g.w + i] = v;
}

/** Value of the cell containing world (x, z), clamped to the grid (nearest-cell lookup). */
export function grid2dGetWorld(g: Grid2D, x: number, z: number): number {
  return grid2dGet(g, grid2dCellX(g, x), grid2dCellZ(g, z));
}

/** Bilinear sample at world (x, z) between cell centres, clamped at the borders. */
export function grid2dSample(g: Grid2D, x: number, z: number): number {
  let u = (x - g.originX) / g.cellSize - 0.5;
  let v = (z - g.originZ) / g.cellSize - 0.5;
  const maxU = g.w - 1, maxV = g.h - 1;
  u = u < 0 ? 0 : u > maxU ? maxU : u;
  v = v < 0 ? 0 : v > maxV ? maxV : v;
  const i0 = Math.floor(u), j0 = Math.floor(v);
  const i1 = i0 < maxU ? i0 + 1 : i0, j1 = j0 < maxV ? j0 + 1 : j0;
  const fu = u - i0, fv = v - j0;
  const d = g.data, w = g.w;
  const a = d[j0 * w + i0] + (d[j0 * w + i1] - d[j0 * w + i0]) * fu;
  const b = d[j1 * w + i0] + (d[j1 * w + i1] - d[j1 * w + i0]) * fu;
  return a + (b - a) * fv;
}

/**
 * Analytic gradient of the bilinear interpolant at world (x, z), per mm. Components are 0 along an axis where
 * the sample is clamped (outside the outer cell centres). Returns out.
 */
export function grid2dGradient<T extends Grad2>(g: Grid2D, x: number, z: number, out: T): T {
  const uRaw = (x - g.originX) / g.cellSize - 0.5;
  const vRaw = (z - g.originZ) / g.cellSize - 0.5;
  const maxU = g.w - 1, maxV = g.h - 1;
  const clampedU = uRaw < 0 || uRaw > maxU || maxU === 0;
  const clampedV = vRaw < 0 || vRaw > maxV || maxV === 0;
  const u = uRaw < 0 ? 0 : uRaw > maxU ? maxU : uRaw;
  const v = vRaw < 0 ? 0 : vRaw > maxV ? maxV : vRaw;
  // Pick the patch so that a point exactly on the last centre still has a neighbour to difference with.
  const i0 = Math.min(Math.floor(u), Math.max(maxU - 1, 0)), j0 = Math.min(Math.floor(v), Math.max(maxV - 1, 0));
  const i1 = Math.min(i0 + 1, maxU), j1 = Math.min(j0 + 1, maxV);
  const fu = u - i0, fv = v - j0;
  const d = g.data, w = g.w;
  const v00 = d[j0 * w + i0], v10 = d[j0 * w + i1], v01 = d[j1 * w + i0], v11 = d[j1 * w + i1];
  const inv = 1 / g.cellSize;
  out.x = clampedU ? 0 : ((v10 - v00) * (1 - fv) + (v11 - v01) * fv) * inv;
  out.z = clampedV ? 0 : ((v01 - v00) * (1 - fu) + (v11 - v10) * fu) * inv;
  return out;
}

/** Sets every cell to v. */
export function grid2dFill(g: Grid2D, v: number): void {
  g.data.fill(v);
}
