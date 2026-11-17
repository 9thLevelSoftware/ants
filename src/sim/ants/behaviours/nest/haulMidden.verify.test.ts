// Independent review of colony-life round 4, fix M1 (haul.ts `atMidden` measures a surface midden across the ground).
// The 2D rule is meant for items lying ON the ground at the midden (a corpse on a stone). It also takes in anything
// INSIDE the nest whose (x, z) lies within MIDDEN_RADIUS_BU of the surface midden point, whatever its depth: waste on
// the floor of a chamber or tunnel under the midden area then reads "at the midden", gets haul priority 0 and is never
// carried out, so it stays among the brood (the hygiene loss M1 was meant to end). An item in the nest is never at a
// surface midden.
import { describe, expect, it } from 'vitest';
import { spawnItem } from '@/sim/entities';
import { MIDDEN_RADIUS_BU } from '@/sim/balance/nestwork';
import { atMidden, haulPriority } from './haul';
import { middenPoint, onSurface } from './places';
import { makeNestColony } from './testkit';

describe('M1 review: waste inside the nest below the surface midden area', () => {
  it('waste on the floor of a cavity 10 BU below the midden point is a haul job (it is not at the midden)', () => {
    const { sim, nest } = makeNestColony({ workers: 0 });
    const col = sim.state.colonies[0];
    const bu = sim.world.bu;
    const mid = middenPoint(sim, nest, { x: 0, y: 0, z: 0 });
    expect(mid).not.toBeNull();
    expect(nest.chambers.some((c) => c.type === 'midden')).toBe(false); // the surface midden
    // a nest room under the midden area, 10 BU deep (the round-4 long-run nests are 9-12 BU deep)
    const room = { x: mid!.x + 2 * bu, y: mid!.y - 10 * bu, z: mid!.z };
    sim.kernel.carveEllipsoid(room, { x: 4 * bu, y: 1.25 * bu, z: 4 * bu }, { force: true });
    const floor = { x: room.x, y: room.y - 1.25 * bu + 0.2 * bu, z: room.z };
    const waste = spawnItem(sim, {
      kind: 'waste', pos: floor, init: { bulk: 0.05, colony: col.id, nestId: nest.id, chamberId: -1, inNest: true },
    });
    expect(onSurface(sim, waste.pos)).toBe(true); // reachable: it lies on the room's floor
    const dx = waste.pos.x - mid!.x, dz = waste.pos.z - mid!.z;
    expect(Math.sqrt(dx * dx + dz * dz)).toBeLessThan(MIDDEN_RADIUS_BU * bu); // under the midden area
    expect(waste.pos.y).toBeLessThan(mid!.y - 8 * bu); // but 10 BU underground
    expect(atMidden(sim, nest, waste)).toBe(false);
    expect(haulPriority(sim, nest, waste)).toBeGreaterThan(0);
  });
});
