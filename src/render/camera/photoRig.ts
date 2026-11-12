// Photo mode camera (GDD 01 6.9): free fly from the entry pose, collision with f, soft wall at PHOTO_RADIUS around
// the entry point, and lens controls (focal length / FOV, focus distance, aperture -> bokeh, exposure, roll).
import { v3AddScaled, v3Copy, v3Distance, v3Normalize, v3Set, v3Sub, vec3, type Vec3 } from '@/core';
import {
  PHOTO_BOKEH_K, PHOTO_COLLISION_BU, PHOTO_EXPOSURE_EV, PHOTO_EXPOSURE_STEP_EV, PHOTO_FAST_MULT, PHOTO_FOCAL_MM, PHOTO_FOCUS_BU, PHOTO_F_STOPS,
  PHOTO_MAX_RADIUS_BU, PHOTO_ROLL_DEG, PHOTO_ROLL_DEG_S, PHOTO_SENSOR_HALF_HEIGHT_MM, PHOTO_SLOW_MULT, PHOTO_SPEED_BU_S,
} from './constants';
import { clampN, DEG, rotateAboutAxis, smoothK } from './frameMath';
import { cameraNear } from './near';
import { copyPose, makePose, type CameraPose, type OrbitInput, type TraceFn } from './types';

export interface PhotoInput extends OrbitInput {
  move: { x: number; y: number };
  vertical: number;
  /** Natural-log focal step (positive = longer lens / narrower FOV). */
  focalLog: number;
  focusLog: number;
  apertureSteps: number;
  exposureSteps: number;
  /** -1 / 0 / +1 roll direction while held. */
  roll: number;
  /** Shift (x PHOTO_FAST_MULT) and Ctrl (x PHOTO_SLOW_MULT) speed modifiers. */
  fast?: boolean;
  slow?: boolean;
}

/** Vertical FOV (degrees) of a full-frame-equivalent focal length (GDD 08 7.9), and back. */
export function fovForFocal(focalMm: number): number {
  return (2 * Math.atan(PHOTO_SENSOR_HALF_HEIGHT_MM / focalMm)) / DEG;
}
export function focalForFov(fovDeg: number): number {
  return PHOTO_SENSOR_HALF_HEIGHT_MM / Math.tan((fovDeg * DEG) / 2);
}

const FOV_RANGE: [number, number] = [fovForFocal(PHOTO_FOCAL_MM[1]), fovForFocal(PHOTO_FOCAL_MM[0])];
const LAST_STOP = PHOTO_F_STOPS.length - 1;

/** f-number at a continuous aperture position (0 = widest stop), geometric between neighbouring stops. */
export function fNumberAt(position: number): number {
  const p = clampN(Number.isFinite(position) ? position : 0, 0, LAST_STOP);
  const i = Math.floor(p);
  if (i >= LAST_STOP || p === i) return PHOTO_F_STOPS[i]; // exactly on a stop: no rounding noise
  return PHOTO_F_STOPS[i] * Math.pow(PHOTO_F_STOPS[i + 1] / PHOTO_F_STOPS[i], p - i);
}

/** Finite or 0 (an analogue input that went NaN must not poison the rig state). */
const num = (v: number | undefined): number => (v !== undefined && Number.isFinite(v) ? v : 0);

export interface PhotoOutput extends CameraPose {
  /** Depth of field for the post chain (mm and bokeh scale). */
  dof: { focusDistance: number; focusRange: number; bokehScale: number };
  exposureEV: number;
  rollDeg: number;
  fNumber: number;
  /** Full-frame-equivalent focal length (mm) of the current FOV. */
  focalMm: number;
}

export class PhotoRig {
  readonly out: PhotoOutput = { ...makePose(), dof: { focusDistance: 100, focusRange: 60, bokehScale: 3.2 }, exposureEV: 0, rollDeg: 0, fNumber: 2.8, focalMm: 50 };
  readonly pos = vec3();
  private entry = vec3();
  yaw = 0;
  pitch = 0;
  roll = 0;
  fov = 50;
  focusMm = 100;
  /** Continuous aperture position over PHOTO_F_STOPS (2 = f/2.8). */
  apertureIndex = 2;
  exposureEV = 0;
  speedBU = PHOTO_SPEED_BU_S;
  private tmp = vec3(); private fwd = vec3(); private step = vec3();
  private origin: CameraPose = makePose();

  constructor(readonly bu: number) {}

  /** Start from the current camera pose; `exit()` gives it back. */
  enter(pose: CameraPose): void {
    copyPose(this.origin, pose);
    v3Copy(this.pos, pose.pos);
    v3Copy(this.entry, pose.pos);
    v3Sub(this.tmp, pose.look, pose.pos);
    this.focusMm = clampN(v3Normalize(this.tmp, this.tmp), PHOTO_FOCUS_BU[0] * this.bu, PHOTO_FOCUS_BU[1] * this.bu);
    this.yaw = Math.atan2(-this.tmp.x, -this.tmp.z);
    this.pitch = Math.asin(clampN(this.tmp.y, -1, 1));
    this.roll = 0;
    this.fov = clampN(pose.fov, FOV_RANGE[0], FOV_RANGE[1]);
    this.exposureEV = 0;
  }

  /** The pose to return to on exit (GDD: back to the origin view and pose). */
  exitPose(): CameraPose {
    return this.origin;
  }

  /** Aperture slider: set the f-number directly (clamped to f/1.4 .. f/22). */
  setFNumber(n: number): void {
    if (!Number.isFinite(n)) return;
    const f = clampN(n, PHOTO_F_STOPS[0], PHOTO_F_STOPS[LAST_STOP]);
    let i = 0;
    while (i < LAST_STOP - 1 && PHOTO_F_STOPS[i + 1] < f) i++;
    this.apertureIndex = i + Math.log(f / PHOTO_F_STOPS[i]) / Math.log(PHOTO_F_STOPS[i + 1] / PHOTO_F_STOPS[i]);
  }

  /** Autofocus on a clicked point. */
  focusAt(p: Vec3): void {
    this.focusMm = clampN(v3Distance(p, this.pos), PHOTO_FOCUS_BU[0] * this.bu, PHOTO_FOCUS_BU[1] * this.bu);
  }

  update(dt: number, input: PhotoInput, trace: TraceFn): PhotoOutput {
    dt = Math.max(0, Math.min(dt, 0.25));
    const bu = this.bu, o = this.out, r = PHOTO_COLLISION_BU * bu;
    this.yaw -= num(input.yawDeg) * DEG;
    this.pitch = clampN(this.pitch + num(input.pitchDeg) * DEG, -89 * DEG, 89 * DEG);
    this.roll = clampN(this.roll + num(input.roll) * PHOTO_ROLL_DEG_S * dt, PHOTO_ROLL_DEG[0], PHOTO_ROLL_DEG[1]);
    // focal length: the log step acts on the focal length (longer lens = narrower FOV)
    this.fov = clampN(fovForFocal(focalForFov(this.fov) * Math.exp(num(input.focalLog))), FOV_RANGE[0], FOV_RANGE[1]);
    this.focusMm = clampN(this.focusMm * Math.exp(num(input.focusLog)), PHOTO_FOCUS_BU[0] * bu, PHOTO_FOCUS_BU[1] * bu);
    this.apertureIndex = clampN(this.apertureIndex + num(input.apertureSteps), 0, LAST_STOP);
    this.exposureEV = clampN(this.exposureEV + num(input.exposureSteps) * PHOTO_EXPOSURE_STEP_EV, PHOTO_EXPOSURE_EV[0], PHOTO_EXPOSURE_EV[1]);
    // fly
    const cp = Math.cos(this.pitch);
    v3Set(this.fwd, -Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    const mult = input.fast ? PHOTO_FAST_MULT : input.slow ? PHOTO_SLOW_MULT : 1;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw), v = this.speedBU * mult * bu * dt;
    const dx = (this.fwd.x * input.move.y + cy * input.move.x) * v;
    const dy = (this.fwd.y * input.move.y + input.vertical) * v;
    const dz = (this.fwd.z * input.move.y - sy * input.move.x) * v;
    for (const [axis, d] of [['x', dx], ['y', dy], ['z', dz]] as const) {
      if (d === 0) continue;
      v3Set(this.step, 0, 0, 0);
      this.step[axis] = Math.sign(d);
      const free = trace(this.pos, this.step, Math.abs(d) + r * 0.1, r);
      this.pos[axis] += Math.sign(d) * Math.min(Math.abs(d), Math.max(0, free - r * 0.05));
    }
    // soft wall: beyond PHOTO_RADIUS the camera is eased back towards the sphere
    const maxR = PHOTO_MAX_RADIUS_BU * bu;
    v3Sub(this.tmp, this.pos, this.entry);
    const dist = v3Normalize(this.tmp, this.tmp);
    if (dist > maxR) {
      const back = (dist - maxR) * smoothK(dt, 0.15);
      v3AddScaled(this.pos, this.pos, this.tmp, -back);
    }
    v3Copy(o.pos, this.pos);
    v3AddScaled(o.look, this.pos, this.fwd, this.focusMm);
    v3Set(o.up, 0, 1, 0);
    rotateAboutAxis(o.up, o.up, this.fwd, this.roll * DEG);
    o.fov = this.fov;
    o.near = cameraNear(this.focusMm, bu, r * 2);
    o.far = 8000 * bu;
    const f = fNumberAt(this.apertureIndex);
    o.fNumber = f;
    o.focalMm = focalForFov(this.fov);
    o.dof.focusDistance = this.focusMm;
    o.dof.focusRange = this.focusMm * 0.6 * (f / 2.8);
    o.dof.bokehScale = PHOTO_BOKEH_K / f;
    o.exposureEV = this.exposureEV;
    o.rollDeg = this.roll;
    return o;
  }
}
