// Regression tests for the fixes of the nest-fixes review (the reviewer's own tests are nestFixes.verify.test.ts):
// crater walls on sloped ground at several angles, the founding cell's roof under a tall cell, the founding cell
// rule limited to the founding states, and founding soil of a new pit landing around that pit from its first bite.
import { describe, expect, it } from 'vitest';
import type { Ant, Mound, Sim } from '@/sim/types';
import { BULKING } from '@/sim/balance/nest';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { passiveBehaviours } from '@/sim/testing/e2e/colonyScenario';
import { navTo } from '@/sim/locomotion';
import { heightAt } from '@/sim/world/terrainSample';
import { carveCapsule, carveEllipsoid } from './carveOps';
import { applyFoundingCell, foundingReadiness } from './chambers/foundingCell';
import { colonyNests, runFreeDig } from './freeDigKit';
import { createMound, deposit, moundById, publishMound, relax } from './mounds';
import { moundOrigin } from './moundRelax';
import { nestSim, playerNest, runTicks } from './nestTestKit';
import { reposeDeg } from './substrate';

const PELLET = 0.85;

/** Largest top difference between 4-adjacent usable cells with pile on either side, mm. */
function worstAdjacent(m: Mound): number {
  const n = m.n;
  let worst = 0;
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const i = iz * n + ix;
    if (Number.isNaN(m.base[i])) continue;
    for (const j of [ix + 1 < n ? i + 1 : -1, iz + 1 < n ? i + n : -1]) {
      if (j < 0 || Number.isNaN(m.base[j]) || (m.h[i] <= 0 && m.h[j] <= 0)) continue;
      worst = Math.max(worst, Math.abs(m.base[i] + m.h[i] - m.base[j] - m.h[j]));
    }
  }
  return worst;
}

/** A settled crater of 1,500 pellets around an entrance at the centre of a world tilted by `deg` along x. */
function slopedCrater(deg: number) {
  const world = makeTestWorld({});
  const hf = world.terrain, s = Math.tan((deg * Math.PI) / 180);
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
  return { sim, m, c };
}

/** Highest pile height within [r0, r1] BU of (c, c) on the side x < c (uphill) or x > c (downhill), BU. */
function sidePeak(sim: Sim, m: Mound, c: number, uphill: boolean, r0: number, r1: number): number {
  const { x0, z0 } = moundOrigin(m), bu = sim.world.bu;
  let best = 0;
  for (let i = 0; i < m.h.length; i++) {
    const x = x0 + (i % m.n) * m.cell, z = z0 + Math.floor(i / m.n) * m.cell;
    const d = Math.hypot(x - c, z - c) / bu;
    if (d < r0 || d > r1 || (uphill ? x > c - 0.5 * bu : x < c + 0.5 * bu)) continue;
    best = Math.max(best, m.h[i] / bu);
  }
  return best;
}

describe('review fix: crater inner wall on sloped ground (acceptance 4)', () => {
  for (const deg of [0, 5, 15]) {
    it(`at ${deg} degrees no adjacent pair exceeds 0.5 tan(repose) + 0.01 BU, and the crater is not lopsided`, () => {
      const { sim, m, c } = slopedCrater(deg);
      const bu = sim.world.bu;
      const lim = (0.5 * Math.tan((reposeDeg('loam') * Math.PI) / 180) + 0.01) * bu;
      expect(worstAdjacent(m)).toBeLessThanOrEqual(lim);
      // the near-pit rim exists uphill as well as downhill (before the fix: none uphill within 3 BU at 15 degrees)
      const up = sidePeak(sim, m, c, true, 1.5, 3), down = sidePeak(sim, m, c, false, 1.5, 3);
      expect(up).toBeGreaterThan(0.2);
      expect(up / down).toBeGreaterThan(0.5);
    });
  }
});

describe('review fix: founding readiness roof and states (GDD 03 §13.1, §13.2)', () => {
  /** A founding nest with a 2.5 BU shaft to 10 BU and a cell of half-height `cellHalfH` BU at its bottom. */
  function carved(cellHalfH: number) {
    const sim = nestSim({});
    const nest = sim.stores.nests.get(sim.state.colonies[0].nestIds[0])!;
    const bu = sim.world.bu, o = nest.origin, g = sim.field.height(o.x, o.z);
    const bottom = { x: o.x, y: g - 10 * bu, z: o.z };
    carveCapsule(sim, { x: o.x, y: g + 0.5 * bu, z: o.z }, bottom, 1.25 * bu);
    carveEllipsoid(sim, { x: o.x + 2 * bu, y: bottom.y - cellHalfH * 0.4 * bu, z: o.z }, { x: 2 * bu, y: cellHalfH * bu, z: 2.25 * bu });
    return { sim, nest };
  }

  it('a tall cell (3.5 BU high) still has its soil roof: the roof is measured above the cavity, not 4 voxels up', () => {
    const { sim, nest } = carved(1.75);
    const r = foundingReadiness(sim, nest)!;
    expect(r.widthOk).toBe(true);
    expect(r.roofOk).toBe(true);
    expect(r.ready).toBe(true);
  });

  it('the founding cell rule does not run once the nest is established', () => {
    const { sim, nest } = carved(1);
    nest.founding!.state = 'established';
    expect(applyFoundingCell(sim, nest)).toBeNull();
    runTicks(sim, 60);
    expect(nest.chambers.some((ch) => ch.type === 'founding')).toBe(false);
  });

  it('while founding, the same cavity registers the founding cell', () => {
    const { sim, nest } = carved(1);
    nest.founding!.state = 'digging';
    runTicks(sim, 60);
    expect(nest.chambers.filter((ch) => ch.type === 'founding').length).toBe(1);
  });
});

/** Walks `a` by (dx, dz) BU on the surface. */
function walkBy(sim: Sim, a: Ant, dx: number, dz: number): void {
  const bu = sim.world.bu;
  const to = { x: a.pos.x + dx * bu, y: 0, z: a.pos.z + dz * bu };
  to.y = sim.field.height(to.x, to.z);
  navTo(sim, a, to, 1.5 * bu);
  for (let t = 0; t < 4000 && a.nav.status === 'moving'; t++) sim.tick();
}

describe('review fix: founding expulsion goes to the pit being dug (GDD 03 §13.2)', () => {
  it('every expulsion of a second pit 25 BU away, from its first bite on, lands on a pile within 10 BU of the bite', () => {
    const sim = makeTestSim({ seed: 3, behaviours: passiveBehaviours() });
    const col = sim.state.colonies[0];
    const queen = sim.stores.ants.get(col.queenId)!;
    sim.stores.nests.get(col.nestIds[0])!.founding!.state = 'digging';
    walkBy(sim, queen, 15, -20);
    runFreeDig(sim, queen, { dir: { x: 1, z: 0 }, shaftBu: 2, roomBites: 0 });
    walkBy(sim, queen, -6, 25);
    const far: number[] = [];
    let count = 0;
    const off = sim.events.on('pellet-expelled', (ev) => {
      const m = moundById(sim, ev.moundId)!;
      count++;
      const d = Math.hypot(m.centerX - ev.pos.x, m.centerZ - ev.pos.z) / sim.world.bu;
      if (d > 10) far.push(d);
    });
    runFreeDig(sim, queen, { dir: { x: 1, z: 0 }, shaftBu: 4, roomBites: 0 });
    off();
    expect(count).toBeGreaterThan(5);
    expect(far).toEqual([]);
    // each pit has its own entrance and its own soil mound
    const nest = colonyNests(sim, queen.colony)[0];
    expect(nest.entrances.length).toBe(2);
    expect(new Set(nest.entrances.map((e) => e.moundId)).size).toBe(2);
    expect(nest.entrances.every((e) => e.moundId >= 0)).toBe(true);
  }, 240_000);
});
