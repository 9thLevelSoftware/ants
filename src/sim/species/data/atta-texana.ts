// Atta texana, Texas leafcutter ant (GDD 07 §5.4; dossier docs/research/bio-atta.md).
// Units per field: src/sim/types/species.ts. [EST] marks a design estimate (no source), [D] a dossier value.
// Day numbers are on the default 28-day year, 0-based `d28` (00-index C1): GDD 07's 1-based `D` minus 1.
// Atta eats only its fungus: "load" food units are FL (fungus loads, brood value of 1 load of mixed C+P).

import type { ActionId, CasteDef, Curve, SpeciesDef } from '@/sim/types';
import { actions, GYNE_BASE_ACTIONS, MALE_ACTIONS, NO_UNLOCK, QUEEN_BASE_ACTIONS, queenLifespan } from './common';

// Myrmicine without `sting` or `spray-acid` (not used in defence [D]); larvae are never fed by trophallaxis [D].
const ATTA_COMMON: ActionId[] = [
  'move', 'let-go', 'grip', 'pick-up', 'put-down', 'drop', 'groom', 'antennate', 'sniff', 'bite', 'bite-hold',
  'release-alarm', 'dodge', 'trophallaxis-give', 'trophallaxis-receive', 'seal-entrance', 'unseal-entrance',
];
const MINIM_ACTIONS: ActionId[] = [
  'move', 'let-go', 'grip', 'pick-up', 'put-down', 'drop', 'feed-larva', 'tend-fungus', 'groom', 'antennate',
  'hitchhike', 'bite', 'release-alarm', 'stridulate', 'dodge',
];
// Media covers the small-media size class too (it also tends the fungus and processes leaves).
// Small media feed the larvae (GDD 07 §5.4.2); `feed-larva` here means carrying staphylae from the garden, so the
// action system adds the "only with fungus" precondition (GDD 01 §7), not the caste list.
const MEDIA_ACTIONS = actions(ATTA_COMMON, [
  'dig-bite', 'feed-larva', 'process-leaf', 'tend-fungus', 'cut-leaf', 'lay-trail', 'harvest-liquid', 'drag', 'stridulate',
]);
const MAJOR_ACTIONS = actions(ATTA_COMMON, ['dig-bite', 'block-opening', 'drag', 'cut-leaf', 'stridulate']);
// The founding queen plants the pellet, tends the garden and rears the claustral first brood (GDD 01 §7 gives
// `feed-larva` to the founding queen, from her reserves; for Atta the precondition is a garden that yields staphylae).
const QUEEN_ACTIONS = actions(QUEEN_BASE_ACTIONS, ['plant', 'tend-fungus']);

const CASTES: CasteDef[] = [
  {
    caste: 'minor', sizeClasses: [], // the minim: first brood, gardener, nurse, hitchhiker
    lengthBu: { min: 0.3, mean: 0.35, max: 0.45 }, casteMassMg: 0.3, cropMax: null, carryOverride: null,
    mandibleFactor: 0.8, macrocephalic: false, cruiseMult: 0.8, sprintBuS: 8, // minims walk x 0.8
    lifespanGd: { mean: 40, sd: 12 }, lifespanBySize: [], ageRateOutside: 3.0,
    ageRateDormant: 1, // not dormant in winter (winter mode `active`): dormancy never applies
    fixedStats: null, upkeepOverride: null, devMult: 0.83, actions: MINIM_ACTIONS,
    taskWeights: { forage: 0, scout: 0, cut: 0, mill: 0, tend: 0, dig: 0 }, // minims stay in the nest; no `dig-bite` (GDD 01 §7)
    unlock: NO_UNLOCK,
  },
  {
    // `media` covers the size class small-media (< 0.8 BU, 1.7 mg at 0.7 BU: the cube rule reproduces the table row).
    caste: 'media', sizeClasses: [{ id: 'small-media', minBu: 0.6, maxBu: 0.8 }],
    lengthBu: { min: 0.6, mean: 1.0, max: 1.3 }, casteMassMg: 5, cropMax: null, carryOverride: null,
    mandibleFactor: 1.0, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 40, sd: 12 }, lifespanBySize: [], ageRateOutside: 3.0, ageRateDormant: 1,
    fixedStats: null, upkeepOverride: null, devMult: 1.0, actions: MEDIA_ACTIONS,
    taskWeights: { mill: 0, tend: 0, garden: 0.5 }, // [EST]: only small media garden; media cut
    unlock: NO_UNLOCK,
  },
  {
    // Majors unlock at N >= 400 [D first majors at ~11 months in an analog]. Crop 2.5 is the table value (m = 6).
    caste: 'major', sizeClasses: [], lengthBu: { min: 1.6, mean: 1.8, max: 1.9 }, casteMassMg: 30, cropMax: 2.5,
    carryOverride: null, mandibleFactor: 2.0, macrocephalic: true, cruiseMult: 0.9, sprintBuS: 9,
    lifespanGd: { mean: 50, sd: 15 }, lifespanBySize: [], ageRateOutside: 3.0, ageRateDormant: 1,
    fixedStats: null, upkeepOverride: null, devMult: 1.19, actions: MAJOR_ACTIONS,
    // Majors cut 10 % of the time (§6.4.6), never garden, nurse or tend.
    taskWeights: { garden: 0, mill: 0, tend: 0, nurse: 0, 'queen-care': 0, cut: 0.1 },
    unlock: { minWorkers: 400, minColonyAgeYears: 0 },
  },
  {
    // GDD 05 §4.1 / GDD 07 table: queen 208 HP, bite 20.8. Upkeep 0.5 FL per GD at the 3:1 C:P of directions J.
    caste: 'queen', sizeClasses: [], lengthBu: { min: 2.4, mean: 2.6, max: 2.7 }, casteMassMg: 300, cropMax: 3.0,
    carryOverride: 0, mandibleFactor: 0.27, macrocephalic: false, cruiseMult: 0.4, sprintBuS: 4,
    lifespanGd: queenLifespan({ min: 10, max: 15 }), lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 1,
    fixedStats: { maxHp: 208, bite: 20.8, foundingMaxHp: null }, upkeepOverride: { restC: 0.375, activeC: 0.375, p: 0.125 },
    devMult: 1, actions: QUEEN_ACTIONS, taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'gyne', sizeClasses: [], lengthBu: { min: 2.4, mean: 2.6, max: 2.7 }, casteMassMg: 300, cropMax: 3.0,
    carryOverride: 0, mandibleFactor: 0.27, macrocephalic: false, cruiseMult: 1, sprintBuS: 9,
    lifespanGd: { mean: 60, sd: 10 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 1, // until flight or expiry
    fixedStats: { maxHp: 208, bite: 20.8, foundingMaxHp: null }, upkeepOverride: { restC: 0.2, activeC: 0.2, p: 0 },
    devMult: 1.4, actions: [...GYNE_BASE_ACTIONS], taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'male', sizeClasses: [], lengthBu: { min: 1.7, mean: 1.9, max: 2.1 }, casteMassMg: 60, cropMax: 0.5,
    carryOverride: 0, mandibleFactor: 0.2, macrocephalic: false, cruiseMult: 1, sprintBuS: 9,
    lifespanGd: { mean: 40, sd: 5 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 1,
    fixedStats: { maxHp: 46, bite: 2.3, foundingMaxHp: null }, upkeepOverride: { restC: 0.15, activeC: 0.15, p: 0 },
    devMult: 1.25, actions: [...MALE_ACTIONS], taskWeights: {}, unlock: NO_UNLOCK,
  },
];

/**
 * Share of the `media` caste that is `small-media` (< 0.8 BU), by colony size N: GDD 07 §5.4.2's mix gives small
 * media 50 / 0 % of 50 / 0 % media below N 100, 30 of 65 at N 100-400 and 25 of 62 at N 1,000. The schema's
 * `casteMixTarget` has one column for `media`; the brood module splits it with this curve.
 */
export const ATTA_SMALL_MEDIA_SHARE: Curve = [[0, 1], [100, 1], [100.01, 0.4615], [400, 0.4615], [1000, 0.4032]];

export const ATTA_TEXANA: SpeciesDef = {
  // `available` is false in the T1 build (GDD 07 Appendix E1): the fungus-garden module is not implemented yet, so the
  // New Game screen must not offer this species. The task that ships the module flips it to true.
  id: 'atta-texana', binomial: 'Atta texana', commonName: 'Texas leafcutter ant', subfamily: 'myrmicinae',
  buMm: 7, stdMassMg: 5, available: false, tier: 'T3', complexity: 3,
  playstyleLine: 'A leaf-cutting farmer: a living fungus garden feeds everyone, and the whole chain must keep up.',
  foundingSeason: 'spring', economyModules: ['fungus-garden'],
  codexIds: [
    'cx-claustral-founding', 'cx-fungus-garden', 'cx-fungus-pellet', 'cx-leaf-cutting', 'cx-hitchhikers',
    'cx-garden-waste', 'cx-night-foraging',
  ],
  cruiseBuS: 6, loadSpeedMult: 0.65, // laden 20-32 mm/s [D analog]
  castes: CASTES,
  life: {
    // Media at 25 °C: 20 / 40 / 40 split of egg-to-adult 40-60 d [EST]; devRate [EST].
    stageGd: { egg: 0.85, larva: 1.65, pupa: 1.7 }, devRefC: 25,
    devRate: [[15, 0], [20, 0.5], [25, 1.0], [28, 1.4], [30, 1.2], [32, 0]],
    larvaFood: 'staphylae', animalProteinMinFrac: 0,
    // q(N) = 10 + 110 (1 - e^(-N/500)) [EST]; laying is paid in FL from the queen's fungus ration.
    qMax: 120, sizeBase: 0.083, sizeK: 500,
    // Spring 1.0, summer 0.8, autumn 0.9, winter 0.5 with 1 GD ramps centred on the season boundaries; the value at
    // the year wrap (d28 0 / 28) is the mid-ramp 0.75 [EST]. Fungus is not dormant in winter [D].
    fSeason: [[0, 0.75], [0.5, 1.0], [6.5, 1.0], [7.5, 0.8], [13.5, 0.8], [14.5, 0.9], [20.5, 0.9], [21.5, 0.5], [27.5, 0.5], [28, 0.75]],
    layWindows: null, fTempQ: [[18, 0], [22, 1], [30, 1], [33, 0]],
    queenUpkeep: { c: 0.375, p: 0.125 }, queenLifespanYears: { min: 10, max: 15 },
    // Minim / media (small media + media) / major: N < 100 50 / 50 / 0; N 100-400 35 / 65 / 0; majors unlock at
    // N >= 400; maturity (N >= 1,000) 30 / 62 / 8 (small media 25 + media 37). See ATTA_SMALL_MEDIA_SHARE.
    casteMixTarget: [[0, 0.5, 0.5, 0], [100, 0.5, 0.5, 0], [100.01, 0.35, 0.65, 0], [400, 0.35, 0.65, 0], [1000, 0.3, 0.62, 0.08]],
    broodHazard: {},
  },
  opening: {
    mode: 'claustral-fungus',
    siteMaterials: { sand: 1.0, loam: 1.0, humus: 0.5, clay: 0.2 },
    siteHard: ['no-hard-surface', 'soil-moisture-below-0.8'], siteBonuses: ['recent-rain', 'chamber-humidity'],
    // GDD 03 §13.1: D_MIN 30 open / 25 covered, V_MIN 25 BU^3, W_MIN 4.5 BU, shaft 35 BU deep (Ch 06: 25-35).
    dMinOpenBu: 30, dMinCoverBu: 25, vMinBu3: 25, wMinBu: 4.5, shaftTargetBu: 35, seal: true,
    // 40 viable-equivalent eggs, of which ATTA_TROPHIC_FRACTION_FIRST (0.7) are eaten by the queen or fed to the
    // garden (design reduction of the sourced ~90 %, GDD 06 deviation D4); 8-14 minims.
    R0: 48, clutchCap: 40, trophicFraction: 0.7, firstBroodClass: { caste: 'minor', nanitic: false },
    expectedFirstWorkers: { min: 8, max: 14 }, special: ['pellet'],
    startDoy: { min: 2, max: 8, default: 5 }, startHours: [21, 23],
  },
  scale: {
    simCapWorkers: 1500, wildColonySize: { typical: [100000, 1000000], max: 2000000 },
    growThreshold: 150, matureThreshold: 1000, growthTargets: [[1, 100, 300], [2, 400, 800], [3, 1000, 1500]],
  },
  reproduction: {
    // Alate brood is reared in the `central` fungus chamber through winter [D]; flight after >= 6.35 mm of rain on a
    // clear moonless night, launch 21:00-03:00 (h1 < h0 wraps midnight), regionally synchronised [D]. The flight peak
    // is not given: the middle of the window [EST].
    matureAgeYears: 3, alateLayWindow: [15, 28], reproMaxFrac: 0.04, reproGyneShare: 0.25,
    sexualCostMult: { gyne: 15, male: 3 }, alateFlightWindow: [2, 8], flightPeak: [4, 6], launchHours: [21, 3],
    flightGate: { minAirC: 15, maxWindMs: 3, noRain: true }, synchrony: 'regional', alatesOverwinter: false,
    pAir: 0.5, pMate: 0.9, pFound: 0.7, gyneUpkeepC: 0.2, maleUpkeepC: 0.15,
  },
  diet: {
    foods: {
      leaf: { pref: 1.0, route: 'substrate', tier: 'T3' }, // from plants rated acceptable (§6.4.5)
      fruit: { pref: 0.4, route: 'substrate', tier: 'T2' }, // substrate quality 0.8 plus juice to the crop
      crumb: { pref: 0.2, route: 'substrate', tier: 'T3' }, // cereal: quality 0.7, protein 0.10
      seed: { pref: 0.1, route: 'substrate', tier: 'T3' }, // quality 0.5
      bait: { pref: 0.8, route: 'substrate', tier: 'T2' }, // toxic, delayed; citrus-pulp baits are attractive
      nectar: { pref: 0.3, route: 'crop-c', tier: 'T1' }, sugar: { pref: 0.2, route: 'crop-c', tier: 'T1' },
      dew: { pref: 0.3, route: 'water', tier: 'T2' },
      // prey, carrion, pet-food, honeydew: 0 (protein-rich substrate harms the fungus)
    },
    // Brood and queen eat only fungus: no protein regulation. Sap: each completed cut-leaf drinks 0.3 C [D].
    pTargetFrac: 0, pTargetFracNoLarvae: 0, sapPerCut: 0.3,
  },
  nestTemplate: {
    nestMaterials: { sand: 1.3, loam: 1.0, humus: 0.9, clay: 0.4 },
    coverBonus: [],
    tunnelWidthBu: 2.5, shaftWidthBu: 3.0, // queen 2.6 BU long needs >= 1.2 BU passage
    // W x H of GDD 03 §8.2: fungus M 18 x 9 (founding 10 BU, early 12-18, mature 25-35 wide x 10-14 high; max 24),
    // midden 10 x 4 (1 per 3 fungus chambers = 1 per 180 workers at 1 fungus chamber per 60 [EST]). The brood lives in
    // the garden. Counts for fungus chambers are [EST]: the garden module decides from garden mass.
    chambers: [
      { type: 'royal', widthBu: 9, heightBu: 3, depthBu: [150, 400], perUnit: 1, unitOf: 'fixed', minWorkers: 20 },
      { type: 'fungus', widthBu: 18, heightBu: 9, depthBu: [40, 400], perUnit: 1 / 60, unitOf: 'workers', minWorkers: 10 },
      { type: 'midden', widthBu: 10, heightBu: 4, depthBu: [100, 400], perUnit: 1 / 180, unitOf: 'workers', minWorkers: 30 },
    ],
    entrances: { start: 1, perWorkers: 40, max: 40 }, // min(40, 1 + floor(N / 40)), each with a crater mound
    maxDepthBu: 450, footprintRBu: 150, volumeCapBu3: 30000, maxPathToEntranceBu: 300,
    mound: 'crater', midden: 'detritus-chamber+heap',
    // Brood lives inside the garden: fungus chamber optimum 21-25 °C, RH >= 0.8; fT 0.5 at 18 and 28 °C.
    broodClimate: [
      { stage: 'egg', tMin: 18, tOpt: [21, 25], tMax: 28, rh: [0.8, 1.0] },
      { stage: 'larva', tMin: 18, tOpt: [21, 25], tMax: 28, rh: [0.8, 1.0] },
      { stage: 'pupa', tMin: 18, tOpt: [21, 25], tMax: 28, rh: [0.8, 1.0] },
    ],
  },
  thermal: {
    thermalShiftC: 2, forageGate: { a: 7, b: 20, c: 25, d: 28 }, stressC: 38, shadeSeekC: 36, chillC: 5, freezeC: -1,
    lightPref: { night: 1.0, dawn: 0.7, morning: 0.6, midday: 0.5, afternoon: 0.6, dusk: 1.0 }, lightPrefSeason: {},
  },
  signals: {
    // Very potent trail pheromone [D]; trunk trails with majors clearing a 4 BU ribbon; mass recruitment from 20
    // workers, groups of 10-60. Home range and ignorers are [EST] (not given).
    trailHalfLifeS: 3600, trailRefC: 25,
    trunkTrail: { enabled: true, unusedHalfLifeGd: 5, ghostAfterGd: 10, ghostFadeGd: 10, clearing: true },
    homeHalfLifeGd: 3, ignorerFrac: 0.1, recruitUnlockWorkers: 20, recruitGroup: { min: 10, max: 60 },
    patrolGate: null,
    // Mandibular alarm pheromone 12 BU; stridulation while cutting recruits within 6 BU (fungus-garden block).
    alarmMode: 'pheromone', alarmRadiusBu: 12,
  },
  combat: {
    // Majors 19.3 per strike (about 800 mN bites [D]); minims `hitchhike` against phorids. Aggression [EST].
    weapons: ['bite', 'bite-hold'], acid: null, sting: null, aggression: 0.6, guardCastes: ['major'],
  },
  climate: 'subtropical',
  winter: {
    // `active`: winter is played, no lapse, so the aggregate-model numbers are unused (tColdStress = chillC [EST]).
    mode: 'active', tColdStress: 5, wintBaseLoss: 0.05, wintMetBase: 0.35, wintQ10: 2.2,
    broodCarried: 'larva', heatedNestRule: false,
  },
  directiveTasks: ['forage', 'nurse', 'dig', 'guard', 'cut', 'garden', 'haul'],
  directiveExtras: ['casteEmphasis', 'leafSelectivity', 'hitchhikerEscort', 'externalHeap'],
  taskSubtypes: ['garden:process', 'garden:plant', 'garden:tend-fungus', 'garden:weed', 'haul:garden-waste', 'guard:hitchhike'],
  appearance: {
    // Rusty brown (dossier); two nodes; three pairs of spines; colours and head ratios as the render presets.
    bodyColour: '#60321a', gasterColour: '#4e2915', hairiness: 0.2, waistNodes: 2, rearWeapon: 'sting', spines: 3,
    headWidthRatio: { minor: 0.22, media: 0.27, major: 0.38, queen: 0.22, gyne: 0.22, male: 0.15 },
    queenThoraxScale: 1.6, alateWingTint: '#d2c29a', // males: brown-yellow wings [D]
  },
  modules: {
    // GDD 07 §6.4 (garden state, dynamics, Escovopsis, leaf selection, processing chain, hitchhikers, founding
    // garden, garden-less colony) and §5.4.
    'fungus-garden': {
      // garden state and size (6.4.1)
      guPerBu3: 0.004, visualMlPerGu: 15, gardenChambersMax: 24, gardenGateGu: 300,
      // dynamics (6.4.2)
      subNeedPerGu: 1.8, gardenR: 0.17, gardenRBurst: 0.47, burstFsub: 1.5, burstGFrac: 0.5,
      starveFsub: 0.45, starveRate: 0.15, gardenersPerGu: 1.0, tendFloor: 0.3, yieldPerGu: 0.5,
      staphylaeS: 3, staphylaeFl: 0.1, wasteFrac: 0.5, contamWasteFrac: 0.2, contamRate: 0.05,
      contamClearWasteFrac: 0.1, contamClearRate: 0.1,
      // climate (6.4.2): fT 1 at 21-25 °C, 0.5 at 18 / 28 °C, 0 at <= 15 / >= 30 °C; h -0.15 /GD at >= 30 or <= 12 °C
      fTOptLowC: 21, fTOptHighC: 25, fTHalfLowC: 18, fTHalfHighC: 28, fTZeroLowC: 15, fTZeroHighC: 30,
      heatDamageC: 30, coldDamageC: 12, heatDamageRate: 0.15,
      fRhFull: 0.8, fRhMid: 0.6, fRhMidValue: 0.6, fRhLow: 0.5, fRhLowValue: 0.3, fRhDamageRate: 0.05,
      subProteinMax: 0.2, subProteinRate: 0.3, subToxinRate: 0.15, healthRecover: 0.1, healthRecoverFclim: 0.8,
      relocateFclim: 0.5, relocateWaitGd: 0.5, fungusPieceGu: 0.5, fungusPieceS: 120,
      // gardens in states (6.4.3)
      establishingG: 1, healthyG: 3, healthyH: 0.6, collapseH: 0.2, collapseRecoverH: 0.3, collapseRate: 0.3,
      deadG: 0.1, deadH: 0.05, establishingYieldMult: 0.5, foundingGrowth: 0.28,
      // Escovopsis (6.4.4)
      escLambda: 0.0015, escAgeFactor: 1, escContamFactor: 4, escTendFactor: 2, escHumidFactor: 1.5, escHumidRh: 0.95,
      escOutbreakI: 0.05, escR: 1.0, weedR: 2.0, weedersPerGu: 0.25, weedMassFrac: 0.1, escHealthRate: 0.4,
      escSpreadBu: 60, escSpreadP: 0.15, escQuarantineMult: 0.1, escDeadI: 0.8, escClearI: 0.01, escVisibleI: 0.15,
      refuseLifespanMult: 0.5, foundingOutbreakP: 0.066,
      // leaf selection (6.4.5)
      leafSelectivityDefault: 0.3, rejectGd: 7, rejectCheckGd: 0.25, rejectHealthDrop: 0.05, rejectWindowGd: 1.5,
      rejectShare: 0.2, rejectToxin: 0.3, rejectProtein: 0.25, rejectTrailDecayMult: 4,
      // processing chain (6.4.6)
      cutBaseS: 15, cutMinS: 8, cutMult15C: 3, cutMult20C: 1.7, cutMult30C: 0.9, cutSapC: 0.3,
      cacheSpoilGd: 1, cacheSpoilQMult: 0.5, cacheWasteGd: 2, processSPerLu: 40, plantSPerPulp: 5, pulpDryGd: 0.5,
      tendCycleS: 6, wasteLoadPerTrip: 1,
      // hitchhikers and phorids (6.4.7)
      hitchMinCarryBu: 100, hitchBoardP: 0.5, hitchBoardPEscort: 0.8, phorid100sP: 0.04, phoridHitchMult: 0.4,
      phoridDeathGd: 0.2, stridulationRadiusBu: 6,
      // founding garden (6.4.8) and pellet (5.4.3)
      gardenFertCost: 0.25, pelletDecayPerGd: 0.05, pelletMinRh: 0.6, pelletMinC: 18, pelletMaxC: 30, plantHoldS: 4,
      plantedGu: 0.3, foundChamberBu: 10,
      // garden-less colony (6.4.9)
      gardenLessLarvaHazard: 1.0, gardenLessReserveGd: 3, gardenLessDrawLoads: 0.1,
      // queen and eggs paid in FL (5.4.2); sap per cut is diet.sapPerCut
      queenUpkeepFl: 0.5, eggCostFl: 0.03,
      // small-media devMult (5.4.2): the `media` caste row carries 1.0; individuals under 0.8 BU develop at this rate
      smallMediaDevMult: 0.95,
      // units and loads (2.3): larval cost FL = 1.6 x m^0.8
      larvalCostFlPerM08: 1.6,
    },
  },
};
