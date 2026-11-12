// New Game form state and the request it produces (GDD 08 3.7). Pure; the screen only binds controls to it.
import { signal } from '@preact/signals';
import type { ArchetypeId, CustomRules, DifficultyId, SpeciesId, StartSeasonRule, WorldSizeId } from '@/sim/types';
import { ARCHETYPES } from '@/sim/types';
import { resolveRules } from '@/sim/balance/difficulty';
import { pickArchetype } from '@/worldgen/params';
import { ARCHETYPE_DEFS } from '@/worldgen/tuning/archetypes';
import type { NewGameRequest } from '../../api';
import { randomSeedText, resolveSeed } from './seed';

/** The custom rules the screen edits (GDD 08 3.7 table); the others keep the preset's value. */
export const RULE_KEYS = ['predators', 'rivals', 'humanActivity', 'weatherSeverity', 'seasonLengthDays', 'foundingLeniency', 'collapse'] as const;
export type RuleKey = (typeof RULE_KEYS)[number];
export type EditableRules = Pick<CustomRules, RuleKey>;

export interface NewGameForm {
  species: SpeciesId;
  archetype: ArchetypeId | 'random';
  size: WorldSizeId;
  seedText: string;
  startSeason: StartSeasonRule;
  /** The preset the rules started from; `custom` is shown when `rules` differ from it. */
  preset: DifficultyId;
  rules: EditableRules;
  hints: boolean;
}

/** Locality archetypes offered (tier 1; the later field margin is not listed, GDD 08 3.7). */
export const LOCALITY_ARCHETYPES: readonly ArchetypeId[] = ARCHETYPES.filter((a) => ARCHETYPE_DEFS[a].tier === 1);

/** Rule values a preset implies, straight from the balance table so the screen shows what the game applies. */
export function presetRules(preset: DifficultyId): EditableRules {
  const r = resolveRules(preset, {}, 7);
  return {
    predators: r.predators, rivals: r.rivals, humanActivity: r.humanActivity, weatherSeverity: r.weatherSeverity,
    seasonLengthDays: r.seasonLengthDays, foundingLeniency: r.foundingLeniency, collapse: r.collapse,
  };
}

export function defaultForm(seedText: string = randomSeedText()): NewGameForm {
  return {
    species: 'lasius-niger', archetype: 'suburban-garden', size: 'standard', seedText, startSeason: 'natural',
    preset: 'naturalist', rules: presetRules('naturalist'), hints: true,
  };
}

/** Which rules differ from the preset (the override object sent to the game). */
export function ruleOverrides(form: Pick<NewGameForm, 'preset' | 'rules'>): Partial<CustomRules> {
  const base = presetRules(form.preset);
  const out: Partial<CustomRules> = {};
  for (const k of RULE_KEYS) if (form.rules[k] !== base[k]) (out as Record<string, unknown>)[k] = form.rules[k];
  return out;
}

/** True when any editable rule differs from the preset's value (the card then reads "Custom"). */
export function isCustom(form: Pick<NewGameForm, 'preset' | 'rules'>): boolean {
  return Object.keys(ruleOverrides(form)).length > 0;
}

/** Applies a preset card: its rule values replace the current ones. */
export function applyPreset(form: NewGameForm, preset: DifficultyId): NewGameForm {
  return { ...form, preset, rules: presetRules(preset) };
}

export function setRule<K extends RuleKey>(form: NewGameForm, key: K, value: EditableRules[K]): NewGameForm {
  return { ...form, rules: { ...form.rules, [key]: value } };
}

/**
 * The request for GameFacade.newGame. The seed is sent as the resolved uint32 so the generator uses exactly the
 * code the screen displayed; "Random" archetype is resolved here with the generator's own weighted pick.
 */
export function buildRequest(form: NewGameForm): NewGameRequest {
  const seed = resolveSeed(form.seedText);
  const archetype = form.archetype === 'random' ? pickArchetype(form.species, seed.value) : form.archetype;
  const overrides = ruleOverrides(form);
  const req: NewGameRequest = {
    seed: seed.value, seedText: form.seedText.trim(), species: form.species, archetype, size: form.size, difficulty: form.preset,
    startSeason: form.startSeason, hints: form.hints,
  };
  if (Object.keys(overrides).length) req.customRules = overrides;
  return req;
}

/** The form survives leaving and re-entering the screen (and a cancelled generation). */
export const newGameForm = signal<NewGameForm>(defaultForm());

/** The last request sent, for the loading summary and "Try another seed". */
export const lastRequest = signal<NewGameRequest | null>(null);
