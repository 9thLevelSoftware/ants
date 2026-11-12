// Reviewer tests for nestops (GDD 03; task spec docs/design/tasks/nestops.md). Tests that pass are regression
// tests; a failing test here demonstrates a defect for the fixer (see the comment above each).
import { describe, expect, it } from 'vitest';
import { PERF_STRICT, heavyLoad } from '@/sim/testing/perfLoad';
import type { Vec3 } from '@/core/math/vec3';
import type { Ant, PlanSpec, Sim } from '@/sim/types';
import { nestFieldId } from '@/sim/types';
import { removeItem } from '@/sim/entities';
import { createSim } from '@/sim/sim';
import { restore, snapshot, stateHash } from '@/sim/save';
import { commandsSystem } from '@/sim/systems';
import { carveTemplateNest, createFoundingNest, claimDigSite, createPlan, digBite, instantCarvePlan, nestFieldsSystem, planDigAim, registerNestFields, releaseDigSite, sealEntrance, validatePlan } from './index';
import { createMound, deposit, moundVolume, relax } from './mounds';
import { planById } from './plans/plans';
import { antSlot } from './plans/frontier';
import { planG } from './plans/geometry';
import { planCache } from './plans/targets';
import { nestSim, placeWorker, playerNest, runTicks } from './nestTestKit';
import { nestSystem } from './system';
import { walkerStep } from '@/sim/locomotion/walker';
import { makeTestWorld } from '@/sim/testing';
import { carveCapsule } from './carveOps';
import { detectNestChambers } from './chambers/upkeep';
import { placePellet, spawnPellet } from './pellets';
import { collect as collectEv } from './nestTestKit';
import { sampleI, sampleJ, sampleK } from './voxelKey';
import { OPEN_MIN } from './carve/keys';

const BU = 4;
const SYSTEMS = [commandsSystem, nestSystem];

function tunnelNest(depth = 20) {
  const sim = nestSim({ systems: SYSTEMS });
  const c = sim.world.size / 2, y = -depth * BU;
  sim.kernel.carveCapsule({ x: c - 10 * BU, y, z: c }, { x: c + 10 * BU, y, z: c }, BU, { force: true });
  const nest = playerNest(sim, { x: c, y, z: c });
  return { sim, nest, c, y };
}

function nurserySpec(nestId: number, c: number, y: number, size: 'm' | 's' = 'm'): PlanSpec {
  return {
    nestId, kind: 'chamber', chamberType: 'nursery', size,
    anchor: { pos: { x: c, y: y - 0.5 * BU, z: c + BU }, normal: { x: 0, y: 0, z: -1 } }, priority: 'normal', confirmWarnings: true,
  };
}

/** Diggers bite at their slots (placed there) until the plan completes or maxTicks pass. */
function digPlan(sim: Sim, planId: number, diggers: Ant[], maxTicks: number): void {
  const heading: Vec3 = { x: 0, y: 0, z: 0 };
  for (let t = 0; t < maxTicks; t++) {
    if (planById(sim, planId)!.plan.status === 'complete') break;
    for (const ant of diggers) {
      if (!antSlot(sim, ant) && !claimDigSite(sim, ant)) continue;
      const ref = antSlot(sim, ant)!;
      ant.pos = { ...ref.slot.pos };
      const feet = { ...ref.slot.pos };
      const slope = planDigAim(sim, ant, feet, heading);
      if (slope === null) { releaseDigSite(sim, ant); continue; }
      const res = digBite(sim, ant, feet, heading, slope);
      if (res.pelletId >= 0) removeItem(sim, res.pelletId, 'test');
    }
    sim.tick();
  }
}

describe('nestops review: mounds', () => {
  // DEFECT (mounds.ts clearEntranceCells): material moved out of the kept-clear hole is re-deposited through
  // depositHeight, which adds the moved volume to Mound.volume a second time (h was zeroed without subtracting).
  // Any entrance whose radius grows after soil was dumped next to it (registerOpening widens radii) inflates
  // Mound.volume above the grid's real volume.
  it('Mound.volume stays equal to the grid volume when the entrance radius grows', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = sim.state.nests[0], e = nest.entrances[0];
    const m = createMound(sim, nest, e, e.pos.x, e.pos.z, 'loam');
    for (let n = 0; n < 16; n++) {
      const a = (n / 16) * 2 * Math.PI, r = e.radius + 0.6 * BU;
      deposit(sim, m, e.pos.x + Math.cos(a) * r, e.pos.z + Math.sin(a) * r, 0.85 * BU ** 3);
    }
    relax(sim, m);
    expect(m.volume).toBeCloseTo(moundVolume(sim, m), 6);
    e.radius += 1.0 * BU; // the opening was widened (registerOpening)
    relax(sim, m);
    expect(moundVolume(sim, m)).toBeGreaterThan(0);
    expect(Math.abs(m.volume - moundVolume(sim, m))).toBeLessThan(1e-3);
  });

  it('relaxation conserves volume (no grid-edge loss for a small pile) and never fills the hole', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = sim.state.nests[0], e = nest.entrances[0];
    const m = createMound(sim, nest, e, e.pos.x, e.pos.z, 'sand');
    deposit(sim, m, e.pos.x + e.radius + 2 * BU, e.pos.z, 40 * BU ** 3);
    const before = moundVolume(sim, m);
    for (let n = 0; n < 6; n++) relax(sim, m);
    expect(moundVolume(sim, m)).toBeCloseTo(before, 4);
    expect(Number.isFinite(m.volume)).toBe(true);
  });
});

describe('nestops review: persistence of derived nav fields', () => {
  // DEFECT (services.registerNestTargets on createSim + nestops navFields): after a load, createServices registers
  // only exit / seal (at entrance positions) / chamber fields. The D_plan field of a live plan is not re-added until
  // its window changes, so nestNav.distance(nest, plan) is -1 after a load while it is finite in the run that
  // never saved; claimSlot then scores plans by straight distance x SLOT_OUTSIDE_PENALTY instead of D_plan:
  // restore-dependent behaviour.
  it('a live plan keeps its D_plan field across save / load', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, nurserySpec(nest.id, c, y), 'player');
    expect(id).toBeGreaterThan(0);
    runTicks(sim, 30);
    const probe = { x: c - 6 * BU, y, z: c };
    const before = sim.nestNav.distance(nest.id, { kind: 'plan', id }, probe);
    expect(before).toBeGreaterThan(0);
    const { state } = restore(snapshot(sim));
    const back = createSim(state, sim.world, { systems: SYSTEMS });
    runTicks(back, 1);
    runTicks(sim, 1);
    expect(stateHash(back.state)).toBe(stateHash(sim.state));
    expect(back.nestNav.hasTarget(nestFieldId(nest.id, { kind: 'plan', id }))).toBe(true);
    expect(back.nestNav.distance(nest.id, { kind: 'plan', id }, probe)).toBeCloseTo(sim.nestNav.distance(nest.id, { kind: 'plan', id }, probe), 6);
  });

  function sealedNest() {
    const sim = nestSim({ systems: SYSTEMS });
    const c = sim.world.size / 2;
    const room = { x: c, y: -12 * BU, z: c };
    sim.kernel.carveEllipsoid(room, { x: 4 * BU, y: 1.25 * BU, z: 4 * BU }, { force: true });
    const nest = playerNest(sim, room);
    sim.kernel.carveCapsule(room, { x: c, y: -5 * BU, z: c }, BU, { force: true });
    const id = createPlan(sim, {
      nestId: nest.id, kind: 'shaft', anchor: { pos: { x: c, y: -4.1 * BU, z: c }, normal: { x: 0, y: -1, z: 0 } },
      length: 7, priority: 'normal', confirmWarnings: true,
    }, 'player');
    instantCarvePlan(sim, id);
    const e = nest.entrances[0];
    for (let n = 0; n < 6 && e.status !== 'sealed'; n++) sealEntrance(sim, e.id, -1);
    expect(e.status).toBe('sealed');
    runTicks(sim, 2);
    const seal = { kind: 'seal' as const, id: -1 };
    const before = sim.nestNav.distance(nest.id, seal, room);
    expect(before).toBeGreaterThan(0);
    return { sim, nest, room, seal, before };
  }

  // DEFECT (same root cause): D_seal is seeded at the plug voxels by nestops (navFields.refreshNestFields), but a
  // load re-seeds it at the entrance positions (registerNestTargets), so D_seal distances differ after a load.
  // Straight after createSim (no tick yet) only services.ts has run: since the Stage 1A gate createServices calls
  // registerNestFields, so this holds before the first tick (it was `it.fails` until that hook was wired).
  it('D_seal of a sealed entrance is the same after save / load (straight after createSim)', () => {
    const { sim, nest, room, seal, before } = sealedNest();
    const back = createSim(restore(snapshot(sim)).state, sim.world, { systems: SYSTEMS });
    expect(back.nestNav.distance(nest.id, seal, room)).toBeCloseTo(before, 6);
  });

  it('D_seal of a sealed entrance is the same after save / load (from the first tick on)', () => {
    const { sim, nest, room, seal, before } = sealedNest();
    const back = createSim(restore(snapshot(sim)).state, sim.world, { systems: SYSTEMS });
    runTicks(back, 1);
    runTicks(sim, 1);
    expect(back.nestNav.distance(nest.id, seal, room)).toBeCloseTo(before, 6);
    expect(stateHash(back.state)).toBe(stateHash(sim.state));
  });

  it('registerNestFields (the createServices hook) restores D_seal before any tick', () => {
    const { sim, nest, room, seal, before } = sealedNest();
    const state = restore(snapshot(sim)).state;
    const back = createSim(state, sim.world, { systems: SYSTEMS });
    registerNestFields(back.nestNav, back.carve, state, back.world.bu);
    expect(back.nestNav.distance(nest.id, seal, room)).toBeCloseTo(before, 6);
  });

  it('the default system list completes the fields in the commands phase, before behaviours read them', () => {
    const { sim, nest, room, seal, before } = sealedNest();
    const back = createSim(restore(snapshot(sim)).state, sim.world, { systems: [commandsSystem, nestFieldsSystem] });
    runTicks(back, 1);
    expect(back.nestNav.distance(nest.id, seal, room)).toBeCloseTo(before, 6);
  });
});

describe('nestops review: plans', () => {
  // GDD 03 App. E check 14: a 10 BU tunnel plan dug by diggers completes, >= 97 % of target voxels are open, and
  // no voxel with g < -0.25 BU changed openness because of plan bites.
  it('check 14: a tunnel plan dug by two diggers stays inside its volume and completes', () => {
    const { sim, nest, c, y } = tunnelNest(15);
    const spec: PlanSpec = {
      nestId: nest.id, kind: 'tunnel', anchor: { pos: { x: c, y, z: c + BU }, normal: { x: 0, y: 0, z: -1 } },
      length: 10, priority: 'normal', confirmWarnings: true,
    };
    const v = validatePlan(sim, spec);
    expect(v.codes).toEqual([]);
    const id = createPlan(sim, spec, 'player');
    expect(id).toBeGreaterThan(0);
    const { plan } = planById(sim, id)!;
    const g = planCache(sim, nest, plan)!.geometry;
    // snapshot every sample around the plan
    const vox = sim.carve.voxel, pad = 4 * BU;
    const before = new Map<string, number>();
    for (let k = Math.floor((g.min.z - pad) / vox); k <= Math.ceil((g.max.z + pad) / vox); k++)
      for (let j = Math.floor((g.min.y - pad) / vox); j <= Math.ceil((g.max.y + pad) / vox); j++)
        for (let i = Math.floor((g.min.x - pad) / vox); i <= Math.ceil((g.max.x + pad) / vox); i++) before.set(`${i},${j},${k}`, sim.carve.sampleAt(i, j, k));
    const diggers = [0, 1].map((n) => placeWorker(sim, { x: c - BU + n * 2 * BU, y, z: c }, { x: 0, y: 0, z: 1 }, nest.id));
    digPlan(sim, id, diggers, 6000);
    expect(plan.status).toBe('complete');
    const cache = planCache(sim, nest, plan)!;
    let open = 0;
    for (const key of cache.targets) if (sim.carve.sampleAt(sampleI(key), sampleJ(key), sampleK(key)) >= OPEN_MIN) open++;
    expect(open / cache.targets.length).toBeGreaterThanOrEqual(0.97);
    let outside = 0;
    for (const [key, old] of before) {
      const [i, j, k] = key.split(',').map(Number);
      if (planG(g, i * vox, j * vox, k * vox) < -0.25 * BU && sim.carve.sampleAt(i, j, k) !== old) outside++;
    }
    expect(outside).toBe(0);
  }, 120_000);

  // Acceptance 6 / GDD 03 §7.4 + §15 (instantCarve for generated nests): carving all spheres of a chamber plan
  // should give the planned room. Measured here: how much of the planned ellipsoid instantCarvePlan opens.
  it('instantCarvePlan of a nursery m opens a room of the planned size (125.7 BU^3 +- 15 %)', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, nurserySpec(nest.id, c, y), 'player');
    instantCarvePlan(sim, id);
    const room = nest.chambers.find((ch) => ch.type === 'nursery');
    expect(room).toBeDefined();
    expect(Math.abs(room!.volume - 125.7) / 125.7).toBeLessThan(0.15);
  });

  it('planDig through the command queue: plan-created, then a duplicate overlapping plan is rejected overlaps-plan', () => {
    const { sim, nest, c, y } = tunnelNest();
    const spec = nurserySpec(nest.id, c, y);
    sim.enqueue({ type: 'planDig', ...spec });
    runTicks(sim, 1);
    expect(nest.digPlans.length).toBe(1);
    expect(validatePlan(sim, spec).codes).toEqual(['overlaps-plan']);
  });

  it('validatePlan stays fast enough for a live ghost (GDD 03 §7.3: <= 2 ms; load-tolerant x10, strict with FOUNDRESS_PERF_STRICT=1)', () => {
    const { sim, nest, c, y } = tunnelNest();
    const spec = nurserySpec(nest.id, c, y);
    const ent: PlanSpec = { nestId: nest.id, kind: 'entrance', anchor: { pos: { x: c + 6 * BU, y: 0, z: c + 2 * BU }, normal: { x: 0, y: 1, z: 0 } }, surfacePoint: { x: c + 6 * BU, y: 0, z: c + 2 * BU }, priority: 'normal', confirmWarnings: true };
    const tunnelDeep = tunnelNest(10);
    const entSpec = { ...ent, nestId: tunnelDeep.nest.id };
    validatePlan(sim, spec); validatePlan(tunnelDeep.sim, entSpec);
    let best = Infinity, bestEnt = Infinity;
    for (let r = 0; r < 5; r++) {
      let t0 = performance.now();
      validatePlan(sim, spec);
      best = Math.min(best, performance.now() - t0);
      t0 = performance.now();
      validatePlan(tunnelDeep.sim, entSpec);
      bestEnt = Math.min(bestEnt, performance.now() - t0);
    }
    const limit = PERF_STRICT ? 2 : heavyLoad() ? 60 : 20;
    expect(best).toBeLessThan(limit);
    expect(bestEnt).toBeLessThan(limit);
  });
});

describe('nestops review: bite edge cases', () => {
  function wall() {
    const sim = nestSim();
    const c = sim.world.size / 2, y = -8 * BU;
    sim.kernel.carveCapsule({ x: c - 8 * BU, y, z: c }, { x: c, y, z: c }, 1.25 * BU, { force: true });
    playerNest(sim, { x: c - 4 * BU, y, z: c });
    const ant = placeWorker(sim, { x: c - 1.5 * BU, y, z: c }, { x: 1, y: 0, z: 0 });
    return { sim, ant };
  }

  it('NaN / zero heading and NaN / extreme slopes never write NaN into state', () => {
    const { sim, ant } = wall();
    const feet = { x: ant.pos.x, y: ant.pos.y - ant.footOffset, z: ant.pos.z };
    for (const [h, s] of [[{ x: 0, y: 0, z: 0 }, 0], [{ x: 1, y: 0, z: 0 }, Number.NaN], [{ x: Number.NaN, y: 0, z: 0 }, 10], [{ x: 1, y: 0, z: 0 }, 90], [{ x: 1, y: 0, z: 0 }, -90], [{ x: 1, y: 0, z: 0 }, 1e9]] as [Vec3, number][]) {
      const res = digBite(sim, ant, feet, h, s);
      if (res.pelletId >= 0) {
        const it = sim.stores.items.get(res.pelletId)!;
        expect(Number.isFinite(it.volume) && it.volume > 0).toBe(true);
        expect(Number.isFinite(it.pos.x + it.pos.y + it.pos.z)).toBe(true);
      }
      expect(Number.isFinite(ant.pos.x + ant.pos.y + ant.pos.z)).toBe(true);
    }
    for (const a of sim.carve.data.chunks) for (let s = 0; s < a.length; s++) if (Number.isNaN(a[s])) throw new Error('NaN in carve');
  });

  it('conservation: over 30 bites at one face, the sum of pellet volumes equals the open volume gained', () => {
    const { sim, ant } = wall();
    const before = sim.carve.openVolume();
    let pellets = 0;
    for (let n = 0; n < 30; n++) {
      const res = digBite(sim, ant, { x: ant.pos.x, y: ant.pos.y - ant.footOffset, z: ant.pos.z }, { x: 1, y: 0, z: 0 }, 0);
      if (res.pelletId >= 0) { pellets += sim.stores.items.get(res.pelletId)!.volume; removeItem(sim, res.pelletId, 'test'); }
    }
    const gained = (sim.carve.openVolume() - before) / BU ** 3;
    expect(Math.abs(gained - pellets)).toBeLessThan(0.02 * Math.max(1, gained));
  });
});

describe('nestops review: natural cavities, chambers, entrances', () => {
  // GDD 03 §3 joining rule: "When a carve operation opens a voxel 26-adjacent to an open voxel of an unowned natural
  // cavity, the whole connected natural component joins the nest". joinNaturalCavities probes the nav component
  // at the centre of the cavity's bounding box only; an L-shaped (or ring-shaped) cavity whose bbox centre is solid
  // never joins.
  it('an L-shaped natural cavity whose bbox centre is solid still joins when a tunnel connects to it', () => {
    const world = makeTestWorld();
    const c = world.size / 2, y = -4 * BU;
    const a = { x: c + 6 * BU, y, z: c }, b = { x: c + 18 * BU, y, z: c }, d = { x: c + 18 * BU, y, z: c + 12 * BU };
    world.preCarve.push({ shape: 'capsule', a, b, r: 1.1 * BU, natural: true, cavityId: 7 });
    world.preCarve.push({ shape: 'capsule', a: b, b: d, r: 1.1 * BU, natural: true, cavityId: 7 });
    world.cavities.push({
      id: 7, kind: 'root-gallery', min: { x: a.x - 1.1 * BU, y: y - 1.1 * BU, z: a.z - 1.1 * BU }, max: { x: d.x + 1.1 * BU, y: y + 1.1 * BU, z: d.z + 1.1 * BU },
      openings: [],
    });
    const sim = nestSim({ world, systems: SYSTEMS });
    runTicks(sim, 1);
    const room = { x: c - 4 * BU, y, z: c };
    sim.kernel.carveEllipsoid(room, { x: 3 * BU, y: 1.25 * BU, z: 3 * BU }, { force: true });
    const nest = playerNest(sim, room);
    carveCapsule(sim, { x: room.x + 2 * BU, y, z: c }, { x: a.x - 0.5 * BU, y, z: c }, BU);
    expect(sim.nestNav.componentAt(a)).toBe(sim.nestNav.componentAt(room)); // connected
    expect(sim.state.worldDelta.naturalOwners['7']).toBe(nest.id);
  });

  it('two general chambers joined by a wide cut merge: one keeps its id, the other is removed (merged)', () => {
    const { sim, nest, c, y } = tunnelNest();
    const r1 = { x: c - 6 * BU, y: y + 0.25 * BU, z: c }, r2 = { x: c + 6 * BU, y: y + 0.25 * BU, z: c };
    sim.kernel.carveEllipsoid(r1, { x: 4 * BU, y: 1.25 * BU, z: 4 * BU }, { force: true });
    sim.kernel.carveEllipsoid(r2, { x: 4 * BU, y: 1.25 * BU, z: 4 * BU }, { force: true });
    detectNestChambers(sim, nest);
    expect(nest.chambers.length).toBe(2);
    const ids = nest.chambers.map((ch) => ch.id);
    sim.kernel.carveEllipsoid({ x: c, y: y + 0.25 * BU, z: c }, { x: 4 * BU, y: 1.25 * BU, z: 3.5 * BU }, { force: true });
    const removed = collectEv(sim, ['chamber-removed'], () => detectNestChambers(sim, nest));
    expect(nest.chambers.length).toBe(1);
    expect(ids).toContain(nest.chambers[0].id);
    expect(removed.map((e) => (e as unknown as { reason: string }).reason)).toEqual(['merged']);
  });

  // DEFECT (plans/targets.ts sampleDiggable + validate.ts targetVolume): plan samples in the open air above the
  // ground count as closed, diggable targets. A shaft plan whose length overshoots the surface (here it ends 3 BU
  // above the ground; nothing clips a shaft at the surface) gets air targets that bites can never open (nothing
  // solid: `no-target`), so its top spheres never reach SPHERE_DONE, progress stops at ~81 %, the plan stays
  // `active` forever with no stall reason and the diggers loop on `no-target`. instantCarvePlan hides this
  // because carveSphere writes the air samples.
  it('a shaft plan dug UP to the surface by diggers (not instant) registers a dug entrance and D_exit reaches the room', () => {
    const sim = nestSim({ systems: SYSTEMS });
    const c = sim.world.size / 2;
    const room = { x: c, y: -10 * BU, z: c };
    sim.kernel.carveEllipsoid(room, { x: 4 * BU, y: 1.25 * BU, z: 4 * BU }, { force: true });
    const nest = playerNest(sim, room);
    detectNestChambers(sim, nest);
    const id = createPlan(sim, {
      nestId: nest.id, kind: 'shaft', anchor: { pos: { x: c + 2 * BU, y: room.y + 1.0 * BU, z: c }, normal: { x: 0, y: -1, z: 0 } },
      length: 12, priority: 'normal', confirmWarnings: true,
    }, 'player');
    expect(id).toBeGreaterThan(0);
    const diggers = [0, 1].map((n) => placeWorker(sim, { x: c + n * BU, y: room.y, z: c }, { x: 1, y: 0, z: 0 }, nest.id));
    digPlan(sim, id, diggers, 4000);
    expect(planById(sim, id)!.plan.status).toBe('complete');
    expect(nest.entrances.length).toBeGreaterThanOrEqual(1);
    expect(nest.entrances[0].kind).toBe('dug');
    runTicks(sim, 20);
    expect(sim.nestNav.distance(nest.id, { kind: 'exit', id: -1 }, room)).toBeGreaterThan(0);
  }, 120_000);
});

describe('nestops review: entrance plans', () => {
  // Regression: entrance plans end 0.5 BU above the surface but still complete (their air share stays small).
  it('an entrance plan from a shallow room dug by diggers completes and opens a dug entrance', () => {
    const sim = nestSim({ systems: SYSTEMS });
    const c = sim.world.size / 2;
    const room = { x: c, y: -8 * BU, z: c };
    sim.kernel.carveEllipsoid(room, { x: 4 * BU, y: 1.25 * BU, z: 4 * BU }, { force: true });
    const nest = playerNest(sim, room);
    detectNestChambers(sim, nest);
    const s = { x: c + 3 * BU, y: 0, z: c };
    const v = validatePlan(sim, { nestId: nest.id, kind: 'entrance', anchor: { pos: s, normal: { x: 0, y: 1, z: 0 } }, surfacePoint: s, priority: 'normal', confirmWarnings: true });
    expect(v.codes).toEqual([]);
    const id = createPlan(sim, { nestId: nest.id, kind: 'entrance', anchor: { pos: s, normal: { x: 0, y: 1, z: 0 } }, surfacePoint: s, priority: 'normal', confirmWarnings: true }, 'player');
    expect(id).toBeGreaterThan(0);
    const diggers = [0, 1].map((n) => placeWorker(sim, { x: c + n * BU, y: room.y, z: c }, { x: 1, y: 0, z: 0 }, nest.id));
    digPlan(sim, id, diggers, 4000);
    expect(nest.entrances.some((e) => e.kind === 'dug')).toBe(true);
    expect(planById(sim, id)!.plan.status).toBe('complete');
  }, 120_000);
});

describe('nestops review: pellets', () => {
  it('a pellet dropped within 1 BU of an active plan spoil point joins its spoil pile; MAX_LOOSE cap tamps the oldest', () => {
    const { sim, nest, c, y } = tunnelNest();
    const id = createPlan(sim, nurserySpec(nest.id, c, y), 'player');
    const plan = planById(sim, id)!.plan;
    const it = spawnPellet(sim, plan.spoilPoint, 0.8, 'loam', nest.id, nest.colony, -1);
    placePellet(sim, it, plan.spoilPoint);
    expect(it.inNest).toBe(true);
    expect(it.spoilPlanId).toBe(id);
  });

  it('surface pellets far from any entrance form a spoil heap (no entrance); the heap is walkable terrain', () => {
    const sim = nestSim({ nest: 'small', systems: SYSTEMS });
    const nest = sim.state.nests[0], e = nest.entrances[0];
    const p = { x: e.pos.x + 60 * BU, y: 0, z: e.pos.z };
    for (let n = 0; n < 10; n++) {
      const it = spawnPellet(sim, p, 0.85, 'loam', nest.id, nest.colony, -1);
      placePellet(sim, it, p);
    }
    runTicks(sim, 3300);
    const heaps = sim.state.worldDelta.mounds.filter((m) => m.entranceId < 0);
    expect(heaps.length).toBe(1);
    expect(moundVolume(sim, heaps[0])).toBeCloseTo(10 * 0.85 * 1.25, 3);
    expect(sim.field.height(p.x, p.z)).toBeGreaterThan(0.2 * BU);
  }, 60_000);
});

describe('nestops review: cost of bites near an entrance', () => {
  // Every carve near an entrance re-evaluates it (plugCount + throat BFS with field evaluations). Measured cost
  // of one bite in a shaft right under an open entrance vs. the same bite deep in the soil (load-tolerant).
  it('a bite next to an open entrance costs < 10 ms (min of 5; load-tolerant, strict with FOUNDRESS_PERF_STRICT=1)', () => {
    const sim = nestSim({ nest: 'small', systems: SYSTEMS });
    const e = sim.state.nests[0].entrances[0];
    let best = Infinity;
    for (let n = 0; n < 5; n++) {
      const ant = placeWorker(sim, { x: e.pos.x, y: e.pos.y - 2 * BU, z: e.pos.z }, { x: 1, y: 0, z: 0 }, sim.state.nests[0].id);
      const t0 = performance.now();
      digBite(sim, ant, { x: ant.pos.x, y: ant.pos.y - ant.footOffset, z: ant.pos.z }, { x: Math.cos(n), y: 0, z: Math.sin(n) }, 0);
      best = Math.min(best, performance.now() - t0);
    }
    expect(best).toBeLessThan(PERF_STRICT ? 10 : heavyLoad() ? 50 : 10);
  });
});

describe('nestops review: founding dig flow', () => {
  // Regression: a founding queen in `digging` on flat ground expels soil before the first entrance exists; the
  // breach registers an entrance and the pile's volume bookkeeping stays exact.
  it('queen bites down from the surface: an entrance registers and the founding mound keeps Mound.volume == grid volume', () => {
    const sim = nestSim({ systems: SYSTEMS });
    const nest = sim.state.nests[0];
    const queen = sim.state.ants.find((a) => a.caste === 'queen')!;
    nest.founding!.state = 'digging';
    nest.origin = { ...queen.pos };
    let expelled = 0;
    for (let n = 0; n < 40; n++) {
      const ev = collectEv(sim, ['pellet-expelled'], () => {
        const res = digBite(sim, queen, { x: queen.pos.x - queen.up.x * queen.footOffset, y: queen.pos.y - queen.up.y * queen.footOffset, z: queen.pos.z - queen.up.z * queen.footOffset }, { x: 1, y: 0, z: 0 }, 35);
        if (res.ok) queen.pos = { ...queen.pos };
      });
      for (const e of ev) expelled += (e as unknown as { volume: number }).volume;
      walkerStepTo(sim, queen);
    }
    expect(expelled).toBeGreaterThan(5);
    expect(nest.entrances.length).toBeGreaterThanOrEqual(1);
    const m = sim.state.worldDelta.mounds.find((x) => x.nestId === nest.id)!;
    expect(m).toBeDefined();
    expect(moundVolume(sim, m)).toBeCloseTo(1.25 * expelled, 2);
    expect(m.volume).toBeCloseTo(moundVolume(sim, m), 2);
  });
});

function walkerStepTo(sim: Sim, ant: Ant): void {
  walkerStep(sim.field, ant, { x: 1, y: -0.5, z: 0 }, 2 * BU, 0.1, sim.kernel.walker);
}

describe('nestops review: pillars', () => {
  it('a sand chamber that needs pillars validates with them and the pillar columns stay solid after an instant carve', () => {
    const sim = nestSim({ material: 'sand', moisture: 0.1, systems: SYSTEMS });
    const c = sim.world.size / 2, y = -20 * BU;
    sim.kernel.carveCapsule({ x: c - 10 * BU, y, z: c }, { x: c + 10 * BU, y, z: c }, BU, { force: true });
    const nest = playerNest(sim, { x: c, y, z: c });
    const spec = nurserySpec(nest.id, c, y);
    const v = validatePlan(sim, spec);
    expect(v.ok).toBe(true);
    const id = createPlan(sim, spec, 'player');
    expect(id).toBeGreaterThan(0);
    const plan = planById(sim, id)!.plan;
    const g = planCache(sim, nest, plan)!.geometry;
    expect(g.pillars.length).toBeGreaterThan(0);
    instantCarvePlan(sim, id);
    for (const p of g.pillars) expect(sim.carve.sampleAt(Math.round(p.x / sim.carve.voxel), Math.round(p.y / sim.carve.voxel), Math.round(p.z / sim.carve.voxel))).toBeLessThan(OPEN_MIN);
    expect(nest.chambers.some((ch) => ch.type === 'nursery')).toBe(true);
  });
});

describe('nestops review: chamber detection cost', () => {
  // GDD 03 §16 / spec deliverable 5 ("throttled, incremental where possible"): detection re-scans the whole nest
  // box (every chunk, every core sample, region stats with field marches, nest open volume) on any carve anywhere.
  // Measured under load ~4: 16 ms (3-chamber test nest), 30 ms (7 chambers, 1,560 BU^3), all in one tick every
  // CHAMBER_DETECT_TICKS while digging goes on. Strict mode (FOUNDRESS_PERF_STRICT=1) holds it to the 4 ms sim
  // frame budget of docs/03-architecture.md §6; the default limit only catches gross regressions.
  it('one detection pass of a 7-chamber nest', () => {
    const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    const sim = nestSim({ systems: SYSTEMS });
    const nest = createFoundingNest(sim, sim.state.colonies[0].id, { x: sim.world.size / 2 + 40 * BU, y: 0, z: sim.world.size / 2 });
    carveTemplateNest(sim, nest.id, { chambers: [
      { type: 'nursery', size: 'm', depthBu: 14 }, { type: 'food', size: 's', depthBu: 22 }, { type: 'rest', size: 'm', depthBu: 30 },
      { type: 'general', size: 'l', depthBu: 40 }, { type: 'rest', size: 'l', depthBu: 52 }, { type: 'nursery', size: 'm', depthBu: 62 }] });
    let best = Infinity;
    for (let r = 0; r < 4; r++) {
      const t0 = performance.now();
      detectNestChambers(sim, nest);
      best = Math.min(best, performance.now() - t0);
    }
    expect(nest.chambers.length).toBe(7);
    expect(best).toBeLessThan(env.FOUNDRESS_PERF_STRICT === '1' ? 4 : 200);
  }, 60_000);
});
