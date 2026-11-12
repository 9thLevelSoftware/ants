// Reviewer test (beh-nest `store.shift`): a nest whose only food store is a `general` chamber that is also the
// entrance chamber (foodChamber() falls back to it), with the pool full (put-down books nothing, the item stays).
// storeJobs() lists every food item lying in the entrance chamber that is not in a `food`-type chamber, and
// shift() delivers it into foodChamber() = the same chamber, so the same item is picked up and put down again and
// again. Expectation: an item that cannot be stored is handled at most a couple of times, not in an endless loop.
import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { spawnItem } from '@/sim/entities';
import { entranceChamber, foodChamber, pileSlot } from './places';
import { makeNestColony, run } from './testkit';

describe('reviewer: store.shift with a full pool and no food chamber', () => {
  it('does not shift the same food item back and forth in the entrance chamber', () => {
    const k = makeNestColony({ workers: 30, stores: { c: 10, p: 10 } });
    const { sim, nest, food } = k;
    food.type = 'general'; // e.g. a young nest: the shallow chamber stores food but is not typed `food`
    run(sim, 600); // store ants assigned
    const room = entranceChamber(sim, nest)!;
    expect(room.id).toBe(food.id);
    expect(foodChamber(sim, nest, room.center)!.id).toBe(food.id);
    const col = sim.state.colonies[0];
    sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 1e6, p: 1e6 });
    sim.applyPendingCommands();
    const crumb = spawnItem(sim, {
      kind: 'food-piece', pos: pileSlot(room, 0, 3, sim.world.bu, { x: 0, y: 0, z: 0 }),
      init: { foodKind: 'crumb', c: 0.35, p: 0.15, bulk: 0.5, colony: -1, nestId: nest.id, chamberId: room.id, inNest: true },
    });
    let pickups = 0, carried = false;
    for (let t = 0; t < 1200; t++) {
      sim.tick();
      const it = sim.stores.items.get(crumb.id);
      if (!it) break;
      const now = it.carrierIds.length > 0;
      if (now && !carried) pickups++;
      carried = now;
    }
    const stores = antsStore(sim);
    console.log('[verify store loop]', JSON.stringify({ pickups, alive: sim.stores.items.has(crumb.id), stores, pool: { c: col.stores.c, p: col.stores.p } }));
    expect(stores).toBeGreaterThan(0);
    expect(pickups).toBeLessThanOrEqual(2);
  }, 300_000);
});

function antsStore(sim: Sim): number {
  return sim.stores.ants.list.filter((a) => a.alive && a.task === 'store').length;
}
