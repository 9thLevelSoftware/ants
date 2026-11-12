// Difficulty presets (GDD 06 §14 table; values owned by GDD 04 §15.7 and GDD 05 §5; registry C10, C11).
// The difficulty-rules task owns the plumbing; systems read config.difficulty.params and config.rules.

import type { CustomRules, DifficultyId, DifficultyParams } from '@/sim/types';

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
