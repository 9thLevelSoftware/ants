// Locomotion's own per-walker working state, persisted inside NavState (`nav.loco`, optional, created on the first
// request). Plain data only (numbers, strings, Vec3), so saves and determinism cover it. NavState itself keeps the
// public request: mode (current leg), dest / destKind / destId (final goal), path, field, route, status.

import type { Vec3 } from '@/core/math/vec3';
import type { Walker } from '@/sim/types';

/** What the walker was asked to do. */
export type LocoRequest = 'none' | 'goto' | 'wander' | 'trail' | 'retrace' | 'field' | 'climb';
/** Speed request: species cruise, run (sprint), or a fixed mm/s value. */
export type LocoSpeedKind = 'cruise' | 'run' | 'fixed';

export interface NavScratch {
  req: LocoRequest;
  /** Tick the request was made; timeout tick (-1 none). */
  reqTick: number;
  timeoutTick: number;
  /** Final goal after spreading / snapping, mm (the request's own point is nav.dest). */
  goal: Vec3;
  /** Nest the goal lies in, -1 on the surface. */
  goalNest: number;
  /** Nest-nav field leading to the goal inside goalNest ('' = point goal without a field yet). */
  goalField: string;
  /** Field followed by the current 'field' leg ('' none). */
  legField: string;
  /** The current field leg leads out of the nest (exit or seal field). */
  legExit: boolean;
  /** Entrance of the current hand-over (surface leg to it, or exit leg out of it), -1 none. */
  entranceId: number;
  /** Climb leg: direction along the route (+1 towards the top, -1 down) and the node index where it ends. */
  routeDir: number;
  routeEnd: number;
  /** After the climb leg, seek the goal (1) or replan (0). */
  routeThenSeek: number;
  /** Target of a 'seek' leg, mm. */
  seekTarget: Vec3;
  /** Surface leg following a cached flow field (key; '' = waypoints in nav.path). */
  flowKey: string;
  /** Nest the walker was in when the current leg was planned (a change triggers a replan). */
  legNest: number;
  /** Replans already made this tick (bounded). */
  replansThisTick: number;
  replanTickMark: number;
  /** Speed request. */
  speedKind: LocoSpeedKind;
  speedMult: number;
  speedFixed: number;
  /** Last planning tick; -1 = plan on the next tick. */
  planTick: number;
  /** Last time a moving target was re-resolved. */
  retargetTick: number;
  // stuck detection and the recovery ladder
  /** Best (lowest) progress metric of the current leg, mm, and the tick it last improved. */
  best: number;
  bestTick: number;
  /** Position at bestTick (displacement-based progress of wander / trail requests). */
  anchor: Vec3;
  /** Ladder stage of the current stuck episode (0 = not stuck) and the tick the current stage ends. */
  ladder: number;
  ladderUntil: number;
  /** Sidestep side (+1 / -1), alternating. */
  side: number;
  episodes: number;
  relocations: number;
  // wander
  center: Vec3;
  radius: number;
  // trail
  trailColony: number;
  trailChannel: string;
  /** +1 outbound (away from home), -1 inbound, 0 either. */
  trailDir: number;
  /** Game seconds without a followable reading. */
  trailLostS: number;
  /** The walker already turned round to face the requested trail direction (1). */
  trailTurned: number;
  // retrace
  crumbIdx: number;
  // possessed ant
  latch: number;
  latchAngle: number;
  latchS: number;
  lowMagS: number;
  /** Up vector at the start of the latch trigger window and its age, s. */
  upRef: Vec3;
  upRefAge: number;
  /** Latched desired direction (tangent, parallel-transported with the ant's frame). */
  latchDir: Vec3;
  /** Last intent direction (world), for the latch break test. */
  lastDir: Vec3;
  pivot: number;
  rescueS: number;
  rescueFrom: Vec3;
  // path integration bookkeeping (ants): last position integrated (valid when piValid = 1)
  piPos: Vec3;
  piValid: number;
}

const v = (x = 0, y = 0, z = 0): Vec3 => ({ x, y, z });

/** "No progress measured yet" (finite, so states stay JSON-safe). */
export const NO_PROGRESS = 1e30;

export function newScratch(): NavScratch {
  return {
    req: 'none', reqTick: 0, timeoutTick: -1, goal: v(), goalNest: -1, goalField: '', legField: '', legExit: false,
    entranceId: -1, routeDir: 1, routeEnd: -1, routeThenSeek: 0, seekTarget: v(), flowKey: '', legNest: -1,
    replansThisTick: 0, replanTickMark: -1, speedKind: 'cruise', speedMult: 1, speedFixed: 0,
    planTick: -1, retargetTick: 0, best: NO_PROGRESS, bestTick: 0, anchor: v(), ladder: 0, ladderUntil: 0, side: 1, episodes: 0,
    relocations: 0, center: v(), radius: 0, trailColony: -1, trailChannel: '', trailDir: 0, trailLostS: 0, trailTurned: 0,
    crumbIdx: -1, latch: 0, latchAngle: 0, latchS: 0, lowMagS: 0, upRef: v(0, 1, 0), upRefAge: -1, latchDir: v(1, 0, 0), lastDir: v(),
    pivot: 0, rescueS: 0, rescueFrom: v(), piPos: v(), piValid: 0,
  };
}

/** The walker's scratch, created on first use. */
export function scratchOf(w: Walker): NavScratch {
  let s = w.nav.loco;
  if (!s) {
    s = newScratch();
    w.nav.loco = s;
  }
  return s;
}

/** Numeric id of a walker (ants and creatures have one), 0 otherwise; used for deterministic noise and staggering. */
export function walkerId(w: Walker): number {
  const id = (w as Walker & { id?: number }).id;
  return typeof id === 'number' ? id : 0;
}
