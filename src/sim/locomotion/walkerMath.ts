// Small allocation-free vector helpers for the surface walker (kept next to it; ported from the nest spike).

import type { Vec3 } from '@/core/math/vec3';

/**
 * Rotates v by the MINIMAL rotation taking unit `from` to unit `to` (Rodrigues without trig: k = from x to,
 * c = from . to, v' = v c + k x v + k (k . v) / (1 + c)). This is the parallel-transport operator of the walker.
 * For (near) antiparallel from/to it rotates 180 degrees about an axis perpendicular to `from`, chosen to keep
 * v's tangential part. out may alias v.
 */
export function rotateMinimal(out: Vec3, v: Vec3, from: Vec3, to: Vec3): Vec3 {
  const c = from.x * to.x + from.y * to.y + from.z * to.z;
  if (c > 1 - 1e-12) { out.x = v.x; out.y = v.y; out.z = v.z; return out; }
  if (c < -1 + 1e-6) {
    let ax = from.y * v.z - from.z * v.y, ay = from.z * v.x - from.x * v.z, az = from.x * v.y - from.y * v.x;
    let l = Math.sqrt(ax * ax + ay * ay + az * az);
    if (l < 1e-9) {
      if (Math.abs(from.x) < 0.9) { ax = 0; ay = from.z; az = -from.y; } else { ax = -from.z; ay = 0; az = from.x; }
      l = Math.sqrt(ax * ax + ay * ay + az * az);
    }
    ax /= l; ay /= l; az /= l;
    const bx = ay * from.z - az * from.y, by = az * from.x - ax * from.z, bz = ax * from.y - ay * from.x;
    const d = bx * v.x + by * v.y + bz * v.z;
    out.x = 2 * d * bx - v.x; out.y = 2 * d * by - v.y; out.z = 2 * d * bz - v.z;
    return out;
  }
  const kx = from.y * to.z - from.z * to.y, ky = from.z * to.x - from.x * to.z, kz = from.x * to.y - from.y * to.x;
  const f = (kx * v.x + ky * v.y + kz * v.z) / (1 + c);
  const cx = ky * v.z - kz * v.y, cy = kz * v.x - kx * v.z, cz = kx * v.y - ky * v.x;
  const vx = v.x, vy = v.y, vz = v.z;
  out.x = vx * c + cx + kx * f; out.y = vy * c + cy + ky * f; out.z = vz * c + cz + kz * f;
  return out;
}

/** Any unit vector perpendicular to unit n (deterministic). */
export function anyPerp(out: Vec3, n: Vec3): Vec3 {
  let x: number, y: number, z: number;
  if (Math.abs(n.y) < 0.9) { x = n.z; y = 0; z = -n.x; } else { x = 0; y = -n.z; z = n.y; }
  const l = Math.sqrt(x * x + y * y + z * z);
  out.x = x / l; out.y = y / l; out.z = z / l;
  return out;
}

/** Makes `t` the unit tangent of unit normal n closest to t (fallback: anyPerp). out may alias t. */
export function tangentOf(out: Vec3, t: Vec3, n: Vec3): Vec3 {
  const d = t.x * n.x + t.y * n.y + t.z * n.z;
  const x = t.x - n.x * d, y = t.y - n.y * d, z = t.z - n.z * d;
  const l = Math.sqrt(x * x + y * y + z * z);
  if (!(l > 1e-6)) return anyPerp(out, n);
  out.x = x / l; out.y = y / l; out.z = z / l;
  return out;
}

export function finite3(v: Vec3): boolean {
  return Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);
}
