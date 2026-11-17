// Seed cohorts, milling and paste (GDD 07 §6.3.3-6.3.6; App. E 15, 16, 17, 18) as pure model steps.

import { describe, expect, it } from 'vitest';
import type { GranaryModule, GranaryState } from '@/sim/types';
import { MESSOR_BARBARUS } from '@/sim/species';
import { granaryParams } from './params';
import { addSeeds, germTempFactor, gnawLoads, seedClassOf, stepCohorts, totalsOf } from './cohorts';
import { decayPaste, millLoads, millSecondsPerLoad } from './paste';

const g = granaryParams(MESSOR_BARBARUS)!;

function granary(): GranaryState {
  return { chamberId: 1, cohorts: [], capacityLoads: 1600, humidity: 0, tempC: 20 };
}

function mod(): GranaryModule {
  return { granaries: [], pasteLoads: 0, pasteHalfLifeTicks: 0, middens: [], seedlings: [] };
}

/** Runs the cohort model for `gd` game days in 2.5 s steps; `care(dt)` may gnaw in between. Returns rotten loads. */
function run(gr: GranaryState, humidity: number, tempC: number, gd: number, care?: (dtGd: number) => void): number {
  const dt = 25 / 6000;
  let rotten = 0;
  for (let t = 0; t < gd - 1e-9; t += dt) {
    rotten += stepCohorts(gr, g, humidity, tempC, dt).rotten;
    care?.(dt);
  }
  return rotten;
}

describe('granary cohorts (GDD 07 §6.3.4)', () => {
  it('E15: a damp granary (h 0.9, 20 °C) with 100 M loads at u 0.9 sprouts or rots >= 95 loads in 0.8 GD', () => {
    const gr = granary();
    addSeeds(gr, g, 'M', 0.4, 100, 0.9, 0);
    const rotten = run(gr, 0.9, 20, 0.8);
    const t = totalsOf(gr);
    expect(t.sprouted + rotten).toBeGreaterThanOrEqual(95);
  });

  it('E15: with 4 care workers gnawing (5 s per load each) 0 loads are sprouted after 0.8 GD', () => {
    const gr = granary();
    addSeeds(gr, g, 'M', 0.4, 100, 0.9, 0);
    const workers = 4;
    let budgetS = 0;
    run(gr, 0.9, 20, 0.8, (dtGd) => {
      budgetS += workers * dtGd * 600;
      const loads = Math.floor(budgetS / g.gnawRadicleS);
      if (loads > 0) budgetS -= gnawLoads(gr, g, loads, false) * g.gnawRadicleS;
      if (budgetS > 600) budgetS = 600; // idle workers do not bank time
    });
    expect(totalsOf(gr).sprouted).toBe(0);
    expect(totalsOf(gr).loads).toBeGreaterThan(99);
  });

  it('E16: a dry granary (h 0.3) holding 100 loads has 0 damp, sprouted or rotten after 10 GD', () => {
    const gr = granary();
    addSeeds(gr, g, 'M', 0.4, 100, g.seedUArriving, 0);
    const rotten = run(gr, 0.3, 20, 10);
    const t = totalsOf(gr);
    expect(rotten).toBe(0);
    expect(t.damp + t.germinating + t.sprouted + t.rotting).toBe(0);
    expect(t.stored).toBeCloseTo(100, 6);
  });

  it('rot: u above 0.75 for a full GD starts losing 10 % of the loads per GD', () => {
    const gr = granary();
    addSeeds(gr, g, 'M', 0.4, 100, 0.9, 0, true); // degermed: rot only
    const rotten = run(gr, 0.9, 20, 2);
    expect(rotten).toBeGreaterThan(8);
    expect(rotten).toBeLessThan(12);
  });

  it('germination temperature factor: 0 at 8 °C, 1 at 20 °C, 1.2 at 30 °C', () => {
    expect(germTempFactor(g, 8)).toBe(0);
    expect(germTempFactor(g, 20)).toBeCloseTo(1, 9);
    expect(germTempFactor(g, 30)).toBeCloseTo(1.2, 9);
  });

  it('merging keeps load-weighted moisture; seed classes from loads', () => {
    const gr = granary();
    addSeeds(gr, g, 'S', 0.2, 10, 0.3, 0);
    addSeeds(gr, g, 'S', 0.25, 30, 0.7, 0);
    expect(gr.cohorts.length).toBe(1);
    expect(gr.cohorts[0].u).toBeCloseTo(0.6, 9);
    expect(seedClassOf(g, 0.2)).toBe('S');
    expect(seedClassOf(g, 1.0)).toBe('M');
    expect(seedClassOf(g, 2.5)).toBe('L');
  });
});

describe('milling and paste (GDD 07 §6.3.6)', () => {
  it('E17: a major mills 10 loads of hardness 0.5 in 360 s into 8.0 paste and 2.0 chaff', () => {
    const gr = granary();
    const m = mod();
    addSeeds(gr, g, 'M', 0.5, 10, 0.3, 0);
    const c = gr.cohorts[0];
    const major = { caste: 'major' as const, lengthBu: 1.55 };
    expect(millSecondsPerLoad(g, major, c) * 10).toBeCloseTo(360, 6);
    const out = millLoads(m, gr, g, c, 10);
    expect(out.paste).toBeCloseTo(8, 9);
    expect(out.chaff).toBeCloseTo(2, 9);
    expect(m.pasteLoads).toBeCloseTo(8, 9);
  });

  it('only large media crack soft seed (x2 time), minors only sprouted seed', () => {
    const gr = granary();
    addSeeds(gr, g, 'M', 0.5, 10, 0.3, 0);
    const c = gr.cohorts[0];
    expect(millSecondsPerLoad(g, { caste: 'media', lengthBu: 1.25 }, c)).toBeCloseTo(72, 6);
    expect(millSecondsPerLoad(g, { caste: 'media', lengthBu: 1.0 }, c)).toBe(Infinity);
    expect(millSecondsPerLoad(g, { caste: 'minor', lengthBu: 0.7 }, c)).toBe(Infinity);
    c.state = 'sprouted';
    expect(millSecondsPerLoad(g, { caste: 'minor', lengthBu: 0.7 }, c)).toBeCloseTo(36 * g.sproutedMillTimeMult, 6);
  });

  it('E18: 100 paste loads unconsumed keep 50 +- 1 after 3 GD', () => {
    const m = mod();
    m.pasteLoads = 100;
    for (let i = 0; i < 3 * 240; i++) decayPaste(m, g, 1 / 240);
    expect(m.pasteLoads).toBeGreaterThan(49);
    expect(m.pasteLoads).toBeLessThan(51);
  });
});
