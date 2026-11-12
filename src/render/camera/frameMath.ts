// Small allocation-free helpers for camera frames on top of core vec3 (out-param style).
import { v3Copy, v3Cross, v3Dot, v3Normalize, v3ProjectOnPlane, v3Set, type Vec3 } from '@/core';

export const DEG = Math.PI / 180;

/** Exponential smoothing factor for time constant tau (s): 1 - exp(-dt / tau). tau <= 0 -> 1 (snap). */
export function smoothK(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau);
}

/** Rotate v about unit axis by angle (rad), Rodrigues. out may alias v. */
export function rotateAboutAxis(out: Vec3, v: Vec3, axis: Vec3, angle: number): Vec3 {
  const c = Math.cos(angle), s = Math.sin(angle);
  const d = v3Dot(axis, v) * (1 - c);
  const cx = axis.y * v.z - axis.z * v.y;
  const cy = axis.z * v.x - axis.x * v.z;
  const cz = axis.x * v.y - axis.y * v.x;
  return v3Set(out, v.x * c + cx * s + axis.x * d, v.y * c + cy * s + axis.y * d, v.z * c + cz * s + axis.z * d);
}

const _ax = { x: 0, y: 0, z: 0 };
/**
 * Parallel transport: apply the minimal rotation that takes unit `from` to unit `to` to vector v.
 * This is the operator the surface walker uses for headings, so floor -> wall -> ceiling never spins the camera.
 */
export function transport(out: Vec3, v: Vec3, from: Vec3, to: Vec3): Vec3 {
  const c = v3Dot(from, to);
  v3Cross(_ax, from, to);
  const s = Math.hypot(_ax.x, _ax.y, _ax.z);
  if (s < 1e-9) {
    if (c > 0) return v3Copy(out, v);
    // 180 degrees: any axis perpendicular to `from`
    perpendicular(_ax, from);
    return rotateAboutAxis(out, v, _ax, Math.PI);
  }
  _ax.x /= s; _ax.y /= s; _ax.z /= s;
  return rotateAboutAxis(out, v, _ax, Math.atan2(s, c));
}

/** Some unit vector perpendicular to unit n. */
export function perpendicular(out: Vec3, n: Vec3): Vec3 {
  if (Math.abs(n.y) < 0.9) v3Set(out, -n.z, 0, n.x);
  else v3Set(out, 0, n.z, -n.y);
  v3Normalize(out, out);
  return out;
}

/** Spherical interpolation between unit vectors (falls back to normalised lerp near 0 / 180 degrees). */
export function slerpUnit(out: Vec3, a: Vec3, b: Vec3, t: number): Vec3 {
  const c = Math.max(-1, Math.min(1, v3Dot(a, b)));
  const ang = Math.acos(c);
  if (ang < 1e-5) return v3Copy(out, b);
  if (Math.PI - ang < 1e-4) {
    // opposite vectors: rotate a about a perpendicular axis
    perpendicular(_ax, a);
    return rotateAboutAxis(out, a, _ax, ang * t);
  }
  const s = Math.sin(ang);
  const wa = Math.sin((1 - t) * ang) / s, wb = Math.sin(t * ang) / s;
  return v3Set(out, a.x * wa + b.x * wb, a.y * wa + b.y * wb, a.z * wa + b.z * wb);
}

/** Project v onto the plane of unit n and normalise; if degenerate use `fallback` (also projected). */
export function tangentDir(out: Vec3, v: Vec3, n: Vec3, fallback?: Vec3): Vec3 {
  v3ProjectOnPlane(out, v, n);
  if (v3Normalize(out, out) > 1e-6) return out;
  if (fallback) {
    v3ProjectOnPlane(out, fallback, n);
    if (v3Normalize(out, out) > 1e-6) return out;
  }
  return perpendicular(out, n);
}

/** Signed angle (rad) from unit a to unit b about unit axis n (both assumed roughly perpendicular to n). */
export function signedAngle(a: Vec3, b: Vec3, n: Vec3): number {
  const cx = a.y * b.z - a.z * b.y, cy = a.z * b.x - a.x * b.z, cz = a.x * b.y - a.y * b.x;
  return Math.atan2(cx * n.x + cy * n.y + cz * n.z, v3Dot(a, b));
}

/** Wrap an angle to (-pi, pi]. */
export function wrapPi(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI);
  if (a < 0) a += 2 * Math.PI;
  return a - Math.PI;
}

export function clampN(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}
