// Adversarial review of the weather effects (weather-effects review). Tests that FAIL here demonstrate a defect and
// are left for the fixer; passing ones are regression tests.

import { describe, expect, it } from 'vitest';
import type { Sim } from '@/sim/types';
import { STORM_RAIN_MMH } from '@/sim/balance';
import { spawnAnt } from '@/sim/entities';
import { makeTestSim, makeTestWorld } from '@/sim/testing';
import { isExposedAt } from './effectsExposure';
import { rainHitStep, washStep } from './effectsRain';
import { forceWeather } from './weather';
import { stepCell, type CellState } from './moistureCell';

/** A test world whose ground is flat at `groundMm` (no noise). */
function flatSim(groundMm: number): Sim {
  const world = makeTestWorld({});
  world.terrain.data.fill(groundMm);
  world.queenStart.pos = { ...world.queenStart.pos, y: groundMm };
  return makeTestSim({ world, systems: [] });
}

function storm(sim: Sim): void {
  forceWeather(sim, 'storm', null, 'test');
  sim.state.env.weather.rainRateMmH = STORM_RAIN_MMH;
  sim.state.env.weather.wind2m = 0;
}

describe('review: rain washing on ground that is not at y = 0 (GDD 06 §3.7)', () => {
  // A trail laid on the ground lands in the pheromone cell that contains the ground; its CENTRE (what washExposed
  // tests) can lie up to half a cell (2 BU = 8 mm for Lasius) below the ground surface. The exposure test treats
  // anything more than UNDERGROUND_MM (2 mm) below the ground as underground, so such cells are never washed.
  for (const groundMm of [0, 13, 30, 61]) {
    it(`an open-ground trail cell is washed by a storm with the ground at ${groundMm} mm`, () => {
      const sim = flatSim(groundMm);
      const bu = sim.world.bu, c = sim.world.size / 2;
      const p = { x: c - 10 * bu, y: groundMm + 0.3 * bu, z: c };
      expect(sim.field.height(p.x, p.z)).toBeCloseTo(groundMm, 3);
      sim.phero.deposit(0, 'trail', p, 1);
      const v0 = sim.phero.sampleCell!(0, 'trail', p);
      expect(v0).toBeGreaterThan(0);
      storm(sim);
      for (let s = 0; s < 12; s++) washStep(sim, 1); // storm half-life about 6 s
      expect(sim.phero.sampleCell!(0, 'trail', p) / v0).toBeLessThan(0.4);
    });
  }

  it('an ant standing on open ground at any ground height is exposed', () => {
    for (const groundMm of [0, 13, 30, 61]) {
      const sim = flatSim(groundMm);
      const bu = sim.world.bu, c = sim.world.size / 2;
      expect(isExposedAt(sim, c, groundMm + 0.3 * bu, c)).toBe(true);
    }
  });
});

describe('review: raindrop hit statistics (GDD 06 §3.3)', () => {
  it('a shower hits exposed ants at 0.02 per s, never harms them, and the draws are deterministic', () => {
    const counts: number[] = [];
    for (let r = 0; r < 2; r++) {
      const sim = flatSim(0);
      const bu = sim.world.bu, c = sim.world.size / 2;
      for (let i = 0; i < 200; i++) {
        spawnAnt(sim, { colony: sim.state.colonies[0].id, caste: 'worker', pos: { x: c - 40 * bu + (i % 20) * 4 * bu, y: 0.3 * bu, z: c - 30 * bu + Math.floor(i / 20) * 4 * bu }, fwd: { x: 1, y: 0, z: 0 }, ageGd: 5 });
      }
      forceWeather(sim, 'rain', 'shower', 'test');
      sim.state.env.weather.rainRateMmH = 5;
      sim.state.env.weather.wind2m = 0;
      let hits = 0;
      for (let s = 0; s < 200; s++) hits += rainHitStep(sim).hits; // 100 game s
      counts.push(hits);
      expect(sim.stores.ants.list.every((a) => a.hp === a.maxHp)).toBe(true);
    }
    // 200 ants x 100 s x 0.02 = 400 expected (Poisson sd 20)
    expect(counts[0]).toBeGreaterThan(330);
    expect(counts[0]).toBeLessThan(470);
    expect(counts[1]).toBe(counts[0]);
  });
});

describe('review: soil moisture cell edge cases (GDD 06 §3.9)', () => {
  const loam = { tex: 'loam' as const, icap: 20, permeable: 1, shade: 0, litter: 0, veg: false, natural: true, puddleCapMm: 0 };
  const inputs = { dtH: 0.2, rainMmH: 0, evapIdx: 0.45, insolation: 0.9, dewLevel: 0, growing: true, frozen: false };

  it('never leaves 0..1 or produces NaN for extreme inputs', () => {
    for (const rain of [0, 1, 30, 500]) for (const t0 of [0, 0.5, 1]) for (const t1 of [0, 0.5, 1]) {
      const s: CellState = { theta0: t0, theta1: t1, puddleMm: 0 };
      for (let k = 0; k < 50; k++) stepCell(loam, { ...inputs, rainMmH: rain }, s);
      for (const v of [s.theta0, s.theta1]) { expect(Number.isFinite(v)).toBe(true); expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(1); }
    }
  });

  it('the puddle store on impermeable paving: fill 0.5 x runoff, loss (E0 + 0.4) mm/h, clamped to capacity', () => {
    const paving = { ...loam, icap: 0, permeable: 0, natural: false, puddleCapMm: 6 };
    const s: CellState = { theta0: 0, theta1: 0, puddleMm: 0 };
    // one hour of a 5 mm/h shower, no evaporation drive (night): 2.5 mm stored, minus 0.4 mm drained, minus E0 at
    // evapIdx 0.05 on a water surface (0.35 x 0.05 = 0.0175 mm/h)
    for (let k = 0; k < 5; k++) stepCell(paving, { ...inputs, rainMmH: 5, evapIdx: 0.05, insolation: 0 }, s);
    expect(s.puddleMm).toBeCloseTo(2.5 - 0.4 - 0.0175, 2);
    for (let k = 0; k < 50; k++) stepCell(paving, { ...inputs, rainMmH: 30, evapIdx: 0.05, insolation: 0 }, s);
    expect(s.puddleMm).toBe(6);
  });
});
