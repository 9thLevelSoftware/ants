// The founding chamber shot in the view director (look pass 5): it replaces the possess and observer rigs while a source
// is set, carries the slice cutaway, and gives the rig back when it is cleared.
import { describe, expect, it } from 'vitest';
import { FSHOT_FOV_DEG } from '@/render/camera';
import { makeTestSim } from '@/sim/testing';
import { ViewDirector, type ViewSubject } from './viewDirector';

const CAM = { autoFollow: 'off' as const, fovOffset: 0, worldUpLock: false, reducedMotion: false };

function setup(reducedMotion = false) {
  const sim = makeTestSim({ systems: [] });
  const d = new ViewDirector({
    bu: sim.world.bu, worldSize: sim.world.size, trace: (o, dir, m, r) => sim.field.sphereTrace(o, dir, m, r),
    groundHeight: (x, z) => sim.field.height(x, z), field: (x, y, z) => sim.field.sampleXYZ(x, y, z),
  }, { ...CAM, reducedMotion });
  const q = sim.state.ants[0];
  const subject: ViewSubject = { pos: { ...q.pos }, up: { ...q.up }, fwd: { ...q.fwd }, lengthBu: q.lengthBu, underground: false, airborne: false };
  const cell = { x: q.pos.x, y: q.pos.y - 8, z: q.pos.z, radius: 14, cutY: q.pos.y - 6 };
  return { d, subject, cell };
}

describe('founding shot in the view director', () => {
  it('shows the shot with its slice while a source is set, in the possess view and in the observer view', () => {
    for (const view of ['possess', 'observer'] as const) {
      const { d, subject, cell } = setup();
      d.setView(view, subject, true);
      d.setFoundingShot(() => cell);
      expect(d.foundingShotOn).toBe(true);
      const f = d.settle(1.5, 1 / 30);
      expect(f.cutaway?.mode).toBe('slice');
      expect(f.cutaway?.planeY).toBe(cell.cutY);
      expect(f.pose.fov).toBe(FSHOT_FOV_DEG);
      expect(f.pose.look).toEqual(expect.objectContaining({ x: cell.x, z: cell.z }));
      expect(f.possessionState).toBeNull();
      expect(f.subjectOpacity).toBe(1);
    }
  });

  it('shows the queen on a steep wall from the side through a vertical section, backed off far enough to hold her whole (look pass 6)', () => {
    const { d, subject, cell } = setup();
    const lengthMm = 8.5;
    const ant = { pos: { ...cell, y: cell.y }, up: { x: 1, y: 0, z: 0 }, fwd: { x: 0, y: -1, z: 0 }, lengthMm };
    d.setView('possess', subject, true);
    // the spread of what is in the cell is smaller than her half length (one egg pile at her feet)
    d.setFoundingShot(() => ({ ...cell, radius: 1, ant }));
    const f = d.settle(1.5, 1 / 30);
    expect(f.cutaway?.section).toBe('vertical');
    expect(f.focus).toBeGreaterThanOrEqual(lengthMm / (0.95 * Math.sin((FSHOT_FOV_DEG * Math.PI) / 360)) - 0.5);
  });

  it('gives the ant rig back (no cutaway) when the source is cleared', () => {
    const { d, subject, cell } = setup();
    d.setView('possess', subject, true);
    d.setFoundingShot(() => cell);
    d.settle(1, 1 / 30);
    d.setFoundingShot(null);
    expect(d.foundingShotOn).toBe(false);
    const f = d.settle(1.5, 1 / 30);
    expect(f.cutaway).toBeNull();
    expect(f.pose.fov).not.toBe(FSHOT_FOV_DEG);
  });

  it('orbits slowly, and not at all with reduced motion', () => {
    const run = (reduced: boolean) => {
      const { d, subject, cell } = setup(reduced);
      d.setView('possess', subject, true);
      d.setFoundingShot(() => cell);
      d.settle(1, 1 / 30);
      const a = { ...d.pose.pos };
      d.settle(20, 1 / 30);
      return Math.hypot(d.pose.pos.x - a.x, d.pose.pos.z - a.z);
    };
    expect(run(false)).toBeGreaterThan(1);
    expect(run(true)).toBeLessThan(1e-6);
  });

  it('is ignored in the colony view (the player left for the nest map)', () => {
    const { d, subject, cell } = setup();
    d.setView('colony', subject, true);
    d.setFoundingShot(() => cell);
    const f = d.settle(1, 1 / 30);
    expect(f.pose.fov).not.toBe(FSHOT_FOV_DEG);
  });

  it('eases a change of the subject (radius, centre, card lift) and arrives at it', () => {
    const { d, subject, cell } = setup();
    d.setView('possess', subject, true);
    cell.radius = 40; // above the minimum radius, so the distance follows it
    d.setFoundingShot(() => cell);
    d.settle(2, 1 / 60);
    const d0 = Math.hypot(d.pose.pos.x - cell.x, d.pose.pos.y - cell.y, d.pose.pos.z - cell.z);
    cell.radius *= 3;
    d.update(1 / 60, null);
    const d1 = Math.hypot(d.pose.pos.x - cell.x, d.pose.pos.y - cell.y, d.pose.pos.z - cell.z);
    expect(d1 - d0).toBeLessThan(0.1 * d0); // not at once
    d.settle(6, 1 / 60);
    const d2 = Math.hypot(d.pose.pos.x - cell.x, d.pose.pos.y - cell.y, d.pose.pos.z - cell.z);
    expect(d2 / d0).toBeGreaterThan(2.9); // but all the way
    expect(d2 / d0).toBeLessThan(3.1);
  });

  it('keeps the slice at the source height at once, also while the frame eases', () => {
    const { d, subject, cell } = setup();
    d.setView('possess', subject, true);
    d.setFoundingShot(() => cell);
    d.settle(1, 1 / 60);
    cell.cutY += 3;
    expect(d.update(1 / 60, null).cutaway?.planeY).toBe(cell.cutY);
  });

  it('with reduced motion holds one still and retakes it with a crossfade every 3 real seconds', () => {
    const { d, subject, cell } = setup(true);
    d.setView('possess', subject, true);
    d.setFoundingShot(() => cell);
    d.settle(1, 1 / 60); // the entry crossfade is over
    const still = { ...d.pose.pos };
    cell.x += 5; cell.radius *= 2; // the cell changed: nothing moves until the next still
    let fadedAt = -1, t = 0;
    for (; t < 4; t += 1 / 60) {
      const f = d.update(1 / 60, null);
      if (f.dip > 0 && fadedAt < 0) fadedAt = t;
      if (fadedAt < 0) expect(d.pose.pos).toEqual(still);
    }
    expect(fadedAt).toBeGreaterThan(1.5);
    expect(fadedAt).toBeLessThan(3.2);
    expect(Math.hypot(d.pose.pos.x - still.x, d.pose.pos.z - still.z)).toBeGreaterThan(1); // the new still
  });
});
