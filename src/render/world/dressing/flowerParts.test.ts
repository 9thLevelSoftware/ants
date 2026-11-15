// Flower heads from parts: every dressed kind yields its parts, deterministic per primitive, inside a sphere a
// little larger than the head, with orthonormal part frames; non-flower finishes are not dressed.
import { describe, expect, it } from 'vitest';
import type { Primitive } from '@/sim/types';
import { FINISH } from './finishes';
import { flowerHead, flowerParts, isFlowerFinish, PART_SHAPE } from './flowerParts';
import { FLOWER_PARTS } from './tuning';

const head = (finish: number, id = 7, rot = { x: 0, y: 0, z: 0, w: 1 }) => {
  const p: Primitive = { id, shape: 'ellipsoid', pos: { x: 100, y: 50, z: 200 }, rot, size: { x: 16, y: 6.4, z: 16 }, round: 0, material: 'plant', flags: 0, objectId: 1 };
  return flowerHead(p, finish, [0.9, 0.6, 0.02]);
};
const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const KINDS = [FINISH.daisy, FINISH.dandelion, FINISH.seedClock, FINISH.cloverHead, FINISH.umbel];

describe('flowerParts', () => {
  it('dresses exactly the flower-head finishes', () => {
    for (const f of KINDS) expect(isFlowerFinish(f)).toBe(true);
    for (const f of [FINISH.natural, FINISH.leaf, FINISH.stem, FINISH.metal, FINISH.fungus]) expect(isFlowerFinish(f)).toBe(false);
  });

  it('builds each kind from its own parts', () => {
    const count = (f: number, shape: number) => flowerParts(head(f), []).filter((p) => p.shape === shape).length;
    expect(count(FINISH.dandelion, PART_SHAPE.ligule)).toBeGreaterThan(FLOWER_PARTS.dandelion.outer * 3); // many florets, not a disc
    expect(count(FINISH.dandelion, PART_SHAPE.bract)).toBe(FLOWER_PARTS.dandelion.bracts);
    expect(count(FINISH.daisy, PART_SHAPE.petal)).toBe(FLOWER_PARTS.daisy.petals * 2);
    const clock = flowerParts(head(FINISH.seedClock), []);
    expect(clock.filter((p) => p.shape === PART_SHAPE.pappus).length).toBe(clock.filter((p) => p.shape === PART_SHAPE.beak).length);
    expect(clock.filter((p) => p.shape === PART_SHAPE.pappus).every((p) => p.disc)).toBe(true);
    expect(count(FINISH.cloverHead, PART_SHAPE.floret)).toBe(FLOWER_PARTS.clover.florets);
    expect(count(FINISH.umbel, PART_SHAPE.star)).toBe(FLOWER_PARTS.umbel.florets);
  });

  it('keeps every part near its head with an orthonormal frame, also for a tilted head', () => {
    const tilt = { x: Math.sin(0.2), y: 0, z: 0, w: Math.cos(0.2) };
    for (const f of KINDS) for (const h of [head(f), head(f, 9, tilt)]) {
      for (const p of flowerParts(h, [])) {
        const tipX = p.p[0] + p.dir[0] * p.len, tipY = p.p[1] + p.dir[1] * p.len, tipZ = p.p[2] + p.dir[2] * p.len;
        for (const [x, y, z] of [p.p, [tipX, tipY, tipZ]]) expect(Math.hypot(x - 100, y - 50, z - 200)).toBeLessThan(16 * 2.2);
        expect(Math.abs(Math.hypot(...p.dir) - 1)).toBeLessThan(1e-6);
        expect(Math.abs(Math.hypot(...p.nrm) - 1)).toBeLessThan(1e-6);
        expect(Math.abs(dot(p.dir, p.nrm))).toBeLessThan(1e-6);
        expect(p.len).toBeGreaterThan(0);
      }
    }
  });

  it('is deterministic per primitive and differs between primitives', () => {
    expect(flowerParts(head(FINISH.dandelion, 3), [])).toEqual(flowerParts(head(FINISH.dandelion, 3), []));
    expect(flowerParts(head(FINISH.dandelion, 3), [])).not.toEqual(flowerParts(head(FINISH.dandelion, 4), []));
  });
});
