// Surface-walker tuning, in BU so it scales with the species (values that worked in the nest spike at BU = 4,
// docs/research/spike-nest.md §4). Physical constants (gravity, drag) are absolute.
// Re-exported from src/sim/balance (balance/kernel.ts).

export const WALKER_TUNING = {
  /** Default level-set offset (body-centre height above the surface). The walker's own footOffset wins. */
  footOffsetBU: 0.15,
  /** Longest substep: half a voxel, below 2 x foot offset (no tunnelling through thin sheets). */
  maxSubstepBU: 0.25,
  /**
   * Longest distance one walkerStep call travels (bounds the substep loop against bogus speed * dt). Legit
   * calls stay far below it: a sprint of 25 BU/s over a 0.25 s frame hitch is 6.25 BU.
   */
  maxStepDistBU: 8,
  /** Newton projection per substep. */
  projIters: 6,
  projTolBU: 0.001,
  /** A substep is accepted when its projection error is below this. */
  acceptTolBU: 0.0075,
  /** Projection step clamp: 1.5 x substep + slack. */
  projSlackBU: 0.05,
  /** Chord of an accepted substep: at most chordFactor x substep + chordSlack. */
  chordFactor: 2.5,
  chordSlackBU: 0.025,
  /** The chord midpoint must have f above this fraction of the foot offset (catches the far side of a sheet). */
  midMinFoot: 0.2,
  /** Reject a substep whose normal turns by more than acos(-0.35) = 110 degrees. */
  maxTurnCos: -0.35,
  /** Halvings of a rejected substep before the walker reports 'blocked'. */
  substepRetries: 3,
  /** Re-project at the start of a step when |f - foot| exceeds this (surface changed under the walker). */
  reprojTolBU: 0.005,
  /** surfaceChanged(): how far the re-projection may move the walker before it lets go instead. */
  reattachMaxBU: 0.375,
  /** A desired direction steers the heading only if its tangent part is at least this fraction of it. */
  minSteer: 0.25,
  /** Fall: gravity (mm/s^2) and linear drag (1/s); terminal velocity = gravity / drag ~ 700 mm/s. */
  gravity: 9810,
  drag: 14,
  /** Fall sweep sphere radius as a fraction of the foot offset (must stay below 1 so a resting walker can leave). */
  fallRadiusFoot: 0.9,
  /** Push away from the surface on let-go, BU/s. */
  letGoPushBU: 6,
  /** A falling walker more than this far below the lowest terrain point is out of the world. */
  maxFallBelowBU: 256,
  /** walkerPlace(): sphere-trace distance along the hint direction when the field is flat at the start point. */
  placeTraceBU: 100,
  /** Stride length for the gait phase (one full cycle per stride), BU. */
  strideBU: 0.5,
  /** Invariant guard: after a step f(pos) must be at least this fraction of the foot offset. */
  minClearanceFoot: 0.3,
} as const;

export interface WalkerParams {
  footOffset: number; maxSubstep: number; maxStepDist: number; projIters: number; projTol: number; acceptTol: number; projSlack: number;
  chordFactor: number; chordSlack: number; midMinFoot: number; maxTurnCos: number; substepRetries: number;
  reprojTol: number; reattachMax: number; minSteer: number; gravity: number; drag: number; fallRadiusFoot: number;
  letGoPush: number; maxFallBelow: number; placeTrace: number; stride: number; minClearanceFoot: number;
}

const cache = new Map<number, WalkerParams>();

/** Walker parameters in mm for a body unit (memoised per BU value; treat as read-only). */
export function walkerParamsForBU(bu: number): WalkerParams {
  const hit = cache.get(bu);
  if (hit) return hit;
  const T = WALKER_TUNING;
  const p: WalkerParams = {
    footOffset: T.footOffsetBU * bu, maxSubstep: T.maxSubstepBU * bu, maxStepDist: T.maxStepDistBU * bu, projIters: T.projIters, projTol: T.projTolBU * bu,
    acceptTol: T.acceptTolBU * bu, projSlack: T.projSlackBU * bu, chordFactor: T.chordFactor, chordSlack: T.chordSlackBU * bu,
    midMinFoot: T.midMinFoot, maxTurnCos: T.maxTurnCos, substepRetries: T.substepRetries, reprojTol: T.reprojTolBU * bu,
    reattachMax: T.reattachMaxBU * bu, minSteer: T.minSteer, gravity: T.gravity, drag: T.drag, fallRadiusFoot: T.fallRadiusFoot,
    letGoPush: T.letGoPushBU * bu, maxFallBelow: T.maxFallBelowBU * bu, placeTrace: T.placeTraceBU * bu, stride: T.strideBU * bu,
    minClearanceFoot: T.minClearanceFoot,
  };
  cache.set(bu, p);
  return p;
}
