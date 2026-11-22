// Ruling R33 (colony-life round 9): while an egg or pupa pile is overdue (a tend job nobody holds), no worker in the
// nest stays idle, waiting to forage or resting unless exhausted: the nearest such worker takes the tend job, one hand
// per pile, whatever her task.
import { describe, expect, it } from 'vitest';
import { REST_ENTER } from '@/sim/balance/colony';
import { daysToTicks } from '@/sim/time';
import { boardOf, Job } from './board';
import { makeNestColony, run } from './testkit';
import { DRAFT_BROOD, takeOverdueTend } from './tendDraft';

describe('R33: an overdue egg pile takes the nearest idle, resting or waiting worker', () => {
  it('the nearest takes it (one per pile), an exhausted one is left to rest, and she tends that pile next', () => {
    const k = makeNestColony({ workers: 4, brood: [{ stage: 'egg', n: 4, chamber: 'nursery' }] });
    const { sim, nursery, royal, food } = k;
    const colId = sim.state.colonies[0].id;
    const eggs = sim.stores.brood.list.filter((b) => b.alive && b.stage === 'egg');
    sim.state.tick += 1;
    // one pile (all four where the first lies), overdue, not yet dead of it (R33: 1 gd)
    for (const e of eggs) { e.pos = { ...eggs[0].pos }; e.lastTendedTick = sim.state.tick - daysToTicks(0.5); }
    sim.state.tick += 20; // a new board window
    expect(boardOf(sim, colId)!.jobs.filter((j) => j.kind === Job.tend).length).toBe(eggs.length);
    const [near, far, waiting, tired] = sim.stores.ants.list.filter((a) => a.alive && a.caste === 'worker');
    const at = (a: typeof near, p: { x: number; y: number; z: number }, task: string, state: string) => {
      a.pos = { ...p }; a.task = task as typeof a.task; a.state = state; a.nestId = k.nest.id; a.carry = { kind: 'none', id: -1 } as typeof a.carry;
    };
    at(near, { x: nursery.center.x, y: nursery.center.y, z: nursery.center.z }, 'idle', 'idle');
    at(far, royal.center, 'idle', 'idle');
    at(waiting, food.center, 'forage', 'forage.wait');
    at(tired, { x: nursery.center.x + 1, y: nursery.center.y, z: nursery.center.z }, 'idle', 'rest');
    tired.fatigue = REST_ENTER + 0.1; // exhausted: left to rest although nearer than `far`
    expect(takeOverdueTend(sim, tired)).toBe(false);
    expect(takeOverdueTend(sim, far)).toBe(false);
    expect(takeOverdueTend(sim, waiting)).toBe(false);
    expect(takeOverdueTend(sim, near)).toBe(true);
    expect(near.task).toBe('nurse');
    const drafted = near.bb[DRAFT_BROOD];
    expect(eggs.map((e) => e.id)).toContain(drafted);
    // her next think as a nurse: the drafted pile, by a tend round
    near.thinkTick = 0;
    run(sim, 2);
    expect(near.state).toBe('nurse.tend');
    expect(near.bb[DRAFT_BROOD]).toBe(-1);
  });
});
