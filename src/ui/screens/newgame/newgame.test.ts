import { describe, expect, it } from 'vitest';
import { applyPreset, buildRequest, defaultForm, isCustom, LOCALITY_ARCHETYPES, presetRules, ruleOverrides, setRule } from './form';
import { suitability, zoneChips } from './locality';
import { formatSeedCode, fnv1a32, nextSeedText, randomSeedText, resolveSeed, SEED_MAX_CHARS } from './seed';
import { SPECIES_CARDS, foundingSeasonOf, isSpeciesAvailable } from './species';
import { NOT_IN_BUILD, presetGroups, unwiredRules } from './presetRows';
import { PRESET_ROWS, rowInEffect, UNWIRED_RULES } from '@/sim/config/presetDisplay';

describe('seed field (GDD 08 3.7)', () => {
  it('an 8-hex code is the seed itself, with or without the hyphen, any case', () => {
    expect(resolveSeed('4F7A-21C9')).toEqual({ value: 0x4f7a21c9, code: '4F7A-21C9', mode: 'hex' });
    expect(resolveSeed('4f7a21c9').value).toBe(0x4f7a21c9);
    expect(resolveSeed('  4f7a-21c9 ').value).toBe(0x4f7a21c9);
    expect(resolveSeed('00000001').code).toBe('0000-0001');
  });
  it('any other text is hashed with 32-bit FNV-1a and the code is shown', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    const r = resolveSeed('oak-17');
    expect(r.mode).toBe('hash');
    expect(r.value).toBe(fnv1a32('oak-17'));
    expect(r.code).toBe(formatSeedCode(fnv1a32('oak-17')));
    expect(resolveSeed('oak-18').value).not.toBe(r.value);
  });
  it('text longer than the limit is cut before hashing', () => {
    const long = 'x'.repeat(SEED_MAX_CHARS + 10);
    expect(resolveSeed(long).value).toBe(fnv1a32('x'.repeat(SEED_MAX_CHARS)));
  });
  it('Randomise draws a code in display form; Try another seed increments by one', () => {
    expect(randomSeedText(() => 0x0000beef)).toBe('0000-BEEF');
    expect(nextSeedText('4F7A-21C9')).toBe('4F7A-21CA');
    expect(nextSeedText('FFFF-FFFF')).toBe('0000-0000');
  });
});

describe('species cards', () => {
  it('shows all four species; only Lasius is selectable until the others are registered', () => {
    expect(SPECIES_CARDS.map((c) => c.id)).toEqual(['lasius-niger', 'camponotus-pennsylvanicus', 'messor-barbarus', 'atta-texana']);
    expect(isSpeciesAvailable('lasius-niger')).toBe(true);
    expect(isSpeciesAvailable('atta-texana')).toBe(false);
    expect(SPECIES_CARDS.map((c) => c.complexity)).toEqual([1, 2, 2, 3]); // GDD 08 3.7
  });
});

describe('locality cards', () => {
  it('lists the tier-1 archetypes with zone chips and a suitability word', () => {
    expect(LOCALITY_ARCHETYPES).toEqual(['woodland-edge', 'suburban-garden', 'playground-park', 'car-park-verge', 'kitchen-door']);
    expect(zoneChips('woodland-edge')).toContain('forest');
    expect(zoneChips('kitchen-door').length).toBeLessThanOrEqual(4);
    expect(suitability('woodland-edge', 'lasius-niger')).toBe('Good');
    expect(suitability('kitchen-door', 'messor-barbarus')).toBe('Poor');
  });
});

describe('difficulty presets and custom rules', () => {
  it('the preset cards carry the balance table values (GDD 06 14)', () => {
    expect(presetRules('naturalist')).toMatchObject({ predators: 'normal', rivals: 3, foundingLeniency: 'normal', collapse: true, seasonLengthDays: 7 });
    expect(presetRules('gentle')).toMatchObject({ predators: 'few', rivals: 2, foundingLeniency: 'lenient', collapse: false });
    expect(presetRules('harsh')).toMatchObject({ predators: 'many', rivals: 4, foundingLeniency: 'strict' });
  });
  it('editing any value switches the card to Custom; picking a preset resets it', () => {
    let f = defaultForm('4F7A-21C9');
    expect(isCustom(f)).toBe(false);
    f = setRule(f, 'rivals', 1);
    expect(isCustom(f)).toBe(true);
    expect(ruleOverrides(f)).toEqual({ rivals: 1 });
    f = setRule(f, 'seasonLengthDays', 10);
    expect(ruleOverrides(f)).toEqual({ rivals: 1, seasonLengthDays: 10 });
    f = applyPreset(f, 'harsh');
    expect(isCustom(f)).toBe(false);
    expect(f.preset).toBe('harsh');
    expect(f.rules.rivals).toBe(4);
  });
});

describe('the New Game request', () => {
  it('carries the resolved seed, the chosen options and only the rules that differ', () => {
    let f = defaultForm('4F7A-21C9');
    f = { ...f, archetype: 'woodland-edge', size: 'large', startSeason: 'spring', hints: false };
    const r = buildRequest(f);
    expect(r).toMatchObject({ seed: 0x4f7a21c9, seedText: '4F7A-21C9', species: 'lasius-niger', archetype: 'woodland-edge', size: 'large', difficulty: 'naturalist', startSeason: 'spring', hints: false });
    expect(r.customRules).toBeUndefined();
    const c = buildRequest(setRule(f, 'predators', 'off'));
    expect(c.customRules).toEqual({ predators: 'off' });
  });
  it('Random picks an archetype the species can use, deterministically from the seed', () => {
    const f = { ...defaultForm('0000-0007'), archetype: 'random' as const };
    const a = buildRequest(f), b = buildRequest(f);
    expect(a.archetype).toBe(b.archetype);
    expect(LOCALITY_ARCHETYPES).toContain(a.archetype);
  });
});

describe('presets and rules that the sim does not read yet are marked, not offered as working', () => {
  it('a preset row whose parameter nothing reads shows "Not in this build" in place of its value', () => {
    for (const id of ['gentle', 'naturalist', 'harsh'] as const) {
      const rows = presetGroups(id).flatMap((g) => g.rows);
      expect(rows.length).toBe(PRESET_ROWS.length);
      for (const [i, r] of rows.entries()) {
        expect(r.inEffect, r.label).toBe(rowInEffect(PRESET_ROWS[i]));
        if (r.inEffect) expect(r.value, r.label).not.toBe(NOT_IN_BUILD);
        else expect(r.value, r.label).toBe(NOT_IN_BUILD);
      }
    }
  });
  it('lists the unwired custom rules (and only those) with the design\'s wording', () => {
    const u = unwiredRules();
    expect(u.length).toBe(UNWIRED_RULES.length);
    for (const r of u) expect(r.effect.length).toBeGreaterThan(10);
  });
});

describe('natural start season (ruling R20: the reference species starts on day 5, spring)', () => {
  it('is read from the species data: day 5 is spring for Lasius, Camponotus and Atta; Messor starts in autumn', () => {
    expect(foundingSeasonOf('lasius-niger')).toBe('spring');
    expect(foundingSeasonOf('camponotus-pennsylvanicus')).toBe('spring');
    expect(foundingSeasonOf('atta-texana')).toBe('spring');
    expect(foundingSeasonOf('messor-barbarus')).toBe('autumn');
  });
  it('the static card agrees with the data (no screen keeps a season of its own)', () => {
    for (const c of SPECIES_CARDS) expect(c.foundingSeason, c.id).toBe(foundingSeasonOf(c.id));
  });
});
