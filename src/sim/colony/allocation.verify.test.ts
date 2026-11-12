// Reviewer tests (colony-core verify): allocation eligibility, never-reassign rules, manual floors and auto-mode
// convergence (GDD 02 §6.1-§6.5, AC6) beyond the original suite.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { AntFlag, taskIndex } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { GROUP_TASKS } from './allocation';

const group = (sim: Sim, g: keyof typeof GROUP_TASKS, k: 'actual' | 'target') =>
  GROUP_TASKS[g].reduce((a, t) => a + colonyOf(sim).alloc[k][taskIndex(t)], 0);

function colony(n: number, ages: (i: number) => number, larvae = 0) {
  const sim = makeColonySim({ extra: [careSystem({ tend: true, feedLarvae: true, feedQueen: true })] });
  const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, ch);
  for (let i = 0; i < n; i++) addWorkers(sim, 1, { chamber: ch, ageGd: ages(i) });
  if (larvae > 0) addBrood(sim, 'larva', larvae, ch, 0.1);
  sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 200, p: 100, toxin: 0 });
  return { sim, ch };
}

describe('allocation rules (reviewer)', () => {
  it('auto mode with steady demand: every group converges to within one ant of its target in 300 s', () => {
    const { sim, ch } = colony(80, (i) => 1 + (i % 20));
    addBrood(sim, 'egg', 100, ch, 0); // eggs keep the nurse demand steady over 300 s (they hatch after ~1 gd)
    step(sim, 3000);
    for (const g of ['forage', 'nurse', 'dig', 'defend'] as const) {
      expect(Math.abs(group(sim, g, 'actual') - group(sim, g, 'target')), g).toBeLessThanOrEqual(1);
    }
  });

  it('callows are only ever given nurse-group tasks', () => {
    const sim = makeColonySim({ extra: [careSystem({ tend: true, feedQueen: true })] });
    const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 400);
    establishQueen(sim, ch);
    const callows = addWorkers(sim, 20, { chamber: ch, ageGd: 0, callow: true });
    sim.enqueue({ type: 'setDirectives', allocation: { forage: 100, nurse: 0, dig: 0, defend: 0 } });
    step(sim, 1500); // under CALLOW_GD (0.3 gd = 1800 ticks)
    for (const a of callows) {
      expect(a.flags & AntFlag.CALLOW).toBeTruthy();
      expect(['idle', 'rest', 'nurse', 'queen-care', 'store']).toContain(a.task);
    }
  });

  it('an ant carrying an item is not taken off its task by the surplus check', () => {
    const { sim } = colony(40, (i) => 2 + (i % 18));
    const carrier = sim.state.ants.find((a) => a.alive && a.caste === 'worker')!;
    carrier.task = 'dig';
    carrier.carry = { kind: 'item', id: 999999 } as typeof carrier.carry;
    step(sim, 3 * 1200); // three surplus checks; dig demand is 0, so dig is in surplus
    expect(carrier.task).toBe('dig');
  });

  it('injured workers are never given forage or defend tasks', () => {
    const { sim } = colony(60, (i) => 12 + (i % 8));
    for (const a of sim.state.ants) if (a.alive && a.caste === 'worker') { a.hp = 0.3 * a.maxHp; a.flags |= AntFlag.INJURED; }
    sim.enqueue({ type: 'setDirectives', allocation: { forage: 70, nurse: 10, dig: 10, defend: 10 } });
    for (let t = 0; t < 1200; t++) {
      for (const a of sim.state.ants) if (a.alive && a.caste === 'worker') a.hp = Math.min(a.hp, 0.3 * a.maxHp);
      sim.tick();
    }
    for (const a of sim.state.ants) {
      if (!a.alive || a.caste !== 'worker') continue;
      expect(['scout', 'forage', 'tend', 'guard', 'patrol']).not.toContain(a.task);
    }
  });

  it('manual: a group at share 0 still gets ceil(0.25 x D) when it has demand (floor)', () => {
    const { sim } = colony(60, (i) => 1 + (i % 15), 12);
    sim.enqueue({ type: 'setDirectives', allocation: { forage: 100, nurse: 0, dig: 0, defend: 0 } });
    step(sim, 1200);
    const col = colonyOf(sim);
    const dNurse = GROUP_TASKS.nurse.reduce((a, t) => a + col.alloc.demand[taskIndex(t)], 0);
    expect(dNurse).toBeGreaterThan(1);
    expect(group(sim, 'nurse', 'target')).toBeGreaterThanOrEqual(Math.ceil(0.25 * dNurse));
  });

  it('targets never exceed the available workforce', () => {
    const { sim } = colony(12, (i) => 2 + i, 30);
    step(sim, 300);
    const col = colonyOf(sim);
    let sum = 0;
    for (let i = 0; i < col.alloc.target.length; i++) sum += col.alloc.target[i];
    expect(sum).toBeLessThanOrEqual(12);
    void TICKS_PER_DAY;
  });
});
