// GDD 06 §5.12 founding model: App. E checks 18 (outcome distribution) and 19 (lapse timing), the forecast of
// §5.10, and the mu(Q) rule. A Monte Carlo of the pure model (the running game applies the same rules to real
// brood records: lapse.test.ts checks it against these numbers).
import { describe, expect, it } from 'vitest';
import { requireSpecies } from '@/sim/species';
import { BROOD_SURVIVAL } from '@/sim/balance';
import { colonyBaseHazardPerGd, devTimeGd, forecast, foundingMu, modelStats, runModel } from './model';

const def = requireSpecies('lasius-niger');

function stats(q: number, clutch: number, seeds = 200) {
  const runs = [];
  for (let s = 1; s <= seeds; s++) runs.push(runModel({ def, q, tempC: 19.5, clutch, seed: s }));
  return modelStats(runs);
}

describe('founding model (GDD 06 §5.12)', () => {
  it('mu(Q): 0.42 (1.1 - Q) clamped to [0.06, 0.60], dry soil raises it', () => {
    expect(foundingMu(0.7, 'lasius-niger')).toBeCloseTo(0.168, 6);
    expect(foundingMu(1.0, 'lasius-niger')).toBeCloseTo(0.06, 6);
    expect(foundingMu(0, 'lasius-niger')).toBeCloseTo(0.462, 6);
    expect(foundingMu(0.7, 'camponotus-pennsylvanicus')).toBeCloseTo(0.168 * 0.55, 6);
    expect(foundingMu(0.7, 'lasius-niger', 1, 0)).toBeCloseTo(0.168 * 3, 6);
  });

  it('egg to worker takes 4.52 GD at 19.5 C (3.9 GD at 21 C)', () => {
    expect(Math.abs(devTimeGd(def, 19.5) - 4.52)).toBeLessThan(0.01);
    expect(Math.abs(devTimeGd(def, 21) - 3.9)).toBeLessThan(0.01);
  });

  it('the colony base hazard averaged over development matches its per-stage survival', () => {
    const total = -Math.log(BROOD_SURVIVAL.egg * BROOD_SURVIVAL.larva * BROOD_SURVIVAL.pupa);
    expect(colonyBaseHazardPerGd(def, 19.5) * devTimeGd(def, 19.5)).toBeCloseTo(total, 6);
  });

  it('E18: Q 0.7, 19.5 C, R0 56, clutch 24, 200 seeds: mean 11.5 +- 1.5, p10 ~8, p90 ~15, no queen deaths', () => {
    const s = stats(0.7, 24);
    expect(Math.abs(s.meanWorkers - 11.5)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(s.p10 - 8)).toBeLessThanOrEqual(1);
    expect(Math.abs(s.p90 - 15)).toBeLessThanOrEqual(1);
    expect(s.queenDeathRate).toBe(0);
    // E19 in the model: first eclosion 4.52 +- 0.1 GD after the first egg
    expect(Math.abs(s.meanFirstEclosionGd - 4.52)).toBeLessThanOrEqual(0.1);
  });

  it('E18: clutch 48 at Q 0.7 kills the queen in 50-80 % of runs; at Q 0.9 in more than 90 %', () => {
    const a = stats(0.7, 48);
    expect(a.queenDeathRate).toBeGreaterThanOrEqual(0.5);
    expect(a.queenDeathRate).toBeLessThanOrEqual(0.8);
    expect(stats(0.9, 48).queenDeathRate).toBeGreaterThan(0.9);
  });

  it('a poor site yields fewer workers than a good one (same clutch)', () => {
    expect(stats(0.3, 24, 60).meanWorkers).toBeLessThan(stats(0.8, 24, 60).meanWorkers - 3);
  });

  it('forecast: E = N exp(-mu Tdev) as a 0.7-1.3 range; reserves at first worker; safe band', () => {
    const f = forecast(def, 24, 19.5, 0.7);
    expect(f.expected).toBeCloseTo(24 * Math.exp(-0.168 * devTimeGd(def, 19.5)), 6);
    expect(f.range).toEqual([Math.round(0.7 * f.expected), Math.round(1.3 * f.expected)]);
    // GDD 06 §5.4 calibration: a good site with a 24-egg clutch ends with about 0.4 left
    expect(f.reserves).toBeGreaterThan(0.3);
    expect(f.reserves).toBeLessThan(0.5);
    expect(f.safeEggs).toBeGreaterThan(24);
    expect(f.safeEggs).toBeLessThan(48);
  });
});
