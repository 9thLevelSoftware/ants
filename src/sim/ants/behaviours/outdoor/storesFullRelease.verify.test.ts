// Independent review after colony-life round 7 (fix SF3, `tendHerd.ts`): a tender who may not leave because the pool
// has no room for her crop is "held" and runs the engine's wait with no honeydew source acceptable (`heldEngine`).
// Two ways that could go wrong, checked here:
//  1. liveness: once the room opens, held tenders must leave for their herd again (the held engine must not have
//     moved them off the task or parked them for good);
//  2. determinism: the room rule reads a per-tick runtime cache (`cropsOnTheWay`) that every departure adds to; a game
//     saved and loaded while tenders are held and leaving must continue as the uninterrupted one.

import { describe, expect, it } from 'vitest';
import { colonySlotBit } from '@/sim/entities';
import { herdSourceOf } from '@/sim/ecology';
import { poolSpace } from '@/sim/colony';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { addHerd, fixWeather, plantSim, stepTicks } from '@/sim/ecology/plants/testkit';
import { TICKS_PER_DAY } from '@/sim/time';
import { herdActive } from './tendHerdStates';

type TestSim = ReturnType<typeof plantSim>['sim'];

/** A colony with a known herd whose tenders wait in the nest because the pool is full. */
function heldColony(): { sim: TestSim; colonyId: number } {
  const { sim, plants } = plantSim({ workers: 12, sizeBu: 200, herbs: [{ dx: -20, dz: -30 }], seed: 2 });
  const col = sim.state.colonies[0];
  const h = addHerd(sim, plants[0], 100);
  herdSourceOf(sim, h)!.discoveredBy |= colonySlotBit(sim, col.id);
  sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 500, p: 5, toxin: 0 });
  sim.applyPendingCommands();
  stepTicks(sim, Math.round(0.1 * TICKS_PER_DAY));
  return { sim, colonyId: col.id };
}

const onWay = (a: TestSim['state']['ants'][number]): boolean => a.alive && a.task === 'tend' && (a.nestId < 0 || herdActive(a));

describe('SF3 review: held tenders', () => {
  it('a tender held while the pool is full leaves for her herd once the room opens', () => {
    const restoreWeather = fixWeather(22);
    try {
      const { sim, colonyId } = heldColony();
      const col = sim.stores.colonies.get(colonyId)!;
      // full pool: no room for any crop, held for a further 0.1 gd
      sim.enqueue({ type: 'cheat.setStores', colonyId, c: col.stores.c + poolSpace(col).c, p: 0.3 });
      sim.applyPendingCommands();
      stepTicks(sim, Math.round(0.1 * TICKS_PER_DAY));
      const tendersHeld = sim.state.ants.filter((a) => a.alive && a.task === 'tend' && a.nestId >= 0 && !herdActive(a)).length;
      // the room opens: the pool is emptied
      sim.enqueue({ type: 'cheat.setStores', colonyId, c: 0, p: 0.3 });
      sim.applyPendingCommands();
      const before = new Set(sim.state.ants.filter(onWay).map((a) => a.id));
      const left = new Set<number>();
      for (let t = 0; t < Math.round(0.1 * TICKS_PER_DAY); t++) {
        stepTicks(sim, 1);
        for (const a of sim.state.ants) if (onWay(a) && !before.has(a.id)) left.add(a.id);
      }
      const msg = `tenders held in the nest when the room opened: ${tendersHeld}; on their way before: ${before.size}; left after: ${left.size}`;
      expect(tendersHeld, msg).toBeGreaterThan(0); // the precondition: someone was held
      expect(left.size, msg).toBeGreaterThan(0);
    } finally {
      restoreWeather();
    }
  }, 120_000);

  it('save -> load while tenders are held and leaving: the loaded game continues as the uninterrupted one', () => {
    const restoreWeather = fixWeather(22);
    try {
      const { sim, colonyId } = heldColony();
      const col = sim.stores.colonies.get(colonyId)!;
      // room for about two crops: some tenders go, the rest are held
      sim.enqueue({ type: 'cheat.setStores', colonyId, c: 0, p: 0.3 });
      sim.applyPendingCommands();
      const roomEmpty = poolSpace(col).c;
      sim.enqueue({ type: 'cheat.setStores', colonyId, c: Math.max(0, roomEmpty - 1.2), p: 0.3 });
      sim.applyPendingCommands();
      stepTicks(sim, 5);
      const loaded = createSim(restore(snapshot(sim)).state, sim.world);
      const diffs: number[] = [];
      for (let t = 1; t <= 600; t++) {
        sim.tick();
        loaded.tick();
        if (t % 20 === 0 && stateHash(sim.state) !== stateHash(loaded.state)) diffs.push(t);
      }
      expect(diffs, `ticks after the load with a different state hash: ${diffs.join(', ')}`).toEqual([]);
    } finally {
      restoreWeather();
    }
  }, 120_000);
});
