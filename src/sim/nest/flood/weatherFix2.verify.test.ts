// Adversarial review of task weather-fix2 (reviewer's tests). A failing test here demonstrates a real defect and is
// left red on purpose for the fixer; the passing ones stay as regression tests.
//   1. regression: brood put down on a chamber floor (a carrier's feet point) survives the sweep-4 film of water;
//   2. regression: that film submerges no ant standing anywhere on the floor;
//   3. RED: `queen-in-danger` is shared with combat (same kind and subject): when combat clears it while the queen is
//      still under water, the flood module never raises it again (its own bb flag says it is up), so she can drown
//      with no alert (weather-fix2 item 3: never a silent death);
//   4. regression: the depth rule (>= 0.5 BU above the feet) in drownStep and isUnderWater; E23 at 2 BU depth;
//   5. regression: the hydrology factor is continuous and monotone over every map byte;
//   6. regression: the bounding-box rim scan equals the nest module's rimHeight.

import { describe, expect, it } from 'vitest';
import type { Ant, Sim } from '@/sim/types';
import {
  FLOOD_ANT_SUB_KEY, FLOOD_BROOD_DROWN_S, FLOOD_HYDRO_GAIN, FLOOD_HYDRO_SAFE_FACTOR, FLOOD_RIM_FULL_BU, FLOOD_RIM_MIN,
  FLOOD_SUBMERGE_DEPTH_BU,
} from '@/sim/balance/weather';
import { spawnBrood } from '@/sim/entities';
import { combatAlerts, noteQueenDamaged } from '@/sim/combat/alerts';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { TICKS_PER_SECOND } from '@/sim/time';
import { rimHeight } from '../mounds';
import { feetOf, placeWorker, playerNest } from '../nestTestKit';
import { floodCheats } from './cheats';
import { drownStep, isUnderWater } from './drown';
import { addRim, neutralSite } from './floodTestKit';
import { floodSystem } from './index';
import { hydroFactorOf, rimFactorOf } from './inflow';
import { spillFor } from './runtime';
import { floodedCount, waterLevelMm } from './spill';

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };

function floodSim(): Sim {
  const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
  neutralSite(sim);
  return sim;
}

/** Smallest water volume whose level stands `depthBu` above the feet of `ant` (bisection on the spill cache). */
function waterForDepth(sim: Sim, ant: Ant, depthBu: number): number {
  const nest = playerNest(sim);
  const cache = spillFor(sim, nest);
  const feet = feetOf(ant).y, want = feet + depthBu * sim.world.bu;
  let lo = 0, hi = cache.cumVol[cache.cumVol.length - 1];
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (waterLevelMm(cache, mid, sim.carve.voxel) >= want) hi = mid; else lo = mid;
  }
  return hi;
}

describe('review weather-fix2: brood on a chamber floor in a film of water', () => {
  it('a larva put down on the royal chamber floor (a carrier feet point) survives the sweep-4 film (0.7 BU^3)', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    // where a nurse drops brood: releaseCarried(sim, ant, feetPoint(ant)) -> brood.pos is the floor point
    const nurse = placeWorker(sim, { ...royal.center }, { x: 1, y: 0, z: 0 }, nest.id);
    const floor = feetOf(nurse);
    nurse.alive = false; // only the brood matters here
    const b = spawnBrood(sim, { colony: sim.state.colonies[0].id, stage: 'larva', destined: 'worker', pos: floor, nestId: nest.id, chamberId: royal.id });
    floodCheats(sim.state).drainScale = 0;
    // the sweep-4 film (0.7 BU^3, about 0.05 BU over the floor): wet, but nothing is under water
    nest.flood.water = 0.7;
    run(sim, 20);
    expect(royal.flooded).toBeGreaterThan(0);
    expect(royal.flooded).toBeLessThan(0.01);
    run(sim, (FLOOD_BROOD_DROWN_S + 10) * TICKS_PER_SECOND);
    expect(b.submergedS ?? 0).toBe(0);
    expect(b.alive).toBe(true);
  });
});

describe('review weather-fix2: a film of water on a chamber floor', () => {
  it('0.7 BU^3 in the royal chamber (the sweep-4 film) submerges no ant standing anywhere on its floor', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    const bu = sim.world.bu;
    const ants: Ant[] = [];
    for (let dx = -2; dx <= 2; dx += 0.5) for (let dz = -2; dz <= 2; dz += 0.5) {
      try { ants.push(placeWorker(sim, { x: royal.center.x + dx * bu, y: royal.center.y, z: royal.center.z + dz * bu }, { x: 1, y: 0, z: 0 }, nest.id)); } catch { /* off the floor */ }
    }
    expect(ants.length).toBeGreaterThan(40);
    floodCheats(sim.state).drainScale = 0;
    nest.flood.water = 0.7;
    run(sim, 20);
    const under = ants.filter((a) => (a.bb[FLOOD_ANT_SUB_KEY] ?? 0) > 0);
    const depths = under.map((a) => ((nest.flood.level - feetOf(a).y) / bu).toFixed(2));
    // the cell volume of 0.7 BU^3 spread over this floor is a film of a few hundredths of a BU
    expect(under.length, `submerged in a film: ${under.length} of ${ants.length}, level above their feet ${depths.join(', ')} BU`).toBe(0);
  });
});

describe('review weather-fix2: queen-in-danger is shared with combat', () => {
  it('when combat clears the alert while the queen is still under water, it is raised again', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    const q = placeWorker(sim, { ...royal.center }, { x: 1, y: 0, z: 0 }, nest.id);
    q.caste = 'queen';
    sim.state.colonies[0].queenId = q.id;
    floodCheats(sim.state).drainScale = 0;
    nest.flood.water = waterForDepth(sim, q, 2);
    run(sim, 30);
    expect(q.bb[FLOOD_ANT_SUB_KEY]).toBeGreaterThan(0);
    const active = () => sim.state.progression.alerts.some((a) => a.kind === 'queen-in-danger' && a.subjectId === q.id);
    expect(active()).toBe(true);
    // a hostile bites her once (combat's raise updates the same alert), then combat's own 30 s clear runs
    noteQueenDamaged(sim, q);
    q.bb['cb.qdT'] = sim.state.tick - 1000 * TICKS_PER_SECOND;
    combatAlerts(sim);
    expect(active()).toBe(true); // combat skips clearing the shared card while she is under water (nest-fix3 item 5)
    run(sim, 50);
    expect(q.bb[FLOOD_ANT_SUB_KEY]).toBeGreaterThan(0); // ... she is still under water ...
    expect(active()).toBe(true); // ... so the player must still be told (weather-fix2 item 3: never a silent death)
  });
});

describe('review weather-fix2: submersion depth rule (regression)', () => {
  it('submerged from FLOOD_SUBMERGE_DEPTH_BU above the feet, not below it; isUnderWater agrees with the drown pass', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const royal = nest.chambers[2];
    const w = placeWorker(sim, { ...royal.center }, { x: 1, y: 0, z: 0 }, nest.id);
    const cache = spillFor(sim, nest);
    const bu = sim.world.bu;
    for (const [depth, expectUnder] of [[FLOOD_SUBMERGE_DEPTH_BU * 0.8, false], [FLOOD_SUBMERGE_DEPTH_BU + 1, true], [3, true]] as const) {
      const water = waterForDepth(sim, w, depth);
      nest.flood.water = water;
      nest.flood.level = waterLevelMm(cache, water, sim.carve.voxel);
      delete w.bb[FLOOD_ANT_SUB_KEY];
      const wet = [{ nestId: nest.id, cache, nFlooded: floodedCount(cache, water), level: nest.flood.level }];
      const r = drownStep(sim, wet);
      expect(r.antsSubmerged > 0, `depth ${depth} BU`).toBe(expectUnder);
      expect(isUnderWater(sim, w.pos, w.footOffset), `isUnderWater at depth ${depth} BU`).toBe(expectUnder);
      expect((nest.flood.level - feetOf(w).y) / bu).toBeCloseTo(depth, 1);
    }
  });

  it('a worker on a floor flooded 2 BU deep keeps its hp through the grace and loses it afterwards (E23 shape)', () => {
    const sim = floodSim();
    const nest = playerNest(sim);
    const w = placeWorker(sim, { ...nest.chambers[2].center }, { x: 1, y: 0, z: 0 }, nest.id);
    floodCheats(sim.state).drainScale = 0;
    nest.flood.water = waterForDepth(sim, w, 2);
    run(sim, 500);
    expect(w.hp).toBe(w.maxHp);
    run(sim, 1010);
    expect(w.alive).toBe(false);
  });
});

describe('review weather-fix2: world hydrology factor (regression)', () => {
  it('is continuous and non-decreasing over every map byte, SAFE_FACTOR on raised ground and 1 + GAIN in the wettest hollow', () => {
    let prev = 0;
    for (let b = 0; b <= 255; b++) {
      const f = hydroFactorOf(b / 255);
      expect(Number.isFinite(f)).toBe(true);
      expect(f).toBeGreaterThanOrEqual(prev);
      // a byte step never jumps more than a tenth of the whole range (no hidden discontinuity)
      if (b > 0) expect(f - prev).toBeLessThan(0.2 * (1 + FLOOD_HYDRO_GAIN));
      prev = f;
    }
    expect(hydroFactorOf(0)).toBe(FLOOD_HYDRO_SAFE_FACTOR);
    expect(hydroFactorOf(1)).toBeCloseTo(1 + FLOOD_HYDRO_GAIN, 9);
    expect(hydroFactorOf(-1)).toBe(FLOOD_HYDRO_SAFE_FACTOR);
    expect(hydroFactorOf(2)).toBeCloseTo(1 + FLOOD_HYDRO_GAIN, 9);
  });
});

describe('review weather-fix2: the bounding-box rim scan equals the nest module rimHeight (regression)', () => {
  it('rimFactorOf = max(RIM_MIN, 1 - rimHeight / RIM_FULL) for rims of several heights, also off-centre', () => {
    for (const rimBu of [0, 0.4, 1.5, 3, 5]) {
      const sim = floodSim();
      const nest = playerNest(sim);
      const e = nest.entrances[0];
      addRim(sim, nest, e, rimBu);
      const m = sim.state.worldDelta.mounds.find((x) => x.id === e.moundId)!;
      // a taller pile just outside the ring must not count; one cell inside the ring must
      const bu = sim.world.bu;
      for (let idx = 0; idx < m.h.length; idx++) {
        const ix = idx % m.n, iz = (idx - ix) / m.n;
        const x = m.centerX + (ix - (m.n - 1) / 2) * m.cell, z = m.centerZ + (iz - (m.n - 1) / 2) * m.cell;
        if (Math.hypot(x - e.pos.x, z - e.pos.z) > e.radius + 6 * bu) m.h[idx] = 9 * bu;
      }
      const expected = Math.max(FLOOD_RIM_MIN, 1 - rimHeight(sim, m) / FLOOD_RIM_FULL_BU);
      expect(rimFactorOf(sim, e), `rim ${rimBu} BU`).toBeCloseTo(expected, 12);
    }
  });
});
