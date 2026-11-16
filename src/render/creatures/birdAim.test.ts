// The bird's strike is moved to clear ground: the beak and head column never pass through a primitive (review finding:
// the beak speared a pot on the integrator's picture). The sim's aim is only the preferred spot.
import { describe, expect, it } from 'vitest';
import { clearAim, columnSpheres, strikeClear, type HardDistance } from './birdAim';
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
