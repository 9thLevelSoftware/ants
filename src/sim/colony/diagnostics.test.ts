import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { weighFactors } from './diagFactors';
import { recordDelivery } from './activation';
import type { Sim } from '@/sim/types';

/** Remedy id scheme of 00-index §B. */
const REMEDY = /^remedy\.(slider\.(forage|nurse|dig|defend)|diet\.(carbohydrate|protein)|marker\.[a-z-]+|dig\.[a-z-]+|possess\.[a-z-]+|stock\.[a-z]+)$/;

const diagOf = (sim: Sim, id: string) => sim.state.progression.diagnostics.find((x) => x.id === id)!;
const factorOf = (sim: Sim, id: string, cause: string) => diagOf(sim, id).factors.find((f) => f.cause === cause);

describe('diagnostics (GDD 02 §14)', () => {
  it('factor weights are ln-shares over factors below 0.98 and sum to 1', () => {
    const f = weighFactors([
      { cause: 'a', f: 0.5, detail: '' }, { cause: 'b', f: 0.25, detail: '' }, { cause: 'c', f: 0.99, detail: '' },
    ]);
    expect(f.map((x) => x.cause)).toEqual(['b', 'a']);
    expect(f[0].weight).toBeCloseTo(2 / 3, 6);
    expect(f.reduce((s, x) => s + x.weight, 0)).toBeCloseTo(1, 9);
  });

  it('E24: with the only nursery at 15 °C brood growth is bad (ratio ~0.28) with temperature weight >= 0.8', () => {
    const sim = makeColonySim({ climate: { chamberTemp: () => 15 }, extra: [careSystem({ tend: true, feedLarvae: true, feedQueen: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 300);
    establishQueen(sim, ch);
    addWorkers(sim, 40, { chamber: ch, ageGd: 2 });
    addBrood(sim, 'larva', 10, ch, 0.1);
    sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 100, p: 60, toxin: 0 });
    step(sim, Math.round(0.3 * TICKS_PER_DAY));
    const d = sim.state.progression.diagnostics.find((x) => x.id === 'diag-brood-growth')!;
    expect(d.status).toBe('bad');
    expect(d.value).toBeCloseTo(0.455 / 1.636, 1);
    expect(d.factors[0].cause).toBe('temperature');
    expect(d.factors[0].weight).toBeGreaterThanOrEqual(0.8);
    expect(d.remedies).toContain('remedy.marker.move-brood');
  });

  it('publishes every colony diagnostic id with the diag- prefix', () => {
    const sim = makeColonySim({ extra: [careSystem({ tend: true, feedLarvae: true, feedQueen: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 300);
    establishQueen(sim, ch);
    addWorkers(sim, 20, { chamber: ch });
    step(sim, 600);
    const ids = sim.state.progression.diagnostics.map((d) => d.id).sort();
    expect(ids).toEqual([
      'diag-brood-growth', 'diag-egg-laying', 'diag-food-intake-c', 'diag-food-intake-p', 'diag-foraging-trails',
      'diag-hygiene', 'diag-mortality', 'diag-nest-space', 'diag-queen-condition', 'diag-stores', 'diag-workforce',
    ]); // diag-nest-space (GDD 03 App. D) is published with them, for the colony's main nest (sim-fix-colony)
  });

  it('every remedy id follows the registry scheme', () => {
    const sim = makeColonySim({ extra: [careSystem({ tend: true, feedLarvae: true, feedQueen: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 300);
    establishQueen(sim, ch);
    addWorkers(sim, 20, { chamber: ch });
    addBrood(sim, 'larva', 10, ch, 0.1);
    sim.enqueue({ type: 'setDirectives', allocation: { forage: 100, nurse: 0, dig: 0, defend: 0 } });
    step(sim, 600);
    for (const d of sim.state.progression.diagnostics) for (const r of d.remedies) expect(r, d.id).toMatch(REMEDY);
  });

  it('§14 factors: crowding, manual-conflict, washed, unloading and predation are reported', () => {
    const sim = makeColonySim({ climate: { rain: () => 0.8 }, extra: [careSystem({ tend: true, feedLarvae: true, feedQueen: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 300);
    ch.capacity.brood = 10;
    establishQueen(sim, ch);
    const ws = addWorkers(sim, 30, { chamber: ch, ageGd: 8 });
    addBrood(sim, 'larva', 12, ch, 0.1); // 1.2 x capacity: crowd 1
    sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 30, p: 10, toxin: 0 });
    sim.enqueue({ type: 'setDirectives', allocation: { forage: 100, nurse: 0, dig: 0, defend: 0 } });
    step(sim, 20);
    const col = colonyOf(sim);
    col.counters.trips = 20; col.counters.tripSuccesses = 15; col.counters.tripTicks = 20 * 1500; // 150 s trips
    recordDelivery(sim, ws[0], 5, 'honeydew', 0.5, 0, 0, 750); // 75 s waiting to unload
    sim.enqueue({ type: 'cheat.kill', id: ws[1].id, cause: 'bird' });
    step(sim, 600);
    expect(factorOf(sim, 'diag-brood-growth', 'crowding')).toBeDefined();
    expect(factorOf(sim, 'diag-workforce', 'manual-conflict')).toBeDefined();
    expect(factorOf(sim, 'diag-foraging-trails', 'washed')).toBeDefined();
    expect(factorOf(sim, 'diag-food-intake-c', 'unloading')).toBeDefined();
    expect(factorOf(sim, 'diag-food-intake-c', 'predation')!.detail).toContain('1 forager');
  });
});
