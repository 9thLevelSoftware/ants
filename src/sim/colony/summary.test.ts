import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { colonySummary, queryLedger } from './summary';

describe('statistics, summary and debug commands (GDD 02 §13, App B)', () => {
  it('samples hourly series and files daily values and the daily ledger', { timeout: 60000 }, () => {
    const sim = makeColonySim({ extra: [careSystem({ feedLarvae: true, tend: true, assist: true, lay: true, feedQueen: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 60);
    establishQueen(sim, ch);
    addWorkers(sim, 30, { chamber: ch });
    addBrood(sim, 'larva', 5, ch, 0.2);
    sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 30, p: 10, toxin: 0 });
    step(sim, TICKS_PER_DAY + 300);
    const h = sim.state.progression.history;
    expect(h.hourly.workers.len).toBe(25);
    expect(h.hourly['workers-by-group:nurse']).toBeDefined();
    expect(h.daily.workers).toHaveLength(1);
    expect(h.daily['eggs-laid'][0]).toBeGreaterThan(0);
    expect(h.daily['ledger:outLarvaeP'][0]).toBeGreaterThan(0);
    const s = colonySummary(sim, colonyOf(sim).id)!;
    expect(s.N).toBeGreaterThanOrEqual(30);
    expect(s.queen?.mode).toBe('established');
    expect(s.brood.egg + s.brood.larva + s.brood.pupa).toBeGreaterThan(0);
    expect(s.allocation.mode).toBe('auto');
    const l = queryLedger(sim, colonyOf(sim).id)!;
    expect(l.life.outLarvaeP).toBeGreaterThan(l.today.outLarvaeP);
  });

  it('cheat.setQueen sets gut, reserves, health, budget and fecundity', () => {
    const sim = makeColonySim();
    const ch = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 });
    const q = establishQueen(sim, ch);
    sim.enqueue({ type: 'cheat.setQueen', colonyId: colonyOf(sim).id, values: { gutC: 0.5, gutP: 0.2, reserve: 2, reserveP: 1, health: 0.5, eggBudget: 2, fecundity: 1.2 } });
    step(sim, 1);
    expect(q.queen!.gut).toEqual({ c: 0.5, p: 0.2 });
    expect(q.queen!.reserve).toBe(2);
    expect(q.queen!.reserveP).toBe(1);
    expect(q.hp / q.maxHp).toBeCloseTo(0.5, 6);
    expect(q.queen!.fecundity).toBe(1.2);
  });
});
