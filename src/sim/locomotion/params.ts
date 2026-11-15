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
  /** Separation applies in nests and within this distance of a trip's destination (crowding points), BU. */
  separationNearGoalBU: 12,
  /** Prefer-floor bias inside cavities (spike-nest §5 item 4): weight of the tangent part of "down". */
  preferFloorWeight: 0.35,
  /** Wander: heading noise, deg per sqrt(s); pull back to the region centre beyond its radius. */
  wanderSigmaDeg: 70,
  wanderPull: 1.5,
  /** Heading noise while following a trail, deg per sqrt(s) (GDD 02 §8.4: x0.3 on a strong trail). */
  trailNoiseDeg: 12,

  // ---- trail following (GDD 02 §7 antennae, §8.4) ----
  /**
   * Sensor reach, BU. GDD 02 §7 gives 0.9 BU antennae, but trail cells are 4 BU: at 0.9 BU the side sensors read
   * almost the same blended value. 3 BU (the pheromone module's PHERO_STEER_REACH_BU) is a recorded deviation.
   */
  antennaReachBU: 3,
  antennaAngleDeg: 35,
  /**
   * omega = gain x (L - R) / (L + R + 1), rad/s, scaled by the step's dt (so a walker stepped less often by the LOD
   * turns as much per game second). GDD 02 §8.4 gives 2.5 rad/s for 0.9 BU antennae over a fine field; with the
   * 3 BU reach over 4 BU cells the side difference is weak and 2.5 rad/s loses 60 deg bends, so the gain is
   * 6 rad/s (recorded deviation).
   */
  trailTurnGain: 6,
  /** Below this a sensor reading is not followable (GDD 02 TRAIL_DETECT), ph. */
  trailDetect: 0.3,
  /** No sensor above detect for this long = trail lost (GDD 02 TRAIL_LOST_S). */
  trailLostS: 8,
  /**
   * Trail followers far from the observer step at most every this many ticks: the sensors must be read at least
   * every ~1.2 BU of travel or bends are walked past (the LOD must not change where foragers go).
   */
  lodTrailMaxEvery: 2,

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
  /**
   * Arrive behaviour on a trip's last leg: the walker covers at most dt / max(arriveBrakeS, 2 dt) of the distance
   * left per step (no overshoot, however small the arrival radius), and within arriveTurnRadii turning radii of the
   * goal its speed scales with cos(angle to the goal) (it pivots instead of orbiting a goal beside or behind it).
   */
  arriveBrakeS: 0.2,
  arriveTurnRadii: 2,
  /** While pivoting toward a goal beside or behind it, the walker keeps this fraction of its capped speed. */
  arrivePivotCreep: 0.15,
  /** A goal this far above the ground under it is "elevated" (reached by a climb route if one is near), BU. */
  elevatedBU: 3,
  /** Climb routes: goal / walker counted on a route within this distance of one of its nodes, BU. */
  routeSnapBU: 6,
  routeGoalBU: 16,
  /** Straight-line goals closer than this skip the nav-grid planner, BU. */
  directBU: 24,
  /** Planner calls (A*) per tick across all walkers; the rest seek directly and retry next tick. */
  planBudget: 12,
  /**
   * A* node expansions per tick across all walkers (the budget is a cost, not only a count: one corner-to-corner
   * search on a standard map expands tens of thousands of nodes). The first plan of a tick always runs.
   */
  planExpandBudget: 20000,
  /** Soak invariant 'walker-stuck-explosion': more than this share of at least `min` moving walkers without
   * progress for `s` game seconds fails it. */
  stuckExplosionS: 120,
  stuckExplosionFrac: 0.25,
  stuckExplosionMin: 8,
  /** Moving targets (entities) are re-resolved this often, s, or when they moved this far, BU. */
  retargetS: 1,
  retargetBU: 3,
  /** Shared point fields inside nests: at most this many registered (oldest removed first). */
  pointFieldMax: 48,
  /**
   * Inside the goal nest, a point goal within this field distance is walked to directly (a final seek): the shared
   * point field is quantised (pointFieldCellBU) and seeded over pointFieldRadiusBU, so its bottom is not the goal
   * and following it there stalls (sim-fix-ants item 1), BU.
   */
  pointSeekBU: 3,
  /**
   * A walker on its final leg that made no progress for this long while within the arrival radius of its
   * destination has arrived (no stand-still until the 2.5 s stuck window), s.
   */
  arriveStallS: 0.6,
  /**
   * Upside down in a cavity (up.y below ceilingUpY) with the goal at least dropBelowBU lower and within dropAboveBU
   * horizontally: the walker lets go and drops (GDD 01 `let-go`; it cannot walk off a ceiling toward a point below).
   */
  ceilingUpY: -0.5,
  dropAboveBU: 2.5,
  dropBelowBU: 1,
  /** Point fields quantise their goal to this cell, BU. */
  pointFieldCellBU: 2,
  /** Seed radius of a point field, BU. */
  pointFieldRadiusBU: 1,
  /** Request timeout: base, s, plus this many times the straight-line travel time. */
  timeoutBaseS: 60,
  timeoutMult: 8,

  /** After a carve change, a walker farther than this from its level set re-attaches and replans, BU. */
  surfaceChangeTolBU: 0.05,

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
  /**
   * Wander (no goal): a walker that did not move stuckProgressBU for wanderStallS pivots on the spot for
   * wanderPivotS (its heading sweeps round, the pull to the wander centre is ignored), like an ant turning away from
   * an obstacle. A pivot that frees nothing, or more than wanderStallMax stalls in one request, ends the wander as
   * 'failed', so the caller can walk somewhere else (the ladder of goal requests has nothing to aim at here).
   */
  wanderStallS: 1,
  wanderPivotS: 1.5,
  wanderStallMax: 4,
  /**
   * Pinned: in a cavity on a steep slope, wall or overhang (up.y below pinnedUpY), standing (speed 0) and without progress for
   * pinnedS, a walker with a request lets go and drops to the floor below (GDD 01 `let-go`). Thin fins and lips of
   * carved soil can hold a walker whose every step is rejected; the ladder would take several windows to relocate.
   */
  pinnedS: 1,
  pinnedUpY: 0.7,

  // ---- level of detail ----
  /** Distance from the observer beyond which walkers step every lodMidEvery / lodFarEvery ticks, BU. */
  lodNearBU: 160,
  lodFarBU: 420,
  lodMidEvery: 2,
  lodFarEvery: 4,
  /**
   * On open ground (nearly level, no hard primitive within lodHardClearBU, so no thin sheet to tunnel through)
   * walker steps use this substep instead of the kernel's 0.25 BU; the kernel's guard still checks every step.
   */
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
  /** A trail sensor reading inside an avoid disc counts this much for autonomous ants (GDD 02 §12.2: x 0.1). */
  avoidTrailWeight: 0.1,

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

  // ---- micro-connections (GDD 04 §6.1) ----
  /** Clearance a caste needs in a gap, BU per BU of body length (PASS_CLEAR_K). */
  passClearK: 0.45,

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
  sepR: number; sepW: number; sepMax: number; sepNearGoal: number; floorW: number; wanderSigma: number; wanderPull: number; trailNoise: number;
  antReach: number; antAngle: number; trailGain: number; trailDetect: number; trailLostS: number; lodTrailMax: number;
  crumbSpacing: number; crumbTurnCos: number; crumbTurnMin: number; loopClose: number; shortcutN: number;
  shortcutLift: number; shortcutR: number; crumbReach: number; piNoise: number;
  wpReach: number; climbReach: number; fieldLook: number; entranceHandover: number; spread: number; elevated: number;
  brakeS: number; arriveTurnRadii: number; pivotCreep: number;
  routeSnap: number; routeGoal: number; direct: number; planBudget: number; planExpandBudget: number; stuckExplosionTicks: number; stuckExplosionFrac: number; stuckExplosionMin: number; retargetS: number; retarget: number;
  pointFieldMax: number; pointSeek: number; arriveStallS: number; ceilingUpY: number; dropAbove: number; dropBelow: number; pointFieldCell: number; pointFieldR: number; timeoutBase: number; timeoutMult: number; surfaceTol: number;
  stuckWindowS: number; stuckProgress: number; sidestepS: number; backoffS: number; relocateMax: number;
  episodesMax: number; relocateSteps: number; wanderStallS: number; wanderPivotS: number; wanderStallMax: number; pinnedS: number; pinnedUpY: number;
  lodNear: number; lodFar: number; lodMid: number; lodFarEvery: number; lodSubstep: number; lodHardClear: number;
  edgeMargin: number; edgeHard: number; edgeRepulse: number;
  avoidCost: number; avoidPad: number; avoidW: number; avoidTrailW: number;
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
    sepR: T.separationBU * bu, sepW: T.separationWeight, sepMax: T.separationMax, sepNearGoal: T.separationNearGoalBU * bu, floorW: T.preferFloorWeight,
    wanderSigma: T.wanderSigmaDeg * DEG, wanderPull: T.wanderPull, trailNoise: T.trailNoiseDeg * DEG,
    antReach: T.antennaReachBU * bu, antAngle: T.antennaAngleDeg * DEG, trailGain: T.trailTurnGain,
    trailDetect: T.trailDetect, trailLostS: T.trailLostS, lodTrailMax: T.lodTrailMaxEvery,
    crumbSpacing: T.crumbSpacingBU * bu, crumbTurnCos: Math.cos(T.crumbTurnDeg * DEG), crumbTurnMin: T.crumbTurnMinBU * bu,
    loopClose: T.loopCloseBU * bu, shortcutN: T.shortcutLookahead, shortcutLift: T.shortcutLiftBU * bu,
    shortcutR: T.shortcutRadiusBU * bu, crumbReach: T.crumbReachBU * bu, piNoise: T.piNoise,
    wpReach: T.waypointReachBU * bu, climbReach: T.climbReachBU * bu, fieldLook: T.fieldLookahead,
    entranceHandover: T.entranceHandoverBU * bu, spread: T.arrivalSpread, elevated: T.elevatedBU * bu,
    brakeS: T.arriveBrakeS, arriveTurnRadii: T.arriveTurnRadii, pivotCreep: T.arrivePivotCreep,
    routeSnap: T.routeSnapBU * bu, routeGoal: T.routeGoalBU * bu, direct: T.directBU * bu, planBudget: T.planBudget, planExpandBudget: T.planExpandBudget, stuckExplosionTicks: T.stuckExplosionS * 10, stuckExplosionFrac: T.stuckExplosionFrac, stuckExplosionMin: T.stuckExplosionMin,
    retargetS: T.retargetS, retarget: T.retargetBU * bu, pointFieldMax: T.pointFieldMax,
    pointSeek: T.pointSeekBU * bu, arriveStallS: T.arriveStallS, ceilingUpY: T.ceilingUpY, dropAbove: T.dropAboveBU * bu, dropBelow: T.dropBelowBU * bu,
    pointFieldCell: T.pointFieldCellBU * bu, pointFieldR: T.pointFieldRadiusBU * bu, timeoutBase: T.timeoutBaseS,
    timeoutMult: T.timeoutMult, surfaceTol: T.surfaceChangeTolBU * bu,
    stuckWindowS: T.stuckWindowS, stuckProgress: T.stuckProgressBU * bu, sidestepS: T.sidestepS, backoffS: T.backoffS,
    relocateMax: T.relocateMax, episodesMax: T.episodesMax, relocateSteps: T.relocateFieldSteps,
    wanderStallS: T.wanderStallS, wanderPivotS: T.wanderPivotS, wanderStallMax: T.wanderStallMax,
    pinnedS: T.pinnedS, pinnedUpY: T.pinnedUpY,
    lodNear: T.lodNearBU * bu, lodFar: T.lodFarBU * bu, lodMid: T.lodMidEvery, lodFarEvery: T.lodFarEvery,
    lodSubstep: T.lodCoarseSubstepBU * bu, lodHardClear: T.lodHardClearBU * bu,
    edgeMargin: T.edgeMarginBU * bu, edgeHard: T.edgeHardBU * bu, edgeRepulse: T.edgeRepulse,
    avoidCost: T.avoidCostMult, avoidPad: T.avoidSteerPadBU * bu, avoidW: T.avoidSteerWeight, avoidTrailW: T.avoidTrailWeight,
    latchTrigger: T.latchTriggerDeg * DEG, latchTriggerS: T.latchTriggerS, latchBreakCos: Math.cos(T.latchBreakDeg * DEG),
    latchMaxS: T.latchMaxS, latchLowMag: T.latchLowMag, latchLowMagS: T.latchLowMagS, rescueS: T.stuckRescueS,
    rescueDisp: T.rescueDispBU * bu, predictBlendS: T.predictBlendS, predictSnap: T.predictSnapBU * bu,
  };
  cache.set(bu, p);
  return p;
}

/** GDD 04 §6.1 PASS_CLEAR_K. */
export const PASS_CLEAR_K = LOCO_TUNING.passClearK;

/** Maximum sustained tilt (rad) on a surface of this grip (GDD 04 §3). */
export function tiltLimit(grip: number): number {
  const T = LOCO_TUNING;
  const deg = grip >= T.gripHigh ? T.tiltMaxHighGrip : grip >= T.gripMid ? T.tiltMaxMidGrip : T.tiltMaxLowGrip;
  return deg * DEG;
}
