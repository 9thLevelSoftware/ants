// Crop loads back to the social stomach (cropNetwork.ts, econ-growth review): a worker whose running task never feeds
// anyone passes her crop back to the pool at the trophallaxis rate; nurses, foragers held by deliver first and the
// possessed ant keep theirs. Every move is booked so the pool ledger stays conserved.

import { describe, expect, it } from 'vitest';
import type { Ant, Sim, Task } from '@/sim/types';
import { AntFlag, TASKS } from '@/sim/types';
import { CROP_NETWORK_KEEP, PHYSIO_EVERY } from '@/sim/balance';
import { TROPH_RATE } from '@/sim/balance/actions';
import { TICKS_PER_SECOND } from '@/sim/time';
import { coreOf, ledgerNet } from './core';
import { addChamber, addWorkers, colonyOf, establishQueen, makeColonySim } from './testkit';

function setup(): { sim: Sim; ants: Ant[] } {
  const sim = makeColonySim({ noAllocation: true });
  const ch = addChamber(sim, 'general', { x: 100, y: -40, z: 100 });
  establishQueen(sim, ch);
  const ants = addWorkers(sim, 4, { chamber: ch, ageGd: 8 });
  sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 10, p: 2, toxin: 0 });
  sim.applyPendingCommands();
  for (let i = 0; i <= PHYSIO_EVERY; i++) sim.tick();
  return { sim, ants };
}

/** Gives the ant a nurse load and makes `task` both her assigned and her running task (the runner's `run.task`). */
function holding(a: Ant, task: Task, running: Task = task): void {
  a.task = task;
  a.bb['run.task'] = TASKS.indexOf(running);
  a.cropC = 0.15;
  a.cropP = 0.45;
}

function run(sim: Sim, ticks: number): void {
  for (let i = 0; i < ticks; i++) sim.tick();
}

describe('crop loads go back to the pool from workers that do not feed (econ-growth review)', () => {
  it('an idle worker with a nurse load passes it back at the trophallaxis rate, in crop proportion', () => {
    const { sim, ants } = setup();
    const col = colonyOf(sim);
    const [a] = ants;
    holding(a, 'idle');
    const p0 = col.stores.p;
    run(sim, PHYSIO_EVERY);
    // (the queen's P upkeep is drawn from the pool meanwhile: the crop side is exact, the pool side within it)
    // one slow tick moves TROPH_RATE x PHYSIO_EVERY ticks of crop; the P share is the crop's (0.75)
    const moved = TROPH_RATE * (PHYSIO_EVERY / TICKS_PER_SECOND);
    expect(0.6 - (a.cropC + a.cropP)).toBeCloseTo(moved, 6);
    expect(0.45 - a.cropP).toBeCloseTo(0.75 * moved, 9);
    expect(col.stores.p - p0).toBeCloseTo(0.75 * moved, 2);
    run(sim, 20 * TICKS_PER_SECOND);
    expect(a.cropC + a.cropP).toBeCloseTo(CROP_NETWORK_KEEP, 6);
  });

  it('a nurse keeps her load; so do a forager held by deliver first and the possessed ant', () => {
    const { sim, ants } = setup();
    const [nurse, held, possessed] = ants;
    holding(nurse, 'nurse');
    holding(held, 'idle', 'forage'); // reassigned, but the runner still runs her outdoor behaviour (deliver first)
    holding(possessed, 'idle');
    possessed.flags |= AntFlag.POSSESSED;
    run(sim, 5 * TICKS_PER_SECOND);
    for (const a of [nurse, held, possessed]) expect(a.cropC + a.cropP).toBeCloseTo(0.6, 9);
  });

  it('the pool ledger stays conserved: the return is booked as transit coming back', () => {
    const { sim, ants } = setup();
    const col = colonyOf(sim);
    holding(ants[0], 'dig');
    holding(ants[1], 'rest');
    const start = { c: col.stores.c, p: col.stores.p }, life0 = ledgerNet(coreOf(col).life);
    run(sim, 30 * TICKS_PER_SECOND);
    const life = ledgerNet(coreOf(col).life);
    expect(Math.abs(start.c + (life.c - life0.c) - col.stores.c)).toBeLessThan(1e-9);
    expect(Math.abs(start.p + (life.p - life0.p) - col.stores.p)).toBeLessThan(1e-9);
    expect(coreOf(col).life.transitP).toBeLessThan(0); // the loads came back as transit (they left as transit)
    expect(ants[0].cropC + ants[0].cropP).toBeCloseTo(CROP_NETWORK_KEEP, 6);
    expect(ants[1].cropC + ants[1].cropP).toBeCloseTo(CROP_NETWORK_KEEP, 6);
  });
});
