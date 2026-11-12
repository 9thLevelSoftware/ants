import { describe, expect, it } from 'vitest';
import { quat, quatFromAxisAngle } from './quat';
import { sdCappedCylinder, sdCapsule, sdCapsuleSegment, sdEllipsoid, sdEllipsoidExact, sdRoundBox, sdSphere, sdfToLocal, sdfToWorld } from './sdf';
import { type Vec3, v3Distance, v3EqualsApprox, v3Normalize, vec3 } from './vec3';

// Brute-force reference: every primitive here is convex and contains the origin of its local space, so its
// surface can be sampled by bisecting the independent `inside` predicate along many rays from the origin.
// The true distance from p to the surface is then <= the minimum distance to those samples, and exceeds it by at
// most about the sample spacing.

interface Case {
  name: string;
  sd: (p: Vec3) => number;
  inside: (p: Vec3) => boolean; // independent of the SDF formula
  extent: number; // bounding radius around the origin
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

function roundBoxCase(hx: number, hy: number, hz: number, r: number): Case {
  const ix = hx - r, iy = hy - r, iz = hz - r;
  return {
    name: `roundBox(${hx},${hy},${hz},r=${r})`,
    sd: (p) => sdRoundBox(p, vec3(hx, hy, hz), r),
    inside: (p) => Math.hypot(p.x - clamp(p.x, -ix, ix), p.y - clamp(p.y, -iy, iy), p.z - clamp(p.z, -iz, iz)) <= r,
    extent: Math.hypot(hx, hy, hz),
  };
}

function cylinderCase(radius: number, hh: number, rounding: number): Case {
  return {
    name: `cylinder(r=${radius},hh=${hh},round=${rounding})`,
    sd: (p) => sdCappedCylinder(p, radius, hh, rounding),
    inside: (p) => {
      const rho = Math.hypot(p.x, p.z), ay = Math.abs(p.y);
      const cr = radius - rounding, ch = hh - rounding;
      return Math.hypot(rho - clamp(rho, 0, cr), ay - clamp(ay, 0, ch)) <= rounding;
    },
    extent: Math.hypot(radius, hh),
  };
}

function capsuleCase(hl: number, r: number): Case {
  return {
    name: `capsule(hl=${hl},r=${r})`,
    sd: (p) => sdCapsule(p, hl, r),
    inside: (p) => Math.hypot(p.x, p.y - clamp(p.y, -hl, hl), p.z) <= r,
    extent: hl + r,
  };
}

function ellipsoidCase(rx: number, ry: number, rz: number): Case {
  return {
    name: `ellipsoid(${rx},${ry},${rz})`,
    sd: (p) => sdEllipsoid(p, rx, ry, rz),
    inside: (p) => (p.x / rx) ** 2 + (p.y / ry) ** 2 + (p.z / rz) ** 2 <= 1,
    extent: Math.max(rx, ry, rz),
  };
}

function fibonacciDirs(n: number): Vec3[] {
  const out: Vec3[] = [];
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.push(vec3(Math.cos(golden * i) * r, y, Math.sin(golden * i) * r));
  }
  return out;
}

const DIRS = fibonacciDirs(30_000);

function surfaceSamples(c: Case): Float64Array {
  const pts = new Float64Array(DIRS.length * 3);
  const p = vec3();
  DIRS.forEach((d, k) => {
    let lo = 0, hi = c.extent * 1.01;
    for (let it = 0; it < 50; it++) {
      const mid = (lo + hi) / 2;
      p.x = d.x * mid; p.y = d.y * mid; p.z = d.z * mid;
      if (c.inside(p)) lo = mid; else hi = mid;
    }
    pts[k * 3] = d.x * lo; pts[k * 3 + 1] = d.y * lo; pts[k * 3 + 2] = d.z * lo;
  });
  return pts;
}

function bruteDistance(pts: Float64Array, p: Vec3): number {
  let best = Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const dx = pts[i] - p.x, dy = pts[i + 1] - p.y, dz = pts[i + 2] - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

/** Small deterministic LCG for test points (keeps this test independent of rng.ts). */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

function queryPoints(c: Case, n: number, seed: number): Vec3[] {
  const rnd = lcg(seed);
  const out: Vec3[] = [];
  const e = c.extent * 1.6;
  for (let i = 0; i < n; i++) out.push(vec3((rnd() * 2 - 1) * e, (rnd() * 2 - 1) * e, (rnd() * 2 - 1) * e));
  return out;
}

const EXACT_CASES: Case[] = [
  roundBoxCase(3, 1, 2, 0),
  roundBoxCase(3, 1, 2, 0.4),
  roundBoxCase(1, 1, 1, 1), // fully rounded = sphere
  cylinderCase(1.5, 2, 0),
  cylinderCase(1.5, 0.5, 0.3),
  capsuleCase(2, 0.7),
];

describe('sdf exact primitives vs brute force', () => {
  for (const c of EXACT_CASES) {
    it(`${c.name}: |sd| matches nearest-surface distance and the sign matches the inside test`, () => {
      const pts = surfaceSamples(c);
      const tol = 0.03 * c.extent;
      for (const p of queryPoints(c, 250, 17)) {
        const sd = c.sd(p);
        const brute = bruteDistance(pts, p);
        expect(Math.abs(sd)).toBeLessThanOrEqual(brute + 1e-9); // never further than an actual surface point
        expect(brute - Math.abs(sd)).toBeLessThanOrEqual(tol);
        if (Math.abs(sd) > 1e-9) expect(sd < 0).toBe(c.inside(p));
      }
    });
  }

  it('exact SDFs are 1-Lipschitz (continuous, no jumps across regions)', () => {
    const rnd = lcg(5);
    for (const c of EXACT_CASES) {
      for (let i = 0; i < 2000; i++) {
        const e = c.extent * 1.5;
        const a = vec3((rnd() * 2 - 1) * e, (rnd() * 2 - 1) * e, (rnd() * 2 - 1) * e);
        const b = vec3(a.x + (rnd() - 0.5) * 0.02, a.y + (rnd() - 0.5) * 0.02, a.z + (rnd() - 0.5) * 0.02);
        expect(Math.abs(c.sd(a) - c.sd(b))).toBeLessThanOrEqual(v3Distance(a, b) * (1 + 1e-9) + 1e-12);
      }
    }
  });

  it('known values: centres, faces, edges and corners', () => {
    expect(sdSphere(vec3(0, 3, 4), 2)).toBe(3);
    expect(sdRoundBox(vec3(0, 0, 0), vec3(3, 1, 2), 0)).toBe(-1); // nearest face is y
    expect(sdRoundBox(vec3(5, 0, 0), vec3(3, 1, 2), 0)).toBe(2);
    expect(sdRoundBox(vec3(4, 2, 0), vec3(3, 1, 2), 0)).toBeCloseTo(Math.SQRT2, 12); // edge region
    expect(sdRoundBox(vec3(4, 2, 3), vec3(3, 1, 2), 0.5)).toBeCloseTo(Math.hypot(1.5, 1.5, 1.5) - 0.5, 12); // rounded corner
    expect(sdCappedCylinder(vec3(0, 5, 0), 1, 2)).toBe(3);
    expect(sdCappedCylinder(vec3(4, 0, 0), 1, 2)).toBe(3);
    expect(sdCappedCylinder(vec3(0, 0, 0), 1, 2)).toBe(-1);
    expect(sdCapsule(vec3(0, 5, 0), 2, 1)).toBe(2);
    expect(sdCapsule(vec3(3, 1, 0), 2, 1)).toBe(2);
  });

  it('rounding radii are clamped to the shape size', () => {
    expect(sdRoundBox(vec3(0, 3, 0), vec3(1, 1, 1), 5)).toBeCloseTo(sdSphere(vec3(0, 3, 0), 1), 12);
    expect(sdCappedCylinder(vec3(0, 0, 3), 1, 1, 9)).toBeCloseTo(sdSphere(vec3(0, 0, 3), 1), 12);
    expect(sdRoundBox(vec3(0, 3, 0), vec3(1, 1, 1), -2)).toBe(2); // negative = sharp
  });

  it('capsuleSegment equals the axis-aligned capsule after a transform and handles a degenerate segment', () => {
    const rnd = lcg(9);
    const a = vec3(1, 2, 3), b = vec3(1, 6, 3); // vertical, centre (1,4,3), half length 2
    for (let i = 0; i < 200; i++) {
      const p = vec3(rnd() * 8 - 3, rnd() * 10 - 1, rnd() * 8 - 1);
      expect(sdCapsuleSegment(p, a, b, 0.5)).toBeCloseTo(sdCapsule(vec3(p.x - 1, p.y - 4, p.z - 3), 2, 0.5), 12);
    }
    expect(sdCapsuleSegment(vec3(3, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0), 1)).toBe(2); // a == b -> sphere
  });
});

describe('sdEllipsoid (bound-corrected approximation)', () => {
  const cases = [ellipsoidCase(2, 2, 2), ellipsoidCase(3, 1, 2), ellipsoidCase(1, 3, 1.5), ellipsoidCase(3, 1, 1)];

  it('is exact on spheres and has an exact sign and zero set everywhere', () => {
    expect(sdEllipsoid(vec3(0, 5, 0), 2, 2, 2)).toBeCloseTo(3, 12);
    expect(sdEllipsoid(vec3(0, 0, 0), 3, 1, 2)).toBe(-1);
    expect(sdEllipsoid(vec3(5, 0, 0), 3, 1, 2)).toBeCloseTo(2, 12); // exact along principal axes
    for (const c of cases) {
      for (const p of queryPoints(c, 2000, 3)) {
        const sd = c.sd(p);
        expect(Number.isFinite(sd)).toBe(true);
        if (Math.abs(sd) > 1e-9) expect(sd < 0).toBe(c.inside(p));
      }
    }
  });

  it('outside, it never overestimates and underestimates by at most 27 % within 2 * minRadius (3:1)', () => {
    for (const c of cases) {
      const pts = surfaceSamples(c);
      const minR = Math.min(...c.name.match(/[\d.]+/g)!.map(Number));
      const sampleTol = 0.03 * c.extent; // brute force exceeds the true distance by at most this
      for (const p of queryPoints(c, 600, 23)) {
        const approx = c.sd(p);
        if (approx <= 0) continue;
        const brute = bruteDistance(pts, p);
        expect(approx).toBeLessThanOrEqual(brute + 1e-9); // approx <= true <= brute
        if (brute < 2 * minR) expect(approx).toBeGreaterThanOrEqual(0.72 * (brute - sampleTol));
      }
    }
  });

  it('is within 5 % of the true distance in the walking band |d| <= 0.1 * minRadius, both sides', () => {
    // Exact references: p = s + n * delta, with s on the surface and n its unit normal. For |delta| below the
    // smallest radius of curvature (minR^2 / maxR) the closest surface point of p is s, so |true d| = |delta|.
    for (const [rx, ry, rz] of [[2, 2, 1.5], [2, 1, 1], [3, 1, 2], [3, 1, 1], [1, 3, 1.5]]) {
      const minR = Math.min(rx, ry, rz);
      const n = vec3(), s = vec3(), p = vec3();
      for (const d of fibonacciDirs(400)) {
        const k = 1 / Math.sqrt((d.x / rx) ** 2 + (d.y / ry) ** 2 + (d.z / rz) ** 2);
        s.x = d.x * k; s.y = d.y * k; s.z = d.z * k;
        n.x = s.x / (rx * rx); n.y = s.y / (ry * ry); n.z = s.z / (rz * rz);
        v3Normalize(n, n);
        for (const frac of [-0.1, -0.03, 0.03, 0.1]) {
          const delta = frac * minR;
          p.x = s.x + n.x * delta; p.y = s.y + n.y * delta; p.z = s.z + n.z * delta;
          const approx = sdEllipsoid(p, rx, ry, rz);
          expect(Math.sign(approx)).toBe(Math.sign(delta));
          expect(Math.abs(approx / delta - 1)).toBeLessThanOrEqual(0.05);
        }
      }
    }
  });

  it('is continuous, with slope close to 1 near the surface, and finite at the centre', () => {
    const rnd = lcg(31);
    for (const c of cases) {
      const minR = Math.min(...c.name.match(/[\d.]+/g)!.map(Number));
      for (let i = 0; i < 4000; i++) {
        const e = c.extent * 1.5;
        const a = vec3((rnd() * 2 - 1) * e, (rnd() * 2 - 1) * e, (rnd() * 2 - 1) * e);
        const da = c.sd(a);
        if (Math.abs(da) > 0.1 * minR) continue;
        const b = vec3(a.x + 1e-5, a.y - 1e-5, a.z + 1e-5);
        expect(Math.abs(da - c.sd(b))).toBeLessThanOrEqual(v3Distance(a, b) * 1.1);
      }
      expect(c.sd(vec3(0, 0, 0))).toBeLessThan(0);
    }
  });
});

describe('sdf transforms', () => {
  it('sdfToLocal and sdfToWorld are inverses and alias-safe', () => {
    const axis = vec3(1, 2, -0.5);
    v3Normalize(axis, axis);
    const rot = quatFromAxisAngle(quat(), axis, 1.3);
    const pos = vec3(10, -4, 7);
    const p = vec3(3, 8, -2);
    const local = sdfToLocal(vec3(), p, pos, rot);
    expect(v3EqualsApprox(sdfToWorld(vec3(), local, pos, rot), p, 1e-12)).toBe(true);
    const q = vec3(p.x, p.y, p.z);
    sdfToLocal(q, q, pos, rot);
    expect(v3EqualsApprox(q, local, 1e-12)).toBe(true);
    expect(v3Distance(local, vec3())).toBeCloseTo(v3Distance(p, pos), 12); // rigid
  });

  it('a rotated, translated round box matches brute force on transformed surface samples', () => {
    const c = roundBoxCase(3, 1, 2, 0.3);
    const local = surfaceSamples(c);
    const axis = vec3(0.3, 1, 0.2);
    v3Normalize(axis, axis);
    const rot = quatFromAxisAngle(quat(), axis, 0.9);
    const pos = vec3(100, 5, -40);
    const world = new Float64Array(local.length);
    const t = vec3();
    for (let i = 0; i < local.length; i += 3) {
      sdfToWorld(t, vec3(local[i], local[i + 1], local[i + 2]), pos, rot);
      world[i] = t.x; world[i + 1] = t.y; world[i + 2] = t.z;
    }
    const rnd = lcg(77);
    const lp = vec3();
    for (let i = 0; i < 150; i++) {
      const p = vec3(pos.x + (rnd() * 2 - 1) * 6, pos.y + (rnd() * 2 - 1) * 6, pos.z + (rnd() * 2 - 1) * 6);
      const sd = sdRoundBox(sdfToLocal(lp, p, pos, rot), vec3(3, 1, 2), 0.3);
      const brute = bruteDistance(world, p);
      expect(Math.abs(sd)).toBeLessThanOrEqual(brute + 1e-9);
      expect(brute - Math.abs(sd)).toBeLessThanOrEqual(0.03 * c.extent);
    }
  });
});

describe('sdEllipsoid interior and sdEllipsoidExact (F1a-fixes)', () => {
  const shapes: [number, number, number][] = [
    [1, 1, 1], [1.5, 1, 1], [2, 1, 1.5], [3, 1, 2], [1, 4, 1.2], [1.3, 1.1, 6], [6, 1, 1],
  ];
  // Brute-force closest distance to the surface from a dense sampling of the surface.
  function brute(p: { x: number; y: number; z: number }, [rx, ry, rz]: [number, number, number]): number {
    let best = Infinity;
    const nu = 240, nv = 240;
    for (let i = 0; i <= nu; i++) {
      const th = (Math.PI * i) / nu;
      for (let j = 0; j < nv; j++) {
        const ph = (2 * Math.PI * j) / nv;
        const dx = p.x - rx * Math.sin(th) * Math.cos(ph);
        const dy = p.y - ry * Math.cos(th);
        const dz = p.z - rz * Math.sin(th) * Math.sin(ph);
        best = Math.min(best, dx * dx + dy * dy + dz * dz);
      }
    }
    return Math.sqrt(best);
  }

  it('signs are right everywhere for both versions, including the centre and symmetry planes', () => {
    const rnd = lcg(77);
    for (const r of shapes) {
      const pts = [vec3(0, 0, 0), vec3(r[0] * 0.5, 0, 0), vec3(0, r[1] * 0.5, 0), vec3(0, 0, r[2] * 0.5), vec3(r[0] * 2, 0, 0)];
      for (let i = 0; i < 1500; i++) pts.push(vec3((rnd() * 2 - 1) * r[0] * 1.5, (rnd() * 2 - 1) * r[1] * 1.5, (rnd() * 2 - 1) * r[2] * 1.5));
      for (const p of pts) {
        const inside = (p.x / r[0]) ** 2 + (p.y / r[1]) ** 2 + (p.z / r[2]) ** 2 < 1;
        const a = sdEllipsoid(p, ...r), e = sdEllipsoidExact(p, ...r);
        expect(Number.isFinite(a) && Number.isFinite(e)).toBe(true);
        expect(a < 0).toBe(inside);
        expect(e < 0).toBe(inside);
      }
    }
  });

  it('is finite, negative and continuous through the centre, from every direction', () => {
    for (const r of shapes) {
      const minR = Math.min(...r);
      expect(sdEllipsoid(vec3(0, 0, 0), ...r)).toBe(-minR);
      for (const d of fibonacciDirs(60)) {
        for (const eps of [1e-9, 1e-6, 1e-3]) {
          const v = sdEllipsoid(vec3(d.x * eps, d.y * eps, d.z * eps), ...r);
          expect(v).toBeLessThan(0);
          expect(Math.abs(v + minR)).toBeLessThanOrEqual(10 * eps);
        }
      }
    }
  });

  it('interior overestimate stays within the documented factors', () => {
    const rnd = lcg(5);
    const limits: [number, number][] = [[1.5, 1.3], [3, 1.7], [6, 2.2]]; // [aspect, max factor] (doc: 1.2 / 1.55 / 2.0)
    for (const [a, limit] of limits) {
      const r: [number, number, number] = [a, 1, 1.2];
      for (let i = 0; i < 1500; i++) {
        const p = vec3((rnd() * 2 - 1) * a, rnd() * 2 - 1, (rnd() * 2 - 1) * 1.2);
        if ((p.x / a) ** 2 + p.y ** 2 + (p.z / 1.2) ** 2 >= 1) continue;
        const e = -sdEllipsoidExact(p, ...r);
        if (e < 1e-6) continue;
        const ratio = -sdEllipsoid(p, ...r) / e;
        expect(ratio).toBeLessThanOrEqual(limit);
        expect(ratio).toBeGreaterThanOrEqual(1 - 1e-9);
      }
    }
  });

  it('sdEllipsoidExact is within 1 % of brute force (inside and outside, all aspect ratios)', () => {
    const rnd = lcg(123);
    for (const r of shapes) {
      const extent = Math.max(...r);
      for (let i = 0; i < 40; i++) {
        const p = vec3((rnd() * 2 - 1) * r[0] * 1.6, (rnd() * 2 - 1) * r[1] * 1.6, (rnd() * 2 - 1) * r[2] * 1.6);
        const b = brute(p, r), e = Math.abs(sdEllipsoidExact(p, ...r));
        // brute force overestimates by at most the sampling spacing (~0.03 * extent)
        expect(e).toBeLessThanOrEqual(b + 1e-9);
        expect(e).toBeGreaterThanOrEqual(b - 0.03 * extent);
        if (b > 0.2 * extent) expect(Math.abs(e / b - 1)).toBeLessThanOrEqual(0.01);
      }
      // centre and on-axis values are known exactly
      expect(sdEllipsoidExact(vec3(0, 0, 0), ...r)).toBeCloseTo(-Math.min(...r), 9);
      expect(sdEllipsoidExact(vec3(r[0] * 2, 0, 0), ...r)).toBeCloseTo(r[0], 9);
    }
  });

  it('sdEllipsoidExact equals the Euclidean distance on spheres and is 1-Lipschitz', () => {
    expect(sdEllipsoidExact(vec3(0, 5, 0), 2, 2, 2)).toBeCloseTo(3, 9);
    expect(sdEllipsoidExact(vec3(0.5, 0, 0.5), 2, 2, 2)).toBeCloseTo(-(2 - Math.hypot(0.5, 0.5)), 9);
    const rnd = lcg(9);
    for (let i = 0; i < 500; i++) {
      const a = vec3((rnd() * 2 - 1) * 5, (rnd() * 2 - 1) * 3, (rnd() * 2 - 1) * 4);
      const b = vec3(a.x + (rnd() - 0.5) * 0.1, a.y + (rnd() - 0.5) * 0.1, a.z + (rnd() - 0.5) * 0.1);
      expect(Math.abs(sdEllipsoidExact(a, 3, 1, 2) - sdEllipsoidExact(b, 3, 1, 2))).toBeLessThanOrEqual(v3Distance(a, b) * 1.001);
    }
  });
});
