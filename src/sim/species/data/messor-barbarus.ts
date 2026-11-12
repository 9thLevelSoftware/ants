// Messor barbarus, harvester ant (GDD 07 §5.3; dossier docs/research/bio-messor.md).
// Units per field: src/sim/types/species.ts. [EST] marks a design estimate (no source), [D] a dossier value.
// Day numbers are on the default 28-day year, 0-based `d28` (00-index C1): GDD 07's 1-based `D` minus 1.

import type { CasteDef, SpeciesDef } from '@/sim/types';
import {
  actions, GYNE_BASE_ACTIONS, MALE_ACTIONS, NO_UNLOCK, QUEEN_BASE_ACTIONS, queenLifespan, WORKER_BASE_ACTIONS,
} from './common';

// Myrmicine: no `spray-acid`; `sting`, `gnaw-radicle`, `stridulate`. A harvester does not tend aphids (honeydew
// preference 0), so no aphid actions. `mill-seed` for media applies to lengthBu >= 1.2 only, at half speed (the
// granary module checks the size). Trophallaxis is limited by the small crops, larvae get solid paste (§5.3.1).
const MINOR_ACTIONS = actions(WORKER_BASE_ACTIONS, ['sting', 'gnaw-radicle', 'stridulate']);
const MEDIA_ACTIONS = actions(WORKER_BASE_ACTIONS, ['sting', 'gnaw-radicle', 'stridulate', 'mill-seed', 'cut-seed-head']);
const MAJOR_ACTIONS = actions(WORKER_BASE_ACTIONS, ['sting', 'stridulate', 'mill-seed', 'cut-seed-head', 'block-opening']);

/** Tasks a harvester never does: fungus, leaf cutting, aphid tending. */
const NOT_MY_TASKS = { garden: 0, cut: 0, tend: 0 } as const;

const CASTES: CasteDef[] = [
  {
    // Nanitic first brood: 0.5 / 0.6 / 0.7 BU, 1.3 mg, lifespan 6 sd 2 GD ("a few months" [D]): see NANITIC_MINOR.
    caste: 'minor', sizeClasses: [{ id: 'nanitic', minBu: 0.5, maxBu: 0.7 }],
    lengthBu: { min: 0.55, mean: 0.7, max: 0.85 }, casteMassMg: 2.0, cropMax: null, carryOverride: null,
    mandibleFactor: 1.0, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    // Lifespans are shortened design values (GDD 07 §5.3.1 deviation): foraging is the lethal task [D].
    lifespanGd: { mean: 12, sd: 3 }, lifespanBySize: [], ageRateOutside: 3.5, ageRateDormant: 0.3,
    fixedStats: null, upkeepOverride: null, devMult: 0.95, actions: MINOR_ACTIONS,
    taskWeights: { ...NOT_MY_TASKS, mill: 0 }, unlock: NO_UNLOCK,
  },
  {
    caste: 'media', sizeClasses: [], lengthBu: { min: 0.85, mean: 1.05, max: 1.3 }, casteMassMg: 7, cropMax: null,
    carryOverride: null, mandibleFactor: 1.0, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 16, sd: 4 }, lifespanBySize: [], ageRateOutside: 3.5, ageRateDormant: 0.3,
    fixedStats: null, upkeepOverride: null, devMult: 1.0, actions: MEDIA_ACTIONS,
    taskWeights: { ...NOT_MY_TASKS, mill: 0.3 }, unlock: NO_UNLOCK,
  },
  {
    // Macrocephalic majors unlock at N >= 40 [D 30-50]. Crop 2.0 and carry 2.5 are table values (m = 3.14 would give
    // 3.14 and 1.98).
    caste: 'major', sizeClasses: [], lengthBu: { min: 1.3, mean: 1.55, max: 1.85 }, casteMassMg: 22, cropMax: 2.0,
    carryOverride: 2.5, mandibleFactor: 1.5, macrocephalic: true, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 20, sd: 5 }, lifespanBySize: [], ageRateOutside: 3.5, ageRateDormant: 0.3,
    fixedStats: null, upkeepOverride: null, devMult: 1.2, actions: MAJOR_ACTIONS,
    taskWeights: { ...NOT_MY_TASKS, nurse: 0.3, 'queen-care': 0.3 }, // [EST]: majors mill, cut seed heads and guard
    unlock: { minWorkers: 40, minColonyAgeYears: 0 },
  },
  {
    // GDD 05 §4.1 / GDD 07 table: queen 107 HP, bite 10.7 (not the mass formula). 6-12 game years is a shortened
    // design value (§5.3.1 deviation).
    caste: 'queen', sizeClasses: [], lengthBu: { min: 2.0, mean: 2.3, max: 2.6 }, casteMassMg: 80, cropMax: 3.0,
    carryOverride: 0, mandibleFactor: 0.27, macrocephalic: false, cruiseMult: 0.5, sprintBuS: 4,
    lifespanGd: queenLifespan({ min: 6, max: 12 }), lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.3,
    fixedStats: { maxHp: 107, bite: 10.7, foundingMaxHp: null }, upkeepOverride: { restC: 0.3, activeC: 0.3, p: 0.1 },
    devMult: 1, actions: actions(QUEEN_BASE_ACTIONS, ['sting']), taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'gyne', sizeClasses: [], lengthBu: { min: 2.0, mean: 2.3, max: 2.6 }, casteMassMg: 80, cropMax: 3.0,
    carryOverride: 0, mandibleFactor: 0.27, macrocephalic: false, cruiseMult: 1, sprintBuS: 9,
    lifespanGd: { mean: 40, sd: 8 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.3, // until flight or expiry
    fixedStats: { maxHp: 107, bite: 10.7, foundingMaxHp: null }, upkeepOverride: { restC: 0.15, activeC: 0.15, p: 0 },
    devMult: 1.4, actions: actions(GYNE_BASE_ACTIONS, ['sting']), taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'male', sizeClasses: [], lengthBu: { min: 1.2, mean: 1.3, max: 1.45 }, casteMassMg: 10, cropMax: 0.5,
    carryOverride: 0, mandibleFactor: 0.2, macrocephalic: false, cruiseMult: 1, sprintBuS: 9,
    lifespanGd: { mean: 30, sd: 5 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.3,
    fixedStats: { maxHp: 19, bite: 0.95, foundingMaxHp: null }, upkeepOverride: { restC: 0.08, activeC: 0.08, p: 0 },
    devMult: 1.1, actions: [...MALE_ACTIONS], taskWeights: {}, unlock: NO_UNLOCK,
  },
];

/**
 * Nanitic minor (first brood, GDD 07 §5.3.1): not a caste in the schema, so its table row lives here for the
 * founding/brood modules. Mass 1.3 mg at the mean length (0.6 BU), lifespan 6 sd 2 GD, devMult 0.9, larval cost
 * 0.32 P + 0.11 C, upkeep 0.023 / 0.058 (m 0.19).
 */
export const MESSOR_NANITIC_MINOR = {
  lengthBu: { min: 0.5, mean: 0.6, max: 0.7 }, casteMassMg: 1.3, lifespanGd: { mean: 6, sd: 2 }, devMult: 0.9,
} as const;

export const MESSOR_BARBARUS: SpeciesDef = {
  // `available` is false in the T1 build (GDD 07 Appendix E1): the granary module is not implemented yet, so the
  // New Game screen must not offer this species. The task that ships the module flips it to true.
  id: 'messor-barbarus', binomial: 'Messor barbarus', commonName: 'Harvester ant', subfamily: 'myrmicinae',
  buMm: 7, stdMassMg: 7, available: false, tier: 'T3', complexity: 2,
  playstyleLine: 'A seed harvester of dry soil: granaries, milling majors and trunk trails that avoid the midday heat.',
  foundingSeason: 'autumn', economyModules: ['granary'],
  codexIds: ['cx-claustral-founding', 'cx-seed-classes', 'cx-trunk-trail', 'cx-granary-chaff', 'cx-hybridogenesis'],
  // Unloaded speed is independent of body size [D]; loaded speed falls with load ratio (granary block).
  cruiseBuS: 5, loadSpeedMult: 0.75,
  castes: CASTES,
  life: {
    // Stage durations and devRate are [EST] (no measured durations [D]).
    stageGd: { egg: 1.1, larva: 2.3, pupa: 1.2 }, devRefC: 26,
    devRate: [[14, 0], [18, 0.4], [22, 0.7], [26, 1.0], [29, 1.05], [32, 0.5], [36, 0]],
    larvaFood: 'seed-paste+solid', animalProteinMinFrac: 0.1, // protein is 2-3 % of loads but critical [D]
    // q(N) = 20 + 150 (1 - e^(-N/400)) [EST].
    qMax: 170, sizeBase: 0.118, sizeK: 400,
    // GDD 07 (1-based D, factor): (1, .5) (2, 1) (8, 1) (9, .5) summer lull, (14, .5) (15, .8) (20, .8) (22, 0)
    // (27.5, 0) (29, .5); here d28 = D - 1. Spring boom, summer lull, autumn activity [D].
    fSeason: [[0, 0.5], [1, 1.0], [7, 1.0], [8, 0.5], [13, 0.5], [14, 0.8], [19, 0.8], [21, 0], [26.5, 0], [28, 0.5]],
    layWindows: null, fTempQ: [[14, 0], [22, 1], [32, 1], [37, 0]],
    queenUpkeep: { c: 0.3, p: 0.1 }, queenLifespanYears: { min: 6, max: 12 },
    // N < 40: minors and media 60 / 40; majors unlock at N >= 40 [D 30-50] and ramp linearly to 35 / 45 / 20 at N 300.
    casteMixTarget: [[0, 0.6, 0.4, 0], [40, 0.6, 0.4, 0], [300, 0.35, 0.45, 0.2]],
    broodHazard: {}, // the animal-protein penalty (growth x 0.5) is the granary module's (animalProteinMinFrac)
  },
  opening: {
    mode: 'claustral',
    siteMaterials: { sand: 1.0, loam: 1.0, gravel: 0.7, clay: 0.3, humus: 0.4 },
    siteHard: ['no-hard-surface', 'soil-moisture-below-0.7'],
    siteBonuses: ['open-sunny', 'recent-rain', 'rival-nest-300bu-penalty'],
    // GDD 03 §13.1: D_MIN 20 open / 15 covered, V_MIN 15 BU^3, W_MIN 4.0 BU, shaft 25 BU deep.
    dMinOpenBu: 20, dMinCoverBu: 15, vMinBu3: 15, wMinBu: 4.0, shaftTargetBu: 25, seal: true,
    R0: 40, clutchCap: 20, trophicFraction: 0, firstBroodClass: { caste: 'minor', nanitic: true },
    expectedFirstWorkers: { min: 5, max: 8 }, special: ['lineage'],
    startDoy: { min: 15, max: 19, default: 17 }, startHours: [14, 16],
  },
  scale: {
    // Typical 8,000-12,000 workers, up to about 21,000 (Cerdan 1989 via Hensen 2002) [D].
    simCapWorkers: 1500, wildColonySize: { typical: [8000, 12000], max: 21000 },
    growThreshold: 50, matureThreshold: 700,
    growthTargets: [[1, 15, 40], [2, 150, 300], [3, 500, 900], [4, 900, 1500]],
  },
  reproduction: {
    // Single annual flight 0.15-0.6 GD after a rain of >= 7 h (flight* keys of the granary block); launch 13:00-17:00
    // [D afternoon, weak]; regionally synchronised.
    matureAgeYears: 3, alateLayWindow: [8, 13], reproMaxFrac: 0.02, reproGyneShare: 0.5,
    sexualCostMult: { gyne: 10, male: 2 }, alateFlightWindow: [15, 20], flightPeak: [17, 19], launchHours: [13, 17],
    flightGate: { minAirC: 15, maxWindMs: 3, noRain: true }, synchrony: 'regional', alatesOverwinter: false,
    pAir: 0.55, pMate: 0.866, pFound: 0.7, gyneUpkeepC: 0.15, maleUpkeepC: 0.08,
  },
  diet: {
    foods: {
      seed: { pref: 1.0, route: 'granary', tier: 'T3' },
      crumb: { pref: 0.6, route: 'granary', tier: 'T3' }, // as soft seed: hardness 0.1, rots x 2 faster
      'pet-food': { pref: 0.3, route: 'granary', tier: 'T3' }, // dry kibble, hardness 0.3
      carrion: { pref: 0.7, route: 'solid-p', tier: 'T1' }, // the protein bottleneck
      prey: { pref: 0.4, route: 'solid-p', tier: 'T2' }, // dead or helpless arthropods only; live prey <= 0.5 mg
      sugar: { pref: 0.2, route: 'crop-c', tier: 'T1' }, fruit: { pref: 0.1, route: 'crop-c', tier: 'T2' },
      nectar: { pref: 0.15, route: 'crop-c', tier: 'T1' },
      bait: { pref: 0.5, route: 'granary', tier: 'T2' }, // granary or crop by bait type (GDD 04)
      dew: { pref: 0.4, route: 'water', tier: 'T2' },
      // honeydew: 0 (does not tend aphids)
    },
    // pTargetFrac is replaced by animalProteinMinFrac (§5.3.5); the number kept here is that minimum, for readers
    // that only know the generic field.
    pTargetFrac: 0.1, pTargetFracNoLarvae: 0.05, sapPerCut: 0,
  },
  nestTemplate: {
    // humus is damp: granary humidity penalty (§5.3.6).
    nestMaterials: { sand: 1.4, loam: 1.0, gravel: 0.6, clay: 0.5, humus: 1.0 },
    coverBonus: ['stone', 'concrete', 'brick', 'tile'], // cover weight only 0.5 (GDD 03 §8.2)
    // GDD 07 §5.3.6: tunnels 2.5 BU (majors need >= 2.2), vertical shafts 3.0 BU.
    tunnelWidthBu: 2.5, shaftWidthBu: 3.0,
    // W x H of GDD 03 §8.2 (L in src/sim/balance/nestTemplates.ts). Depth bands follow GDD 03 (nursery 15-80, royal
    // 40-150; GDD 07 writes 20-80 and 80-150). Granary count comes from the granary block (target stock).
    chambers: [
      { type: 'royal', widthBu: 8, heightBu: 3, depthBu: [40, 150], perUnit: 1, unitOf: 'fixed', minWorkers: 10 },
      { type: 'nursery', widthBu: 10, heightBu: 3, depthBu: [15, 80], perUnit: 1 / 60, unitOf: 'brood', minWorkers: 10 },
      { type: 'granary', widthBu: 16, heightBu: 6, depthBu: [60, 200], perUnit: 1, unitOf: 'fixed', minWorkers: 30 },
      { type: 'rest', widthBu: 10, heightBu: 3, depthBu: [20, 150], perUnit: 1 / 200, unitOf: 'workers', minWorkers: 40 },
    ],
    // 1 at founding, +1 per 300 workers (GDD 07 says max 5, GDD 03 §8.2 says 6: GDD 03 owns the cap).
    entrances: { start: 1, perWorkers: 300, max: 6 },
    maxDepthBu: 285, footprintRBu: 150, volumeCapBu3: 14000, maxPathToEntranceBu: 200,
    mound: 'crater', midden: 'entrance-midden',
    // 24-28 °C, RH 0.5-0.8; tMin / tMax: where devRate falls to 0.4 / 0.5 [EST].
    broodClimate: [
      { stage: 'egg', tMin: 18, tOpt: [24, 28], tMax: 32, rh: [0.5, 0.8] },
      { stage: 'larva', tMin: 18, tOpt: [24, 28], tMax: 32, rh: [0.5, 0.8] },
      { stage: 'pupa', tMin: 18, tOpt: [24, 28], tMax: 32, rh: [0.5, 0.8] },
    ],
  },
  thermal: {
    thermalShiftC: 6, forageGate: { a: 8, b: 20, c: 35, d: 42 }, stressC: 40, shadeSeekC: 38, chillC: 6, freezeC: -1,
    lightPref: { night: 0.6, dawn: 1.0, morning: 0.9, midday: 0.7, afternoon: 0.9, dusk: 1.0 },
    lightPrefSeason: { summer: { night: 1.0 } },
  },
  signals: {
    // Short recruitment trail [EST]; permanent trunk trails that clear a 6 BU ribbon of grass and litter [D].
    trailHalfLifeS: 120, trailRefC: 22,
    trunkTrail: { enabled: true, unusedHalfLifeGd: 3, ghostAfterGd: 10, ghostFadeGd: 7, clearing: true },
    homeHalfLifeGd: 2, ignorerFrac: 0.15, recruitUnlockWorkers: 30, recruitGroup: { min: 5, max: 30 },
    // Morning: 5-10 patrollers leave first (8 here); foragers activate after >= 3 return safely within 60 s.
    patrolGate: { patrollers: 8, returnsNeeded: 3, windowS: 60 },
    // Poison-gland alarm pheromone 10 BU; stridulation through the substrate 6 BU (granary block).
    alarmMode: 'stridulation', alarmRadiusBu: 10,
  },
  combat: {
    // sting: 6 damage every 2 s while gripping (media: 2.0 x m^(2/3) x venom 0.8). Aggression to conspecific
    // neighbours 0.7.
    weapons: ['bite', 'bite-hold', 'sting'], acid: null, sting: { damage: 6, intervalS: 2 }, aggression: 0.7,
    guardCastes: ['major'],
  },
  climate: 'mediterranean',
  winter: {
    // wintMetBase 0.3: consumption drawn from the granary at 0.3 x summer (§5.3.7).
    mode: 'rest-lapse', tColdStress: 4.0, wintBaseLoss: 0.05, wintMetBase: 0.3, wintQ10: 2.2,
    broodCarried: 'larva', heatedNestRule: true,
  },
  directiveTasks: ['forage', 'nurse', 'dig', 'guard', 'mill', 'store'],
  directiveExtras: ['casteEmphasis', 'granaryHygiene'],
  taskSubtypes: ['store:granary-care'],
  appearance: {
    // Black / dark brown (dossier); two nodes; sting. Colours as the render presets. Head ratios: dossier [E] 0.22
    // minors, 0.30-0.35 majors.
    bodyColour: '#1e1512', gasterColour: '#171110', hairiness: 0.2, waistNodes: 2, rearWeapon: 'sting', spines: 0,
    headWidthRatio: { minor: 0.21, media: 0.27, major: 0.33, queen: 0.21, gyne: 0.21, male: 0.16 },
    queenThoraxScale: 1.5, alateWingTint: '#d6d2c8',
  },
  modules: {
    // GDD 07 §6.3 (seeds, collection, granary state, cohorts, milling, animal protein, middens) and §5.3.7.
    granary: {
      // seed classes: loads after milling, carrying limits (6.3.1)
      seedLoadsDust: 0.05, seedLoadsS: 0.2, seedLoadsM: 1.0, seedLoadsL: 2.5,
      seedMassSMinMg: 0.4, seedMassMMinMg: 4, seedMassLMinMg: 20, seedMassLMaxMg: 100, seedBuriedDepthCm: 1.5,
      // collection (6.3.2)
      acceptDistBu: 600, crackLimitMinor: 0.3, crackLimitMedia: 0.6, crackLimitMajor: 1.0, hardnessPenalty: 0.5,
      cutSeedHeadS: 20, cutSeedHeadSeedsMin: 1, cutSeedHeadSeedsMax: 3,
      // granary and cohorts (6.3.3-6.3.5)
      loadsPerBu3: 2.0, loadsPerLargeGranary: 1600, targetStockGd: 36, targetStockFill: 0.85, granaryMinWorkers: 30,
      seedURate: 0.5, seedUArriving: 0.3, seedUWet: 0.8, uDamp: 0.55, uRot: 0.75, rotWetGd: 1, rotRatePerGd: 0.1,
      germDenominator: 0.25, germTempMinC: 8, germTempRefC: 20, germTempHotC: 30, germFactorHot: 1.2,
      germinatingG: 0.5, sproutedG: 1, sproutedExpireGd: 1.5, gnawRadicleS: 5, careWindowS: 150,
      relocateHumidity: 0.6, sproutedMillTimeMult: 0.3, sproutedPasteYield: 0.9,
      // milling (6.3.6)
      millBaseS: 12, millHardnessMult: 4, millMediaTimeMult: 2, millMediaMinBu: 1.2, millMediaMaxHardness: 0.6,
      pasteYield: 0.8, chaffYield: 0.2, pasteC: 0.65, pasteP: 0.35, pasteHalfLifeGd: 3, pasteTargetGd: 2,
      feedLarvaLoads: 0.1,
      // animal protein (6.3.7)
      animalProteinGrowthMult: 0.5,
      // middens and seedlings (6.3.8)
      middenMinBu: 8, middenMaxBu: 20, viableSeedFrac: 0.02, seedlingGerminateP: 0.05, seedlingMaturesGd: 7,
      middenHaulHeightBu: 2, middenHaulRadiusBu: 6,
      // heat and activity (5.3.7)
      tripHeatLimitC: 42, tripHeatSpanC: 10, tripHeatFloor: 0.2, lullReturnFrac: 0.2, lullActivationMult: 0.3,
      patrolHoldMult: 0.2, patrolHoldS: 3600, stridulationRadiusBu: 6,
      winterConsumptionMult: 0.3, winterPasteConversion: 0.8,
      // flight conditions (GDD 06 §11.5) and lineage (5.3.3)
      flightMinRainH: 7, flightRainWindowGd: 1.5, flightAfterRainMinGd: 0.15, flightAfterRainMaxGd: 0.6,
      alateStockGateGd: 30, lineageFreqA: 0.5, lineageFreqB: 0.5, matesMean: 2.4,
    },
  },
};
