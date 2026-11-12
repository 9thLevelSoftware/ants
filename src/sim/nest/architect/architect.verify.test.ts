// Reviewer's tests (architect task): edge cases and rules the implementer's tests do not reach. Tests that fail
// here document real defects for the fixer (see the review report).

import { describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import type { DigPlan, Nest, Sim } from '@/sim/types';
import { ARCHITECT_EVERY, ARCHITECT_OFFSET } from '@/sim/balance/cadence';
import { nestTemplate } from '@/sim/balance/nest';
import { ARCH_SITE_RADIUS_BU } from '@/sim/balance/architect';
import { spawnAnt } from '@/sim/entities';
import { createFoundingNest } from '../lifecycle';
import { archSim, growBrood, growWorkers, runTicks } from './architectTestKit';
import { evaluateNest, planSite } from './evaluate';
import { evaluateNeeds, liveInputs } from './needs';
import { placementCandidates } from './candidates';
import { layoutNest } from './layout';
import { architectRuntime } from './runtime';
import { recordSiteFailure } from './sites';
import { checkNest, recordCreations, type CreatedPlan } from './nestChecks';

const FIRST_EVAL = ARCHITECT_EVERY - ARCHITECT_OFFSET;
const architectPlans = (nest: Nest): DigPlan[] => nest.digPlans.filter((p) => p.source === 'architect');
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

function firstProposal(seed: number, workers = 30, brood = 12): { sim: Sim; nest: Nest } {
  const { sim, nest } = archSim({ seed });
  growWorkers(sim, nest, workers);
  growBrood(sim, nest, brood);
  runTicks(sim, FIRST_EVAL + 1);
  return { sim, nest };
}

describe('architect verify: throttles and edge cases', () => {
  it('no plan once the nest is at its volume cap', () => {
    const { sim, nest } = archSim({ seed: 3 });
    growWorkers(sim, nest, 60);
    growBrood(sim, nest, 30);
    runTicks(sim, FIRST_EVAL - 1);
    nest.volumeOpen = nestTemplate('lasius-niger').volumeCap;
    expect(evaluateNest(sim, nest)).toEqual([]);
    expect(architectPlans(nest)).toHaveLength(0);
  });

  it('a nest that is still founding gets pressures but no plans', () => {
    const { sim, nest } = archSim({ seed: 4 });
    nest.founding = { state: 'sealed', readiness: 1, cavitySeed: { ...nest.origin }, abandoned: [], readyTick: 0, sealedTick: 0 };
    growWorkers(sim, nest, 30);
    runTicks(sim, FIRST_EVAL + 1);
    expect(architectPlans(nest)).toHaveLength(0);
    expect(nest.architect.needCache.crowding).toBeGreaterThan(0);
  });

  it('needCache stays finite and non-negative for empty colonies and non-T1 needs', () => {
    const { sim, nest } = archSim({ seed: 5 });
    runTicks(sim, FIRST_EVAL + 1);
    for (const v of Object.values(nest.architect.needCache)) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
  });

  it('architect state stays plain JSON data after failures and blacklist entries', () => {
    const { sim, nest } = firstProposal(2);
    recordSiteFailure(sim, nest.architect, { x: 1, y: 2, z: 3 });
    recordSiteFailure(sim, nest.architect, { x: 500, y: 2, z: 3 });
    recordSiteFailure(sim, nest.architect, { x: 500, y: 2, z: 3 });
    const clone = JSON.parse(JSON.stringify(nest.architect));
    expect(clone).toEqual(nest.architect);
    for (const p of architectPlans(nest)) {
      const back = JSON.parse(JSON.stringify(p)) as Record<string, unknown>;
      const differ = Object.keys(p).filter((k) => JSON.stringify(back[k]) !== JSON.stringify((p as unknown as Record<string, unknown>)[k]) || !Object.is(back[k], (p as unknown as Record<string, unknown>)[k]) && typeof back[k] !== 'object');
      expect(differ).toEqual([]);
    }
  });

  it('layoutNest with 0 and 1 workers: a valid founding nest, no throw', () => {
    for (const workers of [0, 1]) {
      const { sim, nest } = archSim({ seed: 9, architect: false, template: false });
      const created: CreatedPlan[] = [];
      architectRuntime(sim).probe = recordCreations(sim, created);
      const res = layoutNest(sim, nest.id, workers);
      expect(res.steps).toBeGreaterThanOrEqual(1);
      const r = checkNest(sim, nest, created, 4);
      expect(r.invalidPlans).toBe(0);
      expect(r.unreachable).toEqual([]);
      expect(nest.chambers.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('layoutNest on two nests of the same world is independent of the call order (per-nest RNG fork)', () => {
    const a = archSim({ seed: 12, architect: false, template: false });
    const ra = layoutNest(a.sim, a.nest.id, 60);
    const b = archSim({ seed: 12, architect: false, template: false });
    const rb = layoutNest(b.sim, b.nest.id, 60);
    expect(rb.planIds.length).toBe(ra.planIds.length);
    expect(b.nest.chambers.map((c) => c.type)).toEqual(a.nest.chambers.map((c) => c.type));
  });
});

describe('architect verify: player-cancelled sites (GDD 03 §7.8, acceptance 5)', () => {
  // GDD 03 §7.8: an architect plan cancelled by the player blacklists its site (8 BU radius). The nest module
  // records the plan's ANCHOR; the architect tests a candidate by its ROOM CENTRE (decision f). A room that is
  // nearly the cancelled one (centre a few BU away, further from the anchor) is then not blacklisted.
  it.each([1, 2, 3, 4, 5, 6])('seed %i: no candidate room lies within 4 BU of the room the player just cancelled', (seed) => {
    const { sim, nest } = firstProposal(seed);
    const first = architectPlans(nest)[0];
    expect(first).toBeDefined();
    const room = planSite(sim, nest, first);
    sim.enqueue({ type: 'cancelPlan', planId: first.id });
    runTicks(sim, 1);
    expect(nest.architect.blacklist).toHaveLength(1);
    const req = evaluateNeeds(nest, 'lasius-niger', liveInputs(sim, nest)).requests.find((r) => r.type === first.chamberType) ?? {
      need: first.need!, priority: first.priority, type: first.chamberType!, size: first.size!, pressure: 1,
    };
    let closest = Infinity;
    for (let n = 0; n < 4; n++) {
      for (const c of placementCandidates(sim, nest, req, rngFork(n, 'verify-bl'))) closest = Math.min(closest, dist(c.centre, room));
    }
    expect(closest / sim.world.bu).toBeGreaterThan(4);
    expect(closest / sim.world.bu).toBeGreaterThan(ARCH_SITE_RADIUS_BU / 2);
  });
});

describe('architect verify: colonies with more than one nest', () => {
  // GDD 03 §6.3: royal is an architect plan "only if a living queen has no royal chamber". liveInputs sets
  // queenAlive for any living queen of the colony, wherever she is, so every other nest of the colony asks for a
  // royal chamber of its own.
  it('a second nest of the colony without the queen does not ask for a royal chamber', () => {
    const { sim, nest } = archSim({ seed: 1, architect: false });
    const colony = sim.state.colonies[0];
    const queen = sim.stores.ants.list.find((a) => a.alive && a.caste === 'queen' && a.colony === colony.id)
      ?? spawnAnt(sim, { colony: colony.id, caste: 'queen', pos: nest.chambers[0].center, ageGd: 5, nestId: nest.id, chamberId: nest.chambers[0].id });
    queen.nestId = nest.id;
    const bu = sim.world.bu, c = sim.world.size / 2;
    const other = createFoundingNest(sim, colony.id, { x: c + 60 * bu, y: sim.field.height(c + 60 * bu, c), z: c });
    if (!colony.nestIds.includes(other.id)) colony.nestIds.push(other.id);
    other.founding = null;
    const inputs = liveInputs(sim, other);
    const req = evaluateNeeds(other, 'lasius-niger', inputs).requests.find((r) => r.need === 'missing-type');
    expect(req?.type).not.toBe('royal');
  });
});
