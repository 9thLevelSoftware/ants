// The aggregate winter model against GDD 06 §6.3 and App. E 20: three scripted colonies (well stocked, marginal,
// starving) with the chapter's formulas recomputed by hand, plus the fungal outbreak, floods and determinism.
import { describe, expect, it } from 'vitest';
import { rngSeed } from '@/core/rng';
import { LASIUS_NIGER } from '@/sim/species/data/lasius-niger';
import { dayNeedC, dayNeedP, metFactor, runWinterModel, type WinterInput, type WinterParams } from './model';

const P: WinterParams = {
  tColdStress: LASIUS_NIGER.winter.tColdStress, baseLoss: LASIUS_NIGER.winter.wintBaseLoss,
  metBase: LASIUS_NIGER.winter.wintMetBase, q10: LASIUS_NIGER.winter.wintQ10, lossMult: 1, queenDeathP: 0.03,
  pFungus: 0, floodK: 0,
};

function input(o: Partial<Omit<WinterInput, 'tMin'>> & { t?: number; tMin?: number }): WinterInput {
  const days = 7;
  const { t, tMin, ...rest } = o;
  return {
    workers: 18, oldWorkers: 0, larvae: 20, pupae: 0, c: 10, p: 4, queenAlive: true,
    tMean: Array(days).fill(t ?? 5), tMin: Array(days).fill(tMin ?? 4), frost: Array(days).fill(false),
    rainMm: Array(days).fill(0), floodSafety: 1, humidity: 0.7, ...rest,
  };
}

/** The chapter's C consumption by hand: day by day, the population shrinking by the base loss only. */
function handC(w: number, l: number, t: number, days: number): number {
  const f = 0.35 * Math.pow(2.2, (t - 6) / 10);
  const dw = 1 - Math.pow(1 - 0.06, 1 / days), dl = 1 - Math.pow(1 - 0.1, 1 / days);
  let c = 0;
  for (let g = 0; g < days; g++) {
    c += (w * 0.08 + 0.3 + 0.02 * l) * f;
    w *= 1 - dw;
    l *= 1 - dl;
  }
  return c;
}

describe('winter model (GDD 06 §6.3)', () => {
  it('formulas: fMet and the daily needs', () => {
    expect(metFactor(P, 6)).toBeCloseTo(0.35, 6);
    expect(metFactor(P, 16)).toBeCloseTo(0.35 * 2.2, 6);
    expect(dayNeedC(18, 20, true, 1)).toBeCloseTo(18 * 0.08 + 0.3 + 0.4, 6);
    expect(dayNeedP(20, true, 1)).toBeCloseTo(0.1 + 0.2, 6);
    expect(dayNeedC(18, 20, false, 1)).toBeCloseTo(18 * 0.08 + 0.4, 6);
  });

  it('App. E 20 well stocked: 18 workers, 20 larvae, C 10 / P 4, nest minimum 4 C', () => {
    const out = runWinterModel(input({}), P, rngSeed(7));
    expect(out.workers1).toBeGreaterThanOrEqual(15);
    expect(out.workers1).toBeLessThanOrEqual(18);
    expect(out.expectedLosses['old-age']).toBeCloseTo(18 * 0.06, 6); // base loss 6 %
    expect(out.expectedLosses.cold ?? 0).toBe(0); // 4 C is above T_COLD_STRESS 2 C
    const fall = 10 - out.c1;
    expect(Math.abs(fall - 5.2)).toBeLessThanOrEqual(1.5);
    expect(fall).toBeCloseTo(handC(18, 20, 5, 7), 6);
    expect(out.queenAlive || out.queenCause !== '').toBe(true);
    expect(out.days).toHaveLength(7);
  });

  it('marginal: C runs out late in the winter, starvation only on the short days', () => {
    const out = runWinterModel(input({ c: 3.5, p: 4 }), P, rngSeed(7));
    expect(out.c1).toBe(0);
    expect(out.starvedDays).toBeGreaterThan(0);
    expect(out.starvedDays).toBeLessThan(5);
    const starve = out.expectedLosses.starvation ?? 0;
    expect(starve).toBeGreaterThan(0);
    // workers 0.12 per GD of shortage at most
    expect(starve).toBeLessThanOrEqual(18 * 0.12 * out.starvedDays + 1e-9);
    expect(out.workers1).toBeLessThan(18);
  });

  it('App. E 20 starving: with C 0 at Begin workers fall by at least 50 %, brood is eaten, the queen starves', () => {
    const out = runWinterModel(input({ c: 0, p: 0 }), P, rngSeed(7));
    expect(out.workers1).toBeLessThanOrEqual(9);
    const exp = 18 * (1 - Math.pow(1 - 0.12, 7));
    expect(out.expectedLosses.starvation).toBeGreaterThan(exp * 0.95); // compounded with the base loss
    expect(out.expectedBroodLosses.cannibalised).toBeGreaterThan(0);
    expect(out.queenAlive).toBe(false);
    expect(out.queenCause).toBe('starvation');
  });

  it('cold stress: 0.008 per GD per degree below 2 C, capped at 0.6', () => {
    const out = runWinterModel(input({ t: 0, tMin: -1 }), P, rngSeed(3));
    const W = 18;
    expect(out.coldStress).toBeCloseTo(7 * 0.008 * 3, 6);
    expect(out.expectedLosses.cold).toBeGreaterThan(W * out.coldStress * 0.85);
    const deep = runWinterModel(input({ t: -60, tMin: -80 }), P, rngSeed(3));
    expect(deep.coldStress).toBeCloseTo(0.6, 6);
  });

  it('difficulty multiplies every loss', () => {
    const a = runWinterModel(input({}), P, rngSeed(1));
    const b = runWinterModel(input({}), { ...P, lossMult: 1.5 }, rngSeed(1));
    expect(b.expectedLosses['old-age']).toBeGreaterThan(a.expectedLosses['old-age']);
  });

  it('fungus (x3 when humid) and floods remove workers and larvae', () => {
    const f = runWinterModel(input({ humidity: 0.95 }), { ...P, pFungus: 1 }, rngSeed(2));
    expect(f.disease).toBe(true);
    expect(f.expectedLosses.disease).toBeGreaterThan(0);
    const fl = runWinterModel(input({ rainMm: Array(7).fill(16), floodSafety: 0 }), { ...P, floodK: 1 }, rngSeed(2));
    expect(fl.floods).toBeGreaterThan(0);
    expect(fl.expectedLosses.drowning).toBeGreaterThan(0);
  });

  it('is deterministic for a seed', () => {
    const a = runWinterModel(input({ c: 2 }), { ...P, pFungus: 0.5, floodK: 0.3 }, rngSeed(11));
    const b = runWinterModel(input({ c: 2 }), { ...P, pFungus: 0.5, floodK: 0.3 }, rngSeed(11));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
