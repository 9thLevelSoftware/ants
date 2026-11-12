// Adversarial review tests for hashGrid.ts and grid2d.ts (F1a review).
import { describe, expect, it } from 'vitest';
import { createGrid2DF32, grid2dGradient, grid2dSample, grid2dSet } from './grid2d';
import { HashGrid3 } from './hashGrid';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
}

describe('HashGrid3 (review)', () => {
  it('points exactly at distance r (computed as q +- r) are found for awkward cell sizes', () => {
    const rnd = lcg(5);
    const out: number[] = [];
    for (const cs of [0.1, 0.3, 1 / 3, 7.7, 1e-3]) {
      const g = new HashGrid3(cs, 6);
      for (let trial = 0; trial < 3000; trial++) {
        g.clear();
        const qx = (rnd() * 2 - 1) * 50 * cs, qy = (rnd() * 2 - 1) * 50 * cs, qz = (rnd() * 2 - 1) * 50 * cs;
        const r = rnd() * 3 * cs;
        const pts = [[qx - r, qy, qz], [qx + r, qy, qz], [qx, qy - r, qz], [qx, qy + r, qz], [qx, qy, qz - r], [qx, qy, qz + r]];
        for (let k = 0; k < 40; k++) pts.push([qx + (rnd() * 2 - 1) * 4 * cs, qy, qz]); // keep the cell path active
        pts.forEach((p, i) => g.insert(i, p[0], p[1], p[2]));
        g.queryRadius(qx, qy, qz, r, out);
        const expected = pts.filter((p) => (p[0] - qx) ** 2 + (p[1] - qy) ** 2 + (p[2] - qz) ** 2 <= r * r).length;
        expect(out.length).toBe(expected);
        g.queryBox(qx - r, qy - r, qz - r, qx + r, qy + r, qz + r, out);
        const expectedBox = pts.filter((p) => p[0] >= qx - r && p[0] <= qx + r && p[1] >= qy - r && p[1] <= qy + r && p[2] >= qz - r && p[2] <= qz + r).length;
        expect(out.length).toBe(expectedBox);
      }
    }
  });

  it('world-scale coordinates (0..36000 mm, ant-sized cells) match brute force', () => {
    const rnd = lcg(9);
    const g = new HashGrid3(16);
    const pts: number[][] = [];
    for (let i = 0; i < 2500; i++) pts.push([rnd() * 36000, rnd() * 200 - 100, rnd() * 36000]);
    pts.forEach((p, i) => g.insert(i, p[0], p[1], p[2]));
    const out: number[] = [];
    for (let q = 0; q < 200; q++) {
      const p = pts[(rnd() * pts.length) | 0];
      const r = rnd() * 800;
      g.queryRadius(p[0], p[1], p[2], r, out);
      const expected = pts.map((pp, i) => [pp, i] as const).filter(([pp]) => (pp[0] - p[0]) ** 2 + (pp[1] - p[1]) ** 2 + (pp[2] - p[2]) ** 2 <= r * r).map(([, i]) => i);
      expect([...out].sort((a, b) => a - b)).toEqual(expected);
    }
  });

  it('NaN positions and NaN queries never return garbage', () => {
    const g = new HashGrid3(10);
    g.insert(1, Number.NaN, 0, 0);
    g.insert(2, 0, 0, 0);
    const out: number[] = [];
    expect(g.queryRadius(0, 0, 0, 5, out)).toBe(1);
    expect(out).toEqual([2]);
    expect(g.queryRadius(Number.NaN, 0, 0, 5, out)).toBe(0);
    expect(g.queryRadius(0, 0, 0, Number.NaN, out)).toBe(0);
  });

  it('steady state reuses the out array (same identity, no reallocation of the result)', () => {
    const g = new HashGrid3(10);
    const out: number[] = [];
    for (let frame = 0; frame < 5; frame++) {
      g.clear();
      for (let i = 0; i < 300; i++) g.insert(i, i % 30, 0, Math.floor(i / 30));
      const ref = out;
      g.queryRadius(5, 0, 5, 20, out);
      expect(out).toBe(ref);
      expect(out.length).toBeGreaterThan(0);
    }
  });

  it('ids are stored exactly (large and negative ids round-trip)', () => {
    const g = new HashGrid3(10);
    g.insert(2 ** 40 + 3, 1, 1, 1);
    g.insert(-1, 2, 2, 2);
    const out: number[] = [];
    g.queryRadius(0, 0, 0, 10, out);
    expect(out.sort((a, b) => a - b)).toEqual([-1, 2 ** 40 + 3]);
  });
});

describe('grid2d (review)', () => {
  it('gradient matches central finite differences of sample inside the centre hull', () => {
    const rnd = lcg(2);
    const g = createGrid2DF32(7, 5, 4, -10, 3);
    for (let j = 0; j < 5; j++) for (let i = 0; i < 7; i++) grid2dSet(g, i, j, rnd() * 10 - 5);
    const out = { x: 0, z: 0 };
    const h = 1e-4;
    for (let k = 0; k < 500; k++) {
      // strictly inside the outer centres, away from cell-centre creases
      const x = -10 + 2 + rnd() * 24, z = 3 + 2 + rnd() * 16;
      const fu = ((x + 10) / 4 - 0.5) % 1, fv = ((z - 3) / 4 - 0.5) % 1;
      if (fu < 1e-3 || fu > 1 - 1e-3 || fv < 1e-3 || fv > 1 - 1e-3) continue;
      grid2dGradient(g, x, z, out);
      expect(out.x).toBeCloseTo((grid2dSample(g, x + h, z) - grid2dSample(g, x - h, z)) / (2 * h), 4);
      expect(out.z).toBeCloseTo((grid2dSample(g, x, z + h) - grid2dSample(g, x, z - h)) / (2 * h), 4);
    }
  });

  it('a 1x1 grid samples its only value everywhere and has zero gradient', () => {
    const g = createGrid2DF32(1, 1, 8);
    grid2dSet(g, 0, 0, 3.5);
    expect(grid2dSample(g, -100, 100)).toBe(3.5);
    expect(grid2dGradient(g, 4, 4, { x: 9, z: 9 })).toEqual({ x: 0, z: 0 });
  });
});
