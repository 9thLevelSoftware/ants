// Review of look-pass-3 (camera items, S10 slope lift and the stage1a tight room). Adversarial checks of ThirdPersonRig.
import { describe, expect, it } from 'vitest';
import { vec3 } from '@/core';
import { makeSphereTracer, type FieldFn } from './sphereTrace';
import { DEMO_BU } from './testing/demoField';
import { ThirdPersonRig } from './thirdPersonRig';
import { NO_ORBIT_INPUT, type CameraTarget } from './types';
import { DEG } from './frameMath';

const open = { trace: makeSphereTracer(() => 1e6) };

/** A standing ant on a slope rising toward +X, heading up or down it; the player yaws the camera by `yawDeg` first. */
function settledViewPitchDeg(slopeDeg: number, uphill: boolean, yawDeg: number): number {
  const r = new ThirdPersonRig({ bu: DEMO_BU, bodyL: 1, autoFollow: 'off' });
  const s = slopeDeg * DEG, sgn = uphill ? 1 : -1;
  const t: CameraTarget = { pos: vec3(0, 0.5, 0), up: vec3(-Math.sin(s), Math.cos(s), 0), fwd: vec3(sgn * Math.cos(s), sgn * Math.sin(s), 0) };
  let out = r.update(0, t, NO_ORBIT_INPUT, open);
  for (let i = 0; i < 30; i++) out = r.update(1 / 30, t, { yawDeg: yawDeg / 30, pitchDeg: 0, zoomLog: 0 }, open);
  for (let i = 0; i < 90; i++) out = r.update(1 / 30, t, NO_ORBIT_INPUT, open);
  const dx = out.look.x - out.pos.x, dy = out.look.y - out.pos.y, dz = out.look.z - out.pos.z;
  return Math.asin(dy / Math.hypot(dx, dy, dz)) / DEG;
}

describe('slope lift follows where the camera looks, not where the ant faces (look-pass-3 S10)', () => {
  it('an uphill ant seen from the front (camera uphill, looking down the slope) gets the same view as a downhill ant seen from behind', () => {
    // Same camera geometry in both cases: the camera stands uphill of the ant and looks down the slope. The rig's own rule is
    // "walking downhill adds nothing"; a camera that already looks down the slope must not be lifted further toward a top-down view.
    const frontOfClimber = settledViewPitchDeg(30, true, 180);
    const behindDescender = settledViewPitchDeg(30, false, 0);
    expect(Math.abs(frontOfClimber - behindDescender), `front of climber ${frontOfClimber.toFixed(1)} deg, behind descender ${behindDescender.toFixed(1)} deg`).toBeLessThan(5);
  });

  it('no NaN and a bounded view for a vertical climb and a straight-up heading', () => {
    for (const slope of [89.9, 90]) {
      const p = settledViewPitchDeg(slope, true, 0);
      expect(Number.isFinite(p), `slope ${slope}`).toBe(true);
      expect(Math.abs(p)).toBeLessThanOrEqual(90);
    }
  });
});

describe('tight room: the camera stays in free space (look-pass-3, stage1a strict)', () => {
  it('keeps f > 0 and f >= 0.5 x the reported radius in rooms from 0.4 to 3 mm high (queen, BU 4)', () => {
    for (const h of [0.4, 0.6, 0.8, 1.2, 2, 3]) {
      const slab: FieldFn = (_x, y) => Math.min(y, h - y);
      const env = { trace: makeSphereTracer(slab) };
      const r = new ThirdPersonRig({ bu: 4, bodyL: 2, autoFollow: 'off' });
      const t: CameraTarget = { pos: vec3(0, h / 2, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
      let out = r.update(0, t, NO_ORBIT_INPUT, env);
      for (let i = 0; i < 60; i++) {
        out = r.update(1 / 30, t, NO_ORBIT_INPUT, env);
        const f = slab(out.pos.x, out.pos.y, out.pos.z);
        expect(f, `room ${h} mm frame ${i}`).toBeGreaterThan(0);
        expect(f, `room ${h} mm frame ${i}: radius ${r.radiusMm}`).toBeGreaterThanOrEqual(0.5 * r.radiusMm - 1e-9);
        expect(out.near, `room ${h} mm: near plane`).toBeGreaterThan(0);
      }
    }
  });
});
