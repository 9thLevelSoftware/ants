// Adversarial review of the flood module (weather-effects review). Tests that FAIL here demonstrate a defect and
// are left for the fixer; passing ones are regression tests.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { makeTestSim } from '@/sim/testing';
import { createSim } from '@/sim/sim';
import { restore, snapshot } from '@/sim/save/snapshot';
import { commandsSystem } from '@/sim/systems';
import { playerNest } from '../nestTestKit';
import { floodCheats } from './cheats';
import { neutralSite } from './floodTestKit';
import { floodSystem } from './index';
import { entranceInflow } from './inflow';
import { spillFor, spillPeek } from './runtime';
import { buildSpill, floodedCount } from './spill';

const SYSTEMS = [commandsSystem, floodSystem];
const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };

function milestones(sim: Sim): string[] {
  const out: string[] = [];
  sim.events.on('nest-milestone', (e) => out.push(e.kind));
  return out;
}

/** The test nest on a neutral site: world hydrology factor 1, GDD 03's flat-ground c = 1 (weather-fix2). */
function onNeutralSite(sim: Sim): Sim {
  neutralSite(sim);
  return sim;
}

/** Rain I = 1 for `wetTicks`, then no rain and fast drainage (the cheats are not saved: re-applied after a load). */
function rainThenDrain(sim: Sim, phase: 'rain' | 'drain'): void {
  const c = floodCheats(sim.state);
  c.rainI = phase === 'rain' ? 1 : 0;
  c.drainScale = phase === 'rain' ? 0 : 50;
}

describe('review: flood state across save / load', () => {
  it('survived-flood is emitted after a save / load mid-flood exactly as in an uninterrupted run', () => {
    // A: uninterrupted
    const a = onNeutralSite(makeTestSim({ nest: 'small', systems: SYSTEMS }));
    const evA = milestones(a);
    rainThenDrain(a, 'rain');
    run(a, 300);
    run(a, 400);
    expect(playerNest(a).chambers[2].flooded).toBeGreaterThanOrEqual(0.25);
    rainThenDrain(a, 'drain');
    // B: same history, saved and restored while the water recedes (after the peak, still wet)
    const b0 = onNeutralSite(makeTestSim({ nest: 'small', systems: SYSTEMS }));
    rainThenDrain(b0, 'rain');
    run(b0, 700);
    rainThenDrain(b0, 'drain');
    let k = 0;
    while (playerNest(b0).chambers[2].flooded >= 0.1 && k++ < 5000) { b0.tick(); a.tick(); }
    expect(playerNest(b0).flood.water).toBeGreaterThan(0);
    const b = createSim(restore(snapshot(b0)).state, b0.world, { systems: SYSTEMS });
    const evB = milestones(b);
    rainThenDrain(b, 'drain');
    for (const s of [a, b]) {
      run(s, 8000);
      expect(playerNest(s).flood.water).toBe(0);
    }
    expect(evA).toEqual(['survived-flood']);
    // the peak share bookkeeping lives in the runtime (floodRuntime().peak), not in the saved state
    expect(evB).toEqual(evA);
  });
});

describe('review: inflow arithmetic (GDD 03 §11.1)', () => {
  it('Q = 1.2 x I x c x f_cover x f_rim x f_state x floodInflowMult on the flat test entrance', () => {
    const sim = onNeutralSite(makeTestSim({ nest: 'small', systems: SYSTEMS }));
    const e = playerNest(sim).entrances[0];
    for (const I of [0.1, 0.4, 0.7, 1]) {
      const f = entranceInflow(sim, e, I);
      expect(f.catchment).toBeCloseTo(1, 6);
      expect(f.q).toBeCloseTo(1.2 * I * sim.state.config.difficulty.params.floodInflowMult, 9);
    }
    // a negative or NaN override is "no override" and never produces negative or NaN inflow
    for (const bad of [Number.NaN, -0.5]) {
      const f = entranceInflow(sim, e, bad);
      expect(Number.isFinite(f.q)).toBe(true);
      expect(f.q).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('review: spill cache cost and rebuild cadence (GDD 03 §11.2: rebuilt when carving changes, throttled to 5 s)', () => {
  it('measures a rebuild and counts rebuilds while the nest is dug during a flood (report only)', () => {
    const sim = onNeutralSite(makeTestSim({ nest: 'small', systems: SYSTEMS }));
    const nest = playerNest(sim);
    floodCheats(sim.state).rainI = 1;
    run(sim, 200);
    const bu = sim.world.bu;
    // a large extra room joined to the royal chamber (a mature nest's worth of open volume)
    const royal = nest.chambers[2];
    sim.kernel.carveEllipsoid({ x: royal.center.x + 10 * bu, y: royal.center.y, z: royal.center.z }, { x: 9 * bu, y: 3 * bu, z: 9 * bu }, { force: true });
    let best = Infinity, n = 0;
    for (let r = 0; r < 3; r++) {
      const t0 = performance.now();
      const c = buildSpill(sim, nest);
      best = Math.min(best, performance.now() - t0);
      n = c.si.length;
    }
    // one small bite-sized carve per flood step for 50 ticks: how many full rebuilds?
    let rebuilds = 0;
    for (let s = 0; s < 5; s++) {
      const before = spillPeek(sim, nest.id);
      sim.kernel.carveEllipsoid({ x: royal.center.x - 2 * bu + s * 0.6 * bu, y: royal.center.y - royal.radii.y + 0.2 * bu, z: royal.center.z }, { x: 0.4 * bu, y: 0.4 * bu, z: 0.4 * bu }, { force: true });
      run(sim, 10);
      if (spillPeek(sim, nest.id) !== before) rebuilds++;
    }
    console.log(`[flood.verify] buildSpill ${n} samples: ${best.toFixed(2)} ms; rebuilds in 50 ticks of digging: ${rebuilds}`);
    expect(floodedCount(spillFor(sim, nest), nest.flood.water)).toBeGreaterThan(0);
    expect(rebuilds).toBeGreaterThan(0);
  });

  it('a DRY nest that is being dug rebuilds its whole spill cache at every reference-storm prediction (report only)', () => {
    const sim = onNeutralSite(makeTestSim({ nest: 'small', systems: SYSTEMS }));
    const nest = playerNest(sim);
    const bu = sim.world.bu, royal = nest.chambers[2];
    run(sim, 300);
    expect(nest.flood.water).toBe(0);
    let rebuilds = 0;
    for (let s = 0; s < 4; s++) {
      const before = spillPeek(sim, nest.id);
      // a bite into the floor of the royal chamber (as a digger would take)
      sim.kernel.carveEllipsoid({ x: royal.center.x - 2 * bu + s * 0.6 * bu, y: royal.center.y - royal.radii.y, z: royal.center.z }, { x: 0.4 * bu, y: 0.4 * bu, z: 0.4 * bu }, { force: true });
      run(sim, 250);
      if (spillPeek(sim, nest.id) !== before) rebuilds++;
    }
    console.log(`[flood.verify] dry nest, 4 prediction periods with digging: ${rebuilds} full spill rebuilds`);
    expect(rebuilds).toBe(4);
  });
});
