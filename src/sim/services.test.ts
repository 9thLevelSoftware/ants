// Runtime services on the real kernel (F-int): contract adapters, dig table, nest fields after load, mound
// height overlays (acceptance 5), new-game placement and pre-carves.
import { describe, expect, it } from 'vitest';
import type { Mound, PreCarveOp, Sim, SimState, WorldData } from '@/sim/types';
import { materialCode, nestFieldId, PrimFlag } from '@/sim/types';
import { digFactor } from '@/sim/balance';
import { createKernel } from '@/sim/kernel';
import { createWalkerKin, walkerPlace, walkerSnapshot, walkerStep } from '@/sim/locomotion/walker';
import { restore, snapshot } from '@/sim/save';
import { createNewGame, defaultGameConfig } from '@/sim/createGame';
import { createSim } from '@/sim/sim';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { moundOverlay } from './services';

const v = (x: number, y: number, z: number) => ({ x, y, z });

/** A cone-shaped mound record of peak `peakBu` and radius `radiusBu` centred at (x, z). */
function coneMound(id: number, x: number, z: number, bu: number, peakBu: number, radiusBu: number): Mound {
  const cell = 0.5 * bu, n = Math.ceil((2 * radiusBu * bu) / cell) + 3;
  const h = new Float32Array(n * n), half = ((n - 1) * cell) / 2;
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const r = Math.hypot(ix * cell - half, iz * cell - half) / bu;
    h[iz * n + ix] = Math.max(0, peakBu * (1 - r / radiusBu)) * bu;
  }
  return {
    id, nestId: -1, entranceId: -1, centerX: x, centerZ: z, cell, n, base: new Float32Array(n * n), h,
    material: 'sand', volume: 0, absorbed: 0, lastBatchTick: 0,
  };
}

function withMound(peakBu: number): { sim: Sim; m: Mound } {
  const base = makeTestSim({ terrain: 'noise', seed: 4 });
  const q = base.world.queenStart.pos, bu = base.world.bu;
  const m = coneMound(base.state.nextId++, q.x + 20 * bu, q.z, bu, peakBu, 6);
  base.state.worldDelta.mounds.push(m);
  return { sim: createSim(base.state, base.world, { systems: [] }), m };
}

describe('contract adapters over the kernel', () => {
  it('sim.field and sim.carve are the kernel objects; sim.nestNav forwards to the kernel nav', () => {
    const sim = makeTestSim({ nest: 'small' });
    expect(sim.field).toBe(sim.kernel.field);
    expect(sim.carve).toBe(sim.kernel.carve);
    expect(sim.nestNav.targets()).toEqual(sim.kernel.nav.targets());
    expect(sim.nestNav.stats()).toEqual(sim.kernel.nav.stats());
  });

  it('diggability follows the GDD 03 §2.1 table per species', () => {
    const sim = makeTestSim();
    const below = v(100, -8, 100); // loam ground
    expect(sim.field.diggability(below, 'lasius-niger')).toBe(1);
    expect(sim.field.diggability(below, 'camponotus-pennsylvanicus')).toBeCloseTo(0.6);
    expect(digFactor('lasius-niger', 'humus')).toBeCloseTo(1.3);
    expect(digFactor('lasius-niger', 'wood-sound')).toBe(0);
    expect(digFactor('camponotus-pennsylvanicus', 'gravel')).toBe(0);
    expect(digFactor('lasius-niger', 'asphalt')).toBe(0);
  });

  it('the species dig rule reaches the kernel: Lasius cannot carve a wood-sound primitive, force can', () => {
    const sim = makeTestSim({ features: ['table'] });
    const leg = sim.world.prims.find((p) => p.shape === 'cylinder')!;
    expect(sim.kernel.canDigAt(leg.pos.x, leg.pos.y, leg.pos.z)).toBe(false);
    expect(sim.kernel.canDigAt(leg.pos.x + 20, -6, leg.pos.z)).toBe(true); // loam
  });

  it('nest-level helpers: -1 / false for unknown nests, fields come back after a save round trip', () => {
    const sim = makeTestSim({ nest: 'small' });
    const nest = sim.state.nests[0], exit = { kind: 'exit' as const, id: -1 };
    const c = nest.chambers[0].center;
    expect(sim.nestNav.distance(999, exit, c)).toBe(-1);
    expect(sim.nestNav.descend(999, exit, c, v(0, 0, 0))).toBe(false);
    const d = sim.nestNav.distance(nest.id, exit, c);
    expect(d).toBeGreaterThan(0);
    const dir = v(0, 0, 0);
    expect(sim.nestNav.descend(nest.id, exit, c, dir)).toBe(true);
    expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1, 5);
    const back = createSim(restore(snapshot(sim)).state, sim.world, { systems: [] });
    expect(back.kernel.nav.hasTarget(nestFieldId(nest.id, exit))).toBe(true);
    expect(back.nestNav.distance(nest.id, exit, c)).toBeCloseTo(d, 6);
  });

  it('dynamic primitives in the state are part of the field after createSim', () => {
    const sim = makeTestSim({ systems: [] });
    const bu = sim.world.bu, q = sim.world.queenStart.pos;
    const box = { x: q.x + 20 * bu, y: 2 * bu, z: q.z };
    sim.state.worldDelta.dynPrims.push({
      id: sim.state.nextId++, shape: 'box', pos: box, rot: { x: 0, y: 0, z: 0, w: 1 }, size: v(3 * bu, 2 * bu, 3 * bu),
      round: 0, material: 'plastic', flags: PrimFlag.DYNAMIC, objectId: -1,
    });
    expect(sim.field.sample(box)).toBeGreaterThan(0); // not registered in this sim's kernel
    const again = createSim(sim.state, sim.world, { systems: [] });
    expect(again.field.sample(box)).toBeLessThan(0);
    expect(again.field.materialAt(box)).toBe('plastic');
  });

  it('sphereTrace does not step through a steep slope (moved from the deleted placeholder field)', () => {
    const world = makeTestWorld({ terrain: 'flat' });
    const hf = world.terrain;
    for (let iz = 0; iz < hf.nz; iz++) for (let ix = 0; ix < hf.nx; ix++) hf.data[iz * hf.nx + ix] = 3 * ix * hf.cell;
    const k = createKernel(world, { voxel: world.bu / 2, keys: [], chunks: [], breaches: [] });
    const o = v(100, k.field.height(100, 100) + 10, 100);
    const t = k.field.sphereTrace(o, v(1, 0, 0), 50, 0);
    expect(t).toBeGreaterThan(10 / 3 - 0.2);
    expect(t).toBeLessThan(10 / 3 + 0.05);
  });
});

describe('mound height overlays (F-int acceptance 5)', () => {
  it('a registered mound raises field.height and the terrain term, with the analytic gradient', () => {
    const { sim, m } = withMound(3);
    const bu = sim.world.bu, f = sim.field;
    const flat = bareField(sim);
    expect(f.height(m.centerX, m.centerZ) - flat.height(m.centerX, m.centerZ)).toBeCloseTo(3 * bu, 3);
    expect(f.height(m.centerX + 10 * bu, m.centerZ)).toBeCloseTo(flat.height(m.centerX + 10 * bu, m.centerZ), 6);
    // on the flank: f is ~0 on the pile surface, the gradient matches central differences
    const p = v(m.centerX + 3.13 * bu, 0, m.centerZ + 1.27 * bu); // inside a cell (bilinear kinks on grid lines)
    p.y = f.height(p.x, p.z);
    expect(Math.abs(f.sample(p))).toBeLessThan(1e-3);
    const g = v(0, 0, 0), e = 1e-3;
    f.gradient(p, g);
    const num = (dx: number, dy: number, dz: number) =>
      (f.sample(v(p.x + dx, p.y + dy, p.z + dz)) - f.sample(v(p.x - dx, p.y - dy, p.z - dz))) / (2 * e);
    expect(g.x).toBeCloseTo(num(e, 0, 0), 3);
    expect(g.y).toBeCloseTo(num(0, e, 0), 3);
    expect(g.z).toBeCloseTo(num(0, 0, e), 3);
    expect(g.x).toBeGreaterThan(0.2); // slopes away from the peak
    expect(f.materialAt(v(m.centerX, flat.height(m.centerX, m.centerZ) + bu, m.centerZ))).toBe('sand');
  });

  it('a walker walks over the mound and stays on the level set', () => {
    const { sim, m } = withMound(2.5);
    const bu = sim.world.bu, f = sim.field;
    const bare = bareField(sim);
    const w = createWalkerKin(0.1 * bu);
    expect(walkerPlace(f, w, v(m.centerX - 12 * bu, 10 * bu, m.centerZ), { heading: v(1, 0, 0) }, sim.kernel.walker)).toBe(true);
    let maxRise = 0, maxErr = 0;
    for (let t = 0; t < 400 && w.pos.x < m.centerX + 12 * bu; t++) {
      walkerSnapshot(w);
      expect(walkerStep(f, w, v(1, 0, 0), 6 * bu, 0.1, sim.kernel.walker)).toMatch(/^(ok|blocked)$/);
      maxErr = Math.max(maxErr, Math.abs(f.sample(w.pos) - w.footOffset));
      maxRise = Math.max(maxRise, w.pos.y - bare.height(w.pos.x, w.pos.z));
    }
    expect(w.pos.x).toBeGreaterThan(m.centerX + 12 * bu); // crossed it
    expect(w.medium).toBe('surface');
    expect(maxErr).toBeLessThan(0.02 * bu);
    // it went over the top of the pile, about 2.5 BU above the bare terrain
    expect(maxRise).toBeGreaterThan(2.2 * bu);
    expect(maxRise).toBeLessThan(2.5 * bu + 0.2 * bu);
  });

  it('kernel.setHeightOverlay at run time marks carve meshes over it dirty; remove restores the terrain', () => {
    const sim = makeTestSim({ systems: [] });
    const bu = sim.world.bu, q = sim.world.queenStart.pos;
    const x = q.x + 30 * bu, z = q.z;
    sim.kernel.carveSphere(v(x, -2 * bu, z), 2 * bu);
    sim.kernel.carve.takeDirty();
    const h0 = sim.field.height(x, z);
    const m = coneMound(77777, x, z, bu, 2, 5);
    sim.kernel.setHeightOverlay(moundOverlay(m));
    expect(sim.kernel.carve.dirtyCount()).toBeGreaterThan(0);
    expect(sim.field.height(x, z)).toBeCloseTo(h0 + 2 * bu, 3);
    expect(sim.kernel.removeHeightOverlay(m.id)).toBe(true);
    expect(sim.field.height(x, z)).toBeCloseTo(h0, 6);
    expect(sim.kernel.removeHeightOverlay(m.id)).toBe(false);
  });
});

/** The world's field without overlays or carving. */
function bareField(sim: Sim) {
  return createKernel(sim.world, { voxel: sim.world.bu / 2, keys: [], chunks: [], breaches: [] }).field;
}

describe('createNewGame on the kernel', () => {
  it('places the founding queen on the level set at the queen start', () => {
    const sim = makeTestSim({ terrain: 'noise', seed: 9 });
    const q = sim.state.ants[0], s = sim.world.queenStart.pos;
    expect(Math.abs(sim.field.sample(q.pos) - q.footOffset)).toBeLessThan(0.01 * sim.world.bu);
    expect(Math.hypot(q.pos.x - s.x, q.pos.z - s.z)).toBeLessThan(0.5 * sim.world.bu);
    expect(q.medium).toBe('surface');
    expect(q.prevPos).toEqual(q.pos);
  });

  it('applies the world pre-carves through the carve grid (force: through a hard crust)', () => {
    const world: WorldData = makeTestWorld({ seed: 3 });
    const bu = world.bu, c = world.size / 2 + 30 * bu;
    world.ground.crustMm.data.fill(bu); // a 1 BU crust everywhere ...
    world.ground.surface.data.fill(materialCode('asphalt')); // ... of asphalt
    const ops: PreCarveOp[] = [
      { shape: 'capsule', a: v(c, 1 * bu, c), b: v(c, -6 * bu, c), r: 1 * bu, natural: true, cavityId: -1 },
      { shape: 'ellipsoid', a: v(c, -8 * bu, c), b: v(4 * bu, 2 * bu, 4 * bu), r: 0, natural: true, cavityId: -1 },
    ];
    world.preCarve.push(...ops);
    const { state } = createNewGame({ ...defaultGameConfig('lasius-niger', 3), world: world.params }, world);
    expect(state.worldDelta.carve.keys.length).toBeGreaterThan(0);
    const sim = createSim(state as SimState, world, { systems: [] });
    expect(sim.field.sample(v(c, -8 * bu, c))).toBeGreaterThan(0); // the chamber is open
    expect(sim.field.isHoleAt(c, c)).toBe(true); // the crack opened the crust
    expect(state.worldDelta.carve.breaches.length).toBeGreaterThan(0);
  });
});
