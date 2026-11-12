// Locomotion tuning (steering, planning, stuck recovery, level of detail, possessed-ant movement). Lengths in BU so
// they scale with the species; angles in degrees, times in game seconds. Sources: GDD 01 §4 (player movement),
// GDD 02 §1.6 / §8.4 / §9.2 (AI speed, trail following, breadcrumbs), GDD 04 §3 / §10 / §11 / §14 (grip, climb
// routes, nav grid, map boundary), docs/research/spike-nest.md §5 (prefer-floor bias, avoidance).
// The balance owner may re-export LOCO_TUNING from src/sim/balance (as balance/kernel.ts does for the kernel).

export const LOCO_TUNING = {
  // ---- speeds (GDD 01 §4.2, GDD 02 §1.6, directions K) ----
  /** Possessed ant: hurry = cruise x this (never above the caste's sprint). */
  playerHurryMult: 1.6,
  /** Possessed ant while gripping. */
  gripSpeedMult: 0.4,
  /** Possessed ant at tempFactor 0 crawls at this fraction of cruise. */
  coldCrawlMult: 0.25,
  /** Callow AI workers (GDD 02 CALLOW_SPEED). */
  callowSpeedMult: 0.6,
  /** Run speed when the caste has no sprint value, BU/s (GDD 02 RUN_SPEED). */
  runSpeedBU: 12,
  /** Creatures without an explicit speed request, BU/s. */
  creatureSpeedBU: 4,

  // ---- steering ----
  /** AI heading turn rate, deg/s. */
  aiTurnRateDeg: 240,
  /** Possessed ant turn rate and on-the-spot pivot (GDD 01 TURN_RATE, PIVOT_ANGLE; pivot ends below 60 deg). */
  playerTurnRateDeg: 300,
  pivotEnterDeg: 135,
  pivotExitDeg: 60,
  /** A desired direction steers only if its tangent part is at least this fraction of it (as the kernel's). */
  minSteer: 0.25,
  /** Light inter-ant separation (spike-nest §5 item 12): radius, weight, neighbours considered. */
  separationBU: 1.1,
  separationWeight: 0.5,
  separationMax: 6,
  /** Prefer-floor bias inside cavities (spike-nest §5 item 4): weight of the tangent part of "down". */
  preferFloorWeight: 0.35,
  /** Wander: heading noise, deg per sqrt(s); pull back to the region centre beyond its radius. */
  wanderSigmaDeg: 70,
  wanderPull: 1.5,
  /** Heading noise while following a trail, deg per sqrt(s) (GDD 02 §8.4: x0.3 on a strong trail). */
  trailNoiseDeg: 12,

  // ---- trail following (GDD 02 §7 antennae, §8.4) ----
  antennaReachBU: 0.9,
  antennaAngleDeg: 35,
  /** omega = gain x (L - R) / (L + R + 1), rad/s. */
  trailTurnGain: 2.5,
  /** Below this a sensor reading is not followable (GDD 02 TRAIL_DETECT), ph. */
  trailDetect: 0.3,
  /** No sensor above detect for this long = trail lost (GDD 02 TRAIL_LOST_S). */
  trailLostS: 8,

  // ---- breadcrumbs and retrace (GDD 02 §9.2) ----
  crumbSpacingBU: 6,
  crumbTurnDeg: 45,
  crumbTurnMinBU: 3,
  loopCloseBU: 3,
  shortcutLookahead: 8,
  /** Shortcut test: segment lifted this far above the surface, swept with this radius. */
  shortcutLiftBU: 1.2,
  shortcutRadiusBU: 0.4,
  /** A crumb counts as reached within this distance. */
  crumbReachBU: 2,
  /** Path-integration error per distance walked (GDD 02 PI_NOISE). */
  piNoise: 0.02,

  // ---- planning ----
  /** Surface waypoint reached (horizontal distance), BU. */
  waypointReachBU: 2.5,
  /** Climb-route node reached, BU. */
  climbReachBU: 1.5,
  /** Nest-field steering lookahead, voxel steps (the kernel demo's value). */
  fieldLookahead: 4,
  /** Hand-over from a surface leg to the entrance mouth: extra radius around the entrance, BU. */
  entranceHandoverBU: 1.5,
  /** Arrival points are spread around entrances and point goals over this fraction of the radius. */
  arrivalSpread: 0.6,
  /** A goal this far above the ground under it is "elevated" (reached by a climb route if one is near), BU. */
  elevatedBU: 3,
  /** Climb routes: goal / walker counted on a route within this distance of one of its nodes, BU. */
  routeSnapBU: 6,
  routeGoalBU: 16,
  /** Straight-line goals closer than this skip the nav-grid planner, BU. */
  directBU: 24,
  /** Planner calls (A*) per tick across all walkers; the rest seek directly and retry next tick. */
  planBudget: 24,
  /** Moving targets (entities) are re-resolved this often, s, or when they moved this far, BU. */
  retargetS: 1,
  retargetBU: 3,
  /** Shared point fields inside nests: at most this many registered (oldest removed first). */
  pointFieldMax: 48,
  /** Point fields quantise their goal to this cell, BU. */
  pointFieldCellBU: 2,
  /** Seed radius of a point field, BU. */
  pointFieldRadiusBU: 1,
  /** Request timeout: base, s, plus this many times the straight-line travel time. */
  timeoutBaseS: 60,
  timeoutMult: 8,

  // ---- stuck detection and recovery ladder ----
  /** A leg is stuck when its progress metric did not improve by stuckProgressBU within stuckWindowS. */
  stuckWindowS: 2.5,
  stuckProgressBU: 0.5,
  sidestepS: 1.2,
  backoffS: 0.8,
  /**
   * Relocations allowed per request, then the request fails; stuck episodes allowed per request (the request
   * timeout is the hard bound; this one ends hopeless requests earlier).
   */
  relocateMax: 2,
  episodesMax: 16,
  /** Relocation target: this many waypoints / field steps ahead. */
  relocateFieldSteps: 8,

  // ---- level of detail ----
  /** Distance from the observer beyond which walkers step every lodMidEvery / lodFarEvery ticks, BU. */
  lodNearBU: 160,
  lodFarBU: 420,
  lodMidEvery: 2,
  lodFarEvery: 4,
  /** Coarse LOD steps use this substep on open ground (no hard primitive within lodHardClearBU). */
  lodCoarseSubstepBU: 0.75,
  lodHardClearBU: 3,

  // ---- map boundary (GDD 04 §14) ----
  edgeMarginBU: 32,
  edgeHardBU: 8,
  edgeRepulse: 1.5,

  // ---- avoid markers (GDD 02 §12.2) ----
  avoidCostMult: 20,
  avoidSteerPadBU: 4,
  avoidSteerWeight: 1.5,

  // ---- possessed ant (GDD 01 §4.1-4.2) ----
  latchTriggerDeg: 25,
  latchTriggerS: 0.3,
  latchBreakDeg: 30,
  latchMaxS: 1.5,
  latchLowMag: 0.2,
  latchLowMagS: 0.1,
  stuckRescueS: 3,
  rescueDispBU: 0.1,
  /** Reconciliation of the per-frame prediction: error blended out over this many real s; snaps above snapBU. */
  predictBlendS: 0.1,
  predictSnapBU: 1,

  // ---- grip and slopes (GDD 04 §3) ----
  /** Maximum sustained tilt (angle between up and world up), deg, by grip band. */
  tiltMaxHighGrip: 180,
  tiltMaxMidGrip: 120,
  tiltMaxLowGrip: 45,
  gripHigh: 0.8,
  gripMid: 0.5,
  /** Grip of materials not in the table. */
  gripDefault: 0.9,
} as const;

/** Dry grip per material (GDD 04 §3); wet and greasy multipliers are Tier 2 inputs. */
export const MATERIAL_GRIP: Readonly<Record<string, number>> = {
  loam: 0.9, humus: 0.85, sand: 0.6, clay: 0.85, gravel: 0.8, concrete: 0.95, asphalt: 0.95, stone: 0.9, brick: 0.95,
  tile: 0.75, 'wood-sound': 0.9, 'wood-decayed': 0.9, bark: 1, plant: 0.85, leaf: 0.8, metal: 0.75, plastic: 0.75,
  rubber: 0.95, glass: 0.7, fabric: 1, ceramic: 0.7, paper: 0.9, food: 0.7, plaster: 0.9,
};

/** Primitives the possessed ant may walk with while they run (others hold it still). */
export const PLAYER_MOVE_OK_ACTIONS: readonly string[] = ['grip', 'drag', 'bite-hold', 'lay-trail', 'move'];

/** Locomotion parameters in mm / rad / s for one body unit (memoised; read-only). */
export interface LocoParams {
  bu: number;
  hurryMult: number; gripSpeedMult: number; coldCrawl: number; callow: number; run: number; creature: number;
  aiTurn: number; playerTurn: number; pivotEnter: number; pivotExit: number; minSteer: number;
  sepR: number; sepW: number; sepMax: number; floorW: number; wanderSigma: number; wanderPull: number; trailNoise: number;
  antReach: number; antAngle: number; trailGain: number; trailDetect: number; trailLostS: number;
  crumbSpacing: number; crumbTurnCos: number; crumbTurnMin: number; loopClose: number; shortcutN: number;
  shortcutLift: number; shortcutR: number; crumbReach: number; piNoise: number;
  wpReach: number; climbReach: number; fieldLook: number; entranceHandover: number; spread: number; elevated: number;
  routeSnap: number; routeGoal: number; direct: number; planBudget: number; retargetS: number; retarget: number;
  pointFieldMax: number; pointFieldCell: number; pointFieldR: number; timeoutBase: number; timeoutMult: number;
  stuckWindowS: number; stuckProgress: number; sidestepS: number; backoffS: number; relocateMax: number;
  episodesMax: number; relocateSteps: number;
  lodNear: number; lodFar: number; lodMid: number; lodFarEvery: number; lodSubstep: number; lodHardClear: number;
  edgeMargin: number; edgeHard: number; edgeRepulse: number;
  avoidCost: number; avoidPad: number; avoidW: number;
  latchTrigger: number; latchTriggerS: number; latchBreakCos: number; latchMaxS: number; latchLowMag: number;
  latchLowMagS: number; rescueS: number; rescueDisp: number; predictBlendS: number; predictSnap: number;
}

const DEG = Math.PI / 180;
const cache = new Map<number, LocoParams>();

export function locoParams(bu: number): LocoParams {
  const hit = cache.get(bu);
  if (hit) return hit;
  const T = LOCO_TUNING;
  const p: LocoParams = {
    bu, hurryMult: T.playerHurryMult, gripSpeedMult: T.gripSpeedMult, coldCrawl: T.coldCrawlMult,
    callow: T.callowSpeedMult, run: T.runSpeedBU * bu, creature: T.creatureSpeedBU * bu,
    aiTurn: T.aiTurnRateDeg * DEG, playerTurn: T.playerTurnRateDeg * DEG, pivotEnter: T.pivotEnterDeg * DEG,
    pivotExit: T.pivotExitDeg * DEG, minSteer: T.minSteer,
    sepR: T.separationBU * bu, sepW: T.separationWeight, sepMax: T.separationMax, floorW: T.preferFloorWeight,
    wanderSigma: T.wanderSigmaDeg * DEG, wanderPull: T.wanderPull, trailNoise: T.trailNoiseDeg * DEG,
    antReach: T.antennaReachBU * bu, antAngle: T.antennaAngleDeg * DEG, trailGain: T.trailTurnGain,
    trailDetect: T.trailDetect, trailLostS: T.trailLostS,
    crumbSpacing: T.crumbSpacingBU * bu, crumbTurnCos: Math.cos(T.crumbTurnDeg * DEG), crumbTurnMin: T.crumbTurnMinBU * bu,
    loopClose: T.loopCloseBU * bu, shortcutN: T.shortcutLookahead, shortcutLift: T.shortcutLiftBU * bu,
    shortcutR: T.shortcutRadiusBU * bu, crumbReach: T.crumbReachBU * bu, piNoise: T.piNoise,
    wpReach: T.waypointReachBU * bu, climbReach: T.climbReachBU * bu, fieldLook: T.fieldLookahead,
    entranceHandover: T.entranceHandoverBU * bu, spread: T.arrivalSpread, elevated: T.elevatedBU * bu,
    routeSnap: T.routeSnapBU * bu, routeGoal: T.routeGoalBU * bu, direct: T.directBU * bu, planBudget: T.planBudget,
    retargetS: T.retargetS, retarget: T.retargetBU * bu, pointFieldMax: T.pointFieldMax,
    pointFieldCell: T.pointFieldCellBU * bu, pointFieldR: T.pointFieldRadiusBU * bu, timeoutBase: T.timeoutBaseS,
    timeoutMult: T.timeoutMult,
    stuckWindowS: T.stuckWindowS, stuckProgress: T.stuckProgressBU * bu, sidestepS: T.sidestepS, backoffS: T.backoffS,
    relocateMax: T.relocateMax, episodesMax: T.episodesMax, relocateSteps: T.relocateFieldSteps,
    lodNear: T.lodNearBU * bu, lodFar: T.lodFarBU * bu, lodMid: T.lodMidEvery, lodFarEvery: T.lodFarEvery,
    lodSubstep: T.lodCoarseSubstepBU * bu, lodHardClear: T.lodHardClearBU * bu,
    edgeMargin: T.edgeMarginBU * bu, edgeHard: T.edgeHardBU * bu, edgeRepulse: T.edgeRepulse,
    avoidCost: T.avoidCostMult, avoidPad: T.avoidSteerPadBU * bu, avoidW: T.avoidSteerWeight,
    latchTrigger: T.latchTriggerDeg * DEG, latchTriggerS: T.latchTriggerS, latchBreakCos: Math.cos(T.latchBreakDeg * DEG),
    latchMaxS: T.latchMaxS, latchLowMag: T.latchLowMag, latchLowMagS: T.latchLowMagS, rescueS: T.stuckRescueS,
    rescueDisp: T.rescueDispBU * bu, predictBlendS: T.predictBlendS, predictSnap: T.predictSnapBU * bu,
  };
  cache.set(bu, p);
  return p;
}

/** Maximum sustained tilt (rad) on a surface of this grip (GDD 04 §3). */
export function tiltLimit(grip: number): number {
  const T = LOCO_TUNING;
  const deg = grip >= T.gripHigh ? T.tiltMaxHighGrip : grip >= T.gripMid ? T.tiltMaxMidGrip : T.tiltMaxLowGrip;
  return deg * DEG;
}
