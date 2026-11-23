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
});
