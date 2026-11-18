// Display data for the New Game screen's difficulty cards and custom-rules table (GDD 08 §3.7, GDD 06 §14): what
// each preset changes, in the design's wording. Every value is read from the table in balance/difficulty.ts, so the
// card can never drift from the numbers; presetDisplay.test.ts checks that every parameter appears in a row.

import type { CustomRules, DifficultyId, DifficultyParams } from '@/sim/types';
import { DEFAULT_SEASON_LENGTH_DAYS, DIFFICULTY_PARAMS, MAX_RIVALS, presetRuleValues, type DifficultyKey } from '@/sim/balance';
import { PREDATION_RAMP_WORKERS } from '@/sim/balance/difficulty';

/**
 * Parameters and rules the design lists but no system reads yet (the owning module does not exist, or does not take
 * the value). The New Game screen can grey their rows ("not in effect yet") so a card never promises what the game
 * does not do. presetDisplay.test.ts checks that nothing in here is read anywhere, so wiring one removes it.
 */
export const UNWIRED_PARAMS: readonly DifficultyKey[] = [
  'openingThreatsMax', 'queenLifespanMult', 'flightPredatorEvents', 'alertLeadWarnings',
];
export const UNWIRED_RULES: readonly (keyof CustomRules)[] = ['queenSenescence', 'foundingAssist'];

/** What is missing for each unwired value (GDD rule, and the piece that would read it). sim-seams item 6. */
export const UNWIRED_WHY: Readonly<Record<string, string>> = {
  openingThreatsMax: 'GDD 06 §5.6 founding threat director (max per founding, 0.15 GD gap, kinds by hour): no such director exists',
  queenLifespanMult: 'GDD 06 §13.2 queen lifespan: no system kills a queen of old age (colony.queens[].lifespanDays is never drawn)',
  flightPredatorEvents: 'GDD 06 §11.6 possessed nuptial flight (T3) with its predator events: not built',
  alertLeadWarnings: 'GDD 06 §14 lead of warning alerts (strong / normal / minimal): the alert engine has one lead for every preset',
  queenSenescence: 'GDD 06 §13.2 Lasius queen senescence draw (10-20 years): no queen old-age death exists',
  foundingAssist: 'GDD 06 §5.7 / §5.16 founding hints (scent haze at the best site, automatic read-out): the hint layer does '
    + 'not read the rule',
};

export interface PresetRow {
  /** Group heading of GDD 06 §14. */
  group: 'Founding' | 'Weather and climate' | 'Threats, rivals, humans' | 'Food' | 'Colony' | 'Progression' | 'Time and interface';
  label: string;
  /** Parameters (keys of the table) this row shows. */
  keys: readonly DifficultyKey[];
  /** The value as the card prints it. */
  format: (p: DifficultyParams) => string;
}

/** False when a row shows a parameter nothing reads yet (UNWIRED_PARAMS). */
export const rowInEffect = (r: PresetRow): boolean => !r.keys.some((k) => UNWIRED_PARAMS.includes(k));

const mult = (v: number): string => `x${v}`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;
const onOff = (v: boolean): string => (v ? 'shown' : 'hidden');
const gd = (v: number): string => `${v} day${v === 1 ? '' : 's'}`;
const youngRivals = (n: number): string => (n === 0 ? 'no young rivals nearby' : `${n} young ${n === 1 ? 'rival' : 'rivals'} nearby`);

/** The preset whose table `p` is (rows that show a per-preset value kept outside the parameter table). */
const presetIdOf = (p: DifficultyParams): DifficultyId =>
  (Object.keys(DIFFICULTY_PARAMS) as DifficultyId[]).find((id) => DIFFICULTY_PARAMS[id] === p) ?? 'naturalist';
/** Ruling R25: hunters settle where the colony's ants walk once it has grown (PREDATION_RAMP_WORKERS). */
const rampText = (id: DifficultyId): string => {
  const [lo, hi] = PREDATION_RAMP_WORKERS[id];
  return lo > 0 ? `from ${lo} workers, all by ${hi}` : `from the first workers, all by ${hi}`;
};

/** Rows in the order of the GDD 06 §14 table. */
export const PRESET_ROWS: readonly PresetRow[] = [
  { group: 'Founding', label: 'Exposure to the sun while founding', keys: ['foundingExposureRate'], format: (p) => mult(p.foundingExposureRate) },
  { group: 'Founding', label: 'Brood losses in the founding chamber', keys: ['foundingBroodMortalityMult'], format: (p) => mult(p.foundingBroodMortalityMult) },
  { group: 'Founding', label: 'Queen reserves burned', keys: ['reserveDrainMult'], format: (p) => mult(p.reserveDrainMult) },
  { group: 'Founding', label: 'Threats during the opening (at most)', keys: ['openingThreatsMax'], format: (p) => String(p.openingThreatsMax) },
  { group: 'Founding', label: 'Interruptions of the first-brood time-lapse (at most)', keys: ['openingInterruptMax'], format: (p) => String(p.openingInterruptMax) },
  { group: 'Founding', label: 'Grace period before threats', keys: ['openingGraceGd'], format: (p) => gd(p.openingGraceGd) },
  { group: 'Founding', label: 'Tries at another site', keys: ['openingRetries'], format: (p) => String(p.openingRetries) },
  { group: 'Founding', label: 'Brood forecast', keys: ['forecastPanel'], format: (p) => onOff(p.forecastPanel) },
  { group: 'Weather and climate', label: 'Rain', keys: ['rainFreqMult'], format: (p) => mult(p.rainFreqMult) },
  { group: 'Weather and climate', label: 'Storms', keys: ['stormFreqMult'], format: (p) => mult(p.stormFreqMult) },
  { group: 'Weather and climate', label: 'Heat waves', keys: ['heatWaveFreqMult', 'heatOffsetMult'], format: (p) => `${mult(p.heatWaveFreqMult)} often, ${mult(p.heatOffsetMult)} hot` },
  { group: 'Weather and climate', label: 'Frost', keys: ['frostFreqMult'], format: (p) => mult(p.frostFreqMult) },
  { group: 'Weather and climate', label: 'Chance of a dry spell each summer', keys: ['pDrySpell'], format: (p) => pct(p.pDrySpell) },
  { group: 'Weather and climate', label: 'Raindrop hits on exposed ants', keys: ['rainHitMult'], format: (p) => mult(p.rainHitMult) },
  { group: 'Weather and climate', label: 'Rain running into the nest', keys: ['floodInflowMult'], format: (p) => mult(p.floodInflowMult) },
  { group: 'Weather and climate', label: 'Heat tolerance of ants', keys: ['heatToleranceOffsetC'], format: (p) => `${p.heatToleranceOffsetC > 0 ? '+' : ''}${p.heatToleranceOffsetC} C` },
  { group: 'Threats, rivals, humans', label: 'Predators', keys: ['predatorDensityMult'], format: (p) => mult(p.predatorDensityMult) },
  { group: 'Threats, rivals, humans', label: 'Hunters settling by a growing colony', keys: [], format: (p) => rampText(presetIdOf(p)) },
  { group: 'Threats, rivals, humans', label: 'Rival colonies', keys: ['incipientRivals'], format: (p) => youngRivals(p.incipientRivals) },
  { group: 'Threats, rivals, humans', label: 'Rival aggression', keys: ['rivalAggMult'], format: (p) => mult(p.rivalAggMult) },
  { group: 'Threats, rivals, humans', label: 'Rival colony size', keys: ['rivalKMult'], format: (p) => mult(p.rivalKMult) },
  { group: 'Threats, rivals, humans', label: 'Time between raids on you', keys: ['raidCooldownGd'], format: (p) => gd(p.raidCooldownGd) },
  { group: 'Threats, rivals, humans', label: 'Quiet days between major threats', keys: ['threatMinQuietGd', 'quietShareMin'], format: (p) => `${gd(p.threatMinQuietGd)}, ${pct(p.quietShareMin)} quiet daytime` },
  { group: 'Threats, rivals, humans', label: 'Human activity', keys: ['humanFreqMult'], format: (p) => mult(p.humanFreqMult) },
  { group: 'Threats, rivals, humans', label: 'Danger from human events', keys: ['humanLethalMult'], format: (p) => mult(p.humanLethalMult) },
  { group: 'Threats, rivals, humans', label: 'Warning before footsteps arrive', keys: ['humanTelegraphMult'], format: (p) => mult(p.humanTelegraphMult) },
  { group: 'Threats, rivals, humans', label: 'Bait stations', keys: ['baitEnabled'], format: (p) => ({ off: 'none', interior: 'indoors', 'interior-garden': 'indoors and garden' })[p.baitEnabled] },
  { group: 'Food', label: 'Food on the ground', keys: ['foodAbundanceMult'], format: (p) => mult(p.foodAbundanceMult) },
  { group: 'Food', label: 'Honeydew from aphids', keys: ['honeydewYieldMult'], format: (p) => mult(p.honeydewYieldMult) },
  { group: 'Colony', label: 'Brood survival', keys: ['broodSurvivalMult'], format: (p) => mult(p.broodSurvivalMult) },
  { group: 'Colony', label: 'Worker lifespan', keys: ['workerLifespanMult'], format: (p) => mult(p.workerLifespanMult) },
  { group: 'Colony', label: 'Time ants endure hunger', keys: ['starvationToleranceMult'], format: (p) => mult(p.starvationToleranceMult) },
  { group: 'Colony', label: 'Queen lifespan', keys: ['queenLifespanMult'], format: (p) => mult(p.queenLifespanMult) },
  { group: 'Colony', label: 'Winter losses', keys: ['winterLossMult', 'winterQueenDeathP'], format: (p) => `${mult(p.winterLossMult)}, queen dies ${pct(p.winterQueenDeathP)}` },
  { group: 'Colony', label: 'Decline of a queenless colony', keys: ['orphanDeclineMult'], format: (p) => mult(p.orphanDeclineMult) },
  { group: 'Colony', label: 'Damage to the ant you play', keys: ['damageTakenMult'], format: (p) => mult(p.damageTakenMult) },
  { group: 'Colony', label: 'Speed of the ant you play when cold (floor)', keys: ['playerTempFloor'], format: (p) => mult(p.playerTempFloor) },
  { group: 'Progression', label: 'Size needed for each colony stage', keys: ['matureGateMult'], format: (p) => mult(p.matureGateMult) },
  { group: 'Progression', label: 'Winged queens and males reared', keys: ['alateCapMult'], format: (p) => mult(p.alateCapMult) },
  { group: 'Progression', label: 'Losses on the nuptial flight', keys: ['flightLossMult'], format: (p) => mult(p.flightLossMult) },
  { group: 'Progression', label: 'Predator events on the flight', keys: ['flightPredatorEvents'], format: (p) => `${p.flightPredatorEvents[0]}-${p.flightPredatorEvents[1]}` },
  { group: 'Time and interface', label: 'Automatic slow-down at an alert', keys: ['autoSlowDefault'], format: (p) => p.autoSlowDefault },
  { group: 'Time and interface', label: 'Warnings before trouble', keys: ['alertLeadWarnings'], format: (p) => p.alertLeadWarnings },
];

/**
 * The text of a preset's card (GDD 08 §3.7): two lines saying what the preset changes, in words that follow the signs
 * of the table above (no claim about how a game goes: nothing measures that). The one summary the screen uses.
 */
export const PRESET_SUMMARY: Record<DifficultyId, { name: string; lines: [string, string] }> = {
  gentle: {
    name: 'Gentle',
    lines: ['Milder weather, fewer predators and people about, two rival colonies.',
      'More food, better brood survival, three more tries at founding.'],
  },
  naturalist: {
    name: 'Naturalist',
    lines: ['The reference setting: ordinary weather, predators and people, three rival colonies.',
      'One more try at another site if the founding fails.'],
  },
  harsh: {
    name: 'Harsh',
    lines: ['Storms, heat and frost more often, more predators and people, four rival colonies.',
      'Less food, lower brood survival, no second site, no brood forecast.'],
  },
};

export interface PresetCard {
  id: DifficultyId;
  name: string;
  lines: [string, string];
  rows: { group: PresetRow['group']; label: string; value: string; inEffect: boolean }[];
  /** The rule values the preset sets (the custom-rules table shows these; editing one switches to "Custom"). */
  rules: Omit<CustomRules, 'seasonLengthDays' | 'startSeason'> & { seasonLengthDays: typeof DEFAULT_SEASON_LENGTH_DAYS };
}

export function presetCard(id: DifficultyId): PresetCard {
  const p = DIFFICULTY_PARAMS[id];
  return {
    id, name: PRESET_SUMMARY[id].name, lines: PRESET_SUMMARY[id].lines,
    rows: PRESET_ROWS.map((r) => ({ group: r.group, label: r.label, value: r.format(p), inEffect: rowInEffect(r) })),
    rules: { ...presetRuleValues(id), seasonLengthDays: DEFAULT_SEASON_LENGTH_DAYS },
  };
}

export interface RuleChoice { value: string | number | boolean; label: string }
export interface RuleDisplay {
  key: keyof CustomRules;
  label: string;
  choices: RuleChoice[];
  /** Fixed when the world is generated: not offered in the mid-game settings. */
  fixedAtGeneration: boolean;
  /** One line in the design's wording of what the rule does. */
  effect: string;
  /** False while no system reads the rule (UNWIRED_RULES). */
  inEffect: boolean;
  /** Parts of the rule's effect that name a parameter nothing reads yet (UNWIRED_PARAMS): the screen says so. */
  notInEffect: string[];
}

const ONOFF: RuleChoice[] = [{ value: true, label: 'On' }, { value: false, label: 'Off' }];

/** The custom rules of GDD 06 §14.1 / GDD 08 §3.7, in the order of the New Game table. */
const RULE_DEFS: readonly (Omit<RuleDisplay, 'inEffect' | 'notInEffect'> & { parts?: readonly { key: DifficultyKey; text: string }[] })[] = [
  { key: 'predators', label: 'Predators', fixedAtGeneration: false, effect: 'How many hunters roam. Off removes them.',
    parts: [{ key: 'openingThreatsMax', text: 'threats during the opening' }, { key: 'flightPredatorEvents', text: 'predator events on the nuptial flight' }],
    choices: [{ value: 'off', label: 'Off' }, { value: 'few', label: 'Few' }, { value: 'normal', label: 'Normal' }, { value: 'many', label: 'Many' }] },
  { key: 'rivals', label: 'Rival colonies', fixedAtGeneration: true, effect: 'Established colonies of other ants, settled when the locality is made.',
    choices: Array.from({ length: MAX_RIVALS + 1 }, (_, i) => ({ value: i, label: String(i) })) },
  { key: 'humanActivity', label: 'Human activity', fixedAtGeneration: false, effect: 'How often giants walk, mow, wipe and water. Off silences them.',
    choices: [{ value: 'off', label: 'Off' }, { value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }] },
  { key: 'weatherSeverity', label: 'Weather severity', fixedAtGeneration: false, effect: 'How often and how hard rain, storms, heat and frost strike. None leaves only clear and overcast days.',
    choices: [{ value: 'none', label: 'None' }, { value: 'mild', label: 'Mild' }, { value: 'normal', label: 'Normal' }, { value: 'severe', label: 'Severe' }] },
  { key: 'seasonLengthDays', label: 'Season length', fixedAtGeneration: true, effect: 'Game days per season: 20, 28 or 40 days in the year. Lifespans and brood times keep their length.',
    choices: [{ value: 5, label: '5 days' }, { value: 7, label: '7 days' }, { value: 10, label: '10 days' }] },
  { key: 'startSeason', label: 'Starting season', fixedAtGeneration: true, effect: 'Natural is the species\' own founding day; otherwise day 3 of the chosen season. Never winter.',
    choices: [{ value: 'natural', label: 'Natural' }, { value: 'spring', label: 'Spring' }, { value: 'summer', label: 'Summer' }, { value: 'autumn', label: 'Autumn' }] },
  { key: 'foundingLeniency', label: 'Founding leniency', fixedAtGeneration: false, effect: 'How forgiving the opening is: sun exposure, brood losses, reserves, retries and the forecast.',
    parts: [{ key: 'openingThreatsMax', text: 'threats during the opening' }],
    choices: [{ value: 'lenient', label: 'Lenient' }, { value: 'normal', label: 'Normal' }, { value: 'strict', label: 'Strict' }] },
  { key: 'winterMode', label: 'Winter', fixedAtGeneration: false, effect: 'Skip the cold months as a time-lapse, or play every winter day.',
    choices: [{ value: 'timelapse', label: 'Time-lapse' }, { value: 'realtime', label: 'Real time' }] },
  { key: 'foundingAssist', label: 'Founding assist', fixedAtGeneration: false, effect: 'A faint scent haze marks the best nesting site nearby.', choices: ONOFF },
  { key: 'queenSenescence', label: 'Queen ageing', fixedAtGeneration: false, effect: 'Queens of long-lived species grow old and die within ten to twenty years.', choices: ONOFF },
  { key: 'collapse', label: 'Nest collapse', fixedAtGeneration: false, effect: 'Wide dry chambers can fall in. Off means only a warning.', choices: ONOFF },
  { key: 'extinctionEndsGame', label: 'Extinction ends the game', fixedAtGeneration: false, effect: 'Off keeps the empty nest in view until you retire the colony.', choices: ONOFF },
];

export const RULE_DISPLAY: readonly RuleDisplay[] = RULE_DEFS.map(({ parts, ...r }) => ({
  ...r, inEffect: !UNWIRED_RULES.includes(r.key), notInEffect: (parts ?? []).filter((x) => UNWIRED_PARAMS.includes(x.key)).map((x) => x.text),
}));
