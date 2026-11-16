// The save meta's observer camera is a view hint: a damaged one is dropped on load, never handed to the camera rig.
import { describe, expect, it } from 'vitest';
import { savedCameraOf } from './meta';

const P = { x: 1, y: 2, z: 3 }, L = { x: 101, y: 2, z: 3 };

describe('savedCameraOf', () => {
  it('returns a well-formed camera as a copy', () => {
    const c = savedCameraOf({ camera: { pos: P, look: L } });
    expect(c).toEqual({ pos: P, look: L });
    expect(c?.pos).not.toBe(P);
  });

  it.each([
    ['missing', undefined],
    ['not an object', 'x'],
    ['empty', {}],
    ['a string coordinate', { pos: { x: 'a', y: 1, z: 2 }, look: L }],
    ['a NaN coordinate', { pos: P, look: { x: NaN, y: 0, z: 0 } }],
    ['an infinite coordinate', { pos: { x: Infinity, y: 0, z: 0 }, look: L }],
    ['a missing look', { pos: P }],
    ['pos equal to look', { pos: P, look: { ...P } }],
  ])('drops a camera that is %s', (_name, camera) => {
    expect(savedCameraOf({ camera: camera as never })).toBeNull();
  });
});
