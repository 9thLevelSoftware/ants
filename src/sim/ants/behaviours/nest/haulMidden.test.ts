// Colony-life round 4 (suburban-garden #2): a surface midden point takes the terrain's height, but a corpse put down
// there lies on whatever is at that spot (there: a stone, 32 mm = 8 BU above the terrain). Measured in 3D it was "not
// at the midden", stayed a priority-3 haul job, and the haulers carried the same two corpses back and forth for the rest
// of the run while 23 waste items among the brood were never taken out. A surface midden is an area of ground: an item
// within MIDDEN_RADIUS_BU across it is at the midden whatever it lies on.
import { describe, expect, it } from 'vitest';
import { spawnItem } from '@/sim/entities';
import { MIDDEN_RADIUS_BU } from '@/sim/balance/nestwork';
import { atMidden } from './haul';
import { middenPoint } from './places';
import { makeNestColony } from './testkit';

describe('an item lying at the surface midden is at the midden whatever it lies on (round 4)', () => {
  it('8 BU above the midden point (on a stone) it is at the midden; 2 midden radii away across the ground it is not', () => {
    const { sim, nest } = makeNestColony({ workers: 0 });
    const col = sim.state.colonies[0];
    const bu = sim.world.bu;
    const mid = middenPoint(sim, nest, { x: 0, y: 0, z: 0 });
    expect(mid).not.toBeNull();
    expect(nest.chambers.some((c) => c.type === 'midden')).toBe(false); // the surface midden
    const corpse = (x: number, y: number, z: number) => spawnItem(sim, {
      kind: 'corpse', pos: { x, y, z }, init: { bulk: 0.5, colony: col.id, nestId: -1, chamberId: -1, inNest: false },
    });
    // positions as the haulers left them (no tick in between: the item is judged where it lies)
    expect(atMidden(sim, nest, corpse(mid!.x + 0.5 * bu, mid!.y + 8 * bu, mid!.z))).toBe(true);
    expect(atMidden(sim, nest, corpse(mid!.x + 2 * MIDDEN_RADIUS_BU * bu, mid!.y, mid!.z))).toBe(false);
  });
});
