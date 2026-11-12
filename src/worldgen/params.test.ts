// One source of truth for rival count, human activity and difficulty (balance presets and config.rules win);
// world dimensions per size class and species (GDD 04 §1.1, App. E 2); seed text and random archetype.
import { describe, expect, it } from 'vitest';
import { ARCHETYPES, DIFFICULTY_IDS, SPECIES_IDS } from '@/sim/types';
import { DIFFICULTY_PARAMS, presetHumanActivity, presetRivals, resolveRules } from '@/sim/balance';
import { defaultGameConfig, syncWorldParams } from '@/sim/createGame';
import { checkParams, defaultWorldParams, pickArchetype, seedFromText, worldDims } from './params';
import { ARCHETYPE_DEFS } from './tuning/archetypes';

describe('world params follow the difficulty presets and the rules', () => {
  it('defaults come from balance/difficulty for every preset', () => {
    for (const d of DIFFICULTY_IDS) {
      const p = defaultWorldParams('lasius-niger', 1, d);
      expect(p.rivalCount).toBe(presetRivals(d));
      expect(p.rivalCount).toBe(resolveRules(d, {}, 7).rivals);
      expect(p.incipientCount).toBe(DIFFICULTY_PARAMS[d].incipientRivals);
      expect(p.humanActivity).toBe(presetHumanActivity(d));
    }
  });

  it('a new-game config agrees with its rules, and syncWorldParams applies custom rules before generation', () => {
    const cfg = defaultGameConfig('lasius-niger', 3, 'harsh');
    expect(cfg.world).toMatchObject({ difficulty: 'harsh', rivalCount: cfg.rules.rivals, humanActivity: cfg.rules.humanActivity });
    const custom = { ...cfg, rules: { ...cfg.rules, rivals: 1, humanActivity: 'off' as const } };
    expect(syncWorldParams(custom).world).toMatchObject({ rivalCount: 1, humanActivity: 'off', difficulty: 'harsh' });
    expect(custom.world.rivalCount).toBe(cfg.rules.rivals); // input not mutated
  });
});

describe('world dimensions (GDD 04 §1.1)', () => {
  it('E2: Camponotus standard is 36 m with 1001 x 1001 height samples and 250 x 250 nav cells', () => {
    const d = worldDims(defaultWorldParams('camponotus-pennsylvanicus', 1));
    expect(d.size).toBe(36000);
    expect(d.samples).toBe(1001);
    expect(d.navN).toBe(250);
  });

  it('every size class: cells = side / 4 BU, nav cells round up (partial last cell)', () => {
    for (const [size, side, nav] of [['compact', 3000, 188], ['standard', 4000, 250], ['large', 5000, 313]] as const) {
      for (const sp of SPECIES_IDS) {
        const d = worldDims(defaultWorldParams(sp, 1, 'naturalist', size));
        expect(d.size).toBe(side * d.bu);
        expect(d.cells).toBe(side / 4);
        expect(d.navN).toBe(nav);
      }
    }
  });

  it('rejects unsupported generator versions', () => {
    expect(() => checkParams({ ...defaultWorldParams('lasius-niger', 1), generatorVersion: 1 })).toThrow(/not supported/);
  });
});

describe('seeds and archetype choice', () => {
  it('seed text: digits are the number, other text is FNV-1a', () => {
    expect(seedFromText('42')).toBe(42);
    expect(seedFromText('oak-17')).toBe(seedFromText('oak-17'));
    expect(seedFromText('oak-17')).not.toBe(seedFromText('oak-18'));
    expect(seedFromText('oak-17')).toBeGreaterThanOrEqual(0);
  });

  it('random archetypes follow the species fit (0 = never, Tier 1 only by default)', () => {
    const seen = new Set<string>();
    for (let s = 0; s < 300; s++) seen.add(pickArchetype('messor-barbarus', s));
    expect(seen.has('kitchen-door')).toBe(false); // fit 0 for Messor
    expect(seen.has('field-margin')).toBe(false); // T3
    for (let s = 0; s < 300; s++) expect(ARCHETYPES).toContain(pickArchetype('lasius-niger', s));
    expect(ARCHETYPE_DEFS['kitchen-door'].fit['messor-barbarus']).toBe(0);
  });
});
