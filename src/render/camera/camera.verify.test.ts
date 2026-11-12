// Adversarial review tests for src/render/camera (F3a review). Tests that fail here document real defects.
import { describe, expect, it } from 'vitest';
import { sdRoundBox, sdSphere, v3Normalize, v3Set as vec3Set, vec3, type Vec3 } from '@/core';
import { ColonyRig } from './colonyRig';
import { DEG, rotateAboutAxis, transport } from './frameMath';
import { ObserverRig } from './observerRig';
import { PhotoRig } from './photoRig';
import { makeSphereTracer, type FieldFn } from './sphereTrace';
import { CHANNEL, DEMO_BU, DEMO_PATH_DURATION, demoField, demoGroundHeight, demoPathAt, makeTargetObj } from './testing/demoField';
import { ThirdPersonRig } from './thirdPersonRig';
import { CameraTransition, planTransition, poseDistance } from './transition';
import { makePose, NO_ORBIT_INPUT, type CameraTarget } from './types';

/** Small deterministic PRNG (tests must not use Math.random). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const finite = (v: Vec3) => Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

describe('sphere tracer (verify)', () => {
  const trace = makeSphereTracer(demoField);
  it('returns 0 when the sphere already touches solid and never more than maxDist', () => {
    expect(trace(vec3(0, 0.2, 0), vec3(1, 0, 0), 50, 1)).toBe(0);
    expect(trace(vec3(0, 50, 0), vec3(0, 1, 0), 7, 1)).toBe(7);
    expect(trace(vec3(0, 50, 0), vec3(0, 1, 0), 0, 1)).toBe(0);
  });
  it('a sphere moved by the returned distance is outside solid (many random rays)', () => {
    const rnd = lcg(7);
    for (let i = 0; i < 3000; i++) {
      const o = vec3(rnd() * 400 - 60, rnd() * 50 + 0.5, rnd() * 120 - 60);
      const d = vec3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
      v3Normalize(d, d);
      const r = 0.3 + rnd() * 2;
      if (demoField(o.x, o.y, o.z) < r) continue;
      const t = trace(o, d, 200, r);
      expect(demoField(o.x + d.x * t, o.y + d.y * t, o.z + d.z * t)).toBeGreaterThanOrEqual(r * 0.999 - 1e-9);
    }
  });
});

describe('ThirdPersonRig robustness (verify)', () => {
  const trace = makeSphereTracer(demoField);

  it('random targets and random orbit/zoom input never put the camera closer than 0.5 R to solid', () => {
    const rnd = lcg(42);
    const t = makeTargetObj();
    // bodyL 1 only: the demo field's FOOT (0.5 mm) is below 0.25 R of a queen (bodyL 2), see the review report
    for (const bodyL of [1]) {
      const rig = new ThirdPersonRig({ bu: DEMO_BU, bodyL, autoFollow: 'strong' });
      let worst = Infinity;
      for (let i = 0; i < 4000; i++) {
        // mostly follow the scripted path (wall, corridor), sometimes teleport somewhere else
        const teleport = rnd() >= 0.9;
        demoPathAt(teleport ? rnd() * DEMO_PATH_DURATION : (i / 30) % DEMO_PATH_DURATION, t);
        if (teleport || i % 97 === 0) rig.snap(); // a teleport is always followed by snap() (documented contract)
        const dt = [0, 1 / 144, 1 / 60, 1 / 30, 0.25, 2][Math.floor(rnd() * 6)];
        const out = rig.update(dt, t, { yawDeg: (rnd() - 0.5) * 90, pitchDeg: (rnd() - 0.5) * 60, zoomLog: (rnd() - 0.5) * 2, recentre: rnd() < 0.02 }, { trace });
        expect(finite(out.pos) && finite(out.look) && finite(out.up), `i=${i}`).toBe(true);
        const f = demoField(out.pos.x, out.pos.y, out.pos.z);
        worst = Math.min(worst, f - rig.radiusMm * 0.5);
        expect(f, `bodyL=${bodyL} i=${i} state=${out.state}`).toBeGreaterThanOrEqual(rig.radiusMm * 0.5 - 1e-6);
        expect(out.near).toBeGreaterThan(0);
        expect(out.near).toBeLessThan(out.far);
      }
      expect(worst).toBeGreaterThanOrEqual(-1e-6);
    }
  });

  // BUG (GDD 01 6.1: "a camera centre must satisfy f >= CAM_RADIUS x 0.5 on every rendered frame"): the pivot is
  // placed at headroom - R along the *smoothed* camera up u. When u still points into the surface the ant has just
  // wrapped onto (around the edge of a thin plate / leaf), backing off R along an oblique ray leaves the pivot only
  // ~0.25 R from the surface; the boom/orbit trace from there returns 0 and the camera sits on the pivot.
  it('walking around the edge of a thin plate keeps the camera >= 0.5 R from solid', () => {
    const plate: FieldFn = (x, y, z) => sdRoundBox({ x: x + 100, y: y - 11, z }, { x: 100, y: 1, z: 50 }, 0);
    const tr = makeSphereTracer(plate);
    const FOOT = 0.6, speed = 6 * DEMO_BU, R0 = 1 + FOOT;
    const rig = new ThirdPersonRig({ bu: DEMO_BU, bodyL: 1 });
    const t: CameraTarget = { pos: vec3(), up: vec3(), fwd: vec3() };
    const at = (s: number) => {
      if (s < 40) { vec3Set(t.pos, -40 + s, 12 + FOOT, 0); vec3Set(t.up, 0, 1, 0); vec3Set(t.fwd, 1, 0, 0); }
      else if (s < 40 + Math.PI * R0) {
        const a = Math.PI / 2 - (s - 40) / R0;
        vec3Set(t.up, Math.cos(a), Math.sin(a), 0); vec3Set(t.pos, R0 * t.up.x, 11 + R0 * t.up.y, 0); vec3Set(t.fwd, Math.sin(a), -Math.cos(a), 0);
      } else { vec3Set(t.pos, -(s - 40 - Math.PI * R0), 10 - FOOT, 0); vec3Set(t.up, 0, -1, 0); vec3Set(t.fwd, -1, 0, 0); }
    };
    let worst = Infinity;
    for (let time = 0; time < 4; time += 1 / 60) {
      at(time * speed);
      const o = rig.update(1 / 60, t, NO_ORBIT_INPUT, { trace: tr });
      worst = Math.min(worst, plate(o.pos.x, o.pos.y, o.pos.z));
    }
    expect(worst).toBeGreaterThanOrEqual(rig.radiusMm * 0.5);
  });

  it('inside a small closed cavity (crevice) the camera stays in free space', () => {
    const cavity: FieldFn = (x, y, z) => -sdSphere({ x, y, z }, 3); // free inside a 3 mm sphere
    const tr = makeSphereTracer(cavity);
    const rig = new ThirdPersonRig({ bu: DEMO_BU, bodyL: 1 });
    const t: CameraTarget = { pos: vec3(0, -2.4, 0), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
    let out = rig.update(0, t, NO_ORBIT_INPUT, { trace: tr });
    for (let i = 0; i < 120; i++) out = rig.update(1 / 60, t, { yawDeg: 3, pitchDeg: 0, zoomLog: 0 }, { trace: tr });
    expect(out.state).toBe('crevice');
    expect(cavity(out.pos.x, out.pos.y, out.pos.z)).toBeGreaterThanOrEqual(rig.radiusMm * 0.5);
    expect(out.fade.target).toBeLessThanOrEqual(0.5);
  });

  it('yaw relative to the heading survives an abrupt (single-frame) 90 degree change of up', () => {
    const rig = new ThirdPersonRig({ bu: DEMO_BU, bodyL: 1, autoFollow: 'off' });
    const env = { trace: makeSphereTracer(() => 1e6) }; // empty space: no collision effects
    const floor: CameraTarget = { pos: vec3(), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
    rig.update(0, floor, NO_ORBIT_INPUT, env);
    rig.update(1 / 60, floor, { yawDeg: 40, pitchDeg: 0, zoomLog: 0 }, env);
    const before = rig.yawFromBehind(floor);
    const wall: CameraTarget = { pos: vec3(), up: vec3(-1, 0, 0), fwd: vec3(0, 1, 0) };
    for (let i = 0; i < 300; i++) rig.update(1 / 60, wall, NO_ORBIT_INPUT, env);
    expect(rig.yawFromBehind(wall) / DEG).toBeCloseTo(before / DEG, 1);
  });

  it('degenerate target frames (fwd parallel to up, zero vectors) never produce NaN', () => {
    const rig = new ThirdPersonRig({ bu: DEMO_BU, bodyL: 1 });
    const t: CameraTarget = { pos: vec3(-40, 0.5, 0), up: vec3(0, 1, 0), fwd: vec3(0, 1, 0) };
    for (let i = 0; i < 30; i++) {
      const o = rig.update(1 / 60, t, { yawDeg: 1, pitchDeg: 1, zoomLog: 0.1 }, { trace });
      expect(finite(o.pos) && finite(o.look) && finite(o.up)).toBe(true);
    }
  });

  it('corridor: the camera stays inside the 2 BU channel while the target walks through it', () => {
    const rig = new ThirdPersonRig({ bu: DEMO_BU, bodyL: 1 });
    const t = makeTargetObj();
    let inChannel = 0;
    for (let time = 0; time < DEMO_PATH_DURATION * 0.98; time += 1 / 60) {
      demoPathAt(time, t);
      const o = rig.update(1 / 60, t, NO_ORBIT_INPUT, { trace });
      if (t.pos.x > 175 && t.pos.x < 250 && t.pos.y < 1) {
        inChannel++;
        expect(Math.abs(o.pos.z)).toBeLessThan(CHANNEL.halfW);
        expect(o.pos.y).toBeLessThan(CHANNEL.h);
      }
    }
    expect(inChannel).toBeGreaterThan(100);
  });
});

describe('frame maths (verify)', () => {
  it('transport handles identical and opposite normals without NaN and preserves length', () => {
    const v = vec3(0.3, 0.4, 0.5);
    for (const [a, b] of [[vec3(0, 1, 0), vec3(0, 1, 0)], [vec3(0, 1, 0), vec3(0, -1, 0)], [vec3(1, 0, 0), vec3(0, 0, 1)]] as const) {
      const o = transport(vec3(), v, a, b);
      expect(finite(o)).toBe(true);
      expect(Math.hypot(o.x, o.y, o.z)).toBeCloseTo(Math.hypot(v.x, v.y, v.z), 9);
    }
    const r = rotateAboutAxis(vec3(), vec3(1, 0, 0), vec3(0, 1, 0), Math.PI / 2);
    expect(r.z).toBeCloseTo(-1, 9);
  });
});

describe('other rigs (verify)', () => {
  const trace = makeSphereTracer(demoField);

  it('observer follow never enters solid while the followed target walks the whole demo path', () => {
    const r = new ObserverRig({ bu: DEMO_BU, worldSize: 400 });
    const t = makeTargetObj();
    for (let time = 0; time < DEMO_PATH_DURATION; time += 1 / 30) {
      r.setFollow(demoPathAt(time, t));
      const o = r.update(1 / 30, { yawDeg: 2, pitchDeg: Math.sin(time), zoomLog: 0, move: { x: 0, y: 0 }, vertical: 0, fast: false }, { trace, groundHeight: demoGroundHeight });
      expect(demoField(o.pos.x, o.pos.y, o.pos.z), `t=${time}`).toBeGreaterThanOrEqual(r.radiusMm * 0.5);
    }
  });

  it('colony rig: zero/NaN-free with huge zoom input and the slice never goes above ground', () => {
    const r = new ColonyRig({ bu: DEMO_BU, worldSize: 400 });
    r.enter(vec3(50, -20, 0), true, demoGroundHeight);
    for (let i = 0; i < 50; i++) {
      const o = r.update(1 / 30, { yawDeg: 400, pitchDeg: -400, zoomLog: -50, pan: { x: -1, y: -1 }, sliceSteps: 3, sliceFast: true }, { groundHeight: demoGroundHeight, trace });
      expect(finite(o.pos)).toBe(true);
      expect(o.cutaway.planeY).toBeLessThanOrEqual(0);
    }
    expect(r.distance).toBeCloseTo(30 * DEMO_BU, 6);
  });

  // BUG (GDD 01 6.1, all cameras keep f >= 0.5 x radius): with cutaway off the colony rig traces from target + 2 BU
  // up but places the camera along the parallel line from the target itself, and forces d >= 2 BU even when the trace
  // allows less. Looking at the ground just in front of a wall from the far side puts the camera inside the wall.
  it('colony rig (cutaway off) never puts the camera inside a wall next to its target', () => {
    const r = new ColonyRig({ bu: DEMO_BU, worldSize: 400 });
    r.enter(vec3(95, 0, 0), false, demoGroundHeight, Math.PI / 2); // yaw 90 deg: camera on the +X side, behind the wall
    const o = r.update(1 / 30, { yawDeg: 0, pitchDeg: 25, zoomLog: 0, pan: { x: 0, y: 0 } }, { groundHeight: demoGroundHeight, trace });
    expect(demoField(o.pos.x, o.pos.y, o.pos.z)).toBeGreaterThanOrEqual(0.3 * DEMO_BU * 0.5);
  });

  // GDD 08 7.9 aperture is a slider; a fractional step must not index between f-stops (fNumber/bokeh become NaN).
  it('photo rig: a fractional aperture step never yields NaN', () => {
    const r = new PhotoRig(DEMO_BU);
    const p = makePose();
    p.pos = vec3(0, 20, 50); p.look = vec3(0, 0, 0);
    r.enter(p);
    const o = r.update(1 / 60, { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move: { x: 0, y: 0 }, vertical: 0, focalLog: 0, focusLog: 0, apertureSteps: 0.5, exposureSteps: 0, roll: 0 }, trace);
    expect(Number.isFinite(o.dof.bokehScale)).toBe(true);
  });

  it('photo rig lens ranges follow GDD 08 7.9 (focus 0.5-200 BU, exposure -3..+3 EV, 400 BU radius)', () => {
    const r = new PhotoRig(DEMO_BU);
    const p = makePose();
    p.pos = vec3(0, 20, 50); p.look = vec3(0, 0, 0);
    r.enter(p);
    const step = (over: Partial<Parameters<PhotoRig['update']>[1]>) => r.update(1 / 60, { yawDeg: 0, pitchDeg: 0, zoomLog: 0, move: { x: 0, y: 0 }, vertical: 0, focalLog: 0, focusLog: 0, apertureSteps: 0, exposureSteps: 0, roll: 0, ...over }, trace);
    let o = step({ focusLog: 50, exposureSteps: 100 });
    expect(o.dof.focusDistance).toBeCloseTo(200 * DEMO_BU, 6);
    expect(o.exposureEV).toBe(3);
    o = step({ exposureSteps: -1000 });
    expect(o.exposureEV).toBe(-3);
  });
});

describe('transition (verify)', () => {
  it('a zero-length plan passes the destination straight through', () => {
    const tr = new CameraTransition();
    const a = makePose(), b = makePose();
    b.pos = vec3(10, 0, 0); b.look = vec3(10, 0, -1);
    tr.start(a, { kind: 'fly', duration: 0 });
    expect(poseDistance(tr.update(1 / 60, b).pose, b)).toBe(0);
  });
  it('dip transitions darken monotonically to the midpoint and then brighten', () => {
    const a = makePose(), b = makePose();
    b.pos = vec3(1000 * DEMO_BU, 0, 0); b.look = vec3(1000 * DEMO_BU, 0, -1);
    const tr = new CameraTransition();
    const plan = planTransition(a, b, DEMO_BU, false);
    expect(plan.kind).toBe('dip');
    tr.start(a, plan);
    const dips: number[] = [];
    while (!tr.out.done || dips.length === 0) dips.push(tr.update(1 / 120, b).dip);
    const peak = dips.indexOf(Math.max(...dips));
    for (let i = 1; i <= peak; i++) expect(dips[i]).toBeGreaterThanOrEqual(dips[i - 1]);
    for (let i = peak + 1; i < dips.length; i++) expect(dips[i]).toBeLessThanOrEqual(dips[i - 1]);
    expect(dips[dips.length - 1]).toBe(0);
    void rotateAboutAxis;
  });
});
