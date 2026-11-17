// Lasius niger against the numbers of GDD 07 §5.1 (section references in each row) and 00-index C-constants.
import { describe, expect, it } from 'vitest';
import { LASIUS_NIGER } from './lasius-niger';
import { mismatches, type ValueRow } from './valueTable';

const ROWS: ValueRow[] = [
  // identity (§1, §3.1)
  ['§1', 'id', 'lasius-niger'], ['§1', 'buMm', 4], ['§1', 'climate', 'temperate-maritime'], ['§1', 'tier', 'T1'],
  ['§1', 'complexity', 1], ['§5.1.1', 'stdMassMg', 1.0], ['§5.1.1', 'cruiseBuS', 6], ['§5.1.1', 'loadSpeedMult', 0.85],
  ['§1', 'economyModules', ['honeydew-ranching']],
  // castes (§5.1.1)
  ['§5.1.1', 'castes.worker.lengthBu.min', 0.9], ['§5.1.1', 'castes.worker.lengthBu.mean', 1.0],
  ['§5.1.1', 'castes.worker.lengthBu.max', 1.15], ['§5.1.1', 'castes.worker.casteMassMg', 1.0],
  ['§5.1.1', 'castes.worker.sprintBuS', 12], ['§5.1.1', 'castes.worker.lifespanGd.sd', 10],
  ['§5.1.1', 'castes.worker.lifespanBySize', [[100, 33], [250, 24]]], ['§5.1.1', 'castes.worker.sizeClasses.nanitic.minBu', 0.8],
  ['§5.1.1', 'castes.worker.sizeClasses.nanitic.maxBu', 0.9],
  ['§5.1.1', 'castes.queen.lengthBu.mean', 2.1], ['§5.1.1', 'castes.queen.casteMassMg', 30],
  ['§5.1.1', 'castes.queen.fixedStats.maxHp', 50], ['§5.1.1', 'castes.queen.fixedStats.foundingMaxHp', 40],
  ['§5.1.1', 'castes.queen.fixedStats.bite', 2.0], ['§5.1.1', 'castes.queen.upkeepOverride.restC', 0.3],
  ['§5.1.1', 'castes.queen.upkeepOverride.p', 0.1], ['§5.1.1', 'castes.queen.cropMax', 1.0],
  ['§5.1.1', 'castes.gyne.casteMassMg', 25], ['§5.1.1', 'castes.gyne.fixedStats.maxHp', 35],
  ['§5.1.1', 'castes.gyne.fixedStats.bite', 1.5], ['§5.1.1', 'castes.gyne.cropMax', 3.0],
  ['§5.1.1', 'castes.gyne.upkeepOverride.restC', 0.15], ['§5.1.1', 'castes.gyne.sprintBuS', 10],
  ['§5.1.1', 'castes.male.casteMassMg', 0.8], ['§5.1.1', 'castes.male.fixedStats.maxHp', 6],
  ['§5.1.1', 'castes.male.fixedStats.bite', 0.2], ['§5.1.1', 'castes.male.upkeepOverride.restC', 0.06],
  ['§5.1.1', 'castes.worker.ageRateOutside', 3.0], ['§5.1.1', 'castes.worker.ageRateDormant', 0.15],
  // life history (§5.1.2)
  ['§5.1.2', 'life.stageGd.egg', 1.4], ['§5.1.2', 'life.stageGd.larva', 0.6], ['§5.1.2', 'life.stageGd.pupa', 1.9],
  ['§5.1.2', 'life.devRefC', 21],
  ['§5.1.2', 'life.devRate', [[10, 0], [15, 0.455], [20, 0.909], [21, 1.0], [25, 1.364], [30, 1.818], [32, 1.818], [34, 0.909], [36, 0]], 0.001],
  ['§5.1.2', 'life.qMax', 100], ['§5.1.2', 'life.sizeBase', 0.3], ['§5.1.2', 'life.sizeK', 300],
  ['§5.1.2', 'life.fTempQ', [[14, 0], [20, 1], [30, 1], [34, 0.5], [36, 0]]],
  ['§5.1.2', 'life.queenLifespanYears.min', 15], ['§5.1.2', 'life.queenLifespanYears.max', 25],
  ['§5.1.2', 'life.larvaFood', 'trophallaxis+solid'], ['§5.1.2', 'life.queenUpkeep.c', 0.3], ['§5.1.2', 'life.queenUpkeep.p', 0.1],
  // founding (§5.1.3, C6)
  ['§5.1.3', 'opening.mode', 'claustral'], ['§5.1.3', 'opening.siteMaterials.loam', 1.0], ['§5.1.3', 'opening.siteMaterials.humus', 0.9],
  ['§5.1.3', 'opening.siteMaterials.sand', 0.8], ['§5.1.3', 'opening.siteMaterials.clay', 0.5],
  ['§5.1.3', 'opening.siteMaterials.gravel', 0.4], ['C6', 'opening.dMinOpenBu', 8], ['C6', 'opening.dMinCoverBu', 5],
  ['C6', 'opening.vMinBu3', 10], ['C6', 'opening.wMinBu', 3.5], ['§5.1.3', 'opening.shaftTargetBu', 10],
  ['C6', 'opening.R0', 56], ['C6', 'opening.clutchCap', 48], ['§5.1.3', 'opening.expectedFirstWorkers.min', 8],
  ['§5.1.3', 'opening.expectedFirstWorkers.max', 16], ['§5.1.3 / R20', 'opening.startDoy', { min: 5, max: 9, default: 5 }],
  ['C1', 'opening.startHours', [14, 16]], ['§1', 'foundingSeason', 'summer'],
  // scale and reproduction (§5.1.4, C2, C11)
  ['C2', 'scale.simCapWorkers', 1500], ['§5.1.4', 'scale.wildColonySize.typical', [5000, 10000]],
  ['§5.1.4', 'scale.wildColonySize.max', 17000], ['C11', 'scale.growThreshold', 75], ['C11', 'scale.matureThreshold', 700],
  ['§5.1.4', 'scale.growthTargets', [[1, 12, 25], [2, 200, 320], [3, 500, 750], [4, 850, 1050], [5, 1100, 1300]]],
  ['§5.1.4', 'signals.recruitUnlockWorkers', 75], ['§5.1.4', 'reproduction.matureAgeYears', 2],
  ['§5.1.4', 'reproduction.alateLayWindow', [2, 6]], ['C11', 'reproduction.reproMaxFrac', 0.1],
  ['C11', 'reproduction.reproGyneShare', 0.4], ['C5', 'reproduction.sexualCostMult', { gyne: 12, male: 2 }],
  ['§5.1.4', 'reproduction.alateFlightWindow', [9, 13]], ['§5.1.4', 'reproduction.flightPeak', [10, 11]],
  ['§5.1.4', 'reproduction.launchHours', [14, 18]], ['§5.1.4', 'reproduction.flightGate.minAirC', 13],
  ['§5.1.4', 'reproduction.flightGate.maxWindMs', 6.3], ['§11.2', 'reproduction.pAir', 0.6], ['§11.2', 'reproduction.pMate', 0.9],
  ['C11', 'reproduction.gyneUpkeepC', 0.15], ['C11', 'reproduction.maleUpkeepC', 0.06],
  // diet (§5.1.5)
  ['§5.1.5', 'diet.foods.honeydew.pref', 1.0], ['§5.1.5', 'diet.foods.sugar.pref', 0.9], ['§5.1.5', 'diet.foods.nectar.pref', 0.8],
  ['§5.1.5', 'diet.foods.fruit.pref', 0.6], ['§5.1.5', 'diet.foods.crumb.pref', 0.6], ['§5.1.5', 'diet.foods.carrion.pref', 0.7],
  ['§5.1.5', 'diet.foods.prey.pref', 0.8], ['§5.1.5', 'diet.foods.pet-food.pref', 0.5], ['§5.1.5', 'diet.foods.seed.pref', 0.3],
  ['§5.1.5', 'diet.foods.bait.pref', 0.7], ['§5.1.5', 'diet.foods.dew.pref', 0.2], ['§5.1.5', 'diet.foods.honeydew.route', 'crop-c'],
  ['§5.1.5', 'diet.foods.prey.route', 'solid-p'], ['§5.1.5', 'diet.foods.fruit.route', 'crop-cp'],
  ['§5.1.5', 'diet.foods.honeydew.tier', 'T1'], ['§5.1.5', 'diet.foods.fruit.tier', 'T2'],
  ['§5.1.5', 'diet.pTargetFrac', 0.3], ['§5.1.5', 'diet.pTargetFracNoLarvae', 0.05],
  // nest (§5.1.6; GDD 03 §2.1, §8.2)
  ['03 §2.1', 'nestTemplate.nestMaterials.loam', 1.0], ['03 §2.1', 'nestTemplate.nestMaterials.humus', 1.3],
  ['03 §2.1', 'nestTemplate.nestMaterials.sand', 1.6], ['03 §2.1', 'nestTemplate.nestMaterials.clay', 0.45],
  ['03 §2.1', 'nestTemplate.nestMaterials.gravel', 0.35], ['§5.1.6', 'nestTemplate.tunnelWidthBu', 2.0],
  ['§5.1.6', 'nestTemplate.shaftWidthBu', 2.5], ['§5.1.6', 'nestTemplate.maxDepthBu', 175], ['§5.1.6', 'nestTemplate.mound', 'soft-mound'],
  ['§5.1.6', 'nestTemplate.midden', 'surface-pile'], ['03 §8.2', 'nestTemplate.footprintRBu', 80],
  ['03 §8.2', 'nestTemplate.volumeCapBu3', 12000], ['03 §8.2', 'nestTemplate.maxPathToEntranceBu', 120],
  ['03 §8.2', 'nestTemplate.chambers.royal.depthBu', [12, 40]], ['03 §8.2', 'nestTemplate.chambers.nursery.depthBu', [4, 30]],
  ['03 §8.2', 'nestTemplate.chambers.food.depthBu', [8, 30]], ['03 §8.2', 'nestTemplate.chambers.rest.depthBu', [10, 60]],
  ['03 §8.2', 'nestTemplate.chambers.royal.minWorkers', 8], ['03 §8.2', 'nestTemplate.entrances', { start: 3, perWorkers: 800, max: 4 }],
  ['§5.1.6', 'nestTemplate.broodClimate.egg.tOpt', [22, 27]], ['§5.1.6', 'nestTemplate.broodClimate.pupa.tOpt', [25, 30]],
  ['§5.1.6', 'nestTemplate.broodClimate.egg.rh', [0.7, 0.9]], ['§5.1.6', 'nestTemplate.broodClimate.pupa.rh', [0.5, 0.7]],
  // thermal, signals, combat, winter (§5.1.7, 06 §2.6)
  ['§5.1.7', 'thermal.thermalShiftC', 0], ['§5.1.7', 'thermal.forageGate', { a: 8, b: 18, c: 30, d: 38 }], ['§5.1.7', 'thermal.stressC', 35], ['§5.1.7', 'thermal.shadeSeekC', 33],
  ['§5.1.7', 'thermal.chillC', 4], ['§5.1.7', 'thermal.freezeC', -2], ['§5.1.7', 'thermal.lightPref.night', 0.35],
  ['§5.1.7', 'thermal.lightPref.dawn', 0.8], ['§5.1.7', 'thermal.lightPref.midday', 1.0], ['§5.1.7', 'thermal.lightPref.dusk', 0.8],
  ['§5.1.7', 'signals.trailHalfLifeS', 900], ['§5.1.7', 'signals.trailRefC', 22], ['§5.1.7', 'signals.homeHalfLifeGd', 2],
  ['§5.1.7', 'signals.ignorerFrac', 0.2], ['§5.1.7', 'signals.alarmRadiusBu', 8], ['§5.1.7', 'combat.acid.max', 5],
  ['§5.1.7', 'combat.acid.regenS', 120], ['§5.1.7', 'combat.aggression', 0.5], ['§5.1.7', 'combat.weapons', ['bite', 'bite-hold', 'spray-acid']],
  ['§5.1.7', 'winter.mode', 'diapause-lapse'], ['§5.1.7', 'winter.tColdStress', 2.0], ['§5.1.7', 'winter.wintBaseLoss', 0.06],
  ['§5.1.7', 'winter.wintMetBase', 0.35], ['§5.1.7', 'winter.wintQ10', 2.2], ['§5.1.7', 'winter.broodCarried', 'larva'],
];

describe('Lasius niger data = GDD 07 §5.1', () => {
  it('has at least 40 transcribed values and all of them match', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(40);
    expect(mismatches(LASIUS_NIGER, ROWS)).toEqual([]);
  });

  it('a wrong row is reported (negative control)', () => {
    expect(mismatches(LASIUS_NIGER, [['x', 'castes.worker.casteMassMg', 2.0]])).toHaveLength(1);
  });
});
