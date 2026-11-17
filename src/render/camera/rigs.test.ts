import { describe, expect, it } from 'vitest';
import { vec3 } from '@/core';
import { ColonyRig } from './colonyRig';
import { ObserverRig } from './observerRig';
import { fNumberAt, fovForFocal, PhotoRig } from './photoRig';
import { makeSphereTracer } from './sphereTrace';
import { DEMO_BU, demoField, demoGroundHeight } from './testing/demoField';
import { CameraTransition, planTransition, poseDistance } from './transition';
import { makePose, type CameraPose } from './types';

const trace = makeSphereTracer(demoField);
const NO = { yawDeg: 0, pitchDeg: 0, zoomLog: 0 };

function pose(x: number, y: number, z: number, lx: number, ly: number, lz: number, fov = 60): CameraPose {
  const p = makePose();
  p.pos = vec3(x, y, z); p.look = vec3(lx, ly, lz); p.fov = fov; p.near = 0.2; p.far = 1000;
  return p;
}

describe('CameraTransition', () => {
  it('blends monotonically towards the destination', () => {
    const a = pose(0, 50, 100, 0, 0, 0, 60);
    const b = pose(120, 20, -30, 100, 0, 0, 45);
    const tr = new CameraTransition();
    const plan = planTransition(a, b, DEMO_BU, false);
    expect(plan.kind).toBe('fly');
    tr.start(a, plan);
    let prevTo = poseDistance(a, b), prevFrom = 0, prevFov = 60;
    let frames = 0;
    while (!tr.out.done || frames === 0) {
      const o = tr.update(1 / 60, b);
      const dTo = poseDistance(o.pose, b), dFrom = poseDistance(o.pose, a);
      expect(dTo).toBeLessThanOrEqual(prevTo + 1e-9);
      expect(dFrom).toBeGreaterThanOrEqual(prevFrom - 1e-9);
      expect(o.pose.fov).toBeLessThanOrEqual(prevFov + 1e-9);
      prevTo = dTo; prevFrom = dFrom; prevFov = o.pose.fov;
      frames++;
      if (frames > 600) throw new Error('transition never finished');
    }
    expect(prevTo).toBeLessThan(1e-9);
    expect(frames / 60).toBeCloseTo(plan.duration, 1);
  });

  it('long hops dip-fade, reduced motion cross-fades, durations follow the GDD law', () => {
    const a = pose(0, 0, 0, 0, 0, -1), near = pose(30 * DEMO_BU, 0, 0, 0, 0, -1), far = pose(400 * DEMO_BU, 0, 0, 0, 0, -1);
    expect(planTransition(a, near, DEMO_BU, false).duration).toBeCloseTo(0.5, 6);
    expect(planTransition(a, far, DEMO_BU, false).kind).toBe('dip');
    expect(planTransition(a, near, DEMO_BU, true)).toEqual({ kind: 'crossfade', duration: 0.2 });
    const tr = new CameraTransition();
    tr.start(a, planTransition(a, far, DEMO_BU, false));
    let peak = 0;
    for (let i = 0; i < 30; i++) peak = Math.max(peak, tr.update(1 / 60, far).dip);
    expect(peak).toBeGreaterThan(0.9);
    expect(tr.out.dip).toBe(0);
  });
});

describe('ObserverRig', () => {
  it('flies, respects bounds and altitude, never enters solid', () => {
    const r = new ObserverRig({ bu: DEMO_BU, worldSize: 400 });
    r.setPose(vec3(20, 30, 0), vec3(110, 20, 0));
    const env = { trace, groundHeight: demoGroundHeight };
    // fly forward into the wall, then down into the ground, for a few seconds
    for (let i = 0; i < 180; i++) {
      const o = r.update(1 / 60, { ...NO, move: { x: 0, y: 1 }, vertical: i > 90 ? -1 : 0, fast: true }, env);
      expect(demoField(o.pos.x, o.pos.y, o.pos.z)).toBeGreaterThanOrEqual(r.radiusMm * 0.5);
    }
    r.setPose(vec3(390, 40, 390), vec3(500, 40, 500));
    for (let i = 0; i < 600; i++) r.update(1 / 60, { ...NO, move: { x: 0, y: 1 }, vertical: 1, fast: true }, env);
    expect(r.pos.x).toBeLessThanOrEqual(400 + 50 * DEMO_BU);
    expect(r.pos.y).toBeLessThanOrEqual(1200 * DEMO_BU + 1e-6);
  });

  it('follows an entity and holds 2 s after losing it', () => {
    const r = new ObserverRig({ bu: DEMO_BU, worldSize: 400 });
    const env = { trace, groundHeight: demoGroundHeight };
    r.setFollow({ pos: vec3(-30, 0.5, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) });
    let o = r.update(1 / 60, { ...NO, move: { x: 0, y: 0 }, vertical: 0, fast: false }, env);
    expect(o.mode).toBe('follow');
    expect(o.focusDistance).toBeGreaterThan(5 * DEMO_BU);
    r.setFollow(null);
    o = r.update(1, { ...NO, move: { x: 0, y: 0 }, vertical: 0, fast: false }, env);
    expect(o.mode).toBe('hold');
    for (let i = 0; i < 10; i++) o = r.update(0.25, { ...NO, move: { x: 0, y: 0 }, vertical: 0, fast: false }, env);
    expect(o.mode).toBe('free');
  });
});

describe('ColonyRig', () => {
  it('clamps pitch, distance and target; slice steps stay within range', () => {
    const r = new ColonyRig({ bu: DEMO_BU, worldSize: 400 });
    r.enter(vec3(50, -20, 0), true, demoGroundHeight);
    expect(r.cutaway.mode).toBe('slice');
    expect(r.distance).toBeCloseTo(120 * DEMO_BU, 6);
    r.setDeepest(-40);
    const env = { groundHeight: demoGroundHeight, trace };
    for (let i = 0; i < 100; i++) r.update(1 / 30, { yawDeg: 3, pitchDeg: 5, zoomLog: 0.2, pan: { x: 1, y: 1 }, sliceSteps: -1, sliceFast: true }, env);
    expect(r.pitch * 180 / Math.PI).toBeCloseTo(30, 6);
    expect(r.distance).toBeCloseTo(1500 * DEMO_BU, 6);
    expect(r.target.x).toBeLessThanOrEqual(400);
    expect(r.target.z).toBeGreaterThanOrEqual(0);
    expect(r.cutaway.planeY).toBeCloseTo(-40 - 10 * DEMO_BU, 6);
    r.update(0, { ...NO, pan: { x: 0, y: 0 }, cycleCutaway: true }, env);
    expect(r.cutaway.mode).toBe('xray');
    r.setCutRadius(1000);
    expect(r.cutaway.radius).toBe(400 * DEMO_BU);
  });
});

describe('ColonyRig collision (cutaway off)', () => {
  it('a full yaw sweep at several pitches next to the wall and the block never puts the camera in solid', () => {
    const r = new ColonyRig({ bu: DEMO_BU, worldSize: 400 });
    const env = { groundHeight: demoGroundHeight, trace };
    for (const focus of [vec3(95, 0, 0), vec3(125, 0, 10), vec3(110, 0, 0), vec3(155, 0, 45), vec3(210, 0, 0)]) {
      for (const pitchDeg of [30, 55, 89]) {
        r.enter(focus, false, demoGroundHeight, 0);
        r.pitch = (pitchDeg * Math.PI) / 180;
        for (let yaw = 0; yaw < 360; yaw += 7.5) {
          const o = r.update(0, { ...NO, yawDeg: -7.5, pan: { x: 0, y: 0 } }, env);
          expect(demoField(o.pos.x, o.pos.y, o.pos.z), `focus=${focus.x},${focus.z} pitch=${pitchDeg} yaw=${yaw}`).toBeGreaterThanOrEqual(0.3 * DEMO_BU * 0.5);
          expect(o.near).toBeGreaterThan(0);
        }
      }
    }
  });
});

describe('PhotoRig', () => {
  it('lens controls clamp and map aperture to bokeh; soft wall keeps it near the entry', () => {
    const r = new PhotoRig(DEMO_BU);
    r.enter(pose(0, 20, 50, 0, 0, 0, 60));
    let o = r.update(1 / 60, { ...NO, move: { x: 0, y: 0 }, vertical: 0, focalLog: 0, focusLog: 0, apertureSteps: 0, exposureSteps: 0, roll: 0 }, trace);
    expect(o.dof.bokehScale).toBeCloseTo(9 / 2.8, 6);
    o = r.update(1 / 60, { ...NO, move: { x: 0, y: 0 }, vertical: 0, focalLog: 10, focusLog: 0, apertureSteps: 20, exposureSteps: 99, roll: 1 }, trace);
    expect(o.focalMm).toBeCloseTo(200, 6); // GDD 08 7.9: 24-200 mm equivalent
    expect(o.fov).toBeCloseTo(fovForFocal(200), 9);
    expect(o.fNumber).toBe(22);
    expect(o.exposureEV).toBe(3);
    o = r.update(1 / 60, { ...NO, move: { x: 0, y: 0 }, vertical: 0, focalLog: -10, focusLog: 0, apertureSteps: -20, exposureSteps: 0, roll: 0 }, trace);
    expect(o.focalMm).toBeCloseTo(24, 6);
    expect(o.fov).toBeCloseTo(53.13, 2);
    expect(o.fNumber).toBe(1.4);
    // fast (Shift x5) for 20 s = 400 BU / s x 20 s: far past the 400 BU soft wall
    for (let i = 0; i < 60 * 20; i++) o = r.update(1 / 60, { ...NO, move: { x: 0, y: 1 }, vertical: 1, focalLog: 0, focusLog: 0, apertureSteps: 0, exposureSteps: 0, roll: 0, fast: true }, trace);
    expect(Math.hypot(o.pos.x, o.pos.y - 20, o.pos.z - 50)).toBeLessThan(410 * DEMO_BU);
    expect(Math.hypot(o.pos.x, o.pos.y - 20, o.pos.z - 50)).toBeGreaterThan(300 * DEMO_BU);
    expect(r.exitPose().pos).toEqual(vec3(0, 20, 50));
  });

  it('aperture is continuous between stops and the slider setter round-trips', () => {
    expect(fNumberAt(2)).toBe(2.8);
    expect(fNumberAt(2.5)).toBeCloseTo(Math.sqrt(2.8 * 4), 9);
    expect(fNumberAt(NaN)).toBe(1.4);
    const r = new PhotoRig(DEMO_BU);
    r.enter(pose(0, 20, 50, 0, 0, 0, 60));
    r.setFNumber(6.3);
    const o = r.update(1 / 60, { ...NO, move: { x: 0, y: 0 }, vertical: 0, focalLog: 0, focusLog: 0, apertureSteps: NaN, exposureSteps: 0, roll: 0 }, trace);
    expect(o.fNumber).toBeCloseTo(6.3, 9);
    expect(o.dof.bokehScale).toBeCloseTo(9 / 6.3, 9);
  });
});
