// Independent review of colony-life round 4, fix L1 (ruling R21, the larder of a small nest), together with the R2
// hand-over provision (handover.ts provisionAtHandover: the queen's reserve above her keep is credited to the pool;
// "what the pool cannot hold stays in the queen and is moved on a later cycle, once there is room").
//
// Before L1 a nest without a food chamber held P only in the workers' social stomachs (0.15 per worker), so most of the
// queen's hand-over protein stayed in her body and went into the pool as the larvae ate it. With L1 the larder (at
// least 4 loads per nutrient) takes it at once, as a pile on the brood chamber's floor, where it spoils (P half-life
// 3 gd at 20 C) and each 0.5 load spoiled is a waste item among the brood. The spoiled protein is refilled from the
// queen until her reserve is spent. Probe on the sweep-4 hand-over car-park-verge #1 (11 workers, queen reserve P
// 11.45): 1.98 P of the provision spoiled in the 1.6 gd before the first larva hatched (round-4 tree), 0 without L1.
// The rule the test states: protein the queen carries for the brood is not lost to rot before a larva can eat it.
import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, colonyOf, establishQueen, makeColonySim, step } from './testkit';

describe('L1 review: the hand-over provision and the larder', () => {
  it('a royal-only nest with eggs (no larva yet) loses none of the queen\'s hand-over protein to spoilage in 1.5 gd', () => {
    const sim = makeColonySim({ climate: { chamberTemp: () => 20 } });
    const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 0); // pile capacity 0 outside food chambers (GDD 03 §6.4)
    const q = establishQueen(sim, royal);
    q.queen!.reserve = 6;
    q.queen!.reserveP = 11.45; // car-park-verge #1 at its hand-over
    addWorkers(sim, 11, { chamber: royal, ageGd: 1 });
    addBrood(sim, 'egg', 13, royal);
    const op = sim.state.player.opening!;
    op.phase = 'done';
    op.done = true;
    op.lapse = { startTick: 0, endTick: sim.state.tick, skipped: false, outcome: '' };
    sim.enqueue({ type: 'cheat.setStores', colonyId: colonyOf(sim).id, c: 4, p: 0 });
    sim.applyPendingCommands();
    const col = colonyOf(sim);
    const life = (col.core as unknown as { life: Record<string, number> });
    step(sim, 20);
    const spoiled0 = life.life.outSpoiledP ?? 0;
    step(sim, Math.round(1.5 * TICKS_PER_DAY));
    const spoiledP = (life.life.outSpoiledP ?? 0) - spoiled0;
    const items = sim.state.items.filter((i) => i.alive && i.wasteKind === 'spoiled-food' && i.chamberId === royal.id).length;
    const msg = JSON.stringify({ spoiledP, items, poolP: col.stores.p, queenP: q.queen!.reserveP, larderP: col.core!.larderP });
    expect(sim.state.brood.filter((b) => b.alive && b.stage === 'larva').length, msg).toBe(0); // nobody to feed yet
    expect(spoiledP, msg).toBeLessThan(0.05);
    expect(items, msg).toBe(0);
  }, 60_000);
});
