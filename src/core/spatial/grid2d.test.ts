import { describe, expect, it } from 'vitest';
import {
  createGrid2DF32, createGrid2DU8, grid2dCellX, grid2dCellZ, grid2dCenterX, grid2dCenterZ, grid2dFill, grid2dGet,
  grid2dGetWorld, grid2dGradient, grid2dInBounds, grid2dSample, grid2dSet,
} from './grid2d';

describe('grid2d', () => {
  it('maps world <-> cells with an origin, including negative coordinates', () => {
    const g = createGrid2DF32(10, 5, 4, -20, 100);
    expect(grid2dCellX(g, -20)).toBe(0);
    expect(grid2dCellX(g, -16.01)).toBe(0);
    expect(grid2dCellX(g, -16)).toBe(1);
    expect(grid2dCellX(g, -21)).toBe(-1);
    expect(grid2dCellZ(g, 119.9)).toBe(4);
    expect(grid2dCenterX(g, 0)).toBe(-18);
    expect(grid2dCenterZ(g, 2)).toBe(110);
    expect(grid2dCellX(g, grid2dCenterX(g, 7))).toBe(7);
    expect(grid2dInBounds(g, 9, 4)).toBe(true);
    expect(grid2dInBounds(g, 10, 4)).toBe(false);
    expect(grid2dInBounds(g, 0, -1)).toBe(false);
  });

  it('get clamps indices; set ignores out-of-bounds writes; layout is row-major in z', () => {
    const g = createGrid2DF32(3, 2, 1);
    grid2dSet(g, 2, 1, 7);
    grid2dSet(g, 5, 5, 99);
    grid2dSet(g, -1, 0, 99);
    expect(g.data[1 * 3 + 2]).toBe(7);
    expect(grid2dGet(g, 2, 1)).toBe(7);
    expect(grid2dGet(g, 50, 50)).toBe(7);
    expect(grid2dGet(g, -5, 0)).toBe(0);
    expect(Array.from(g.data)).toEqual([0, 0, 0, 0, 0, 7]);
    expect(grid2dGetWorld(g, 2.5, 1.5)).toBe(7);
  });

  it('bilinear sample hits cell centres exactly and interpolates linearly between them', () => {
    const g = createGrid2DF32(3, 3, 2); // centres at 1, 3, 5
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) grid2dSet(g, i, j, i * 10 + j * 100);
    expect(grid2dSample(g, 1, 1)).toBe(0);
    expect(grid2dSample(g, 3, 5)).toBe(210);
    expect(grid2dSample(g, 2, 1)).toBeCloseTo(5, 6);
    expect(grid2dSample(g, 2, 2)).toBeCloseTo(55, 6);
    expect(grid2dSample(g, 4.5, 3.5)).toBeCloseTo(17.5 + 125, 4);
  });

  it('sampling clamps beyond the outer centres (no extrapolation, no out-of-range reads)', () => {
    const g = createGrid2DF32(2, 2, 1);
    g.data.set([1, 2, 3, 4]);
    expect(grid2dSample(g, -100, -100)).toBe(1);
    expect(grid2dSample(g, 100, 100)).toBe(4);
    expect(grid2dSample(g, 0.2, 100)).toBe(3);
    const one = createGrid2DF32(1, 1, 5);
    one.data[0] = 9;
    expect(grid2dSample(one, 123, -4)).toBe(9);
  });

  it('gradient equals the analytic slope of a linear field and matches finite differences', () => {
    const g = createGrid2DF32(8, 6, 4, 10, -30);
    for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) grid2dSet(g, i, j, 3 * grid2dCenterX(g, i) - 2 * grid2dCenterZ(g, j));
    const out = { x: 0, z: 0 };
    grid2dGradient(g, 20, -15, out);
    expect(out.x).toBeCloseTo(3, 5);
    expect(out.z).toBeCloseTo(-2, 5);
    // non-linear field: compare with central differences inside a patch
    for (let j = 0; j < 6; j++) for (let i = 0; i < 8; i++) grid2dSet(g, i, j, Math.sin(i) * 5 + j * j);
    const h = 1e-3;
    for (const [x, z] of [[17, -19.3], [25.3, -11.2], [33.1, -5.5]]) { // not on a centre line (kinks there)
      grid2dGradient(g, x, z, out);
      expect(out.x).toBeCloseTo((grid2dSample(g, x + h, z) - grid2dSample(g, x - h, z)) / (2 * h), 2);
      expect(out.z).toBeCloseTo((grid2dSample(g, x, z + h) - grid2dSample(g, x, z - h)) / (2 * h), 2);
    }
  });

  it('gradient is zero along clamped axes and works on the last centre and on a Vec3 out', () => {
    const g = createGrid2DF32(4, 4, 1);
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) grid2dSet(g, i, j, i + 2 * j);
    const v = { x: 9, y: 9, z: 9 };
    grid2dGradient(g, -10, 2, v);
    expect(v.x).toBe(0);
    expect(v.z).toBeCloseTo(2, 6);
    expect(v.y).toBe(9); // untouched
    grid2dGradient(g, 3.5, 3.5, v); // exactly the last centre
    expect(v.x).toBeCloseTo(1, 6);
    expect(v.z).toBeCloseTo(2, 6);
  });

  it('uint8 grids store bytes; fill sets every cell', () => {
    const g = createGrid2DU8(4, 4, 2);
    grid2dFill(g, 200);
    expect(grid2dGet(g, 3, 3)).toBe(200);
    grid2dSet(g, 0, 0, 0);
    expect(grid2dSample(g, 2, 1)).toBeCloseTo(100, 6);
    grid2dSet(g, 1, 1, 256); // typed-array wrap-around, documented
    expect(grid2dGet(g, 1, 1)).toBe(0);
  });
});
