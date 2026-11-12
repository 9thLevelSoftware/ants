// Acceptance 7: the architect is deterministic. The scripted growth run gives the same plans and the same state
// hash from the same seed, also across a save / load in the middle (the architect keeps nothing outside the state
// that changes results: its runtime counters and probe are diagnostics only).

import { describe, expect, it } from 'vitest';
import type { Nest, Sim } from '@/sim/types';
import { ARCHITECT_EVERY } from '@/sim/balance/cadence';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { commandsSystem } from '@/sim/systems';
import { nestSystem } from '../system';
import { archSim, digAll, growBrood, growWorkers, runTicks } from './architectTestKit';
import { architectSystem } from './index';

const SYSTEMS = [commandsSystem, nestSystem, architectSystem];
const PERIODS = 14;

function step(sim: Sim, k: number): void {
  const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0]) as Nest;
  const w = Math.round(200 * (k / PERIODS) ** 1.5);
  growWorkers(sim, nest, w);
  growBrood(sim, nest, Math.round(w * 0.4));
  runTicks(sim, ARCHITECT_EVERY);
  digAll(sim, nest);
}

function plansOf(sim: Sim): string[] {
  return sim.state.nests[0].digPlans.map((p) => `${p.id}:${p.kind}:${p.chamberType}:${p.need}:${JSON.stringify(p.anchor)}:${p.geom.yawDeg}`);
}

describe('architect determinism (acceptance 7)', () => {
  it('same seed -> same plans and state hash, with and without a save / load half way', () => {
    const a = archSim({ seed: 5 }).sim;
    for (let k = 1; k <= PERIODS; k++) step(a, k);
    const b = archSim({ seed: 5 }).sim;
    for (let k = 1; k <= PERIODS; k++) step(b, k);
    expect(plansOf(b)).toEqual(plansOf(a));
    expect(stateHash(b.state)).toBe(stateHash(a.state));
    const c0 = archSim({ seed: 5 }).sim;
    for (let k = 1; k <= PERIODS / 2; k++) step(c0, k);
    const c = createSim(restore(snapshot(c0)).state, c0.world, { systems: SYSTEMS });
    for (let k = PERIODS / 2 + 1; k <= PERIODS; k++) step(c, k);
    expect(plansOf(c)).toEqual(plansOf(a));
    expect(stateHash(c.state)).toBe(stateHash(a.state));
    // the run did architect work, and a different seed differs
    expect(a.state.nests[0].digPlans.some((p) => p.source === 'architect')).toBe(true);
    const d = archSim({ seed: 6 }).sim;
    for (let k = 1; k <= PERIODS; k++) step(d, k);
    expect(stateHash(d.state)).not.toBe(stateHash(a.state));
  }, 300_000);
});
