// F-int review (adversarial): mound overlays through the services, the dig table, contract shapes.
import { describe, expect, it } from 'vitest';
import type { Ant, Mound, Sim, WalkerKin } from '@/sim/types';
import { MATERIAL_IDS, SPECIES_IDS } from '@/sim/types';
import { DIG_SPECIES_MULT, digFactor } from '@/sim/balance';
import { createKernel } from '@/sim/kernel';
import { restore, snapshot, stateHash } from '@/sim/save';
import { createSim } from '@/sim/sim';
import { makeTestSim } from '@/sim/testing';
import { moundOverlay } from './services';

const v = (x: number, y: number, z: number) => ({ x, y, z });

/** Flat-topped square mound record: `heightBu` on the inner points, zero border. */
function plateau(id: number, x: number, z: number, bu: number, heightBu: number, n = 9): Mound {
  const cell = bu, h = new Float32Array(n * n);
  for (let iz = 1; iz < n - 1; iz++) for (let ix = 1; ix < n - 1; ix++) h[iz * n + ix] = heightBu * bu;
  return {
    id, nestId: -1, entranceId: -1, centerX: x, centerZ: z, cell, n, base: new Float32Array(n * n), h,
    material: 'loam', volume: 0, absorbed: 0, lastBatchTick: 0,
  };
}

function bare(sim: Sim) {
  return createKernel(sim.world, { voxel: sim.world.bu / 2, keys: [], chunks: [], breaches: [] }).field;
}

describe('F-int verify: mound overlays via state', () => {
  it('overlapping mounds add up; the sum is order-independent after a save round trip', () => {
    const base = makeTestSim({ systems: [] });
    const bu = base.world.bu, q = base.world.queenStart.pos, x = q.x + 25 * bu, z = q.z;
    base.state.worldDelta.mounds.push(plateau(base.state.nextId++, x, z, bu, 1), plateau(base.state.nextId++, x + 2 * bu, z, bu, 0.5));
    const sim = createSim(base.state, base.world, { systems: [] });
    const g = bare(sim).height(x + bu, z + 0.3 * bu);
    expect(sim.field.height(x + bu, z + 0.3 * bu) - g).toBeCloseTo(1.5 * bu, 4);
    const back = createSim(restore(snapshot(sim)).state, sim.world, { systems: [] });
    expect(back.field.height(x + bu, z + 0.3 * bu)).toBe(sim.field.height(x + bu, z + 0.3 * bu));
  });

  it('after a restore the overlay still reads the (restored) mound array live', () => {
    const base = makeTestSim({ systems: [] });
    const bu = base.world.bu, q = base.world.queenStart.pos, x = q.x + 25 * bu, z = q.z;
    base.state.worldDelta.mounds.push(plateau(base.state.nextId++, x, z, bu, 1));
    const back = createSim(restore(snapshot(base)).state, base.world, { systems: [] });
    const m = back.state.worldDelta.mounds[0];
    m.h[(m.n >> 1) * m.n + (m.n >> 1)] = 3 * bu;
    expect(back.field.height(m.centerX, m.centerZ) - bare(back).height(m.centerX, m.centerZ)).toBeCloseTo(3 * bu, 4);
  });

  it('sphereTrace from above lands on the pile top, and a shaft dug through the pile is a hole (breach probe)', () => {
    const base = makeTestSim({ systems: [] });
    const bu = base.world.bu, q = base.world.queenStart.pos, x = q.x + 25 * bu, z = q.z;
    base.state.worldDelta.mounds.push(plateau(base.state.nextId++, x, z, bu, 2));
    const sim = createSim(base.state, base.world, { systems: [] });
    const top = sim.field.height(x, z);
    const t = sim.field.sphereTrace(v(x, top + 10 * bu, z), v(0, -1, 0), 40 * bu, 0);
    expect(t).toBeGreaterThan(10 * bu - 0.1 * bu);
    expect(t).toBeLessThan(10 * bu + 0.05 * bu);
    expect(sim.field.isHoleAt(x, z)).toBe(false);
    const r = sim.kernel.carveCapsule(v(x, top + bu, z), v(x, top - 6 * bu, z), bu);
    expect(r.volume).toBeGreaterThan(0); // the pile (soil) and the loam below are diggable
    expect(sim.field.isHoleAt(x, z)).toBe(true);
    expect(sim.field.materialAt(v(x, top - 0.5 * bu, z))).toBe('loam');
  });

  it('a mound whose material is not a MaterialId keeps the ground material; a mound is diggable by the played species', () => {
    const base = makeTestSim({ systems: [] });
    const bu = base.world.bu, q = base.world.queenStart.pos, x = q.x + 25 * bu, z = q.z;
    const m = plateau(base.state.nextId++, x, z, bu, 2);
    m.material = 'not-a-material';
    expect(moundOverlay(m).material).toBeNull();
    base.state.worldDelta.mounds.push(m);
    const sim = createSim(base.state, base.world, { systems: [] });
    const inPile = v(x, bare(sim).height(x, z) + bu, z);
    expect(sim.field.sample(inPile)).toBeLessThan(0);
    expect(sim.field.diggability(inPile, 'lasius-niger')).toBeGreaterThan(0);
    expect(sim.kernel.canDigAt(inPile.x, inPile.y, inPile.z)).toBe(true);
  });

  it('a long run on a sim with a mound stays deterministic across save/load (stateHash)', () => {
    const base = makeTestSim({ nest: 'small', workers: 4, systems: [] });
    const bu = base.world.bu, e = base.state.nests[0].entrances[0].pos;
    base.state.worldDelta.mounds.push(plateau(base.state.nextId++, e.x + 6 * bu, e.z, bu, 1));
    const a = createSim(restore(snapshot(base)).state, base.world);
    const b = createSim(restore(snapshot(base)).state, base.world);
    for (let i = 0; i < 50; i++) { a.tick(); b.tick(); }
    expect(stateHash(a.state)).toBe(stateHash(b.state));
  });
});

describe('F-int verify: dig table and contracts', () => {
  it('digFactor is finite and >= 0 for every species x material, and only known materials are listed', () => {
    for (const s of SPECIES_IDS) for (const m of MATERIAL_IDS) {
      const f = digFactor(s, m);
      expect(Number.isFinite(f) && f >= 0, `${s}/${m}`).toBe(true);
    }
    for (const s of SPECIES_IDS) for (const m of Object.keys(DIG_SPECIES_MULT[s])) expect(MATERIAL_IDS).toContain(m);
    // GDD 03 §2.1: hard materials are never diggable, wood-sound is Camponotus only
    for (const s of SPECIES_IDS) for (const m of ['concrete', 'asphalt', 'stone', 'brick', 'tile', 'glass', 'metal', 'plastic'] as const) expect(digFactor(s, m)).toBe(0);
    expect(SPECIES_IDS.filter((s) => digFactor(s, 'wood-sound') > 0)).toEqual(['camponotus-pennsylvanicus']);
  });

  it('diggability never returns NaN, even for a non-finite or out-of-world position', () => {
    const sim = makeTestSim({ systems: [] });
    // Infinity included since the Stage 1A gate guarded PrimHash.query against non-finite bounds (it looped forever).
    for (const p of [v(NaN, 0, 0), v(-1e6, -5, -1e6), v(1e9, -5, 1e9), v(10, Infinity, 10), v(-Infinity, 0, 10)]) {
      const d = sim.field.diggability(p, 'lasius-niger');
      expect(Number.isNaN(d), JSON.stringify(p)).toBe(false);
    }
  });

  it('an Ant is assignable to the kernel WalkerKin (contract Walker structurally compatible)', () => {
    const sim = makeTestSim({ systems: [] });
    const ant: Ant = sim.state.ants[0];
    const k: WalkerKin = ant; // compile-time check (npm run typecheck)
    expect(k.footOffset).toBeGreaterThan(0);
  });
});
