// Lasius niger, black garden ant: the reference species (GDD 07 §5.1). Minimal but complete definition so the
// simulation can run; the species-data task refines and completes it. Units per field in src/sim/types/species.ts.

import type { CasteDef, SpeciesDef } from '@/sim/types';

const WORKER_ACTIONS: CasteDef['actions'] = [
  'move', 'let-go', 'grip', 'pick-up', 'put-down', 'drop', 'dig-bite', 'seal-entrance', 'unseal-entrance',
  'feed-larva', 'trophallaxis-give', 'trophallaxis-receive', 'groom', 'antennate', 'sniff', 'lay-trail',
  'harvest-liquid', 'harvest-solid', 'tend-aphid', 'carry-aphid', 'bite', 'bite-hold', 'spray-acid',
  'release-alarm', 'drag', 'dodge', 'cull-aphid',
];

const NO_UNLOCK = { minWorkers: 0, minColonyAgeYears: 0 };

const CASTES: CasteDef[] = [
  {
    caste: 'worker', sizeClasses: [{ id: 'nanitic', minBu: 0.8, maxBu: 0.9 }],
    lengthBu: { min: 0.9, mean: 1.0, max: 1.15 }, casteMassMg: 1.0, cropMax: 1.0, carryOverride: null,
    mandibleFactor: 1.0, macrocephalic: false, cruiseMult: 1, sprintBuS: 12,
    lifespanGd: { mean: 33, sd: 10 }, lifespanBySize: [[100, 33], [250, 24]],
    ageRateOutside: 3.0, ageRateDormant: 0.15, upkeepOverride: null, devMult: 1,
    actions: WORKER_ACTIONS, taskWeights: { garden: 0, cut: 0, mill: 0 }, unlock: NO_UNLOCK,
  },
  {
    caste: 'queen', sizeClasses: [], lengthBu: { min: 2.0, mean: 2.1, max: 2.25 }, casteMassMg: 30,
    cropMax: 1.0, carryOverride: 0, mandibleFactor: 0.6, macrocephalic: false, cruiseMult: 0.5, sprintBuS: 5,
    lifespanGd: { mean: 560, sd: 60 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    upkeepOverride: { restC: 0.3, activeC: 0.3, p: 0.1 }, devMult: 1,
    actions: ['dig-bite', 'seal-entrance', 'lay-egg', 'feed-larva', 'groom', 'pick-up', 'put-down', 'spray-acid',
      'bite', 'trophallaxis-receive', 'sniff', 'antennate', 'move', 'grip', 'let-go'],
    taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'gyne', sizeClasses: [], lengthBu: { min: 2.0, mean: 2.1, max: 2.25 }, casteMassMg: 25,
    cropMax: 3.0, carryOverride: 0, mandibleFactor: 0.6, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 60, sd: 10 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    upkeepOverride: { restC: 0.15, activeC: 0.15, p: 0 }, devMult: 1,
    actions: ['fly', 'mate', 'dealate', 'groom', 'trophallaxis-receive', 'spray-acid', 'move', 'grip', 'let-go'],
    taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'male', sizeClasses: [], lengthBu: { min: 0.9, mean: 0.95, max: 1.05 }, casteMassMg: 0.8,
    cropMax: 0.3, carryOverride: 0, mandibleFactor: 0.15, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 30, sd: 5 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    upkeepOverride: { restC: 0.06, activeC: 0.06, p: 0 }, devMult: 1,
    actions: ['fly', 'mate', 'groom', 'trophallaxis-receive', 'move', 'grip', 'let-go'],
    taskWeights: {}, unlock: NO_UNLOCK,
  },
];

export const LASIUS_NIGER: SpeciesDef = {
  id: 'lasius-niger', binomial: 'Lasius niger', commonName: 'Black garden ant', subfamily: 'formicinae',
  buMm: 4, stdMassMg: 1.0, available: true, tier: 'T1', complexity: 1,
  playstyleLine: 'A generalist of soil and paving that ranches aphids for honeydew.',
  foundingSeason: 'summer', economyModules: ['honeydew-ranching'], codexIds: ['cx-claustral-founding', 'cx-honeydew'],
  cruiseBuS: 6, loadSpeedMult: 0.85,
  castes: CASTES,
  life: {
    stageGd: { egg: 1.4, larva: 0.6, pupa: 1.9 }, devRefC: 21,
    devRate: [[10, 0], [15, 0.45], [20, 0.91], [21, 1.0], [25, 1.36], [30, 1.82], [32, 1.85], [35, 1.4], [38, 0]],
    larvaFood: 'trophallaxis+solid', animalProteinMinFrac: 0, qMax: 100, sizeBase: 0.3, sizeK: 300,
    fSeason: [[1, 0.3], [2, 0.3], [5, 1.0], [15, 1.0], [15.01, 0.6], [18, 0.6], [18.01, 0.2], [21, 0.2], [21.01, 0], [29, 0]],
    layWindows: null, fTempQ: [[14, 0], [20, 1], [30, 1], [34, 0.5], [36, 0]],
    queenUpkeep: { c: 0.3, p: 0.1 }, queenLifespanYears: { min: 15, max: 25 },
    casteMixTarget: [[0, 0, 1, 0]], broodHazard: {},
  },
  opening: {
    mode: 'claustral', siteMaterials: { loam: 1.0, humus: 0.9, sand: 0.8, clay: 0.5, gravel: 0.4 },
    siteHard: ['no-hard-surface'], siteBonuses: ['under-cover', 'recent-rain', 'rival-scent-penalty'],
    shaftDepthBu: { min: 8, target: 10, max: 15 }, chamberWidthBu: 3, seal: true, r0: 56, clutchCap: 48,
    trophicFraction: 0, firstBroodClass: { caste: 'worker', nanitic: true }, expectedFirstWorkers: { min: 8, max: 16 },
    special: [], startDoy: { min: 8, max: 12, default: 10 }, startHours: [14, 16],
  },
  scale: {
    simCapWorkers: 1500,
    realEstimate: [[0, 0], [300, 300], [611, 1500], [961, 3500], [1172, 5500], [1275, 7000], [1393, 10000], [1480, 16700]],
    growthTargets: [[1, 12, 25], [2, 200, 320], [3, 500, 750], [4, 850, 1050], [5, 1100, 1300]],
  },
  reproduction: {
    matureAgeYears: 2, alateLayWindow: [2, 6], reproMaxFrac: 0.1, reproGyneShare: 0.4,
    sexualCostMult: { gyne: 12, male: 2 }, alateFlightWindow: [9, 13], flightPeak: [10, 11], launchHours: [14, 18],
    flightGate: { minAirC: 13, maxWindMs: 6.3, noRain: true }, synchrony: 'regional', alatesOverwinter: false,
    // maleUpkeepC 0.08 is GDD 06 §11; GDD 07's caste table gives 0.06 (castes.male.upkeepOverride). Open question
    // in docs/design/tdd/01-contracts-map.md (e) 10, for species-data to settle.
    pAir: 0.6, pMate: 0.9, pFound: 0.7, gyneUpkeepC: 0.15, maleUpkeepC: 0.08,
  },
  diet: {
    foods: {
      honeydew: { pref: 1.0, route: 'crop-c', tier: 'T2' }, sugar: { pref: 0.9, route: 'crop-c', tier: 'T1' },
      nectar: { pref: 0.8, route: 'crop-c', tier: 'T2' }, fruit: { pref: 0.6, route: 'crop-cp', tier: 'T1' },
      crumb: { pref: 0.6, route: 'solid-cp', tier: 'T1' }, carrion: { pref: 0.7, route: 'solid-p', tier: 'T1' },
      prey: { pref: 0.8, route: 'solid-p', tier: 'T2' }, 'pet-food': { pref: 0.5, route: 'solid-p', tier: 'T2' },
      seed: { pref: 0.3, route: 'solid-p', tier: 'T2' }, bait: { pref: 0.7, route: 'crop-c', tier: 'T2' },
      dew: { pref: 0.2, route: 'water', tier: 'T2' },
    },
    pTargetFrac: 0.3, pTargetFracNoLarvae: 0.05, sapPerCut: 0,
  },
  nestTemplate: {
    nestMaterials: { loam: 1.0, humus: 1.1, sand: 1.4, clay: 0.5, gravel: 0.6, 'wood-decayed': 0.5, insulation: 0.5 },
    coverBonus: ['stone', 'concrete', 'brick', 'tile', 'plastic', 'metal'],
    tunnelWidthBu: 2.0, shaftWidthBu: 2.5,
    chambers: [
      { type: 'royal', widthBu: 8, heightBu: 2, depthBu: [15, 40], perUnit: 1, unitOf: 'fixed', minWorkers: 30 },
      { type: 'nursery', widthBu: 10, heightBu: 2.25, depthBu: [6, 25], perUnit: 1 / 60, unitOf: 'brood', minWorkers: 8 },
      { type: 'food', widthBu: 8, heightBu: 2, depthBu: [15, 40], perUnit: 1 / 300, unitOf: 'workers', minWorkers: 25 },
      { type: 'rest', widthBu: 10, heightBu: 2.5, depthBu: [20, 60], perUnit: 1 / 150, unitOf: 'workers', minWorkers: 40 },
    ],
    entrances: { start: 1, perWorkers: 400, max: 4 }, maxDepthBu: 175, footprintRBu: 80, volumeCapBu3: 12000,
    maxPathToEntranceBu: 120, mound: 'soft-mound', midden: 'surface-pile',
    broodClimate: [
      { stage: 'egg', tMin: 16, tOpt: [22, 27], tMax: 34, rh: [0.7, 0.9] },
      { stage: 'larva', tMin: 16, tOpt: [22, 27], tMax: 34, rh: [0.7, 0.9] },
      { stage: 'pupa', tMin: 18, tOpt: [25, 30], tMax: 36, rh: [0.5, 0.7] },
    ],
  },
  thermal: {
    thermalShiftC: 0, forageGate: { a: 8, b: 18, c: 30, d: 38 }, stressC: 35, shadeSeekC: 33, chillC: 4, freezeC: -2,
    lightPref: { night: 0.35, dawn: 0.8, morning: 1, midday: 1, afternoon: 1, dusk: 0.8 }, lightPrefSeason: {},
  },
  signals: {
    trailHalfLifeS: 900, trailRefC: 22,
    trunkTrail: { enabled: false, unusedHalfLifeGd: 0, ghostAfterGd: 0, ghostFadeGd: 0, clearing: false },
    homeHalfLifeGd: 2, ignorerFrac: 0.2, recruitUnlockWorkers: 75, recruitGroup: { min: 1, max: 1 },
    patrolGate: null, alarmMode: 'pheromone', alarmRadiusBu: 8,
  },
  combat: {
    weapons: ['bite', 'bite-hold', 'spray-acid'], acid: { max: 5, regenS: 120, coneDeg: 60, rangeL: 1.5 },
    sting: null, aggression: 0.5, guardCastes: [],
  },
  climate: 'temperate-maritime',
  winter: {
    mode: 'diapause-lapse', tColdStress: 2.0, wintBaseLoss: 0.06, wintMetBase: 0.35, wintQ10: 2.2,
    broodCarried: 'larva', heatedNestRule: true,
  },
  directiveTasks: ['forage', 'nurse', 'dig', 'guard'], directiveExtras: [], taskSubtypes: ['tend:relay', 'tend:relocate-aphid'],
  appearance: {
    bodyColour: '#1e1814', gasterColour: '#1a1512', hairiness: 0.2, waistNodes: 1, rearWeapon: 'acidopore',
    spines: 0, headWidthRatio: { worker: 0.22, queen: 0.2 }, queenThoraxScale: 1.4, alateWingTint: '#d8d4cc',
  },
  modules: { 'honeydew-ranching': { tendBonus: 0.3 } },
};
