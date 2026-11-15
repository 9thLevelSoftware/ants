// Independent review of nest-fixes (adversarial checks). Each test names the acceptance item or GDD 03 App. E
// check it probes. Failing tests here demonstrate defects for the fixer; passing ones stay as regression tests.
import { beforeAll, describe, expect, it } from 'vitest';
import type { Ant, Mound, Sim } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { BULKING } from '@/sim/balance/nest';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { passiveBehaviours } from '@/sim/testing/e2e/colonyScenario';
import { navTo } from '@/sim/locomotion';
import { heightAt } from '@/sim/world/terrainSample';
import { carveCapsule as carveCapsuleOp, carveEllipsoid as carveEllipsoidOp, carveSphere } from './carveOps';
import { foundingReadiness } from './chambers/foundingCell';
import { colonyNests, freeDig, runFreeDig, settleSurfacePellets } from './freeDigKit';
import { dumpPoint, moundVolume } from './index';
import { createMound, deposit, moundById, moundContains, publishMound, relax } from './mounds';
import { moundOrigin, pileOverOpenings } from './moundRelax';
import { placePellet, spawnPellet } from './pellets';
import { nestSim, playerNest, runTicks } from './nestTestKit';
import { reposeDeg } from './substrate';

const PELLET = 0.85;

/** (max - min) / mean of the pile height of the grid sampled on a circle (field overlay). */
function ringSpread(sim: Sim, cx: number, cz: number, r: number): number {
  const hs: number[] = [];
  for (let a = 0; a < 64; a++) {
    const x = cx + Math.cos((a / 64) * 2 * Math.PI) * r, z = cz + Math.sin((a / 64) * 2 * Math.PI) * r;
    hs.push(sim.field.height(x, z) - heightAt(sim.world.terrain, x, z));
  }
  const mean = hs.reduce((s, h) => s + h, 0) / hs.length;
  return (Math.max(...hs) - Math.min(...hs)) / mean;
}

/** Largest top-height difference between 4-adjacent usable grid cells (GDD 03 App. E check 5), mm. */
function worstAdjacent(sim: Sim, m: Mound): number {
  const n = m.n;
  let worst = 0;
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const i = iz * n + ix;
    if (Number.isNaN(m.base[i])) continue;
    for (const j of [ix + 1 < n ? i + 1 : -1, iz + 1 < n ? i + n : -1]) {
      if (j < 0 || Number.isNaN(m.base[j])) continue;
      if (m.h[i] <= 0 && m.h[j] <= 0) continue;
      worst = Math.max(worst, Math.abs(m.base[i] + m.h[i] - m.base[j] - m.h[j]));
    }
  }
  return worst;
}

describe('verify: GDD 03 App. E check 9 with the founding state `digging` (automatic expulsion)', () => {
  it('a free founding dig in `digging` expels onto one mound linked to the entrance; volume 1.25 x removed; opening clear', () => {
    const sim = makeTestSim({ seed: 3, behaviours: passiveBehaviours() });
    const bu = sim.world.bu;
    const col = sim.state.colonies[0];
    const queen = sim.stores.ants.get(col.queenId)!;
    expect((queen.flags & AntFlag.FOUNDING) !== 0).toBe(true);
    const nest0 = sim.stores.nests.get(col.nestIds[0])!;
    nest0.founding!.state = 'digging'; // the founding module's transition on the first bite (GDD 03 §13.2)
    navTo(sim, queen, { x: queen.pos.x + 20 * bu, y: queen.pos.y, z: queen.pos.z }, 1.5 * bu);
    for (let t = 0; t < 3000 && queen.nav.status === 'moving'; t++) sim.tick();
    let expelled = 0;
    const off = sim.events.on('pellet-expelled', (e) => { expelled += e.volume; });
    runFreeDig(sim, queen, { dir: { x: 1, z: 0 } });
    runTicks(sim, 60);
    off();
    const nests = colonyNests(sim, queen.colony);
    expect(nests.length).toBe(1);
    const nest = nests[0];
    expect(nest.entrances.length).toBe(1);
    const e = nest.entrances[0];
    expect(expelled).toBeGreaterThan(20);
    expect(sim.state.items.filter((it) => it.alive && it.kind === 'soil-pellet').length).toBe(0);
    // every expulsion of the founding dig lands on ONE pile, the entrance's mound
    const piles = nest.moundIds.map((id) => moundById(sim, id)!).filter((m) => m.material !== 'frass');
    expect(piles.length).toBe(1);
    expect(e.moundId).toBe(piles[0].id);
    const m = piles[0];
    // check 9: mound volume grew by 1.25 x removed (no loss to kept-clear cells or the grid edge)
    expect(Math.abs(moundVolume(sim, m) - BULKING * expelled) / (BULKING * expelled)).toBeLessThan(0.005);
    expect(pileOverOpenings(sim, m)).toEqual([]);
    expect(sim.field.isHoleAt(e.pos.x, e.pos.z)).toBe(true);
    expect(e.status).toBe('open');
  }, 240_000);
});

describe('verify: in-game batches only (no test-side settling), haulers dumping at random dump-ring angles', () => {
  it('GDD 03 App. E check 5: adjacent cells within 0.5 tan 38 + 0.01 BU, r_ent cells h = 0, volume 1.25 x within 0.5 %', () => {
    const { sim, queen } = freeDig(11);
    const bu = sim.world.bu;
    const nest = colonyNests(sim, queen.colony)[0];
    const e = nest.entrances[0];
    // the dig's own last pellets (a queen not in `digging` drops them on the surface) settle first, so `before`
    // holds them (sim-fix-colony review: they had joined this mound during the measured ticks, +8 %)
    settleSurfacePellets(sim);
    const m0 = e.moundId >= 0 ? moundById(sim, e.moundId) : undefined;
    const before = m0 ? moundVolume(sim, m0) : 0;
    const p = { x: 0, y: 0, z: 0 };
    for (let n = 0; n < 200; n++) {
      dumpPoint(sim, e, p);
      const it = spawnPellet(sim, p, PELLET, 'loam', nest.id, nest.colony, -1);
      placePellet(sim, it, { ...p });
    }
    runTicks(sim, 6000);
    const m = moundById(sim, e.moundId)!;
    const added = moundVolume(sim, m) - before;
    const lim = (0.5 * Math.tan((reposeDeg('loam') * Math.PI) / 180) + 0.01) * bu;
    const worst = worstAdjacent(sim, m);
    // random dump angles (the real haulers' distribution) still give a round crater near the throat
    for (const r of [3, 4.5]) expect(ringSpread(sim, e.pos.x, e.pos.z, r * bu)).toBeLessThan(0.15);
    expect(Math.abs(added - 200 * PELLET * BULKING) / (200 * PELLET * BULKING)).toBeLessThan(0.005);
    expect(worst).toBeLessThanOrEqual(lim);
    const { x0, z0 } = moundOrigin(m);
    for (let i = 0; i < m.h.length; i++) {
      const d = Math.hypot(x0 + (i % m.n) * m.cell - e.pos.x, z0 + Math.floor(i / m.n) * m.cell - e.pos.z);
      if (d <= e.radius) expect(m.h[i]).toBe(0);
    }
    expect(pileOverOpenings(sim, m)).toEqual([]);
  }, 240_000);
});

/** Walks `a` by (dx, dz) BU on the surface; returns the nav status. */
function walkBy(sim: Sim, a: Ant, dx: number, dz: number): string {
  const bu = sim.world.bu;
  const to = { x: a.pos.x + dx * bu, y: 0, z: a.pos.z + dz * bu };
  to.y = sim.field.height(to.x, to.z);
  navTo(sim, a, to, 1.5 * bu);
  for (let t = 0; t < 4000 && a.nav.status === 'moving'; t++) sim.tick();
  return a.nav.status;
}

describe('verify: a founding queen who tries two sites before digging her cell (GDD 03 §13.1, §13.2, §13.4)', () => {
  let sim: Sim, queen: Ant;
  let lastExpel: { pos: { x: number; z: number }; moundId: number } | null = null;
  beforeAll(() => {
    sim = makeTestSim({ seed: 3, behaviours: passiveBehaviours() });
    const col = sim.state.colonies[0];
    queen = sim.stores.ants.get(col.queenId)!;
    sim.stores.nests.get(col.nestIds[0])!.founding!.state = 'digging';
    // two shallow trial pits 15+ BU apart (each >= 6 BU from the others, not connected), then the real shaft and cell
    walkBy(sim, queen, 15, -20);
    runFreeDig(sim, queen, { dir: { x: 1, z: 0 }, shaftBu: 2, roomBites: 0 });
    walkBy(sim, queen, -6, 15);
    runFreeDig(sim, queen, { dir: { x: 1, z: 0 }, shaftBu: 2, roomBites: 0 });
    walkBy(sim, queen, -6, 15);
    const off = sim.events.on('pellet-expelled', (e) => { lastExpel = { pos: { x: e.pos.x, z: e.pos.z }, moundId: e.moundId }; });
    runFreeDig(sim, queen, { dir: { x: 1, z: 0 } });
    off();
    runTicks(sim, 60);
  }, 240_000);

  it('the dug cell becomes ready / the founding cell: far, disconnected trial pits are not openings of the founding cavity', () => {
    const nest = colonyNests(sim, queen.colony)[0];
    const r = foundingReadiness(sim, nest)!;
    expect(r.readiness).toBeGreaterThan(0.99); // the cell itself meets depth, volume and width
    // DEFECT: openings counts every entrance of the nest record (3: two abandoned trial pits + the real one),
    // so `ready` stays false forever and the cell registers as `general`, never `founding`
    expect(r.ready).toBe(true);
    expect(nest.chambers.some((c) => c.type === 'founding')).toBe(true);
  });

  it('expelled soil of the current pit lands on a pile around that pit, not on the first pit\'s mound', () => {
    expect(lastExpel).not.toBeNull();
    const m = moundById(sim, lastExpel!.moundId)!;
    // DEFECT: expelVolume always uses nest.entrances[0]: the soil of the third pit is deposited 30 BU away
    expect(Math.hypot(m.centerX - lastExpel!.pos.x, m.centerZ - lastExpel!.pos.z)).toBeLessThan(10 * sim.world.bu);
  });
});

describe('verify: an entrance that widens under an existing crater (GDD 03 §1.4 kept-clear hole)', () => {
  it('pile inside the new kept-clear radius is cleared at once, not at the next mound batch (soak invariant every 100 ticks)', () => {
    const { sim, queen } = freeDig(11);
    const bu = sim.world.bu;
    const nest = colonyNests(sim, queen.colony)[0];
    const e = nest.entrances[0];
    const p = { x: 0, y: 0, z: 0 };
    for (let n = 0; n < 200; n++) {
      dumpPoint(sim, e, p);
      const it = spawnPellet(sim, p, PELLET, 'loam', nest.id, nest.colony, -1);
      placePellet(sim, it, { ...p });
    }
    runTicks(sim, 4000);
    const m = moundById(sim, e.moundId)!;
    expect(pileOverOpenings(sim, m)).toEqual([]);
    const r0 = e.radius;
    // the throat is widened (a worker enlarging the mouth; here one sphere carve through the nest's carve op)
    carveSphere(sim, { x: e.pos.x, y: e.pos.y - 0.5 * bu, z: e.pos.z }, 2.6 * bu, {});
    expect(e.radius).toBeGreaterThan(r0);
    runTicks(sim, 1);
    // DEFECT (minor): 37 grid points of pile stay inside the grown kept-clear radius until the mound's next batch
    // (up to 250 ticks), so the `mounds-keep-openings-clear` soak invariant can fire and the overlay overhangs the hole
    expect(pileOverOpenings(sim, m)).toEqual([]);
  }, 240_000);
});

describe('verify: crater on sloped ground (acceptance 4: no slope above the angle of repose)', () => {
  it('on a 10 degree slope the crater wall stays at or below the angle of repose', () => {
    const world = makeTestWorld({});
    const hf = world.terrain, s = Math.tan((10 * Math.PI) / 180);
    for (let iz = 0; iz < hf.nz; iz++) for (let ix = 0; ix < hf.nx; ix++) hf.data[ix + iz * hf.nx] = (ix * hf.cell - world.size / 2) * s;
    const sim = nestSim({ world });
    const nest = playerNest(sim);
    const c = sim.world.size / 2, bu = sim.world.bu;
    const e = {
      id: sim.state.nextId++, kind: 'dug' as const, status: 'open' as const, pos: { x: c, y: heightAt(hf, c, c), z: c }, dir: { x: 0, y: 1, z: 0 },
      radius: 1.2 * bu, moundId: -1, rimTarget: 0, plugVoxelCount: 0, createdTick: 0, trafficIn: 0, trafficOut: 0,
    };
    nest.entrances.push(e);
    const m = createMound(sim, nest, e, c, c, 'loam');
    for (let n = 0; n < 1500; n++) {
      const a = n * 2.39996323, r = e.radius + (1.5 + 3.5 * ((n * 0.7548776662) % 1)) * bu;
      deposit(sim, m, c + Math.cos(a) * r, c + Math.sin(a) * r, PELLET * BULKING * bu ** 3);
    }
    for (let k = 0; k < 200 && relax(sim, m); k++) { /* settle */ }
    publishMound(sim, m);
    expect(moundContains(m, c, c)).toBe(true);
    // DEFECT: the inner-wall cap is measured from the ground at the entrance CENTRE, not the pit edge: downhill the
    // wall stands steeper than repose (0.48 BU per 0.5 BU cell at 5 deg, 0.80 at 15 deg), uphill no pile within 3 BU
    const lim = (0.5 * Math.tan((reposeDeg('loam') * Math.PI) / 180) + 0.01) * bu;
    expect(worstAdjacent(sim, m)).toBeLessThanOrEqual(lim);
    void moundOrigin;
  });
});

describe('verify: GDD 03 App. E check 8 at the nest level (foundingReadiness geometry, open soil)', () => {
  /** Founding nest record at the queen's start with a carved LN template shaft (2.5 BU) to `shaftBu`, optional cell. */
  function carved(shaftBu: number, cell: boolean) {
    const sim = nestSim({});
    const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
    expect(nest.founding).not.toBeNull();
    const bu = sim.world.bu, o = nest.origin, g = sim.field.height(o.x, o.z);
    const bottom = { x: o.x, y: g - shaftBu * bu, z: o.z };
    carveCapsuleOp(sim, { x: o.x, y: g + 0.5 * bu, z: o.z }, bottom, 1.25 * bu);
    if (cell) carveEllipsoidOp(sim, { x: o.x + 2 * bu, y: bottom.y - 0.375 * bu, z: o.z }, { x: 2 * bu, y: 1 * bu, z: 2.25 * bu });
    runTicks(sim, 60);
    return { sim, nest, r: foundingReadiness(sim, nest)! };
  }
  it('shaft to 10 BU + 4 x 2 x 4.5 cell: readiness 1, ready, one opening, and the founding cell registers', () => {
    const { nest, r } = carved(10, true);
    expect(nest.entrances.length).toBe(1);
    expect(r.readiness).toBeCloseTo(1, 6);
    expect(r.ready).toBe(true);
    expect(nest.chambers.filter((c) => c.type === 'founding').length).toBe(1);
  });
  it('shaft only: not ready (width test)', () => {
    const { r, nest } = carved(10, false);
    expect(r.widthOk).toBe(false);
    expect(r.ready).toBe(false);
    expect(nest.chambers.some((c) => c.type === 'founding')).toBe(false);
  });
  it('cell at 6 BU depth in open soil: not ready (D_MIN open 8)', () => {
    const { r } = carved(6, true);
    expect(r.covered).toBe(false);
    expect(r.ready).toBe(false);
  });
});
