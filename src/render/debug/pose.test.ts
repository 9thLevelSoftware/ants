import { describe, expect, it } from 'vitest';
import { Matrix4, Vector3 } from 'three';
import { interpolateWalker, newPose, poseMatrix } from './pose';

describe('debug pose helpers', () => {
  it('poseMatrix: columns are fwd, up, right (fwd x up) scaled, origin lifted along up', () => {
    const m = poseMatrix(new Matrix4(), { pos: { x: 1, y: 2, z: 3 }, up: { x: 0, y: 0, z: 2 }, fwd: { x: 1, y: 0, z: 0.3 } }, 0.5, 4);
    const x = new Vector3(), y = new Vector3(), z = new Vector3();
    m.extractBasis(x, y, z);
    expect(x.toArray().map((v) => +v.toFixed(9))).toEqual([4, 0, 0]);
    expect(y.toArray().map((v) => +v.toFixed(9))).toEqual([0, 0, 4]);
    expect(z.toArray().map((v) => +v.toFixed(9))).toEqual([0, -4, 0]); // (1,0,0) x (0,0,1) = (0,-1,0)
    expect(new Vector3().setFromMatrixPosition(m).toArray()).toEqual([1, 2, 3.5]);
    expect(m.determinant()).toBeGreaterThan(0); // right-handed, no mirroring
  });

  it('poseMatrix survives a forward parallel to up', () => {
    const m = poseMatrix(new Matrix4(), { pos: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 0, y: 1, z: 0 } }, 0, 1);
    expect(Number.isFinite(m.determinant())).toBe(true);
    expect(m.determinant()).toBeCloseTo(1, 9);
  });

  it('interpolates prev -> current and snaps long jumps', () => {
    const w = { pos: { x: 10, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, fwd: { x: 1, y: 0, z: 0 }, prevPos: { x: 8, y: 0, z: 0 }, prevUp: { x: 0, y: 1, z: 0 }, prevFwd: { x: 1, y: 0, z: 0 } };
    expect(interpolateWalker(newPose(), w, 0.25, 100).pos.x).toBeCloseTo(8.5, 9);
    expect(interpolateWalker(newPose(), w, 0.25, 1).pos.x).toBe(10);
  });
});
