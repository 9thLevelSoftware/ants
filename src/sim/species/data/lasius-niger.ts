// Lasius niger, black garden ant: the reference species (GDD 07 §5.1; dossier docs/research/bio-lasius-niger.md).
// Units per field: src/sim/types/species.ts. [EST] marks a design estimate, [D] a dossier value.
// Day numbers are on the default 28-day year, 0-based `d28` (00-index C1): GDD 07's 1-based `D` minus 1.

import type { CasteDef, SpeciesDef } from '@/sim/types';
import {
  actions, APHID_TENDING_ACTIONS, GYNE_BASE_ACTIONS, MALE_ACTIONS, NO_UNLOCK, QUEEN_BASE_ACTIONS, WORKER_BASE_ACTIONS,
} from './common';

// The formicine worker kit: base actions, acid, aphid tending (GDD 07 §5.1.1 "Actions").
const WORKER_ACTIONS: CasteDef['actions'] = actions(WORKER_BASE_ACTIONS, ['spray-acid', ...APHID_TENDING_ACTIONS]);

const CASTES: CasteDef[] = [
  {
    caste: 'worker', sizeClasses: [{ id: 'nanitic', minBu: 0.8, maxBu: 0.9 }],
    lengthBu: { min: 0.9, mean: 1.0, max: 1.15 }, casteMassMg: 1.0, cropMax: 1.0, carryOverride: null,
    mandibleFactor: 1.0, macrocephalic: false, cruiseMult: 1, sprintBuS: 12,
    // Ruling R30 (replaces R11; GDD 02 §1.3 deviation): 42 gd (1.5 of the 28-day years), sd 8, 30 at N >= 250; ageing
    // outside x1.5 (was 3.0: the dangers of foraging are simulated one by one now, the multiplier counted them twice).
    lifespanGd: { mean: 42, sd: 8 }, lifespanBySize: [[100, 42], [250, 30]],
    ageRateOutside: 1.5, ageRateDormant: 0.15, fixedStats: null, upkeepOverride: null, devMult: 1,
    actions: WORKER_ACTIONS, taskWeights: { garden: 0, cut: 0, mill: 0 }, unlock: NO_UNLOCK,
  },
  {
    caste: 'queen', sizeClasses: [], lengthBu: { min: 2.0, mean: 2.1, max: 2.25 }, casteMassMg: 30,
    cropMax: 1.0, carryOverride: 0, mandibleFactor: 0.27, macrocephalic: false, cruiseMult: 0.5, sprintBuS: 5,
    lifespanGd: { mean: 560, sd: 60 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    fixedStats: { maxHp: 50, bite: 2.0, foundingMaxHp: 40 }, // GDD 05 §4.1
    upkeepOverride: { restC: 0.3, activeC: 0.3, p: 0.1 }, devMult: 1,
    // GDD 01 §7.3 'Who': drop (any carrier), harvest-liquid (adults that feed), unseal (the founding queen, as dig-bite),
    // trophallaxis-give (feeding the first brood's carers) - added by the Stage 1A gate
    actions: actions(QUEEN_BASE_ACTIONS, ['spray-acid']),
    taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'gyne', sizeClasses: [], lengthBu: { min: 2.0, mean: 2.1, max: 2.25 }, casteMassMg: 25,
    cropMax: 3.0, carryOverride: 0, mandibleFactor: 0.27, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 60, sd: 10 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    fixedStats: { maxHp: 35, bite: 1.5, foundingMaxHp: null },
    upkeepOverride: { restC: 0.15, activeC: 0.15, p: 0 }, devMult: 1,
    actions: actions(GYNE_BASE_ACTIONS, ['spray-acid']), taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'male', sizeClasses: [], lengthBu: { min: 0.9, mean: 0.95, max: 1.05 }, casteMassMg: 0.8,
    cropMax: 0.3, carryOverride: 0, mandibleFactor: 0.2, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 30, sd: 5 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    fixedStats: { maxHp: 6, bite: 0.2, foundingMaxHp: null },
    upkeepOverride: { restC: 0.06, activeC: 0.06, p: 0 }, devMult: 1, // GDD 07 caste table (ruling 10)
    actions: [...MALE_ACTIONS], taskWeights: {}, unlock: NO_UNLOCK,
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
    // GDD 02 §2.2 r(T) (authoritative; registry C5, GDD 07 Lasius table): (T - 10) / 11 up to 30 °C, flat to 32, 0 at 36.
    devRate: [[10, 0], [15, 0.455], [20, 0.909], [21, 1.0], [25, 1.364], [30, 1.818], [32, 1.818], [34, 0.909], [36, 0]],
    larvaFood: 'trophallaxis+solid', animalProteinMinFrac: 0, qMax: 100, sizeBase: 0.3, sizeK: 300,
    // GDD 02 §3.2 on d28 (0-based default-year day, C1 / E-123): 0.3 over [0, 1), ramp to 1.0 over [1, 4),
    // 1.0 over [4, 14), 0.6 over [14, 17), 0.2 over [17, 20), 0 over [20, 28).
    fSeason: [[0, 0.3], [1, 0.3], [4, 1.0], [14, 1.0], [14.01, 0.6], [17, 0.6], [17.01, 0.2], [20, 0.2], [20.01, 0], [28, 0]],
    layWindows: null, fTempQ: [[14, 0], [20, 1], [30, 1], [34, 0.5], [36, 0]],
    queenUpkeep: { c: 0.3, p: 0.1 }, queenLifespanYears: { min: 15, max: 25 },
    casteMixTarget: [[0, 0, 1, 0]], broodHazard: {},
  },
  opening: {
    mode: 'claustral', siteMaterials: { loam: 1.0, humus: 0.9, sand: 0.8, clay: 0.5, gravel: 0.4 },
    siteHard: ['no-hard-surface'], siteBonuses: ['under-cover', 'recent-rain', 'rival-scent-penalty'],
    dMinOpenBu: 8, dMinCoverBu: 5, vMinBu3: 10, wMinBu: 3.5, shaftTargetBu: 10, seal: true, R0: 56, clutchCap: 48,
    trophicFraction: 0, firstBroodClass: { caste: 'worker', nanitic: true }, expectedFirstWorkers: { min: 8, max: 16 },
    special: [], startDoy: { min: 5, max: 9, default: 5 }, startHours: [14, 16],
  },
  scale: {
    simCapWorkers: 1500, wildColonySize: { typical: [5000, 10000], max: 17000 },
    growThreshold: 75, matureThreshold: 700,
    growthTargets: [[1, 12, 25], [2, 200, 320], [3, 500, 750], [4, 850, 1050], [5, 1100, 1300]],
  },
  reproduction: {
    matureAgeYears: 2, alateLayWindow: [2, 6], reproMaxFrac: 0.1, reproGyneShare: 0.4,
    sexualCostMult: { gyne: 12, male: 2 }, alateFlightWindow: [9, 13], flightPeak: [10, 11], launchHours: [14, 18],
    flightGate: { minAirC: 13, maxWindMs: 6.3, noRain: true }, synchrony: 'regional', alatesOverwinter: false,
    // maleUpkeepC: species data wins (ruling 10): 0.06 C/GD as castes.male.upkeepOverride (GDD 07), not GDD 06's 0.08.
    pAir: 0.6, pMate: 0.9, pFound: 0.7, gyneUpkeepC: 0.15, maleUpkeepC: 0.06,
  },
  diet: {
    foods: {
      honeydew: { pref: 1.0, route: 'crop-c', tier: 'T1' }, sugar: { pref: 0.9, route: 'crop-c', tier: 'T1' },
      nectar: { pref: 0.8, route: 'crop-c', tier: 'T1' }, fruit: { pref: 0.6, route: 'crop-cp', tier: 'T2' },
      crumb: { pref: 0.6, route: 'solid-cp', tier: 'T1' }, carrion: { pref: 0.7, route: 'solid-p', tier: 'T1' },
      prey: { pref: 0.8, route: 'solid-p', tier: 'T2' }, 'pet-food': { pref: 0.5, route: 'solid-p', tier: 'T2' },
      seed: { pref: 0.3, route: 'solid-p', tier: 'T2' }, bait: { pref: 0.7, route: 'crop-c', tier: 'T2' },
      dew: { pref: 0.2, route: 'water', tier: 'T2' },
    },
    pTargetFrac: 0.3, pTargetFracNoLarvae: 0.05, sapPerCut: 0,
  },
  nestTemplate: {
    // GDD 03 §2.1 digSpeed (owner; 00-index C6): loam 1.0, humus 1.3, sand 1.6, clay 0.45, gravel 0.35.
    nestMaterials: { loam: 1.0, humus: 1.3, sand: 1.6, clay: 0.45, gravel: 0.35, 'wood-decayed': 0.5, insulation: 0.5 },
    coverBonus: ['stone', 'concrete', 'brick', 'tile', 'plastic', 'metal'],
    tunnelWidthBu: 2.0, shaftWidthBu: 2.5,
    // W x H of GDD 03 §8.2's M size (S / M / L and the long axis are in src/sim/balance/nestTemplates.ts); depth bands
    // from GDD 03 §8.2: royal 12-40, nursery 4-30, food 8-30, rest 10-60. Royal from the founding cell at 8 workers.
    chambers: [
      { type: 'royal', widthBu: 6, heightBu: 2.5, depthBu: [12, 40], perUnit: 1, unitOf: 'fixed', minWorkers: 8 },
      { type: 'nursery', widthBu: 8, heightBu: 2.5, depthBu: [4, 30], perUnit: 1 / 60, unitOf: 'brood', minWorkers: 8 },
      { type: 'food', widthBu: 8, heightBu: 2.5, depthBu: [8, 30], perUnit: 1 / 300, unitOf: 'workers', minWorkers: 25 },
      { type: 'rest', widthBu: 8, heightBu: 2.5, depthBu: [10, 60], perUnit: 1 / 150, unitOf: 'workers', minWorkers: 40 },
    ],
    // Open-entrance cap = min(max, start + floor(N / perWorkers)): GDD 03 `maxEntrances` 3, 4 from 800 workers.
    entrances: { start: 3, perWorkers: 800, max: 4 }, maxDepthBu: 175, footprintRBu: 80, volumeCapBu3: 12000,
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
  directiveTasks: ['forage', 'tend', 'nurse', 'dig', 'guard'], directiveExtras: [], taskSubtypes: ['tend:relay', 'tend:relocate-aphid'],
  appearance: {
    bodyColour: '#1e1814', gasterColour: '#1a1512', hairiness: 0.2, waistNodes: 1, rearWeapon: 'acidopore',
    spines: 0, headWidthRatio: { worker: 0.22, queen: 0.2 }, queenThoraxScale: 1.4, alateWingTint: '#d8d4cc',
  },
  modules: {
    // tendBonus predates this file. The rest are GDD 07 §6.1.2 module constants (herd entities: GDD 05 §1.4).
    'honeydew-ranching': {
      tendBonus: 0.3, relayRadiusBu: 3, relayReceiverMaxCrop: 0.5, waitPatrolRadiusBu: 3, waitTimeoutS: 300,
      relocateRadiusBu: 100, relocatorsMax: 2, newHerdMin: 3, herdForageMarkerMult: 2.0, relocateAtFracOfK: 0.9,
      relocateHostQuality: 0.3, shelterPellets: 20, rootHerdYield: 0.5,
    },
  },
};
