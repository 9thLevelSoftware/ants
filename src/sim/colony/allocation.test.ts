import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { AntFlag, taskIndex } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { GROUP_TASKS } from './allocation';
import { apportion } from './allocation/targets';
import { requestTask } from './index';

function groupActual(sim: Sim, g: keyof typeof GROUP_TASKS): number {
  return GROUP_TASKS[g].reduce((a, t) => a + colonyOf(sim).alloc.actual[taskIndex(t)], 0);
}
function groupTarget(sim: Sim, g: keyof typeof GROUP_TASKS): number {
  return GROUP_TASKS[g].reduce((a, t) => a + colonyOf(sim).alloc.target[taskIndex(t)], 0);
}

function colony(n: number, ages: (i: number) => number) {
  const sim = makeColonySim({ extra: [careSystem({ tend: true, feedLarvae: true, feedQueen: true })] });
  const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 400);
  establishQueen(sim, ch);
  for (let i = 0; i < n; i++) addWorkers(sim, 1, { chamber: ch, ageGd: ages(i) });
  sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 200, p: 100, toxin: 0 });
  return { sim, ch };
}

describe('task allocation (GDD 02 §6, E13-E15, AC6)', () => {
  it('E13: auto, N = 100, 20 larvae at 25 °C: nurse target = §6.2 formula (+-1), actual within 1 in 180 s', () => {
    const { sim, ch } = colony(100, (i) => (i % 20));
    addBrood(sim, 'larva', 20, ch, 0.1);
    step(sim, 1800);
    const col = colonyOf(sim);
    // larval demand = 20 x (1.6 / 0.6) x r(25) = 72.7 loads/gd -> / 4.5 = 16.2 nurses (no eggs or pupae).
    const formula = (20 * (1.6 / 0.6) * 1.364) / 4.5;
    expect(Math.abs(col.alloc.target[taskIndex('nurse')] - formula)).toBeLessThanOrEqual(1);
    expect(Math.abs(col.alloc.actual[taskIndex('nurse')] - col.alloc.target[taskIndex('nurse')])).toBeLessThanOrEqual(1);
  });

  it('E14 / AC6: manual {50, 20, 20, 10}, A = 100: every group within one ant of its target in 300 s', () => {
    const { sim } = colony(100, (i) => 2 + (i % 18));
    sim.enqueue({ type: 'setDirectives', allocation: { forage: 50, nurse: 20, dig: 20, defend: 10 } });
    step(sim, 3000);
    const col = colonyOf(sim);
    const dNurse = GROUP_TASKS.nurse.reduce((a, t) => a + col.alloc.demand[taskIndex(t)], 0);
    expect(groupActual(sim, 'forage')).toBeGreaterThanOrEqual(40);
    expect(groupActual(sim, 'nurse')).toBeGreaterThanOrEqual(Math.ceil(0.25 * dNurse));
    for (const g of ['forage', 'nurse', 'dig', 'defend'] as const) {
      expect(Math.abs(groupActual(sim, g) - groupTarget(sim, g)), g).toBeLessThanOrEqual(1);
    }
  });

  it('a possessed ant is never reassigned', () => {
    const { sim } = colony(60, (i) => 2 + (i % 18));
    const ants = sim.state.ants.filter((a) => a.caste === 'worker');
    const p = ants[5];
    p.flags |= AntFlag.POSSESSED;
    p.task = 'dig';
    let changed = 0;
    sim.events.on('task-changed', (e) => { if (e.antId === p.id) changed++; });
    sim.enqueue({ type: 'setDirectives', allocation: { forage: 90, nurse: 10, dig: 0, defend: 0 } });
    step(sim, 6000);
    expect(p.task).toBe('dig');
    expect(changed).toBe(0);
    expect(requestTask(sim, p, 'forage', 'marker:forage')).toBe(false);
    expect(requestTask(sim, p, 'forage', 'released')).toBe(true);
  });

  it('E15: in a 200-worker colony forage-group ants are >= 4 gd older than nurse-group ants', () => {
    const { sim, ch } = colony(200, (i) => (i * 20) / 200);
    addBrood(sim, 'larva', 25, ch, 0.1);
    addBrood(sim, 'egg', 40, ch, 0.1);
    step(sim, TICKS_PER_DAY / 4);
    const mean = (g: keyof typeof GROUP_TASKS) => {
      const xs = sim.state.ants.filter((a) => a.alive && a.caste === 'worker' && (GROUP_TASKS[g] as readonly string[]).includes(a.task));
      return xs.reduce((s, a) => s + a.physioAgeGd, 0) / xs.length;
    };
    expect(mean('forage') - mean('nurse')).toBeGreaterThanOrEqual(4);
  });

  it('largest-remainder apportionment sums to the total', () => {
    expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]);
    expect(apportion(5, [0, 0])).toEqual([0, 0]);
  });
});
