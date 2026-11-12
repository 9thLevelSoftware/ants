// Reviewer tests (beh-nest): brood sorting with the nurse counts the GDD acceptance checks name, not 40 workers.
// GDD 02 App. E 19: two brood chambers at 17 C and 27 C (RH 85 %), 10 larvae in the cold one and 2 nurses ->
// within 180 s all 10 larvae lie in the 27 C chamber. GDD 03 App. E 21: 10 larvae in A (21 C), 3 nurses, B 27 C ->
// a translocation job within 250 ticks, >= 8 larvae in B within 3,000 ticks.
// The larvae are spawned as the cheat makes them (no pre-feeding): the GDD set-up says nothing about their guts.
import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { boardOf, Job } from './board';
import { forceClimate, makeNestColony, type NestColony } from './testkit';

/** The allocator is off: exactly `nurses` workers hold the nurse task for the whole run. */
function colonyWithNurses(nurses: number, prefed: boolean): { k: NestColony; ants: Ant[] } {
  const systems = SYSTEMS.filter((s) => s.name !== 'allocation' && s.name !== 'task-reeval');
  const k = makeNestColony({
    workers: nurses, stores: { c: 200, p: 200 }, systems,
    brood: [{ stage: 'larva', n: 10, chamber: 'nursery', progress: 0.3 }],
  });
  const ants = k.sim.stores.ants.list.filter((a) => a.caste === 'worker');
  for (const a of ants) a.task = 'nurse';
  if (prefed) for (const b of k.sim.stores.brood.list) { b.gutC = 0.08; b.gutP = 0.22; }
  return { k, ants };
}

function larvaeIn(sim: Sim, chamberId: number): number {
  return sim.stores.brood.list.filter((b) => b.alive && b.stage === 'larva' && b.chamberId === chamberId && b.carriedBy < 0).length;
}

function runSort(nurses: number, coldC: number, prefed: boolean, ticks: number) {
  const { k, ants } = colonyWithNurses(nurses, prefed);
  const { sim, nursery, royal } = k;
  forceClimate(k, (id) => (id === royal.id ? [27, 0.85] : id === nursery.id ? [coldC, 0.85] : null));
  let firstMoveJob = -1, eight = -1, all = -1;
  for (let t = 1; t <= ticks; t++) {
    sim.tick();
    if (firstMoveJob < 0 && boardOf(sim, sim.state.colonies[0].id)!.jobs.some((j) => j.kind === Job.move)) firstMoveJob = t;
    const n = larvaeIn(sim, royal.id);
    if (eight < 0 && n >= 8) eight = t;
    if (all < 0 && n >= 10) all = t;
  }
  const tasks = ants.map((a) => a.task);
  return { firstMoveJob, eight, all, inWarm: larvaeIn(sim, royal.id), tasks };
}

describe('reviewer: brood sorting with the GDD nurse counts', () => {
  it('GDD 02 E19: 2 nurses move all 10 larvae from 17 C to 27 C within 180 s (larvae as spawned)', () => {
    const r = runSort(2, 17, false, 1800);
    console.log('[verify E19 as-spawned]', JSON.stringify(r));
    expect(r.tasks.every((t) => t === 'nurse')).toBe(true);
    expect(r.all).toBeGreaterThan(0);
    expect(r.all).toBeLessThanOrEqual(1800);
  }, 600_000);

  it('GDD 02 E19 with pre-fed larvae (the implementer\'s set-up): 2 nurses, all 10 within 180 s', () => {
    const r = runSort(2, 17, true, 1800);
    console.log('[verify E19 pre-fed]', JSON.stringify(r));
    expect(r.all).toBeGreaterThan(0);
    expect(r.all).toBeLessThanOrEqual(1800);
  }, 600_000);

  it('GDD 03 E21: 3 nurses, 21 C vs 27 C: a move job within 250 ticks, >= 8 larvae moved within 3,000 ticks', () => {
    const r = runSort(3, 21, false, 3000);
    console.log('[verify E21]', JSON.stringify(r));
    expect(r.firstMoveJob).toBeGreaterThan(0);
    expect(r.firstMoveJob).toBeLessThanOrEqual(250);
    expect(r.eight).toBeGreaterThan(0);
    expect(r.eight).toBeLessThanOrEqual(3000);
  }, 600_000);
});
