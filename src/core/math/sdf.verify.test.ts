// Adversarial review tests for sdf.ts (F1a review). The reference is the EXACT distance to an ellipsoid,
// computed with Eberly's root of F(t) = sum((r_i p_i / (t + r_i^2))^2) - 1 on t in (-rmin^2, inf), which is
// monotone there, so plain bisection finds the closest surface point for interior and exterior points alike.
import { describe, expect, it } from 'vitest';
import { sdCappedCylinder, sdCapsule, sdEllipsoid, sdRoundBox } from './sdf';
import { vec3 } from './vec3';

function exactEllipsoid(px: number, py: number, pz: number, rx: number, ry: number, rz: number): number {
  const r = [rx, ry, rz];
  const p = [Math.abs(px), Math.abs(py), Math.abs(pz)];
  const rmin2 = Math.min(rx * rx, ry * ry, rz * rz);
  const F = (t: number) => {
    let s = 0;
    for (let i = 0; i < 3; i++) {
      const q = (r[i] * p[i]) / (t + r[i] * r[i]);
      s += q * q;
    }
    return s - 1;
  };
  let lo = -rmin2 * (1 - 1e-15), hi = 1;
  while (F(hi) > 0) hi *= 2;
  for (let k = 0; k < 200; k++) {
    const m = (lo + hi) / 2;
    if (F(m) > 0) lo = m; else hi = m;
  }
  const t = (lo + hi) / 2;
  let d2 = 0;
  for (let i = 0; i < 3; i++) d2 += (p[i] - (r[i] * r[i] * p[i]) / (t + r[i] * r[i])) ** 2;
  const inside = (px / rx) ** 2 + (py / ry) ** 2 + (pz / rz) ** 2 < 1;
  return inside ? -Math.sqrt(d2) : Math.sqrt(d2);
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

describe('sdEllipsoid vs exact distance (review)', () => {
  it('the reference itself is exact on spheres and along axes', () => {
    expect(exactEllipsoid(0, 5, 0, 2, 2, 2)).toBeCloseTo(3, 9);
    expect(exactEllipsoid(5, 0.001, 0, 3, 1, 2)).toBeCloseTo(2, 5);
    expect(exactEllipsoid(0, 0.25, 0, 3, 1, 2)).toBeCloseTo(-0.75, 9);
  });

  it('outside it never overestimates, even for very flat/elongated shapes (up to 20:1)', () => {
    const rnd = lcg(11);
    for (const [rx, ry, rz] of [[3, 1, 2], [10, 1, 1], [10, 10, 1], [20, 5, 1]]) {
      const e = Math.max(rx, ry, rz) * 2;
      for (let i = 0; i < 20000; i++) {
        const x = (rnd() * 2 - 1) * e, y = (rnd() * 2 - 1) * e, z = (rnd() * 2 - 1) * e;
        const exact = exactEllipsoid(x, y, z, rx, ry, rz);
        if (exact <= 0) continue;
        expect(sdEllipsoid(vec3(x, y, z), rx, ry, rz)).toBeLessThanOrEqual(exact + 1e-9);
      }
    }
  });

  it('within the walking band (|d| <= 0.1 minR) it is within 5 % for ratios up to 3:1', () => {
    const rnd = lcg(12);
    for (const [rx, ry, rz] of [[3, 1, 2], [3, 1, 1], [1, 3, 1.5]]) {
      const minR = Math.min(rx, ry, rz);
      const e = Math.max(rx, ry, rz) * 1.2;
      let checked = 0;
      for (let i = 0; i < 200000 && checked < 2000; i++) {
        const x = (rnd() * 2 - 1) * e, y = (rnd() * 2 - 1) * e, z = (rnd() * 2 - 1) * e;
        const exact = exactEllipsoid(x, y, z, rx, ry, rz);
        if (Math.abs(exact) > 0.1 * minR || Math.abs(exact) < 1e-6) continue;
        checked++;
        expect(Math.abs(sdEllipsoid(vec3(x, y, z), rx, ry, rz) / exact - 1)).toBeLessThanOrEqual(0.05);
      }
      expect(checked).toBeGreaterThan(500);
    }
  });

  // FINDING (minor): sdf.ts documents "deeper INSIDE it can OVERESTIMATE the depth by up to about 2x (3:1)".
  // For radii (3, 1, 2) (ratio 3:1) the overestimate reaches 2.6x, e.g. p = (0.344, 0.011, -0.0036):
  // approx -2.56 vs exact -0.98. `it.fails` keeps the suite green; it turns red once the doc/bound is fixed.
  it.fails('documented inside bound (<= ~2x for 3:1) holds', () => {
    const p = vec3(0.3444353062659502, 0.010978004895150661, -0.003586225211620331);
    const approx = sdEllipsoid(p, 3, 1, 2);
    const exact = exactEllipsoid(p.x, p.y, p.z, 3, 1, 2);
    expect(approx / exact).toBeLessThanOrEqual(2.1);
  });

  // FINDING (minor): the value is discontinuous at the centre. sdEllipsoid(0) = -min(r) = -1, but just off the
  // centre along z it is ~-rz = -2 (and ~-rx = -3 along x): the limit depends on the approach direction.
  it.fails('is continuous at the centre', () => {
    const atCentre = sdEllipsoid(vec3(0, 0, 0), 3, 1, 2);
    const nearCentre = sdEllipsoid(vec3(0, 0, 1e-6), 3, 1, 2);
    expect(Math.abs(atCentre - nearCentre)).toBeLessThan(0.01);
  });
});

describe('exact SDF edge cases (review)', () => {
  it('surface points evaluate to ~0 and signs are right on all faces', () => {
    const half = vec3(3, 1, 2);
    expect(sdRoundBox(vec3(3, 0, 0), half, 0.2)).toBeCloseTo(0, 12);
    expect(sdRoundBox(vec3(0, -1, 0), half, 0.2)).toBeCloseTo(0, 12);
    expect(sdRoundBox(vec3(0, 0, 2.5), half, 0.2)).toBeCloseTo(0.5, 12);
    expect(sdCappedCylinder(vec3(0, 2, 0), 1, 2, 0.5)).toBeCloseTo(0, 12);
    expect(sdCappedCylinder(vec3(1, 0, 0), 1, 2, 0.5)).toBeCloseTo(0, 12);
    expect(sdCappedCylinder(vec3(1, 2, 0), 1, 2, 0.5)).toBeGreaterThan(0); // the rounded rim is cut away
    expect(sdCapsule(vec3(0, -3, 0), 2, 1)).toBeCloseTo(0, 12);
  });

  it('negative-zero and huge coordinates stay finite', () => {
    expect(sdRoundBox(vec3(-0, -0, -0), vec3(1, 1, 1), 0)).toBe(-1);
    expect(Number.isFinite(sdRoundBox(vec3(1e12, -1e12, 1e12), vec3(1, 1, 1), 0.1))).toBe(true);
    expect(Number.isFinite(sdEllipsoid(vec3(1e12, 1, 1), 3, 1, 2))).toBe(true);
  });
});
