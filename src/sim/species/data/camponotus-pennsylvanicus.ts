// Camponotus pennsylvanicus, black carpenter ant (GDD 07 §5.2; dossier docs/research/bio-camponotus.md).
// Units per field: src/sim/types/species.ts. [EST] marks a design estimate (no source), [D] a dossier value.
// Day numbers are on the default 28-day year, 0-based `d28` (00-index C1): GDD 07's 1-based `D` minus 1.

import type { CasteDef, SpeciesDef } from '@/sim/types';
import {
  actions, APHID_TENDING_ACTIONS, GYNE_BASE_ACTIONS, MALE_ACTIONS, NO_UNLOCK, QUEEN_BASE_ACTIONS, queenLifespan,
  WORKER_BASE_ACTIONS,
} from './common';

// Workers: the Lasius kit with wood chewing (`dig-bite` in wood), `eject-frass` and `drum` (GDD 07 §5.2.1).
// Majors do not tend aphids (too large for small herds); nobody relocates aphids (no `carry-aphid`, §6.1.3).
const SPRAY: CasteDef['actions'] = ['spray-acid'];
const MINOR_ACTIONS = actions(WORKER_BASE_ACTIONS, [...SPRAY, 'tend-aphid', 'cull-aphid', 'eject-frass', 'drum']);
const MEDIA_ACTIONS = MINOR_ACTIONS;
const MAJOR_ACTIONS = actions(WORKER_BASE_ACTIONS, [...SPRAY, 'eject-frass', 'drum', 'block-opening']);

/** No fungus, no milling, no leaf cutting: Camponotus never does these tasks (taskWeights 0 = never). */
const NOT_MY_TASKS = { garden: 0, cut: 0, mill: 0 } as const;

// Large castes unlock at colony age 2 years (= start of colony year 3) and N >= 60 (§5.2.2, E-159).
const LARGE_UNLOCK: CasteDef['unlock'] = { minWorkers: 60, minColonyAgeYears: 2 };

const CASTES: CasteDef[] = [
  {
    // Nanitic first brood: 0.55 / 0.65 / 0.8 BU, 1.2 mg, lifespan 40 sd 15 [EST]: see NANITIC_MINOR below.
    caste: 'minor', sizeClasses: [{ id: 'nanitic', minBu: 0.55, maxBu: 0.8 }],
    lengthBu: { min: 0.7, mean: 0.78, max: 0.9 }, casteMassMg: 2.0, cropMax: null, carryOverride: null,
    mandibleFactor: 1.0, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 84, sd: 30 }, lifespanBySize: [], ageRateOutside: 2.0, ageRateDormant: 0.15,
    fixedStats: null, upkeepOverride: null, devMult: 1.0, actions: MINOR_ACTIONS,
    taskWeights: { ...NOT_MY_TASKS }, unlock: NO_UNLOCK,
  },
  {
    caste: 'media', sizeClasses: [], lengthBu: { min: 1.0, mean: 1.1, max: 1.25 }, casteMassMg: 7, cropMax: null,
    carryOverride: null, mandibleFactor: 1.0, macrocephalic: false, cruiseMult: 1, sprintBuS: 10,
    lifespanGd: { mean: 84, sd: 30 }, lifespanBySize: [], ageRateOutside: 2.0, ageRateDormant: 0.15,
    fixedStats: null, upkeepOverride: null, devMult: 1.05, actions: MEDIA_ACTIONS,
    taskWeights: { ...NOT_MY_TASKS }, unlock: LARGE_UNLOCK,
  },
  {
    // Majors incl. rare super majors to 1.9 BU. Carry 2.0 and crop 2.3 are table values (the m^0.6 rule gives 1.64).
    caste: 'major', sizeClasses: [], lengthBu: { min: 1.3, mean: 1.5, max: 1.9 }, casteMassMg: 16, cropMax: null,
    carryOverride: 2.0, mandibleFactor: 1.5, macrocephalic: true, cruiseMult: 0.9, sprintBuS: 9,
    lifespanGd: { mean: 100, sd: 35 }, lifespanBySize: [], ageRateOutside: 2.0, ageRateDormant: 0.15,
    fixedStats: null, upkeepOverride: null, devMult: 1.15, actions: MAJOR_ACTIONS,
    // No aphid tending; poor nurses [EST]; guards and chews hard wood (GDD 07 §5.2.8).
    taskWeights: { ...NOT_MY_TASKS, tend: 0, nurse: 0.3, 'queen-care': 0.3, forage: 0.5 }, unlock: LARGE_UNLOCK,
  },
  {
    // GDD 05 §4.1 / GDD 07 table: queen 120 HP, bite 12 (not the mass formula).
    caste: 'queen', sizeClasses: [], lengthBu: { min: 2.0, mean: 2.1, max: 2.3 }, casteMassMg: 100, cropMax: 3.0,
    carryOverride: 0, mandibleFactor: 0.27, macrocephalic: false, cruiseMult: 0.5, sprintBuS: 4,
    lifespanGd: queenLifespan({ min: 10, max: 15 }), lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    fixedStats: { maxHp: 120, bite: 12, foundingMaxHp: null }, upkeepOverride: { restC: 0.3, activeC: 0.3, p: 0.1 },
    devMult: 1, actions: actions(QUEEN_BASE_ACTIONS, SPRAY), taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'gyne', sizeClasses: [], lengthBu: { min: 1.9, mean: 2.0, max: 2.1 }, casteMassMg: 100, cropMax: 3.0,
    carryOverride: 0, mandibleFactor: 0.27, macrocephalic: false, cruiseMult: 1, sprintBuS: 9,
    // Overwinters in the nest and flies the next spring (§5.2.4): lives through a winter at 0.15 /GD [EST].
    lifespanGd: { mean: 60, sd: 10 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    fixedStats: { maxHp: 120, bite: 12, foundingMaxHp: null }, upkeepOverride: { restC: 0.15, activeC: 0.15, p: 0 },
    devMult: 1.3, actions: actions(GYNE_BASE_ACTIONS, SPRAY), taskWeights: {}, unlock: NO_UNLOCK,
  },
  {
    caste: 'male', sizeClasses: [], lengthBu: { min: 1.0, mean: 1.1, max: 1.2 }, casteMassMg: 15, cropMax: 0.5,
    carryOverride: 0, mandibleFactor: 0.2, macrocephalic: false, cruiseMult: 1, sprintBuS: 9,
    lifespanGd: { mean: 50, sd: 5 }, lifespanBySize: [], ageRateOutside: 1, ageRateDormant: 0.15,
    fixedStats: { maxHp: 23, bite: 1.2, foundingMaxHp: null }, upkeepOverride: { restC: 0.1, activeC: 0.1, p: 0 },
    devMult: 1.1, actions: [...MALE_ACTIONS], taskWeights: {}, unlock: NO_UNLOCK,
  },
];

/**
 * Nanitic minor (first brood, GDD 07 §5.2.1): not a caste in the schema, so its table row lives here for the
 * founding/brood modules. Mass 1.2 mg at the mean length (0.65 BU), lifespan 40 sd 15 GD [EST], devMult 0.95,
 * larval cost 0.29 P + 0.10 C, upkeep 0.021 / 0.053 (m 0.17).
 */
export const CAMPONOTUS_NANITIC_MINOR = {
  lengthBu: { min: 0.55, mean: 0.65, max: 0.8 }, casteMassMg: 1.2, lifespanGd: { mean: 40, sd: 15 }, devMult: 0.95,
} as const;

/** Acid charges by caste (GDD 07 §5.2.7): the schema holds one `acid.max`; the per-caste value is read from here. */
export const CAMPONOTUS_ACID_CHARGES = { minor: 3, media: 5, major: 6 } as const;

export const CAMPONOTUS_PENNSYLVANICUS: SpeciesDef = {
  // `available` is false in the T1 build (GDD 07 Appendix E1): the wood-nesting module is not implemented yet, so the
  // New Game screen must not offer this species. The task that ships the module flips it to true.
  id: 'camponotus-pennsylvanicus', binomial: 'Camponotus pennsylvanicus', commonName: 'Black carpenter ant',
  subfamily: 'formicinae', buMm: 9, stdMassMg: 7, available: false, tier: 'T3', complexity: 2,
  playstyleLine: 'A night-shift colonist of damp wood: slow to grow, split between a moist parent nest and dry satellites.',
  foundingSeason: 'spring', economyModules: ['honeydew-ranching', 'wood-nesting'],
  codexIds: ['cx-claustral-founding', 'cx-honeydew', 'cx-wood-moisture', 'cx-frass', 'cx-satellite-nests', 'cx-night-foraging'],
  cruiseBuS: 5, loadSpeedMult: 0.85,
  castes: CASTES,
  life: {
    // [D] 18 / 21 / 25 days at 24 °C; devRate [EST] from the dossier.
    stageGd: { egg: 1.4, larva: 1.6, pupa: 1.9 }, devRefC: 24,
    devRate: [[10, 0], [17, 0.5], [24, 1.0], [30, 1.0], [33, 0.5], [36, 0]],
    larvaFood: 'trophallaxis+solid', animalProteinMinFrac: 0,
    // q(N) = 8 + 140 (1 - e^(-N/500)) eggs per GD inside a laying window [EST rate, D windows].
    qMax: 148, sizeBase: 0.054, sizeK: 500,
    // Laying is gated by layWindows (d28 0.5-3.0 spring and 9.5-12.5 late summer); inside them the factor is 1.
    fSeason: [[0, 1], [28, 1]], layWindows: [[0.5, 3.0], [9.5, 12.5]],
    fTempQ: [[15, 0], [21, 1], [30, 1], [35, 0]],
    queenUpkeep: { c: 0.3, p: 0.1 }, queenLifespanYears: { min: 10, max: 15 },
    // Media and majors unlock at colony age 2 y and N >= 60; the target then ramps over 1 year to 50 / 38 / 12 (the
    // ramp length is `casteRampYears` in the wood-nesting block). Before that the colony rears minors only.
    casteMixTarget: [[0, 0.5, 0.38, 0.12]],
    // Moisture hazard is a function of wood moisture, not a flat rate: see the wood-nesting block.
    broodHazard: {},
  },
  opening: {
    mode: 'claustral-wood',
    // Decayed wood is ideal; sound wood only when damp (mc >= 18 %); bark gaps count as the wood beneath [EST values].
    siteMaterials: { 'wood-decayed': 1.0, 'wood-sound': 0.7, bark: 0.5 },
    siteHard: ['wood-thickness-10bu', 'wood-moisture-8pct'], siteBonuses: ['existing-cavity', 'wood-moisture', 'sheltered'],
    // GDD 03 §13.1: D_MIN 3 BU into wood (open and covered), V_MIN 10 BU^3, W_MIN 3.5 BU, tunnel 6 BU into the wood.
    dMinOpenBu: 3, dMinCoverBu: 3, vMinBu3: 10, wMinBu: 3.5, shaftTargetBu: 6, seal: true,
    R0: 36, clutchCap: 16, trophicFraction: 0, firstBroodClass: { caste: 'minor', nanitic: true },
    expectedFirstWorkers: { min: 6, max: 11 }, special: ['woodMoisture'],
    startDoy: { min: 2, max: 9, default: 5 }, startHours: [17, 19],
  },
  scale: {
    simCapWorkers: 1200, wildColonySize: { typical: [2000, 3000], max: 15000 },
    growThreshold: 50, matureThreshold: 500,
    growthTargets: [[1, 6, 12], [2, 40, 80], [3, 200, 320], [4, 450, 600], [5, 800, 1000], [6, 1050, 1200]],
  },
  reproduction: {
    // Alates overwinter in the nest and fly singly the next spring (doy 1-9, peak 4-6, launch 16:00-20:00 [EST]).
    matureAgeYears: 4, alateLayWindow: [2, 3], reproMaxFrac: 0.12, reproGyneShare: 0.44,
    sexualCostMult: { gyne: 8.0, male: 1.3 }, alateFlightWindow: [1, 9], flightPeak: [4, 6], launchHours: [16, 20],
    flightGate: { minAirC: 13, maxWindMs: 5, noRain: true }, synchrony: 'individual', alatesOverwinter: true,
    pAir: 0.65, pMate: 0.9, pFound: 0.7, gyneUpkeepC: 0.15, maleUpkeepC: 0.1,
  },
  diet: {
    foods: {
      honeydew: { pref: 1.0, route: 'crop-c', tier: 'T2' }, sugar: { pref: 1.0, route: 'crop-c', tier: 'T1' },
      nectar: { pref: 0.8, route: 'crop-c', tier: 'T1' }, fruit: { pref: 0.7, route: 'crop-cp', tier: 'T2' },
      crumb: { pref: 0.7, route: 'solid-cp', tier: 'T1' }, prey: { pref: 1.0, route: 'solid-p', tier: 'T2' },
      carrion: { pref: 0.8, route: 'solid-p', tier: 'T1' }, 'pet-food': { pref: 0.8, route: 'solid-p', tier: 'T2' },
      bait: { pref: 0.6, route: 'crop-c', tier: 'T2' }, dew: { pref: 0.2, route: 'water', tier: 'T2' },
      // seed and leaf: 0 (absent). Wood is never eaten [D].
    },
    // Nitrogen is collected about 4 x more intensively than carbohydrate [D]. No-larvae value as Lasius [EST].
    pTargetFrac: 0.45, pTargetFracNoLarvae: 0.05, sapPerCut: 0,
  },
  nestTemplate: {
    // Wood only. Base dig-speed factors (1 / bite factor of GDD 07 §6.2.3): sound wood 0.4 (decay 0, mc >= 15),
    // decayed wood 0.83 (decay 2); bark 1.2 (thin layer only). The per-bite factors live in the wood-nesting block.
    nestMaterials: { 'wood-sound': 0.4, 'wood-decayed': 0.83, bark: 1.2 },
    coverBonus: [],
    // Galleries 2.0 BU along the grain; royal route 2.5 BU (GDD 03 §8.2 tunnelD / royalD).
    tunnelWidthBu: 2.0, shaftWidthBu: 2.5,
    // W x H of GDD 03 §8.2's S / M sizes (long axis along the grain, in src/sim/balance/nestTemplates.ts). GDD 07
    // §5.2.6 counts: royal (1), nursery 1 per 50 brood, food 1 per 400 workers, rest 1 per 200 workers.
    chambers: [
      { type: 'royal', widthBu: 5, heightBu: 2.5, depthBu: [2, 175], perUnit: 1, unitOf: 'fixed', minWorkers: 8 },
      { type: 'nursery', widthBu: 8, heightBu: 2.5, depthBu: [2, 10], perUnit: 1 / 50, unitOf: 'brood', minWorkers: 8 },
      { type: 'food', widthBu: 5, heightBu: 2.5, depthBu: [2, 175], perUnit: 1 / 400, unitOf: 'workers', minWorkers: 25 },
      { type: 'rest', widthBu: 8, heightBu: 2.5, depthBu: [2, 175], perUnit: 1 / 200, unitOf: 'workers', minWorkers: 40 },
    ],
    // One main entrance per nest site; further openings are windows planned by the wood module (max 6 per site).
    entrances: { start: 1, perWorkers: 0, max: 6 },
    maxDepthBu: 175, footprintRBu: 600, volumeCapBu3: 8000, maxPathToEntranceBu: 120,
    mound: 'none', midden: 'frass-pile',
    // tMin / tMax: where devRate falls to 0.5 [EST]. The moisture bands (mc 15-30 % young, 8-18 % late) are in the
    // wood-nesting block; rh is [EST].
    broodClimate: [
      { stage: 'egg', tMin: 17, tOpt: [20, 28], tMax: 33, rh: [0.7, 0.95] },
      { stage: 'larva', tMin: 17, tOpt: [20, 28], tMax: 33, rh: [0.7, 0.95] },
      { stage: 'pupa', tMin: 17, tOpt: [24, 30], tMax: 33, rh: [0.4, 0.7] },
    ],
  },
  thermal: {
    thermalShiftC: -2, forageGate: { a: 5, b: 13, c: 26, d: 33 }, stressC: 36, shadeSeekC: 34, chillC: 2, freezeC: -4,
    lightPref: { night: 1.0, dawn: 0.8, morning: 0.35, midday: 0.2, afternoon: 0.3, dusk: 1.0 }, lightPrefSeason: {},
  },
  signals: {
    // Hindgut trail 1,800 s at 20 °C; trunk trails run along climb routes; compass by moon or lamp (§6.2.7).
    trailHalfLifeS: 1800, trailRefC: 20,
    trunkTrail: { enabled: true, unusedHalfLifeGd: 3, ghostAfterGd: 8, ghostFadeGd: 7, clearing: false },
    homeHalfLifeGd: 3, ignorerFrac: 0.1, recruitUnlockWorkers: 20,
    // No group recruitment documented: one recruit per dab, as Lasius.
    recruitGroup: { min: 1, max: 1 }, patrolGate: null,
    // Drumming (GDD 05 §4.4: burst 15 BU; GDD 07 §6.2.6 adds 30 BU inside one wood primitive, see wood block).
    alarmMode: 'drumming', alarmRadiusBu: 15,
  },
  combat: {
    // Acid charges are per caste (CAMPONOTUS_ACID_CHARGES); `max` is the media's. Majors decapitate arthropods < 2 mg
    // (insta-kill 0.2 per bite, GDD 05). Aggression is an [EST] (not given in GDD 07).
    weapons: ['bite', 'bite-hold', 'spray-acid'], acid: { max: 5, regenS: 120, coneDeg: 60, rangeL: 1.5 },
    sting: null, aggression: 0.6, guardCastes: ['major'],
  },
  climate: 'temperate-continental',
  winter: {
    mode: 'diapause-lapse', tColdStress: 0, wintBaseLoss: 0.05, wintMetBase: 0.35, wintQ10: 2.2,
    broodCarried: 'larva', heatedNestRule: true,
  },
  directiveTasks: ['forage', 'tend', 'nurse', 'dig', 'guard'], directiveExtras: ['casteEmphasis', 'satelliteAuto', 'hideFrass'],
  taskSubtypes: ['tend:relay', 'nurse:shuttle', 'haul:frass'],
  appearance: {
    // Dull black; pale gaster hairs; one node; acidopore (dossier). Colours as the render presets.
    bodyColour: '#181410', gasterColour: '#14110e', hairiness: 0.25, waistNodes: 1, rearWeapon: 'acidopore', spines: 0,
    headWidthRatio: { minor: 0.18, media: 0.235, major: 0.31, queen: 0.19, gyne: 0.19, male: 0.15 },
    queenThoraxScale: 1.5, alateWingTint: '#dcd8cf',
  },
  modules: {
    // GDD 07 §6.1.2 (relocation constants are Lasius only: Camponotus cannot move its herds) and §6.1.3.
    'honeydew-ranching': {
      relayRadiusBu: 3, relayReceiverMaxCrop: 0.5, waitPatrolRadiusBu: 3, waitTimeoutS: 300, herdForageMarkerMult: 2.0,
      scaleHerdMin: 40, scaleHerdMax: 120, scaleCPerInsectGd: 0.06,
    },
    // GDD 07 §6.2 (wood state, moisture, carving, frass, windows, brood rule, satellites, drumming, relocation).
    'wood-nesting': {
      // moisture and decay (6.2.2)
      mcRate: 0.25, decayGdPerClass: 56, decayMinMcPct: 22, decayFloorMcPct: 18,
      // carving (6.2.3): bite time factors by decay class (decay 0 splits on mc 15 %), cross-grain, caste factors
      biteFactorDecay0Dry: 4.0, biteFactorDecay0Wet: 2.5, biteFactorDecay1: 2.0, biteFactorDecay2: 1.2,
      biteFactorDecay3: 1.0, biteFactorDecay4: 0.8, dryWoodMcPct: 15, crossGrainMult: 1.8, crossGrainAngleDeg: 45,
      casteFactorMinor: 1.6, casteFactorNanitic: 1.8, casteFactorMedia: 1.0, casteFactorMajor: 0.7,
      frassPerBite: 1, frassBulk: 0.3, minWallBu: 0.5, maxCarvedFrac: 0.4,
      windowOpeningBu: 1.2, windowSpacingBu: 30, windowsMaxPerSite: 6, ejectFrassS: 1.5,
      frassPerPileUnit: 10, frassBu3PerUnit: 1.5, hideFrassItemsPerBu3: 4,
      frassVisibilityInterior: 1.0, frassVisibilityOutdoor: 0.2, birdChancePerPileUnitGd: 0.02, birdChanceCap: 0.3,
      // brood moisture rule (6.2.4): hazard 0.4 x clamp((15 - mc) / 7, 0, 1) + 0.01 per % above 30
      mcFullSurvivalPct: 15, mcZeroSurvivalPct: 8, hazardDryMaxPerGd: 0.4, mcMouldPct: 30, hazardMouldPerPct: 0.01,
      youngProgressMax: 0.5, dryBonus: 1.15, dryBonusMcMinPct: 8, dryBonusMcMaxPct: 18,
      // satellites (6.2.5)
      satelliteMinWorkers: 150, satelliteMaxRouteBu: 600, satellitesMaxOutdoor: 4, satellitesMaxInterior: 2,
      satelliteMigrantFrac: 0.05, satelliteMigrantMin: 4, satelliteVoidMinBu: 8, satelliteNurseryFreeMax: 0.5,
      satelliteCarvedFracTrigger: 0.35, satelliteIsolatedGd: 1, satelliteOrphanGd: 7,
      // shuttling and drumming (6.2.6)
      shuttleEveryGd: 0.25, shuttleScoreMargin: 0.1, drumS: 1.0, drumCooldownS: 5, drumRadiusWoodBu: 30,
      drumRadiusOtherBu: 10,
      // queen relocation (6.2.7)
      relocateHazardTrigger: 0.1, relocateHazardWindowGd: 2, relocateAlertGd: 0.5, relocateEscort: 10,
      lightChangeRadiusBu: 40, lightChangeUturnP: 0.3,
      // structural timber (6.2.8)
      heatedBroodFrac: 0.8, heatedChamberMinC: 14, heatedWindowGd: 2,
      // caste mix ramp (5.2.2): years over which the target ramps after the large castes unlock
      casteRampYears: 1,
    },
  },
};
