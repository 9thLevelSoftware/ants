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
  const fx = gx - x0, fy = gy - y0, fz = gz - z0;
  const v000 = layer.get(x0, y0, z0), v100 = layer.get(x0 + 1, y0, z0);
  const v010 = layer.get(x0, y0 + 1, z0), v110 = layer.get(x0 + 1, y0 + 1, z0);
  const v001 = layer.get(x0, y0, z0 + 1), v101 = layer.get(x0 + 1, y0, z0 + 1);
  const v011 = layer.get(x0, y0 + 1, z0 + 1), v111 = layer.get(x0 + 1, y0 + 1, z0 + 1);
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

/**
 * Three sensors `reach` mm ahead of p at -angle, 0, +angle in the tangent plane of `up`. The heading turns from
 * fwd toward the stronger side by angle x (R - L) / (L + R + damp), so a walker stepping along it settles on the
 * ridge of the trail. Returns the strength: the best of the three blended readings (max of cell, smooth). out
 * receives a unit tangent heading (fwd itself, projected, when nothing is sensed; fwd as given if degenerate).
 */
export function senseLayer(
  layer: LayerRuntime, p: Vec3, fwd: Vec3, up: Vec3, reach: number, inv: number, out: Vec3, reading: SenseReading,
): number {
  // Tangent frame: f = fwd projected on the plane of up, s = f x up (to the right when looking along f).
  let ux = up.x, uy = up.y, uz = up.z;
  const ul = Math.hypot(ux, uy, uz);
  if (ul > 0) { ux /= ul; uy /= ul; uz /= ul; } else { ux = 0; uy = 1; uz = 0; }
  const d = fwd.x * ux + fwd.y * uy + fwd.z * uz;
  let fx = fwd.x - ux * d, fy = fwd.y - uy * d, fz = fwd.z - uz * d;
  const fl = Math.hypot(fx, fy, fz);
  reading.left = reading.centre = reading.right = reading.angle = 0;
  if (!(fl > 1e-9)) {
    out.x = fwd.x; out.y = fwd.y; out.z = fwd.z;
    return 0;
  }
  fx /= fl; fy /= fl; fz /= fl;
  const sx = fy * uz - fz * uy, sy = fz * ux - fx * uz, sz = fx * uy - fy * ux;
  const ca = Math.cos(PHERO_SENSOR_ANGLE_RAD) * reach, sa = Math.sin(PHERO_SENSOR_ANGLE_RAD) * reach;

  readPoint(layer, p.x + fx * reach, p.y + fy * reach, p.z + fz * reach, inv, tmp);
  const sC = tmp.smooth;
  let strength = tmp.cell > sC ? tmp.cell : sC;
  readPoint(layer, p.x + fx * ca - sx * sa, p.y + fy * ca - sy * sa, p.z + fz * ca - sz * sa, inv, tmp);
  const sL = tmp.smooth;
  strength = Math.max(strength, tmp.cell, sL);
  readPoint(layer, p.x + fx * ca + sx * sa, p.y + fy * ca + sy * sa, p.z + fz * ca + sz * sa, inv, tmp);
  const sR = tmp.smooth;
  strength = Math.max(strength, tmp.cell, sR);
  reading.left = sL;
  reading.centre = sC;
  reading.right = sR;

  let a = 0;
  const th = PHERO_SENSOR_ANGLE_RAD;
  if (process.env.STEER === 'para') {
    if (Math.max(sL, sC, sR) > PHERO_SENSE_FLOOR) {
      const curv = sL + sR - 2 * sC;
      if (sC >= sL && sC >= sR && curv < 0) a = (th * (sL - sR)) / (2 * curv);
      else if (sR > sL) a = th;
      else if (sL > sR) a = -th;
      if (a > th) a = th; else if (a < -th) a = -th;
    }
  } else if (Math.max(sL, sR) > PHERO_SENSE_FLOOR) a = (th * (sR - sL)) / (sL + sR + PHERO_SENSE_DAMP);
  reading.angle = a;
  const c = Math.cos(a), s = Math.sin(a);
  out.x = fx * c + sx * s;
  out.y = fy * c + sy * s;
  out.z = fz * c + sz * s;
  return strength;
}
