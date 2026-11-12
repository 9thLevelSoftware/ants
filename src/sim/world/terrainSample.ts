// Terrain sampling for the world field: bilinear heightfield with analytic slope, byte-map lookups for the
// ground layers, and the horizontal signed distance to terrain holes (drains: cells where the ground term is
// removed). Pure, allocation-free.
//
// HeightField: grid point (ix, iz) at world (ix * cell, iz * cell), value data[iz * nx + ix]. Outside the grid
// the edge heights are extended (the slope across the clamped axis is 0 there).
// ByteMap: cell (ix, iz) covers [ix * cell, (ix + 1) * cell) x [iz * cell, (iz + 1) * cell); out of range clamps.

import type { ByteMap, HeightField } from '@/sim/types/geom';

/** Scratch result of heightSlope. */
export interface HeightSlope {
  /** Height, mm. */
  h: number;
  /** dH/dx and dH/dz (dimensionless). */
  gx: number;
  gz: number;
}

export function heightAt(hf: HeightField, x: number, z: number): number {
  const inv = 1 / hf.cell, nx = hf.nx;
  let fx = x * inv, fz = z * inv;
  const mx = nx - 1.000001, mz = hf.nz - 1.000001;
  fx = fx < 0 ? 0 : fx > mx ? mx : fx;
  fz = fz < 0 ? 0 : fz > mz ? mz : fz;
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const i = ix + iz * nx, d = hf.data;
  const a = d[i], b = d[i + 1], c = d[i + nx], e = d[i + nx + 1];
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + e) * tx * tz;
}

/** Height and its analytic slope at (x, z). */
export function heightSlope(hf: HeightField, x: number, z: number, out: HeightSlope): HeightSlope {
  const inv = 1 / hf.cell, nx = hf.nx;
  let fx = x * inv, fz = z * inv;
  const mx = nx - 1.000001, mz = hf.nz - 1.000001;
  let clampX = false, clampZ = false;
  if (fx < 0) { fx = 0; clampX = true; } else if (fx > mx) { fx = mx; clampX = true; }
  if (fz < 0) { fz = 0; clampZ = true; } else if (fz > mz) { fz = mz; clampZ = true; }
  const ix = Math.floor(fx), iz = Math.floor(fz), tx = fx - ix, tz = fz - iz;
  const i = ix + iz * nx, d = hf.data;
  const a = d[i], b = d[i + 1], c = d[i + nx], e = d[i + nx + 1];
  const cross = a - b - c + e;
  out.h = a + (b - a) * tx + (c - a) * tz + cross * tx * tz;
  out.gx = clampX ? 0 : ((b - a) + cross * tz) * inv;
  out.gz = clampZ ? 0 : ((c - a) + cross * tx) * inv;
  return out;
}

/** Byte of the map cell containing (x, z), clamped to the map. */
export function byteAt(map: ByteMap, x: number, z: number): number {
  let ix = Math.floor(x / map.cell), iz = Math.floor(z / map.cell);
  ix = ix < 0 ? 0 : ix >= map.nx ? map.nx - 1 : ix;
  iz = iz < 0 ? 0 : iz >= map.nz ? map.nz - 1 : iz;
  return map.data[iz * map.nx + ix];
}

function holeCell(map: ByteMap, ix: number, iz: number): boolean {
  if (ix < 0 || iz < 0 || ix >= map.nx || iz >= map.nz) return false;
  return map.data[iz * map.nx + ix] !== 0;
}

/** Cells that have a hole within their 3x3 neighbourhood (1) — lets the field skip the hole term elsewhere. */
export function dilateHoles(map: ByteMap): Uint8Array {
  const out = new Uint8Array(map.nx * map.nz);
  for (let iz = 0; iz < map.nz; iz++) for (let ix = 0; ix < map.nx; ix++) {
    if (!holeCell(map, ix, iz)) continue;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const jx = ix + dx, jz = iz + dz;
      if (jx >= 0 && jz >= 0 && jx < map.nx && jz < map.nz) out[jz * map.nx + jx] = 1;
    }
  }
  return out;
}

/** Scratch result of holeDistance: signed distance d (mm) and unit horizontal gradient. */
export interface Grad2 { d: number; gx: number; gz: number }

/**
 * Horizontal signed distance (mm) to the hole region: > 0 inside a hole, < 0 outside, exact within one cell
 * and saturated at +-cell beyond, into g.d; gradient (unit, horizontal) into g.gx / g.gz: towards increasing distance.
 */
export function holeDistance(map: ByteMap, x: number, z: number, g: Grad2): Grad2 {
  const c = map.cell;
  const ix = Math.floor(x / c), iz = Math.floor(z / c);
  const inside = holeCell(map, ix, iz);
  let best = c * c, bx = 0, bz = 0;
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    if (dx === 0 && dz === 0) continue;
    if (holeCell(map, ix + dx, iz + dz) === inside) continue;
    // closest point of the neighbour cell rectangle
    const x0 = (ix + dx) * c, z0 = (iz + dz) * c;
    const qx = x < x0 ? x0 : x > x0 + c ? x0 + c : x;
    const qz = z < z0 ? z0 : z > z0 + c ? z0 + c : z;
    const ex = x - qx, ez = z - qz, d2 = ex * ex + ez * ez;
    if (d2 < best) { best = d2; bx = ex; bz = ez; }
  }
  const d = Math.sqrt(best);
  g.d = inside ? d : -d;
  if (d >= c || d < 1e-12) {
    g.gx = 0; g.gz = 0;
    return g;
  }
  // inside: distance grows away from the solid neighbour; outside: grows towards the hole
  const s = inside ? 1 / d : -1 / d;
  g.gx = bx * s; g.gz = bz * s;
  return g;
}
