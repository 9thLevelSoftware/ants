// Loader validation (GDD 07 §3.16) and GDD 07 Appendix E check 1: all four species pass; negative controls fail
// the right rule.
import { describe, expect, it } from 'vitest';
import type { SpeciesDef } from '@/sim/types';
import { SPECIES_IDS } from '@/sim/types';
import { PLAYABLE_SPECIES, requireSpecies, listSpecies } from './index';
import { assertValidSpecies, SpeciesValidationError, validateSpecies } from './validate';

const clone = (d: SpeciesDef): SpeciesDef => structuredClone(d);
const rules = (d: SpeciesDef): string[] => validateSpecies(d).map((i) => i.rule);
const LN = (): SpeciesDef => clone(requireSpecies('lasius-niger'));

describe('every species passes validation', () => {
  for (const def of PLAYABLE_SPECIES) {
    it(def.id, () => {
      expect(validateSpecies(def)).toEqual([]);
      expect(() => assertValidSpecies(def)).not.toThrow();
    });
  }

  it('the registry holds exactly the four playable species, in canonical id order', () => {
    expect(listSpecies().map((d) => d.id).sort()).toEqual([...SPECIES_IDS].sort());
    expect(PLAYABLE_SPECIES.map((d) => d.id)).toEqual([...SPECIES_IDS]);
  });

  it('Appendix E1: Lasius worker mean 1.0 BU = 4.0 mm, Atta minim mean 0.35 BU, available only for Lasius at T1', () => {
    const ln = requireSpecies('lasius-niger');
    const w = ln.castes.find((c) => c.caste === 'worker')!;
    expect(w.lengthBu.mean).toBe(1.0);
    expect(w.lengthBu.mean * ln.buMm).toBe(4.0);
    expect(requireSpecies('atta-texana').castes.find((c) => c.caste === 'minor')!.lengthBu.mean).toBe(0.35);
    expect(PLAYABLE_SPECIES.filter((d) => d.available).map((d) => d.id)).toEqual(['lasius-niger']);
  });

  it('rule 1: the standard worker is 1.0 +- 0.1 BU (Lasius worker 1.0, Camponotus media 1.1, Messor media 1.05, Atta media 1.0)', () => {
    const std = (id: SpeciesId): number => requireSpecies(id).castes.find((c) => c.caste === 'worker' || c.caste === 'media')!.lengthBu.mean;
    type SpeciesId = (typeof SPECIES_IDS)[number];
    expect([std('lasius-niger'), std('camponotus-pennsylvanicus'), std('messor-barbarus'), std('atta-texana')]).toEqual([1.0, 1.1, 1.05, 1.0]);
  });
});

describe('negative controls: the loader rejects a broken definition', () => {
  it('rule 1: a caste with min > mean', () => {
    const d = LN();
    d.castes[0].lengthBu = { min: 1.2, mean: 1.0, max: 1.3 };
    expect(rules(d)).toContain('3.16.1');
  });

  it('rule 1: a standard worker of 1.3 BU', () => {
    const d = LN();
    d.castes[0].lengthBu = { min: 1.2, mean: 1.3, max: 1.4 };
    expect(rules(d)).toContain('3.16.1');
  });

  it('rule 2: devRate not strictly increasing, not 1.0 at devRefC, not zero at the ends', () => {
    const a = LN();
    a.life.devRate = [[10, 0], [20, 0.5], [20, 1], [36, 0]];
    expect(rules(a)).toContain('3.16.2');
    const b = LN();
    b.life.devRefC = 15; // r(15) = 0.455
    expect(rules(b)).toContain('3.16.2');
    const c = LN();
    c.life.devRate[0] = [10, 0.2];
    expect(rules(c)).toContain('3.16.2');
  });

  it('rule 3: fSeason that stops short of the year, or a lay window outside [0, 28]', () => {
    const a = LN();
    a.life.fSeason = [[0, 1], [20, 1]];
    expect(rules(a)).toContain('3.16.3');
    const b = LN();
    b.life.layWindows = [[26, 30]];
    expect(rules(b)).toContain('3.16.3');
    const c = LN();
    c.life.fSeason = [[1, 1], [28, 1]];
    expect(rules(c)).toContain('3.16.3');
  });

  it('rule 4: an unknown action id', () => {
    const d = LN();
    d.castes[0].actions.push('teleport' as never);
    expect(rules(d)).toContain('3.16.4');
  });

  it('rule 5: unknown food kind, material, task, caste, climate', () => {
    const d = LN();
    (d.diet.foods as Record<string, unknown>)['moon-cheese'] = { pref: 1, route: 'crop-c', tier: 'T1' };
    (d.opening.siteMaterials as Record<string, number>).granite = 1;
    (d.castes[0].taskWeights as Record<string, number>).dance = 1;
    d.combat.guardCastes = ['soldier' as never];
    d.climate = 'arctic' as never;
    const found = validateSpecies(d).filter((i) => i.rule === '3.16.5').map((i) => i.path);
    expect(found).toEqual(expect.arrayContaining(['diet.foods.moon-cheese', 'opening.siteMaterials.granite', 'combat.guardCastes[0]', 'climate']));
    expect(found.some((p) => p.endsWith('taskWeights.dance'))).toBe(true);
  });

  it('rule 6: a listed module without a block, a block without a module', () => {
    const a = LN();
    delete a.modules['honeydew-ranching'];
    expect(rules(a)).toContain('3.16.6');
    const b = LN();
    b.modules.granary = { x: 1 };
    expect(rules(b)).toContain('3.16.6');
  });

  it('rule 7: simCapWorkers above 1,500, wildColonySize.max below the cap', () => {
    const a = LN();
    a.scale.simCapWorkers = 1600;
    expect(rules(a)).toContain('3.16.7');
    const b = LN();
    b.scale.wildColonySize.max = 1000;
    expect(rules(b)).toContain('3.16.7');
  });

  it('structure: NaN anywhere, duplicate castes, a mix row that does not sum to 1', () => {
    const a = LN();
    a.castes[0].casteMassMg = Number.NaN;
    expect(rules(a)).toContain('x.finite');
    const b = LN();
    b.castes.push(clone(b).castes[0]);
    expect(rules(b)).toContain('x.castes');
    const c = LN();
    c.life.casteMixTarget = [[0, 0.5, 0.2, 0]];
    expect(rules(c)).toContain('x.life');
  });

  it('assertValidSpecies throws an error listing every issue', () => {
    const d = LN();
    d.scale.simCapWorkers = 9999;
    d.life.devRefC = 15;
    expect(() => assertValidSpecies(d)).toThrow(SpeciesValidationError);
    try {
      assertValidSpecies(d);
    } catch (e) {
      expect((e as SpeciesValidationError).issues.length).toBeGreaterThanOrEqual(2);
      expect((e as Error).message).toContain('[3.16.7]');
    }
  });
});
