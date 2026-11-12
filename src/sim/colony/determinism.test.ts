import { describe, expect, it } from 'vitest';
import { decode, encode } from '@/core/serialize';
import type { Sim, SimState } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { stateHash } from '@/sim/save';
import { findNonPlain } from '@/sim/testing';
import {
  addBrood, addChamber, addWorkers, careSystem, COLONY_SYSTEMS, colonyOf, establishQueen, makeColonySim, step,
} from './testkit';
import { setClimateOverride } from './envAdapter';

const CARE = { feedLarvae: true, tend: true, assist: true, lay: true, feedQueen: true, cannibalise: true };

function build(seed: number): Sim {
  const sim = makeColonySim({ seed, extra: [careSystem(CARE)] });
  const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 60);
  establishQueen(sim, ch);
  for (let i = 0; i < 40; i++) addWorkers(sim, 1, { chamber: ch, ageGd: i % 16 });
  addBrood(sim, 'egg', 10, ch);
  addBrood(sim, 'larva', 8, ch, 0.2);
  addBrood(sim, 'pupa', 6, ch, 0.7);
  sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 30, p: 10, toxin: 0 });
  return sim;
}

describe('determinism and plain data (AC9)', () => {
  it('same seed gives the same state hash; another seed differs', { timeout: 60000 }, () => {
    const a = build(4), b = build(4), c = build(5);
    step(a, 3000); step(b, 3000); step(c, 3000);
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(stateHash(a.state)).not.toBe(stateHash(c.state));
  });

  it('colony state is plain data and survives encode / decode; a reloaded sim continues identically', { timeout: 60000 }, () => {
    const a = build(7);
    step(a, 2500);
    expect(findNonPlain(a.state)).toEqual([]);
    const copy = decode(encode(a.state)) as SimState;
    expect(encode(copy)).toEqual(encode(a.state));
    const b = createSim(copy, a.world, { systems: [...COLONY_SYSTEMS, careSystem(CARE)] });
    setClimateOverride(b, { chamberTemp: () => 25, pointTemp: () => 25, rh: () => 0.8, surfaceActivity: () => 1 });
    // A fresh care fake has its own laying clock; align by stepping both with fresh fakes from here.
    const a2 = createSim(a.state, a.world, { systems: [...COLONY_SYSTEMS, careSystem(CARE)] });
    setClimateOverride(a2, { chamberTemp: () => 25, pointTemp: () => 25, rh: () => 0.8, surfaceActivity: () => 1 });
    step(a2, 3000);
    step(b, 3000);
    expect(stateHash(b.state)).toBe(stateHash(a2.state));
    expect(colonyOf(b).core).toBeDefined();
  });
});
