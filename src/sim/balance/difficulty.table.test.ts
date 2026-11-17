// Table-driven check of every parameter of every preset against the tables of the design documents (difficulty-rules
// AC2). The expected values below are typed in from GDD 06 §14 (and, where that table copies a value from another
// chapter, from the owner: GDD 04 §15.7, GDD 05 §5, GDD 01 PLAYER_TEMP_FLOOR, 00-index C10/C11), NOT read from the
// code under test. A parameter that is in the code table but in no row here fails the coverage test.

import { describe, expect, it } from 'vitest';
import type { DifficultyId } from '@/sim/types';
import { DIFFICULTY_IDS } from '@/sim/types';
import { DIFFICULTY_KEYS, DIFFICULTY_PARAMS, presetRuleValues, presetRivals, type DifficultyKey } from './difficulty';

type Triple<T> = readonly [gentle: T, naturalist: T, harsh: T];

/** [parameter, source, gentle, naturalist, harsh] */
const GDD_TABLE: readonly [DifficultyKey, string, ...Triple<unknown>][] = [
  // Founding (GDD 06 §14)
  ['foundingExposureRate', '06 §5.5', 0.5, 1.0, 1.3],
  ['foundingBroodMortalityMult', '06 §5.12', 0.7, 1.0, 1.3],
  ['reserveDrainMult', '06 §5.5', 0.85, 1.0, 1.15],
  ['openingThreatsMax', '06 §5.6', 0, 2, 4],
  ['openingInterruptMax', '06 §5.11', 0, 2, 3],
  ['openingGraceGd', '06 §5.2', 0.6, 0.3, 0.15],
  ['openingRetries', '06 §5.14', 3, 1, 0],
  ['forecastPanel', '06 §5.10', true, true, false],
  // Weather and climate
  ['rainFreqMult', '06 §3.2', 0.8, 1.0, 1.2],
  ['stormFreqMult', '06 §14', 0.5, 1.0, 1.6],
  ['heatWaveFreqMult', '06 §14', 0.7, 1.0, 1.3],
  ['heatOffsetMult', '06 §2.2', 0.7, 1.0, 1.25],
  ['frostFreqMult', '06 §14', 0.7, 1.0, 1.3],
  ['pDrySpell', '06 §3.2', 0.25, 0.5, 0.7],
  ['rainHitMult', '06 §3.3', 0.6, 1.0, 1.3],
  ['floodInflowMult', '06 §3.10', 0.7, 1.0, 1.4],
  ['heatToleranceOffsetC', '06 §2.7', 2, 0, -1],
  // Threats, rivals, humans
  ['predatorDensityMult', '05 §5 / C10', 0.4, 1.0, 1.6],
  ['rivalAggMult', '05 §5 / C10', 0.7, 1.0, 1.2],
  ['raidCooldownGd', '05 §5 / C10', 4, 2, 1],
  ['rivalKMult', '05 §5 / C10', 0.6, 1.0, 1.3],
  ['incipientRivals', '05 §5 / C10', 1, 2, 3],
  ['humanFreqMult', '04 §15.7', 0.5, 1.0, 1.5],
  ['humanLethalMult', '04 §15.7', 0.4, 1.0, 1.2],
  ['humanTelegraphMult', '04 §15.7', 1.5, 1.0, 0.75],
  ['baitEnabled', '04 §15.7', 'off', 'interior', 'interior-garden'],
  ['threatMinQuietGd', '05 §5 / C10', 1.0, 0.5, 0.25],
  ['quietShareMin', '05 §5 / C10', 0.75, 0.6, 0.4],
  // Food
  ['foodAbundanceMult', '05 §5 / C10', 1.3, 1.0, 0.75],
  ['honeydewYieldMult', '06 §14', 1.2, 1.0, 0.85],
  // Colony
  ['broodSurvivalMult', '06 §14', 1.15, 1.0, 0.85],
  ['workerLifespanMult', '06 §14', 1.2, 1.0, 0.85],
  ['starvationToleranceMult', '06 §14', 1.3, 1.0, 0.8],
  ['queenLifespanMult', '06 §13.2', 1.5, 1.0, 0.7],
  ['winterLossMult', '06 §6.3', 0.5, 1.0, 1.5],
  ['winterQueenDeathP', '06 §6.3', 0, 0.03, 0.06],
  ['orphanDeclineMult', '06 §13.3', 0.7, 1.0, 1.3],
  ['damageTakenMult', '05 §5 / C10', 0.75, 1.0, 1.0],
  // Progression
  ['matureGateMult', '06 §7 / C11', 0.8, 1.0, 1.2],
  ['alateCapMult', '06 §11.3 / C11', 1.2, 1.0, 0.9],
  ['flightLossMult', '06 §11.6', 0.7, 1.0, 1.25],
  ['flightPredatorEvents', '06 §11.6', [0, 1], [1, 3], [3, 5]],
  // Time and interface
  ['autoSlowDefault', '06 §4.5', 'pause', 'slow', 'slow'],
  ['alertLeadWarnings', '06 §14', 'strong', 'normal', 'minimal'],
  ['playerTempFloor', '01 PLAYER_TEMP_FLOOR', 0.6, 0.5, 0.3],
];

const IDS: readonly DifficultyId[] = ['gentle', 'naturalist', 'harsh'];

describe('difficulty table against the design documents (AC2)', () => {
  it('the three presets are exactly gentle, naturalist, harsh', () => {
    expect([...DIFFICULTY_IDS].sort()).toEqual([...IDS].sort());
    expect(Object.keys(DIFFICULTY_PARAMS).sort()).toEqual([...IDS].sort());
  });

  it('every parameter of the code table has a row here, and every row names a parameter of the table', () => {
    expect(GDD_TABLE.map((r) => r[0]).sort()).toEqual([...DIFFICULTY_KEYS].sort());
    for (const id of IDS) expect(Object.keys(DIFFICULTY_PARAMS[id]).sort()).toEqual([...DIFFICULTY_KEYS].sort());
  });

  it.each(GDD_TABLE.map((r) => [r[0], r] as const))('%s', (_key, row) => {
    const [key, , ...expected] = row;
    IDS.forEach((id, i) => {
      expect(DIFFICULTY_PARAMS[id][key], `${key} on ${id}`).toEqual(expected[i]);
    });
  });

  it('naturalist is the neutral preset: every multiplier is 1', () => {
    const n = DIFFICULTY_PARAMS.naturalist;
    for (const k of DIFFICULTY_KEYS) if (k.endsWith('Mult')) expect(n[k], k).toBe(1);
  });

  it('presets are ordered gentle <= naturalist <= harsh in difficulty for the pressure parameters', () => {
    const up: DifficultyKey[] = ['foundingExposureRate', 'foundingBroodMortalityMult', 'reserveDrainMult', 'openingThreatsMax',
      'openingInterruptMax', 'stormFreqMult', 'rainFreqMult', 'heatWaveFreqMult', 'frostFreqMult', 'pDrySpell', 'rainHitMult',
      'floodInflowMult', 'predatorDensityMult', 'rivalAggMult', 'rivalKMult', 'incipientRivals', 'humanFreqMult',
      'humanLethalMult', 'winterLossMult', 'winterQueenDeathP', 'orphanDeclineMult'];
    const down: DifficultyKey[] = ['openingGraceGd', 'openingRetries', 'raidCooldownGd', 'humanTelegraphMult', 'threatMinQuietGd',
      'quietShareMin', 'foodAbundanceMult', 'honeydewYieldMult', 'broodSurvivalMult', 'workerLifespanMult',
      'starvationToleranceMult', 'queenLifespanMult', 'playerTempFloor', 'heatToleranceOffsetC'];
    for (const k of up) {
      const [g, n, h] = IDS.map((id) => DIFFICULTY_PARAMS[id][k] as number);
      expect(g <= n && n <= h, `${k}: ${g} <= ${n} <= ${h}`).toBe(true);
    }
    for (const k of down) {
      const [g, n, h] = IDS.map((id) => DIFFICULTY_PARAMS[id][k] as number);
      expect(g >= n && n >= h, `${k}: ${g} >= ${n} >= ${h}`).toBe(true);
    }
  });

  it('rule values each preset implies match GDD 06 §14 / 14.1 and GDD 08 §3.7', () => {
    const rules = IDS.map((id) => presetRuleValues(id));
    expect(rules.map((r) => r.rivals)).toEqual([2, 3, 4]); // rivalCount
    expect(rules.map((r) => r.foundingAssist)).toEqual([true, true, false]);
    expect(rules.map((r) => r.queenSenescence)).toEqual([false, false, true]);
    expect(rules.map((r) => r.collapse)).toEqual([false, true, true]); // GDD 08 §3.7: nest collapse Off / On / On
    expect(rules.map((r) => r.foundingLeniency)).toEqual(['lenient', 'normal', 'strict']);
    expect(rules.map((r) => r.predators)).toEqual(['few', 'normal', 'many']);
    expect(rules.map((r) => r.humanActivity)).toEqual(['low', 'normal', 'high']); // GDD 08 §3.7
    expect(rules.map((r) => r.weatherSeverity)).toEqual(['normal', 'normal', 'normal']); // the preset's own weather multipliers carry the scaling (no double count)
    expect(rules.map((r) => r.winterMode)).toEqual(['timelapse', 'timelapse', 'timelapse']);
    expect(rules.map((r) => r.extinctionEndsGame)).toEqual([true, true, true]);
    expect(IDS.map((id) => presetRivals(id))).toEqual([2, 3, 4]);
  });

  it('the human-activity rule of each preset agrees with its humanFreqMult (custom humanActivity: low 0.5, normal 1, high 1.5)', () => {
    const mult = { off: 0, low: 0.5, normal: 1.0, high: 1.5 } as const;
    for (const id of IDS) expect(mult[presetRuleValues(id).humanActivity]).toBe(DIFFICULTY_PARAMS[id].humanFreqMult);
  });

  it('the predator rule of each preset agrees with its predatorDensityMult (custom predators: few 0.4, normal 1, many 1.6)', () => {
    const mult = { off: 0, few: 0.4, normal: 1.0, many: 1.6 } as const;
    for (const id of IDS) expect(mult[presetRuleValues(id).predators]).toBe(DIFFICULTY_PARAMS[id].predatorDensityMult);
  });
});
