// Primitive builders in the GDD 04 §0.2 notation (full extents, local Y up, origin at the object's base centre):
// RB rounded box, CY cylinder, CA capsule segment, EL ellipsoid, chain (capsules end to end) and ring (staves on
// a circle: the only way to make a hollow vessel from a union of solids). Plus the small vector maths the
// templates need. Allocation is fine here: templates are built once per object at generation time.

import type { Quat } from '@/core/math/quat';
import { quatFromUnitVectors, quatMultiply, quatNormalize } from '@/core/math/quat';
import type { Vec3 } from '@/core/math/vec3';
import { PrimFlag, type MaterialId } from '@/sim/types';
import type { PrimSpec } from '../../kit/template';
import { dcos, dsin } from '../../kit/dmath';

export const C = PrimFlag.CLIMBABLE;
export const D = PrimFlag.DIGGABLE;
export const S = PrimFlag.SHELTER;
export const SL = PrimFlag.SLIPPERY;
export const NB = PrimFlag.NAV_BLOCK;
export const VIS = PrimFlag.VISUAL_ONLY;

export const v = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
export const add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
export const sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
export const scale = (a: Vec3, s: number): Vec3 => ({ x: a.x * s, y: a.y * s, z: a.z * s });
export const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a: Vec3): number => Math.sqrt(dot(a, a));
export function norm(a: Vec3): Vec3 {
  const l = len(a);
  return l > 0 ? scale(a, 1 / l) : v(0, 1, 0);
}
export const cross = (a: Vec3, b: Vec3): Vec3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
export const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });

const UP: Vec3 = { x: 0, y: 1, z: 0 };
export const IDENT: Quat = { x: 0, y: 0, z: 0, w: 1 };

/** Rotation about +Y by `a` rad (deterministic trig). */
export function yawQ(a: number): Quat {
  return { x: 0, y: dsin(a / 2), z: 0, w: dcos(a / 2) };
}
/** Rotation about local +X by `a` rad. */
export function pitchQ(a: number): Quat {
  return { x: dsin(a / 2), y: 0, z: 0, w: dcos(a / 2) };
}
/** Rotation about +Z by `a` rad. */
export function rollQ(a: number): Quat {
  return { x: 0, y: 0, z: dsin(a / 2), w: dcos(a / 2) };
}
/** a then b applied (b * a): first rotate by a, then by b. */
export function compose(a: Quat, b: Quat): Quat {
  const q = quatMultiply({ x: 0, y: 0, z: 0, w: 1 }, b, a);
  quatNormalize(q, q);
  return q;
}
/** Rotation taking +Y onto the unit direction d. */
export function alignY(d: Vec3): Quat {
  return quatFromUnitVectors({ x: 0, y: 0, z: 0, w: 1 }, UP, d);
}
/** Unit vector at yaw `a` in the XZ plane (0 = +X, pi/2 = +Z). */
export function dirYaw(a: number): Vec3 {
  return { x: dcos(a), y: 0, z: dsin(a) };
}
/** The yaw angle whose dirYaw is +X rotated by yawQ(a): yawQ(a) turns +X toward -Z. */
export function yawDir(a: number): Vec3 {
  return { x: dcos(a), y: 0, z: -dsin(a) };
}

/** RB(W x H x D; r): rounded box with full extents, centre c. */
export function rb(c: Vec3, w: number, h: number, d: number, r: number, material: MaterialId, flags: number, rot?: Quat): PrimSpec {
  const s: PrimSpec = { shape: 'box', pos: c, size: v(w / 2, h / 2, d / 2), round: Math.min(r, w / 2, h / 2, d / 2), material, flags };
  if (rot) s.rot = rot;
  return s;
}

/** CY(dia x H): cylinder along local Y, centre c. */
export function cy(c: Vec3, dia: number, h: number, material: MaterialId, flags: number, rot?: Quat, round = 0): PrimSpec {
  const s: PrimSpec = { shape: 'cylinder', pos: c, size: v(dia / 2, h / 2, 0), round: Math.min(round, dia / 2, h / 2), material, flags };
  if (rot) s.rot = rot;
  return s;
}

/** EL(W x H x D): ellipsoid with full extents, centre c. */
export function el(c: Vec3, w: number, h: number, d: number, material: MaterialId, flags: number, rot?: Quat): PrimSpec {
  const s: PrimSpec = { shape: 'ellipsoid', pos: c, size: v(w / 2, h / 2, d / 2), round: 0, material, flags };
  if (rot) s.rot = rot;
  return s;
}

/** Capsule of diameter `dia` whose inner segment runs from a to b. */
export function ca(a: Vec3, b: Vec3, dia: number, material: MaterialId, flags: number): PrimSpec {
  const d = sub(b, a);
  const l = len(d);
  return { shape: 'capsule', pos: lerp(a, b, 0.5), rot: alignY(l > 0 ? scale(d, 1 / l) : UP), size: v(dia / 2, l / 2, 0), round: 0, material, flags };
}

/** Cylinder whose axis runs from a to b. */
export function cyAB(a: Vec3, b: Vec3, dia: number, material: MaterialId, flags: number): PrimSpec {
  const d = sub(b, a);
  const l = len(d);
  return { shape: 'cylinder', pos: lerp(a, b, 0.5), rot: alignY(l > 0 ? scale(d, 1 / l) : UP), size: v(dia / 2, l / 2, 0), round: 0, material, flags };
}

/** chain: capsules joined end to end through the points (one per segment). */
export function chain(pts: readonly Vec3[], dia: number | ((i: number) => number), material: MaterialId, flags: number): PrimSpec[] {
  const out: PrimSpec[] = [];
  for (let i = 1; i < pts.length; i++) out.push(ca(pts[i - 1], pts[i], typeof dia === 'number' ? dia : dia(i - 1), material, flags));
  return out;
}

/**
 * ring(n): n box staves on a circle (centre `c` at the bottom of the wall), outer radius `r`, wall thickness `t`,
 * height `h`. Staves overlap a little so the wall is closed. `flareRad` tilts each stave outward (bowls).
 */
export function ring(n: number, c: Vec3, r: number, t: number, h: number, material: MaterialId, flags: number, flareRad = 0): PrimSpec[] {
  const out: PrimSpec[] = [];
  const rm = r - t / 2;
  const w = ((2 * Math.PI * rm) / n) * 1.12 + t * 0.3;
  for (let i = 0; i < n; i++) {
    const a = (2 * Math.PI * i) / n;
    const lean = flareRad !== 0 ? compose(rollQ(-flareRad), yawQ(-a)) : yawQ(-a);
    // rotate local box (X radial, Y up, Z tangent) to azimuth a: radial direction = dirYaw(a)
    const dir = dirYaw(a);
    const off = (h / 2) * dsin(flareRad);
    out.push(rb(v(c.x + dir.x * (rm + off), c.y + (h / 2) * dcos(flareRad), c.z + dir.z * (rm + off)), t, h, w, Math.min(1, t / 4), material, flags, lean));
  }
  return out;
}

/** Point on the outer face of ring stave i (azimuth of the stave centre) at height y, pushed out by `off`. */
export function ringOuter(n: number, i: number, c: Vec3, r: number, y: number, off: number): Vec3 {
  const d = dirYaw((2 * Math.PI * i) / n);
  return v(c.x + d.x * (r + off), y, c.z + d.z * (r + off));
}
