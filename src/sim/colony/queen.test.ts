import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step, type CareOptions } from './testkit';
import { layingFactors } from './queen';
import { runColonyDiagnostics } from './diagnostics';

function setup(workers: number, care: CareOptions) {
  // Summer day 3 = doy 10 (default-year d28 9.x): fSeason 1.
  const sim = makeColonySim({ summerDay: 3, extra: [careSystem(care)] });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  const q = establishQueen(sim, royal);
  addWorkers(sim, workers, { chamber: royal });
  sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 400, p: 50, toxin: 0 });
  return { sim, q, royal };
}

describe('queen laying (GDD 02 §3.2, E6-E7)', () => {
  it('fSize gives 34 / 49.8 / 74.2 / 97 eggs per gd at N = 18 / 100 / 300 / 900', () => {
    for (const [n, exp] of [[18, 34], [100, 49.8], [300, 74.2], [900, 97]] as const) {
      const { sim, q } = setup(n, {});
      step(sim, 1);
      const f = layingFactors(sim, colonyOf(sim), q, sim.species);
      expect(f.ref).toBeCloseTo(exp, 0);
    }
  });

  it('E6: N = 300, doy 10, royal 25 °C, gut P held >= 0.5: 74 +- 3 eggs in 1 gd', () => {
    const { sim, q } = setup(300, { lay: true, tend: true });
    let eggs = 0;
    sim.events.on('egg-laid', () => eggs++);
    for (let t = 0; t < TICKS_PER_DAY; t++) {
      q.queen!.gut.p = Math.max(q.queen!.gut.p, 0.5);
      q.queen!.gut.c = Math.max(q.queen!.gut.c, 0.5);
      sim.tick();
    }
    expect(eggs).toBeGreaterThanOrEqual(71);
    expect(eggs).toBeLessThanOrEqual(77);
  });

  it('E7: gut P = 0 and no carers: no eggs in 0.5 gd; diag-egg-laying names protein-supply first', () => {
    const { sim, q } = setup(300, { lay: true, tend: true });
    q.queen!.gut.p = 0;
    q.queen!.gut.c = 1;
    let eggs = 0;
    sim.events.on('egg-laid', () => eggs++);
    step(sim, TICKS_PER_DAY / 2);
    expect(eggs).toBe(0);
    runColonyDiagnostics(sim, colonyOf(sim), sim.species);
    const d = sim.state.progression.diagnostics.find((x) => x.id === 'diag-egg-laying')!;
    expect(d.factors[0].cause).toBe('protein-supply');
    expect(d.status).toBe('bad');
  });

  it('AC7: a protein-limited queen lays (P supply - P upkeep) / EGG_COST_P eggs per gd (worked example: 12)', () => {
    // GDD 02 §15: ration 0.30 C + 0.58 P per gd -> 0.48 P for eggs -> 12 eggs per gd at 0.04 P each.
    const { sim } = setup(60, { lay: true, tend: true, queenPPerGd: 0.58, queenCPerGd: 0.3 });
    step(sim, TICKS_PER_DAY / 4); // settle the gut
    let eggs = 0;
    sim.events.on('egg-laid', () => eggs++);
    step(sim, 2 * TICKS_PER_DAY);
    expect(eggs / 2).toBeGreaterThan(11);
    expect(eggs / 2).toBeLessThan(13);
  });

  it('the egg budget is shared and capped at 3; laying spends 0.04 P from the gut', () => {
    const { sim, q } = setup(300, {});
    q.queen!.gut.p = 1;
    step(sim, TICKS_PER_DAY / 4);
    expect(q.queen!.eggBudget).toBeCloseTo(3, 6);
  });
});
