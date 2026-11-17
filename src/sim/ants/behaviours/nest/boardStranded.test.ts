// Brood lying outside every chamber with no chamber to take it back to still gets cared for (GDD 02 §10.4: feed
// requests and tend-pile jobs come from the brood itself, not from its chamber). colony-life round 1: a flood
// evacuation in a one-chamber nest put eggs at a dry spot outside the chamber; with the chamber wet there was no
// rescue destination, the board made no job at all for them, and the eggs died untended (larvae starved).
import { describe, expect, it } from 'vitest';
import { daysToTicks } from '@/sim/time';
import { boardOf, Job } from './board';
import { makeNestColony } from './testkit';

describe('nursery board: stranded brood', () => {
  it('an egg and a hungry larva outside every chamber, with nowhere to take them, get a tend and a feed job', () => {
    const k = makeNestColony({ workers: 2, brood: [{ stage: 'egg', n: 1, chamber: 'nursery' }, { stage: 'larva', n: 1, chamber: 'nursery' }] });
    const { sim, nest } = k;
    // no chamber can hold brood (the brood-capable ones turned into food chambers): no rescue destination exists
    for (const c of nest.chambers) c.type = 'food';
    const egg = sim.stores.brood.list.find((b) => b.alive && b.stage === 'egg')!;
    const larva = sim.stores.brood.list.find((b) => b.alive && b.stage === 'larva')!;
    for (const b of [egg, larva]) b.chamberId = -1; // put down at a dry spot outside the chambers
    egg.lastTendedTick = sim.state.tick - daysToTicks(0.2); // due for tending (TEND_DUE_GD 0.12)
    larva.gutC = 0; larva.gutP = 0; // asks for food
    sim.tick();
    const jobs = boardOf(sim, sim.state.colonies[0].id)!.jobs;
    expect(jobs.find((j) => j.id === egg.id)?.kind).toBe(Job.tend);
    expect(jobs.find((j) => j.id === larva.id)?.kind).toBe(Job.feed);
  });
});
