// Weather effects on exposed things (GDD 06 §3.3-3.4, §3.7, App. E10): exposure, trail washing by rain class,
// raindrop hits and stem topple, the heat-exposure diagnostic, the water-body cheat.

import { describe, expect, it } from 'vitest';
import type { Primitive, RainClass, Sim, WeatherState } from '@/sim/types';
import { PrimFlag } from '@/sim/types';
import { RAIN_RATE_MMH, STORM_RAIN_MMH } from '@/sim/balance';
import { spawnAnt } from '@/sim/entities';
import { makeTestSim } from '@/sim/testing';
import { getDiagnostic } from '@/sim/progression';
import { exposedNow, exposureCacheColumns, isExposedAt, resetExposureCache } from './effectsExposure';
import { heatExposure, publishHeatDiagnostic } from './effectsHeat';
import { rainHitStep, washStep } from './effectsRain';
import { forceWeather } from './weather';
import { weatherEffectsHandlers } from './effects';

function stone(sim0Size: number, bu: number): Primitive {
  const c = sim0Size / 2;
  return {
    id: 1, shape: 'ellipsoid', pos: { x: c + 20 * bu, y: 1.5 * bu, z: c }, rot: { x: 0, y: 0, z: 0, w: 1 },
    size: { x: 6 * bu, y: 1 * bu, z: 6 * bu }, round: 0, material: 'stone', flags: PrimFlag.SHELTER, objectId: -1,
  };
}

/** A flat test world with a stone slab raised 1.5 BU above the ground 20 BU east of the centre. */
function effectsSim(): Sim {
  const probe = makeTestSim({ systems: [] });
  const bu = probe.world.bu;
  return makeTestSim({ systems: [], prims: [stone(probe.world.size, bu)] });
}

function rain(sim: Sim, state: WeatherState, cls: RainClass | null): void {
  forceWeather(sim, state, cls, 'test');
  const w = sim.state.env.weather;
  w.rainRateMmH = state === 'storm' ? STORM_RAIN_MMH : cls ? RAIN_RATE_MMH[cls] : 0;
  w.wind2m = 0;
}

describe('exposure (GDD 06 §3.3)', () => {
  it('open ground is exposed; under a stone, underground and above-ground-cached cells are not', () => {
    const sim = effectsSim();
    const bu = sim.world.bu, c = sim.world.size / 2;
    expect(exposedNow(sim, c, 0.5 * bu, c)).toBe(true);
    expect(isExposedAt(sim, c, 0.5 * bu, c)).toBe(true);
    expect(exposedNow(sim, c + 20 * bu, 0.2 * bu, c)).toBe(false);
    expect(isExposedAt(sim, c + 20 * bu, 0.2 * bu, c)).toBe(false);
    expect(isExposedAt(sim, c, -5 * bu, c)).toBe(false);
  });

  it('a carve drops only the cached columns near its change box, and the warm cache agrees with a cold one', () => {
    const sim = effectsSim();
    const bu = sim.world.bu, c = sim.world.size / 2;
    const pts: { x: number; y: number; z: number }[] = [];
    for (let i = -12; i <= 12; i++) for (let k = -12; k <= 12; k++) pts.push({ x: c + i * 2 * bu, y: 0.3 * bu, z: c + k * 2 * bu });
    for (const p of pts) isExposedAt(sim, p.x, p.y, p.z);
    const warm = exposureCacheColumns(sim);
    expect(warm).toBe(pts.length);
    sim.carve.carveSphere({ x: c - 20 * bu, y: -3 * bu, z: c - 20 * bu }, 1.5 * bu); // an underground bite
    const after = exposureCacheColumns(sim);
    expect(after).toBeLessThan(warm);
    expect(after).toBeGreaterThan(warm - 20);
    const cached = pts.map((p) => isExposedAt(sim, p.x, p.y, p.z));
    resetExposureCache(sim);
    expect(pts.map((p) => isExposedAt(sim, p.x, p.y, p.z))).toEqual(cached);
  });
});

describe('GDD 06 App. E10: rain washing of exposed trail cells', () => {
  function trailSim(): { sim: Sim; open: { x: number; y: number; z: number }; covered: { x: number; y: number; z: number } } {
    const sim = effectsSim();
    const bu = sim.world.bu, c = sim.world.size / 2;
    const open = { x: c - 10 * bu, y: 0.5 * bu, z: c };
    const covered = { x: c + 20 * bu, y: 0.2 * bu, z: c };
    sim.phero.deposit(0, 'trail', open, 1);
    sim.phero.deposit(0, 'trail', covered, 1);
    return { sim, open, covered };
  }
  const cell = (sim: Sim, p: { x: number; y: number; z: number }): number => sim.phero.sampleCell!(0, 'trail', p);

  it('a shower halves an exposed cell in 69 +- 3 s; a covered cell is unchanged', () => {
    const { sim, open, covered } = trailSim();
    rain(sim, 'rain', 'shower');
    const v0 = cell(sim, open), c0 = cell(sim, covered);
    expect(v0).toBeGreaterThan(0);
    for (let s = 0; s < 69; s++) washStep(sim, 1);
    expect(cell(sim, open) / v0).toBeGreaterThan(0.45);
    expect(cell(sim, open) / v0).toBeLessThan(0.55);
    expect(cell(sim, covered)).toBe(c0);
  });

  it('a downpour halves it in 17 +- 1 s, a storm in about 6 s', () => {
    const { sim, open } = trailSim();
    rain(sim, 'rain', 'downpour');
    const v0 = cell(sim, open);
    for (let s = 0; s < 17; s++) washStep(sim, 1);
    expect(cell(sim, open) / v0).toBeCloseTo(0.5, 1);
    const t = trailSim();
    rain(t.sim, 'storm', null);
    const s0 = cell(t.sim, t.open);
    for (let s = 0; s < 6; s++) washStep(t.sim, 1);
    expect(cell(t.sim, t.open) / s0).toBeCloseTo(0.5, 1);
  });

  it('drizzle washes slowly (half-life about 6 min); no rain and no wind leaves cells alone', () => {
    const { sim, open } = trailSim();
    rain(sim, 'rain', 'drizzle');
    const v0 = cell(sim, open);
    washStep(sim, 347);
    expect(cell(sim, open) / v0).toBeCloseTo(0.5, 1);
    forceWeather(sim, 'clear', null, 'test');
    sim.state.env.weather.rainRateMmH = 0;
    sim.state.env.weather.wind2m = 0;
    const v1 = cell(sim, open);
    expect(washStep(sim, 10)).toBe(0);
    expect(cell(sim, open)).toBe(v1);
  });
});

describe('raindrop hits and wind (GDD 06 §3.3-3.4)', () => {
  function antsSim(n: number): Sim {
    const sim = effectsSim();
    const bu = sim.world.bu, c = sim.world.size / 2;
    for (let i = 0; i < n; i++) {
      spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: c - 30 * bu + (i % 10) * 3 * bu, y: 0.3 * bu, z: c - 15 * bu + Math.floor(i / 10) * 3 * bu }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
    }
    return sim;
  }

  it('a storm hits exposed ants at 0.25 per s (sampled every 5 ticks) and each hit costs 5 % max hp', () => {
    const sim = antsSim(100);
    rain(sim, 'storm', null);
    let hits = 0;
    for (let s = 0; s < 40; s++) hits += rainHitStep(sim).hits; // 20 game s
    // expected 100 ants x 20 s x 0.25 = 500 (Poisson, +-15 %)
    expect(hits).toBeGreaterThan(400);
    expect(hits).toBeLessThan(600);
    const lost = sim.stores.ants.list.reduce((a, x) => a + (x.maxHp - x.hp) / x.maxHp, 0);
    expect(lost).toBeCloseTo(hits * 0.05, 6);
  });

  it('drizzle never hits; a shower stuns without harm; covered ants are never hit', () => {
    const sim = antsSim(50);
    rain(sim, 'rain', 'drizzle');
    for (let s = 0; s < 40; s++) expect(rainHitStep(sim).hits).toBe(0);
    rain(sim, 'rain', 'shower');
    let hits = 0;
    for (let s = 0; s < 40; s++) hits += rainHitStep(sim).hits;
    expect(hits).toBeGreaterThan(0);
    expect(sim.stores.ants.list.every((a) => a.hp === a.maxHp)).toBe(true);
    expect(sim.stores.ants.list.some((a) => (a.bb['cr.stunUntil'] ?? 0) > sim.state.tick)).toBe(true);
    const bu = sim.world.bu, c = sim.world.size / 2;
    const under = spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: c + 20 * bu, y: 0.3 * bu, z: c }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
    rain(sim, 'storm', null);
    for (let s = 0; s < 200; s++) rainHitStep(sim);
    expect(under.hp).toBe(under.maxHp);
  });

  it('strong ground wind blows ants off stems higher than 8 BU', () => {
    const sim = antsSim(0);
    const bu = sim.world.bu, c = sim.world.size / 2;
    const high = spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: c - 40 * bu, y: 12 * bu, z: c }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
    const low = spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: c - 45 * bu, y: 0.3 * bu, z: c }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
    high.medium = 'surface';
    forceWeather(sim, 'storm', null, 'test');
    sim.state.env.weather.rainRateMmH = 0;
    sim.state.env.weather.wind2m = 30; // ground 6 m/s: p = 0.02 x 4.8 per s
    let blown = 0;
    for (let s = 0; s < 200 && (high.medium as string) !== 'air'; s++) blown += rainHitStep(sim).blownOff;
    expect(blown).toBe(1);
    expect(high.medium).toBe('air');
    expect(low.medium).not.toBe('air');
  });
});

describe('heat exposure diagnostic', () => {
  it('warns when more than 10 % of surface ants run hot and is bad at mass stupor', () => {
    const sim = makeTestSim({ systems: [] });
    const bu = sim.world.bu, c = sim.world.size / 2;
    const ants = [];
    for (let i = 0; i < 10; i++) ants.push(spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: c + i * 2 * bu, y: 0.3 * bu, z: c }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 }));
    for (const a of ants) a.tb = 25;
    publishHeatDiagnostic(sim);
    expect(getDiagnostic(sim, 'diag-heat-exposure')?.status).toBe('ok');
    ants[0].tb = 34; ants[1].tb = 34;
    expect(heatExposure(sim).stressed).toBe(2);
    publishHeatDiagnostic(sim);
    expect(getDiagnostic(sim, 'diag-heat-exposure')?.status).toBe('warn');
    // the founding queen is a surface ant too: 2 of 11 in stupor is over 10 %
    ants[0].thermalState = 'heat-stupor';
    ants[1].thermalState = 'heat-stupor';
    publishHeatDiagnostic(sim);
    expect(getDiagnostic(sim, 'diag-heat-exposure')?.status).toBe('bad');
  });
});

describe('cheat.setWater', () => {
  it('sets a body level within its capacity and refuses unknown bodies', () => {
    const sim = makeTestSim({ systems: [] });
    const rejected: string[] = [];
    sim.events.on('command-rejected', (e) => rejected.push(e.reason));
    weatherEffectsHandlers['cheat.setWater']!(sim, { type: 'cheat.setWater', bodyId: 9999, levelMm: 3 });
    sim.events.flush();
    expect(rejected).toEqual(['unknown-body']);
  });
});
