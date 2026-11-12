// Architect review fixes: the volume cap counts the new plan's own volume (GDD 03 §8.3), nest evaluations are
// staggered (§8.3), a proposal left when the mode goes off continues (§8.1, recorded decision), layoutNest refuses
// a non-finite worker count, and the food-space chamber type comes from balance per species.

import { describe, expect, it } from 'vitest';
import type { DigPlan, Nest, Sim } from '@/sim/types';
import { ARCHITECT_EVERY, ARCHITECT_OFFSET } from '@/sim/balance/cadence';
import { ARCH_PROPOSAL_S, nestTemplate } from '@/sim/balance/nest';
import { ARCH_SLOT_TICKS } from '@/sim/balance/architect';
import { TICKS_PER_SECOND } from '@/sim/time';
import { createFoundingNest } from '../lifecycle';
import { isTerminal } from '../plans/plans';
import { SIM_TEST_TIMEOUT, archSim, growBrood, growWorkers, runTicks } from './architectTestKit';
import { evaluateNest, pendingVolume, volumeRoom } from './evaluate';
import { architectDueTick } from './index';
import { layoutNest } from './layout';
import { architectRuntime } from './runtime';
import { evaluateNeeds, liveInputs } from './needs';

const FIRST_EVAL = ARCHITECT_EVERY - ARCHITECT_OFFSET;
const LN = nestTemplate('lasius-niger');
const architectPlans = (nest: Nest): DigPlan[] => nest.digPlans.filter((p) => p.source === 'architect');

/** A nest with 60 workers (2 concurrent plans allowed) and one live proposal after the first evaluation. */
function oneProposal(seed: number): { sim: Sim; nest: Nest } {
  const { sim, nest } = archSim({ seed });
  growWorkers(sim, nest, 60);
  growBrood(sim, nest, 30);
  runTicks(sim, FIRST_EVAL + 1);
  return { sim, nest };
}

describe('volume cap (GDD 03 §8.3: nothing above volumeCap)', () => {
  it.each([3, 8])('seed %i: a second plan must fit in the room left once every live plan is dug', (seed) => {
    // control: with plenty of room the second evaluation proposes another plan (the test is not vacuous)
    const free = oneProposal(seed);
    expect(architectPlans(free.nest)).toHaveLength(1);
    expect(evaluateNest(free.sim, free.nest)).toHaveLength(1);

    // the reviewer's case: the live plans leave less room under the cap than the next plan needs. The first
    // plan's pending volume is raised (as if other plans were live); volumeOpen is left alone, since it feeds the
    // tunnel capacity and so the needs.
    for (const roomBu3 of [10, 40]) {
      const { sim, nest } = oneProposal(seed);
      const first = architectPlans(nest)[0];
      first.targetVolume += LN.volumeCap - nest.volumeOpen - pendingVolume(nest) - roomBu3;
      expect(volumeRoom(nest, 'lasius-niger')).toBeCloseTo(roomBu3, 6);
      const refusedBefore = architectRuntime(sim).noSite;
      const created = evaluateNest(sim, nest);
      expect(nest.volumeOpen + pendingVolume(nest)).toBeLessThanOrEqual(LN.volumeCap + 1e-9);
      for (const id of created) expect(nest.digPlans.find((p) => p.id === id)!.targetVolume).toBeLessThanOrEqual(roomBu3);
      if (created.length === 0) expect(architectRuntime(sim).noSite).toBe(refusedBefore + 1);
    }
  }, SIM_TEST_TIMEOUT);
});

describe('staggered evaluation (GDD 03 §8.3: every 60 s per nest, staggered)', () => {
  it('two established nests due together are evaluated in different slots, and stay apart', () => {
    const { sim, nest } = archSim({ seed: 2 });
    const colony = sim.state.colonies[0], bu = sim.world.bu, c = sim.world.size / 2;
    const other = createFoundingNest(sim, colony.id, { x: c + 60 * bu, y: sim.field.height(c + 60 * bu, c), z: c });
    other.founding = null;
    runTicks(sim, FIRST_EVAL + 1);
    expect(nest.architect.lastEvalTick).toBe(FIRST_EVAL); // the first nest keeps the original cadence slot
    expect(other.architect.lastEvalTick).toBe(-1);
    runTicks(sim, ARCH_SLOT_TICKS);
    expect(other.architect.lastEvalTick).toBe(FIRST_EVAL + ARCH_SLOT_TICKS);
    runTicks(sim, ARCHITECT_EVERY);
    expect(nest.architect.lastEvalTick).toBe(FIRST_EVAL + ARCHITECT_EVERY);
    expect(other.architect.lastEvalTick).toBe(FIRST_EVAL + ARCH_SLOT_TICKS + ARCHITECT_EVERY);
    expect(architectDueTick(nest)).toBe(FIRST_EVAL + 2 * ARCHITECT_EVERY);
  }, SIM_TEST_TIMEOUT);

  it('only the nest the queen lives in asks for a royal chamber; it still does', () => {
    const { sim, nest } = archSim({ seed: 1, architect: false });
    const queen = sim.stores.ants.list.find((a) => a.alive && a.caste === 'queen')!;
    expect(queen).toBeDefined();
    queen.nestId = nest.id;
    nest.chambers = nest.chambers.filter((ch) => ch.type !== 'founding' && ch.type !== 'royal'); // she has none
    const missing = evaluateNeeds(nest, 'lasius-niger', liveInputs(sim, nest)).requests.find((r) => r.need === 'missing-type');
    expect(missing?.type).toBe('royal');
    queen.nestId = -1; // outside: she belongs to the colony's main nest
    expect(liveInputs(sim, nest).queenAlive).toBe(true);
  });
});

describe('modes: a proposal left when the mode is set to off (GDD 03 §8.1, recorded decision)', () => {
  it('is queued once ARCH_PROPOSAL_S has passed, at the next evaluation; no new plan is made', () => {
    const { sim, nest } = archSim({ seed: 4 });
    growWorkers(sim, nest, 30);
    runTicks(sim, FIRST_EVAL + 1);
    const plan = architectPlans(nest)[0];
    expect(plan.status).toBe('proposed');
    sim.enqueue({ type: 'setAutoExpand', nestId: nest.id, mode: 'off' });
    growWorkers(sim, nest, 45);
    runTicks(sim, ARCH_PROPOSAL_S * TICKS_PER_SECOND + 10);
    expect(plan.status).toBe('proposed'); // the nest module queues proposals in auto only
    runTicks(sim, ARCHITECT_EVERY);
    expect(plan.status).not.toBe('proposed');
    expect(isTerminal(plan.status)).toBe(false);
    expect(architectPlans(nest)).toHaveLength(1);
  }, SIM_TEST_TIMEOUT);
});

describe('layoutNest input guard', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])('refuses %s workers instead of looping', (workers) => {
    const { sim, nest } = archSim({ seed: 9, architect: false, template: false });
    expect(() => layoutNest(sim, nest.id, workers)).toThrow(RangeError);
  });
});

describe('food-space chamber type per species (balance, not inline)', () => {
  it('Lasius asks for food, Messor for a granary', () => {
    const { sim, nest } = archSim({ seed: 5, architect: false });
    const inputs = { ...liveInputs(sim, nest), foodLoads: 500 };
    expect(evaluateNeeds(nest, 'lasius-niger', inputs).requests.find((r) => r.need === 'food-space')?.type).toBe('food');
    expect(evaluateNeeds(nest, 'messor-barbarus', inputs).requests.find((r) => r.need === 'food-space')?.type).toBe('granary');
  });
});
