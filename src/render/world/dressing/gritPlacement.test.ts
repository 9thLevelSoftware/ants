// Ground grit placement: world-anchored (camera moves never move a grain), matched to the ground material, sitting
// on the terrain the walker uses with a bounded rise, nearest-first under the quality cap.
import { describe, expect, it } from 'vitest';
import type { MaterialId } from '@/sim/types';
import { placeGrit, type GritGround } from './gritPlacement';
import { GRIT, GRIT_MAX_RISE_BU } from './tuning';

const ground = (mat: (x: number, z: number) => MaterialId | null, h = (x: number, z: number) => 0.01 * x + 0.02 * z): GritGround => ({
  bu: 4, materialAt: mat, heightAt: h,
});

describe('placeGrit', () => {
  it('is world-anchored: grains seen from two nearby foci are the same grains', () => {
    const g = ground(() => 'gravel');
    const a = placeGrit(g, 100, 100, 60, 100000), b = placeGrit(g, 120, 90, 60, 100000);
    const key = (q: { x: number; z: number }) => `${q.x.toFixed(4)},${q.z.toFixed(4)}`;
    const inB = new Set(b.map(key));
    // a grain inside both discs (away from both edges) exists in both lists
    const shared = a.filter((q) => Math.hypot(q.x - 120, q.z - 90) < 40 && q.d < 40);
    expect(shared.length).toBeGreaterThan(10);
    for (const q of shared) expect(inB.has(key(q))).toBe(true);
  });

  it('follows the ground material: gravel is dense and big, loam sparse and fine, water and holes bare', () => {
    const gravel = placeGrit(ground(() => 'gravel'), 0, 0, 80, 1e6);
    const loam = placeGrit(ground(() => 'loam'), 0, 0, 80, 1e6);
    const none = placeGrit(ground(() => null), 0, 0, 80, 1e6);
    const water = placeGrit(ground(() => 'water'), 0, 0, 80, 1e6);
    expect(gravel.length).toBeGreaterThan(loam.length * 2);
    expect(none.length).toBe(0);
    expect(water.length).toBe(0);
    const maxW = (l: typeof gravel) => Math.max(...l.filter((q) => q.d < 40).map((q) => q.sx * 2));
    expect(maxW(gravel)).toBeGreaterThan(4); // pea gravel: stones of an ant's size
    expect(maxW(loam)).toBeLessThanOrEqual(GRIT.loam!.sizeMm[1] + 1e-9);
  });

  it('never spills over a material border', () => {
    const g = ground((x) => (x < 0 ? 'gravel' : 'loam'));
    const grains = placeGrit(g, 0, 0, 60, 1e6);
    const gravelOnLoam = grains.filter((q) => q.x >= 0 && q.sx * 2 > GRIT.loam!.sizeMm[1] + 0.01);
    expect(gravelOnLoam.length).toBe(0);
  });

  it('sits on the terrain and protrudes at most GRIT_MAX_RISE_BU', () => {
    const g = ground(() => 'gravel');
    for (const q of placeGrit(g, 50, 50, 70, 1e6)) {
      const top = q.y + q.sy, h = g.heightAt(q.x, q.z);
      expect(top - h).toBeLessThanOrEqual(GRIT_MAX_RISE_BU * 4 + 1e-6);
      expect(q.y - q.sy).toBeLessThan(h - 0.2 * q.sy); // partly buried: no floating grain
    }
  });

  it('keeps the nearest grains under the cap and shrinks the outermost to nothing', () => {
    const all = placeGrit(ground(() => 'gravel'), 0, 0, 100, 1e6);
    const capped = placeGrit(ground(() => 'gravel'), 0, 0, 100, 300);
    expect(capped.length).toBe(300);
    expect(capped[299].d).toBeLessThanOrEqual(all[all.length - 1].d);
    for (let i = 1; i < capped.length; i++) expect(capped[i].d).toBeGreaterThanOrEqual(capped[i - 1].d);
    expect(capped[299].sx).toBeLessThan(0.05);
  });

  it('is deterministic', () => {
    const g = ground(() => 'humus');
    expect(placeGrit(g, 33, 44, 50, 500)).toEqual(placeGrit(g, 33, 44, 50, 500));
  });
});
