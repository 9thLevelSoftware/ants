// Colony view camera (GDD 01 6.7): a strategic orbit around a point on the terrain, plus the underground cutaway
// parameters (off / slice plane / x-ray) that the terrain, primitive and nest renderers read.
import { v3AddScaled, v3Copy, v3Normalize, v3Set, v3Sub, vec3, type Vec3 } from '@/core';
import {
  CAM_FAR_BU, CAM_OBSERVER_RADIUS_BU, CV_BOOM_LIFT_BU, CV_DIST_BU, CV_ENTRY_DIST_BU, CV_FOV_DEG, CV_PAN_PER_DIST, CV_PITCH_DEG, CV_RCUT_BU,
  CV_SLICE_BELOW_DEEPEST_BU, CV_SLICE_FAST_MULT, CV_SLICE_STEP_BU,
} from './constants';
import { clampN, DEG } from './frameMath';
import { cameraNear } from './near';
import { makePose, type CameraPose, type OrbitInput, type TraceFn } from './types';

export type CutawayMode = 'off' | 'slice' | 'xray';

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

export interface CutawayParams {
  mode: CutawayMode;
  /** Slice plane height y_cut (mm). Everything above it within `radius` of `center` is hidden. */
  planeY: number;
  /** R_cut in mm. */
  radius: number;
  center: { x: number; z: number };
  /** Outside R_cut the surface renders darkened by this factor (GDD: 30 %). */
  outsideDarken: number;
  /** Deepest carved point the slider may reach (mm), already including the 10 BU margin. */
  minPlaneY: number;
}

export interface ColonyOptions {
  bu: number;
  worldSize: number;
  far?: number;
}

export interface ColonyInput extends OrbitInput {
  /** Pan rate, x right, y forward (-1..1). */
  pan: { x: number; y: number };
  /** Pan by mouse drag this frame (pixels, x right, y down). */
  panPx?: { x: number; y: number };
  /** Slice steps this frame (+1 up, -1 down) and whether the fast multiplier applies. */
  sliceSteps?: number;
  sliceFast?: boolean;
  cycleCutaway?: boolean;
}

export interface ColonyEnv {
  groundHeight: (x: number, z: number) => number;
  trace?: TraceFn;
  /** Viewport height in CSS px, for drag-pan scaling. */
  viewportHeight?: number;
}

export class ColonyRig {
  readonly opts: Required<ColonyOptions>;
  readonly target = vec3();
  yaw = 0;
  pitch = CV_PITCH_DEG[1] * DEG;
  distance: number;
  readonly cutaway: CutawayParams;
  readonly out: CameraPose & { cutaway: CutawayParams; focusDistance: number };
  private tmp = vec3();
  private boomOrigin = vec3();

  constructor(opts: ColonyOptions) {
    this.opts = { far: CAM_FAR_BU * opts.bu, ...opts };
    this.distance = CV_DIST_BU[1] * opts.bu;
    this.cutaway = { mode: 'off', planeY: 0, radius: CV_RCUT_BU[1] * opts.bu, center: { x: 0, z: 0 }, outsideDarken: 0.3, minPlaneY: -CV_SLICE_BELOW_DEEPEST_BU * opts.bu };
    this.out = { ...makePose(), cutaway: this.cutaway, focusDistance: 0 };
  }

  /** Entry pose: target = focus projected to the surface, distance 120 BU; slice is the default underground. */
  enter(focus: Vec3, underground: boolean, groundHeight: (x: number, z: number) => number, yaw = this.yaw): void {
    v3Set(this.target, focus.x, groundHeight(focus.x, focus.z), focus.z);
    this.distance = CV_ENTRY_DIST_BU * this.opts.bu;
    this.pitch = CV_PITCH_DEG[1] * DEG;
    this.yaw = yaw;
    this.cutaway.mode = underground ? 'slice' : 'off';
    if (underground) this.cutaway.planeY = clampN(focus.y + 2 * this.opts.bu, this.cutaway.minPlaneY, 0);
  }

  /** Deepest nest voxel (mm, negative below ground): the slice may go 10 BU below it. */
  setDeepest(yMm: number): void {
    this.cutaway.minPlaneY = Math.min(0, yMm) - CV_SLICE_BELOW_DEEPEST_BU * this.opts.bu;
    this.cutaway.planeY = Math.max(this.cutaway.planeY, this.cutaway.minPlaneY);
  }

  setCutRadius(bu: number): void {
    this.cutaway.radius = clampN(bu, CV_RCUT_BU[0], CV_RCUT_BU[2]) * this.opts.bu;
  }

  update(dt: number, input: ColonyInput, env: ColonyEnv): this['out'] {
    dt = Math.max(0, Math.min(dt, 0.25));
    const bu = this.opts.bu, o = this.out;
    this.yaw -= input.yawDeg * DEG;
    this.pitch = clampN(this.pitch - input.pitchDeg * DEG, CV_PITCH_DEG[0] * DEG, CV_PITCH_DEG[2] * DEG);
    this.distance = clampN(this.distance * Math.exp(input.zoomLog), CV_DIST_BU[0] * bu, CV_DIST_BU[2] * bu);
    // pan: 0.8 x distance per second for keys/stick; drag moves the ground under the cursor roughly 1:1
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let px = input.pan.x * CV_PAN_PER_DIST * this.distance * dt, pz = input.pan.y * CV_PAN_PER_DIST * this.distance * dt;
    if (input.panPx && env.viewportHeight) {
      const perPx = (2 * this.distance * Math.tan((CV_FOV_DEG * DEG) / 2)) / env.viewportHeight;
      px -= input.panPx.x * perPx;
      pz += input.panPx.y * perPx;
    }
    this.target.x = clampN(this.target.x + cy * px - sy * pz, 0, this.opts.worldSize);
    this.target.z = clampN(this.target.z - sy * px - cy * pz, 0, this.opts.worldSize);
    this.target.y = env.groundHeight(this.target.x, this.target.z);
    // cutaway
    if (input.cycleCutaway) this.cutaway.mode = this.cutaway.mode === 'off' ? 'slice' : this.cutaway.mode === 'slice' ? 'xray' : 'off';
    if (input.sliceSteps) {
      const step = CV_SLICE_STEP_BU * bu * (input.sliceFast ? CV_SLICE_FAST_MULT : 1);
      this.cutaway.planeY = clampN(this.cutaway.planeY + input.sliceSteps * step, this.cutaway.minPlaneY, 0);
    }
    this.cutaway.center.x = this.target.x;
    this.cutaway.center.z = this.target.z;
    // pose: camera behind (+Z at yaw 0) and above the target
    const cp = Math.cos(this.pitch);
    v3Set(this.tmp, Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);
    // The camera hangs on a boom from a point CV_BOOM_LIFT_BU above the target. With the cutaway off it must stay
    // out of solid (trees, walls), so the boom is traced and placed along the same line from the same origin; the
    // cutaway looks through soil on purpose. If the boom origin itself is inside solid (target under an object),
    // the trace cannot help and the full distance is kept.
    const r = CAM_OBSERVER_RADIUS_BU * bu;
    v3AddScaled(this.boomOrigin, this.target, WORLD_UP, CV_BOOM_LIFT_BU * bu);
    let d = this.distance;
    if (env.trace && this.cutaway.mode === 'off' && env.trace(this.boomOrigin, this.tmp, r * 0.01, r) > 0) {
      d = Math.max(0, Math.min(d, env.trace(this.boomOrigin, this.tmp, d, r) - r * 0.05));
    }
    v3AddScaled(o.pos, this.boomOrigin, this.tmp, d);
    v3Copy(o.look, this.target);
    v3Set(o.up, 0, 1, 0);
    o.fov = CV_FOV_DEG;
    // pulled in by collision: keep the near plane inside the guaranteed clearance
    o.near = d < this.distance ? cameraNear(d, bu, r) : Math.max(0.5 * bu, d * 0.01);
    o.far = this.opts.far;
    v3Sub(this.tmp, o.look, o.pos);
    o.focusDistance = v3Normalize(this.tmp, this.tmp);
    return o;
  }
}
