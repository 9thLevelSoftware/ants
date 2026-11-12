import { describe, expect, it } from 'vitest';
import { cameraRelativeDir } from './cameraRelative';

const v = (x: number, y: number, z: number) => ({ x, y, z });
const n = (a: { x: number; y: number; z: number }) => { const l = Math.hypot(a.x, a.y, a.z); return v(a.x / l, a.y / l, a.z / l); };

describe('camera-relative movement mapping (GDD 01 §4.1)', () => {
  it('W walks where the camera looks, projected onto the ground', () => {
    const out = v(0, 0, 0);
    const mag = cameraRelativeDir(out, 0, 1, n(v(0, -0.5, -1)), v(0, 1, 0), v(0, 1, 0));
    expect(mag).toBe(1);
    expect(out.x).toBeCloseTo(0, 9); expect(out.y).toBeCloseTo(0, 9); expect(out.z).toBeCloseTo(-1, 9);
  });

  it('D walks to the right of the camera (forward x up = right, Y up)', () => {
    const out = v(0, 0, 0);
    cameraRelativeDir(out, 1, 0, v(0, 0, -1), v(0, 1, 0), v(0, 1, 0));
    expect(out.x).toBeCloseTo(1, 9); expect(out.z).toBeCloseTo(0, 9);
  });

  it('on a wall (ant up = +X) forward maps into the wall plane', () => {
    const out = v(0, 0, 0);
    cameraRelativeDir(out, 0, 1, n(v(-1, 0.6, 0)), v(0, 1, 0), v(1, 0, 0));
    expect(out.x).toBeCloseTo(0, 9);
    expect(out.y).toBeCloseTo(1, 9); // up the wall
  });

  it('looking straight down at the ant uses the camera up as screen-forward', () => {
    const out = v(0, 0, 0);
    cameraRelativeDir(out, 0, 1, v(0, -1, 0), v(0, 0, -1), v(0, 1, 0));
    expect(out.z).toBeCloseTo(-1, 9);
  });

  it('keeps the input magnitude (stick half way) and clamps above 1', () => {
    const out = v(0, 0, 0);
    expect(cameraRelativeDir(out, 0, 0.5, v(0, 0, -1), v(0, 1, 0), v(0, 1, 0))).toBeCloseTo(0.5, 9);
    expect(Math.hypot(out.x, out.y, out.z)).toBeCloseTo(0.5, 9);
    expect(cameraRelativeDir(out, 1, 1, v(0, 0, -1), v(0, 1, 0), v(0, 1, 0))).toBe(1);
    expect(cameraRelativeDir(out, 0, 0, v(0, 0, -1), v(0, 1, 0), v(0, 1, 0))).toBe(0);
  });
});
