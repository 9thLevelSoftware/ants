import { describe, expect, it } from 'vitest';
import { selectLods, type SelectResult } from './select';

const S = { nearPx: 48, midPx: 22, farPx: 9, maxNear: 3, maxDrawn: 5 };
function run(px: number[], dist: number[], forcedIdx = -1, s = S) {
  const n = px.length;
  const f = new Uint8Array(n); if (forcedIdx >= 0) f[forcedIdx] = 1;
  const lod = new Int8Array(n); const order = new Int32Array(n);
  const r: SelectResult = { counts: [0, 0, 0, 0], dropped: 0, sorted: false };
  selectLods(n, Float32Array.from(dist), Float32Array.from(px), f, s, lod, order, r);
  return { lod: [...lod], r };
}

describe('selectLods', () => {
  it('buckets by projected size without sorting when no cap is hit', () => {
    const { lod, r } = run([100, 30, 10, 2], [1, 2, 3, 4]);
    expect(lod).toEqual([0, 1, 2, 3]);
    expect(r.sorted).toBe(false);
  });
  it('caps LOD0 to the nearest maxNear ants', () => {
    const { lod } = run([90, 80, 70, 60, 50], [5, 4, 3, 2, 1], -1, { ...S, maxDrawn: 10 });
    expect(lod).toEqual([1, 1, 0, 0, 0]);
  });
  it('drops the farthest beyond maxDrawn but never the possessed ant', () => {
    const px = [5, 5, 5, 5, 5, 5, 5, 1];
    const dist = [1, 2, 3, 4, 5, 6, 7, 100];
    const { lod, r } = run(px, dist, 7);
    expect(lod[7]).toBe(0); // forced: drawn and LOD0 although far and tiny
    expect(r.dropped).toBe(3);
    expect(lod.filter((l) => l >= 0).length).toBe(5);
    expect(lod.slice(4, 7)).toEqual([-1, -1, -1]);
  });
  it('the possessed ant takes LOD0 even when the near cap is full', () => {
    const { lod } = run([90, 90, 90, 90, 90], [1, 2, 3, 4, 50], 4, { ...S, maxDrawn: 10 });
    expect(lod[4]).toBe(0);
    expect(lod.filter((l) => l === 0).length).toBe(3);
  });
});
