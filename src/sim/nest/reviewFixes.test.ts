// Regression tests for the fixes made after the nestops review (see nestops.verify.test.ts for the reviewer's
// own tests): mound bookkeeping at the grid edge, open-air plan samples, no-target bites, floor-raising tamping,
// validation order, chamber-detection dirtying and caches, stimuli.
import { describe, expect, it } from 'vitest';
import type { PlanSpec, Sim } from '@/sim/types';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save';
import { commandsSystem } from '@/sim/systems';
import { carveTemplateNest, createFoundingNest, createPlan, digBite, digStimulus, haulStimulus, planNoHaulers, validatePlan } from './index';
import { createMound, deposit, moundVolume, relax } from './mounds';
import { nestSim, placeWorker, playerNest, runTicks, setMoisture } from './nestTestKit';
import { nestSystem } from './system';
import { detectNestChambers } from './chambers/upkeep';
import { nestRuntime, takeNestDirty } from './runtime';
import { placePellet, spawnPellet } from './pellets';
import { tampPellet } from './tamp';
import { planById } from './plans/plans';
import { OPEN_MIN } from './carve/keys';
import { SPOIL_PILE_MAX, NO_HAULERS_S } from '@/sim/balance/nest';

const BU = 4;
const SYSTEMS = [commandsSystem, nestSystem];

function tunnelNest(depth = 20, opts: { material?: 'sand'; moisture?: number } = {}) {
  const sim = nestSim({ systems: SYSTEMS, material: opts.material, moisture: opts.moisture });
  const c = sim.world.size / 2, y = -depth * BU;
  sim.kernel.carveCapsule({ x: c - 10 * BU, y, z: c }, { x: c + 10 * BU, y, z: c }, BU, { force: true });
  const nest = playerNest(sim, { x: c, y, z: c });
  return { sim, nest, c, y };
}

const nursery = (nestId: number, c: number, y: number): PlanSpec => ({
  nestId, kind: 'chamber', chamberType: 'nursery', size: 'm',
  anchor: { pos: { x: c, y: y - 0.5 * BU, z: c + BU }, normal: { x: 0, y: 0, z: -1 } }, priority: 'normal', confirmWarnings: true,
});

describe('mounds: material moved out of the kept-clear hole', () => {
  it('keeps Mound.volume equal to the grid when the outward cell is off the grid (entrance at the grid edge)', () => {
    const sim = nestSim({ nest: 'small' });
    const nest = sim.state.nests[0], e = nest.entrances[0];
    // grid centred so the entrance sits 2 cells inside its -x edge
    const m = createMound(sim, nest, e, e.pos.x + 30 * BU, e.pos.z, 'loam');
    // on the -x side, whose outward cells lie past the grid edge
    for (let n = 0; n < 8; n++) deposit(sim, m, e.pos.x - e.radius - 0.6 * BU, e.pos.z + (n - 4) * 0.5 * BU, 0.85 * BU ** 3);
    relax(sim, m);
    e.radius += 1.0 * BU;
    relax(sim, m); // material relaxing past the grid edge is absorbed into the terrain (GDD 03 §1.4) and leaves m.volume too
    expect(moundVolume(sim, m)).toBeGreaterThan(0);
    expect(Math.abs(m.volume - moundVolume(sim, m))).toBeLessThan(1e-3);
  });
});

describe('plans: open-air samples are not targets', () => {
  it('a shaft overshooting the surface has the same target volume as one that just reaches it', () => {
    const sim = nestSim({ systems: SYSTEMS });
    const c = sim.world.size / 2, room = { x: c, y: -10 * BU, z: c };
    sim.kernel.carveEllipsoid(room, { x: 4 * BU, y: 1.25 * BU, z: 4 * BU }, { force: true });
    const nest = playerNest(sim, room);
    const shaft = (length: number): PlanSpec => ({
      nestId: nest.id, kind: 'shaft', anchor: { pos: { x: c + 2 * BU, y: room.y + BU, z: c }, normal: { x: 0, y: -1, z: 0 } },
      length, priority: 'normal', confirmWarnings: true,
    });
    const a = validatePlan(sim, shaft(12)), b = validatePlan(sim, shaft(16));
    expect(a.targetVolume).toBeGreaterThan(0);
    expect(Math.abs(a.targetVolume - b.targetVolume)).toBeLessThan(0.5);
  });
});

describe('bite: refused bites leave the grid alone', () => {
  it('every no-target bite leaves the carve grid unchanged; every carving bite yields its whole volume', () => {
    const sim = nestSim();
    const c = sim.world.size / 2, y = -8 * BU;
    sim.kernel.carveCapsule({ x: c - 8 * BU, y, z: c }, { x: c, y, z: c }, 1.25 * BU, { force: true });
    playerNest(sim, { x: c - 4 * BU, y, z: c });
    const ant = placeWorker(sim, { x: c - 1.5 * BU, y, z: c }, { x: 1, y: 0, z: 0 });
    let refused = 0;
    for (let n = 0; n < 60; n++) {
      const before = sim.carve.openVolume(), version = sim.carve.version;
      const res = digBite(sim, ant, { x: ant.pos.x, y: ant.pos.y - ant.footOffset, z: ant.pos.z }, { x: 1, y: 0, z: 0 }, -10);
      if (res.reason === 'no-target') {
        refused++;
        expect(sim.carve.version).toBe(version);
      } else if (res.pelletId >= 0) {
        const vol = sim.stores.items.get(res.pelletId)!.volume;
        expect(Math.abs((sim.carve.openVolume() - before) / BU ** 3 - vol)).toBeLessThan(0.02);
      }
    }
    expect(refused).toBeGreaterThan(0); // the face runs out within the ramp's reach
  });
});

describe('tamping raises the floor', () => {
  it('a 0.85 BU^3 pellet in a 2 BU tunnel closes 0.85 BU^3 of floor and raises it by well under a body unit', () => {
    const { sim, c, y } = tunnelNest(15);
    const t = sim.field.sphereTrace({ x: c, y, z: c }, { x: 0, y: -1, z: 0 }, 2 * BU, 0);
    const floorY = y - t;
    const nest = sim.state.nests[0];
    const it = spawnPellet(sim, { x: c, y: floorY, z: c }, 0.85, 'loam', nest.id, nest.colony, -1);
    placePellet(sim, it, { x: c, y: floorY, z: c });
    const v = sim.carve.voxel, j0 = Math.round(floorY / v);
    const changedAbove = (): number => {
      let n = 0;
      for (let k = -8; k <= 8; k++) for (let j = 2; j <= 6; j++) for (let i = -8; i <= 8; i++) {
        if (sim.carve.sampleAt(Math.round(c / v) + i, j0 + j, Math.round(c / v) + k) < OPEN_MIN) n++;
      }
      return n;
    };
    const closedHighBefore = changedAbove();
    const before = sim.carve.openVolume();
    tampPellet(sim, it);
    expect((before - sim.carve.openVolume()) / BU ** 3).toBeCloseTo(0.85, 1);
    // nothing 1 BU or more above the old floor was closed (no hemispherical bump)
    expect(changedAbove()).toBe(closedHighBefore);
  });
});

describe('validation order (GDD 03 §7.3)', () => {
  it('unstable is reported after too-large', () => {
    const { sim, nest, c, y } = tunnelNest(20, { material: 'sand', moisture: 0.05 });
    setMoisture(sim, 0.05);
    nest.volumeOpen = 1e9; // over the volume cap
    expect(validatePlan(sim, nursery(nest.id, c, y)).codes).toEqual(['too-large', 'unstable']);
  });
});

describe('chamber detection: dirtying and caches', () => {
  it('a carve far from a nest does not mark it for re-detection', () => {
    const { sim, nest, c, y } = tunnelNest();
    while (takeNestDirty(sim, nest.id)) { /* drain the initial all-dirty state */ }
    sim.kernel.carveSphere({ x: c + 400 * BU, y, z: c }, 2 * BU, { force: true });
    expect(takeNestDirty(sim, nest.id)).toBe(false);
    sim.kernel.carveSphere({ x: c + 5 * BU, y, z: c }, 1.5 * BU, { force: true });
    expect(takeNestDirty(sim, nest.id)).toBe(true);
  });

  it('cached detection after bites equals a fresh detection (a load) exactly', () => {
    const sim = nestSim({ systems: SYSTEMS });
    const nest = createFoundingNest(sim, sim.state.colonies[0].id, { x: sim.world.size / 2 + 40 * BU, y: 0, z: sim.world.size / 2 });
    carveTemplateNest(sim, nest.id, { chambers: [{ type: 'nursery', size: 'm', depthBu: 14 }, { type: 'food', size: 's', depthBu: 22 }] });
    detectNestChambers(sim, nest);
    const ch = nest.chambers.find((x) => x.type === 'nursery')!;
    const ant = placeWorker(sim, { x: ch.center.x, y: ch.center.y - ch.radii.y + 0.5 * BU, z: ch.center.z }, { x: 1, y: 0, z: 0 }, nest.id);
    for (let n = 0; n < 12; n++) digBite(sim, ant, { x: ant.pos.x, y: ant.pos.y - ant.footOffset, z: ant.pos.z }, { x: Math.cos(n), y: 0, z: Math.sin(n) }, 0);
    detectNestChambers(sim, nest);
    const back = createSim(restore(snapshot(sim)).state, sim.world, { systems: SYSTEMS });
    const nb = back.stores.nests.get(nest.id)!;
    detectNestChambers(back, nb);
    detectNestChambers(sim, nest);
    expect(JSON.stringify(nb.chambers)).toBe(JSON.stringify(nest.chambers));
    expect(nb.volumeOpen).toBe(nest.volumeOpen);
    expect(nestRuntime(sim).coreByChunk.size).toBeGreaterThan(0);
  });

  it('one warm detection pass after a bite in a 7-chamber nest (load-tolerant; strict 4 ms with FOUNDRESS_PERF_STRICT=1)', () => {
    const env = (globalThis as unknown as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
    const sim = nestSim({ systems: SYSTEMS });
    const nest = createFoundingNest(sim, sim.state.colonies[0].id, { x: sim.world.size / 2 + 40 * BU, y: 0, z: sim.world.size / 2 });
    carveTemplateNest(sim, nest.id, { chambers: [
      { type: 'nursery', size: 'm', depthBu: 14 }, { type: 'food', size: 's', depthBu: 22 }, { type: 'rest', size: 'm', depthBu: 30 },
      { type: 'general', size: 'l', depthBu: 40 }, { type: 'rest', size: 'l', depthBu: 52 }, { type: 'nursery', size: 'm', depthBu: 62 }] });
    detectNestChambers(sim, nest);
    const ch = nest.chambers.find((x) => x.type === 'general')!;
    const ant = placeWorker(sim, { x: ch.center.x, y: ch.center.y - ch.radii.y + 0.5 * BU, z: ch.center.z }, { x: 1, y: 0, z: 0 }, nest.id);
    // the game runs detection all the time: measure the JIT-warm steady state (the first passes are 5-10x slower)
    let best = Infinity;
    for (let r = 0; r < 20; r++) {
      digBite(sim, ant, { x: ant.pos.x, y: ant.pos.y - ant.footOffset, z: ant.pos.z }, { x: Math.cos(r), y: 0, z: Math.sin(r) }, 0);
      const t0 = performance.now();
      detectNestChambers(sim, nest);
      if (r >= 15) best = Math.min(best, performance.now() - t0);
    }
    expect(nest.chambers.length).toBe(7);
    expect(best).toBeLessThan(env.FOUNDRESS_PERF_STRICT === '1' ? 4 : 100);
  }, 60_000);
});

describe('stimuli and no-haulers (GDD 03 §7.7, §7.8)', () => {
  function withPlan(): { sim: Sim; planId: number; nestId: number; colony: number } {
    const { sim, nest, c, y } = tunnelNest();
    const planId = createPlan(sim, nursery(nest.id, c, y), 'player');
    return { sim, planId, nestId: nest.id, colony: nest.colony };
  }

  it('dig stimulus = free slots x priority weight; haul stimulus = spoil pellets + 0.5 x clutter', () => {
    const { sim, planId, nestId, colony } = withPlan();
    const plan = planById(sim, planId)!.plan;
    expect(plan.slots.length).toBeGreaterThan(0);
    expect(digStimulus(sim, colony)).toBe(plan.slots.length * 2);
    const spoil = spawnPellet(sim, plan.spoilPoint, 0.8, 'loam', nestId, colony, -1);
    placePellet(sim, spoil, plan.spoilPoint);
    const c = sim.world.size / 2, far = { x: c - 8 * BU, y: -20 * BU - 0.9 * BU, z: c };
    const clutter = spawnPellet(sim, far, 0.8, 'loam', nestId, colony, -1);
    placePellet(sim, clutter, far);
    expect(clutter.inNest).toBe(true);
    expect(haulStimulus(sim, colony)).toBeCloseTo(1.5, 9);
  });

  it('planNoHaulers once the spoil pile has been full for NO_HAULERS_S', () => {
    const { sim, planId, nestId, colony } = withPlan();
    const plan = planById(sim, planId)!.plan;
    for (let n = 0; n < SPOIL_PILE_MAX; n++) placePellet(sim, spawnPellet(sim, plan.spoilPoint, 0.8, 'loam', nestId, colony, -1), plan.spoilPoint);
    expect(planNoHaulers(sim, planId)).toBe(false);
    runTicks(sim, NO_HAULERS_S * 10 + 1);
    expect(planNoHaulers(sim, planId)).toBe(true);
    expect(planNoHaulers(sim, -5)).toBe(false);
  });
});
