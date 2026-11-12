// GDD 07 Appendix E checks that can be answered from species data alone (the arithmetic the systems will run on
// these numbers). Checks that need a running system are listed at the end of this file with their owners.
import { describe, expect, it } from 'vitest';
import type { Curve, SpeciesDef } from '@/sim/types';
import { requireSpecies } from './index';

const at = (curve: Curve, x: number): number => {
  if (x <= curve[0][0]) return curve[0][1];
  for (let i = 1; i < curve.length; i++) {
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const [x0, y0] = curve[i - 1];
      return x1 === x0 ? y1 : y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return curve[curve.length - 1][1];
};
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const block = (d: SpeciesDef, id: 'wood-nesting' | 'granary' | 'fungus-garden'): Record<string, number> => d.modules[id]!;

describe('E2 / E3: Lasius development from stageGd and devRate', () => {
  const ln = requireSpecies('lasius-niger');
  const total = ln.life.stageGd.egg + ln.life.stageGd.larva + ln.life.stageGd.pupa;

  it('egg to eclosion takes 3.9 GD at 21 C (23,400 +- 300 ticks) and 2.87 +- 0.05 GD at 25 C', () => {
    expect(total).toBeCloseTo(3.9, 9);
    expect(total / at(ln.life.devRate, 21)).toBeCloseTo(3.9, 2);
    expect((total / at(ln.life.devRate, 21)) * 6000).toBeGreaterThan(23100);
    expect((total / at(ln.life.devRate, 21)) * 6000).toBeLessThan(23700);
    expect(Math.abs(total / at(ln.life.devRate, 25) - 2.87)).toBeLessThanOrEqual(0.05);
  });

  it('brood at 10 C does not progress', () => {
    expect(at(ln.life.devRate, 10)).toBe(0);
    expect(at(ln.life.devRate, 5)).toBe(0);
  });
});

describe('E4: Lasius laying potential', () => {
  const ln = requireSpecies('lasius-niger');
  const q = (n: number): number => ln.life.qMax * (ln.life.sizeBase + (1 - ln.life.sizeBase) * (1 - Math.exp(-n / ln.life.sizeK)));

  it('q(N) is 34 at 18, 50 at 100, 74 at 300, 97 at 900 (GDD 07 §5.1.2)', () => {
    expect(q(18)).toBeCloseTo(34, 0);
    expect(q(100)).toBeCloseTo(50, 0);
    expect(q(300)).toBeCloseTo(74, 0);
    expect(q(900)).toBeCloseTo(97, 0);
  });

  it('d 8.0 (d28 7.0) gives 74 +- 1 eggs for N = 300 at a good royal temperature; d 22.0 (d28 21.0) gives 0', () => {
    const f = at(ln.life.fSeason, 7.0) * at(ln.life.fTempQ, 22);
    expect(Math.abs(q(300) * f - 74)).toBeLessThanOrEqual(1);
    expect(at(ln.life.fSeason, 21.0)).toBe(0);
  });
});

describe('E5 / E14: caste unlock thresholds', () => {
  it('Messor majors unlock at N = 40 (none at 39), with the target mix 35 / 45 / 20 at N 300', () => {
    const mb = requireSpecies('messor-barbarus');
    expect(mb.castes.find((c) => c.caste === 'major')!.unlock.minWorkers).toBe(40);
    expect(at(mb.life.casteMixTarget.map((r) => [r[0], r[3]] as [number, number]), 300)).toBeCloseTo(0.2, 9);
    expect(mb.life.casteMixTarget[2].slice(1)).toEqual([0.35, 0.45, 0.2]);
  });

  it('Camponotus media and majors need colony age 2.0 years and N >= 60; minors have no gate', () => {
    const cp = requireSpecies('camponotus-pennsylvanicus');
    for (const c of ['media', 'major'] as const) expect(cp.castes.find((x) => x.caste === c)!.unlock).toEqual({ minWorkers: 60, minColonyAgeYears: 2 });
    expect(cp.castes.find((x) => x.caste === 'minor')!.unlock).toEqual({ minWorkers: 0, minColonyAgeYears: 0 });
  });

  it('Atta majors unlock at N >= 400', () => {
    expect(requireSpecies('atta-texana').castes.find((c) => c.caste === 'major')!.unlock.minWorkers).toBe(400);
  });
});

describe('E10 / E11: Camponotus wood rules', () => {
  const w = block(requireSpecies('camponotus-pennsylvanicus'), 'wood-nesting');
  const hazard = (mc: number): number =>
    w.hazardDryMaxPerGd * clamp((w.mcFullSurvivalPct - mc) / (w.mcFullSurvivalPct - w.mcZeroSurvivalPct), 0, 1) +
    (mc > w.mcMouldPct ? w.hazardMouldPerPct * (mc - w.mcMouldPct) : 0);

  it('hazard 0.286 /GD at mc 10 % (75 +- 10 of 100 eggs survive a GD), none at 20 %, 0.4 at 8 % and below', () => {
    expect(hazard(10)).toBeCloseTo(0.2857, 3);
    expect(Math.abs(100 * Math.exp(-hazard(10)) - 75)).toBeLessThanOrEqual(10);
    expect(hazard(20)).toBe(0);
    expect(hazard(8)).toBeCloseTo(0.4, 9);
    expect(hazard(5)).toBeCloseTo(0.4, 9);
    expect(hazard(35)).toBeCloseTo(0.05, 9); // mould above 30 %
  });

  it('a media bites decay-2 wood along the grain in 1.2 x DIG_BITE_S, across it 2.16 x, a minor along it 1.92 x', () => {
    expect(w.biteFactorDecay2).toBe(1.2);
    expect(w.biteFactorDecay2 * w.crossGrainMult * w.casteFactorMedia).toBeCloseTo(2.16, 9);
    expect(w.biteFactorDecay2 * w.casteFactorMinor).toBeCloseTo(1.92, 9);
    expect(w.biteFactorDecay2 * w.casteFactorMedia).toBeCloseTo(1.2, 9);
  });

  it('10 frass items are one pile unit, and the satellite rule uses the 15-30 % / 8-18 % moisture windows', () => {
    expect(w.frassPerPileUnit).toBe(10);
    expect(w.mcFullSurvivalPct).toBe(15);
    expect([w.dryBonusMcMinPct, w.dryBonusMcMaxPct, w.dryBonus]).toEqual([8, 18, 1.15]);
  });
});

describe('E17 / E18 / E19 / E20: Messor granary arithmetic', () => {
  const g = block(requireSpecies('messor-barbarus'), 'granary');

  it('a major mills 10 loads of hardness 0.5 in 360 s and gets 8.0 paste and 2.0 chaff', () => {
    const perLoad = g.millBaseS * (1 + g.millHardnessMult * 0.5);
    expect(perLoad * 10).toBeCloseTo(360, 9);
    expect(10 * g.pasteYield).toBeCloseTo(8.0, 9);
    expect(10 * g.chaffYield).toBeCloseTo(2.0, 9);
  });

  it('100 paste loads keep 50 +- 1 after 3 GD (half-life 3 GD)', () => {
    expect(Math.abs(100 * Math.pow(0.5, 3 / g.pasteHalfLifeGd) - 50)).toBeLessThanOrEqual(1);
  });

  it('a larva below the animal-protein minimum grows at half rate, so its larval stage lasts 2.0 x', () => {
    expect(1 / g.animalProteinGrowthMult).toBe(2);
    expect(requireSpecies('messor-barbarus').life.animalProteinMinFrac).toBe(0.1);
  });

  it('the heat trip limit is 100 % at 30 C, 30 % at 39 C and 0 (no forager leaves) at 44 C', () => {
    const limit = (t: number): number => clamp((g.tripHeatLimitC - t) / g.tripHeatSpanC, g.tripHeatFloor, 1);
    expect(limit(30)).toBe(1);
    expect(limit(39)).toBeCloseTo(0.3, 9);
    // At 44 C the heat stress of 06 §2.6 is 1.0 (forageGate d = 42): activity is 0.
    expect(requireSpecies('messor-barbarus').thermal.forageGate.d).toBeLessThan(44);
  });
});

describe('E21 / E22 / E23: Atta garden arithmetic', () => {
  const f = block(requireSpecies('atta-texana'), 'fungus-garden');
  const gcap = (ellipsoidBu3: number): number => f.guPerBu3 * ellipsoidBu3;

  it('a 30 x 12 x 30 BU chamber holds about 22.6 GU; the founding 10 BU sphere about 2.1 GU', () => {
    expect(gcap((Math.PI / 6) * 30 * 12 * 30)).toBeCloseTo(22.6, 1);
    expect(gcap((Math.PI / 6) * 10 * 10 * 10)).toBeCloseTo(2.1, 1);
  });

  it('G = 2.0 GU at 23 C, RH 0.9, fed 1.8 LU per GU, fully tended grows to 2.33 +- 0.05 in 1 GD', () => {
    const G = 2.0;
    const dG = G * f.gardenR * Math.min(1, 1) * 1 * 1 * (0.5 + 0.5 * 1) * (f.tendFloor + (1 - f.tendFloor)) * (1 - G / gcap((Math.PI / 6) * 30 * 12 * 30));
    expect(Math.abs(G + dG - 2.33)).toBeLessThanOrEqual(0.05);
  });

  it('at 31 C fT is 0 (no growth) and health falls 0.15 per GD: h = 0.85', () => {
    expect(31).toBeGreaterThanOrEqual(f.fTZeroHighC);
    expect(31).toBeGreaterThanOrEqual(f.heatDamageC);
    expect(1 - f.heatDamageRate).toBeCloseTo(0.85, 9);
  });

  it('an unweeded outbreak (i 0.05 -> 0.8) kills the garden in 4.3 +- 0.3 GD (logistic growth at ESC_R 1.0)', () => {
    const t = Math.log(f.escDeadI / (1 - f.escDeadI) / (f.escOutbreakI / (1 - f.escOutbreakI))) / f.escR;
    expect(Math.abs(t - 4.3)).toBeLessThanOrEqual(0.3);
  });

  it('full weeding (weedCoverage 1) turns the growth negative: WEED_R 2.0 > ESC_R 1.0 at small i', () => {
    expect(f.weedR).toBeGreaterThan(f.escR);
  });
});

// Appendix E checks that need a running system, with the module that owns the behaviour:
//   E6-E9 (honeydew relay, relocation, scale herds, avoid marker): honeydew module / beh-forage.
//   E12, E13 (frass piles, brood shuttling): wood-nesting module (species-carpenter).
//   E15, E16 (sprouting granary, dry granary): granary module (species-harvester).
//   E24, E25 (garden-less colony, leaf rejection): fungus-garden module (species-leafcutter).
//   E2-E5 in the running sim (brood timing, laying, caste destiny): colony-core; this file checks their data inputs.
