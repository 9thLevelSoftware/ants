// Independent review of colony-life round 9 (R33, tendDraft.ts). The draft gives each overdue pile to the nearest
// draftable worker and then calls requestTask(nurse). A worker the allocator may not make a nurse (a caste whose
// nurse weight is 0: Atta's majors) is still "draftable", so when she is the nearest she is given the pile every tick,
// her request is refused, and no other idle worker is drafted for it: the pile is never tended by the draft.
import { describe, expect, it } from 'vitest';
import { daysToTicks } from '@/sim/time';
import { boardOf, Job } from './board';
import { makeNestColony } from './testkit';
import { takeOverdueTend } from './tendDraft';

describe('R33 draft review: a nearest worker who cannot nurse', () => {
  it('does not keep the pile from the next idle worker (Atta major, nurse weight 0)', () => {
    const k = makeNestColony({ species: 'atta-texana', workers: 3, brood: [{ stage: 'egg', n: 3, chamber: 'nursery' }] });
    const { sim, nursery, royal } = k;
    const colId = sim.state.colonies[0].id;
    const eggs = sim.stores.brood.list.filter((b) => b.alive && b.stage === 'egg');
    expect(eggs.length).toBeGreaterThan(0);
    sim.state.tick += 1;
    for (const e of eggs) { e.pos = { ...eggs[0].pos }; e.lastTendedTick = sim.state.tick - daysToTicks(0.5); }
    sim.state.tick += 20; // a new board window
    expect(boardOf(sim, colId)!.jobs.filter((j) => j.kind === Job.tend).length).toBeGreaterThan(0);
    const [major, other] = sim.stores.ants.list.filter((a) => a.alive && a.caste !== 'queen');
    const at = (a: typeof major, p: { x: number; y: number; z: number }) => {
      a.pos = { ...p }; a.task = 'idle'; a.state = 'idle'; a.nestId = k.nest.id; a.carry = { kind: 'none', id: -1 } as typeof a.carry;
    };
    major.caste = 'major';
    at(major, nursery.center); // nearest to the pile
    at(other, royal.center); // an ordinary worker one chamber away, idle
    // the major cannot be made a nurse (atta-texana.ts: major taskWeights nurse 0)
    expect(takeOverdueTend(sim, major)).toBe(false);
    // R33: "the nearest such worker takes the tend job": the nearest one who can take it is `other`
    expect(takeOverdueTend(sim, other)).toBe(true);
  });

  it('control: with the major busy (not draftable) the same idle worker is drafted', () => {
    const k = makeNestColony({ species: 'atta-texana', workers: 3, brood: [{ stage: 'egg', n: 3, chamber: 'nursery' }] });
    const { sim, nursery, royal } = k;
    const eggs = sim.stores.brood.list.filter((b) => b.alive && b.stage === 'egg');
    sim.state.tick += 1;
    for (const e of eggs) { e.pos = { ...eggs[0].pos }; e.lastTendedTick = sim.state.tick - daysToTicks(0.5); }
    sim.state.tick += 20;
    const [major, other] = sim.stores.ants.list.filter((a) => a.alive && a.caste !== 'queen');
    const at = (a: typeof major, p: { x: number; y: number; z: number }, state: string) => {
      a.pos = { ...p }; a.task = 'idle'; a.state = state; a.nestId = k.nest.id; a.carry = { kind: 'none', id: -1 } as typeof a.carry;
    };
    major.caste = 'major';
    at(major, nursery.center, 'haul.walk'); // not idle, waiting or resting: not draftable
    at(other, royal.center, 'idle');
    expect(takeOverdueTend(sim, other)).toBe(true);
  });
});
