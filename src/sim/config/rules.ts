// Custom rules of a game (GDD 06 §14.1, GDD 08 §3.7): validation of the player's overrides, defaults per preset,
// incompatibility handling, and their application to a GameConfig at game creation (season length 5 / 7 / 10, the
// starting season, the rival count, the world generator's copies). Pure data in, data out: no sim state.

import type {
  CustomRules, DifficultyId, GameConfig, Season, SeasonLengthDays, SpeciesId,
} from '@/sim/types';
import { SEASONS } from '@/sim/types';
import {
  DEFAULT_SEASON_LENGTH_DAYS, DIFFICULTY_PARAMS, invalidCustomRules, resolveRules, START_DAY_OF_SEASON_RULE, valueIn,
} from '@/sim/balance';
import { requireSpecies } from '@/sim/species';

/** Rules decided when the world is generated; the `setDifficulty` command never changes them mid-game. */
export const GENERATION_RULES: readonly (keyof CustomRules)[] = ['seasonLengthDays', 'startSeason', 'rivals'];

export type RuleIssueReason = 'unknown-or-invalid' | 'fixed-at-generation' | 'incompatible';

/** A problem with one rule; the rule is dropped (never thrown), the screen can show `detail`. */
export interface RuleIssue {
  key: string;
  reason: RuleIssueReason;
  detail: string;
}

export interface NormalizedRules {
  /** The overrides that were accepted (a subset of the input). */
  custom: Partial<CustomRules>;
  issues: RuleIssue[];
}

/**
 * Checks untyped overrides (URL flags, JSON, the New Game request): unknown rules and invalid values are dropped
 * with an issue; `undefined` clears a rule. `midGame` additionally refuses the fixed-at-generation rules.
 */
export function normalizeCustomRules(raw: unknown, midGame = false): NormalizedRules {
  const issues: RuleIssue[] = [];
  if (raw === undefined || raw === null) return { custom: {}, issues };
  const bad = new Set(invalidCustomRules(raw));
  if (bad.has('<not an object>')) return { custom: {}, issues: [{ key: '<rules>', reason: 'unknown-or-invalid', detail: 'rules must be an object' }] };
  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v === undefined) continue;
    if (bad.has(k)) { issues.push({ key: k, reason: 'unknown-or-invalid', detail: `${k}: ${JSON.stringify(v)} is not an allowed value` }); continue; }
    if (midGame && (GENERATION_RULES as readonly string[]).includes(k)) {
      issues.push({ key: k, reason: 'fixed-at-generation', detail: `${k} is fixed when the world is generated` });
      continue;
    }
    custom[k] = v;
  }
  return { custom: custom as Partial<CustomRules>, issues };
}

/** Effective rules of a preset with the given season length and no overrides. */
export function defaultRules(preset: DifficultyId, seasonLengthDays: SeasonLengthDays = DEFAULT_SEASON_LENGTH_DAYS as SeasonLengthDays): CustomRules {
  return resolveRules(preset, {}, seasonLengthDays);
}

/**
 * Incompatibilities between rules that survive validation. A combination that makes another rule meaningless is
 * reported (the other rule keeps its value; the accessors in balance/difficulty.ts already zero what cannot happen):
 * - `humanActivity: off` leaves nothing for the reactive bait stations of the preset;
 * - `predators: off` removes founding threats and flight hazards of the preset;
 * - `weatherSeverity: none` has no rain for `floodInflowMult` / `rainHitMult` to scale;
 * - `rivals: 0` also leaves out the preset's incipient conspecific foundations (accessor `incipientRivals`).
 */
export function ruleNotes(rules: CustomRules): RuleIssue[] {
  const notes: RuleIssue[] = [];
  if (rules.humanActivity === 'off') notes.push({ key: 'humanActivity', reason: 'incompatible', detail: 'People are off: no bait stations or human events.' });
  if (rules.predators === 'off') notes.push({ key: 'predators', reason: 'incompatible', detail: 'Predators are off: no founding threats and no flight hazards either.' });
  if (rules.rivals === 0) notes.push({ key: 'rivals', reason: 'incompatible', detail: 'No rival colonies: the young conspecific rivals are left out too, so there are no brood raids.' });
  if (rules.weatherSeverity === 'none') notes.push({ key: 'weatherSeverity', reason: 'incompatible', detail: 'No weather: only clear and overcast days, so no rain, flooding or storms.' });
  return notes;
}

/** Default-year start of a species converted to a season length: the season and the 1-based day in it. */
export function naturalStart(species: SpeciesId, seasonLengthDays: number): { season: Season; day: number } {
  const doy = requireSpecies(species).opening.startDoy.default; // default-year day of year (7-day seasons)
  const ref = DEFAULT_SEASON_LENGTH_DAYS;
  const dayInSeason = ((doy - 1) % ref) + 1;
  const day = Math.max(1, Math.min(seasonLengthDays, Math.round(1 + ((dayInSeason - 1) * seasonLengthDays) / ref)));
  return { season: SEASONS[Math.floor((doy - 1) / ref)], day };
}

/** The start day for a `startSeason` rule at a season length. `natural` = the species' founding day. */
export function startFor(species: SpeciesId, rule: CustomRules['startSeason'], seasonLengthDays: number): { season: Season; day: number } {
  if (rule === 'natural') return naturalStart(species, seasonLengthDays);
  return { season: rule, day: Math.min(seasonLengthDays, START_DAY_OF_SEASON_RULE) };
}

export interface AppliedRules {
  config: GameConfig;
  issues: RuleIssue[];
}

/**
 * Applies the player's rule overrides to a config at game creation: the preset's parameters, the effective rules,
 * the season length and starting season (the start day is re-derived for the new season length; the species start
 * hour is kept), and the world generator's copies of the rules (rival count, human activity) so the world is
 * generated with them. The config's own `difficulty.preset` is the preset; use `applyPreset` to change it.
 */
export function applyRules(config: GameConfig, raw: unknown): AppliedRules {
  const { custom, issues } = normalizeCustomRules(raw);
  const preset = config.difficulty.preset;
  const seasonLength = (custom.seasonLengthDays ?? config.rules.seasonLengthDays) as SeasonLengthDays;
  const rules = resolveRules(preset, custom, seasonLength);
  const params = JSON.parse(JSON.stringify(DIFFICULTY_PARAMS[preset])) as GameConfig['difficulty']['params'];
  const start = startFor(config.species, rules.startSeason, seasonLength);
  // a rule-less call keeps the config's own start (a test world or a lineage daughter may have set it)
  const keepStart = custom.seasonLengthDays === undefined && custom.startSeason === undefined;
  const difficulty = { preset, params, custom };
  const out: GameConfig = {
    ...config,
    difficulty,
    rules,
    ...(keepStart ? {} : { startSeason: start.season, startDayOfSeason: start.day }),
    world: {
      ...config.world, difficulty: preset, rivalCount: rules.rivals,
      incipientCount: valueIn({ difficulty, rules }, 'incipientRivals'), // 0 when the rival count is 0
      humanActivity: rules.humanActivity,
    },
  };
  issues.push(...ruleNotes(rules));
  return { config: out, issues };
}

/** A different preset for a config (before the world is generated): its parameters and rules replace the old ones. */
export function applyPreset(config: GameConfig, preset: DifficultyId, raw?: unknown): AppliedRules {
  return applyRules({ ...config, difficulty: { ...config.difficulty, preset } }, raw);
}
