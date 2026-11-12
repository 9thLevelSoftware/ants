// Surface-walker kinematics shared by ants and creatures (docs/01-design-seed.md §3, contracts guidance §4).
// Behaviours never move a walker directly: they call locomotion (navTo, navStop, navWander, navFollowTrail,
// navRetrace, ...) and poll `nav.status`. Only src/sim/locomotion writes pos/up/fwd.

import type { Vec3 } from '@/core/math/vec3';
import type { NestFieldKind } from './ids/nest';
import type { TargetKind } from './refs';
import type { NavScratch } from '@/sim/locomotion/scratch';

export const WALKER_MEDIA = ['surface', 'cavity', 'air', 'water'] as const;
export type WalkerMedium = (typeof WALKER_MEDIA)[number];

export const NAV_MODES = ['none', 'seek', 'path', 'field', 'trail', 'retrace', 'climb', 'wander'] as const;
export type NavMode = (typeof NAV_MODES)[number];

export const NAV_STATUSES = ['idle', 'moving', 'arrived', 'failed'] as const;
export type NavStatus = (typeof NAV_STATUSES)[number];

/** Steering request and its status. Owned by locomotion; behaviours set it only through locomotion functions. */
export interface NavState {
  mode: NavMode;
  /** Destination, mm. */
  dest: Vec3;
  /** What the destination is (for re-resolving moving targets). */
  destKind: TargetKind;
  /** Entity id of the destination, -1 for a plain point. */
  destId: number;
  /** Arrival radius, mm. */
  arriveDist: number;
  /** Waypoints, mm (coarse planner or climb route); null when not path-following. */
  path: Vec3[] | null;
  /** Index of the next waypoint in `path`. */
  pathIdx: number;
  /** Nest whose distance field is followed (mode 'field'), -1 otherwise. */
  fieldNest: number;
  /** Target id within that field (chamber id or plan id; -1 for exit/seal fields). */
  fieldTarget: number;
  /** Which distance field (D_exit, D_seal, D_ch, D_plan). Additive to the guidance shape. */
  fieldKind: NestFieldKind;
  status: NavStatus;
  /** Consecutive ticks with almost no progress. */
  stuckTicks: number;
  /** Desired unit direction this tick (world space), written by steering. */
  desiredDir: Vec3;
  /** Desired speed, mm/s. */
  desiredSpeed: number;
  /** Climb route id being followed (mode 'climb'), -1 otherwise. Additive. */
  routeId: number;
  /**
   * Locomotion's own working state (trip legs, stuck ladder, wander region, trail, latch): plain data, created by
   * locomotion on the first request and never read by other modules. Additive (loco).
   */
  loco?: NavScratch;
}

/** Kinematic state on the level set f(p) = footOffset. */
export interface Walker {
  /** mm */
  pos: Vec3;
  /** Unit surface normal at pos. */
  up: Vec3;
  /** Unit tangent heading. */
  fwd: Vec3;
  /** Previous tick's pos/up/fwd, for render interpolation. */
  prevPos: Vec3;
  prevUp: Vec3;
  prevFwd: Vec3;
  /** mm/s actually travelled last tick. */
  speed: number;
  /** mm above the surface (level-set offset). */
  footOffset: number;
  /** Collision radius, mm (narrow passages and thief tunnels test against it). Additive. */
  radius: number;
  medium: WalkerMedium;
  /** mm/s; used only while medium === 'air' (falling / flying) or drifting in water. */
  vel: Vec3;
  /** Stride phase 0..1, advanced by distance / stride length. */
  gait: number;
  nav: NavState;
}
