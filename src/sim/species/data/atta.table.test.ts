// Atta texana against the numbers of GDD 07 §5.4 (section references in each row), 00-index C-constants and
// GDD 06 §1.5 / §2.6 / §11.2. fSeason is the season table of §5.4.2 with 1 GD ramps centred on the boundaries.
import { describe, expect, it } from 'vitest';
import { ATTA_SMALL_MEDIA_SHARE, ATTA_TEXANA as AT } from './atta-texana';
import { mismatches, type ValueRow } from './valueTable';

const ROWS: ValueRow[] = [
  // identity
  ['§1', 'id', 'atta-texana'], ['§1', 'buMm', 7], ['§1', 'climate', 'subtropical'], ['§1', 'tier', 'T3'], ['§1', 'complexity', 3],
  ['§5.4.1', 'stdMassMg', 5], ['§5.4.1', 'subfamily', 'myrmicinae'], ['§1', 'economyModules', ['fungus-garden']], ['§1', 'foundingSeason', 'spring'],
  ['C3', 'loadSpeedMult', 0.65], ['§5.4.1', 'cruiseBuS', 6],
  // castes (§5.4.1)
  ['§5.4.1', 'castes.minor.lengthBu', { min: 0.3, mean: 0.35, max: 0.45 }], ['§5.4.1', 'castes.minor.casteMassMg', 0.3],
  ['§5.4.1', 'castes.minor.lifespanGd', { mean: 40, sd: 12 }], ['§5.4.1', 'castes.minor.mandibleFactor', 0.8], ['§5.4.1', 'castes.minor.sprintBuS', 8],
  ['§5.4.1', 'castes.minor.cruiseMult', 0.8], ['§5.4.1', 'castes.media.lengthBu', { min: 0.6, mean: 1.0, max: 1.3 }], ['§5.4.1', 'castes.media.casteMassMg', 5],
  ['§5.4.1', 'castes.media.sizeClasses.small-media', { id: 'small-media', minBu: 0.6, maxBu: 0.8 }], ['§5.4.1', 'castes.media.lifespanGd', { mean: 40, sd: 12 }],
  ['§5.4.1', 'castes.major.lengthBu', { min: 1.6, mean: 1.8, max: 1.9 }], ['§5.4.1', 'castes.major.casteMassMg', 30],
  ['§5.4.1', 'castes.major.lifespanGd', { mean: 50, sd: 15 }], ['§5.4.1', 'castes.major.cropMax', 2.5], ['§5.4.1', 'castes.major.mandibleFactor', 2.0],
  ['§5.4.1', 'castes.major.sprintBuS', 9], ['§5.4.1', 'castes.major.cruiseMult', 0.9], ['§5.4.2', 'castes.major.unlock', { minWorkers: 400, minColonyAgeYears: 0 }],
  ['§5.4.1', 'castes.queen.lengthBu', { min: 2.4, mean: 2.6, max: 2.7 }], ['§5.4.1', 'castes.queen.casteMassMg', 300],
  ['§5.4.1', 'castes.queen.fixedStats', { maxHp: 208, bite: 20.8, foundingMaxHp: null }], ['§5.4.1', 'castes.queen.sprintBuS', 4],
  ['§5.4.1', 'castes.gyne.fixedStats.maxHp', 208], ['§5.4.1', 'castes.gyne.upkeepOverride.restC', 0.2], ['§5.4.1', 'castes.gyne.sprintBuS', 9],
  ['§5.4.1', 'castes.male.lengthBu', { min: 1.7, mean: 1.9, max: 2.1 }], ['§5.4.1', 'castes.male.casteMassMg', 60],
  ['§5.4.1', 'castes.male.fixedStats', { maxHp: 46, bite: 2.3, foundingMaxHp: null }], ['§5.4.1', 'castes.male.upkeepOverride.restC', 0.15],
  ['§2.5', 'castes.media.ageRateOutside', 3.0]
  // life history (§5.4.2)
  ['§5.4.2', 'life.stageGd', { egg: 0.85, larva: 1.65, pupa: 1.7 }], ['§5.4.2', 'life.devRefC', 25],
  ['§5.4.2', 'life.devRate', [[15, 0], [20, 0.5], [25, 1.0], [28, 1.4], [30, 1.2], [32, 0]]],
  ['§5.4.2', 'castes.minor.devMult', 0.83], ['§5.4.2', 'castes.media.devMult', 1.0], ['§5.4.2', 'castes.major.devMult', 1.19],
  ['§5.4.2', 'castes.gyne.devMult', 1.4], ['§5.4.2', 'castes.male.devMult', 1.25], ['§5.4.2', 'life.larvaFood', 'staphylae'],
  ['§5.4.2', 'life.qMax', 120], ['§5.4.2', 'life.sizeBase', 0.083], ['§5.4.2', 'life.sizeK', 500], ['§5.4.2', 'life.fTempQ', [[18, 0], [22, 1], [30, 1], [33, 0]]],
  ['§5.4.2', 'life.fSeason', [[0, 0.75], [0.5, 1.0], [6.5, 1.0], [7.5, 0.8], [13.5, 0.8], [14.5, 0.9], [20.5, 0.9], [21.5, 0.5], [27.5, 0.5], [28, 0.75]]],
  ['§5.4.2', 'life.casteMixTarget.4', [1000, 0.3, 0.62, 0.08]], ['§5.4.2', 'life.queenLifespanYears', { min: 10, max: 15 }],
  // founding (§5.4.3, C6, 03 §13.1)
  ['§5.4.3', 'opening.mode', 'claustral-fungus'], ['§5.4.3', 'opening.siteMaterials', { sand: 1.0, loam: 1.0, humus: 0.5, clay: 0.2 }],
  ['C6', 'opening.R0', 48], ['C6', 'opening.clutchCap', 40], ['06 §5.15', 'opening.trophicFraction', 0.7],
  ['§5.4.3', 'opening.expectedFirstWorkers', { min: 8, max: 14 }], ['§5.4.3', 'opening.special', ['pellet']],
  ['06 §1.6', 'opening.startDoy', { min: 2, max: 8, default: 5 }], ['06 §1.6', 'opening.startHours', [21, 23]],
  ['03 §13.1', 'opening.dMinOpenBu', 30], ['03 §13.1', 'opening.dMinCoverBu', 25], ['03 §13.1', 'opening.vMinBu3', 25],
  ['03 §13.1', 'opening.wMinBu', 4.5], ['03 §13.1', 'opening.shaftTargetBu', 35],
  // scale and reproduction (§5.4.4)
  ['C2', 'scale.simCapWorkers', 1500], ['§5.4.4', 'scale.wildColonySize', { typical: [100000, 1000000], max: 2000000 }],
  ['C11', 'scale.growThreshold', 150], ['C11', 'scale.matureThreshold', 1000], ['§5.4.4', 'scale.growthTargets', [[1, 100, 300], [2, 400, 800], [3, 1000, 1500]]],
  ['§5.4.4', 'reproduction.matureAgeYears', 3], ['§5.4.4', 'reproduction.alateLayWindow', [15, 28]], ['§5.4.4', 'reproduction.reproMaxFrac', 0.04],
  ['§5.4.4', 'reproduction.reproGyneShare', 0.25], ['06 §11.2', 'reproduction.sexualCostMult', { gyne: 15, male: 3 }],
  ['§5.4.4', 'reproduction.alateFlightWindow', [2, 8]], ['§5.4.4', 'reproduction.launchHours', [21, 3]], ['06 §11.5', 'reproduction.flightGate.minAirC', 15],
  ['06 §11.5', 'reproduction.flightGate.maxWindMs', 3], ['06 §11.2', 'reproduction.pAir', 0.5], ['06 §11.2', 'reproduction.gyneUpkeepC', 0.2],
  ['06 §11.2', 'reproduction.maleUpkeepC', 0.15], ['§5.4.4', 'reproduction.synchrony', 'regional'],
  // diet (§5.4.5)
  ['§5.4.5', 'diet.foods.leaf', { pref: 1.0, route: 'substrate', tier: 'T3' }], ['§5.4.5', 'diet.foods.fruit.pref', 0.4], ['§5.4.5', 'diet.foods.crumb.pref', 0.2],
  ['§5.4.5', 'diet.foods.seed.pref', 0.1], ['§5.4.5', 'diet.foods.bait.pref', 0.8], ['§5.4.5', 'diet.foods.nectar.pref', 0.3],
  ['§5.4.5', 'diet.foods.sugar.pref', 0.2], ['§5.4.5', 'diet.foods.dew.pref', 0.3], ['§5.4.5', 'diet.foods.prey', undefined],
  ['§5.4.5', 'diet.foods.carrion', undefined], ['§5.4.5', 'diet.foods.pet-food', undefined], ['§5.4.5', 'diet.foods.honeydew', undefined],
  ['§5.4.5', 'diet.sapPerCut', 0.3],
  // nest (§5.4.6; GDD 03 §8.2)
  ['§5.4.6', 'nestTemplate.nestMaterials', { sand: 1.3, loam: 1.0, humus: 0.9, clay: 0.4 }], ['§5.4.6', 'nestTemplate.tunnelWidthBu', 2.5],
  ['§5.4.6', 'nestTemplate.shaftWidthBu', 3.0], ['§5.4.6', 'nestTemplate.maxDepthBu', 450], ['§5.4.6', 'nestTemplate.mound', 'crater'],
  ['§5.4.6', 'nestTemplate.midden', 'detritus-chamber+heap'], ['§5.4.6', 'nestTemplate.footprintRBu', 150], ['§5.4.6', 'nestTemplate.entrances', { start: 1, perWorkers: 40, max: 40 }],
  ['03 §8.2', 'nestTemplate.volumeCapBu3', 30000], ['03 §8.2', 'nestTemplate.maxPathToEntranceBu', 300], ['03 §8.2', 'nestTemplate.chambers.fungus.depthBu', [40, 400]],
  ['03 §8.2', 'nestTemplate.chambers.midden.depthBu', [100, 400]], ['03 §8.2', 'nestTemplate.chambers.royal.depthBu', [150, 400]],
  ['03 §8.2', 'nestTemplate.chambers.royal.minWorkers', 20], ['§5.4.6', 'nestTemplate.broodClimate.larva.tOpt', [21, 25]],
  ['§5.4.6', 'nestTemplate.broodClimate.larva.rh', [0.8, 1.0]],
  // thermal, signals, combat, winter (§5.4.7, 06 §1.5, §2.6)
  ['06 §2.6', 'thermal.thermalShiftC', 2], ['06 §2.6', 'thermal.forageGate', { a: 7, b: 20, c: 25, d: 28 }], ['06 §2.6', 'thermal.stressC', 38],
  ['06 §2.6', 'thermal.shadeSeekC', 36], ['06 §2.6', 'thermal.chillC', 5], ['06 §2.6', 'thermal.freezeC', -1],
  ['06 §1.5', 'thermal.lightPref', { night: 1.0, dawn: 0.7, morning: 0.6, midday: 0.5, afternoon: 0.6, dusk: 1.0 }],
  ['§5.4.7', 'signals.trailHalfLifeS', 3600], ['§5.4.7', 'signals.trailRefC', 25],
  ['§5.4.7', 'signals.trunkTrail', { enabled: true, unusedHalfLifeGd: 5, ghostAfterGd: 10, ghostFadeGd: 10, clearing: true }],
  ['§5.4.7', 'signals.recruitUnlockWorkers', 20], ['§5.4.7', 'signals.recruitGroup', { min: 10, max: 60 }], ['§5.4.7', 'signals.alarmMode', 'pheromone'],
  ['§5.4.7', 'signals.alarmRadiusBu', 12], ['§5.4.7', 'combat.weapons', ['bite', 'bite-hold']], ['§5.4.7', 'combat.guardCastes', ['major']],
  ['§5.4.7', 'combat.sting', null], ['§5.4.7', 'combat.acid', null], ['§5.4.7', 'winter.mode', 'active'],
  // module (§6.4)
  ['§6.4.1', 'modules.fungus-garden.guPerBu3', 0.004], ['§6.4.2', 'modules.fungus-garden.subNeedPerGu', 1.8], ['§6.4.2', 'modules.fungus-garden.gardenR', 0.17],
  ['§6.4.2', 'modules.fungus-garden.gardenRBurst', 0.47], ['§6.4.2', 'modules.fungus-garden.yieldPerGu', 0.5], ['§6.4.4', 'modules.fungus-garden.escLambda', 0.0015],
  ['§6.4.4', 'modules.fungus-garden.weedR', 2.0], ['§6.4.8', 'modules.fungus-garden.gardenFertCost', 0.25], ['§6.4.9', 'modules.fungus-garden.gardenLessLarvaHazard', 1.0],
  ['§5.4.2', 'modules.fungus-garden.queenUpkeepFl', 0.5], ['§5.4.2', 'modules.fungus-garden.eggCostFl', 0.03],
];

describe('Atta texana data = GDD 07 §5.4', () => {
  it('has at least 40 transcribed values and all of them match', () => {
    expect(ROWS.length).toBeGreaterThanOrEqual(40);
    expect(mismatches(AT, ROWS)).toEqual([]);
  });

  it('has no sting and no spray-acid', () => {
    for (const c of AT.castes) {
      expect(c.actions).not.toContain('sting');
      expect(c.actions).not.toContain('spray-acid');
    }
  });

  it('only minims and small media feed or tend the garden; majors never garden', () => {
    const has = (caste: string, a: string): boolean => AT.castes.find((c) => c.caste === caste)!.actions.includes(a as never);
    expect(has('minor', 'feed-larva')).toBe(true);
    expect(has('minor', 'cut-leaf')).toBe(false);
    expect(has('media', 'cut-leaf')).toBe(true);
    expect(AT.castes.find((c) => c.caste === 'major')!.taskWeights.garden).toBe(0);
  });

  it('the small-media share curve matches the mix table at N 50, 200 and 1000', () => {
    const at = (n: number): number => ATTA_SMALL_MEDIA_SHARE.find(([x]) => x >= n)![1];
    expect(at(50)).toBe(1);
    expect(at(200)).toBeCloseTo(0.30 / 0.65, 3);
    expect(at(1000)).toBeCloseTo(0.25 / 0.62, 3);
  });
});
