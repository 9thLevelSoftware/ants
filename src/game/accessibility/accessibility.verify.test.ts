// Independent verification of the accessibility numbers (reviewer's tests). Failing tests demonstrate real gaps.
import { describe, expect, it } from 'vitest';
import { planTransition } from '@/render/camera';
import type { CameraPose } from '@/render/camera';
import { motionPlan, resolveReducedMotion } from './motion';

const pose = (x: number): CameraPose => ({ pos: { x, y: 0, z: 0 }, look: { x, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 }, fov: 60, near: 0.1, far: 1000 });

describe('motion plan edge cases', () => {
  it('negative, infinite and NaN shake settings stay in 0..1', () => {
    expect(motionPlan(false, -50).shakeScale).toBe(0);
    expect(motionPlan(false, Infinity).shakeScale).toBe(1);
    expect(motionPlan(false, NaN).shakeScale).toBe(1);
    expect(motionPlan(true, NaN).shakeScale).toBe(0);
    for (const s of [-1, 0, 33, 100, 1e9]) for (const r of [true, false]) {
      const p = motionPlan(r, s);
      expect(p.swayScale).toBe(0);
      expect(p.dofStrength).toBeGreaterThan(0);
      expect(p.dofStrength).toBeLessThanOrEqual(1);
    }
  });

  it('an unknown choice string (old save) falls back to the device', () => {
    expect(resolveReducedMotion('bogus' as never, true)).toBe(true);
    expect(resolveReducedMotion('bogus' as never, false)).toBe(false);
  });
});

describe('GDD 08 App E 18 / 2.4: reduced-motion camera transition', () => {
  // GDD 08 2.4: "camera transitions become a 200 ms crossfade cut"; App E 18: "completes in <= 200 ms as a crossfade".
  // The task's acceptance 4 asks for instant transitions. The rigs plan a 0.3 s crossfade (render CAM_REDUCED_CROSSFADE_S),
  // and __game.a11y.state().camera.transition reports exactly this plan.
  it('is a crossfade of at most 200 ms', () => {
    const tr = planTransition(pose(0), pose(400), 4, true);
    expect(tr.kind).toBe('crossfade');
    expect(tr.duration).toBeLessThanOrEqual(0.2);
  });
});
