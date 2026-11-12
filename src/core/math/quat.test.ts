import { describe, expect, it } from 'vitest';
import {
  quat, quatConjugate, quatDot, quatEqualsApprox, quatFromAxisAngle, quatFromBasis, quatFromUnitVectors,
  quatIdentityNew, quatMultiply, quatNormalize, quatRotateVec3, quatSlerp,
} from './quat';
import { type Vec3, v3Cross, v3Dot, v3EqualsApprox, v3Length, v3Normalize, v3UnitX, v3UnitY, v3UnitZ, vec3 } from './vec3';

const EPS = 1e-9;

function unit(x: number, y: number, z: number): Vec3 {
  const v = vec3(x, y, z);
  v3Normalize(v, v);
  return v;
}

/** Deterministic pseudo-random unit vectors without depending on rng.ts. */
function sampleDirs(n: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push(vec3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r));
  }
  return out;
}

describe('quat', () => {
  it('identity leaves vectors unchanged', () => {
    const v = vec3(1, -2, 3);
    expect(quatRotateVec3(vec3(), quatIdentityNew(), v)).toEqual(v);
  });

  it('fromAxisAngle rotates by the right-hand rule', () => {
    const q = quatFromAxisAngle(quat(), v3UnitY(), Math.PI / 2);
    const r = quatRotateVec3(vec3(), q, v3UnitZ()); // +Z about +Y by 90deg -> +X
    expect(v3EqualsApprox(r, v3UnitX(), EPS)).toBe(true);
    const q2 = quatFromAxisAngle(quat(), v3UnitZ(), Math.PI / 2);
    expect(v3EqualsApprox(quatRotateVec3(vec3(), q2, v3UnitX()), v3UnitY(), EPS)).toBe(true);
  });

  it('fromUnitVectors maps from onto to for many direction pairs', () => {
    const dirs = sampleDirs(60);
    for (const a of dirs) {
      for (let k = 0; k < dirs.length; k += 7) {
        const b = dirs[k];
        const q = quatFromUnitVectors(quat(), a, b);
        expect(v3EqualsApprox(quatRotateVec3(vec3(), q, a), b, 1e-9)).toBe(true);
      }
    }
  });

  it('fromUnitVectors is robust for parallel and antiparallel inputs', () => {
    const q = quatFromUnitVectors(quat(), v3UnitY(), v3UnitY());
    expect(quatEqualsApprox(q, quatIdentityNew(), EPS)).toBe(true);
    for (const a of [...sampleDirs(40), v3UnitX(), v3UnitY(), v3UnitZ(), vec3(-1, 0, 0), vec3(0, -1, 0), vec3(0, 0, -1)]) {
      const neg = vec3(-a.x, -a.y, -a.z);
      const h = quatFromUnitVectors(quat(), a, neg);
      expect(Number.isFinite(h.w)).toBe(true);
      expect(Math.hypot(h.x, h.y, h.z, h.w)).toBeCloseTo(1, 12);
      expect(v3EqualsApprox(quatRotateVec3(vec3(), h, a), neg, 1e-9)).toBe(true);
    }
    // nearly antiparallel (just above the epsilon)
    const a = unit(0, 1, 1e-6);
    const b = unit(0, -1, 1e-6);
    const q2 = quatFromUnitVectors(quat(), a, b);
    expect(v3EqualsApprox(quatRotateVec3(vec3(), q2, a), b, 1e-12)).toBe(true);
  });

  it('multiply composes rotations (a * b applies b first)', () => {
    const a = quatFromAxisAngle(quat(), v3UnitY(), 0.7);
    const b = quatFromAxisAngle(quat(), unit(1, 2, 3), -1.1);
    const ab = quatMultiply(quat(), a, b);
    const v = vec3(0.3, -1, 2);
    const viaProduct = quatRotateVec3(vec3(), ab, v);
    const stepwise = quatRotateVec3(vec3(), a, quatRotateVec3(vec3(), b, v));
    expect(v3EqualsApprox(viaProduct, stepwise, 1e-12)).toBe(true);
    // conjugate is the inverse
    const inv = quatMultiply(quat(), ab, quatConjugate(quat(), ab));
    expect(quatEqualsApprox(inv, quatIdentityNew(), 1e-12)).toBe(true);
  });

  it('rotation preserves length and is alias-safe', () => {
    const q = quatFromAxisAngle(quat(), unit(-2, 1, 0.5), 2.2);
    const v = vec3(3, 4, 12);
    quatRotateVec3(v, q, v);
    expect(v3Length(v)).toBeCloseTo(13, 12);
    const p = quatFromAxisAngle(quat(), v3UnitY(), 0.4);
    quatMultiply(p, p, p); // p = p*p -> 0.8 rad
    expect(quatEqualsApprox(p, quatFromAxisAngle(quat(), v3UnitY(), 0.8), 1e-12)).toBe(true);
  });

  it('slerp hits the endpoints, the midpoint angle, and takes the short way', () => {
    const a = quatFromAxisAngle(quat(), v3UnitY(), 0);
    const b = quatFromAxisAngle(quat(), v3UnitY(), 1.2);
    expect(quatEqualsApprox(quatSlerp(quat(), a, b, 0), a, 1e-12)).toBe(true);
    expect(quatEqualsApprox(quatSlerp(quat(), a, b, 1), b, 1e-12)).toBe(true);
    expect(quatEqualsApprox(quatSlerp(quat(), a, b, 0.5), quatFromAxisAngle(quat(), v3UnitY(), 0.6), 1e-12)).toBe(true);
    // b and -b are the same rotation: slerp must not go the long way round
    const negB = quat(-b.x, -b.y, -b.z, -b.w);
    const m = quatSlerp(quat(), a, negB, 0.5);
    const r = quatRotateVec3(vec3(), m, v3UnitZ());
    const expected = quatRotateVec3(vec3(), quatFromAxisAngle(quat(), v3UnitY(), 0.6), v3UnitZ());
    expect(v3EqualsApprox(r, expected, 1e-12)).toBe(true);
    // nearly identical inputs use the linear fallback and stay unit
    const c = quatFromAxisAngle(quat(), v3UnitY(), 1e-6);
    const s = quatSlerp(quat(), a, c, 0.5);
    expect(Math.hypot(s.x, s.y, s.z, s.w)).toBeCloseTo(1, 14);
  });

  it('fromBasis maps local +Z to fwd and +Y to up', () => {
    const fwd = unit(1, 0, 1), up = v3UnitY();
    const q = quatFromBasis(quat(), fwd, up);
    expect(v3EqualsApprox(quatRotateVec3(vec3(), q, v3UnitZ()), fwd, 1e-12)).toBe(true);
    expect(v3EqualsApprox(quatRotateVec3(vec3(), q, v3UnitY()), up, 1e-12)).toBe(true);
    const x = quatRotateVec3(vec3(), q, v3UnitX());
    expect(v3EqualsApprox(x, v3Cross(vec3(), up, fwd), 1e-12)).toBe(true);
    for (const n of sampleDirs(50)) {
      const f = v3Cross(vec3(), n, unit(0.3, 0.5, 0.81)); // some tangent
      v3Normalize(f, f);
      const qb = quatFromBasis(quat(), f, n);
      expect(v3EqualsApprox(quatRotateVec3(vec3(), qb, v3UnitY()), n, 1e-9)).toBe(true);
      expect(v3EqualsApprox(quatRotateVec3(vec3(), qb, v3UnitZ()), f, 1e-9)).toBe(true);
    }
  });

  it('fromBasis keeps up exact, orthogonalises fwd, and survives fwd parallel to up', () => {
    const up = unit(0, 1, 0.2);
    const q = quatFromBasis(quat(), vec3(1, 0.5, 0), up); // fwd not perpendicular, not unit
    const z = quatRotateVec3(vec3(), q, v3UnitZ());
    expect(v3Dot(z, up)).toBeCloseTo(0, 12);
    expect(v3EqualsApprox(quatRotateVec3(vec3(), q, v3UnitY()), up, 1e-12)).toBe(true);
    for (const u of [v3UnitY(), v3UnitX(), vec3(0, 0, -1), unit(1, 1, 1)]) {
      const d = quatFromBasis(quat(), u, u);
      expect(Math.hypot(d.x, d.y, d.z, d.w)).toBeCloseTo(1, 12);
      expect(v3EqualsApprox(quatRotateVec3(vec3(), d, v3UnitY()), u, 1e-9)).toBe(true);
    }
  });

  it('normalize reports length and turns a zero quaternion into identity', () => {
    const q = quat(0, 0, 0, 2);
    expect(quatNormalize(q, q)).toBe(2);
    expect(q).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    const z = quat(0, 0, 0, 0);
    expect(quatNormalize(z, z)).toBe(0);
    expect(z).toEqual({ x: 0, y: 0, z: 0, w: 1 });
    expect(quatDot(quatIdentityNew(), quatIdentityNew())).toBe(1);
  });
});
