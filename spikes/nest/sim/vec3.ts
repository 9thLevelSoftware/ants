/**
 * Minimal mutable 3-vector helpers for the pure simulation layer (no three.js).
 * All functions write into an `out` argument and return it, so hot loops can use module-level scratch vectors
 * and allocate nothing. Units: millimetres, Y up (docs/01-design-seed.md section 3).
 */
export interface Vec3 { x: number; y: number; z: number }

export const v3 = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });
export const clone = (a: Vec3): Vec3 => ({ x: a.x, y: a.y, z: a.z });

export function set(o: Vec3, x: number, y: number, z: number): Vec3 { o.x = x; o.y = y; o.z = z; return o; }
export function copy(o: Vec3, a: Vec3): Vec3 { o.x = a.x; o.y = a.y; o.z = a.z; return o; }
export function add(o: Vec3, a: Vec3, b: Vec3): Vec3 { o.x = a.x + b.x; o.y = a.y + b.y; o.z = a.z + b.z; return o; }
export function sub(o: Vec3, a: Vec3, b: Vec3): Vec3 { o.x = a.x - b.x; o.y = a.y - b.y; o.z = a.z - b.z; return o; }
export function scale(o: Vec3, a: Vec3, s: number): Vec3 { o.x = a.x * s; o.y = a.y * s; o.z = a.z * s; return o; }
/** o = a + b * s */
export function addScaled(o: Vec3, a: Vec3, b: Vec3, s: number): Vec3 { o.x = a.x + b.x * s; o.y = a.y + b.y * s; o.z = a.z + b.z * s; return o; }
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export function cross(o: Vec3, a: Vec3, b: Vec3): Vec3 {
  const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  o.x = x; o.y = y; o.z = z; return o;
}
export const len = (a: Vec3): number => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const dist = (a: Vec3, b: Vec3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function normalize(o: Vec3, a: Vec3): Vec3 {
  const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
  if (l < 1e-12) { o.x = 0; o.y = 1; o.z = 0; return o; }
  return scale(o, a, 1 / l);
}
export function lerp(o: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  o.x = a.x + (b.x - a.x) * t; o.y = a.y + (b.y - a.y) * t; o.z = a.z + (b.z - a.z) * t; return o;
}
/** Remove the component of `a` along unit `n` (project onto the plane with normal n). */
export function projectOnPlane(o: Vec3, a: Vec3, n: Vec3): Vec3 { return addScaled(o, a, n, -dot(a, n)); }

/**
 * Rotate v by the MINIMAL rotation that takes unit vector `from` to unit vector `to` (Rodrigues, written without
 * trig: with k = from x to, c = from . to:  v' = v c + k x v + k (k . v) / (1 + c)).
 * This is the parallel-transport operator used by the surface walker and the camera frame.
 * For (near) antiparallel from/to the rotation axis is ambiguous; we rotate 180 degrees about an axis
 * perpendicular to `from` chosen deterministically (and preferably perpendicular to v too).
 */
export function rotateMinimal(o: Vec3, v: Vec3, from: Vec3, to: Vec3): Vec3 {
  const c = dot(from, to);
  if (c > 1 - 1e-12) return copy(o, v);
  if (c < -1 + 1e-6) {
    // 180 degrees: axis a perpendicular to `from`. v' = 2 (a.v) a - v
    let ax = from.y * v.z - from.z * v.y, ay = from.z * v.x - from.x * v.z, az = from.x * v.y - from.y * v.x; // from x v
    let l = Math.hypot(ax, ay, az);
    if (l < 1e-9) { // v parallel to from: any perpendicular axis
      if (Math.abs(from.x) < 0.9) { ax = 0; ay = from.z; az = -from.y; } else { ax = -from.z; ay = 0; az = from.x; }
      l = Math.hypot(ax, ay, az);
    }
    // use the axis perpendicular to both `from` and (from x v): keeps the tangential part of v pointing "forward"
    ax /= l; ay /= l; az /= l;
    const bx = ay * from.z - az * from.y, by = az * from.x - ax * from.z, bz = ax * from.y - ay * from.x; // a x from
    const d = bx * v.x + by * v.y + bz * v.z;
    o.x = 2 * d * bx - v.x; o.y = 2 * d * by - v.y; o.z = 2 * d * bz - v.z;
    return o;
  }
  const kx = from.y * to.z - from.z * to.y, ky = from.z * to.x - from.x * to.z, kz = from.x * to.y - from.y * to.x;
  const kv = kx * v.x + ky * v.y + kz * v.z;
  const f = kv / (1 + c);
  const cx = ky * v.z - kz * v.y, cy = kz * v.x - kx * v.z, cz = kx * v.y - ky * v.x; // k x v
  o.x = v.x * c + cx + kx * f; o.y = v.y * c + cy + ky * f; o.z = v.z * c + cz + kz * f;
  return o;
}

/** Rotate v about unit axis k by angle a (Rodrigues). */
export function rotateAxis(o: Vec3, v: Vec3, k: Vec3, a: number): Vec3 {
  const c = Math.cos(a), s = Math.sin(a), kv = dot(k, v);
  const cx = k.y * v.z - k.z * v.y, cy = k.z * v.x - k.x * v.z, cz = k.x * v.y - k.y * v.x;
  o.x = v.x * c + cx * s + k.x * kv * (1 - c);
  o.y = v.y * c + cy * s + k.y * kv * (1 - c);
  o.z = v.z * c + cz * s + k.z * kv * (1 - c);
  return o;
}

/** Any unit vector perpendicular to unit n (deterministic). */
export function anyPerp(o: Vec3, n: Vec3): Vec3 {
  if (Math.abs(n.y) < 0.9) return normalize(o, set(o, n.z, 0, -n.x)); // n x Y
  return normalize(o, set(o, 0, -n.z, n.y)); // n x X
}
