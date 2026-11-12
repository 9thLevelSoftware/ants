// Point reads of one layer: trilinear blend between the 8 nearest cell centres, the cell the point lies in, and
// three-sensor antennal sensing on the tangent plane. Allocation-free.

import type { Vec3 } from '@/core/math/vec3';
import type { LayerRuntime } from './layer';
import { PHERO_SENSE_DAMP, PHERO_SENSE_FLOOR, PHERO_SENSOR_ANGLE_RAD } from './balance';

/** Results of the last read, reused (no allocation). */
export interface PointRead {
  /** Trilinear blend, ph. */
  smooth: number;
  /** Value of the cell containing the point, ph. */
  cell: number;
}

/** Trilinear blend and own-cell value at p (cell edge `cell` mm, inverse `inv`) into out. */
export function readPoint(layer: LayerRuntime, px: number, py: number, pz: number, inv: number, out: PointRead): void {
  const gx = px * inv - 0.5, gy = py * inv - 0.5, gz = pz * inv - 0.5;
  const x0 = Math.floor(gx), y0 = Math.floor(gy), z0 = Math.floor(gz);
  // Range check before the int32 shifts below (a huge coordinate would wrap onto real cells). x0 = -limit - 1 is
  // allowed: its upper corner is still in range, and chunkAt rejects the lower one.
  const lim = layer.cellLimit;
  if (!(x0 >= -lim - 1 && x0 < lim && y0 >= -lim - 1 && y0 < lim && z0 >= -lim - 1 && z0 < lim)) {
    out.smooth = 0;
    out.cell = 0;
    return;
  }
  const fx = gx - x0, fy = gy - y0, fz = gz - z0;
  // Corner chunks: one lookup per chunk actually straddled (ground at y = 0 straddles cy = -1 / 0).
  const sh = layer.shift, m = layer.mask;
  const lx = x0 & m, ly = y0 & m, lz = z0 & m;
  const cx = x0 >> sh, cy = y0 >> sh, cz = z0 >> sh;
  const ex = lx === m, ey = ly === m, ez = lz === m;
  const c000 = layer.chunkAt(cx, cy, cz);
  const c100 = ex ? layer.chunkAt(cx + 1, cy, cz) : c000;
  const c010 = ey ? layer.chunkAt(cx, cy + 1, cz) : c000;
  const c110 = ex ? (ey ? layer.chunkAt(cx + 1, cy + 1, cz) : c100) : c010;
  const c001 = ez ? layer.chunkAt(cx, cy, cz + 1) : c000;
  const c101 = ez ? (ex ? layer.chunkAt(cx + 1, cy, cz + 1) : c001) : c100;
  const c011 = ez ? (ey ? layer.chunkAt(cx, cy + 1, cz + 1) : c001) : c010;
  const c111 = ez ? (ex ? (ey ? layer.chunkAt(cx + 1, cy + 1, cz + 1) : c101) : c011) : c110;
  const i0 = lx, i1 = ex ? 0 : lx + 1;
  const j0 = ly << sh, j1 = ey ? 0 : (ly + 1) << sh;
  const k0 = lz << (2 * sh), k1 = ez ? 0 : (lz + 1) << (2 * sh);
  const v000 = c000 ? c000[i0 | j0 | k0] : 0, v100 = c100 ? c100[i1 | j0 | k0] : 0;
  const v010 = c010 ? c010[i0 | j1 | k0] : 0, v110 = c110 ? c110[i1 | j1 | k0] : 0;
  const v001 = c001 ? c001[i0 | j0 | k1] : 0, v101 = c101 ? c101[i1 | j0 | k1] : 0;
  const v011 = c011 ? c011[i0 | j1 | k1] : 0, v111 = c111 ? c111[i1 | j1 | k1] : 0;
  const a = v000 + (v100 - v000) * fx, b = v010 + (v110 - v010) * fx;
  const c = v001 + (v101 - v001) * fx, d = v011 + (v111 - v011) * fx;
  const e = a + (b - a) * fy, f = c + (d - c) * fy;
  out.smooth = e + (f - e) * fz;
  // The containing cell is the corner nearest to p (fraction >= 0.5 rounds up).
  const hx = fx >= 0.5, hy = fy >= 0.5, hz = fz >= 0.5;
  out.cell = hz
    ? (hy ? (hx ? v111 : v011) : (hx ? v101 : v001))
    : (hy ? (hx ? v110 : v010) : (hx ? v100 : v000));
}

/** Per-call sensor readings (exposed as `lastSense` on the field for steering laws that want L/C/R). */
export interface SenseReading {
  left: number;
  centre: number;
  right: number;
  /** Chosen turn from fwd toward `right` (positive) or `left` (negative), rad. */
  angle: number;
}

const tmp: PointRead = { smooth: 0, cell: 0 };
const FAN_COS = Math.cos(PHERO_SENSOR_ANGLE_RAD), FAN_SIN = Math.sin(PHERO_SENSOR_ANGLE_RAD);

/**
 * Three sensors `reach` mm ahead of p at -angle, 0, +angle in the tangent plane of `up`. The heading turns from
 * fwd toward the stronger side by angle x (R - L) / (L + R + damp), so a walker stepping along it settles on the
 * ridge of the trail. Returns the strength: the best of the body's own cell and the three sensors' blended
 * readings (max of cell, smooth). out
 * receives a unit tangent heading (fwd itself, projected, when nothing is sensed; fwd as given if degenerate).
 */
export function senseLayer(
  layer: LayerRuntime, p: Vec3, fwd: Vec3, up: Vec3, reach: number, inv: number, out: Vec3, reading: SenseReading,
): number {
  // Tangent frame: f = fwd projected on the plane of up, s = f x up (to the right when looking along f).
  let ux = up.x, uy = up.y, uz = up.z;
  const ul = Math.sqrt(ux * ux + uy * uy + uz * uz);
  if (ul > 0) { ux /= ul; uy /= ul; uz /= ul; } else { ux = 0; uy = 1; uz = 0; }
  const d = fwd.x * ux + fwd.y * uy + fwd.z * uz;
  let fx = fwd.x - ux * d, fy = fwd.y - uy * d, fz = fwd.z - uz * d;
  const fl = Math.sqrt(fx * fx + fy * fy + fz * fz);
  reading.left = reading.centre = reading.right = reading.angle = 0;
  if (!(fl > 1e-9)) {
    out.x = fwd.x; out.y = fwd.y; out.z = fwd.z;
    return 0;
  }
  fx /= fl; fy /= fl; fz /= fl;
  const sx = fy * uz - fz * uy, sy = fz * ux - fx * uz, sz = fx * uy - fy * ux;
  const ca = FAN_COS * reach, sa = FAN_SIN * reach;

  let strength = layer.get(Math.floor(p.x * inv), Math.floor(p.y * inv), Math.floor(p.z * inv));
  readPoint(layer, p.x + fx * reach, p.y + fy * reach, p.z + fz * reach, inv, tmp);
  const sC = tmp.smooth;
  if (tmp.cell > strength) strength = tmp.cell;
  if (sC > strength) strength = sC;
  readPoint(layer, p.x + fx * ca - sx * sa, p.y + fy * ca - sy * sa, p.z + fz * ca - sz * sa, inv, tmp);
  const sL = tmp.smooth;
  if (tmp.cell > strength) strength = tmp.cell;
  if (sL > strength) strength = sL;
  readPoint(layer, p.x + fx * ca + sx * sa, p.y + fy * ca + sy * sa, p.z + fz * ca + sz * sa, inv, tmp);
  const sR = tmp.smooth;
  if (tmp.cell > strength) strength = tmp.cell;
  if (sR > strength) strength = sR;
  reading.left = sL;
  reading.centre = sC;
  reading.right = sR;

  // Turn by the left/right difference (GDD 02 §8.4 steering law, damped by +PHERO_SENSE_DAMP ph). The centre
  // sensor is left out of the heading: it sees value changes ALONG the trail, and steering on it makes walkers
  // orbit local peaks of the cell grid.
  let a = 0;
  if (sL > PHERO_SENSE_FLOOR || sR > PHERO_SENSE_FLOOR) a = (PHERO_SENSOR_ANGLE_RAD * (sR - sL)) / (sL + sR + PHERO_SENSE_DAMP);
  reading.angle = a;
  const c = Math.cos(a), s = Math.sin(a);
  out.x = fx * c + sx * s;
  out.y = fy * c + sy * s;
  out.z = fz * c + sz * s;
  return strength;
}
