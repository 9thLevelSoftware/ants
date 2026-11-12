import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { weighFactors } from './diagFactors';

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
      'diag-hygiene', 'diag-mortality', 'diag-queen-condition', 'diag-stores', 'diag-workforce',
    ]);
  });
});
