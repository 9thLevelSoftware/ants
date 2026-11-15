// The render-only leaf bend (leafBend.ts): capped in mm, margins toward the sky, tip down on a tilted leaf and up on
// a leaf lying flat, mirrored by the GLSL from the same constants.
import { describe, expect, it } from 'vitest';
import { LEAF_BEND, LEAF_BEND_GLSL, leafBendMm } from './leafBend';

describe('leafBendMm', () => {
  it('never moves any point of a leaf, however large, by more than the cap', () => {
    for (const [hx, hz] of [[5, 2], [40, 20], [120, 60]]) {
      for (const up of [-1, -0.5, 0.2, 0.93, 1]) {
        for (const t of [0, 0.5, 1]) for (const v of [-1, 0, 1]) {
          expect(Math.abs(leafBendMm(hx, hz, t * hx, v * hz, up))).toBeLessThanOrEqual(LEAF_BEND.maxMm + 1e-9);
        }
      }
    }
  });

  it('keeps the proportional curl on small leaves (below the cap)', () => {
    expect(leafBendMm(6, 3, 0, 3, 0.5)).toBeCloseTo(LEAF_BEND.cup * 3, 6);
    expect(leafBendMm(6, 3, 6, 0, 0.5)).toBeCloseTo(-LEAF_BEND.droop * 6, 6);
  });

  it('droops the tip of a tilted leaf and curls up the tip of a leaf lying flat, either face up', () => {
    expect(leafBendMm(30, 10, 30, 0, 0.6)).toBeLessThan(0);
    expect(leafBendMm(30, 10, 30, 0, 1)).toBeGreaterThan(0);
    // upside down and lying: local -y is the sky side, so the bend is negative in local y (upward in the world)
    expect(leafBendMm(30, 10, 30, 0, -1)).toBeLessThan(0);
    expect(leafBendMm(30, 10, 0, 10, -1)).toBeLessThan(0);
  });

  it('the GLSL uses the same constants', () => {
    for (const c of [LEAF_BEND.cup, LEAF_BEND.droop, LEAF_BEND.maxMm, LEAF_BEND.flatLo, LEAF_BEND.flatHi]) {
      expect(LEAF_BEND_GLSL).toContain(c.toFixed(3));
    }
  });
});
