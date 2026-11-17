// Adversarial checks of the difficulty accessors (difficulty-rules review). Tests that FAIL here demonstrate a real
// defect and are left in place for the fixer; the others are regression tests.
//
// Spec basis: GDD 04 §15.7 "Custom rule `humanActivity`: off 0, low 0.5, normal 1.0, high 1.5 REPLACES HUMAN_FREQ_MULT";
// GDD 08 §3.7 preset table: human activity Gentle Low / Naturalist Normal / Harsh High; GDD 06 §14.1 predators
// replace predatorDensityMult. A rule value must mean the same thing whichever preset it is picked on, and picking
// the value the preset already shows must change nothing.

import { describe, expect, it } from 'vitest';
import type { CustomRules, DifficultyId, GameConfig } from '@/sim/types';
import {
  FOUNDING_LENIENCIES, HUMAN_ACTIVITY_LEVELS, PREDATOR_SETTINGS, WEATHER_SEVERITIES,
} from '@/sim/types';
import { defaultGameConfig } from '@/sim/createGame';
import { applyRules } from '@/sim/config/rules';
import { HUMAN_ACTIVITY_MULT } from './human';
import { PREDATOR_SETTING_MULT } from './creatures';
import {
  DIFFICULTY_KEYS, DIFFICULTY_PARAMS, effectiveParams, invalidCustomRules, presetRuleValues, valueIn,
} from './difficulty';

const PRESETS: readonly DifficultyId[] = ['gentle', 'naturalist', 'harsh'];

/** What the New Game form sends: only the rules that differ from the preset's shown value (ui/screens/newgame/form.ts). */
function newGameConfig(preset: DifficultyId, picked: Partial<CustomRules>): GameConfig {
  const shown = presetRuleValues(preset) as unknown as Record<string, unknown>;
  const overrides: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(picked)) if (shown[k] !== v) overrides[k] = v;
  return applyRules(defaultGameConfig('lasius-niger', 1, preset), overrides).config;
}

describe('humanActivity means the same on every preset (GDD 04 §15.7 replaces HUMAN_FREQ_MULT)', () => {
  it.each(PRESETS)('%s: each New Game choice gives HUMAN_ACTIVITY_MULT[choice]', (preset) => {
    const got: Record<string, number> = {};
    const want: Record<string, number> = {};
    for (const level of HUMAN_ACTIVITY_LEVELS) {
      got[level] = valueIn(newGameConfig(preset, { humanActivity: level }), 'humanFreqMult');
      want[level] = HUMAN_ACTIVITY_MULT[level];
    }
    // FAILS on gentle (normal -> 0.5, low == normal) and harsh (normal -> 1.5): the presets imply 'normal'
    expect(got).toEqual(want);
  });

  it.each(PRESETS)('%s: setting the rule to the value the preset shows changes no parameter', (preset) => {
    const implicit = applyRules(defaultGameConfig('lasius-niger', 1, preset), {}).config;
    for (const key of ['predators', 'humanActivity', 'weatherSeverity', 'foundingLeniency'] as const) {
      const shown = presetRuleValues(preset)[key];
      const explicit = applyRules(defaultGameConfig('lasius-niger', 1, preset), { [key]: shown }).config;
      // FAILS on gentle humanActivity: explicit 'normal' (e.g. from setDifficulty mid-game) -> 1.0, implicit -> 0.5
      expect(effectiveParams(explicit), `${preset} ${key}=${String(shown)}`).toEqual(effectiveParams(implicit));
    }
  });

  it('the preset rule values follow GDD 08 §3.7 for human activity (Low / Normal / High)', () => {
    // FAILS: PRESET_RULES keeps 'normal' on gentle and harsh; the replacement mapping makes low/high exact (no double count)
    expect(PRESETS.map((p) => presetRuleValues(p).humanActivity)).toEqual(['low', 'normal', 'high']);
    // and those values reproduce the preset's own HUMAN_FREQ_MULT, as predators already do for predatorDensityMult
    for (const p of PRESETS) {
      expect(PREDATOR_SETTING_MULT[presetRuleValues(p).predators]).toBe(DIFFICULTY_PARAMS[p].predatorDensityMult);
    }
  });
});

describe('every rule combination gives finite, table-shaped values', () => {
  it('no NaN, no undefined, same types as the table, for all presets x predators x people x weather x leniency x rivals', () => {
    let n = 0;
    for (const preset of PRESETS) {
      for (const predators of PREDATOR_SETTINGS) for (const humanActivity of HUMAN_ACTIVITY_LEVELS)
        for (const weatherSeverity of WEATHER_SEVERITIES) for (const foundingLeniency of FOUNDING_LENIENCIES)
          for (const rivals of [0, 2, 4]) {
            const cfg = applyRules(defaultGameConfig('lasius-niger', 1, preset), { predators, humanActivity, weatherSeverity, foundingLeniency, rivals }).config;
            const p = effectiveParams(cfg) as unknown as Record<string, unknown>;
            for (const k of DIFFICULTY_KEYS) {
              const v = p[k];
              const ref = (DIFFICULTY_PARAMS[preset] as unknown as Record<string, unknown>)[k];
              expect(typeof v, k).toBe(typeof ref);
              if (typeof v === 'number') expect(Number.isFinite(v) && v >= (k === 'heatToleranceOffsetC' ? -10 : 0), `${k}=${v}`).toBe(true);
            }
            n++;
          }
    }
    expect(n).toBe(3 * 4 * 4 * 4 * 3 * 3);
  });

  it('predators off / people off / rivals 0 zero their parameters on every preset; turning them back restores the preset', () => {
    for (const preset of PRESETS) {
      const off = applyRules(defaultGameConfig('lasius-niger', 1, preset), { predators: 'off', humanActivity: 'off', rivals: 0 }).config;
      expect(valueIn(off, 'predatorDensityMult')).toBe(0);
      expect(valueIn(off, 'openingThreatsMax')).toBe(0);
      expect(valueIn(off, 'flightPredatorEvents')).toEqual([0, 0]);
      expect(valueIn(off, 'humanFreqMult')).toBe(0);
      expect(valueIn(off, 'baitEnabled')).toBe('off');
      expect(valueIn(off, 'incipientRivals')).toBe(0);
      // mid-game the override is removed (setDifficulty drops undefined keys): the preset comes back
      const back: GameConfig = { ...off, difficulty: { ...off.difficulty, custom: {} }, rules: { ...off.rules, predators: presetRuleValues(preset).predators, humanActivity: presetRuleValues(preset).humanActivity } };
      expect(valueIn(back, 'predatorDensityMult')).toBe(DIFFICULTY_PARAMS[preset].predatorDensityMult);
      expect(valueIn(back, 'humanFreqMult')).toBe(DIFFICULTY_PARAMS[preset].humanFreqMult);
      expect(valueIn(back, 'baitEnabled')).toBe(DIFFICULTY_PARAMS[preset].baitEnabled);
    }
  });
});

describe('rule validation of untyped JSON (debug API, URL flags)', () => {
  it.each(['toString', 'constructor', 'hasOwnProperty', '__proto__', 'valueOf'])('a key named %s is an unknown rule, without throwing', (key) => {
    const raw = JSON.parse(`{"${key}": 1}`) as unknown;
    // FAILS: Object.prototype members pass the RULE_VALUES lookup (accepted as rules) or are called and throw
    expect(() => invalidCustomRules(raw)).not.toThrow();
    expect(invalidCustomRules(raw)).toEqual([key]);
  });
});
