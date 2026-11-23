// Direction 27a item 3 (colony-life round 13): kd #2's nursing gap. Larvae lay 0.3 mm inside a nursery floor near its
// rim; nurses 1-6 BU away failed every walk to them ('leg': the point field read infinite at the walker) and were handed
// back to idle after 3 failures a minute. A point field quantises its goal to a pointFieldCellBU cell and seeds the open
// voxels within pointFieldRadiusBU of the cell centre (else the nearest open sample within two voxels): the cell centre
// can lie ~0.87 cell (7 mm for Lasius) from the goal, inside the wall, with nothing to seed. The seed radius now covers
// the quantisation: every goal with open space next to it gets a field that reaches it.

import { describe, expect, it } from 'vitest';
import { NAV_INF } from '@/sim/nest/nav/distanceField';
import { pointField } from './nests';
import { rt } from './runtime';
import { deepestChamber, locoSim, playerNest, v3 } from './testkit';

describe('point fields reach a goal lying just inside a chamber wall', () => {
  it('goals 0.3 mm inside the floor all around a chamber rim: the field is finite at the chamber centre', () => {
    const sim = locoSim({ nest: 'small', workers: 2, sizeBu: 300 });
    const nest = playerNest(sim), c = deepestChamber(nest), r = rt(sim);
    const probe = { x: 0, y: 0, z: 0 };
    let tried = 0, unreachable = 0;
    // points on the floor ellipse at 60-95 % of the radii, pushed down until they are just inside the solid
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * 2 * Math.PI, s = 0.6 + 0.35 * ((k * 7) % 8) / 7;
      const x = c.center.x + s * c.radii.x * Math.cos(a), z = c.center.z + s * c.radii.z * Math.sin(a);
      let y = c.center.y;
      while (y > c.center.y - 2 * c.radii.y && sim.field.sample(v3(x, y, z)) > 0) y -= 0.1;
      const goal = v3(x, y - 0.3, z);
      if (sim.field.sample(goal) >= 0 || !sim.nestNav.nearestOpen(goal, probe)) continue;
      if (Math.hypot(probe.x - goal.x, probe.y - goal.y, probe.z - goal.z) > 1.5) continue; // open space next to it
      tried++;
      const id = pointField(sim, r, goal);
      if (sim.nestNav.distanceAt(id, c.center) >= NAV_INF || !Number.isFinite(sim.nestNav.distanceAt(id, c.center))) unreachable++;
    }
    expect(tried).toBeGreaterThan(20);
    expect(unreachable).toBe(0);
  });
});
