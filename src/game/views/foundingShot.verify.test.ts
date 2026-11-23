// Review of look pass 5 (adversarial): the founding chamber shot in the view director, frame to frame.
// The first test FAILS on the reviewed code on purpose: the shot's pose is recomputed from the subject sphere every frame
// with no easing, so a subject radius that changes (a first worker walking into the 10 BU reach, a nurse picking up an egg)
// moves the camera tens of millimetres in one frame, against the views rule CAM_MAX_REL_SPEED_L ("no frame-to-frame jumps").
import { describe, expect, it } from 'vitest';
import { CAM_MAX_REL_SPEED_L, type FoundingShotSubject } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import { ViewDirector, type ViewSubject } from './viewDirector';

const CAM = { autoFollow: 'off' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function setup() {
  const sim = makeTestSim({ systems: [] });
  const d = new ViewDirector({
    bu: sim.world.bu, worldSize: sim.world.size, trace: (o, dir, m, r) => sim.field.sphereTrace(o, dir, m, r),
    groundHeight: (x, z) => sim.field.height(x, z), field: (x, y, z) => sim.field.sampleXYZ(x, y, z),
  }, CAM);
  const q = sim.state.ants[0];
  const subject: ViewSubject = { pos: { ...q.pos }, up: { ...q.up }, fwd: { ...q.fwd }, lengthBu: q.lengthBu, underground: false, airborne: false };
  const cell: FoundingShotSubject = { x: q.pos.x, y: q.pos.y - 8, z: q.pos.z, radius: 4.5 * sim.world.bu, cutY: q.pos.y - 6 };
  return { d, subject, cell, bu: sim.world.bu, lengthBu: q.lengthBu };
}

describe('founding shot frame to frame (review)', () => {
  it('a subject sphere that grows from the queen alone to a worker 10 BU away does not jump the camera in one frame', () => {
    const { d, subject, cell, bu, lengthBu } = setup();
    d.setView('possess', subject, true);
    d.setFoundingShot(() => cell);
    d.settle(3, 1 / 60); // the entry transition is over
    const a = { ...d.pose.pos };
    cell.radius = 11 * bu; // seed1-until12b at the outcome card: 33 mm, a worker inside the reach
    d.update(1 / 60, null);
    const moved = Math.hypot(d.pose.pos.x - a.x, d.pose.pos.y - a.y, d.pose.pos.z - a.z);
    const allowed = CAM_MAX_REL_SPEED_L * lengthBu * bu / 60 + 0.02 * 2 * Math.PI * 200 / 60; // the views speed limit plus the orbit
    expect(moved).toBeLessThan(allowed);
  });

  it('clearing the shot while the director is in the colony view leaves the colony rig alone', () => {
    const { d, subject, cell } = setup();
    d.setView('possess', subject, true);
    d.setFoundingShot(() => cell);
    d.settle(1, 1 / 60);
    d.setView('colony', subject, true);
    d.settle(1, 1 / 60);
    const before = { ...d.pose.pos };
    d.setFoundingShot(null);
    d.settle(2, 1 / 60);
    for (const k of ['x', 'y', 'z'] as const) expect(Number.isFinite(d.pose.pos[k])).toBe(true);
    expect(Math.hypot(d.pose.pos.x - before.x, d.pose.pos.z - before.z)).toBeLessThan(1e3);
  });

  it('a source that returns null (no queen, no brood, no chamber) falls back to the ant rig without NaN', () => {
    const { d, subject } = setup();
    d.setView('possess', subject, true);
    d.setFoundingShot(() => null);
    const f = d.settle(1, 1 / 60);
    expect(f.cutaway).toBeNull();
    for (const k of ['x', 'y', 'z'] as const) expect(Number.isFinite(f.pose.pos[k])).toBe(true);
  });
});
