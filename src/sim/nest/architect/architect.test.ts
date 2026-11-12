// The architect system: modes (acceptance 4), player plans (acceptance 4), throttles, withdrawal, per-need
// toggles, suggest mode, GDD 03 App. E check 19 (crowding proposal), failed sites and the blacklist (acceptance 5).

import { describe, expect, it } from 'vitest';
import { rngFork } from '@/core/rng';
import type { DigPlan, Nest, PlanSpec, Sim } from '@/sim/types';
import { ARCHITECT_EVERY, ARCHITECT_OFFSET } from '@/sim/balance/cadence';
import { ARCH_BLACKLIST_S, PLAN_UPDATE_TICKS } from '@/sim/balance/nest';
import { ARCH_FAIL_STALL_S, ARCH_SITE_RADIUS_BU } from '@/sim/balance/architect';
import { TICKS_PER_SECOND } from '@/sim/time';
import { killAnt, spawnAnt } from '@/sim/entities';
import { commandsSystem } from '@/sim/systems';
import { carveCapsule, carveEllipsoid } from '../carveOps';
import { designateChamberImpl } from '../chambers/registry';
import { nestSim, playerNest } from '../nestTestKit';
import { planG } from '../plans/geometry';
import { cancelPlanImpl, createPlanImpl, isTerminal } from '../plans/plans';
import { planCache } from '../plans/targets';
import { nestSystem } from '../system';
import { wallMin } from '../substrate';
import { SIM_TEST_TIMEOUT, archSim, digAll, growBrood, growWorkers, runTicks } from './architectTestKit';
import { evaluateNest, planSite } from './evaluate';
import { acceptArchitectPlan, architectPressures, architectSystem } from './index';
import { nestCapacity } from './capacity';
import { evaluateNeeds, liveInputs } from './needs';
import { placementCandidates } from './candidates';
import { architectRuntime } from './runtime';
import { isBlacklisted, recordSiteFailure } from './sites';

const T = TICKS_PER_SECOND;
/** First tick on which the architect system runs: (t + offset) % every === 0. */
const FIRST_EVAL = ARCHITECT_EVERY - ARCHITECT_OFFSET;

const architectPlans = (nest: Nest): DigPlan[] => nest.digPlans.filter((p) => p.source === 'architect');
const livePlans = (nest: Nest): DigPlan[] => architectPlans(nest).filter((p) => !isTerminal(p.status));
/** A plan's chamber yaw relative to its anchor's into-wall direction (the PlanSpec yawDeg that rebuilds it). */
const yawRelative = (p: DigPlan): number => p.geom.yawDeg - (Math.atan2(-p.anchor.normal.z, -p.anchor.normal.x) * 180) / Math.PI;
const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

/** A founding nest with `workers` workers and `brood` larvae, run until just after the first architect evaluation. */
function firstProposal(seed: number, workers: number, brood: number): { sim: Sim; nest: Nest; specs: PlanSpec[] } {
  const { sim, nest } = archSim({ seed });
  const specs: PlanSpec[] = [];
  architectRuntime(sim).probe = (spec) => { specs.push(spec); };
  growWorkers(sim, nest, workers);
  growBrood(sim, nest, brood);
  runTicks(sim, FIRST_EVAL + 1);
  return { sim, nest, specs };
}

describe('architect modes (acceptance 4)', () => {
  it('auto: an established nest with needs gets a proposal at the first evaluation', () => {
    const { nest } = firstProposal(1, 30, 12);
    expect(architectPlans(nest)).toHaveLength(1);
    expect(architectPlans(nest)[0]).toMatchObject({ status: 'proposed', source: 'architect' });
    expect(architectPlans(nest)[0].need).not.toBeNull();
  }, SIM_TEST_TIMEOUT);

  it('off (setAutoExpand): no plan is created while the population grows; the needs are still published', () => {
    const { sim, nest } = archSim({ seed: 2 });
    sim.enqueue({ type: 'setAutoExpand', nestId: nest.id, mode: 'off' });
    for (let k = 1; k <= 8; k++) {
      growWorkers(sim, nest, 20 * k);
      growBrood(sim, nest, 10 * k);
      runTicks(sim, ARCHITECT_EVERY);
      digAll(sim, nest);
    }
    expect(nest.architect.mode).toBe('off');
    expect(architectPlans(nest)).toHaveLength(0);
    expect(architectRuntime(sim).created).toBe(0);
    expect(nest.architect.needCache.crowding).toBeGreaterThan(1);
    expect(nest.architect.lastEvalTick).toBeGreaterThan(0);
  }, SIM_TEST_TIMEOUT);

  it('off keeps the architect plans already made (no withdrawal, they go on)', () => {
    const { sim, nest } = firstProposal(3, 30, 12);
    const plan = architectPlans(nest)[0];
    runTicks(sim, 30 * T + 10); // proposed -> queued in auto
    expect(plan.status).toBe('queued');
    sim.enqueue({ type: 'setAutoExpand', nestId: nest.id, mode: 'off' });
    for (const a of [...sim.stores.ants.list]) if (a.caste === 'worker') killAnt(sim, a.id, 'unknown'); // every need gone
    runTicks(sim, 2 * ARCHITECT_EVERY);
    expect(isTerminal(plan.status)).toBe(false);
    expect(architectRuntime(sim).withdrawn).toBe(0);
  }, SIM_TEST_TIMEOUT);

  it('suggest (T2 hook): proposals wait; acceptArchitectPlan queues them', () => {
    const { sim, nest } = archSim({ seed: 4 });
    sim.enqueue({ type: 'setAutoExpand', nestId: nest.id, mode: 'suggest' });
    growWorkers(sim, nest, 30);
    runTicks(sim, FIRST_EVAL + 1 + 60 * T);
    const plan = architectPlans(nest)[0];
    expect(plan.status).toBe('proposed');
    expect(acceptArchitectPlan(sim, plan.id)).toBe(true);
    expect(plan.status).toBe('queued');
    expect(acceptArchitectPlan(sim, plan.id)).toBe(false);
  }, SIM_TEST_TIMEOUT);

  it('per-need toggles (T2 hook) are honoured', () => {
    const { sim, nest } = archSim({ seed: 5 });
    sim.enqueue({ type: 'setArchitectNeed', nestId: nest.id, need: 'crowding', enabled: false });
    growWorkers(sim, nest, 30);
    runTicks(sim, FIRST_EVAL);
    expect(evaluateNeeds(nest, 'lasius-niger', liveInputs(sim, nest)).requests[0].need).toBe('crowding'); // the most urgent
    runTicks(sim, 1);
    expect(architectPlans(nest).map((p) => p.need)).toEqual(['missing-type']);
  }, SIM_TEST_TIMEOUT);
});

describe('player plans (acceptance 4)', () => {
  it('a player plan on the architect\'s best site: the architect plans around it', () => {
    const a = firstProposal(6, 30, 12);
    const best = a.specs[0];
    expect(best).toBeDefined();
    // same world, same state up to the evaluation, but the player planned that very room first
    const { sim, nest } = archSim({ seed: 6 });
    growWorkers(sim, nest, 30);
    growBrood(sim, nest, 12);
    sim.enqueue({ type: 'planDig', ...best, priority: 'normal', confirmWarnings: true });
    runTicks(sim, FIRST_EVAL + 1);
    const player = nest.digPlans.find((p) => p.source === 'player');
    const arch = architectPlans(nest)[0];
    expect(player).toBeDefined();
    expect(arch).toBeDefined();
    const gp = planCache(sim, nest, player!)!.geometry, ga = planCache(sim, nest, arch!)!.geometry;
    // no overlap, and at least WALL_MIN of soil between the two planned volumes
    const v = sim.carve.voxel, wm = wallMin('loam') * sim.world.bu;
    let worst = Infinity;
    for (let k = Math.floor(ga.min.z / v); k <= Math.ceil(ga.max.z / v); k++)
      for (let j = Math.floor(ga.min.y / v); j <= Math.ceil(ga.max.y / v); j++)
        for (let i = Math.floor(ga.min.x / v); i <= Math.ceil(ga.max.x / v); i++) {
          if (planG(ga, i * v, j * v, k * v) > 0) worst = Math.min(worst, -planG(gp, i * v, j * v, k * v));
        }
    expect(worst).toBeGreaterThanOrEqual(wm - v);
  }, SIM_TEST_TIMEOUT);
});

describe('throttles and withdrawal', () => {
  it('concurrent architect plans: at most 1 below 50 workers, 2 below 500; one per need', () => {
    const { sim, nest } = archSim({ seed: 7 });
    growBrood(sim, nest, 40);
    let most = 0;
    for (let k = 0; k < 6; k++) {
      growWorkers(sim, nest, 45);
      runTicks(sim, ARCHITECT_EVERY);
      most = Math.max(most, livePlans(nest).length);
    }
    expect(most).toBe(1);
    for (let k = 0; k < 6; k++) {
      growWorkers(sim, nest, 200);
      runTicks(sim, ARCHITECT_EVERY);
      const live = livePlans(nest);
      most = Math.max(most, live.length);
      expect(new Set(live.map((p) => p.need)).size).toBe(live.length);
    }
    expect(most).toBe(2);
  }, SIM_TEST_TIMEOUT);

  it('no plan while fewer than ARCH_MIN_DIGGERS ants can dig', () => {
    const { sim, nest } = archSim({ seed: 8 });
    growWorkers(sim, nest, 1);
    growBrood(sim, nest, 150);
    runTicks(sim, 3 * ARCHITECT_EVERY);
    expect(nest.architect.needCache['brood-space']).toBeGreaterThan(1);
    expect(architectPlans(nest)).toHaveLength(0);
  }, SIM_TEST_TIMEOUT);

  it('withdraws its own plan below 25 % progress once the need has gone (no blacklist)', () => {
    const { sim, nest } = firstProposal(9, 30, 0);
    const plan = architectPlans(nest)[0];
    expect(plan.need).toBe('crowding');
    const workers = sim.stores.ants.list.filter((a) => a.caste === 'worker');
    for (const a of workers.slice(0, 25)) killAnt(sim, a.id, 'unknown');
    runTicks(sim, ARCHITECT_EVERY);
    expect(plan.status).toBe('cancelled');
    expect(architectRuntime(sim).withdrawn).toBe(1);
    expect(nest.architect.blacklist).toHaveLength(0);
  }, SIM_TEST_TIMEOUT);
});

describe('GDD 03 App. E check 19 (crowding proposal)', () => {
  it('120 % crowded rest space, architect auto: a high-priority `rest` crowding proposal within 600 ticks, queued 300 ticks later', () => {
    const sim = nestSim({ sizeBu: 220, systems: [commandsSystem, nestSystem, architectSystem] });
    const bu = sim.world.bu, c = sim.world.size / 2, g = sim.field.height(c, c);
    const nest = playerNest(sim, { x: c, y: g, z: c });
    // the nest's only resting space: a 100 BU^3 rest chamber 15 BU deep, reached by a 2 BU shaft
    const centre = { x: c + 4 * bu, y: g - 15 * bu, z: c };
    carveEllipsoid(sim, centre, { x: 5 * bu, y: 1.25 * bu, z: 3.82 * bu });
    carveCapsule(sim, { x: c, y: g + 0.5 * bu, z: c }, { x: c, y: centre.y + 0.25 * bu, z: c }, 1 * bu);
    runTicks(sim, 60);
    const room = nest.chambers[0];
    expect(room).toBeDefined();
    expect(designateChamberImpl(sim, room.id, 'rest', 'player')).toBe(true);
    const cap = nestCapacity(nest, 'lasius-niger', false).adults;
    const n = Math.round(1.2 * cap);
    for (let i = 0; i < n; i++) {
      spawnAnt(sim, { colony: nest.colony, caste: 'worker', pos: room.center, ageGd: 5, nestId: nest.id, chamberId: room.id, lengthBu: 1 });
    }
    expect(architectPressures(sim, nest.id)!.crowding).toBeCloseTo(1.2, 1);
    const t0 = sim.state.tick;
    let plan: DigPlan | undefined;
    while (!plan && sim.state.tick < t0 + 600) {
      sim.tick();
      plan = architectPlans(nest).find((p) => p.need === 'crowding');
    }
    expect(plan).toMatchObject({ status: 'proposed', kind: 'chamber', chamberType: 'rest', priority: 'high' });
    // queued ARCH_PROPOSAL_S (300 ticks) after creation; the nest module updates plans every PLAN_UPDATE_TICKS
    runTicks(sim, 300 - (sim.state.tick - plan!.createdTick) - 1);
    expect(plan!.status).toBe('proposed');
    runTicks(sim, PLAN_UPDATE_TICKS + 1);
    expect(plan!.status).toBe('queued');
  }, SIM_TEST_TIMEOUT);
});

describe('failed sites and the blacklist (acceptance 5)', () => {
  it('an architect plan the player cancels blacklists its site (nest module), and the architect keeps away', () => {
    const { sim, nest } = firstProposal(3, 30, 12);
    const first = architectPlans(nest)[0], site = planSite(sim, nest, first);
    sim.enqueue({ type: 'cancelPlan', planId: first.id });
    runTicks(sim, 1);
    expect(first.status).toBe('cancelled');
    expect(nest.architect.blacklist).toHaveLength(1);
    runTicks(sim, 3 * ARCHITECT_EVERY);
    const later = architectPlans(nest).filter((p) => p !== first);
    expect(later.length).toBeGreaterThan(0);
    for (const p of later) expect(dist(planSite(sim, nest, p), site)).toBeGreaterThan(ARCH_SITE_RADIUS_BU * sim.world.bu);
  }, SIM_TEST_TIMEOUT);

  it('strikes: the second failure within the site radius blacklists the site for ARCH_BLACKLIST_S', () => {
    const { sim, nest } = archSim({ seed: 1, architect: false });
    const p = { x: 100, y: 0, z: 100 }, near = { x: 100 + 3 * sim.world.bu, y: 0, z: 100 };
    expect(recordSiteFailure(sim, nest.architect, p)).toBe(false);
    expect(isBlacklisted(sim, nest.architect, p)).toBe(false);
    expect(recordSiteFailure(sim, nest.architect, near)).toBe(true);
    expect(isBlacklisted(sim, nest.architect, p)).toBe(true);
    expect(nest.architect.blacklist[0].untilTick).toBe(sim.state.tick + ARCH_BLACKLIST_S * T);
    expect(nest.architect.failures).toHaveLength(0);
  }, SIM_TEST_TIMEOUT);

  it('a site whose plans fail twice is not proposed again before the blacklist expires', () => {
    const { sim, nest } = firstProposal(2, 30, 12);
    const first = architectPlans(nest)[0];
    const site = planSite(sim, nest, first);
    const radius = ARCH_SITE_RADIUS_BU * sim.world.bu;
    const atSite = (p: DigPlan) => dist(planSite(sim, nest, p), site) <= radius;
    /** The plan hits a hidden obstacle: stalled `obstructed` long enough to count as a failure. */
    const fail = (p: DigPlan) => { p.status = 'stalled'; p.blockedReason = 'obstructed'; p.statusTick = sim.state.tick - ARCH_FAIL_STALL_S * T - 1; };
    fail(first);
    evaluateNest(sim, nest);
    expect(first.status).toBe('cancelled');
    expect(nest.architect.failures).toHaveLength(1);
    expect(isBlacklisted(sim, nest.architect, site)).toBe(false);
    // the retry at the same site: the architect's own pick if it chose it again, else the same request again
    let retry = livePlans(nest).find(atSite);
    if (!retry) {
      for (const p of livePlans(nest)) cancelPlanImpl(sim, p.id, 'architect');
      const id = createPlanImpl(sim, {
        nestId: nest.id, kind: first.kind, chamberType: first.chamberType ?? undefined, size: first.size ?? undefined,
        anchor: first.anchor, yawDeg: yawRelative(first), priority: first.priority, confirmWarnings: false,
      }, 'architect');
      retry = nest.digPlans.find((p) => p.id === id);
      if (retry) retry.need = first.need;
    }
    expect(retry && atSite(retry)).toBe(true);
    fail(retry!);
    evaluateNest(sim, nest);
    expect(retry!.status).toBe('cancelled');
    expect(isBlacklisted(sim, nest.architect, site)).toBe(true);
    const until = nest.architect.blacklist[0].untilTick;
    expect(until).toBe(sim.state.tick + ARCH_BLACKLIST_S * T);
    // while blacklisted: no candidate and no plan digs within the site radius
    for (let n = 0; n < 6; n++) {
      const req = evaluateNeeds(nest, 'lasius-niger', liveInputs(sim, nest)).requests[0];
      for (const c of placementCandidates(sim, nest, req, rngFork(n, 'bl'))) expect(dist(c.centre, site)).toBeGreaterThan(radius);
    }
    const seen: DigPlan[] = [];
    while (sim.state.tick < until - ARCHITECT_EVERY) {
      runTicks(sim, ARCHITECT_EVERY);
      for (const p of architectPlans(nest)) if (!seen.includes(p) && p !== retry && p !== first) seen.push(p);
      for (const p of livePlans(nest)) expect(atSite(p)).toBe(false);
      digAll(sim, nest);
      growWorkers(sim, nest, 30 + seen.length * 15);
    }
    expect(seen.length).toBeGreaterThan(0);
    // expired: the site is free again
    runTicks(sim, until - sim.state.tick + 1);
    expect(isBlacklisted(sim, nest.architect, site)).toBe(false);
  }, 120_000);
});
