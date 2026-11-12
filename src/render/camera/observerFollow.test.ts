// int-1A: the observer's follow-orbit elevation (GDD 01 6.6: -10..85 degrees above the subject) and the player's
// "stop following" (no follow-loss hold).
import { describe, expect, it } from 'vitest';
import { vec3 } from '@/core';
import { OBS_PITCH_FOLLOW_DEG } from './constants';
import { ObserverRig } from './observerRig';
import { makeSphereTracer } from './sphereTrace';
import { DEMO_BU, demoGroundHeight } from './testing/demoField';

// open air everywhere: only the orbit maths matter here
const trace = makeSphereTracer(() => 1e6);
const env = { trace, groundHeight: demoGroundHeight };
const still = { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move: { x: 0, y: 0 }, vertical: 0, fast: false };
const target = { pos: vec3(0, 10, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };

function elevationDeg(o: { pos: { x: number; y: number; z: number }; look: { x: number; y: number; z: number } }): number {
  const dx = o.pos.x - o.look.x, dy = o.pos.y - o.look.y, dz = o.pos.z - o.look.z;
  return (Math.atan2(dy, Math.hypot(dx, dz)) * 180) / Math.PI;
}

describe('ObserverRig follow orbit', () => {
  it('starts above the subject and keeps the elevation within the GDD range when pitched either way', () => {
    const r = new ObserverRig({ bu: DEMO_BU, worldSize: 1000 });
    r.setFollow(target);
    let o = r.update(1 / 60, still, env);
    expect(o.mode).toBe('follow');
    expect(elevationDeg(o)).toBeGreaterThan(0); // the default look pitch is downwards: camera above
    for (let i = 0; i < 200; i++) o = r.update(1 / 60, { ...still, pitchDeg: -5 }, env);
    expect(elevationDeg(o)).toBeCloseTo(OBS_PITCH_FOLLOW_DEG[1], 3);
    for (let i = 0; i < 200; i++) o = r.update(1 / 60, { ...still, pitchDeg: 5 }, env);
    expect(elevationDeg(o)).toBeCloseTo(OBS_PITCH_FOLLOW_DEG[0], 3);
  });

  it('stopFollow switches to free fly at once (no 2 s hold), from the current pose', () => {
    const r = new ObserverRig({ bu: DEMO_BU, worldSize: 1000 });
    r.setFollow(target);
    const f = r.update(1 / 60, still, env);
    const at = { ...f.pos };
    r.stopFollow();
    const o = r.update(1 / 60, still, env);
    expect(o.mode).toBe('free');
    expect(Math.hypot(o.pos.x - at.x, o.pos.y - at.y, o.pos.z - at.z)).toBeLessThan(1e-6);
    // a pose set right after stopping is kept (the old run-out of the hold could overwrite it)
    r.setPose(vec3(100, 200, 100), vec3(0, 0, 0));
    expect(r.update(1 / 60, still, env).pos.x).toBeCloseTo(100, 6);
  });
});
