// Difficulty presets (GDD 06 §14 table; values owned by GDD 04 §15.7 and GDD 05 §5; registry C10, C11).
// The ONE table of tuned values per preset, the rule values each preset implies, and the accessors every system
// reads them through: `difficultyValue(sim, key)` (parameters, with the custom rules applied) and
// `effectiveRule(config, key)` (rules). Systems never read `config.difficulty.params` directly.

import type { CustomRules, DifficultyId, DifficultyParams, GameConfig } from '@/sim/types';
import { HUMAN_ACTIVITY_MULT } from './human';
import { PREDATOR_SETTING_MULT } from './creatures';
import { SEVERITY_MULT } from './environmentWeather';
import {
  FOUNDING_LENIENCIES, HUMAN_ACTIVITY_LEVELS, PREDATOR_SETTINGS, SEASON_LENGTHS, START_SEASON_RULES,
  WEATHER_SEVERITIES, WINTER_RULES,
} from '@/sim/types';

export const DIFFICULTY_PARAMS: Record<DifficultyId, DifficultyParams> = {
  gentle: {
    foundingExposureRate: 0.5, foundingBroodMortalityMult: 0.7, reserveDrainMult: 0.85, openingThreatsMax: 0,
    openingInterruptMax: 0, openingGraceGd: 0.6, openingRetries: 3, forecastPanel: true,
    rainFreqMult: 0.8, stormFreqMult: 0.5, heatWaveFreqMult: 0.7, heatOffsetMult: 0.7, frostFreqMult: 0.7,
    pDrySpell: 0.25, rainHitMult: 0.6, floodInflowMult: 0.7, heatToleranceOffsetC: 2,
    predatorDensityMult: 0.4, rivalAggMult: 0.7, raidCooldownGd: 4, rivalKMult: 0.6, incipientRivals: 1,
    humanFreqMult: 0.5, humanLethalMult: 0.4, humanTelegraphMult: 1.5, baitEnabled: 'off',
    threatMinQuietGd: 1.0, quietShareMin: 0.75,
    foodAbundanceMult: 1.3, honeydewYieldMult: 1.2,
    broodSurvivalMult: 1.15, workerLifespanMult: 1.2, starvationToleranceMult: 1.3, queenLifespanMult: 1.5,
    winterLossMult: 0.5, winterQueenDeathP: 0, orphanDeclineMult: 0.7, damageTakenMult: 0.75,
    matureGateMult: 0.8, alateCapMult: 1.2, flightLossMult: 0.7, flightPredatorEvents: [0, 1],
    autoSlowDefault: 'pause', alertLeadWarnings: 'strong', playerTempFloor: 0.6,
  },
  naturalist: {
    foundingExposureRate: 1.0, foundingBroodMortalityMult: 1.0, reserveDrainMult: 1.0, openingThreatsMax: 2,
    openingInterruptMax: 2, openingGraceGd: 0.3, openingRetries: 1, forecastPanel: true,
    rainFreqMult: 1.0, stormFreqMult: 1.0, heatWaveFreqMult: 1.0, heatOffsetMult: 1.0, frostFreqMult: 1.0,
    pDrySpell: 0.5, rainHitMult: 1.0, floodInflowMult: 1.0, heatToleranceOffsetC: 0,
    predatorDensityMult: 1.0, rivalAggMult: 1.0, raidCooldownGd: 2, rivalKMult: 1.0, incipientRivals: 2,
    humanFreqMult: 1.0, humanLethalMult: 1.0, humanTelegraphMult: 1.0, baitEnabled: 'interior',
    threatMinQuietGd: 0.5, quietShareMin: 0.6,
    foodAbundanceMult: 1.0, honeydewYieldMult: 1.0,
    broodSurvivalMult: 1.0, workerLifespanMult: 1.0, starvationToleranceMult: 1.0, queenLifespanMult: 1.0,
    winterLossMult: 1.0, winterQueenDeathP: 0.03, orphanDeclineMult: 1.0, damageTakenMult: 1.0,
    matureGateMult: 1.0, alateCapMult: 1.0, flightLossMult: 1.0, flightPredatorEvents: [1, 3],
    autoSlowDefault: 'slow', alertLeadWarnings: 'normal', playerTempFloor: 0.5,
  },
  harsh: {
    foundingExposureRate: 1.3, foundingBroodMortalityMult: 1.3, reserveDrainMult: 1.15, openingThreatsMax: 4,
    openingInterruptMax: 3, openingGraceGd: 0.15, openingRetries: 0, forecastPanel: false,
    rainFreqMult: 1.2, stormFreqMult: 1.6, heatWaveFreqMult: 1.3, heatOffsetMult: 1.25, frostFreqMult: 1.3,
    pDrySpell: 0.7, rainHitMult: 1.3, floodInflowMult: 1.4, heatToleranceOffsetC: -1,
    predatorDensityMult: 1.6, rivalAggMult: 1.2, raidCooldownGd: 1, rivalKMult: 1.3, incipientRivals: 3,
    humanFreqMult: 1.5, humanLethalMult: 1.2, humanTelegraphMult: 0.75, baitEnabled: 'interior-garden',
    threatMinQuietGd: 0.25, quietShareMin: 0.4,
    foodAbundanceMult: 0.75, honeydewYieldMult: 0.85,
    broodSurvivalMult: 0.85, workerLifespanMult: 0.85, starvationToleranceMult: 0.8, queenLifespanMult: 0.7,
    winterLossMult: 1.5, winterQueenDeathP: 0.06, orphanDeclineMult: 1.3, damageTakenMult: 1.0,
    matureGateMult: 1.2, alateCapMult: 0.9, flightLossMult: 1.25, flightPredatorEvents: [3, 5],
    autoSlowDefault: 'slow', alertLeadWarnings: 'minimal', playerTempFloor: 0.3,
  },
};

/** Rule values each preset implies (GDD 06 §14 / §14.1); `seasonLengthDays` and `startSeason` are not preset-bound. */
const PRESET_RULES: Record<DifficultyId, Omit<CustomRules, 'seasonLengthDays' | 'startSeason'>> = {
  gentle: {
    predators: 'few', rivals: 2, humanActivity: 'normal', weatherSeverity: 'normal', foundingLeniency: 'lenient',
    winterMode: 'timelapse', foundingAssist: true, queenSenescence: false, collapse: false, extinctionEndsGame: true,
  },
  naturalist: {
    predators: 'normal', rivals: 3, humanActivity: 'normal', weatherSeverity: 'normal', foundingLeniency: 'normal',
    winterMode: 'timelapse', foundingAssist: true, queenSenescence: false, collapse: true, extinctionEndsGame: true,
  },
  harsh: {
    predators: 'many', rivals: 4, humanActivity: 'normal', weatherSeverity: 'normal', foundingLeniency: 'strict',
    winterMode: 'timelapse', foundingAssist: false, queenSenescence: true, collapse: true, extinctionEndsGame: true,
  },
};

/** Effective rules: the preset's rules, the given season settings, then the player's overrides. */
export function resolveRules(
  preset: DifficultyId, custom: Partial<CustomRules>, seasonLengthDays: CustomRules['seasonLengthDays'],
): CustomRules {
  const out: CustomRules = { ...PRESET_RULES[preset], seasonLengthDays, startSeason: 'natural' };
  for (const k of Object.keys(custom) as (keyof CustomRules)[]) {
    const v = custom[k];
    if (v !== undefined) (out as unknown as Record<string, unknown>)[k] = v;
  }
  return out;
}

/** Highest established rival count of the custom rule (GDD 06 §14.1: 0-4). */
export const MAX_RIVALS = 4;

/** Rival colonies a preset sites by default (worldgen reads this; the custom rule `rivals` overrides it). */
export function presetRivals(preset: DifficultyId): number {
  return PRESET_RULES[preset].rivals;
}

/** Human activity level a preset implies (the custom rule `humanActivity` overrides it, D4.18). */
export function presetHumanActivity(preset: DifficultyId): CustomRules['humanActivity'] {
  return PRESET_RULES[preset].humanActivity;
}

/** Allowed values of each custom rule, for checking overrides that arrive as untyped JSON. */
const RULE_VALUES: { [K in keyof CustomRules]: (v: unknown) => boolean } = {
  predators: (v) => isIn(PREDATOR_SETTINGS, v),
  rivals: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= MAX_RIVALS,
  humanActivity: (v) => isIn(HUMAN_ACTIVITY_LEVELS, v),
  weatherSeverity: (v) => isIn(WEATHER_SEVERITIES, v),
  seasonLengthDays: (v) => isIn(SEASON_LENGTHS, v),
  startSeason: (v) => isIn(START_SEASON_RULES, v),
  foundingLeniency: (v) => isIn(FOUNDING_LENIENCIES, v),
  winterMode: (v) => isIn(WINTER_RULES, v),
  foundingAssist: (v) => typeof v === 'boolean',
  queenSenescence: (v) => typeof v === 'boolean',
  collapse: (v) => typeof v === 'boolean',
  extinctionEndsGame: (v) => typeof v === 'boolean',
};

function isIn(set: readonly (string | number)[], v: unknown): boolean {
  return (typeof v === 'string' || typeof v === 'number') && set.includes(v);
}

/**
 * Checks rule overrides that may come from untyped JSON. Returns the bad keys (unknown rule or invalid value),
 * empty when every given value is valid; `undefined` values are allowed (they clear an override).
 */
export function invalidCustomRules(custom: unknown): string[] {
  if (typeof custom !== 'object' || custom === null || Array.isArray(custom)) return ['<not an object>'];
  const bad: string[] = [];
  for (const [k, v] of Object.entries(custom)) {
    const check = (RULE_VALUES as Record<string, ((v: unknown) => boolean) | undefined>)[k];
    if (!check || (v !== undefined && !check(v))) bad.push(k);
  }
  return bad;
}

// ---- accessors -------------------------------------------------------------------------------------------------

/** Every tuned parameter of a preset (the keys of the table). */
export type DifficultyKey = keyof DifficultyParams;

/** The slice of a config the accessors read. */
export type DifficultyConfig = Pick<GameConfig, 'difficulty' | 'rules'>;

/** Anything that carries the game config: the `Sim`, or a bare `{ state: { config } }` in tests. */
export interface DifficultySource { state: { config: DifficultyConfig } }

/** Rule values a preset implies, for the rules that can be overridden (everything but the fixed-at-generation ones). */
export function presetRuleValues(preset: DifficultyId): Omit<CustomRules, 'seasonLengthDays' | 'startSeason'> {
  return { ...PRESET_RULES[preset] };
}

/** Preset whose column supplies the founding parameter group for each `foundingLeniency` value (GDD 06 §14.1). */
export const LENIENCY_PRESET: Record<CustomRules['foundingLeniency'], DifficultyId> = {
  lenient: 'gentle', normal: 'naturalist', strict: 'harsh',
};

/** Day of the season a game starts on when the custom rule `startSeason` names a season (GDD 06 §1.6). */
export const START_DAY_OF_SEASON_RULE = 3;

/** Season length the preset tables and the `HUMAN_GRACE_GD` constant are written for (GDD 06 §1.7). */
export const OPENING_GRACE_REF_GD = DIFFICULTY_PARAMS.naturalist.openingGraceGd;

/**
 * How a custom rule reaches a parameter. `plain`: the preset value as stored. `founding`: the Founding group of
 * the `foundingLeniency` column. `weather`: scaled by `weatherSeverity` (GDD 06 §14.1). `predators` / `human`:
 * replaced by the rule's setting. The two `*-linked` groups are zeroed by `predators: off` / `humanActivity: off`
 * (no founding threats, no flight hazards, no reactive bait stations).
 */
type Group = 'plain' | 'founding' | 'founding+predators' | 'weather' | 'predators' | 'predators-events' | 'human' | 'human-bait';

const KEY_GROUP: { [K in DifficultyKey]: Group } = {
  foundingExposureRate: 'founding', foundingBroodMortalityMult: 'founding', reserveDrainMult: 'founding',
  openingThreatsMax: 'founding+predators', openingInterruptMax: 'founding', openingGraceGd: 'founding',
  openingRetries: 'founding', forecastPanel: 'founding',
  rainFreqMult: 'weather', stormFreqMult: 'weather', heatWaveFreqMult: 'weather', heatOffsetMult: 'weather',
  frostFreqMult: 'weather', pDrySpell: 'plain', rainHitMult: 'weather', floodInflowMult: 'weather',
  heatToleranceOffsetC: 'plain',
  predatorDensityMult: 'predators', rivalAggMult: 'plain', raidCooldownGd: 'plain', rivalKMult: 'plain',
  incipientRivals: 'plain', humanFreqMult: 'human', humanLethalMult: 'plain', humanTelegraphMult: 'plain',
  baitEnabled: 'human-bait', threatMinQuietGd: 'plain', quietShareMin: 'plain',
  foodAbundanceMult: 'plain', honeydewYieldMult: 'plain',
  broodSurvivalMult: 'plain', workerLifespanMult: 'plain', starvationToleranceMult: 'plain', queenLifespanMult: 'plain',
  winterLossMult: 'plain', winterQueenDeathP: 'plain', orphanDeclineMult: 'plain', damageTakenMult: 'plain',
  matureGateMult: 'plain', alateCapMult: 'plain', flightLossMult: 'plain', flightPredatorEvents: 'predators-events',
  autoSlowDefault: 'plain', alertLeadWarnings: 'plain', playerTempFloor: 'plain',
};

/** Every key of the table, in table order. */
export const DIFFICULTY_KEYS = Object.keys(KEY_GROUP) as DifficultyKey[];

const NO_FLIGHT_PREDATORS: [number, number] = [0, 0];

/**
 * The value of a rule in force: the player's explicit override (`difficulty.custom`) first, else the effective
 * rules (`config.rules`, which `resolveRules` and the `setDifficulty` command keep up to date).
 */
export function effectiveRule<K extends keyof CustomRules>(cfg: DifficultyConfig, key: K): CustomRules[K] {
  const own = cfg.difficulty.custom?.[key];
  return own !== undefined ? own : cfg.rules[key];
}

/**
 * The rule departs from what the preset implies, or the player set it explicitly: only then does it override the
 * preset's parameter. With default rules every accessor therefore returns the stored preset value untouched.
 */
function overrides(cfg: DifficultyConfig, key: 'predators' | 'humanActivity' | 'weatherSeverity' | 'foundingLeniency'): boolean {
  if (cfg.difficulty.custom?.[key] !== undefined) return true;
  return cfg.rules[key] !== PRESET_RULES[cfg.difficulty.preset][key];
}

/** Scale of the weather parameters from `weatherSeverity`; `none` leaves the heat offset (temperature curve) alone. */
function severityScale(cfg: DifficultyConfig, key: DifficultyKey): number {
  if (!overrides(cfg, 'weatherSeverity')) return 1;
  const s = SEVERITY_MULT[effectiveRule(cfg, 'weatherSeverity')] ?? 1;
  return s === 0 && key === 'heatOffsetMult' ? 1 : s;
}

function predatorsOff(cfg: DifficultyConfig): boolean {
  return effectiveRule(cfg, 'predators') === 'off';
}

/** The value of one tuned parameter for this game, custom rules applied (the single read path for systems). */
export function difficultyValue<K extends DifficultyKey>(src: DifficultySource, key: K): DifficultyParams[K] {
  return valueIn(src.state.config, key);
}

/** `difficultyValue` for a bare config (display, tests, the New Game screen). */
export function valueIn<K extends DifficultyKey>(cfg: DifficultyConfig, key: K): DifficultyParams[K] {
  const base = cfg.difficulty.params[key];
  const group = KEY_GROUP[key];
  if (group === 'plain') return base;
  let out: unknown = base;
  switch (group) {
    case 'founding':
    case 'founding+predators':
      if (overrides(cfg, 'foundingLeniency')) out = DIFFICULTY_PARAMS[LENIENCY_PRESET[effectiveRule(cfg, 'foundingLeniency')]][key];
      if (group === 'founding+predators' && predatorsOff(cfg)) out = 0;
      break;
    case 'weather': {
      const s = severityScale(cfg, key);
      if (s !== 1) out = (base as number) * s;
      break;
    }
    case 'predators':
      if (overrides(cfg, 'predators')) out = PREDATOR_SETTING_MULT[effectiveRule(cfg, 'predators')] ?? base;
      break;
    case 'predators-events':
      if (predatorsOff(cfg)) out = NO_FLIGHT_PREDATORS;
      break;
    case 'human':
      if (overrides(cfg, 'humanActivity')) out = HUMAN_ACTIVITY_MULT[effectiveRule(cfg, 'humanActivity')] ?? base;
      break;
    case 'human-bait':
      if (effectiveRule(cfg, 'humanActivity') === 'off') out = 'off';
      break;
  }
  return out as DifficultyParams[K];
}

/** The whole parameter record in force (a fresh object; not for hot paths). */
export function effectiveParams(cfg: DifficultyConfig): DifficultyParams {
  const out: Record<string, unknown> = {};
  for (const k of DIFFICULTY_KEYS) out[k] = valueIn(cfg, k);
  return out as unknown as DifficultyParams;
}
