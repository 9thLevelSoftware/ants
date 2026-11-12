// Messor barbarus against the numbers of GDD 07 §5.3 (section references in each row), 00-index C-constants and
// GDD 06 §1.5 / §2.6 / §11.2. fSeason is written by the GDD on the 1-based D; here d28 = D - 1.
import { describe, expect, it } from 'vitest';
import { MESSOR_BARBARUS as MB } from './messor-barbarus';
import { mismatches, type ValueRow } from './valueTable';

const ROWS: ValueRow[] = [
  // identity
  ['§1', 'id', 'messor-barbarus'], ['§1', 'buMm', 7], ['§1', 'climate', 'mediterranean'], ['§1', 'tier', 'T3'], ['§1', 'complexity', 2],
  ['§5.3.1', 'stdMassMg', 7], ['§5.3.1', 'subfamily', 'myrmicinae'], ['§1', 'economyModules', ['granary']], ['§1', 'foundingSeason', 'autumn'],
  ['C3', 'loadSpeedMult', 0.75], ['§5.3.1', 'cruiseBuS', 5],
  // castes (§5.3.1)
  ['§5.3.1', 'castes.minor.lengthBu', { min: 0.55, mean: 0.7, max: 0.85 }], ['§5.3.1', 'castes.minor.casteMassMg', 2.0],
  ['§5.3.1', 'castes.minor.lifespanGd', { mean: 12, sd: 3 }], ['§5.3.1', 'castes.minor.sizeClasses.nanitic', { id: 'nanitic', minBu: 0.5, maxBu: 0.7 }],
  ['§5.3.1', 'castes.media.lengthBu', { min: 0.85, mean: 1.05, max: 1.3 }], ['§5.3.1', 'castes.media.casteMassMg', 7],
  ['§5.3.1', 'castes.media.lifespanGd', { mean: 16, sd: 4 }], ['§5.3.1', 'castes.major.lengthBu', { min: 1.3, mean: 1.55, max: 1.85 }],
  ['§5.3.1', 'castes.major.casteMassMg', 22], ['§5.3.1', 'castes.major.lifespanGd', { mean: 20, sd: 5 }],
  ['§5.3.1', 'castes.major.cropMax', 2.0], ['§5.3.1', 'castes.major.carryOverride', 2.5], ['§5.3.1', 'castes.major.macrocephalic', true],
  ['§5.3.1', 'castes.major.mandibleFactor', 1.5], ['§5.3.4', 'castes.major.unlock', { minWorkers: 40, minColonyAgeYears: 0 }],
  ['§5.3.1', 'castes.queen.lengthBu', { min: 2.0, mean: 2.3, max: 2.6 }], ['§5.3.1', 'castes.queen.casteMassMg', 80],
  ['§5.3.1', 'castes.queen.fixedStats', { maxHp: 107, bite: 10.7, foundingMaxHp: null }], ['§5.3.1', 'castes.queen.sprintBuS', 4],
  ['§5.3.1', 'castes.gyne.casteMassMg', 80], ['§5.3.1', 'castes.gyne.fixedStats.maxHp', 107], ['§5.3.1', 'castes.gyne.upkeepOverride.restC', 0.15],
  ['§5.3.1', 'castes.male.lengthBu', { min: 1.2, mean: 1.3, max: 1.45 }], ['§5.3.1', 'castes.male.casteMassMg', 10],
  ['§5.3.1', 'castes.male.fixedStats', { maxHp: 19, bite: 0.95, foundingMaxHp: null }], ['§5.3.1', 'castes.male.upkeepOverride.restC', 0.08],
  ['§2.5', 'castes.media.ageRateOutside', 3.5], ['§2.5', 'castes.media.ageRateDormant', 0.3],
  ['§5.3.1', 'castes.media.actions', ['move', 'let-go', 'grip', 'pick-up', 'put-down', 'drop', 'dig-bite', 'seal-entrance', 'unseal-entrance', 'feed-larva', 'trophallaxis-give', 'trophallaxis-receive', 'groom', 'antennate', 'sniff', 'lay-trail', 'harvest-liquid', 'harvest-solid', 'bite', 'bite-hold', 'release-alarm', 'drag', 'dodge', 'sting', 'gnaw-radicle', 'stridulate', 'mill-seed', 'cut-seed-head']],
  // life history (§5.3.2)
  ['§5.3.2', 'life.stageGd', { egg: 1.1, larva: 2.3, pupa: 1.2 }], ['§5.3.2', 'life.devRefC', 26],
  ['§5.3.2', 'life.devRate', [[14, 0], [18, 0.4], [22, 0.7], [26, 1.0], [29, 1.05], [32, 0.5], [36, 0]]],
  ['§5.3.2', 'castes.minor.devMult', 0.95], ['§5.3.2', 'castes.media.devMult', 1.0], ['§5.3.2', 'castes.major.devMult', 1.2],
  ['§5.3.2', 'castes.gyne.devMult', 1.4], ['§5.3.2', 'castes.male.devMult', 1.1], ['§5.3.2', 'life.larvaFood', 'seed-paste+solid'],
  ['§5.3.2', 'life.animalProteinMinFrac', 0.1], ['§5.3.2', 'life.qMax', 170], ['§5.3.2', 'life.sizeBase', 0.118], ['§5.3.2', 'life.sizeK', 400],
  ['§5.3.2', 'life.fSeason', [[0, 0.5], [1, 1.0], [7, 1.0], [8, 0.5], [13, 0.5], [14, 0.8], [19, 0.8], [21, 0], [26.5, 0], [28, 0.5]]],
  ['§5.3.2', 'life.fTempQ', [[14, 0], [22, 1], [32, 1], [37, 0]]], ['§5.3.2', 'life.casteMixTarget', [[0, 0.6, 0.4, 0], [40, 0.6, 0.4, 0], [300, 0.35, 0.45, 0.2]]],
  ['§5.3.1', 'life.queenLifespanYears', { min: 6, max: 12 }], ['§5.3.2', 'life.layWindows', null],
  // founding (§5.3.3, C6, 03 §13.1)
  ['§5.3.3', 'opening.mode', 'claustral'], ['§5.3.3', 'opening.siteMaterials', { sand: 1.0, loam: 1.0, gravel: 0.7, clay: 0.3, humus: 0.4 }],
  ['C6', 'opening.R0', 40], ['C6', 'opening.clutchCap', 20], ['§5.3.3', 'opening.expectedFirstWorkers', { min: 5, max: 8 }],
  ['§5.3.3', 'opening.special', ['lineage']], ['06 §1.6', 'opening.startDoy', { min: 15, max: 19, default: 17 }],
  ['06 §1.6', 'opening.startHours', [14, 16]], ['03 §13.1', 'opening.dMinOpenBu', 20], ['03 §13.1', 'opening.dMinCoverBu', 15],
  ['03 §13.1', 'opening.vMinBu3', 15], ['03 §13.1', 'opening.wMinBu', 4.0], ['03 §13.1', 'opening.shaftTargetBu', 25],
  // scale and reproduction (§5.3.4)
  ['C2', 'scale.simCapWorkers', 1500], ['§5.3.4', 'scale.wildColonySize.typical', [8000, 12000]], ['C11', 'scale.growThreshold', 50],
  ['C11', 'scale.matureThreshold', 700], ['§5.3.4', 'scale.growthTargets', [[1, 15, 40], [2, 150, 300], [3, 500, 900], [4, 900, 1500]]],
  ['§5.3.4', 'reproduction.matureAgeYears', 3], ['§5.3.4', 'reproduction.alateLayWindow', [8, 13]], ['§5.3.4', 'reproduction.reproMaxFrac', 0.02],
  ['§5.3.4', 'reproduction.reproGyneShare', 0.5], ['06 §11.2', 'reproduction.sexualCostMult', { gyne: 10, male: 2 }],
  ['§5.3.4', 'reproduction.alateFlightWindow', [15, 20]], ['§5.3.4', 'reproduction.flightPeak', [17, 19]], ['§5.3.4', 'reproduction.launchHours', [13, 17]],
  ['06 §11.5', 'reproduction.flightGate.minAirC', 15], ['06 §11.5', 'reproduction.flightGate.maxWindMs', 3], ['06 §11.2', 'reproduction.pAir', 0.55],
  ['§5.3.3', 'reproduction.pMate', 0.866], ['06 §11.2', 'reproduction.maleUpkeepC', 0.08], ['§5.3.4', 'reproduction.synchrony', 'regional'],
  // diet (§5.3.5)
  ['§5.3.5', 'diet.foods.seed', { pref: 1.0, route: 'granary', tier: 'T3' }], ['§5.3.5', 'diet.foods.crumb.pref', 0.6], ['§5.3.5', 'diet.foods.crumb.route', 'granary'],
  ['§5.3.5', 'diet.foods.pet-food.pref', 0.3], ['§5.3.5', 'diet.foods.carrion.pref', 0.7], ['§5.3.5', 'diet.foods.carrion.route', 'solid-p'],
  ['§5.3.5', 'diet.foods.prey.pref', 0.4], ['§5.3.5', 'diet.foods.sugar.pref', 0.2], ['§5.3.5', 'diet.foods.fruit.pref', 0.1],
  ['§5.3.5', 'diet.foods.nectar.pref', 0.15], ['§5.3.5', 'diet.foods.bait.pref', 0.5], ['§5.3.5', 'diet.foods.dew.pref', 0.4],
  ['§5.3.5', 'diet.foods.honeydew', undefined],
  // nest (§5.3.6; GDD 03 §8.2)
  ['§5.3.6', 'nestTemplate.nestMaterials', { sand: 1.4, loam: 1.0, gravel: 0.6, clay: 0.5, humus: 1.0 }], ['03 §8.2', 'nestTemplate.tunnelWidthBu', 2.0],
  ['03 §8.2', 'nestTemplate.shaftWidthBu', 2.5], ['§5.3.6', 'nestTemplate.maxDepthBu', 285], ['§5.3.6', 'nestTemplate.mound', 'crater'],
  ['§5.3.6', 'nestTemplate.midden', 'entrance-midden'], ['03 §8.2', 'nestTemplate.footprintRBu', 150], ['03 §8.2', 'nestTemplate.volumeCapBu3', 14000],
  ['03 §8.2', 'nestTemplate.maxPathToEntranceBu', 200], ['§5.3.6', 'nestTemplate.entrances.perWorkers', 300], ['§5.3.6', 'nestTemplate.entrances.start', 1],
  ['03 §8.2', 'nestTemplate.chambers.nursery.depthBu', [15, 80]], ['03 §8.2', 'nestTemplate.chambers.granary.depthBu', [60, 200]],
  ['03 §8.2', 'nestTemplate.chambers.royal.depthBu', [40, 150]], ['03 §8.2', 'nestTemplate.chambers.rest.depthBu', [20, 150]],
  ['§5.3.6', 'nestTemplate.chambers.nursery.perUnit', 1 / 60, 1e-9], ['§5.3.6', 'nestTemplate.chambers.rest.perUnit', 1 / 200, 1e-9],
  ['03 §8.2', 'nestTemplate.chambers.granary.minWorkers', 30], ['03 §8.2', 'nestTemplate.chambers.royal.minWorkers', 10],
  ['§5.3.6', 'nestTemplate.broodClimate.larva.tOpt', [24, 28]], ['§5.3.6', 'nestTemplate.broodClimate.larva.rh', [0.5, 0.8]],
  // thermal, signals, combat, winter (§5.3.7, 06 §1.5, §2.6)
  ['06 §2.6', 'thermal.thermalShiftC', 6], ['06 §2.6', 'thermal.forageGate', { a: 8, b: 20, c: 35, d: 42 }], ['06 §2.6', 'thermal.stressC', 40],
  ['06 §2.6', 'thermal.shadeSeekC', 38], ['06 §2.6', 'thermal.chillC', 6], ['06 §2.6', 'thermal.freezeC', -1],
  ['06 §1.5', 'thermal.lightPref', { night: 0.6, dawn: 1.0, morning: 0.9, midday: 0.7, afternoon: 0.9, dusk: 1.0 }],
  ['06 §1.5', 'thermal.lightPrefSeason', { summer: { night: 1.0 } }], ['§5.3.7', 'signals.trailHalfLifeS', 120],
  ['§5.3.7', 'signals.trunkTrail', { enabled: true, unusedHalfLifeGd: 3, ghostAfterGd: 10, ghostFadeGd: 7, clearing: true }],
  ['§5.3.7', 'signals.ignorerFrac', 0.15], ['§5.3.7', 'signals.recruitUnlockWorkers', 30], ['§5.3.7', 'signals.recruitGroup', { min: 5, max: 30 }],
  ['§5.3.7', 'signals.patrolGate.returnsNeeded', 3], ['§5.3.7', 'signals.patrolGate.windowS', 60], ['§5.3.7', 'signals.alarmMode', 'stridulation'],
  ['§5.3.7', 'signals.alarmRadiusBu', 10], ['§5.3.7', 'combat.weapons', ['bite', 'bite-hold', 'sting']], ['§5.3.7', 'combat.sting', { damage: 6, intervalS: 2 }],
  ['§5.3.7', 'combat.acid', null], ['§5.3.7', 'combat.aggression', 0.7], ['§5.3.7', 'combat.guardCastes', ['major']],
  ['§5.3.7', 'winter.mode', 'rest-lapse'], ['06 §6.3', 'winter.tColdStress', 4.0], ['06 §6.3', 'winter.wintBaseLoss', 0.05],
  ['§5.3.7', 'winter.wintMetBase', 0.3],
  // module (§6.3)
  ['§6.3.1', 'modules.granary.seedLoadsL', 2.5], ['§6.3.3', 'modules.granary.loadsPerBu3', 2.0], ['§6.3.4', 'modules.granary.uDamp', 0.55],
  ['§6.3.5', 'modules.granary.targetStockGd', 36], ['§6.3.6', 'modules.granary.millBaseS', 12], ['§6.3.6', 'modules.granary.pasteHalfLifeGd', 3],
  ['§6.3.6', 'modules.granary.pasteYield', 0.8], ['§6.3.6', 'modules.granary.pasteC', 0.65], ['§6.3.7', 'modules.granary.animalProteinGrowthMult', 0.5],
  ['§5.3.3', 'modules.granary.matesMean', 2.4],
];

describe('Messor barbarus data = GDD 07 §5.3', () => {
  it('has at least 40 transcribed values and all of them match', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(40);
    expect(mismatches(MB, ROWS)).toEqual([]);
  });

  it('has no spray-acid and no aphid actions (myrmicine, honeydew 0)', () => {
    for (const c of MB.castes) {
      expect(c.actions).not.toContain('spray-acid');
      expect(c.actions).not.toContain('tend-aphid');
    }
  });

  it('minors cannot mill or cut seed heads; majors can', () => {
    const has = (caste: string, a: string): boolean => MB.castes.find((c) => c.caste === caste)!.actions.includes(a as never);
    expect(has('minor', 'mill-seed')).toBe(false);
    expect(has('major', 'mill-seed')).toBe(true);
    expect(has('major', 'cut-seed-head')).toBe(true);
  });
});
