// Blends between camera rigs over a duration (GDD 01 section 2): a smooth flight for short hops, a dip-fade for long
// ones, a short cross-fade in reduced motion. The destination pose is re-read every frame, so the blend lands on a
// moving rig without a pop.
import { v3Distance, v3Lerp, v3Normalize, v3Sub, vec3, type Vec3 } from '@/core';
import {
  CAM_REDUCED_CROSSFADE_S, CAM_SWITCH_BU_PER_S, CAM_SWITCH_DIP_HALF_S, CAM_SWITCH_FADE_DIST_BU, CAM_SWITCH_MAX_S, CAM_SWITCH_MIN_S,
} from './constants';
import { clampN, slerpUnit } from './frameMath';
import { copyPose, makePose, type CameraPose } from './types';

export type TransitionKind = 'fly' | 'dip' | 'crossfade';

export interface TransitionPlan {
  kind: TransitionKind;
  duration: number;
}

/** Duration = clamp(0.4 + d/300, 0.4, 0.9) s with d in BU; beyond 150 BU a dip-fade; reduced motion: 0.3 s fade. */
export function planTransition(from: CameraPose, to: CameraPose, bu: number, reducedMotion: boolean): TransitionPlan {
  if (reducedMotion) return { kind: 'crossfade', duration: CAM_REDUCED_CROSSFADE_S };
  const d = v3Distance(from.pos, to.pos) / bu;
  if (d > CAM_SWITCH_FADE_DIST_BU) return { kind: 'dip', duration: 2 * CAM_SWITCH_DIP_HALF_S };
  return { kind: 'fly', duration: clampN(CAM_SWITCH_MIN_S + d / CAM_SWITCH_BU_PER_S, CAM_SWITCH_MIN_S, CAM_SWITCH_MAX_S) };
}

export interface TransitionOutput {
  pose: CameraPose;
  /** Screen darkening 0..1 for dip / cross-fade transitions (the app draws a full-screen fade). */
  dip: number;
  done: boolean;
  /** Eased progress 0..1. */
  progress: number;
}

const smooth = (t: number) => t * t * (3 - 2 * t);

const _da = vec3(), _db = vec3(), _d = vec3();

/** Interpolates two poses: positions lerp, view direction and up slerp, look distance and lens lerp. */
export function blendPoses(out: CameraPose, a: CameraPose, b: CameraPose, t: number): CameraPose {
  v3Lerp(out.pos, a.pos, b.pos, t);
  v3Sub(_da, a.look, a.pos);
  const la = v3Normalize(_da, _da);
  v3Sub(_db, b.look, b.pos);
  const lb = v3Normalize(_db, _db);
  slerpUnit(_d, _da, _db, t);
  const l = la + (lb - la) * t;
  out.look.x = out.pos.x + _d.x * l; out.look.y = out.pos.y + _d.y * l; out.look.z = out.pos.z + _d.z * l;
  slerpUnit(out.up, a.up, b.up, t);
  v3Normalize(out.up, out.up);
  out.fov = a.fov + (b.fov - a.fov) * t;
  // log-space blend keeps near/far ratios sane across very different rigs
  out.near = Math.exp(Math.log(a.near) + (Math.log(b.near) - Math.log(a.near)) * t);
  out.far = Math.max(a.far, b.far);
  return out;
}

export class CameraTransition {
  private from: CameraPose = makePose();
  private t = 0;
  private plan: TransitionPlan = { kind: 'fly', duration: 0 };
  private active = false;
  readonly out: TransitionOutput = { pose: makePose(), dip: 0, done: true, progress: 1 };

  get running(): boolean {
    return this.active;
  }

  /** Kind of the running (or last) transition. */
  get kind(): TransitionKind {
    return this.plan.kind;
  }

  start(from: CameraPose, plan: TransitionPlan): void {
    copyPose(this.from, from);
    this.plan = plan;
    this.t = 0;
    this.active = plan.duration > 0;
    this.out.done = !this.active;
  }

  /** Advance with the destination rig's current pose. When not running, passes the destination through. */
  update(dt: number, to: CameraPose): TransitionOutput {
    const o = this.out;
    if (!this.active) {
      copyPose(o.pose, to);
      o.dip = 0; o.done = true; o.progress = 1;
      return o;
    }
    this.t = Math.min(this.plan.duration, this.t + Math.max(0, dt));
    const k = this.plan.duration > 0 ? this.t / this.plan.duration : 1;
    if (this.plan.kind === 'fly') {
      o.progress = smooth(k);
      blendPoses(o.pose, this.from, to, o.progress);
      o.dip = 0;
    } else {
      // first half: fade out on the old pose; second half: fade in on the new one
      o.progress = k;
      copyPose(o.pose, k < 0.5 ? this.from : to);
      o.dip = this.plan.kind === 'dip' ? 1 - Math.abs(1 - 2 * k) : 0.5 * (1 - Math.abs(1 - 2 * k));
    }
    if (k >= 1) { this.active = false; o.done = true; o.dip = 0; }
    else o.done = false;
    return o;
  }
}

/** Distance between two poses used by tests (position + look direction). */
export function poseDistance(a: CameraPose, b: CameraPose): number {
  v3Sub(_da, a.look, a.pos); v3Normalize(_da, _da);
  v3Sub(_db, b.look, b.pos); v3Normalize(_db, _db);
  return v3Distance(a.pos, b.pos) + Math.acos(clampN(_da.x * _db.x + _da.y * _db.y + _da.z * _db.z, -1, 1));
}

export type { Vec3 };
