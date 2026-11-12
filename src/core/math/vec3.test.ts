import { describe, expect, it } from 'vitest';
import {
  v3Add, v3AddScaled, v3Copy, v3Cross, v3Distance, v3DistanceSq, v3Dot, v3EqualsApprox, v3IsFinite, v3Length,
  v3LengthSq, v3Lerp, v3Max, v3Min, v3Negate, v3Normalize, v3Project, v3ProjectOnPlane, v3Reject, v3Scale, v3Set,
  v3Sub, v3UnitX, v3UnitY, v3UnitZ, v3Zero, vec3,
} from './vec3';

describe('vec3', () => {
  it('constructs and the factories return fresh objects every call', () => {
    expect(vec3(1, 2, 3)).toEqual({ x: 1, y: 2, z: 3 });
    expect(vec3()).toEqual({ x: 0, y: 0, z: 0 });
    const a = v3UnitY();
    a.y = 5;
    expect(v3UnitY()).toEqual({ x: 0, y: 1, z: 0 }); // no shared mutable constant
    expect(v3Zero()).not.toBe(v3Zero());
  });

  it('set / copy write into out and return it', () => {
    const out = vec3();
    expect(v3Set(out, 1, 2, 3)).toBe(out);
    const b = vec3();
    expect(v3Copy(b, out)).toBe(b);
    expect(b).toEqual({ x: 1, y: 2, z: 3 });
  });

  it('add / sub / scale / addScaled / negate', () => {
    const a = vec3(1, 2, 3), b = vec3(4, -5, 6), out = vec3();
    expect(v3Add(out, a, b)).toEqual({ x: 5, y: -3, z: 9 });
    expect(v3Sub(out, a, b)).toEqual({ x: -3, y: 7, z: -3 });
    expect(v3Scale(out, a, 2)).toEqual({ x: 2, y: 4, z: 6 });
    expect(v3AddScaled(out, a, b, 0.5)).toEqual({ x: 3, y: -0.5, z: 6 });
    expect(v3Negate(out, a)).toEqual({ x: -1, y: -2, z: -3 });
  });

  it('operations are alias-safe (out may be an input)', () => {
    const a = vec3(1, 2, 3), b = vec3(4, 5, 6);
    v3Add(a, a, b);
    expect(a).toEqual({ x: 5, y: 7, z: 9 });
    const c = vec3(1, 0, 0);
    v3Cross(c, c, vec3(0, 1, 0)); // must read c before writing it
    expect(c).toEqual({ x: 0, y: 0, z: 1 });
  });

  it('dot and cross follow the right-hand rule', () => {
    expect(v3Dot(vec3(1, 2, 3), vec3(4, 5, 6))).toBe(32);
    expect(v3Cross(vec3(), v3UnitX(), v3UnitY())).toEqual(v3UnitZ());
    expect(v3Cross(vec3(), v3UnitY(), v3UnitZ())).toEqual(v3UnitX());
    const a = vec3(1.5, -2, 0.3), b = vec3(-0.7, 4, 2);
    const c = v3Cross(vec3(), a, b);
    expect(v3Dot(c, a)).toBeCloseTo(0, 12);
    expect(v3Dot(c, b)).toBeCloseTo(0, 12);
  });

  it('length, distance and their squares', () => {
    expect(v3Length(vec3(3, 4, 12))).toBe(13);
    expect(v3LengthSq(vec3(3, 4, 12))).toBe(169);
    expect(v3Distance(vec3(1, 1, 1), vec3(4, 5, 1))).toBe(5);
    expect(v3DistanceSq(vec3(1, 1, 1), vec3(4, 5, 1))).toBe(25);
  });

  it('normalize returns the original length and a unit vector', () => {
    const out = vec3();
    expect(v3Normalize(out, vec3(0, 3, 4))).toBe(5);
    expect(out.y).toBeCloseTo(0.6, 15);
    expect(out.z).toBeCloseTo(0.8, 15);
    expect(v3Length(out)).toBeCloseTo(1, 15);
  });

  it('normalize leaves a zero (or denormal-tiny) vector untouched and reports 0', () => {
    const out = vec3(9, 9, 9);
    expect(v3Normalize(out, vec3(0, 0, 0))).toBe(0);
    expect(out).toEqual({ x: 0, y: 0, z: 0 });
    const tiny = vec3(1e-170, 0, 0);
    expect(v3Normalize(out, tiny)).toBe(0);
    expect(out).toEqual(tiny);
    expect(v3IsFinite(out)).toBe(true);
    expect(v3Normalize(out, vec3(1e-100, 0, 0))).toBeCloseTo(1e-100, 110); // small but usable
    expect(out.x).toBeCloseTo(1, 12);
  });

  it('lerp interpolates component-wise', () => {
    expect(v3Lerp(vec3(), vec3(0, 0, 0), vec3(10, -10, 4), 0.25)).toEqual({ x: 2.5, y: -2.5, z: 1 });
  });

  it('projectOnPlane removes the normal component (unit normal)', () => {
    const out = v3ProjectOnPlane(vec3(), vec3(3, 5, -2), v3UnitY());
    expect(out).toEqual({ x: 3, y: 0, z: -2 });
    const n = vec3();
    v3Normalize(n, vec3(1, 1, 1));
    const t = v3ProjectOnPlane(vec3(), vec3(0.3, -2, 7), n);
    expect(v3Dot(t, n)).toBeCloseTo(0, 12);
  });

  it('project + reject decompose a vector for a non-unit direction', () => {
    const v = vec3(2, 3, 4), d = vec3(0, 0, 10);
    const p = v3Project(vec3(), v, d), r = v3Reject(vec3(), v, d);
    expect(p).toEqual({ x: 0, y: 0, z: 4 });
    expect(r).toEqual({ x: 2, y: 3, z: 0 });
    expect(v3Add(vec3(), p, r)).toEqual(v);
    expect(v3Project(vec3(), v, vec3())).toEqual({ x: 0, y: 0, z: 0 });
    expect(v3Reject(vec3(), v, vec3())).toEqual(v);
  });

  it('min / max are component-wise', () => {
    expect(v3Min(vec3(), vec3(1, 5, -3), vec3(2, 0, -4))).toEqual({ x: 1, y: 0, z: -4 });
    expect(v3Max(vec3(), vec3(1, 5, -3), vec3(2, 0, -4))).toEqual({ x: 2, y: 5, z: -3 });
  });

  it('equalsApprox uses a per-component tolerance', () => {
    expect(v3EqualsApprox(vec3(1, 2, 3), vec3(1 + 1e-7, 2, 3))).toBe(true);
    expect(v3EqualsApprox(vec3(1, 2, 3), vec3(1.01, 2, 3))).toBe(false);
    expect(v3EqualsApprox(vec3(1, 2, 3), vec3(1.01, 2, 3), 0.1)).toBe(true);
  });

  it('isFinite detects NaN and infinities', () => {
    expect(v3IsFinite(vec3(1, 2, 3))).toBe(true);
    expect(v3IsFinite(vec3(Number.NaN, 2, 3))).toBe(false);
    expect(v3IsFinite(vec3(1, Infinity, 3))).toBe(false);
  });
});
