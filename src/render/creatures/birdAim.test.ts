// The bird's strike is moved to clear ground: the beak and head column never pass through a primitive (review finding:
// the beak speared a pot on the integrator's picture). The sim's aim is only the preferred spot.
import { describe, expect, it } from 'vitest';
import { clearAim, columnSpheres, freeCeiling, standHeight, strikeClear, type HardDistance } from './birdAim';
import { newBirdPose, birdPose } from './birdPose';
import type { BirdView } from './simAdapter';

/** Free distance to a vertical cylinder of radius r (mm) at (cx, cz), 60 mm tall, on flat ground at y = 0. */
const cylinder = (cx: number, cz: number, r: number): HardDistance => (x, y, z) => {
  const dr = Math.hypot(x - cx, z - cz) - r;
  const dy = y - 60;
  return dy > 0 ? Math.hypot(Math.max(dr, 0), dy) : dr;
};
const flat = () => 0;
const BEAK = 18;

describe('bird strike aim', () => {
  it('keeps the sim aim on open ground', () => {
    const hard = cylinder(500, 500, 10);
    const a = clearAim({ x: 0, z: 0 }, 0, BEAK, flat, hard);
    expect(a).toEqual({ x: 0, z: 0 });
  });

  it('moves a strike that would go through a prop to the nearest clear spot, which is clear', () => {
    const hard = cylinder(5, 0, 10); // the aim is 5 mm from the pot's axis: inside it
    expect(strikeClear(0, 0, 0, BEAK, hard)).toBe(false);
    const a = clearAim({ x: 0, z: 0 }, 0.3, BEAK, flat, hard);
    expect(a).not.toBeNull();
    expect(strikeClear(a!.x, a!.z, 0, BEAK, hard)).toBe(true);
    // every sphere of the beak and head column is outside the prop
    for (const [h, r] of columnSpheres(BEAK)) expect(hard(a!.x, h, a!.z)).toBeGreaterThanOrEqual(r);
    // nearest ring first: it did not jump to the farthest one
    expect(Math.hypot(a!.x, a!.z)).toBeLessThan(60);
  });

  it('returns null when every ring is blocked', () => {
    const wall: HardDistance = () => -1;
    expect(clearAim({ x: 0, z: 0 }, 0, BEAK, flat, wall)).toBeNull();
  });

  it('the pose follows the override aim', () => {
    const ev: BirdView = { variant: 'thrush', pos: { x: 100, y: 0, z: 100 }, phase: 'landed', startTick: 0, landTick: 30, endTick: 500, nextPeckTick: 80, peckAim: { x: 104, y: 0, z: 98 } };
    const p = birdPose(ev, 40, 0, newBirdPose(), { x: 130, y: 2, z: 90 });
    expect(p.beak.tip.x).toBe(130);
    expect(p.beak.tip.z).toBe(90);
    expect(p.beak.tip.y).toBeGreaterThanOrEqual(2);
  });
});

/** The real field never reports more than its hash margin: saturate a synthetic field the same way. */
const saturated = (hard: HardDistance, cap: number): HardDistance => (x, y, z) => Math.min(hard(x, y, z), cap);

describe('bird strike aim on a field that saturates at its margin (review finding 1)', () => {
  const CAP = 16; // Lasius niger: 4 BU x 4 mm
  it('open ground is clear although the head sphere is wider than the margin', () => {
    const hard = saturated(cylinder(5000, 5000, 10), CAP);
    expect(Math.max(...columnSpheres(BEAK).map(([, r]) => r))).toBeGreaterThan(CAP);
    expect(freeCeiling(hard, 0, 0)).toBe(CAP);
    expect(clearAim({ x: 0, z: 0 }, 0, BEAK, flat, hard)).toEqual({ x: 0, z: 0 });
  });

  it('a prop beside the aim still moves the strike, and the new spot clears the prop', () => {
    const raw = cylinder(5, 0, 10);
    const a = clearAim({ x: 0, z: 0 }, 0.3, BEAK, flat, saturated(raw, CAP));
    expect(a).not.toBeNull();
    expect(Math.hypot(a!.x - 5, a!.z)).toBeGreaterThan(10);
  });
});

describe('bird strike aim on a raised surface (review finding 2)', () => {
  /** A slab: top at y = 40 for x < 100 (a step down to the ground beyond), terrain 0 everywhere. */
  const slab: HardDistance = (x, y) => {
    const dx = x - 100, dy = y - 40;
    if (x < 100 && y < 40) return Math.max(dx, dy);
    return Math.hypot(Math.max(dx, 0), Math.max(dy, 0));
  };
  const hard = saturated(slab, 16);

  it('an aim on the slab is clear from the aim height, blocked from the terrain inside it', () => {
    expect(strikeClear(50, 0, 0, BEAK, hard, 16)).toBe(false);
    expect(clearAim({ x: 50, y: 40, z: 0 }, 0, BEAK, flat, hard)).toEqual({ x: 50, z: 0 });
  });

  it('standHeight finds the slab top by tracing down, the terrain beside it, and null inside', () => {
    expect(standHeight(50, 0, 70, flat, hard)).toBeCloseTo(40, 0);
    expect(standHeight(150, 0, 70, flat, hard)).toBe(0);
    expect(standHeight(50, 0, 20, flat, hard)).toBeNull();
  });

  it('a blocked aim beside the slab edge moves to clear ground, not into the slab', () => {
    // aim 3 mm from the edge on the ground: the head column would clip the slab, a ring point is clear
    const a = clearAim({ x: 103, y: 0, z: 0 }, 0, BEAK, flat, hard);
    expect(a).not.toBeNull();
    const y = standHeight(a!.x, a!.z, 70, flat, hard)!;
    expect(strikeClear(a!.x, a!.z, y, BEAK, hard, 16)).toBe(true);
  });
});
