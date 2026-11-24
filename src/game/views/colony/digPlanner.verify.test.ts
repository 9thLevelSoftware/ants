// Reviewer tests (app-seams-4 item 1): the planner's pick on the soil of the slice snaps to the nest's own wall within
// ANCHOR_PICK_REACH_BU and says why beyond it; the snap stays cheap enough for a pointer move (GDD 03 7.3: 2 ms per move).
import { describe, expect, it } from 'vitest';
import { makeTestSim } from '@/sim/testing';
import { heavyLoad, PERF_STRICT } from '@/sim/testing/perfLoad';
import type { Sim } from '@/sim/types';
import { ANCHOR_PICK_REACH_BU, DigPlanner, playerNest, wallToward } from './digPlanner';

function nurseryWall(sim: Sim) {
  const ch = playerNest(sim)!.chambers.find((c) => c.type === 'nursery')!;
  const p = { x: ch.center.x + ch.radii.x * 0.98, y: ch.center.y, z: ch.center.z };
  const out = { x: 0, y: 0, z: 0 }, n = { x: 0, y: 0, z: 0 };
  sim.field.project(p, 0, out, n);
  return { point: out, normal: n };
}

const soil = (sim: Sim, dBu: number) => {
  const w = nurseryWall(sim), bu = sim.world.bu;
  return { point: { x: w.point.x - w.normal.x * dBu * bu, y: w.point.y - w.normal.y * dBu * bu, z: w.point.z - w.normal.z * dBu * bu }, normal: { x: 0, y: 1, z: 0 }, kind: 'cap' as const };
};

describe('dig planner soil pick (reviewer)', () => {
  it('the snapped anchor is on the wall, its normal points into the cavity, and it is no further from the click than the reach', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const bu = sim.world.bu, nest = playerNest(sim)!;
    for (const d of [2.5, 4, 6, 7.5]) {
      const pk = soil(sim, d);
      const a = wallToward(sim, nest, pk.point, ANCHOR_PICK_REACH_BU * bu)!;
      expect(a, `d ${d}`).not.toBeNull();
      expect(Math.abs(sim.field.sampleXYZ(a.pos.x, a.pos.y, a.pos.z))).toBeLessThan(0.25 * bu);
      // one step along the normal is free space, one step against it is soil
      const s = 0.5 * bu;
      expect(sim.field.sampleXYZ(a.pos.x + a.normal.x * s, a.pos.y + a.normal.y * s, a.pos.z + a.normal.z * s)).toBeGreaterThan(0);
      expect(sim.field.sampleXYZ(a.pos.x - a.normal.x * s, a.pos.y - a.normal.y * s, a.pos.z - a.normal.z * s)).toBeLessThan(0);
      expect(Math.hypot(a.pos.x - pk.point.x, a.pos.y - pk.point.y, a.pos.z - pk.point.z)).toBeLessThanOrEqual(ANCHOR_PICK_REACH_BU * bu + 1e-6);
    }
  });

  it('a pick inside the cavity (free space) returns no far wall (the near snap or the wall pick handles it)', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const ch = playerNest(sim)!.chambers.find((c) => c.type === 'nursery')!;
    expect(sim.field.sampleXYZ(ch.center.x, ch.center.y, ch.center.z)).toBeGreaterThan(0);
    expect(wallToward(sim, playerNest(sim)!, { ...ch.center }, ANCHOR_PICK_REACH_BU * sim.world.bu)).toBeNull();
  });

  it('the hover over soil stays within the pointer-move budget, near the nest and far from it (load-tolerant; strict with FOUNDRESS_PERF_STRICT=1)', () => {
    const sim = makeTestSim({ nest: 'small', systems: [] });
    const bu = sim.world.bu;
    const planner = new DigPlanner();
    planner.chamberType = 'nursery'; planner.size = 's';
    const far = { point: { x: sim.world.size * 0.2, y: -10 * bu, z: sim.world.size * 0.2 }, normal: { x: 0, y: 1, z: 0 }, kind: 'cap' as const };
    const time = (pk: ReturnType<typeof soil> | typeof far) => {
      let best = Infinity;
      for (let i = 0; i < 5; i++) {
        // a pointer move: a slightly different point each time (the planner's own cache is per anchor voxel)
        const p = { ...pk, point: { x: pk.point.x + i * 0.13, y: pk.point.y, z: pk.point.z } };
        const t0 = performance.now();
        planner.hover(sim, p);
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    const near = time(soil(sim, 5)), away = time(far);
    // report the numbers (the review quotes them)
    console.log(`planner hover over soil: 5 BU from the wall ${near.toFixed(2)} ms, far from the nest ${away.toFixed(2)} ms`);
    if (!heavyLoad()) {
      expect(near).toBeLessThan(PERF_STRICT ? 2 : 50);
      expect(away).toBeLessThan(PERF_STRICT ? 2 : 50);
    }
  });
});
