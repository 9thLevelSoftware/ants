// Reviewer tests (colony-core verify): a save / load in the middle of a stagger cycle continues bit-identically
// with an uninterrupted run (AC9), with brood, deaths and starvation in play.

import { describe, expect, it } from 'vitest';
import { decode, encode } from '@/core/serialize';
import type { Sim, SimState } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { stateHash } from '@/sim/save';
import { findNonPlain } from '@/sim/testing';
import { addBrood, addChamber, addWorkers, careSystem, COLONY_SYSTEMS, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import { setClimateOverride } from './envAdapter';

// No `lay`: the care fake then keeps no clock of its own, so a fresh instance after reload behaves identically.
const CARE = { feedLarvae: true, tend: true, assist: true, feedQueen: true, cannibalise: true };
const CLIMATE = { chamberTemp: () => 25, pointTemp: () => 25, rh: () => 0.8, surfaceActivity: () => 1 };

function build(): Sim {
  const sim = makeColonySim({ seed: 11, extra: [careSystem(CARE)] });
  const ch = addChamber(sim, 'nursery', { x: 100, y: -40, z: 100 }, 20);
  establishQueen(sim, ch);
  for (let i = 0; i < 30; i++) addWorkers(sim, 1, { chamber: i % 4 === 0 ? null : ch, ageGd: i % 16, lifespanGd: 4 + i });
  // two near the end of their lives: deaths in play whatever the rates of ageing and starvation (viab-economy)
  addWorkers(sim, 2, { chamber: ch, ageGd: 5, lifespanGd: 5.6 });
  addBrood(sim, 'egg', 10, ch);
  addBrood(sim, 'larva', 10, ch, 0.2);
  addBrood(sim, 'pupa', 6, ch, 0.8);
  sim.enqueue({ type: 'cheat.addFood', colonyId: colonyOf(sim).id, c: 6, p: 2, toxin: 0 });
  return sim;
}

describe('reload mid stagger cycle (reviewer, AC9)', () => {
  it('continues identically after encode / decode at a tick that is not a cycle boundary', { timeout: 120000 }, () => {
    const a = build();
    const b0 = build();
    step(a, 2503);
    step(b0, 2503);
    expect(findNonPlain(b0.state)).toEqual([]);
    const copy = decode(encode(b0.state)) as SimState;
    const b = createSim(copy, b0.world, { systems: [...COLONY_SYSTEMS, careSystem(CARE)] });
    setClimateOverride(b, CLIMATE);
    for (let k = 0; k < 4; k++) {
      step(a, 1777);
      step(b, 1777);
      expect(stateHash(b.state)).toBe(stateHash(a.state));
    }
    expect(colonyOf(a).counters.deaths).toBeGreaterThan(0);
  });
});
