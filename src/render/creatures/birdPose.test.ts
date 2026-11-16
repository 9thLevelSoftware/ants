// The bird event's visible part follows the event record (GDD 05 §2.6): the shadow sweeps in during the approach,
// the beak cocks before a peck, reaches the aim at the peck tick and recovers; nothing of the beak before landing.
import { describe, expect, it } from 'vitest';
import { BIRD_HEAD_COCK_S, BIRD_PECK_EVERY_S } from '@/sim/balance/creatures';
import { birdPose, newBirdPose } from './birdPose';
import type { BirdView } from './simAdapter';
import { BIRD_LOOK } from './tuning';

const ev = (o: Partial<BirdView>): BirdView => ({
  variant: 'thrush', pos: { x: 100, y: 0, z: 100 }, phase: 'landed', startTick: 0, landTick: 30, endTick: 500, nextPeckTick: 60, peckAim: { x: 104, y: 0, z: 98 }, ...o,
});

describe('birdPose', () => {
  it('approach: the shadow moves toward the landing point and darkens; no beak yet', () => {
    const a = birdPose(ev({ phase: 'approach' }), 3, 0, newBirdPose());
    const b = birdPose(ev({ phase: 'approach' }), 27, 0, newBirdPose());
    const d = (p: typeof a) => Math.hypot(p.shadow.x - 100, p.shadow.z - 100);
    expect(d(b)).toBeLessThan(d(a));
    expect(b.shadow.opacity).toBeGreaterThan(a.shadow.opacity);
    expect(a.beak.visible).toBe(false);
  });
  it('landed: beak rests high, cocks in the last head-cock window, hits the aim at the peck tick, recovers', () => {
    const every = BIRD_PECK_EVERY_S * 10, cock = BIRD_HEAD_COCK_S * 10;
    const rest = birdPose(ev({}), 60 - every + 8, 0, newBirdPose());
    expect(rest.beak.tip.y).toBeCloseTo(BIRD_LOOK.restHeightMm, 3);
    const cocked = birdPose(ev({}), 60 - cock / 2, 0, newBirdPose());
    expect(cocked.beak.tilt).toBeGreaterThan(0);
    const hit = birdPose(ev({ nextPeckTick: 60 + every }), 60 + BIRD_LOOK.strikeS * 10 * 0.999, 0, newBirdPose());
    expect(hit.beak.tip.y).toBeLessThan(0.5);
    expect(hit.beak.tip.x).toBe(104); expect(hit.beak.tip.z).toBe(98);
  });
  it('leaving: the shadow slides away and fades out', () => {
    const p = birdPose(ev({ phase: 'leaving', endTick: 120 }), 119.9, 0, newBirdPose());
    expect(p.shadow.opacity).toBeLessThan(0.05);
    expect(p.beak.visible).toBe(false);
  });
});
