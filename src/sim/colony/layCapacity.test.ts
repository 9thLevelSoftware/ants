// R29 (colony-life, integrator ruling Nov 18 07:25): the queen lays what the colony can raise.
//  - care factor: laying potential x clamp(1 - careNeed / nurseCapable, 0, 1), careNeed = brood in care at the
//    design's care rates (eggs / 25 + pupae / 15 + larval food rate / 4.5), nurseCapable = available workers less
//    the queen-care demand (not the nurse target, which GDD 02 §6.3 halves when demand exceeds the workforce);
//  - finish factor: no laying while an egg laid now cannot become a worker before the winter at the forecast
//    temperature of the queen's chamber.

import { describe, expect, it } from 'vitest';
import { TICKS_PER_DAY } from '@/sim/time';
import { addBrood, addChamber, addWorkers, careSystem, colonyOf, establishQueen, makeColonySim, step } from './testkit';
import type { ClimateOverride } from './envAdapter';
import { careFactor, finishFactor, layingFactors, nurseCapable } from './queen';
import { cycleCensus } from './census';
import { ti } from './taskIdx';

function setup(workers: number, climate: ClimateOverride = {}) {
  // summer day 3 = doy 10 (d28 9.x): fSeason 1, chambers at 25 °C unless the climate says otherwise
  const sim = makeColonySim({ summerDay: 3, climate, extra: [careSystem({})] });
  const royal = addChamber(sim, 'royal', { x: 100, y: -40, z: 100 }, 400);
  const q = establishQueen(sim, royal);
  addWorkers(sim, workers, { chamber: royal });
  step(sim, 120); // a colony cycle and an allocation period (10 s): census snapshot and demand
  return { sim, q, royal, col: colonyOf(sim) };
}

describe('R29 care factor', () => {
  it('no brood: factor 1, the potential is GDD 02 §3.2 unchanged', () => {
    const { sim, q, col } = setup(12);
    const f = layingFactors(sim, col, q, sim.species);
    expect(f.care).toBe(1);
    expect(f.potential).toBeCloseTo(f.ref * f.season * f.temp * f.health * f.cap * f.finish, 9);
  });

  it('50 eggs and 30 pupae with 12 workers: need 2 + 2 of 12 - 2 queen-care = 10 nurse-capable -> 0.6', () => {
    const { sim, q, royal, col } = setup(12);
    addBrood(sim, 'egg', 50, royal);
    addBrood(sim, 'pupa', 30, royal);
    step(sim, 120);
    const cen = cycleCensus(sim, col);
    expect(col.alloc.demand[ti('queen-care')]).toBe(2);
    expect(nurseCapable(col, cen)).toBe(10);
    expect(careFactor(sim, col, cen)).toBeCloseTo(0.6, 6);
    expect(layingFactors(sim, col, q, sim.species).care).toBeCloseTo(0.6, 6);
  });

  it('the nurse-capable workforce, not the halved nurse target, sets the ceiling', () => {
    // demand far above 12 workers (a large foraging demand): GDD 02 §6.3 halves the nurse target, R29 does not
    const { sim, col, royal } = setup(12);
    addBrood(sim, 'egg', 75, royal); // 3 nurse-equivalents
    step(sim, 120);
    const cen = cycleCensus(sim, col);
    expect(careFactor(sim, col, cen)).toBeCloseTo(1 - 3 / 10, 6);
  });

  it('brood in care at the nurse-capable ceiling: potential 0, and the queen lays no egg with protein in her gut', () => {
    const { sim, q, royal, col } = setup(12);
    addBrood(sim, 'egg', 250, royal); // 10 nurse-equivalents = 12 - 2
    step(sim, 120);
    const f = layingFactors(sim, col, q, sim.species);
    expect(f.care).toBe(0);
    expect(f.potential).toBe(0);
    q.queen!.eggBudget = 0;
    let eggs = 0;
    sim.events.on('egg-laid', () => eggs++);
    for (let t = 0; t < TICKS_PER_DAY / 4; t++) {
      q.queen!.gut.p = Math.max(q.queen!.gut.p, 0.5);
      sim.tick();
    }
    expect(eggs).toBe(0);
  });

  it('a queen with no workers is not held by the care factor (GDD 02 §3.4 clutch)', () => {
    const { sim, q, col } = setup(0);
    expect(layingFactors(sim, col, q, sim.species).care).toBe(1);
  });
});

describe('R29 finish factor (eggs that cannot finish before the winter are not laid)', () => {
  it('mid-summer at 25 °C: an egg finishes (1)', () => {
    const { sim, q } = setup(12);
    expect(finishFactor(sim, q, sim.species, 9.2)).toBe(1);
  });

  it('at 21 °C (r = 1, egg + larva 2.0 DU, egg to adult 3.9 DU): day 15.9 finishes, day 16.1 does not (diapause from day 18)', () => {
    const { sim, q } = setup(12, { chamberTemp: () => 21 });
    expect(finishFactor(sim, q, sim.species, 15.9)).toBe(1);
    expect(finishFactor(sim, q, sim.species, 16.1)).toBe(0);
  });

  it('the forecast decides: a chamber forecast to cool below 12 °C stops laying although it is warm now', () => {
    const { sim, q } = setup(12, { chamberTemp: () => 22, chamberForecast: (_id, d28) => (d28 < 11 ? 22 : 11) });
    expect(finishFactor(sim, q, sim.species, 9.2)).toBe(0); // the larva would meet 11 °C (diapause) before pupating
    expect(finishFactor(sim, q, sim.species, 5)).toBe(1);
  });

  it('a late-summer colony stops laying: potential 0 at d28 17 with the queen fed', () => {
    const { sim, q, col } = setup(12, { chamberTemp: () => 21, d28: () => 17 });
    const f = layingFactors(sim, col, q, sim.species);
    expect(f.season).toBeGreaterThan(0);
    expect(f.finish).toBe(0);
    expect(f.potential).toBe(0);
  });
});
