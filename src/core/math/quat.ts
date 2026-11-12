// Unit quaternions `{x, y, z, w}` for orientations. Out-param style like vec3.ts: `out` first, may alias
// inputs, no allocation except the constructor `quat` / factory `quatIdentityNew`.

import type { Vec3 } from './vec3';

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

/** Below this, |from + to| means "exactly antiparallel" in quatFromUnitVectors. */
const ANTIPARALLEL_EPS = 1e-9;
/** Above this |dot|, slerp falls back to normalized lerp (angle too small for a stable sin). */
const SLERP_LINEAR_DOT = 0.9995;

export function quat(x = 0, y = 0, z = 0, w = 1): Quat {
  return { x, y, z, w };
}
export function quatIdentityNew(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function quatSet(out: Quat, x: number, y: number, z: number, w: number): Quat {
  out.x = x;
  out.y = y;
  out.z = z;
  out.w = w;
  return out;
}

export function quatCopy(out: Quat, q: Quat): Quat {
  return quatSet(out, q.x, q.y, q.z, q.w);
}

export function quatIdentity(out: Quat): Quat {
  return quatSet(out, 0, 0, 0, 1);
}

/** Inverse of a UNIT quaternion. */
export function quatConjugate(out: Quat, q: Quat): Quat {
  return quatSet(out, -q.x, -q.y, -q.z, q.w);
}

export function quatDot(a: Quat, b: Quat): number {
  return a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
}

/** Rotation of `angle` radians (right-hand rule) about the UNIT axis. */
export function quatFromAxisAngle(out: Quat, axis: Vec3, angle: number): Quat {
  const h = angle * 0.5;
  const s = Math.sin(h);
  return quatSet(out, axis.x * s, axis.y * s, axis.z * s, Math.cos(h));
}

/**
 * Shortest rotation taking unit vector `from` onto unit vector `to`.
 * Uses the half-vector h = normalize(from + to), q = (from x h, from . h), which stays accurate close to
 * antiparallel. Exactly (|from + to| < 1e-9) antiparallel inputs give a half turn about an axis perpendicular
 * to `from`; parallel inputs give identity.
 */
export function quatFromUnitVectors(out: Quat, from: Vec3, to: Vec3): Quat {
  let hx = from.x + to.x, hy = from.y + to.y, hz = from.z + to.z;
  const len = Math.sqrt(hx * hx + hy * hy + hz * hz);
  if (len < ANTIPARALLEL_EPS) {
    // Half turn about any axis perpendicular to `from`: cross with the world axis it is least aligned with.
    if (Math.abs(from.x) > Math.abs(from.z)) quatSet(out, -from.y, from.x, 0, 0);
    else quatSet(out, 0, -from.z, from.y, 0);
  } else {
    hx /= len; hy /= len; hz /= len;
    quatSet(
      out,
      from.y * hz - from.z * hy,
      from.z * hx - from.x * hz,
      from.x * hy - from.y * hx,
      from.x * hx + from.y * hy + from.z * hz,
    );
  }
  quatNormalize(out, out);
  return out;
}

/** out = a * b (applies b first, then a). */
export function quatMultiply(out: Quat, a: Quat, b: Quat): Quat {
  const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
  const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
  const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
  const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
  return quatSet(out, x, y, z, w);
}

/** Rotates v by unit quaternion q: out = q v q^-1. */
export function quatRotateVec3(out: Vec3, q: Quat, v: Vec3): Vec3 {
  // t = 2 * cross(q.xyz, v); out = v + w t + cross(q.xyz, t)
  const tx = 2 * (q.y * v.z - q.z * v.y);
  const ty = 2 * (q.z * v.x - q.x * v.z);
  const tz = 2 * (q.x * v.y - q.y * v.x);
  const x = v.x + q.w * tx + (q.y * tz - q.z * ty);
  const y = v.y + q.w * ty + (q.z * tx - q.x * tz);
  const z = v.z + q.w * tz + (q.x * ty - q.y * tx);
  out.x = x;
  out.y = y;
  out.z = z;
  return out;
}

/** Normalizes q into out and returns its original length; a zero quaternion becomes identity. */
export function quatNormalize(out: Quat, q: Quat): number {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (!(len > 0)) {
    quatIdentity(out);
    return 0;
  }
  const inv = 1 / len;
  quatSet(out, q.x * inv, q.y * inv, q.z * inv, q.w * inv);
  return len;
}

/** Spherical interpolation along the shortest arc between unit quaternions a (t=0) and b (t=1). */
export function quatSlerp(out: Quat, a: Quat, b: Quat, t: number): Quat {
  let bx = b.x, by = b.y, bz = b.z, bw = b.w;
  let cos = a.x * bx + a.y * by + a.z * bz + a.w * bw;
  if (cos < 0) {
    cos = -cos;
    bx = -bx; by = -by; bz = -bz; bw = -bw;
  }
  let wa: number, wb: number;
  if (cos > SLERP_LINEAR_DOT) {
    wa = 1 - t;
    wb = t;
  } else {
    const theta = Math.acos(cos);
    const invSin = 1 / Math.sin(theta);
    wa = Math.sin((1 - t) * theta) * invSin;
    wb = Math.sin(t * theta) * invSin;
  }
  quatSet(out, a.x * wa + bx * wb, a.y * wa + by * wb, a.z * wa + bz * wb, a.w * wa + bw * wb);
  quatNormalize(out, out);
  return out;
}

/**
 * Orientation whose local +Z points along `fwd` and local +Y along `up` (local +X = up x fwd).
 * `up` is authoritative (the surface normal for walkers); `fwd` is made perpendicular to it. Neither needs
 * to be unit length. If fwd is parallel to up (or zero), an arbitrary perpendicular forward is chosen.
 */
export function quatFromBasis(out: Quat, fwd: Vec3, up: Vec3): Quat {
  // Y axis = normalized up (falls back to world up if zero).
  let yx = up.x, yy = up.y, yz = up.z;
  let len = Math.sqrt(yx * yx + yy * yy + yz * yz);
  if (len > 0) {
    yx /= len; yy /= len; yz /= len;
  } else {
    yx = 0; yy = 1; yz = 0;
  }
  // Z axis = fwd projected onto the plane of Y.
  const d = fwd.x * yx + fwd.y * yy + fwd.z * yz;
  let zx = fwd.x - yx * d, zy = fwd.y - yy * d, zz = fwd.z - yz * d;
  len = Math.sqrt(zx * zx + zy * zy + zz * zz);
  if (len > 1e-12) {
    zx /= len; zy /= len; zz /= len;
  } else {
    // Degenerate: any unit vector perpendicular to Y.
    if (Math.abs(yx) < 0.9) { zx = 0; zy = yz; zz = -yy; } else { zx = -yz; zy = 0; zz = yx; }
    len = Math.sqrt(zx * zx + zy * zy + zz * zz);
    zx /= len; zy /= len; zz /= len;
  }
  // X axis = Y x Z.
  const xx = yy * zz - yz * zy;
  const xy = yz * zx - yx * zz;
  const xz = yx * zy - yy * zx;
  // Rotation matrix with columns X, Y, Z -> quaternion (Shepperd's method, branch on the largest diagonal).
  const m00 = xx, m01 = yx, m02 = zx;
  const m10 = xy, m11 = yy, m12 = zy;
  const m20 = xz, m21 = yz, m22 = zz;
  const trace = m00 + m11 + m22;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    quatSet(out, (m21 - m12) * s, (m02 - m20) * s, (m10 - m01) * s, 0.25 / s);
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    quatSet(out, 0.25 * s, (m01 + m10) / s, (m02 + m20) / s, (m21 - m12) / s);
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    quatSet(out, (m01 + m10) / s, 0.25 * s, (m12 + m21) / s, (m02 - m20) / s);
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    quatSet(out, (m02 + m20) / s, (m12 + m21) / s, 0.25 * s, (m10 - m01) / s);
  }
  quatNormalize(out, out);
  return out;
}

export function quatEqualsApprox(a: Quat, b: Quat, eps = 1e-6): boolean {
  return Math.abs(a.x - b.x) <= eps && Math.abs(a.y - b.y) <= eps && Math.abs(a.z - b.z) <= eps && Math.abs(a.w - b.w) <= eps;
}
