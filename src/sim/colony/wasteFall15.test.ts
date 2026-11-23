// Colony-life round 15 (direction 30 item 2). (1) Waste a save holds inside the floor (spoiled food spawned at the
// registry ellipsoid's bottom before this round: kd #3's royal chamber counted 9 such items, all 0.32-0.35 BU inside
// the floor, haul priority 0) rides up onto the floor at the next colony cycle and becomes a haul job. (2) The spawn
// side of round 14's fall, untested until now (sweep 14's minor finding): brood waste made where the brood is held up
// (under a ceiling, carried) is put on the floor under it at once, not left in the air for the next cycle.
import { describe, expect, it } from 'vitest';
import type { Brood, Item, Sim } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { haulPriority } from '@/sim/ants/behaviours/nest/haul';
import { onSurface } from '@/sim/ants/behaviours/nest/places';
import { makeNestColony } from '@/sim/ants/behaviours/nest/testkit';
import { ITEM_BURIED_BU } from '@/sim/balance/nest';
import { broodDies } from './brood';
import { chamberFloorUnder, settleHangingWaste } from './wasteFall';

const UP = { x: 0, y: 1, z: 0 };

function wasteItems(sim: Sim): Item[] {
  return sim.stores.items.list.filter((it) => it.alive && it.kind === 'waste');
}

describe('buried and held-up waste (round 15)', () => {
  it('spoiled food buried in the floor (a save of round 14) is lifted onto the floor and hauled', () => {
    const k = makeNestColony({ workers: 0 });
    const { sim, nest, royal } = k;
    const col = sim.state.colonies[0], bu = sim.world.bu;
    const floor = chamberFloorUnder(sim, royal);
    // as deep as kd #3's: the field reads -0.33 BU there
    const pos = { x: floor.x, y: floor.y, z: floor.z };
    while (sim.field.sample(pos) > -0.33 * bu) pos.y -= 0.02 * bu;
    const it = spawnItem(sim, { kind: 'waste', pos });
    Object.assign(it, { wasteKind: 'spoiled-food', bulk: 0.05, nestId: nest.id, chamberId: royal.id, inNest: true, colony: col.id });
    expect(sim.field.sample(it.pos)).toBeLessThan(-ITEM_BURIED_BU * bu);
    expect(onSurface(sim, it.pos)).toBe(false);
    expect(haulPriority(sim, nest, it)).toBe(0);
    expect(settleHangingWaste(sim, col)).toBe(1);
    expect(onSurface(sim, it.pos)).toBe(true);
    expect(Math.abs(it.pos.y - floor.y)).toBeLessThan(0.5 * bu);
    expect(it.chamberId).toBe(royal.id);
    expect(haulPriority(sim, nest, it)).toBeGreaterThan(0);
    expect(settleHangingWaste(sim, col)).toBe(0); // on the floor: nothing moves again
  });

  it('a larva dying under the royal chamber\'s ceiling leaves its corpse on the floor at once', () => {
    const k = makeNestColony({ workers: 0, brood: [{ stage: 'larva', n: 1, chamber: 'royal' }] });
    const { sim, royal } = k;
    const b: Brood = sim.stores.brood.list.find((x) => x.alive)!;
    const up = sim.field.sphereTrace(royal.center, UP, 20 * sim.world.bu, 0);
    b.pos = { x: royal.center.x, y: royal.center.y + up - 0.11, z: royal.center.z }; // held up under the ceiling
    expect(onSurface(sim, b.pos)).toBe(false);
    const before = wasteItems(sim).length;
    broodDies(sim, b, 'starvation');
    const made = wasteItems(sim).slice(before);
    expect(made.length).toBe(1);
    expect(onSurface(sim, made[0].pos)).toBe(true);
    expect(made[0].pos.y).toBeLessThan(royal.center.y);
  });
});
