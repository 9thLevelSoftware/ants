// Flood invariants (task weather-fix2 item 2), fast versions on the test world; the generated-world sweep (seeds 1-3
// x the five Tier 1 archetypes) is invariants.long.test.ts behind FOUNDRESS_LONG.
//   1. precipitation 0 for 3 game days: no chamber's flooded share rises above 0 and nobody drowns;
//   2. a site the static suitability map calls flood-safe (floodFactorOf >= 2/3, the read-out's "Raised" word) gets
//      no more rain than flat ground (world hydrology factor 1) and floods in no ordinary shower;
//   3. a sealed founding cell takes water only by seepage (founding.test.ts has the rule in detail);
//   4. water recedes after rain at Q_out = K_DRAIN x A_wet x (1 - 0.7 m) (GDD 03 §11.1).

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import {
  FLOOD_ALERT_FRACTION, FLOOD_DRAIN_MOIST_K, FLOOD_HYDRO_NEUTRAL_RISK, FLOOD_HYDRO_SAFE_FACTOR, FLOOD_HYDRO_SAFE_RISK, FLOOD_K_DRAIN,
} from '@/sim/balance/weather';
import { systems as environmentSystems } from '@/sim/environment';
import { forceWeather } from '@/sim/environment/weather';
import { makeTestSim } from '@/sim/testing';
import { commandsSystem } from '@/sim/systems';
import { floodFactorOf } from '@/worldgen/maps/suitability';
import { placeWorker, playerNest, setMoisture } from '../nestTestKit';
import { moistureAt } from '../substrate';
import { floodCheats } from './cheats';
import { floodSystem } from './index';
import { catchmentOf, hydroFactorOf, nestInflow } from './inflow';
import { predictRain } from './predict';
import { spillFor } from './runtime';
import { floodedCount } from './spill';

/** floodSafety word "Raised" of the read-out (siteScore.ts: three words, the top one from score 2/3). */
const RAISED = 2 / 3;
/**
 * An ordinary shower: rain class shower (I 0.4) for the median summer rain dwell, GDD 06 §3.2: min 1.5 h + Exp(mean
 * 4 - 1.5 h) has the median 1.5 + 2.5 ln 2 = 3.2 game hours = 80 game s (the inflow lasts a little less: the bell's
 * tails fall below the rain threshold).
 */
const SHOWER_I = 0.4;
const SHOWER_S = 80;
const BROOD = new Set(['nursery', 'royal', 'founding']);

const run = (sim: Sim, n: number): void => { for (let i = 0; i < n; i++) sim.tick(); };

describe('invariant 1: three dry game days', () => {
  it('weather severity "none" (clear / overcast only): no water, no flooded share, no drowning, no submersion', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, ...environmentSystems, floodSystem] });
    sim.state.config.rules.weatherSeverity = 'none';
    forceWeather(sim, 'overcast', null, 'test');
    const nest = playerNest(sim);
    for (const c of nest.chambers) placeWorker(sim, { ...c.center }, { x: 1, y: 0, z: 0 }, nest.id);
    const deaths: string[] = [];
    let submerged = 0, wetSteps = 0, rainTicks = 0;
    sim.events.on('ant-died', (e) => deaths.push(e.cause));
    sim.events.on('ant-submerged', () => { submerged++; });
    const days = 3 * 6000;
    for (let t = 0; t < days; t += 10) {
      run(sim, 10);
      if (sim.state.env.weather.rainRateMmH > 0) rainTicks++;
      if (nest.flood.water > 0 || nest.chambers.some((c) => c.flooded > 0)) wetSteps++;
    }
    expect(rainTicks).toBe(0);
    expect(wetSteps).toBe(0);
    expect(submerged).toBe(0);
    expect(deaths.filter((d) => d === 'drowning')).toEqual([]);
  }, 60_000);
});

describe('invariant 2: a flood-safe site floods in no ordinary shower', () => {
  it('the hydrology factor is the smallest on every risk the static map calls flood-safe, 1 on sloped, 4 in a hollow', () => {
    expect(floodFactorOf(FLOOD_HYDRO_SAFE_RISK)).toBeCloseTo(RAISED, 9);
    for (const r of [0, 0.1, 0.2, FLOOD_HYDRO_SAFE_RISK]) expect(hydroFactorOf(r)).toBe(FLOOD_HYDRO_SAFE_FACTOR);
    expect(hydroFactorOf(FLOOD_HYDRO_NEUTRAL_RISK)).toBeCloseTo(1, 9);
    let last = 0;
    for (let r = 0; r <= 1.0001; r += 0.05) { expect(hydroFactorOf(r)).toBeGreaterThanOrEqual(last); last = hydroFactorOf(r); }
    expect(hydroFactorOf(1)).toBeCloseTo(4, 9);
  });

  it('an ordinary shower on the least safe flood-safe site (risk at the boundary): brood and royal chambers under 25 %', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    sim.world.maps.floodRisk.data.fill(Math.floor(FLOOD_HYDRO_SAFE_RISK * 255));
    const nest = playerNest(sim);
    const e = nest.entrances[0];
    expect(floodFactorOf(sim.world.maps.floodRisk.data[0] / 255)).toBeGreaterThanOrEqual(RAISED);
    expect(catchmentOf(sim, e)).toBeCloseTo(FLOOD_HYDRO_SAFE_FACTOR, 6); // flat ring (c = 1) on a raised site: x SAFE_FACTOR
    const pred = predictRain(sim, nest, SHOWER_I, SHOWER_S);
    for (const c of nest.chambers) if (BROOD.has(c.type)) expect(pred.chambers.get(c.id)!).toBeLessThan(FLOOD_ALERT_FRACTION);
    // and the same through the running flood model
    const q = placeWorker(sim, { ...nest.chambers[2].center }, { x: 1, y: 0, z: 0 }, nest.id);
    floodCheats(sim.state).rainI = SHOWER_I;
    run(sim, SHOWER_S * 10);
    floodCheats(sim.state).rainI = 0;
    run(sim, 500);
    for (const c of nest.chambers) if (BROOD.has(c.type)) expect(c.flooded).toBeLessThan(FLOOD_ALERT_FRACTION);
    expect(q.alive).toBe(true);
    expect(q.hp).toBe(q.maxHp);
  });
});

describe('invariant 3: a sealed founding cell takes water only by seepage', () => {
  it('rain of every class adds nothing; saturated subsoil adds exactly the seepage', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    const nest = playerNest(sim);
    nest.founding = { state: 'sealed', readiness: 1, cavitySeed: { ...nest.chambers[2].center }, abandoned: [], readyTick: 0, sealedTick: 0 };
    nest.entrances[0].status = 'sealed';
    setMoisture(sim, 0.5);
    for (const I of [0.1, 0.4, 0.7, 1]) expect(nestInflow(sim, nest, undefined, I)).toBe(0);
    floodCheats(sim.state).rainI = 1;
    run(sim, 1000);
    expect(nest.flood.water).toBe(0);
    setMoisture(sim, 0.95);
    const seep = nestInflow(sim, nest);
    expect(seep).toBeGreaterThan(0);
    run(sim, 10);
    expect(nest.flood.water).toBeGreaterThan(0);
    expect(nest.flood.water).toBeLessThanOrEqual(seep * 1 + 1e-9);
  });
});

describe('invariant 4: recession after rain', () => {
  it('each dry flood step removes K_DRAIN x A_wet x (1 - 0.7 m) of water until the nest is dry', () => {
    const sim = makeTestSim({ nest: 'small', systems: [commandsSystem, floodSystem] });
    const nest = playerNest(sim);
    setMoisture(sim, 0.4);
    floodCheats(sim.state).rainI = 1;
    run(sim, 300);
    floodCheats(sim.state).rainI = 0;
    run(sim, 60); // past any geometry freeze
    const cache = spillFor(sim, nest);
    const m = moistureAt(sim, nest.origin);
    for (let s = 0; s < 20; s++) {
      const w0 = nest.flood.water, n = floodedCount(cache, w0);
      // the test nest's walls are loam (A_wet = wet wall samples x 0.25 BU^2): K_loam x A_wet x (1 - 0.7 m)
      expect(cache.cumKA[n]).toBeCloseTo(FLOOD_K_DRAIN.loam! * cache.cumWall[n], 9);
      const expected = FLOOD_K_DRAIN.loam! * cache.cumWall[n] * (1 - FLOOD_DRAIN_MOIST_K * m);
      run(sim, 10);
      expect(w0 - nest.flood.water).toBeCloseTo(Math.min(w0, expected), 6);
    }
  });
});
