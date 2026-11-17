// Persisted shape of locomotion's per-walker working state (`NavState.loco`). It lives in the contracts so the
// save format does not depend on an implementation module (moved here from src/sim/locomotion/scratch.ts by the
// Stage 1A gate; that file re-exports it and keeps the runtime helpers). Plain data only.

import type { Vec3 } from '@/core/math/vec3';

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
  /** The seek leg heads for the trip's final goal (1): it never ends by itself, only tripArrived ends it. */
  seekFinal: number;
  /** Surface leg following a cached flow field (key; '' = waypoints in nav.path) and the nest it leads into. */
  flowKey: string;
  flowNest: number;
  /** Avoid-disc signature the current leg was planned with (a change triggers a replan). */
  discSig: number;
  /** Nest the walker was in when the current leg was planned (a change triggers a replan). */
  legNest: number;
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
  /** Open-ground test cache: where it was made (x, z, mm) and its result (1 open, 0 not, -1 none yet). */
  openX: number;
  openZ: number;
  open: number;
  /**
   * AI speed cache (sim-fix-ants: the speed factors - temperature, health, nest crowding - change slowly): the
   * speed, mm/s, the tick it was computed and whether the walker carried something then (1/0). Additive.
   */
  spdV?: number;
  spdTick?: number;
  spdCarry?: number;
  /**
   * loco-fix3 (additive): the current seek leg aims at its target in 3D (1: a walker high on a stem or trunk heading
   * for the ground below it, or for a goal higher up the same object), not in plan view.
   */
  seekDown?: number;
  /**
   * loco-fix3 (additive): relocation memory of the walker, kept across requests: the tick and place (mm) of its
   * last relocation, where it was put (relocTo), and how many escalations (let-go or 'stuck-repeat' failure) it had
   * since (0 = none). Stuck again within LOCO_TUNING.relocRepeatBU of a remembered place (relocHist below, no time
   * limit) escalates instead of relocating.
   */
  relocTick?: number;
  relocFrom?: Vec3;
  relocTo?: Vec3;
  relocRepeat?: number;
  /**
   * loco-fix3 review (additive): the walker's last LOCO_TUNING.relocMemory relocations, oldest first, flat
   * [fromX, fromY, fromZ, toX, toY, toZ, ...] mm, kept without a time limit (a walker is never relocated twice from
   * one place; relocFrom / relocTo above repeat the newest), and the tick of its last let-go at a remembered place.
   */
  relocHist?: number[];
  relocDropTick?: number;
  /**
   * loco-fix3 (additive): the point a goto request was made with (before snapping and spreading), so that the same
   * request made again while it runs (a behaviour re-issuing it on each think) keeps its stuck ladder.
   */
  reqDest?: Vec3;
  /**
   * loco-fix3 review (additive): distance, mm, the walker could have covered at its commanded speed since tick
   * stallFrom (= bestTick when it was counted; a new bestTick restarts it). A stall needs this to reach
   * LOCO_TUNING.stuckTravelBU, so a walker slowed by the cold is not taken for a stuck one (one slower than
   * stuckCrawlBUs counts nothing).
   */
  stallTravel?: number;
  stallFrom?: number;
}
