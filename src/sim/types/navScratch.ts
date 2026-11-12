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
}
