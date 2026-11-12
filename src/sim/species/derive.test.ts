// Derived stats against the worked rows of the caste tables (GDD 07 §5.1.1, §5.2.1, §5.3.1, §5.4.1; GDD 05 §4.1).
// "Within rounding": the tolerance is half a unit of the last digit the table prints, plus 2 % where the table
// itself rounds an input (nanitic masses are given to one digit).
import { describe, expect, it } from 'vitest';
import type { Caste, SpeciesId } from '@/sim/types';
import { deriveAntStats as entityDerive } from '@/sim/entities/antStats';
import {
  carryCapOf, cropCapOf, deriveAntStats, findCaste, larvalCost, minPassageBu, upkeepOfCaste, upkeepRestOf, upkeepActiveOf,
} from './derive';
import { requireSpecies } from './index';

interface Row {
  label: string;
  species: SpeciesId;
  caste: Caste;
  /** Body length in BU; default = the caste mean. */
  len?: number;
  mass: number;
  m: number;
  hp: number;
  bite: number;
  crop: number;
  carry: number;
  rest?: number;
  active?: number;
  passage: number;
  /** Relative slack beyond rounding (default 2 %): nanitic masses in the tables are not exactly cube-law consistent. */
  slack?: number;
}

// Table columns: mass, m, HP, bite, crop, carry, upkeep rest / active, passage. Queens, gynes and males: fixed HP and
// bite, explicit upkeep (their `rest` / `active` are the caste values), carry 0.
const ROWS: Row[] = [
  { label: 'LN worker', species: 'lasius-niger', caste: 'worker', mass: 1.0, m: 1.0, hp: 10, bite: 1.0, crop: 1.0, carry: 1.0, rest: 0.08, active: 0.2, passage: 0.45 },
  { label: 'LN nanitic', species: 'lasius-niger', caste: 'worker', len: 0.85, mass: 0.6, m: 0.6, hp: 7, bite: 0.7, crop: 0.6, carry: 0.74, rest: 0.054, active: 0.136, passage: 0.38 },
  { label: 'LN queen', species: 'lasius-niger', caste: 'queen', mass: 30, m: 30, hp: 50, bite: 2.0, crop: 1.0, carry: 0, rest: 0.3, active: 0.3, passage: 0.95 },
  { label: 'LN gyne', species: 'lasius-niger', caste: 'gyne', mass: 25, m: 25, hp: 35, bite: 1.5, crop: 3.0, carry: 0, rest: 0.15, active: 0.15, passage: 0.95 },
  { label: 'LN male', species: 'lasius-niger', caste: 'male', mass: 0.8, m: 0.8, hp: 6, bite: 0.2, crop: 0.3, carry: 0, rest: 0.06, active: 0.06, passage: 0.43 },
  { label: 'CP minor', species: 'camponotus-pennsylvanicus', caste: 'minor', mass: 2.0, m: 0.29, hp: 16, bite: 1.6, crop: 0.29, carry: 0.5, rest: 0.032, active: 0.079, passage: 0.35 },
  { label: 'CP nanitic minor', species: 'camponotus-pennsylvanicus', caste: 'minor', len: 0.65, mass: 1.2, m: 0.17, hp: 11, bite: 1.1, crop: 0.17, carry: 0.35, rest: 0.021, active: 0.053, passage: 0.29 },
  { label: 'CP media', species: 'camponotus-pennsylvanicus', caste: 'media', mass: 7, m: 1.0, hp: 37, bite: 3.7, crop: 1.0, carry: 1.0, rest: 0.08, active: 0.2, passage: 0.5 },
  { label: 'CP major', species: 'camponotus-pennsylvanicus', caste: 'major', mass: 16, m: 2.29, hp: 63, bite: 9.5, crop: 2.3, carry: 2.0, rest: 0.149, active: 0.372, passage: 0.78 },
  { label: 'CP queen', species: 'camponotus-pennsylvanicus', caste: 'queen', mass: 100, m: 14.3, hp: 120, bite: 12, crop: 3.0, carry: 0, passage: 0.95 },
  { label: 'CP gyne', species: 'camponotus-pennsylvanicus', caste: 'gyne', mass: 100, m: 14.3, hp: 120, bite: 12, crop: 3.0, carry: 0, rest: 0.15, active: 0.15, passage: 0.9 },
  { label: 'CP male', species: 'camponotus-pennsylvanicus', caste: 'male', mass: 15, m: 2.1, hp: 23, bite: 1.2, crop: 0.5, carry: 0, rest: 0.1, active: 0.1, passage: 0.5 },
  { label: 'MB minor', species: 'messor-barbarus', caste: 'minor', mass: 2.0, m: 0.29, hp: 16, bite: 1.6, crop: 0.29, carry: 0.5, rest: 0.032, active: 0.079, passage: 0.32 },
  { label: 'MB nanitic minor', species: 'messor-barbarus', caste: 'minor', len: 0.6, mass: 1.3, m: 0.19, hp: 12, bite: 1.2, crop: 0.19, carry: 0.37, rest: 0.023, active: 0.058, passage: 0.27, slack: 0.06 }, // cube law at 0.6 BU gives 1.26 mg
  { label: 'MB media', species: 'messor-barbarus', caste: 'media', mass: 7, m: 1.0, hp: 37, bite: 3.7, crop: 1.0, carry: 1.0, rest: 0.08, active: 0.2, passage: 0.47 },
  { label: 'MB major', species: 'messor-barbarus', caste: 'major', mass: 22, m: 3.14, hp: 79, bite: 11.8, crop: 2.0, carry: 2.5, rest: 0.189, active: 0.472, passage: 0.8 },
  { label: 'MB queen', species: 'messor-barbarus', caste: 'queen', mass: 80, m: 11.4, hp: 107, bite: 10.7, crop: 3.0, carry: 0, passage: 1.0 },
  { label: 'MB male', species: 'messor-barbarus', caste: 'male', mass: 10, m: 1.45, hp: 19, bite: 0.95, crop: 0.5, carry: 0, rest: 0.08, active: 0.08, passage: 0.59 },
  { label: 'AT minim', species: 'atta-texana', caste: 'minor', mass: 0.3, m: 0.06, hp: 4.5, bite: 0.36, crop: 0.06, carry: 0.2, rest: 0.01, active: 0.024, passage: 0.16 },
  { label: 'AT small media', species: 'atta-texana', caste: 'media', len: 0.7, mass: 1.7, m: 0.34, hp: 14, bite: 1.4, crop: 0.34, carry: 0.5, rest: 0.036, active: 0.089, passage: 0.32 },
  { label: 'AT media', species: 'atta-texana', caste: 'media', mass: 5, m: 1.0, hp: 29, bite: 2.9, crop: 1.0, carry: 1.0, rest: 0.08, active: 0.2, passage: 0.45 },
  { label: 'AT major', species: 'atta-texana', caste: 'major', mass: 30, m: 6.0, hp: 97, bite: 19.3, crop: 2.5, carry: 3.0, rest: 0.31, active: 0.77, passage: 0.93 },
  { label: 'AT queen', species: 'atta-texana', caste: 'queen', mass: 300, m: 60, hp: 208, bite: 20.8, crop: 3.0, carry: 0, passage: 1.2 },
  { label: 'AT male', species: 'atta-texana', caste: 'male', mass: 60, m: 12, hp: 46, bite: 2.3, crop: 0.5, carry: 0, rest: 0.15, active: 0.15, passage: 0.86 },
];

/** Half a unit of the last printed digit, plus 2 % of the value (inputs the table rounds). */
function tol(table: number, slack: number): number {
  const s = String(table);
  const dec = s.includes('.') ? s.split('.')[1].length : 0;
  return 0.5 * Math.pow(10, -dec) + slack * Math.abs(table) + 1e-9;
}

function near(actual: number, table: number, what: string, slack = 0.02): void {
  expect(Math.abs(actual - table), `${what}: ${actual} vs table ${table}`).toBeLessThanOrEqual(tol(table, slack));
}

describe('derived stats reproduce the caste tables within rounding', () => {
  for (const r of ROWS) {
    it(r.label, () => {
      const def = requireSpecies(r.species);
      const cd = findCaste(def, r.caste)!;
      const len = r.len ?? cd.lengthBu.mean;
      const s = deriveAntStats(def, r.caste, len);
      const k = r.slack ?? 0.02;
      near(s.massMg, r.mass, 'mass', k);
      near(s.m, r.m, 'm', k);
      near(s.maxHp, r.hp, 'HP', k);
      near(s.bite, r.bite, 'bite', k);
      near(s.cropCap, r.crop, 'crop', k);
      near(s.carryCap, r.carry, 'carry', k);
      if (r.rest !== undefined && r.active !== undefined) {
        const u = upkeepOfCaste(cd, s.m);
        near(u.restC, r.rest, 'upkeep rest', k);
        near(u.activeC, r.active, 'upkeep active', k);
      }
      near(minPassageBu(len, cd.macrocephalic), r.passage, 'passage', k);
    });
  }

  it('the worker formulas are exact at the reference values', () => {
    expect(upkeepRestOf(1)).toBeCloseTo(0.08, 12);
    expect(upkeepActiveOf(1)).toBeCloseTo(0.2, 12);
    expect(cropCapOf(0.5, null)).toBe(0.5);
    expect(cropCapOf(5, 2)).toBe(2);
    expect(carryCapOf(8, null)).toBeCloseTo(Math.pow(8, 0.6), 12);
    expect(carryCapOf(8, 2.5)).toBe(2.5);
  });

  it('larval cost = 1.2 P + 0.4 C at m = 1, scaling with m^0.8 (GDD 07 §2.3, §5.2.2)', () => {
    const one = larvalCost(1);
    expect(one.p).toBeCloseTo(1.2, 12);
    expect(one.c).toBeCloseTo(0.4, 12);
    const major = larvalCost(2.29); // Camponotus major: 2.33 P + 0.78 C
    expect(major.p).toBeCloseTo(2.33, 1);
    expect(major.c).toBeCloseTo(0.78, 1);
    const gyne = larvalCost(14.3); // Camponotus gyne 10.1 P + 3.4 C
    expect(gyne.p).toBeCloseTo(10.1, 0);
    const mbMajor = larvalCost(3.14); // Messor major 3.0 P + 1.0 C
    expect(mbMajor.p).toBeCloseTo(3.0, 1);
    const atMajor = larvalCost(6.0); // Atta major 6.7 FL = (1.2 + 0.4) x 6^0.8
    expect(atMajor.p + atMajor.c).toBeCloseTo(6.7, 1);
  });

  it('is the same arithmetic as the entity layer (entities/antStats deriveAntStats) for every species and caste', () => {
    for (const id of ['lasius-niger', 'camponotus-pennsylvanicus', 'messor-barbarus', 'atta-texana'] as const) {
      const def = requireSpecies(id);
      for (const cd of def.castes) {
        for (const f of [cd.lengthBu.min, cd.lengthBu.mean, cd.lengthBu.max]) {
          for (const founding of [false, true]) expect(deriveAntStats(def, cd.caste, f, founding)).toEqual(entityDerive(def, cd.caste, f, founding));
        }
      }
    }
  });
});
