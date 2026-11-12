import { describe, expect, it } from 'vitest';
import { HashGrid3 } from './hashGrid';

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

interface Pt { id: number; x: number; y: number; z: number }

function randomPoints(n: number, seed: number, lo: number, hi: number): Pt[] {
  const rnd = lcg(seed);
  return Array.from({ length: n }, (_, i) => ({ id: i * 3 + 7, x: lo + rnd() * (hi - lo), y: lo + rnd() * (hi - lo), z: lo + rnd() * (hi - lo) }));
}

function bruteRadius(pts: Pt[], x: number, y: number, z: number, r: number): number[] {
  return pts.filter((p) => (p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2 <= r * r).map((p) => p.id).sort((a, b) => a - b);
}

const sorted = (a: number[]) => [...a].sort((x, y) => x - y);

describe('HashGrid3', () => {
  it('queryRadius matches brute force on random points, including negative coordinates', () => {
    const pts = randomPoints(3000, 1, -500, 500);
    const grid = new HashGrid3(40, 8); // few buckets: forces hash collisions between cells
    for (const p of pts) grid.insert(p.id, p.x, p.y, p.z);
    expect(grid.count).toBe(3000);
    const rnd = lcg(2);
    const out: number[] = [];
    for (let q = 0; q < 300; q++) {
      const x = rnd() * 1200 - 600, y = rnd() * 1200 - 600, z = rnd() * 1200 - 600, r = rnd() * 120;
      const n = grid.queryRadius(x, y, z, r, out);
      expect(n).toBe(out.length);
      expect(sorted(out)).toEqual(bruteRadius(pts, x, y, z, r));
    }
  });

  it('queryBox matches brute force', () => {
    const pts = randomPoints(2000, 3, -300, 300);
    const grid = new HashGrid3(25);
    for (const p of pts) grid.insert(p.id, p.x, p.y, p.z);
    const rnd = lcg(4);
    const out: number[] = [];
    for (let q = 0; q < 200; q++) {
      const ax = rnd() * 700 - 350, ay = rnd() * 700 - 350, az = rnd() * 700 - 350;
      const bx = ax + rnd() * 150, by = ay + rnd() * 150, bz = az + rnd() * 150;
      grid.queryBox(ax, ay, az, bx, by, bz, out);
      const expected = pts.filter((p) => p.x >= ax && p.x <= bx && p.y >= ay && p.y <= by && p.z >= az && p.z <= bz).map((p) => p.id);
      expect(sorted(out)).toEqual(sorted(expected));
    }
    expect(grid.queryBox(5, 0, 0, 0, 1, 1, out)).toBe(0); // inverted box
  });

  it('huge radii fall back to a scan and still return exact results', () => {
    const pts = randomPoints(200, 5, -50, 50);
    const grid = new HashGrid3(1);
    for (const p of pts) grid.insert(p.id, p.x, p.y, p.z);
    const out: number[] = [];
    expect(grid.queryRadius(0, 0, 0, 1e6, out)).toBe(200);
    expect(grid.queryRadius(0, 0, 0, Infinity, out)).toBe(200);
    expect(sorted(out)).toEqual(sorted(pts.map((p) => p.id)));
    expect(grid.queryRadius(0, 0, 0, 30, out)).toBe(bruteRadius(pts, 0, 0, 0, 30).length);
  });

  it('points on cell boundaries and at the exact radius are found; negative radius finds nothing', () => {
    const grid = new HashGrid3(10);
    grid.insert(1, 0, 0, 0);
    grid.insert(2, 10, 0, 0); // exactly on a cell boundary
    grid.insert(3, -10, 0, 0);
    grid.insert(4, -0.0001, -0.0001, -0.0001);
    const out: number[] = [];
    grid.queryRadius(0, 0, 0, 10, out);
    expect(sorted(out)).toEqual([1, 2, 3, 4]);
    grid.queryRadius(5, 0, 0, 5, out);
    expect(sorted(out)).toEqual([1, 2]);
    expect(grid.queryRadius(0, 0, 0, -1, out)).toBe(0);
  });

  it('clear() empties the grid; reuse across many frames gives correct results', () => {
    const grid = new HashGrid3(20, 6);
    const out: number[] = [];
    for (let frame = 0; frame < 50; frame++) {
      grid.clear();
      expect(grid.count).toBe(0);
      expect(grid.queryRadius(0, 0, 0, 1000, out)).toBe(0);
      const pts = randomPoints(100 + frame, 100 + frame, -200, 200);
      for (const p of pts) grid.insert(p.id, p.x, p.y, p.z);
      grid.queryRadius(10, -20, 30, 60, out);
      expect(sorted(out)).toEqual(bruteRadius(pts, 10, -20, 30, 60));
    }
  });

  it('grows past its initial capacity and keeps earlier entries', () => {
    const grid = new HashGrid3(5, 4, 2);
    for (let i = 0; i < 1000; i++) grid.insert(i, i % 10, Math.floor(i / 10) % 10, Math.floor(i / 100));
    const out: number[] = [];
    expect(grid.queryBox(-1, -1, -1, 100, 100, 100, out)).toBe(1000);
    grid.queryRadius(0, 0, 0, 0, out);
    expect(out).toEqual([0]);
  });

  it('accepts a Vec3 centre and duplicates/coincident points', () => {
    const grid = new HashGrid3(10);
    grid.insert(5, 1, 1, 1);
    grid.insert(6, 1, 1, 1);
    const out: number[] = [];
    expect(grid.queryRadiusV({ x: 1, y: 1, z: 1 }, 0, out)).toBe(2);
    expect(() => new HashGrid3(0)).toThrow(RangeError);
  });
});
