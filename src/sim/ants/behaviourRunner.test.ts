// Behaviour runner: enter / exit on task change, think cadence, possessed ants skipped, default behaviour,
// assembly of the behaviour table from behaviours/{outdoor,nest}.
import { afterEach, describe, expect, it } from 'vitest';
import type { Behaviour, Sim } from '@/sim/types';
import { createBehaviourTable } from '@/sim/systems';
import { BEHAVIOUR_THINK_TICKS } from '@/sim/balance/actions';
import { installFakes, makeAntSim, step, worker } from './actions/testkit';
import { behaviourFor, defaultBehaviour } from './behaviourRunner';
import * as ants from './index';

let restore = (): void => {};
afterEach(() => restore());

function recorder(task: Behaviour['task'], log: string[], opts: { think?: number; switchTo?: Behaviour['task'] } = {}): Behaviour {
  return {
    task,
    enter: (_s, a) => { log.push(`enter ${task} ${a.id}`); },
    update: (sim, a) => {
      log.push(`update ${task} ${a.id}`);
      if (opts.think) a.thinkTick = sim.state.tick + opts.think;
      if (opts.switchTo) a.task = opts.switchTo;
    },
    exit: (_s, a) => { log.push(`exit ${task} ${a.id}`); },
  };
}

function withBehaviours(sim: Sim, list: Behaviour[]): void {
  sim.behaviours = createBehaviourTable(list);
}

describe('behaviour runner', () => {
  it('enters the task behaviour, updates on think ticks, exits / enters when the task changes', () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const log: string[] = [];
    withBehaviours(sim, [recorder('forage', log), recorder('nurse', log)]);
    const a = worker(sim, 50, 50, 'worker', 'forage');
    step(sim, 1);
    expect(log).toEqual([`enter forage ${a.id}`, `update forage ${a.id}`]);
    step(sim, BEHAVIOUR_THINK_TICKS - 1);
    expect(log).toHaveLength(2);
    step(sim, 1);
    expect(log).toHaveLength(3);
    a.task = 'nurse';
    step(sim, BEHAVIOUR_THINK_TICKS);
    expect(log.slice(3)).toEqual([`exit forage ${a.id}`, `enter nurse ${a.id}`, `update nurse ${a.id}`]);
  });

  it('a behaviour can schedule its own next think; possessed ants are skipped and their behaviour exited', () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const log: string[] = [];
    withBehaviours(sim, [recorder('dig', log, { think: 1 })]);
    const a = worker(sim, 50, 50, 'worker', 'dig');
    step(sim, 4);
    expect(log.filter((l) => l.startsWith('update'))).toHaveLength(4);
    sim.enqueue({ type: 'possess', antId: a.id });
    step(sim, 5);
    expect(log).toContain(`exit dig ${a.id}`);
    expect(log.filter((l) => l.startsWith('update'))).toHaveLength(4);
    sim.enqueue({ type: 'release', reason: 'player' });
    step(sim, 1);
    expect(log[log.length - 1]).toBe(`update dig ${a.id}`);
  });

  it('a task change inside update is picked up on the next think; unregistered tasks use the default behaviour', () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const log: string[] = [];
    withBehaviours(sim, [recorder('scout', log, { switchTo: 'haul' })]);
    const a = worker(sim, 50, 50, 'worker', 'scout');
    step(sim, 1 + BEHAVIOUR_THINK_TICKS);
    expect(log).toEqual([`enter scout ${a.id}`, `update scout ${a.id}`, `exit scout ${a.id}`]);
    expect(behaviourFor(sim, a, 'haul')).toBe(defaultBehaviour);
    expect(a.state).toBe('haul');
  });

  it('the module assembles the behaviours of behaviours/outdoor and behaviours/nest, and their systems', () => {
    const tasks = ants.behaviours.map((b) => b.task).sort();
    expect(tasks).toEqual(['dig', 'forage', 'guard', 'haul', 'idle', 'nurse', 'queen-care', 'rest', 'scout', 'store', 'tend', 'flee'].sort());
    const names = ants.systems.map((s) => s.name);
    // one perception system: the real one (beh-forage's), the no-op placeholder is gone
    expect(names.filter((n) => n === 'perception')).toHaveLength(1);
    expect(ants.systems.find((s) => s.name === 'perception')!.run.toString()).not.toBe('() => {}');
    expect(names).toEqual(expect.arrayContaining(['behaviours', 'actions', 'lifecycle']));
  });

  it('deliver first: a task change waits while the old behaviour delivers, then one concluding think, then the switch', () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const log: string[] = [];
    const haul = { ...recorder('haul', log), delivering: (_s: Sim, a: { carry: { kind: string } }) => a.carry.kind !== 'none' };
    withBehaviours(sim, [haul, recorder('nurse', log)]);
    const a = worker(sim, 50, 50, 'worker', 'haul');
    step(sim, 1);
    a.carry = { kind: 'item', id: 999 };
    a.task = 'nurse';
    step(sim, 3 * BEHAVIOUR_THINK_TICKS);
    expect(log.filter((l) => l.startsWith('enter nurse'))).toHaveLength(0);
    expect(log.filter((l) => l === `update haul ${a.id}`).length).toBeGreaterThanOrEqual(3);
    a.carry = { kind: 'none', id: -1 };
    const n = log.length;
    step(sim, 2 * BEHAVIOUR_THINK_TICKS);
    expect(log.slice(n)).toEqual([`update haul ${a.id}`, `exit haul ${a.id}`, `enter nurse ${a.id}`, `update nurse ${a.id}`]);
  });

  it('deliver first does not hold flee or fight', () => {
    const sim = makeAntSim();
    restore = installFakes(sim).restore;
    const log: string[] = [];
    const haul = { ...recorder('haul', log), delivering: () => true };
    withBehaviours(sim, [haul, recorder('flee', log)]);
    const a = worker(sim, 50, 50, 'worker', 'haul');
    step(sim, 1);
    a.task = 'flee';
    step(sim, BEHAVIOUR_THINK_TICKS);
    expect(log).toContain(`enter flee ${a.id}`);
  });
});
