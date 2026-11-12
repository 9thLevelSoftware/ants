// Adversarial checks of task F1c (contracts sync and freeze), reviewer-written.
// Tests that FAIL here document real defects for the fixer; passing ones stay as regression tests.
import { describe, expect, it } from 'vitest';
import * as T from '@/sim/types';
import * as time from '@/sim/time';
import * as environment from '@/sim/environment';
import { getAntStats } from '@/sim/entities';
import { listRivalSpecies, requireSpecies } from '@/sim/species';
import { makeTestSim } from '@/sim/testing';

const DOCS = import.meta.glob(['/docs/design/gdd/00-index.md', '/docs/design/tdd/01-contracts-map.md'], {
  query: '?raw', import: 'default', eager: true,
}) as Record<string, string>;
const INDEX = DOCS['/docs/design/gdd/00-index.md'];
const MAP = DOCS['/docs/design/tdd/01-contracts-map.md'];

/** Every `D<n>.<m>` row id of 00-index §D. */
function sectionDRows(): string[] {
  return [...INDEX.matchAll(/^\| (D\d+\.\d+) \|/gm)].map((m) => m[1]);
}

/** Row ids the contracts map mentions, with ranges such as `D2.1-D2.3` expanded. */
function mappedRows(): Set<string> {
  const out = new Set<string>();
  for (const m of MAP.matchAll(/\bD(\d+)\.(\d+)(?:\s*-\s*D\1\.(\d+))?/g)) {
    const g = Number(m[1]);
    const a = Number(m[2]);
    const b = m[3] ? Number(m[3]) : a;
    for (let i = a; i <= b; i++) out.add(`D${g}.${i}`);
  }
  return out;
}

describe('F1c verify: every 00-index §D row is accounted for in the contracts map (acceptance 2)', () => {
  it('has the D7 second-pass rows (and every other row) in section (g)', () => {
    const rows = sectionDRows();
    expect(rows.length).toBeGreaterThan(100);
    const mapped = mappedRows();
    expect(rows.filter((r) => !mapped.has(r))).toEqual([]);
  });
});

describe('F1c verify: D7 second-pass contract changes', () => {
  const tpd = time.TICKS_PER_DAY;
  const api = time as unknown as Record<string, unknown>;

  it('D7.1: calendar exposes defaultYearDay (d28, 0-based float) and defaultYearDoy (doy28)', () => {
    expect(typeof api.defaultYearDay).toBe('function');
    expect(typeof api.defaultYearDoy).toBe('function');
    const d28 = api.defaultYearDay as (tick: number, cfg: time.SeasonLengthSource) => number;
    const doy28 = api.defaultYearDoy as (tick: number, cfg: time.SeasonLengthSource) => number;
    for (const len of [5, 7, 10]) {
      const cfg = { rules: { seasonLengthDays: len } };
      const yearDays = 4 * len;
      for (let day = 0; day < yearDays; day++) {
        const tick = day * tpd + tpd / 2; // midday
        const d = day + 0.5;
        expect(d28(tick, cfg)).toBeCloseTo((d * 28) / yearDays, 9);
        expect(doy28(tick, cfg)).toBe(Math.floor((d * 28) / yearDays) + 1);
      }
      // second year wraps back to the start of the default year
      expect(d28(yearDays * tpd, cfg)).toBeCloseTo(0, 9);
    }
  });

  it('D7.2: environment exposes thermalInputs(pos) and rainIntensityAt(pos)', () => {
    const env = environment as unknown as Record<string, unknown>;
    expect(typeof env.thermalInputs).toBe('function');
    expect(typeof env.rainIntensityAt).toBe('function');
    const sim = makeTestSim();
    const p = { ...sim.state.ants[0].pos };
    const ti = (env.thermalInputs as (s: unknown, p: unknown) => Record<string, number>)(sim, p);
    for (const k of ['T_top', 'T_dayMean', 'T_seasonMean', 'T_annual']) expect(Number.isFinite(ti[k]), k).toBe(true);
    expect((env.rainIntensityAt as (s: unknown, p: unknown) => number)(sim, p)).toBe(0); // no rain in the stub
  });

  it('D7.2: env.thermal carries the two thermal EMA arrays (per heightfield cell and per cover primitive)', () => {
    const sim = makeTestSim();
    const typed = Object.values(sim.state.env.thermal).filter((v) => v instanceof Float32Array);
    // tsurf + the day-mean and season-mean EMA storage
    expect(typed.length).toBeGreaterThanOrEqual(3);
  });
});

describe('F1c verify: calendar helpers (acceptance 4) - regression', () => {
  it('season boundaries, years and weekdays hold for 5, 7 and 10 day seasons, also at hour 23.99', () => {
    for (const len of [5, 7, 10] as const) {
      const cfg = { rules: { seasonLengthDays: len } };
      for (const [si, season] of T.SEASONS.entries()) {
        const first = time.calendarTickAt(season, 1, 0, cfg);
        const last = time.calendarTickAt(season, len, 23.99, cfg);
        expect(time.seasonOf(first, cfg)).toBe(season);
        expect(time.seasonOf(last, cfg)).toBe(season);
        expect(time.dayOfSeason(last, cfg)).toBe(len);
        expect(time.seasonIndexOf(last + time.TICKS_PER_HOUR, cfg)).toBe((si + 1) % 4);
      }
      expect(time.yearOf(time.ticksPerYear(cfg) - 1, cfg)).toBe(1);
      expect(time.yearOf(time.ticksPerYear(cfg), cfg)).toBe(2);
      expect(time.yearFraction(time.ticksPerYear(cfg) * 3 + 1, cfg)).toBeGreaterThanOrEqual(0);
    }
  });

  it('a new game for every season length starts in the species window and derives a consistent calendar', () => {
    for (const len of [5, 7, 10] as const) {
      const sim = makeTestSim({ config: { rules: { ...makeTestSim().state.config.rules, seasonLengthDays: len } } });
      const cal = environment.calendarNow(sim);
      expect(cal.season).toBe('summer');
      expect(cal.dayOfSeason).toBeGreaterThanOrEqual(1);
      expect(cal.dayOfSeason).toBeLessThanOrEqual(len);
      expect(cal.doy).toBe(len + cal.dayOfSeason);
    }
  });
});

describe('F1c verify: species and stats (rulings 4, 5, 10; D2.25-D2.29) - regression', () => {
  it('getAntStats works for every rival-only species and every caste, with finite positive numbers', () => {
    const sim = makeTestSim();
    expect(listRivalSpecies().map((r) => r.id).sort()).toEqual([...T.RIVAL_SPECIES_IDS].sort());
    for (const r of listRivalSpecies()) {
      for (const caste of T.CASTES) {
        const s = getAntStats(sim, r.id, caste);
        for (const [k, v] of Object.entries(s)) expect(Number.isFinite(v), `${r.id} ${caste} ${k}`).toBe(true);
        expect(s.maxHp, `${r.id} ${caste}`).toBeGreaterThan(0);
        expect(s.lengthBu).toBeGreaterThan(0);
      }
    }
  });

  it('Lasius male upkeep is 0.06 C/GD in both places (ruling 10)', () => {
    const ln = requireSpecies('lasius-niger');
    const male = ln.castes.find((c) => c.caste === 'male')!;
    expect(male.upkeepOverride?.restC).toBeCloseTo(0.06);
    expect(male.upkeepOverride?.activeC).toBeCloseTo(0.06);
    expect(ln.reproduction.maleUpkeepC).toBeCloseTo(0.06);
  });

  it('species data carries no per-agent weight or real-worker estimate except wildColonySize (ruling 4)', () => {
    const json = JSON.stringify(requireSpecies('lasius-niger'));
    expect(json).not.toMatch(/realEstimate|W_eq|wEq|workerEq|perAgent/i);
    expect(json).toMatch(/wildColonySize/);
  });
});
