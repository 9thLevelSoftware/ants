// difficultyValue / effectiveParams: default rules return the stored preset values untouched; each custom rule
// reaches exactly the parameters GDD 06 §14.1 names; mid-game changes act at once. Config-level (no world, no sim).

import { describe, expect, it } from 'vitest';
import type { CustomRules, DifficultyId, GameConfig } from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { applyRules } from '@/sim/config/rules';
import {
  DIFFICULTY_KEYS, DIFFICULTY_PARAMS, difficultyValue, effectiveParams, effectiveRule, resolveRules, type DifficultyKey,
} from './difficulty';

const PRESETS: readonly DifficultyId[] = ['gentle', 'naturalist', 'harsh'];

function cfgOf(preset: DifficultyId, custom: Partial<CustomRules> = {}): GameConfig {
  return applyRules(defaultGameConfig('lasius-niger', 1, preset), custom).config;
}
const src = (config: GameConfig) => ({ state: { config } });

const WEATHER: DifficultyKey[] = ['rainFreqMult', 'stormFreqMult', 'heatWaveFreqMult', 'heatOffsetMult', 'frostFreqMult', 'rainHitMult', 'floodInflowMult'];
const FOUNDING: DifficultyKey[] = ['foundingExposureRate', 'foundingBroodMortalityMult', 'reserveDrainMult', 'openingThreatsMax', 'openingInterruptMax', 'openingGraceGd', 'openingRetries', 'forecastPanel'];

describe('difficultyValue with default rules', () => {
  it.each(PRESETS)('%s: every key returns the stored preset value, and effectiveParams equals the table', (preset) => {
    const config = cfgOf(preset);
    for (const k of DIFFICULTY_KEYS) expect(difficultyValue(src(config), k), k).toEqual(DIFFICULTY_PARAMS[preset][k]);
    expect(effectiveParams(config)).toEqual(DIFFICULTY_PARAMS[preset]);
  });

  it('reads the stored params, not the table (a test or a mid-game edit of the params is honoured)', () => {
    const config = cfgOf('naturalist');
    config.difficulty.params.rainHitMult = 7;
    expect(difficultyValue(src(config), 'rainHitMult')).toBe(7);
  });
});

describe('weatherSeverity (GDD 06 §14.1)', () => {
  const factor = { none: 0, mild: 0.6, normal: 1, severe: 1.4 } as const;
  it.each(['mild', 'severe'] as const)('%s scales the seven weather parameters of the preset and nothing else', (sev) => {
    for (const preset of PRESETS) {
      const config = cfgOf(preset, { weatherSeverity: sev });
      for (const k of WEATHER) expect(difficultyValue(src(config), k) as number, `${preset} ${k}`).toBeCloseTo((DIFFICULTY_PARAMS[preset][k] as number) * factor[sev], 12);
      for (const k of DIFFICULTY_KEYS) if (!WEATHER.includes(k)) expect(difficultyValue(src(config), k), k).toEqual(DIFFICULTY_PARAMS[preset][k]);
    }
  });

  it('none: no rain, storms, heat or frost; the heat offset (temperature curve) is unchanged', () => {
    const config = cfgOf('harsh', { weatherSeverity: 'none' });
    for (const k of WEATHER) {
      const v = difficultyValue(src(config), k) as number;
      expect(v, k).toBe(k === 'heatOffsetMult' ? DIFFICULTY_PARAMS.harsh.heatOffsetMult : 0);
    }
    expect(effectiveRule(config, 'weatherSeverity')).toBe('none');
  });
});

describe('predators', () => {
  it.each([['off', 0], ['few', 0.4], ['normal', 1], ['many', 1.6]] as const)('%s -> predatorDensityMult %s on every preset', (setting, mult) => {
    for (const preset of PRESETS) expect(difficultyValue(src(cfgOf(preset, { predators: setting })), 'predatorDensityMult')).toBe(mult);
  });

  it('off removes founding threats and flight hazards; the other settings leave them to the preset', () => {
    const off = cfgOf('harsh', { predators: 'off' });
    expect(difficultyValue(src(off), 'openingThreatsMax')).toBe(0);
    expect(difficultyValue(src(off), 'flightPredatorEvents')).toEqual([0, 0]);
    const many = cfgOf('gentle', { predators: 'many' });
    expect(difficultyValue(src(many), 'openingThreatsMax')).toBe(DIFFICULTY_PARAMS.gentle.openingThreatsMax);
    expect(difficultyValue(src(many), 'flightPredatorEvents')).toEqual(DIFFICULTY_PARAMS.gentle.flightPredatorEvents);
  });
});

describe('humanActivity (GDD 04 §15.7: replaces HUMAN_FREQ_MULT; lethality and telegraph still follow the difficulty)', () => {
  it.each([['off', 0], ['low', 0.5], ['normal', 1], ['high', 1.5]] as const)('%s -> humanFreqMult %s even on a preset that implies another', (level, mult) => {
    for (const preset of PRESETS) {
      const config = cfgOf(preset, { humanActivity: level });
      expect(difficultyValue(src(config), 'humanFreqMult')).toBe(mult);
      expect(difficultyValue(src(config), 'humanLethalMult')).toBe(DIFFICULTY_PARAMS[preset].humanLethalMult);
      expect(difficultyValue(src(config), 'humanTelegraphMult')).toBe(DIFFICULTY_PARAMS[preset].humanTelegraphMult);
    }
  });

  it('off also removes the reactive bait stations; the other levels keep the preset\'s', () => {
    expect(difficultyValue(src(cfgOf('harsh', { humanActivity: 'off' })), 'baitEnabled')).toBe('off');
    expect(difficultyValue(src(cfgOf('harsh', { humanActivity: 'high' })), 'baitEnabled')).toBe('interior-garden');
  });
});

describe('rivals', () => {
  it('0 rival colonies leaves out the incipient conspecific foundations; any other count keeps the preset\'s', () => {
    for (const preset of PRESETS) {
      expect(difficultyValue(src(cfgOf(preset, { rivals: 0 })), 'incipientRivals')).toBe(0);
      expect(difficultyValue(src(cfgOf(preset, { rivals: 2 })), 'incipientRivals')).toBe(DIFFICULTY_PARAMS[preset].incipientRivals);
    }
  });
});

describe('foundingLeniency (the Founding group of the gentle / naturalist / harsh column)', () => {
  it.each([['lenient', 'gentle'], ['normal', 'naturalist'], ['strict', 'harsh']] as const)('%s on every preset = the %s founding group', (leniency, column) => {
    for (const preset of PRESETS) {
      const config = cfgOf(preset, { foundingLeniency: leniency });
      for (const k of FOUNDING) expect(difficultyValue(src(config), k), `${preset}/${leniency} ${k}`).toEqual(DIFFICULTY_PARAMS[column][k]);
      for (const k of DIFFICULTY_KEYS) if (!FOUNDING.includes(k)) expect(difficultyValue(src(config), k), k).toEqual(DIFFICULTY_PARAMS[preset][k]);
    }
  });

  it('predators off still wins over a strict founding for the threat count', () => {
    expect(difficultyValue(src(cfgOf('naturalist', { foundingLeniency: 'strict', predators: 'off' })), 'openingThreatsMax')).toBe(0);
  });
});

describe('changes after creation (setDifficulty keeps rules and custom up to date)', () => {
  it('a rule changed mid-game acts on the next read', () => {
    const config = cfgOf('naturalist');
    expect(difficultyValue(src(config), 'predatorDensityMult')).toBe(1);
    config.difficulty.custom = { ...config.difficulty.custom, predators: 'off' };
    config.rules = resolveRules('naturalist', config.difficulty.custom, config.rules.seasonLengthDays);
    expect(difficultyValue(src(config), 'predatorDensityMult')).toBe(0);
  });

  it('rules alone (no custom record) are enough: the effective rules in force win', () => {
    const config = cfgOf('naturalist');
    config.rules = { ...config.rules, humanActivity: 'off' };
    expect(difficultyValue(src(config), 'humanFreqMult')).toBe(0);
  });
});

describe('values the Appendix E checks of other chapters derive from the table', () => {
  const v = (preset: DifficultyId, key: DifficultyKey, rules: Partial<CustomRules> = {}) => difficultyValue(src(cfgOf(preset, rules)), key);

  it('GDD 04 E12: footsteps telegraph 3.0 s on naturalist, 4.5 s on gentle, 2.25 s on harsh (lead x humanTelegraphMult)', () => {
    expect([3.0 * (v('gentle', 'humanTelegraphMult') as number), 3.0 * (v('naturalist', 'humanTelegraphMult') as number), 3.0 * (v('harsh', 'humanTelegraphMult') as number)]).toEqual([4.5, 3, 2.25]);
  });

  it('GDD 04 E16 / E23: gentle places no bait and sees half the human events of naturalist', () => {
    expect(v('gentle', 'baitEnabled')).toBe('off');
    expect(v('naturalist', 'baitEnabled')).toBe('interior');
    expect((v('gentle', 'humanFreqMult') as number) / (v('naturalist', 'humanFreqMult') as number)).toBe(0.5);
  });

  it('GDD 03 E24 / 06 §14.1: nest collapse is off on gentle, on elsewhere, and the toggle overrides', () => {
    expect(effectiveRule(cfgOf('gentle'), 'collapse')).toBe(false);
    expect(effectiveRule(cfgOf('naturalist'), 'collapse')).toBe(true);
    expect(effectiveRule(cfgOf('gentle', { collapse: true }), 'collapse')).toBe(true);
    expect(effectiveRule(cfgOf('harsh', { collapse: false }), 'collapse')).toBe(false);
  });

  it('GDD 05 E25: the quiet-share targets are 0.75 / 0.60 / 0.40', () => {
    expect(PRESETS.map((p) => v(p, 'quietShareMin'))).toEqual([0.75, 0.6, 0.4]);
  });

  it('GDD 01 E25: the possessed ant\'s cold-speed floor is 0.5 on naturalist (6 BU/s x 0.5 = 3 BU/s)', () => {
    expect(v('naturalist', 'playerTempFloor')).toBe(0.5);
  });

  it('rules not tied to a parameter are read as given: winter mode, founding assist, senescence, extinction', () => {
    const config = cfgOf('harsh', { winterMode: 'realtime', foundingAssist: true, queenSenescence: false, extinctionEndsGame: false });
    expect([effectiveRule(config, 'winterMode'), effectiveRule(config, 'foundingAssist'), effectiveRule(config, 'queenSenescence'), effectiveRule(config, 'extinctionEndsGame')]).toEqual(['realtime', true, false, false]);
  });
});
