// Mounds as craters and cones (nest-fixes defects 3, 4; acceptance 3, 4; GDD 03 §1.4, App. E check 5): spoil
// settling around an entrance never raises the ground inside its kept-clear radius, the throat stays open and
// walkable, the volume is the dumped volume x BULKING, and relaxation is isotropic at the angle of repose.
import { describe, expect, it } from 'vitest';
import type { Mound, Sim } from '@/sim/types';
import { BULKING, MOUND_CLEAR_PAD_BU } from '@/sim/balance/nest';
import { navTo, navToTarget } from '@/sim/locomotion';
import { heightAt } from '@/sim/world/terrainSample';
import { throatPassage } from './entrances';
import { colonyNests, freeDig } from './freeDigKit';
import { dumpPoint, moundVolume } from './index';
import { createMound, deposit, moundById, moundCellAt, publishMound, relax } from './mounds';
import { nestSim, placeWorker, playerNest, runTicks } from './nestTestKit';
import { placePellet, spawnPellet } from './pellets';
import { reposeDeg } from './substrate';

const PELLET = 0.85;

/** Pile height of the field at (x, z) above the bare terrain, mm. */
const pileAt = (sim: Sim, x: number, z: number): number => sim.field.height(x, z) - heightAt(sim.world.terrain, x, z);

/** Relaxes until nothing moves (or `max` batches). */
function settle(sim: Sim, m: Mound, max = 200): void {
  for (let n = 0; n < max && relax(sim, m); n++) { /* keep relaxing */ }
  publishMound(sim, m);
}

/** (max - min) / mean of the pile height on a circle of radius r around (cx, cz). */
function ringSpread(sim: Sim, cx: number, cz: number, r: number): { spread: number; mean: number } {
  const hs: number[] = [];
  for (let a = 0; a < 64; a++) hs.push(pileAt(sim, cx + Math.cos((a / 64) * 2 * Math.PI) * r, cz + Math.sin((a / 64) * 2 * Math.PI) * r));
  const mean = hs.reduce((s, h) => s + h, 0) / hs.length;
  return { spread: (Math.max(...hs) - Math.min(...hs)) / mean, mean };
}

/** Steepest slope of the field's pile surface along radial lines from (cx, cz), degrees (finite differences). */
function steepestDeg(sim: Sim, cx: number, cz: number, r0: number, r1: number): number {
  const step = 0.5 * sim.world.bu;
  let worst = 0;
  for (let a = 0; a < 48; a++) {
    const dx = Math.cos((a / 48) * 2 * Math.PI), dz = Math.sin((a / 48) * 2 * Math.PI);
    for (let r = r0; r + step <= r1; r += step / 2) {
      const h0 = sim.field.height(cx + dx * r, cz + dz * r), h1 = sim.field.height(cx + dx * (r + step), cz + dz * (r + step));
      if (pileAt(sim, cx + dx * r, cz + dz * r) <= 0 && pileAt(sim, cx + dx * (r + step), cz + dz * (r + step)) <= 0) continue;
      worst = Math.max(worst, (Math.atan(Math.abs(h1 - h0) / step) * 180) / Math.PI);
    }
  }
  return worst;
}

describe('defect 3 / acceptance 3: 200 pellets dumped around a freely dug entrance', () => {
  it('the throat stays open and walkable, the crater keeps its kept-clear radius, volume = dumped x BULKING', () => {
    const { sim, queen } = freeDig(11);
    const bu = sim.world.bu;
    const nest = colonyNests(sim, queen.colony)[0];
    const e = nest.entrances[0];
    expect(e).toBeDefined();
    const m0 = e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
    const before = m0 ? moundVolume(sim, m0) : 0;
    // 200 pellets: most at the hauler dump ring, every tenth straight onto the opening (a careless dump)
    const p = { x: 0, y: 0, z: 0 };
    for (let n = 0; n < 200; n++) {
      if (n % 10 === 0) { p.x = e.pos.x; p.y = e.pos.y; p.z = e.pos.z; } else dumpPoint(sim, e, p);
      const it = spawnPellet(sim, p, PELLET, 'loam', nest.id, nest.colony, -1);
      placePellet(sim, it, { ...p });
    }
    runTicks(sim, 3000 + 2 * 250 + 10); // PELLET_SETTLE_S, then the batches
    expect(sim.state.items.filter((it) => it.alive && it.kind === 'soil-pellet' && !it.inNest && it.carrierIds.length === 0 && it.nestId === nest.id).length).toBe(0);
    const m = moundById(sim, e.moundId)!;
    settle(sim, m);
    // the hole test at the entrance centre, an open throat with walking clearance
    expect(sim.field.isHoleAt(e.pos.x, e.pos.z)).toBe(true);
    expect(e.status).toBe('open');
    expect(throatPassage(sim, e, true)).toBe(true);
    // settling never raised the ground inside the kept-clear radius
    const keep = e.radius + MOUND_CLEAR_PAD_BU * bu;
    for (let a = 0; a < 32; a++) for (const f of [0, 0.5, 1]) {
      const x = e.pos.x + Math.cos((a / 32) * 2 * Math.PI) * keep * f, z = e.pos.z + Math.sin((a / 32) * 2 * Math.PI) * keep * f;
      expect(pileAt(sim, x, z)).toBe(0);
    }
    // volume: 200 x 0.85 x 1.25 BU^3 within 10 %
    const added = moundVolume(sim, m) - before;
    expect(Math.abs(added - 200 * PELLET * BULKING) / (200 * PELLET * BULKING)).toBeLessThan(0.1);
    expect(Math.abs(m.volume - moundVolume(sim, m))).toBeLessThan(1e-3);
    // a crater: the rim stands above the throat
    expect(ringSpread(sim, e.pos.x, e.pos.z, e.radius + 2 * bu).mean).toBeGreaterThan(0.5 * bu);
    // a walker walks in (to the cell) and out (to the surface) across the mound
    const cell = nest.chambers[0];
    const w = placeWorker(sim, { x: e.pos.x - 12 * bu, y: 4 * bu, z: e.pos.z }, { x: 1, y: 0, z: 0 });
    expect(navToTarget(sim, w, { kind: 'chamber', id: cell.id, pos: { ...cell.center } }, 1.5 * bu)).toBe(true);
    let t = 0;
    for (; t < 3000 && w.nav.status === 'moving'; t++) sim.tick();
    expect(w.nav.status).toBe('arrived');
    expect(w.medium).toBe('cavity');
    const out = { x: e.pos.x + 12 * bu, y: 0, z: e.pos.z + 3 * bu };
    out.y = sim.field.height(out.x, out.z);
    expect(navTo(sim, w, out, 1.5 * bu)).toBe(true);
    for (t = 0; t < 3000 && w.nav.status === 'moving'; t++) sim.tick();
    expect(w.nav.status).toBe('arrived');
    expect(w.medium).toBe('surface');
  }, 240_000);
});

describe('defect 3: a spoil heap never covers an open hole', () => {
  it('pellets settling on a heap centred on a pit (no entrance record yet) leave the hole open', () => {
    const sim = nestSim();
    const nest = playerNest(sim);
    const c = sim.world.size / 2, bu = sim.world.bu;
    // a pit from the surface that no entrance record knows about (the Stage 1A app run: the queen's first bites)
    sim.kernel.carveCapsule({ x: c, y: 0.5 * bu, z: c }, { x: c + 2 * bu, y: -3 * bu, z: c }, bu, { force: true });
    expect(sim.field.isHoleAt(c + 0.5 * bu, c)).toBe(true);
    const holes = (): string[] => {
      const out: string[] = [];
      for (let x = c - 3 * bu; x <= c + 3 * bu; x += 0.5 * bu) for (let z = c - 3 * bu; z <= c + 3 * bu; z += 0.5 * bu) if (sim.field.isHoleAt(x, z)) out.push(`${x},${z}`);
      return out;
    };
    const before = holes();
    expect(before.length).toBeGreaterThan(4);
    const m = createMound(sim, nest, null, c, c, 'loam');
    for (let n = 0; n < 120; n++) deposit(sim, m, c + ((n % 5) - 2) * 0.3 * bu, c + ((n % 3) - 1) * 0.3 * bu, PELLET * BULKING * bu ** 3);
    settle(sim, m);
    expect(moundVolume(sim, m)).toBeGreaterThan(0.95 * 120 * PELLET * BULKING);
    const after = new Set(holes());
    expect(before.filter((k) => !after.has(k))).toEqual([]); // every column that was open still is
  });
});

describe('defect 4 / acceptance 4: isotropic relaxation', () => {
  it('a heap from one dump point is a round cone at the angle of repose (no square or diamond)', () => {
    const sim = nestSim();
    const nest = playerNest(sim);
    const c = sim.world.size / 2, bu = sim.world.bu;
    const m0 = createMound(sim, nest, null, c, c, 'loam');
    // the grid point the deposits land on (an even grid has no point at its centre)
    const at = moundCellAt(m0, c, c), half = ((m0.n - 1) * m0.cell) / 2;
    const px = c - half + (at % m0.n) * m0.cell, pz = c - half + Math.floor(at / m0.n) * m0.cell;
    const m = m0;
    for (let n = 0; n < 300; n++) deposit(sim, m, px, pz, PELLET * BULKING * bu ** 3);
    const vol = moundVolume(sim, m);
    settle(sim, m);
    expect(moundVolume(sim, m)).toBeCloseTo(vol, 3); // conserved (no grid-edge loss)
    for (const r of [1.5, 3, 4.5]) expect(ringSpread(sim, px, pz, r * bu).spread).toBeLessThan(0.15);
    expect(steepestDeg(sim, px, pz, 0.5 * bu, 7 * bu)).toBeLessThan(reposeDeg('loam') + 3);
  });

  it('an entrance mound is a round crater: rings symmetric, the pit clear, slopes at the angle of repose', () => {
    const sim = nestSim();
    const nest = playerNest(sim);
    const c = sim.world.size / 2, bu = sim.world.bu;
    const e = {
      id: sim.state.nextId++, kind: 'dug' as const, status: 'open' as const, pos: { x: c, y: 0, z: c }, dir: { x: 0, y: 1, z: 0 },
      radius: 1.2 * bu, moundId: -1, rimTarget: 0, plugVoxelCount: 0, createdTick: 0, trafficIn: 0, trafficOut: 0,
    };
    nest.entrances.push(e);
    const m = createMound(sim, nest, e, c, c, 'loam');
    // a mature mound (~1,600 BU^3) from the haulers' dump ring (r_ent + 1.5 .. 5 BU) at evenly spread angles and
    // radii (golden angle, plastic-number radii): the slopes are then set by the relaxation alone, not by the
    // random scatter of a few hundred dump angles
    for (let n = 0; n < 1500; n++) {
      const a = n * 2.39996323, r = e.radius + (1.5 + 3.5 * ((n * 0.7548776662) % 1)) * bu;
      deposit(sim, m, c + Math.cos(a) * r, c + Math.sin(a) * r, PELLET * BULKING * bu ** 3);
    }
    settle(sim, m);
    const keep = e.radius + MOUND_CLEAR_PAD_BU * bu;
    expect(pileAt(sim, c, c)).toBe(0);
    expect(pileAt(sim, c + keep * 0.99, c)).toBe(0);
    for (const r of [3, 4.5, 6, 9]) expect(ringSpread(sim, c, c, r * bu).spread).toBeLessThan(0.15);
    expect(steepestDeg(sim, c, c, keep, 12 * bu)).toBeLessThan(reposeDeg('loam') + 3);
  });
});
