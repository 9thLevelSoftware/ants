// The abstract colony model against the GDD 05 §3.1 / §3.2 tables (acceptance 3): species rows, births by season,
// growth curves per species and season against an independent transcription of the table, orphan decline (App. E
// 19), winter rule, store caps, aggression and strength.
import { describe, expect, it } from 'vitest';
import type { Season } from '@/sim/types';
import { rivalProfile } from '@/sim/species/rivals/profiles';
import {
  abstractStep, aggressionOf, applyWinter, kEffOf, playerStrength, potentialBirths, rivalStrength, seasonFactor, storeCaps,
  upkeepOf, type AbstractNumbers, type ModelEnv,
} from './model';

/** GDD 05 §3.1 temperate-eu table: N0, K_max, g, CP, aggression, field share / caps, queens. */
const TABLE = {
  'lasius-niger': { n0: 300, k: 1200, g: 0.25, cp: 1.0, agg: 0.6, share: 0.05, caps: [40, 150], queens: 1 },
  'tetramorium-immigrans': { n0: 600, k: 1800, g: 0.30, cp: 0.8, agg: 0.75, share: 0.05, caps: [60, 250], queens: 1 },
  'myrmica-rubra': { n0: 300, k: 1000, g: 0.25, cp: 1.4, agg: 0.85, share: 0.05, caps: [40, 150], queens: 3 },
  'formica-rufa': { n0: 250, k: 400, g: 0.12, cp: 6.0, agg: 0.95, share: 0.08, caps: [60, 200], queens: 1 },
  'solenopsis-fugax': { n0: 400, k: 1500, g: 0.30, cp: 0.15, agg: 0.4, share: 0.01, caps: [10, 30], queens: 1 },
  'lasius-flavus': { n0: 800, k: 2000, g: 0.15, cp: 0.6, agg: 0.3, share: 0.005, caps: [5, 40], queens: 1 },
} as const;

/** Independent transcription of one hourly step of the GDD 05 §3.2 table (for comparison with the module). */
function referenceStep(m: AbstractNumbers, k: number, g: number, base: number, queens: number, sR: number, season: Season, orphaned: boolean, dt: number): void {
  const U = 0.12 * m.n + 0.3 * queens;
  const b = orphaned ? 0 : Math.max(0, g * Math.max(m.n, 20) * (1 - m.n / k) * sR);
  const cap = 0.6 * m.n * 1; // activity 1
  const dC = 1.2 * U + 0.4 * b, dP = 1.2 * b;
  const want = Math.min(cap, dC + dP) * dt;
  m.cS += want * (dC / (dC + dP));
  m.pS += want * (dP / (dC + dP));
  m.cS -= U * dt;
  const starving = m.cS <= 0;
  m.cS = Math.max(0, m.cS);
  const births = Math.max(0, Math.min(b * dt, m.pS / 1.2, m.cS / 0.4));
  m.pS -= births * 1.2;
  m.cS -= births * 0.4;
  const matured = (m.b / 4) * dt;
  const deaths = m.n * (0.03 + (starving ? 0.15 : 0) + (orphaned ? 0.15 : 0)) * dt;
  m.b = m.b + births - matured;
  m.n = m.n + matured - deaths;
  const U1 = 0.12 * m.n + 0.3 * queens;
  m.cS = Math.min(m.cS, 10 * U1);
  m.pS = Math.min(m.pS, 0.2 * m.n + 20);
  const seasonAgg = season === 'spring' ? 1.2 : season === 'summer' ? 1.0 : 0.8;
  m.agg = Math.min(1, base * seasonAgg * (m.cS < U1 ? 1.3 : 1) * (orphaned ? 0.5 : 1));
}

function env(species: keyof typeof TABLE, season: Season, day: number, over: Partial<ModelEnv> = {}): ModelEnv {
  const p = rivalProfile(species);
  return {
    profile: p, queens: p.queens, orphaned: false, claimedCells: p.aRef, season, dayOfSeason: day, activity: 1,
    kMult: 1, growthMult: 1, aggMult: 1, realC: 0, realP: 0, ...over,
  };
}

const DT = 1 / 24;

describe('species rows (GDD 05 §3.1)', () => {
  for (const [id, row] of Object.entries(TABLE)) {
    it(`${id}: N0, K_max, g, CP, aggression, fielding, queens`, () => {
      const p = rivalProfile(id as keyof typeof TABLE);
      expect([p.n0, p.kMax, p.growthPerGd, p.cp, p.aggression, p.fieldShare, p.fieldCap.normal, p.fieldCap.war, p.queens])
        .toEqual([row.n0, row.k, row.g, row.cp, row.agg, row.share, row.caps[0], row.caps[1], row.queens]);
    });
  }
  it('Formica needs 900 claimed cells for its full K (A_ref)', () => {
    expect(rivalProfile('formica-rufa').aRef).toBe(900);
    expect(rivalProfile('lasius-niger').aRef).toBe(400);
  });
});

describe('formulas (GDD 05 §3.2)', () => {
  it('season factor: spring from day 2, summer 1, autumn 0.4, winter 0', () => {
    expect([seasonFactor('spring', 1), seasonFactor('spring', 2), seasonFactor('summer', 4), seasonFactor('autumn', 1), seasonFactor('winter', 3)])
      .toEqual([0, 1, 1, 0.4, 0]);
  });
  it('K_eff clamps the claimed share to 0.3..1', () => {
    expect(kEffOf(1200, 1, 0, 400)).toBeCloseTo(360);
    expect(kEffOf(1200, 1, 200, 400)).toBeCloseTo(600);
    expect(kEffOf(1200, 1.3, 1000, 400)).toBeCloseTo(1560);
  });
  it('potential births: Lasius at N0 with full territory in summer = 56.25 per gd; autumn x0.4; orphaned 0', () => {
    expect(potentialBirths(300, 1200, 0.25, 1, 1, false)).toBeCloseTo(56.25);
    expect(potentialBirths(300, 1200, 0.25, 0.4, 1, false)).toBeCloseTo(22.5);
    expect(potentialBirths(300, 1200, 0.25, 1, 1, true)).toBe(0);
    expect(potentialBirths(5, 1200, 0.25, 1, 1, false)).toBeCloseTo(0.25 * 20 * (1 - 5 / 1200));
    expect(potentialBirths(1300, 1200, 0.25, 1, 1, false)).toBe(0);
  });
  it('upkeep, store caps, aggression, strength', () => {
    expect(upkeepOf(300, 1)).toBeCloseTo(36.3);
    expect(storeCaps(300, 36.3)).toEqual({ c: 363, p: 80 });
    expect(aggressionOf(0.6, 'spring', 100, 36.3, 1, false)).toBeCloseTo(0.72);
    expect(aggressionOf(0.6, 'summer', 10, 36.3, 1, false)).toBeCloseTo(0.78);
    expect(aggressionOf(0.95, 'spring', 100, 36.3, 1.2, false)).toBe(1);
    expect(aggressionOf(0.6, 'summer', 100, 36.3, 1, true)).toBeCloseTo(0.3);
    // App. E 20: rival 6 workers at agg 0.6 -> 4.8; player 12 workers -> 9
    expect(rivalStrength(6, 1.0, 0.6)).toBeCloseTo(4.8);
    expect(playerStrength(12, 1.0)).toBeCloseTo(9);
  });
});

describe('growth curves per species and season match the table', () => {
  const seasons: [Season, number][] = [['spring', 1], ['summer', 1], ['autumn', 1]];
  for (const id of Object.keys(TABLE) as (keyof typeof TABLE)[]) {
    for (const [season] of seasons) {
      it(`${id} over one ${season} (7 gd of hourly steps)`, () => {
        const row = TABLE[id], p = rivalProfile(id);
        const u = upkeepOf(row.n0, row.queens);
        const m: AbstractNumbers = { n: row.n0, b: 0.2 * row.n0, cS: 5 * u, pS: 0.5 * (0.2 * row.n0 + 20), agg: row.agg };
        const ref: AbstractNumbers = { ...m };
        for (let h = 0; h < 7 * 24; h++) {
          const day = 1 + Math.floor(h / 24);
          abstractStep(m, env(id, season, day), DT);
          referenceStep(ref, row.k, row.g, row.agg, row.queens, seasonFactor(season, day), season, false, DT);
        }
        for (const k of ['n', 'b', 'cS', 'pS', 'agg'] as const) expect(m[k]).toBeCloseTo(ref[k], 6);
        expect(p.kMax).toBe(row.k);
        // the season's character: summer grows, autumn grows less, never past K
        expect(m.n).toBeLessThanOrEqual(row.k);
      });
    }
  }
  it('summer growth exceeds autumn growth (sR 1 vs 0.4), every species', () => {
    for (const id of Object.keys(TABLE) as (keyof typeof TABLE)[]) {
      const row = TABLE[id];
      const run = (season: Season): number => {
        const u = upkeepOf(row.n0, row.queens);
        const m: AbstractNumbers = { n: row.n0, b: 0.2 * row.n0, cS: 5 * u, pS: 0.2 * row.n0 + 20, agg: row.agg };
        for (let h = 0; h < 14 * 24; h++) abstractStep(m, env(id, season, 3), DT);
        return m.n + m.b;
      };
      expect(run('summer'), id).toBeGreaterThan(run('autumn'));
    }
  });
});

describe('orphan decline and winter', () => {
  it('App. E 19: N = 100, B = 0, ample stores, queen dead: N = 83.5 +- 1 after 1 gd, no births', () => {
    const m: AbstractNumbers = { n: 100, b: 0, cS: 100, pS: 40, agg: 0.6 };
    let births = 0;
    for (let h = 0; h < 24; h++) births += abstractStep(m, env('lasius-niger', 'summer', 3, { orphaned: true, queens: 0 }), DT).births;
    expect(births).toBe(0);
    expect(m.n).toBeGreaterThan(82.5);
    expect(m.n).toBeLessThan(84.5);
    expect(m.n).toBeCloseTo(100 * Math.pow(1 - 0.18 / 24, 24), 6);
  });
  it('starvation adds 0.15 N per gd while C_s = 0', () => {
    const m: AbstractNumbers = { n: 100, b: 0, cS: 0, pS: 0, agg: 0.6 };
    abstractStep(m, env('lasius-niger', 'summer', 3, { activity: 0 }), DT);
    expect(m.n).toBeCloseTo(100 * (1 - 0.18 / 24), 6);
  });
  it('winter: N x (1 - 0.08 - 0.10 when C_s < 0.35 U); stores lose 5 % of upkeep x season days', () => {
    const fed: AbstractNumbers = { n: 300, b: 50, cS: 300, pS: 40, agg: 0.6 };
    applyWinter(fed, 1, 7);
    expect(fed.n).toBeCloseTo(276);
    expect(fed.cS).toBeCloseTo(300 - 0.05 * 36.3 * 7);
    expect(fed.b).toBe(50);
    const poor: AbstractNumbers = { n: 300, b: 50, cS: 5, pS: 40, agg: 0.6 };
    applyWinter(poor, 1, 7);
    expect(poor.n).toBeCloseTo(246);
    expect(poor.cS).toBe(0);
  });
  it('real deliveries of the last hour reduce the virtual harvest one for one', () => {
    const a: AbstractNumbers = { n: 300, b: 60, cS: 100, pS: 40, agg: 0.6 };
    const b: AbstractNumbers = { ...a };
    const r1 = abstractStep(a, env('lasius-niger', 'summer', 3), DT);
    const r2 = abstractStep(b, env('lasius-niger', 'summer', 3, { realC: 0.5, realP: 0.2 }), DT);
    expect(r1.harvestC - r2.harvestC).toBeCloseTo(0.5, 6);
    expect(r1.harvestP - r2.harvestP).toBeCloseTo(0.2, 6);
  });
});
