// Reviewer tests (render-ants): LOD selection and the hard cap policy at the edges.
import { describe, expect, it } from 'vitest';
import { selectLods, type SelectResult } from './select';

const S = { nearPx: 48, midPx: 22, farPx: 9, maxNear: 3, maxDrawn: 5 };

function run(px: number[], dist: number[], forced: number[], s = S) {
  const n = px.length;
  const out: SelectResult = { counts: [0, 0, 0, 0], dropped: 0, sorted: false };
  const lod = new Int8Array(n);
  selectLods(n, Float32Array.from(dist), Float32Array.from(px), Uint8Array.from(forced), s, lod, new Int32Array(n), out);
  return { lod: [...lod], out };
}

describe('selectLods verify', () => {
  it('n = 0 is a no-op', () => {
    const { out } = run([], [], []);
    expect(out.counts).toEqual([0, 0, 0, 0]);
    expect(out.dropped).toBe(0);
  });

  it('maxDrawn 0: only forced ants are drawn, at LOD0', () => {
    const { lod, out } = run([100, 5, 30], [1, 50, 10], [0, 1, 0], { ...S, maxDrawn: 0 });
    expect(lod).toEqual([-1, 0, -1]);
    expect(out.dropped).toBe(2);
  });

  it('two forced ants (possessed + a second flagged one) are both kept even past the caps', () => {
    const { lod } = run([1, 1, 200, 200], [900, 800, 1, 2], [1, 1, 0, 0], { ...S, maxDrawn: 1, maxNear: 1 });
    expect(lod[0]).toBe(0); expect(lod[1]).toBe(0);
    expect(lod[2]).toBe(-1); expect(lod[3]).toBe(-1);
  });

  it('drops the farthest first when over maxDrawn, keeps the nearest', () => {
    const px = [10, 10, 10, 10, 10, 10, 10, 10];
    const dist = [80, 10, 70, 20, 60, 30, 50, 40];
    const { lod, out } = run(px, dist, px.map(() => 0));
    expect(out.dropped).toBe(3);
    expect(lod.filter((l) => l < 0).length).toBe(3);
    for (const i of [0, 2, 4]) expect(lod[i]).toBe(-1); // distances 80, 70, 60
  });

  it('LOD0 overflow beyond maxNear demotes the farther ones to LOD1 (not dropped)', () => {
    const { lod, out } = run([60, 60, 60, 60, 60], [5, 4, 3, 2, 1], [0, 0, 0, 0, 0]);
    expect(out.counts[0]).toBe(3);
    expect(out.counts[1]).toBe(2);
    expect(lod[0]).toBe(1); expect(lod[1]).toBe(1);
  });

  it('threshold boundaries: exactly nearPx is LOD0, exactly farPx is LOD2, below is LOD3', () => {
    const { lod } = run([48, 22, 9, 8.99], [1, 2, 3, 4], [0, 0, 0, 0], { ...S, maxDrawn: 10, maxNear: 10 });
    expect(lod).toEqual([0, 1, 2, 3]);
  });
});
