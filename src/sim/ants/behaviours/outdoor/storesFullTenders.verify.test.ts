// Independent review after colony-life round 6 (fix SF, `tendHerd.ts` departForHerd): a herd tender leaves the nest
// only while the pool's carbohydrate room covers her crop and the crops of the colony's tenders "already out". The
// fix counts a tender as out once she is outside the nest (`nestId < 0`): a tender who has decided to go and is still
// walking up the tunnel is not counted, so the next waiting tender sees the same room and leaves too (the v1 failure
// the ledger records: "the 3 tenders left together whenever a crop's room opened").
//
// Check: pool room for 1.5 crops, tenders assigned and waiting in the nest. Every departure is checked against the
// rule at the tick it happens, counting as out every tender already on her way (left the nest or in the herd branch).
// Round 7: each tender's own crop (CROP_RETURN_FRACTION x her crop capacity; workers differ in size) is summed, as the
// rule reads; the review's version used the first worker's crop for every tender, which flags a small tender whose
// own crop fits the room.

import { describe, expect, it } from 'vitest';
import { colonySlotBit } from '@/sim/entities';
import { herdSourceOf } from '@/sim/ecology';
import { poolSpace } from '@/sim/colony';
import { CROP_RETURN_FRACTION } from '@/sim/balance/actions';
import { addHerd, fixWeather, plantSim, stepTicks } from '@/sim/ecology/plants/testkit';
import { TICKS_PER_DAY } from '@/sim/time';
import { herdActive } from './tendHerdStates';

describe('SF review: tenders do not leave together into room for one crop', () => {
  it('pool room for 1.5 crops: no tender departs while the tenders already on their way fill that room', () => {
    const restoreWeather = fixWeather(22);
    try {
      const { sim, plants } = plantSim({ workers: 12, sizeBu: 200, herbs: [{ dx: -20, dz: -30 }], seed: 2 });
      const col = sim.state.colonies[0];
      const h = addHerd(sim, plants[0], 100);
      herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
      // stores full first: tenders are assigned and wait in the nest (the round's own test shows none goes out)
      sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 500, p: 5, toxin: 0 });
      sim.applyPendingCommands();
      stepTicks(sim, Math.round(0.1 * TICKS_PER_DAY));
      const worker = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
      const crop = CROP_RETURN_FRACTION * worker.cropCap;
      // room for 1.5 crops of carbohydrate
      sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: 0, p: 0.3 });
      sim.applyPendingCommands();
      const roomEmpty = poolSpace(col).c;
      sim.enqueue({ type: 'cheat.setStores', colonyId: col.id, c: Math.max(0, roomEmpty - 1.5 * crop), p: 0.3 });
      sim.applyPendingCommands();
      const room0 = poolSpace(col).c;

      const onWay = (a: (typeof sim.state.ants)[number]): boolean => a.alive && a.task === 'tend' && (a.nestId < 0 || herdActive(a));
      let prev = new Set(sim.state.ants.filter(onWay).map((a) => a.id));
      const departures: string[] = [];
      let violations = 0;
      for (let t = 0; t < Math.round(0.1 * TICKS_PER_DAY); t++) {
        const roomBefore = poolSpace(col).c;
        stepTicks(sim, 1);
        const now = new Set(sim.state.ants.filter(onWay).map((a) => a.id));
        const cropOf = (id: number): number => CROP_RETURN_FRACTION * sim.state.ants.find((a) => a.id === id)!.cropCap;
        let already = [...prev].filter((id) => now.has(id)).reduce((sum, id) => sum + cropOf(id), 0);
        for (const id of now) {
          if (prev.has(id)) continue;
          const ok = roomBefore >= already + cropOf(id) - 1e-9;
          if (!ok) violations++;
          departures.push(`t${t} ant ${id}: room ${roomBefore.toFixed(2)} crops on the way ${already.toFixed(2)} hers ${cropOf(id).toFixed(2)}${ok ? '' : ' VIOLATION'}`);
          already += cropOf(id);
        }
        prev = now;
      }
      const msg = `crop ${crop.toFixed(2)}, room at start ${room0.toFixed(2)}; departures: ${departures.join(' | ')}`;
      expect(departures.length, msg).toBeGreaterThan(0); // there is room for one: one goes
      expect(violations, msg).toBe(0);
    } finally {
      restoreWeather();
    }
  }, 120_000);
});
