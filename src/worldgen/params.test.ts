// One source of truth for rival count, human activity and difficulty (balance presets and config.rules win).
import { describe, expect, it } from 'vitest';
import { DIFFICULTY_IDS } from '@/sim/types';
import { DIFFICULTY_PARAMS, presetHumanActivity, presetRivals, resolveRules } from '@/sim/balance';
import { defaultGameConfig, syncWorldParams } from '@/sim/createGame';
import { defaultWorldParams } from './params';

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
