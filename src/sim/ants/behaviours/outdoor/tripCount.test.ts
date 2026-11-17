// A trip is a trip outside (colony-life round 2): an ant that becomes a forager or tender while it stands in the nest
// with a full crop (a nurse or store worker reassigned, deliver first) unloads that crop, but it brought nothing in
// and went nowhere. Before, its unloading ended a "trip" (colony trip counters, recruitment contacts, ant.mem.trips)
// and booked the crop as a delivery: 116 failed "tend trips" in one life run and false intake.

import { describe, expect, it } from 'vitest';
import type { Ant } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { makeNestColony } from '../nest/testkit';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

describe('trip counting', () => {
  it('a forager made in the nest with a full crop unloads it without a trip or a delivery', () => {
    const k = makeNestColony({ workers: 3, systems: NO_ALLOC, stores: { c: 2, p: 0.2 } });
    const { sim } = k;
    const col = sim.stores.colonies.list[0];
    const workers = sim.stores.ants.list.filter((x) => x.caste === 'worker');
    const a: Ant = workers[0];
    a.cropC = 0.8 * a.cropCap;
    a.task = 'forage';
    let deliveries = 0;
    sim.events.on('delivery', (e) => { if (e.antId === a.id) deliveries++; });
    const trips0 = col.counters.trips;
    // until the unloading is over (the ant was in forage.deliver and left it)
    let t = 0, delivering = false;
    for (; t < 4000; t++) {
      sim.tick();
      if (a.state === 'forage.deliver') delivering = true;
      else if (delivering) break;
    }
    const info = JSON.stringify({ t, crop: a.cropC, state: a.state, trips: col.counters.trips - trips0, deliveries, mem: a.mem.trips });
    expect(t, info).toBeLessThan(4000); // it did unload
    expect(a.cropC, info).toBeLessThan(0.5 * a.cropCap);
    expect(a.nestId, info).toBeGreaterThanOrEqual(0);
    expect(col.counters.trips - trips0, info).toBe(0);
    expect(a.mem.trips, info).toBe(0);
    expect(deliveries, info).toBe(0);
  }, 60_000);
});
