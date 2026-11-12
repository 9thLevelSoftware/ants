import { describe, expect, it } from 'vitest';
import { sdRoundBox, v3Distance, v3Dot, v3Set, vec3 } from '@/core';
import { makeSphereTracer, type FieldFn } from './sphereTrace';
import { DEMO_BU, DEMO_PATH_DURATION, demoField, demoPathAt, demoTimeAtX, demoTimeOnWall, makeTargetObj } from './testing/demoField';
import { ThirdPersonRig } from './thirdPersonRig';
import { NO_ORBIT_INPUT, type CameraTarget } from './types';
import { DEG, rotateAboutAxis } from './frameMath';

const trace = makeSphereTracer(demoField);
const env = { trace };

function rig(autoFollow: 'off' | 'gentle' = 'off') {
  return new ThirdPersonRig({ bu: DEMO_BU, bodyL: 1, autoFollow });
}

describe('ThirdPersonRig collision', () => {
  it('never places the camera inside geometry along the whole demo path (open, wall, corridor)', () => {
    const r = rig('gentle');
    const t = makeTargetObj();
    const dt = 1 / 30;
    let minClear = Infinity;
    const states = new Set<string>();
    for (let time = 0; time < DEMO_PATH_DURATION * 0.98; time += dt) {
      demoPathAt(time, t);
      // a little player orbit input now and then to exercise the collision from many directions
      const yaw = Math.sin(time * 0.7) * 2;
      const out = r.update(dt, t, { yawDeg: yaw, pitchDeg: Math.cos(time * 0.5), zoomLog: 0 }, env);
      states.add(out.state);
      const f = demoField(out.pos.x, out.pos.y, out.pos.z);
      minClear = Math.min(minClear, f);
      expect(f, `t=${time.toFixed(2)} state=${out.state}`).toBeGreaterThanOrEqual(r.radiusMm * 0.5);
      expect(Number.isFinite(out.pos.x + out.pos.y + out.pos.z)).toBe(true);
    }
    expect(states.has('open')).toBe(true);
    expect(states.has('tunnel') || states.has('crevice')).toBe(true);
    expect(minClear).toBeGreaterThan(0);
  });

  it('pulls in inside the corridor and widens the FOV', () => {
    const r = rig();
    const t = makeTargetObj();
    const t0 = demoTimeAtX(150), t1 = demoTimeAtX(215);
    let out = r.update(0, demoPathAt(t0, t), NO_ORBIT_INPUT, env);
    const openDist = out.desired;
    const openFov = out.fov;
    for (let time = t0; time < t1; time += 1 / 30) out = r.update(1 / 30, demoPathAt(time, t), NO_ORBIT_INPUT, env);
    expect(out.state === 'tunnel' || out.state === 'crevice').toBe(true);
    expect(out.distance).toBeLessThan(openDist * 0.7);
    expect(out.fov).toBeGreaterThan(openFov);
    // camera behind the ant inside the channel (|z| <= 4 mm, below the 8 mm roof)
    expect(Math.abs(out.pos.z)).toBeLessThan(4);
    expect(out.pos.y).toBeLessThan(8);
    expect(out.pos.x).toBeLessThan(t.pos.x);
  });

  it('pull-in is immediate when geometry comes between pivot and camera', () => {
    const r = rig();
    // target in the open, facing +X towards the wall from 30 mm away, camera orbited to look from the wall side
    const t: CameraTarget = { pos: vec3(85, 0.5, 0), up: vec3(0, 1, 0), fwd: vec3(-1, 0, 0) };
    let out = r.update(0, t, NO_ORBIT_INPUT, env);
    for (let i = 0; i < 30; i++) out = r.update(1 / 30, t, NO_ORBIT_INPUT, env);
    expect(out.pos.x).toBeLessThan(100); // camera would be inside the wall (x >= 100) without collision
    expect(demoField(out.pos.x, out.pos.y, out.pos.z)).toBeGreaterThanOrEqual(r.radiusMm * 0.5);
  });
});

describe('ThirdPersonRig frame', () => {
  it('preserves the orbit yaw relative to the heading across a 90 degree up change', () => {
    const r = rig('off');
    const floor: CameraTarget = { pos: vec3(0, 0.5, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
    r.update(0, floor, NO_ORBIT_INPUT, env);
    // orbit the view 30 degrees to the right
    r.update(1 / 60, floor, { yawDeg: 30, pitchDeg: 0, zoomLog: 0 }, env);
    for (let i = 0; i < 60; i++) r.update(1 / 60, floor, NO_ORBIT_INPUT, env);
    const before = r.yawFromBehind(floor);
    expect(before / DEG).toBeCloseTo(-30, 1);
    // the ant climbs a wall: up -X, heading +Y (same rotation applied to up and heading)
    const wall: CameraTarget = { pos: vec3(0, 0.5, 0), up: vec3(-1, 0, 0), fwd: vec3(0, 1, 0) };
    // move it gradually like the walker would
    for (let i = 1; i <= 20; i++) {
      const a = (i / 20) * 90 * DEG;
      const up = rotateAboutAxis(vec3(), vec3(0, 1, 0), vec3(0, 0, 1), a);
      const fwd = rotateAboutAxis(vec3(), vec3(1, 0, 0), vec3(0, 0, 1), a);
      r.update(1 / 60, { pos: wall.pos, up, fwd }, NO_ORBIT_INPUT, env);
    }
    for (let i = 0; i < 240; i++) r.update(1 / 60, wall, NO_ORBIT_INPUT, env);
    expect(r.yawFromBehind(wall) / DEG).toBeCloseTo(before / DEG, 1);
  });

  it('smoothing converges for a still target (up, position)', () => {
    const r = rig('gentle');
    const t: CameraTarget = { pos: vec3(-40, 0.5, 0), up: vec3(0, 1, 0), fwd: vec3(0, 0, 1) };
    r.update(0, t, NO_ORBIT_INPUT, env);
    const tilted: CameraTarget = { pos: t.pos, up: rotateAboutAxis(vec3(), vec3(0, 1, 0), vec3(1, 0, 0), 0.6), fwd: t.fwd };
    let prev = vec3();
    let step = Infinity;
    for (let i = 0; i < 400; i++) {
      const o = r.update(1 / 60, tilted, NO_ORBIT_INPUT, env);
      step = v3Distance(prev, o.pos);
      prev = vec3(o.pos.x, o.pos.y, o.pos.z);
    }
    expect(step).toBeLessThan(1e-4);
    expect(v3Dot(r.out.up, tilted.up)).toBeGreaterThan(0.9999);
  });

  it('auto-follow swings behind a moving ant, never during manual orbit', () => {
    const r = rig('gentle');
    const t: CameraTarget = { pos: vec3(-50, 0.5, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
    r.update(0, t, NO_ORBIT_INPUT, env);
    r.update(1 / 60, t, { yawDeg: 60, pitchDeg: 0, zoomLog: 0 }, env);
    for (let i = 0; i < 60 * 6; i++) {
      t.pos.x += (6 * DEMO_BU) / 60; // 6 BU/s
      r.update(1 / 60, t, NO_ORBIT_INPUT, env);
    }
    expect(Math.abs(r.yawFromBehind(t) / DEG)).toBeLessThan(5);
  });

  it('recentre puts the camera behind within 0.3 s and zoom is clamped per state', () => {
    const r = rig('off');
    const t: CameraTarget = { pos: vec3(-50, 0.5, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
    r.update(0, t, NO_ORBIT_INPUT, env);
    r.update(1 / 60, t, { yawDeg: 90, pitchDeg: 0, zoomLog: 0 }, env);
    r.update(1 / 60, t, { yawDeg: 0, pitchDeg: 0, zoomLog: 0, recentre: true }, env);
    for (let i = 0; i < 20; i++) r.update(1 / 60, t, NO_ORBIT_INPUT, env);
    expect(Math.abs(r.yawFromBehind(t))).toBeLessThan(1e-6);
    for (let i = 0; i < 50; i++) r.update(1 / 60, t, { yawDeg: 0, pitchDeg: 0, zoomLog: 1 }, env);
    expect(r.out.desired).toBeLessThanOrEqual(18 * DEMO_BU + 1e-9);
  });

  it('fades the target when the camera is very close and reports the wall state as open', () => {
    const r = rig('off');
    const t = makeTargetObj();
    const tw = demoTimeOnWall();
    let out = r.update(0, demoPathAt(tw - 1, t), NO_ORBIT_INPUT, env);
    for (let time = tw - 1; time < tw; time += 1 / 30) out = r.update(1 / 30, demoPathAt(time, t), NO_ORBIT_INPUT, env);
    expect(out.state).toBe('open');
    expect(out.up.x).toBeLessThan(-0.9); // camera up follows the wall normal
    expect(out.fade.target).toBeGreaterThan(0);
    expect(out.fade.target).toBeLessThanOrEqual(1);
    expect(out.near).toBeLessThanOrEqual(r.radiusMm * 0.25 + 1e-9);
  });
});

describe('ThirdPersonRig clearance (GDD 6.1: f >= 0.5 R on every frame)', () => {
  /** The target walks over a thin plate, round its edge and back along the underside. */
  function wrapAroundPlate(bodyL: number, foot: number, thickness: number, speedBU: number): number {
    const plate: FieldFn = (x, y, z) => sdRoundBox({ x: x + 100, y: y - 10 - thickness / 2, z }, { x: 100, y: thickness / 2, z: 50 }, 0);
    const tr = makeSphereTracer(plate);
    const r = new ThirdPersonRig({ bu: DEMO_BU, bodyL });
    const t: CameraTarget = { pos: vec3(), up: vec3(), fwd: vec3() };
    const top = 10 + thickness, mid = 10 + thickness / 2, R0 = thickness / 2 + foot;
    let worst = Infinity;
    for (let time = 0; time < 6; time += 1 / 60) {
      const s = time * speedBU * DEMO_BU;
      if (s < 40) { v3Set(t.pos, -40 + s, top + foot, 0); v3Set(t.up, 0, 1, 0); v3Set(t.fwd, 1, 0, 0); }
      else if (s < 40 + Math.PI * R0) {
        const a = Math.PI / 2 - (s - 40) / R0;
        v3Set(t.up, Math.cos(a), Math.sin(a), 0); v3Set(t.pos, R0 * t.up.x, mid + R0 * t.up.y, 0); v3Set(t.fwd, Math.sin(a), -Math.cos(a), 0);
      } else { v3Set(t.pos, -(s - 40 - Math.PI * R0), 10 - foot, 0); v3Set(t.up, 0, -1, 0); v3Set(t.fwd, -1, 0, 0); }
      const o = r.update(1 / 60, t, NO_ORBIT_INPUT, { trace: tr });
      worst = Math.min(worst, plate(o.pos.x, o.pos.y, o.pos.z) / r.radiusMm);
    }
    return worst;
  }

  it('worker and queen wrapping round thin plates at walking and hurry speed', () => {
    for (const bodyL of [1, 2]) {
      for (const thickness of [1, 2, 4]) {
        for (const speed of [6, 12, 24]) {
          // sim footOffset is 0.15 BU; 0.6 BU is a generous upper bound
          for (const foot of [0.15 * DEMO_BU, 0.6]) {
            expect(wrapAroundPlate(bodyL, foot, thickness, speed), `bodyL=${bodyL} plate=${thickness} speed=${speed} foot=${foot}`).toBeGreaterThanOrEqual(0.5);
          }
        }
      }
    }
  });

  it('a queen (bodyL 2) on the demo path with orbit input keeps the clearance', () => {
    const r = new ThirdPersonRig({ bu: DEMO_BU, bodyL: 2 });
    const t = makeTargetObj();
    for (let time = 0; time < DEMO_PATH_DURATION * 0.98; time += 1 / 30) {
      demoPathAt(time, t);
      const o = r.update(1 / 30, t, { yawDeg: Math.sin(time) * 4, pitchDeg: Math.cos(time * 0.7) * 2, zoomLog: 0 }, env);
      expect(demoField(o.pos.x, o.pos.y, o.pos.z), `t=${time.toFixed(2)} ${o.state}`).toBeGreaterThanOrEqual(r.radiusMm * 0.5);
    }
  });
});
