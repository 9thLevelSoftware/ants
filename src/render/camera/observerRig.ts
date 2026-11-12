// Observer camera (GDD 01 6.6): free fly with world up, bounded and collision-checked, or an orbit that follows an
// entity. Holds 2 s at the last position when the followed entity disappears, then returns to free fly.
import { v3AddScaled, v3Copy, v3Distance, v3Normalize, v3Set, v3Sub, vec3, type Vec3 } from '@/core';
import {
  CAM_FAR_BU, CAM_OBSERVER_RADIUS_BU, CAM_PUSHOUT_TAU, OBS_ACCEL_TAU, OBS_BOUNDS_MARGIN_BU, OBS_FAST_MULT, OBS_FOLLOW_DIST_L, OBS_FOLLOW_LOSS_HOLD_S,
  OBS_FOV_DEG, OBS_MAX_ALTITUDE_BU, OBS_PITCH_FOLLOW_DEG, OBS_PITCH_FREE_DEG, OBS_SPEED_BASE_BU, OBS_SPEED_CAP_BU, OBS_SPEED_PER_HEIGHT,
} from './constants';
import { clampN, DEG, smoothK } from './frameMath';
import { cameraNear } from './near';
import { makePose, type CameraPose, type CameraTarget, type OrbitInput, type TraceFn } from './types';

export interface ObserverOptions {
  bu: number;
  /** World extent along X and Z in mm ([0, worldSize]). */
  worldSize: number;
  fovOffset?: number;
  far?: number;
}

export interface ObserverInput extends OrbitInput {
  /** Horizontal fly, camera-relative: x right, y forward (-1..1). */
  move: { x: number; y: number };
  /** Vertical: +1 up, -1 down. */
  vertical: number;
  fast: boolean;
}

export interface ObserverEnv {
  trace: TraceFn;
  /** Terrain height under (x, z) in mm, used for altitude and the speed law. */
  groundHeight: (x: number, z: number) => number;
  /** Length of the followed entity in BU (default 1). */
  followL?: number;
}

const DOWN: Vec3 = { x: 0, y: -1, z: 0 };

export class ObserverRig {
  readonly opts: Required<ObserverOptions>;
  readonly out: CameraPose & { mode: 'free' | 'follow' | 'hold'; focusDistance: number } = { ...makePose(), mode: 'free', focusDistance: 0 };
  readonly pos = vec3();
  yaw = 0; // radians, 0 = looking along -Z
  pitch = -20 * DEG;
  private vel = vec3();
  private follow: CameraTarget | null = null;
  private lastFollowPos = vec3();
  private holdT = -1;
  private followDistL = OBS_FOLLOW_DIST_L[1];
  private followDist = 0;
  private tmp = vec3(); private fwd = vec3(); private step = vec3();

  constructor(opts: ObserverOptions) {
    this.opts = { fovOffset: 0, far: CAM_FAR_BU * opts.bu, ...opts };
  }

  get radiusMm(): number { return CAM_OBSERVER_RADIUS_BU * this.opts.bu; }

  /** Place the free camera (e.g. from the previous view's pose). */
  setPose(pos: Vec3, look: Vec3): void {
    v3Copy(this.pos, pos);
    v3Sub(this.tmp, look, pos);
    v3Normalize(this.tmp, this.tmp);
    this.yaw = Math.atan2(-this.tmp.x, -this.tmp.z);
    this.pitch = Math.asin(clampN(this.tmp.y, -1, 1));
    v3Set(this.vel, 0, 0, 0);
  }

  /** Follow an entity (orbit around it) or pass null when it was removed. */
  setFollow(target: CameraTarget | null): void {
    if (target) {
      if (!this.follow) this.followDist = 0;
      this.follow = target;
      this.holdT = -1;
      return;
    }
    if (this.follow) { v3Copy(this.lastFollowPos, this.follow.pos); this.holdT = 0; }
    this.follow = null;
  }

  /**
   * The player stopped following (free fly chosen): no follow-loss hold, the free camera starts from the current
   * pose. setFollow(null) is for an entity that disappeared (it holds 2 s first).
   */
  stopFollow(): void {
    this.follow = null;
    this.holdT = -1;
    v3Set(this.vel, 0, 0, 0);
  }

  update(dt: number, input: ObserverInput, env: ObserverEnv): this['out'] {
    dt = Math.max(0, Math.min(dt, 0.25));
    const bu = this.opts.bu, o = this.out;
    this.yaw -= input.yawDeg * DEG;
    if (this.follow || this.holdT >= 0) return this.updateFollow(dt, input, env);
    this.pitch = clampN(this.pitch + input.pitchDeg * DEG, OBS_PITCH_FREE_DEG[0] * DEG, OBS_PITCH_FREE_DEG[1] * DEG);
    // speed law v = 4 + 1.2 h BU/s (h above the surface), fast x4, cap 800 BU/s; velocity eased (tau 0.15 s)
    const h = Math.max(0, (this.pos.y - env.groundHeight(this.pos.x, this.pos.z)) / bu);
    const speed = Math.min(OBS_SPEED_CAP_BU, (OBS_SPEED_BASE_BU + OBS_SPEED_PER_HEIGHT * h) * (input.fast ? OBS_FAST_MULT : 1)) * bu;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    // forward on the ground plane (-Z at yaw 0) and right (+X at yaw 0)
    const wx = -sy * input.move.y + cy * input.move.x, wz = -cy * input.move.y - sy * input.move.x;
    const k = smoothK(dt, OBS_ACCEL_TAU);
    this.vel.x += (wx * speed - this.vel.x) * k;
    this.vel.y += (input.vertical * speed - this.vel.y) * k;
    this.vel.z += (wz * speed - this.vel.z) * k;
    this.moveWithCollision(dt, env.trace);
    // bounds: horizontal margin and altitude cap above the terrain
    const m = OBS_BOUNDS_MARGIN_BU * bu;
    this.pos.x = clampN(this.pos.x, -m, this.opts.worldSize + m);
    this.pos.z = clampN(this.pos.z, -m, this.opts.worldSize + m);
    this.pos.y = Math.min(this.pos.y, env.groundHeight(this.pos.x, this.pos.z) + OBS_MAX_ALTITUDE_BU * bu);
    v3Copy(o.pos, this.pos);
    this.lookDir(this.fwd);
    v3AddScaled(o.look, this.pos, this.fwd, 10 * bu);
    v3Set(o.up, 0, 1, 0);
    o.fov = OBS_FOV_DEG + this.opts.fovOffset;
    const ground = env.trace(this.pos, DOWN, 2000 * bu, 0);
    o.near = cameraNear(Math.max(ground, this.radiusMm), bu, this.radiusMm * 4);
    o.far = this.opts.far;
    o.mode = 'free';
    o.focusDistance = env.trace(this.pos, this.fwd, 2000 * bu, 0);
    return o;
  }

  private lookDir(out: Vec3): Vec3 {
    const cp = Math.cos(this.pitch);
    return v3Set(out, -Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  /** Axis-separated moves so the camera slides along surfaces instead of sticking; never enters solid. */
  private moveWithCollision(dt: number, trace: TraceFn): void {
    const r = this.radiusMm;
    for (const axis of ['x', 'y', 'z'] as const) {
      const d = this.vel[axis] * dt;
      if (d === 0) continue;
      v3Set(this.step, 0, 0, 0);
      this.step[axis] = Math.sign(d);
      const free = trace(this.pos, this.step, Math.abs(d) + r * 0.1, r);
      const moved = Math.min(Math.abs(d), Math.max(0, free - r * 0.05));
      this.pos[axis] += Math.sign(d) * moved;
      if (moved < Math.abs(d)) this.vel[axis] = 0;
    }
  }

  private updateFollow(dt: number, input: ObserverInput, env: ObserverEnv): this['out'] {
    const o = this.out, bu = this.opts.bu, L = (env.followL ?? 1) * bu, r = this.radiusMm;
    if (!this.follow) {
      this.holdT += dt;
      if (this.holdT >= OBS_FOLLOW_LOSS_HOLD_S) {
        this.holdT = -1;
        this.setPose(o.pos, o.look);
      }
      o.mode = 'hold';
      return o;
    }
    // OBS_PITCH_FOLLOW_DEG is the camera's ELEVATION above the subject (GDD 01 6.6); `pitch` is the look pitch, and
    // the camera sits opposite the look direction, so elevation = -pitch
    this.pitch = clampN(this.pitch + input.pitchDeg * DEG, -OBS_PITCH_FOLLOW_DEG[1] * DEG, -OBS_PITCH_FOLLOW_DEG[0] * DEG);
    this.followDistL = clampN(this.followDistL * Math.exp(input.zoomLog), OBS_FOLLOW_DIST_L[0], OBS_FOLLOW_DIST_L[2]);
    const centre = v3AddScaled(this.tmp, this.follow.pos, this.follow.up, 0.5 * L);
    // orbit direction: from the centre back towards the camera (opposite the look direction)
    this.lookDir(this.fwd);
    this.fwd.x = -this.fwd.x; this.fwd.y = -this.fwd.y; this.fwd.z = -this.fwd.z;
    const want = this.followDistL * L;
    const free = env.trace(centre, this.fwd, want, r);
    const allowed = Math.max(0, Math.min(want, free - r * 0.05));
    if (allowed < this.followDist || this.followDist === 0) this.followDist = allowed;
    else this.followDist += (allowed - this.followDist) * smoothK(dt, CAM_PUSHOUT_TAU);
    v3AddScaled(this.pos, centre, this.fwd, this.followDist);
    v3Copy(o.pos, this.pos);
    v3Copy(o.look, centre);
    v3Set(o.up, 0, 1, 0);
    o.fov = OBS_FOV_DEG + this.opts.fovOffset;
    o.near = cameraNear(this.followDist, bu, r);
    o.far = this.opts.far;
    o.mode = 'follow';
    o.focusDistance = v3Distance(o.pos, centre);
    return o;
  }
}
