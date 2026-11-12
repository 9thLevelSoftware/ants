// Small builders for template primitives in object-local space (Y up): boxes from spans, upright and lying
// cylinders, ellipsoids, and `ring(n)` vessels of flared staves (GDD 04 §0.2: hollow vessels are rings of RB
// staves because primitives only combine by union). Rotations use the kit's deterministic sin/cos (DET-4).

import type { Quat } from '@/core/math/quat';
import { quatMultiply, quatNormalize } from '@/core/math/quat';
import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId } from '@/sim/types';
import { dcos, dsin, type PrimSpec } from '../../kit';

/** Axis-aligned box covering [x0, x1] x [y0, y1] x [z0, z1] (any order). */
export function spanBox(x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  material: MaterialId, flags: number, round = 0): PrimSpec {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const az = Math.min(z0, z1), bz = Math.max(z0, z1);
  return {
    shape: 'box', material, flags, round,
    pos: { x: (ax + bx) / 2, y: (ay + by) / 2, z: (az + bz) / 2 },
    size: { x: (bx - ax) / 2, y: (by - ay) / 2, z: (bz - az) / 2 },
  };
}

/** Upright cylinder standing on y0 with full height h. */
export function uprightCyl(x: number, y0: number, z: number, r: number, h: number, material: MaterialId, flags: number, round = 0): PrimSpec {
  return { shape: 'cylinder', material, flags, round, pos: { x, y: y0 + h / 2, z }, size: { x: r, y: h / 2, z: 0 } };
}

/** Rotation about +Y (yaw) and about a horizontal axis, as quaternions (deterministic). */
export function yawQ(a: number): Quat {
  return { x: 0, y: dsin(a / 2), z: 0, w: dcos(a / 2) };
}
export function axisQ(axis: Vec3, a: number): Quat {
  const s = dsin(a / 2);
  return { x: axis.x * s, y: axis.y * s, z: axis.z * s, w: dcos(a / 2) };
}
export function mulQ(a: Quat, b: Quat): Quat {
  const out = quatMultiply({ x: 0, y: 0, z: 0, w: 1 }, a, b);
  quatNormalize(out, out);
  return out;
}

/** Quarter turn about Z: a cylinder's local Y axis becomes X (lying along X). */
const ALONG_X: Quat = { x: 0, y: 0, z: -Math.SQRT1_2, w: Math.SQRT1_2 };
/** Quarter turn about X: the axis becomes Z (lying along Z). */
const ALONG_Z: Quat = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };

/** Cylinder lying along X or Z, centred at c, full length len. */
export function lyingCyl(c: Vec3, axis: 'x' | 'z', r: number, len: number, material: MaterialId, flags: number): PrimSpec {
  return { shape: 'cylinder', material, flags, round: 0, pos: { ...c }, rot: axis === 'x' ? { ...ALONG_X } : { ...ALONG_Z }, size: { x: r, y: len / 2, z: 0 } };
}

export function ellipsoid(c: Vec3, rx: number, ry: number, rz: number, material: MaterialId, flags: number): PrimSpec {
  return { shape: 'ellipsoid', material, flags, pos: { ...c }, size: { x: rx, y: ry, z: rz } };
}

export interface RingSpec {
  /** Number of staves. */
  n: number;
  /** Centre of the base, local. */
  x: number; y0: number; z: number;
  /** Outer radius at the bottom, wall height (vertical) and thickness, mm. */
  rBottom: number; height: number; wall: number;
  /** Outward lean of the wall from vertical, rad (0 = straight). */
  flare: number;
  material: MaterialId;
  flags: number;
}

/**
 * Hollow vessel wall: n box staves on a circle, each leaning outward by `flare`. Staves overlap a little so the
 * wall has no slits. Returns the staves only (add a base disc separately).
 */
export function ring(s: RingSpec): PrimSpec[] {
  const out: PrimSpec[] = [];
  const cf = dcos(s.flare), sf = dsin(s.flare);
  const slant = s.height / cf; // stave length along its lean
  const rMid = s.rBottom - s.wall / 2 + (s.height / 2) * (sf / cf); // stave centre radius at mid height
  const rTop = s.rBottom + s.height * (sf / cf);
  const chord = 2 * rTop * dsin(Math.PI / s.n) * 1.18; // widest chord, plus overlap
  for (let i = 0; i < s.n; i++) {
    const a = (2 * Math.PI * i) / s.n;
    // stave local frame: x tangent, y along the wall, z radial outward; lean = rotation about the tangent axis
    const yq = yawQ(a);
    const lean = axisQ({ x: 1, y: 0, z: 0 }, s.flare);
    const rot = mulQ(yq, lean);
    const dx = dsin(a), dz = dcos(a);
    out.push({
      shape: 'box', material: s.material, flags: s.flags, round: Math.min(1, s.wall / 4),
      pos: { x: s.x + dx * rMid, y: ringCentreY(s), z: s.z + dz * rMid },
      rot, size: { x: chord / 2, y: slant / 2, z: s.wall / 2 },
    });
  }
  return out;
}

/** Height of the stave centres: raised so the lowest stave corner (outer bottom edge) sits on y0. */
export function ringCentreY(s: Pick<RingSpec, 'y0' | 'height' | 'wall' | 'flare'>): number {
  return s.y0 + s.height / 2 + (s.wall / 2) * dsin(s.flare);
}

/** Inner radius of a ring at height h above its base (for water levels and POIs inside vessels). */
export function ringInnerRadius(s: Pick<RingSpec, 'rBottom' | 'wall' | 'flare'>, h: number): number {
  return s.rBottom - s.wall + h * (dsin(s.flare) / dcos(s.flare));
}
