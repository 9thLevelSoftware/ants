// Camponotus pennsylvanicus against the numbers of GDD 07 §5.2 (section references in each row), 00-index C-constants
// and GDD 06 §1.5 / §2.1 / §2.6 / §11.2. Day numbers are d28 = (GDD 1-based D) - 1 where the GDD writes D.
import { describe, expect, it } from 'vitest';
import { CAMPONOTUS_PENNSYLVANICUS as CP } from './camponotus-pennsylvanicus';
import { mismatches, type ValueRow } from './valueTable';

const ROWS: ValueRow[] = [
  // identity
  ['§1', 'id', 'camponotus-pennsylvanicus'], ['§1', 'buMm', 9], ['§1', 'climate', 'temperate-continental'], ['§1', 'tier', 'T3'],
  ['§1', 'complexity', 2], ['§5.2.1', 'stdMassMg', 7], ['§5.2.1', 'subfamily', 'formicinae'], ['§1', 'economyModules', ['honeydew-ranching', 'wood-nesting']],
  ['§1', 'foundingSeason', 'spring'], ['§5.2.1', 'loadSpeedMult', 0.85], ['§2.7', 'cruiseBuS', 5],
  // castes (§5.2.1)
  ['§5.2.1', 'castes.minor.lengthBu', { min: 0.7, mean: 0.78, max: 0.9 }], ['§5.2.1', 'castes.minor.casteMassMg', 2.0],
  ['§5.2.1', 'castes.minor.lifespanGd', { mean: 84, sd: 30 }], ['§5.2.1', 'castes.minor.sprintBuS', 10],
  ['§5.2.1', 'castes.minor.sizeClasses.nanitic', { id: 'nanitic', minBu: 0.55, maxBu: 0.8 }],
  ['§5.2.1', 'castes.media.lengthBu', { min: 1.0, mean: 1.1, max: 1.25 }], ['§5.2.1', 'castes.media.casteMassMg', 7],
  ['§5.2.1', 'castes.media.lifespanGd', { mean: 84, sd: 30 }], ['§5.2.1', 'castes.media.sprintBuS', 10],
  ['§5.2.2', 'castes.media.unlock', { minWorkers: 60, minColonyAgeYears: 2 }],
  ['§5.2.1', 'castes.major.lengthBu', { min: 1.3, mean: 1.5, max: 1.9 }], ['§5.2.1', 'castes.major.casteMassMg', 16],
  ['§5.2.1', 'castes.major.lifespanGd', { mean: 100, sd: 35 }], ['§5.2.1', 'castes.major.sprintBuS', 9],
  ['§5.2.1', 'castes.major.carryOverride', 2.0], ['§5.2.1', 'castes.major.macrocephalic', true], ['§5.2.1', 'castes.major.mandibleFactor', 1.5],
  ['§5.2.1', 'castes.major.cruiseMult', 0.9], ['§5.2.2', 'castes.major.unlock', { minWorkers: 60, minColonyAgeYears: 2 }],
  ['§5.2.1', 'castes.queen.lengthBu', { min: 2.0, mean: 2.1, max: 2.3 }], ['§5.2.1', 'castes.queen.casteMassMg', 100],
  ['§5.2.1', 'castes.queen.fixedStats', { maxHp: 120, bite: 12, foundingMaxHp: null }], ['§5.2.1', 'castes.queen.cropMax', 3.0],
  ['§5.2.1', 'castes.queen.sprintBuS', 4], ['§5.2.1', 'castes.queen.upkeepOverride', { restC: 0.3, activeC: 0.3, p: 0.1 }],
  ['§5.2.1', 'castes.gyne.lengthBu', { min: 1.9, mean: 2.0, max: 2.1 }], ['§5.2.1', 'castes.gyne.casteMassMg', 100],
  ['§5.2.1', 'castes.gyne.fixedStats', { maxHp: 120, bite: 12, foundingMaxHp: null }], ['§5.2.1', 'castes.gyne.sprintBuS', 9],
  ['§5.2.1', 'castes.gyne.upkeepOverride.restC', 0.15], ['§5.2.1', 'castes.male.lengthBu', { min: 1.0, mean: 1.1, max: 1.2 }],
  ['§5.2.1', 'castes.male.casteMassMg', 15], ['§5.2.1', 'castes.male.fixedStats', { maxHp: 23, bite: 1.2, foundingMaxHp: null }],
  ['§5.2.1', 'castes.male.upkeepOverride.restC', 0.1], ['§5.2.1', 'castes.male.cropMax', 0.5],
  ['§2.5', 'castes.media.ageRateOutside', 2.0], ['§2.5', 'castes.media.ageRateDormant', 0.15],
  // life history (§5.2.2)
  ['§5.2.2', 'life.stageGd', { egg: 1.4, larva: 1.6, pupa: 1.9 }], ['§5.2.2', 'life.devRefC', 24],
  ['§5.2.2', 'life.devRate', [[10, 0], [17, 0.5], [24, 1.0], [30, 1.0], [33, 0.5], [36, 0]]],
  ['§5.2.2', 'castes.minor.devMult', 1.0], ['§5.2.2', 'castes.media.devMult', 1.05], ['§5.2.2', 'castes.major.devMult', 1.15],
  ['§5.2.2', 'castes.gyne.devMult', 1.3], ['§5.2.2', 'castes.male.devMult', 1.1],
  ['§5.2.2', 'life.layWindows', [[0.5, 3.0], [9.5, 12.5]]], ['§5.2.2', 'life.qMax', 148], ['§5.2.2', 'life.sizeBase', 0.054],
  ['§5.2.2', 'life.sizeK', 500], ['§5.2.2', 'life.fTempQ', [[15, 0], [21, 1], [30, 1], [35, 0]]],
  ['§5.2.2', 'life.casteMixTarget', [[0, 0.5, 0.38, 0.12]]], ['§5.2.2', 'life.queenLifespanYears', { min: 10, max: 15 }],
  ['§5.2.2', 'life.larvaFood', 'trophallaxis+solid'],
  // founding (§5.2.3, C6, 03 §13.1)
  ['§5.2.3', 'opening.mode', 'claustral-wood'], ['C6', 'opening.R0', 36], ['C6', 'opening.clutchCap', 16],
  ['§5.2.3', 'opening.expectedFirstWorkers', { min: 6, max: 11 }], ['§5.2.3', 'opening.special', ['woodMoisture']],
  ['06 §1.6', 'opening.startDoy', { min: 2, max: 9, default: 5 }], ['06 §1.6', 'opening.startHours', [17, 19]],
  ['03 §13.1', 'opening.dMinOpenBu', 3], ['03 §13.1', 'opening.dMinCoverBu', 3], ['03 §13.1', 'opening.vMinBu3', 10],
  ['03 §13.1', 'opening.wMinBu', 3.5], ['03 §13.1', 'opening.shaftTargetBu', 6], ['§5.2.3', 'opening.firstBroodClass', { caste: 'minor', nanitic: true }],
  // scale and reproduction (§5.2.4, C2, C11)
  ['C2', 'scale.simCapWorkers', 1200], ['§5.2.4', 'scale.wildColonySize', { typical: [2000, 3000], max: 15000 }],
  ['C11', 'scale.growThreshold', 50], ['C11', 'scale.matureThreshold', 500],
  ['§5.2.4', 'scale.growthTargets', [[1, 6, 12], [2, 40, 80], [3, 200, 320], [4, 450, 600], [5, 800, 1000], [6, 1050, 1200]]],
  ['§5.2.4', 'reproduction.matureAgeYears', 4], ['§5.2.4', 'reproduction.alateLayWindow', [2, 3]],
  ['§5.2.4', 'reproduction.reproMaxFrac', 0.12], ['§5.2.4', 'reproduction.reproGyneShare', 0.44],
  ['06 §11.2', 'reproduction.sexualCostMult', { gyne: 8.0, male: 1.3 }], ['06 §11.2', 'reproduction.alateFlightWindow', [1, 9]],
  ['06 §11.2', 'reproduction.flightPeak', [4, 6]], ['06 §11.2', 'reproduction.launchHours', [16, 20]],
  ['06 §11.5', 'reproduction.flightGate', { minAirC: 13, maxWindMs: 5, noRain: true }], ['§5.2.4', 'reproduction.synchrony', 'individual'],
  ['§5.2.4', 'reproduction.alatesOverwinter', true], ['06 §11.2', 'reproduction.pAir', 0.65], ['06 §11.2', 'reproduction.pMate', 0.9],
  ['06 §11.2', 'reproduction.pFound', 0.7], ['06 §11.2', 'reproduction.gyneUpkeepC', 0.15], ['06 §11.2', 'reproduction.maleUpkeepC', 0.1],
  // diet (§5.2.5)
  ['§5.2.5', 'diet.foods.honeydew.pref', 1.0], ['§5.2.5', 'diet.foods.sugar.pref', 1.0], ['§5.2.5', 'diet.foods.nectar.pref', 0.8],
  ['§5.2.5', 'diet.foods.fruit.pref', 0.7], ['§5.2.5', 'diet.foods.crumb.pref', 0.7], ['§5.2.5', 'diet.foods.prey.pref', 1.0],
  ['§5.2.5', 'diet.foods.carrion.pref', 0.8], ['§5.2.5', 'diet.foods.pet-food.pref', 0.8], ['§5.2.5', 'diet.foods.bait.pref', 0.6],
  ['§5.2.5', 'diet.foods.dew.pref', 0.2], ['§5.2.5', 'diet.foods.seed', undefined], ['§5.2.5', 'diet.foods.leaf', undefined],
  ['§5.2.5', 'diet.foods.prey.route', 'solid-p'], ['§5.2.5', 'diet.foods.dew.route', 'water'], ['§5.2.5', 'diet.pTargetFrac', 0.45],
  // nest (§5.2.6; GDD 03 §8.2)
  ['§5.2.6', 'nestTemplate.nestMaterials.bark', 1.2], ['§5.2.6', 'nestTemplate.mound', 'none'], ['§5.2.6', 'nestTemplate.midden', 'frass-pile'],
  ['§5.2.6', 'nestTemplate.tunnelWidthBu', 2.0], ['03 §8.2', 'nestTemplate.footprintRBu', 600], ['03 §8.2', 'nestTemplate.volumeCapBu3', 8000],
  ['03 §8.2', 'nestTemplate.maxPathToEntranceBu', 120], ['§5.2.6', 'nestTemplate.chambers.nursery.perUnit', 1 / 50, 1e-9],
  ['§5.2.6', 'nestTemplate.chambers.food.perUnit', 1 / 400, 1e-9], ['§5.2.6', 'nestTemplate.chambers.rest.perUnit', 1 / 200, 1e-9],
  ['§5.2.6', 'nestTemplate.entrances.start', 1], ['03 §8.2', 'nestTemplate.entrances.max', 6],
  // thermal, signals, combat, winter (§5.2.7, 06 §1.5, §2.6)
  ['06 §2.6', 'thermal.thermalShiftC', -2], ['06 §2.6', 'thermal.forageGate', { a: 5, b: 13, c: 26, d: 33 }],
  ['06 §2.6', 'thermal.stressC', 36], ['06 §2.6', 'thermal.shadeSeekC', 34], ['06 §2.6', 'thermal.chillC', 2], ['06 §2.6', 'thermal.freezeC', -4],
  ['06 §1.5', 'thermal.lightPref', { night: 1.0, dawn: 0.8, morning: 0.35, midday: 0.2, afternoon: 0.3, dusk: 1.0 }],
  ['§5.2.7', 'signals.trailHalfLifeS', 1800], ['§5.2.7', 'signals.trailRefC', 20],
  ['§5.2.7', 'signals.trunkTrail', { enabled: true, unusedHalfLifeGd: 3, ghostAfterGd: 8, ghostFadeGd: 7, clearing: false }],
  ['§5.2.7', 'signals.homeHalfLifeGd', 3], ['§5.2.7', 'signals.ignorerFrac', 0.1], ['§5.2.7', 'signals.recruitUnlockWorkers', 20],
  ['§5.2.7', 'signals.alarmMode', 'drumming'], ['§5.2.7', 'combat.weapons', ['bite', 'bite-hold', 'spray-acid']],
  ['§5.2.7', 'combat.acid.regenS', 120], ['§5.2.7', 'combat.guardCastes', ['major']], ['§5.2.7', 'winter.mode', 'diapause-lapse'],
  ['06 §6.3', 'winter.tColdStress', 0], ['06 §6.3', 'winter.wintBaseLoss', 0.05],
  // modules (§6.2)
  ['§6.2.2', 'modules.wood-nesting.mcRate', 0.25], ['§6.2.2', 'modules.wood-nesting.decayGdPerClass', 56],
  ['§6.2.3', 'modules.wood-nesting.crossGrainMult', 1.8], ['§6.2.3', 'modules.wood-nesting.maxCarvedFrac', 0.4],
  ['§6.2.4', 'modules.wood-nesting.hazardDryMaxPerGd', 0.4], ['§6.2.4', 'modules.wood-nesting.dryBonus', 1.15],
  ['§6.2.5', 'modules.wood-nesting.satelliteMaxRouteBu', 600], ['§6.2.6', 'modules.wood-nesting.drumRadiusWoodBu', 30],
];

describe('Camponotus pennsylvanicus data = GDD 07 §5.2', () => {
  it('has at least 40 transcribed values and all of them match', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(40);
    expect(mismatches(CP, ROWS)).toEqual([]);
  });

  it('fSeason is flat 1.0 over the year (laying is gated by layWindows) and spans d28 0-28', () => {
    expect(CP.life.fSeason).toEqual([[0, 1], [28, 1]]);
  });

  it('nanitic and acid-charge side tables hold the GDD rows the schema cannot', async () => {
    const m = await import('./camponotus-pennsylvanicus');
    expect(m.CAMPONOTUS_NANITIC_MINOR.casteMassMg).toBe(1.2);
    expect(m.CAMPONOTUS_ACID_CHARGES).toEqual({ minor: 3, media: 5, major: 6 });
  });
});
