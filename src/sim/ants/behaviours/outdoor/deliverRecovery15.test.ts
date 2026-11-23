// Colony-life round 15 (direction 30 item 1b): a deliverer whose walk to the delivery chamber fails does not ask for
// the same walk for ever. In woodland-edge #1 (sweep 14) 2-8 of 22 workers stood with full crops in the entrance throat
// for game days: updateDeliver re-requested the failed leg every tick and the phase timed out and began again in place.
// Here the entrance chamber's field is made to read Infinity everywhere (the leg can never be walked): the deliverer
// must re-plan to another chamber or hand her crop on, and empty it well within one DELIVER_MAX_S.

import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { DELIVER_MAX_S } from '@/sim/balance/foraging';
import { TICKS_PER_SECOND } from '@/sim/time';
import { placeOnSurface } from '@/sim/locomotion';
import { makeNestColony } from '../nest/testkit';
import { floorPoint } from '../nest/places';
import { entranceChamber } from './common';
import { K, UNLOAD } from './keys';

const NO_ALLOC = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');

/** Makes one nest field unreachable from everywhere (a leg on it fails at once, as in the throat). */
function blindField(sim: Sim, id: string): void {
  const nav = sim.nestNav;
  const { distanceAt, lookahead, stepDir, distance } = nav;
  nav.distanceAt = (f, p) => (f === id ? Infinity : distanceAt(f, p));
  nav.lookahead = (f, p, steps, out) => (f === id ? Infinity : lookahead(f, p, steps, out));
  nav.stepDir = (f, p, out) => (f === id ? Infinity : stepDir(f, p, out));
  nav.distance = (n, t, p) => (nestFieldId(n, t) === id ? -1 : distance(n, t, p));
}

describe('delivery: a failed walk to the chamber is not asked for again for ever (round 15)', () => {
  it('a forager with a full crop whose chamber cannot be reached unloads it within one DELIVER_MAX_S', () => {
    const k = makeNestColony({ workers: 4, systems: NO_ALLOC, stores: { c: 2, p: 0.2 } });
    const { sim, nest, royal } = k;
    const room = entranceChamber(nest)!;
    blindField(sim, nestFieldId(nest.id, { kind: 'chamber', id: room.id }));
    const workers = sim.stores.ants.list.filter((x) => x.caste === 'worker');
    const a: Ant = workers[0];
    // she stands in the royal chamber, a walk away from the entrance chamber
    expect(placeOnSurface(sim, a, floorPoint(royal, 0.5, 0, { x: 0, y: 0, z: 0 }), { x: 0, y: -1, z: 0 })).toBe(true);
    a.nestId = nest.id;
    a.chamberId = royal.id;
    a.cropC = 0.8 * a.cropCap;
    const crop0 = a.cropC;
    a.task = 'forage';
    let failedToChamber = 0, longestFailed = 0, run = 0, deliverTicks = 0, t = 0;
    const limit = 2 * DELIVER_MAX_S * TICKS_PER_SECOND;
    for (; t < limit; t++) {
      sim.tick();
      if (a.state !== 'forage.deliver') { if (deliverTicks > 0 && a.cropC < 0.5 * crop0) break; continue; }
      deliverTicks++;
      const stuck = (a.bb[K.unload] ?? UNLOAD.toChamber) === UNLOAD.toChamber && a.nav.status === 'failed';
      if (stuck) { failedToChamber++; run++; longestFailed = Math.max(longestFailed, run); } else run = 0;
      if (a.cropC < 0.5 * crop0) break;
    }
    const info = JSON.stringify({ t, deliverTicks, failedToChamber, longestFailed, crop: a.cropC, state: a.state, step: a.bb[K.unload], fails: a.bb[K.legFails] });
    expect(deliverTicks, info).toBeGreaterThan(0);
    // the crop went to the colony (a nestmate or the pool), not kept for a rest and another round in place
    expect(a.cropC, info).toBeLessThan(0.5 * crop0);
    expect(t, info).toBeLessThan(DELIVER_MAX_S * TICKS_PER_SECOND);
    // never standing on a failed walk for more than a moment
    expect(longestFailed, info).toBeLessThanOrEqual(2);
  }, 60_000);
});
