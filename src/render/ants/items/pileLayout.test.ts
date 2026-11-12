import { describe, expect, it } from 'vitest';
import { PileLayout, type Footprint } from './pileLayout';

interface Placed { x: number; y: number; z: number; f: Footprint }

function overlaps(a: Placed, b: Placed): boolean {
  return Math.abs(a.x - b.x) < (a.f.x + b.f.x) / 2 - 1e-9 && Math.abs(a.z - b.z) < (a.f.z + b.f.z) / 2 - 1e-9
    && Math.abs(a.y - b.y) < (a.f.y + b.f.y) / 2 * 0.9 - 1e-9;
}

function layOut(points: [number, number, number][], f: Footprint): Placed[] {
  const L = new PileLayout(); L.begin(Math.max(f.x, f.z));
  return points.map(([x, y, z]) => { L.place(x, y, z, f); return { x: L.out.x, y: L.out.y, z: L.out.z, f }; });
}

function noOverlap(list: Placed[]): boolean {
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) if (overlaps(list[i]!, list[j]!)) return false;
  return true;
}

describe('PileLayout', () => {
  const pupa: Footprint = { x: 2.4, y: 2.0, z: 7 }; // Messor naked pupa, 7 mm long

  it('spreads a whole pile placed at one point without any two items overlapping', () => {
    const pts: [number, number, number][] = Array.from({ length: 60 }, () => [10, 0, 5]);
    const out = layOut(pts, pupa);
    expect(noOverlap(out)).toBe(true);
    expect(out.every((p) => p.y === 0)).toBe(true); // 60 fit flat around the spot
    const r = Math.max(...out.map((p) => Math.hypot(p.x - 10, p.z - 5)));
    expect(r).toBeLessThan(40); // compact: a pile, not a scatter
  });

  it('separates items lying a little apart, across grid-cell borders', () => {
    const pts: [number, number, number][] = [];
    for (let i = 0; i < 40; i++) pts.push([((i * 37) % 11) * 0.7 - 3.5, 0, ((i * 53) % 13) * 0.9 - 6]);
    expect(noOverlap(layOut(pts, pupa))).toBe(true);
  });

  it('keeps an item where it lies when its spot is free', () => {
    const out = layOut([[0, 0, 0], [20, 0, 0], [0, 0, 20]], pupa);
    expect(out.map((p) => [p.x, p.z])).toEqual([[0, 0], [20, 0], [0, 20]]);
  });

  it('items on different floors do not push each other', () => {
    const out = layOut([[0, 0, 0], [0, 30, 0]], pupa);
    expect(out[1]).toMatchObject({ x: 0, y: 30, z: 0 });
  });
});
