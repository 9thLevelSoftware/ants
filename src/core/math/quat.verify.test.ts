// Adversarial review tests for quat.ts / vec3.ts / scalar.ts (F1a review).
import { describe, expect, it } from 'vitest';
import { quat, quatFromAxisAngle, quatFromBasis, quatFromUnitVectors, quatMultiply, quatRotateVec3, quatSlerp } from './quat';
import { angleDelta, smoothstep, wrapAngle } from './scalar';
import { type Vec3, v3Cross, v3Dot, v3Length, v3Normalize, v3ProjectOnPlane, vec3 } from './vec3';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

function randUnit(rnd: () => number): Vec3 {
  for (;;) {
    const v = vec3(rnd() * 2 - 1, rnd() * 2 - 1, rnd() * 2 - 1);
    if (v3Normalize(v, v) > 0.1) return v;
  }
}

describe('quat (review)', () => {
  it('fromBasis on random frames: +Z -> fwd, +Y -> up, +X -> up x fwd (right-handed, unit)', () => {
    const rnd = lcg(3);
    const ez = vec3(0, 0, 1), ey = vec3(0, 1, 0), ex = vec3(1, 0, 0);
    const t = vec3(), side = vec3();
    for (let i = 0; i < 5000; i++) {
      const up = randUnit(rnd);
      const fwd = v3ProjectOnPlane(vec3(), randUnit(rnd), up);
      if (v3Normalize(fwd, fwd) < 1e-3) continue;
      const q = quatFromBasis(quat(), fwd, up);
      expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 12);
      quatRotateVec3(t, q, ez);
      expect(v3Dot(t, fwd)).toBeGreaterThan(1 - 1e-9);
      quatRotateVec3(t, q, ey);
      expect(v3Dot(t, up)).toBeGreaterThan(1 - 1e-9);
      quatRotateVec3(t, q, ex);
      v3Cross(side, up, fwd);
      expect(v3Dot(t, side)).toBeGreaterThan(1 - 1e-9);
    }
  });

  it('fromBasis with up exactly -Y and the walker on a ceiling', () => {
    const q = quatFromBasis(quat(), vec3(1, 0, 0), vec3(0, -1, 0));
    const t = quatRotateVec3(vec3(), q, vec3(0, 1, 0));
    expect(t.y).toBeCloseTo(-1, 12);
    quatRotateVec3(t, q, vec3(0, 0, 1));
    expect(t.x).toBeCloseTo(1, 12);
  });

  it('fromUnitVectors: accurate near the antiparallel threshold (angles pi - 1e-6 .. pi - 1e-10)', () => {
    const from = vec3(1, 0, 0);
    for (const eps of [1e-6, 1e-8, 2e-9, 1e-9, 5e-10, 1e-10]) {
      const to = vec3(-Math.cos(eps), Math.sin(eps), 0);
      const q = quatFromUnitVectors(quat(), from, to);
      const r = quatRotateVec3(vec3(), q, from);
      // 1 - cos(eps) underflows for eps < ~1e-8, so the result can miss by about eps itself: fine for gameplay.
      expect(Math.hypot(r.x - to.x, r.y - to.y, r.z - to.z)).toBeLessThanOrEqual(Math.max(eps, 1e-9) * 1.01);
      expect(v3Length(r)).toBeCloseTo(1, 12);
    }
  });

  it('fromUnitVectors gives the minimal rotation (axis perpendicular to both, angle = acos(dot))', () => {
    const rnd = lcg(8);
    for (let i = 0; i < 2000; i++) {
      const a = randUnit(rnd), b = randUnit(rnd);
      const q = quatFromUnitVectors(quat(), a, b);
      const angle = 2 * Math.acos(Math.min(1, Math.abs(q.w)));
      expect(angle).toBeCloseTo(Math.acos(Math.max(-1, Math.min(1, v3Dot(a, b)))), 6);
      const axis = vec3(q.x, q.y, q.z);
      if (v3Normalize(axis, axis) > 1e-6) {
        expect(Math.abs(v3Dot(axis, a))).toBeLessThan(1e-9);
        expect(Math.abs(v3Dot(axis, b))).toBeLessThan(1e-9);
      }
    }
  });

  it('slerp has constant angular speed', () => {
    const a = quatFromAxisAngle(quat(), vec3(0, 1, 0), 0);
    const b = quatFromAxisAngle(quat(), vec3(0, 1, 0), 2.5);
    const q = quat();
    for (const t of [0.1, 0.25, 0.5, 0.9]) {
      quatSlerp(q, a, b, t);
      const v = quatRotateVec3(vec3(), q, vec3(1, 0, 0));
      expect(Math.atan2(-v.z, v.x)).toBeCloseTo(2.5 * t, 9);
    }
  });

  it('multiply is associative and alias-safe (out === a, out === b)', () => {
    const rnd = lcg(4);
    const a = quatFromAxisAngle(quat(), randUnit(rnd), 1.1);
    const b = quatFromAxisAngle(quat(), randUnit(rnd), -0.7);
    const expected = quatMultiply(quat(), a, b);
    const a2 = { ...a };
    quatMultiply(a2, a2, b);
    expect(a2).toEqual(expected);
    const b2 = { ...b };
    quatMultiply(b2, a, b2);
    expect(b2).toEqual(expected);
  });
});

describe('scalar (review)', () => {
  it('wrapAngle / angleDelta at the boundaries and for large angles', () => {
    expect(wrapAngle(Math.PI)).toBe(Math.PI);
    expect(wrapAngle(-Math.PI)).toBe(Math.PI);
    expect(wrapAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 12);
    expect(Math.abs(wrapAngle(1e6))).toBeLessThanOrEqual(Math.PI);
    expect(angleDelta(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(0.2, 12);
  });

  // Regression (fixed): smoothstep with e0 === e1 used to return 0 for every x.
  it('smoothstep(e, e, x) acts as a step at e', () => {
    expect(smoothstep(5, 5, 10)).toBe(1);
  });
});
