// Review of int-1A-app: the follow-loss hold must survive the new stopFollow(), and following resumes cleanly.
import { describe, expect, it } from 'vitest';
import { vec3 } from '@/core';
import { OBS_PITCH_FOLLOW_DEG } from './constants';
import { ObserverRig } from './observerRig';
import { makeSphereTracer } from './sphereTrace';
import { DEMO_BU, demoGroundHeight } from './testing/demoField';

const env = { trace: makeSphereTracer(() => 1e6), groundHeight: demoGroundHeight };
const still = { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move: { x: 0, y: 0 }, vertical: 0, fast: false };

function elevationDeg(o: { pos: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } }): number {
  const dx = o.pos.x - o.look.x, dy = o.pos.y - o.look.y, dz = o.pos.z - o.look.z;
  return (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
}

describe('ObserverRig follow / stop / loss (review)', () => {
  it('setFollow(null) (the entity disappeared) still holds before free fly', () => {
    const r = new ObserverRig({ bu: DEMO_BU, worldSize: 1000 });
    r.setFollow({ pos: vec3(0, 10, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) });
    r.update(1 / 60, still, env);
    r.setFollow(null);
    expect(r.update(1 / 60, still, env).mode).toBe('hold');
  });

  it('stopFollow when not following is harmless, and a later follow starts above the subject', () => {
    const r = new ObserverRig({ bu: DEMO_BU, worldSize: 1000 });
    r.stopFollow();
    expect(r.update(1 / 60, still, env).mode).toBe('free');
    // free fly looking upwards first: the follow orbit must still clamp the camera into the GDD elevation band
    for (let i = 0; i < 120; i++) r.update(1 / 60, { ...still, pitchDeg: 5 }, env);
    r.setFollow({ pos: vec3(50, 10, 50), up: vec3(0, 1, 0), fwd: vec3(0, 0, 1) });
    const o = r.update(1 / 60, still, env);
    expect(o.mode).toBe('follow');
    const e = elevationDeg(o);
    expect(e).toBeGreaterThanOrEqual(OBS_PITCH_FOLLOW_DEG[0] - 1e-6);
    expect(e).toBeLessThanOrEqual(OBS_PITCH_FOLLOW_DEG[1] + 1e-6);
  });
});
