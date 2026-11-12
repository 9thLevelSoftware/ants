import { describe, expect, it } from 'vitest';
import { rngFork, rngFloat, rngRange } from '@/core/rng';
import type { System } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim } from './testkit';
import { depositFood, withdrawFood } from './index';
import { coreOf, ledgerNet } from './core';

/** Random deliveries and withdrawals of every purpose. */
function randomFlows(seed: number): System {
  const rng = rngFork(seed, 'ledger-test');
  return {
    name: 'test-flows', phase: 'behaviours',
    run(sim) {
      const col = colonyOf(sim);
      const r = rngFloat(rng);
      if (r < 0.02) depositFood(sim, col.id, rngRange(rng, 0, 1), rngRange(rng, 0, 0.5), rngRange(rng, 0, 0.01));
      else if (r < 0.025) withdrawFood(sim, col.id, rngRange(rng, 0, 0.3), rngRange(rng, 0, 0.2), 'ration');
      else if (r < 0.03) withdrawFood(sim, col.id, rngRange(rng, 0, 0.3), rngRange(rng, 0, 0.2), 'queen');
      else if (r < 0.031) depositFood(sim, col.id, 0.05, 0.05, 0, 'transit-return');
      else if (r < 0.032) sim.enqueue({ type: 'cheat.addFood', colonyId: col.id, c: 1, p: 1, toxin: 0 });
    },
  };
}

describe('food ledger (GDD 02 §5.2, E21, AC4)', () => {
  it('over 5 gd of random flows, initial stock + inflows - outflows = final stock to 1e-6 loads', { timeout: 60000 }, () => {
    const sim = makeColonySim({ extra: [careSystem({ feedLarvae: true, tend: true, assist: true, lay: true, feedQueen: true }), randomFlows(3)] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 30);
    addChamber(sim, 'food', { x: 140, y: -40, z: 100 }, 30);
    establishQueen(sim, ch);
    addWorkers(sim, 40, { chamber: ch });
    addWorkers(sim, 10, { chamber: null, task: 'forage', state: 'forage.outbound' });
    addBrood(sim, 'egg', 10, ch);
    addBrood(sim, 'larva', 8, ch, 0.3);
    addBrood(sim, 'pupa', 6, ch, 0.5);
    sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 30, p: 12, toxin: 0 });
    sim.tick();
    const col = colonyOf(sim);
    const start = { c: col.stores.c, p: col.stores.p };
    const lifeStart = ledgerNet(coreOf(col).life);
    let minStock = Infinity;
    let negatives = 0;
    for (let t = 0; t < 5 * TICKS_PER_DAY; t++) {
      sim.tick();
      minStock = Math.min(minStock, col.stores.c, col.stores.p);
      if (t % 100 === 0) {
        for (const a of sim.state.ants) if (a.alive && (a.cropC < 0 || a.cropP < 0 || a.energy < 0)) negatives++;
      }
    }
    const life = ledgerNet(coreOf(col).life);
    expect(Math.abs(start.c + (life.c - lifeStart.c) - col.stores.c)).toBeLessThan(1e-6);
    expect(Math.abs(start.p + (life.p - lifeStart.p) - col.stores.p)).toBeLessThan(1e-6);
    expect(minStock).toBeGreaterThanOrEqual(0);
    expect(negatives).toBe(0);
    for (const b of sim.state.brood) if (b.alive) expect(b.gutC >= 0 && b.gutP >= 0).toBe(true);
    // The flows were real: spoilage, worker upkeep, larvae and the queen all booked.
    const l = coreOf(col).life;
    expect(l.outWorkersC).toBeGreaterThan(1);
    expect(l.outLarvaeP).toBeGreaterThan(1);
    expect(l.outQueenP).toBeGreaterThan(0.1);
    expect(l.outSpoiledP + l.outSpoiledC).toBeGreaterThan(0);
    expect(sim.state.progression.history.daily['ledger:outWorkersC']?.length).toBe(5);
  });
});
