// View hand-overs (GDD 01 §2): transition kinds and timings between the rigs, the colony rise / descent, photo mode
// keeping the pose, and the blend landing on the destination rig without a pop.
import { describe, expect, it } from 'vitest';
import { CAM_SWITCH_MAX_S, CAM_SWITCH_MIN_S, CAM_TO_COLONY_S, CAM_REDUCED_CROSSFADE_S, makePose, poseDistance } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import { handoverPlan, ViewDirector, type ViewSubject } from './viewDirector';

const CAM = { autoFollow: 'off' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function setup() {
  const sim = makeTestSim({ systems: [] });
  const d = new ViewDirector({
    bu: sim.world.bu, worldSize: sim.world.size, trace: (o, dir, m, r) => sim.field.sphereTrace(o, dir, m, r),
    groundHeight: (x, z) => sim.field.height(x, z), field: (x, y, z) => sim.field.sampleXYZ(x, y, z),
  }, CAM);
  const q = sim.state.ants[0];
  const subject: ViewSubject = { pos: { ...q.pos }, up: { ...q.up }, fwd: { ...q.fwd }, lengthBu: q.lengthBu, underground: false, airborne: false };
  return { sim, d, subject };
}

/** Runs the director until its transition ends; returns the elapsed time and the largest per-frame camera move. */
function runTransition(d: ViewDirector, dt = 1 / 60): { s: number; maxStep: number } {
  let t = 0, maxStep = 0;
  let prev = { ...d.pose.pos };
  for (let i = 0; i < 600 && (i === 0 || d.transition.running); i++) {
    d.update(dt, null);
    maxStep = Math.max(maxStep, Math.hypot(d.pose.pos.x - prev.x, d.pose.pos.y - prev.y, d.pose.pos.z - prev.z));
    prev = { ...d.pose.pos };
    t += dt;
  }
  return { s: t, maxStep };
}

describe('hand-over plans', () => {
  it('colony in and out rise / descend over CAM_TO_COLONY_S; other switches follow the distance law', () => {
    const a = makePose(), b = makePose();
    b.pos.x = 4 * 200; // 200 BU away
    expect(handoverPlan('possess', 'colony', a, b, 4, false)).toEqual({ kind: 'fly', duration: CAM_TO_COLONY_S });
    expect(handoverPlan('colony', 'possess', a, b, 4, false)).toEqual({ kind: 'fly', duration: CAM_TO_COLONY_S });
    expect(handoverPlan('observer', 'possess', a, b, 4, false).kind).toBe('dip');
    b.pos.x = 4 * 60;
    const fly = handoverPlan('observer', 'possess', a, b, 4, false);
    expect(fly.kind).toBe('fly');
    expect(fly.duration).toBeCloseTo(Math.min(CAM_SWITCH_MAX_S, Math.max(CAM_SWITCH_MIN_S, 0.4 + 60 / 300)));
    expect(handoverPlan('possess', 'colony', a, b, 4, true)).toEqual({ kind: 'crossfade', duration: CAM_REDUCED_CROSSFADE_S });
  });
});

describe('ViewDirector hand-overs', () => {
  it('possession -> colony rises in 0.8 s and lands exactly on the colony rig; back descends', () => {
    const { d, subject } = setup();
    d.setView('possess', subject, true);
    d.settle(1, 1 / 30);
    d.setView('colony', subject);
    const up = runTransition(d);
    expect(up.s).toBeGreaterThan(CAM_TO_COLONY_S - 0.05);
    expect(up.s).toBeLessThan(CAM_TO_COLONY_S + 0.1);
    const rig = d.colony.out;
    expect(poseDistance(d.pose, rig)).toBeLessThan(1e-6);
    d.setView('possess', subject);
    const down = runTransition(d);
    expect(down.s).toBeLessThan(CAM_TO_COLONY_S + 0.1);
    expect(poseDistance(d.pose, d.third.out)).toBeLessThan(1e-6);
  });

  it('release keeps the camera and follows the released ant; photo mode keeps the pose both ways', () => {
    const { d, subject } = setup();
    d.setView('possess', subject, true);
    d.settle(1, 1 / 30);
    const before = { ...d.pose.pos };
    d.setView('observer', subject);
    d.update(1 / 60, null);
    expect(Math.hypot(d.pose.pos.x - before.x, d.pose.pos.y - before.y, d.pose.pos.z - before.z)).toBeLessThan(subject.lengthBu * 4 * 2);
    runTransition(d);
    const obs = { ...d.pose.pos };
    d.setView('photo', null);
    d.update(1 / 60, null);
    expect(Math.hypot(d.pose.pos.x - obs.x, d.pose.pos.y - obs.y, d.pose.pos.z - obs.z)).toBeLessThan(1e-6);
    d.setView(d.photoOrigin, subject);
    d.update(0, null);
    expect(d.view).toBe('observer');
  });
});
