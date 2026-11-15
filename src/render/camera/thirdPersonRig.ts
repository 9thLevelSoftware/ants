// Possession camera (GDD 01 6.2-6.5): an orbit in the target's smoothed local frame, carried across floor ->
// wall -> ceiling by parallel transport, with sphere-traced collision, tunnel path boom, environment states,
// look-ahead, near-plane management and fade outputs. Pure maths: no three, no simulation types.
import { v3AddScaled, v3Copy, v3Cross, v3Distance, v3Dot, v3Length, v3Lerp, v3Normalize, v3Scale, v3Sub, vec3, type Vec3 } from '@/core';
import { Breadcrumbs } from './breadcrumbs';
import {
  BOOM_ENTRIES, BOOM_LOOK_PITCH_DEG, BOOM_LOOK_YAW_DEG, BOOM_RAISE_L, BOOM_REVERSAL_L, BOOM_REVERSAL_S, BOOM_SAMPLE_L, BOOM_SPRING_DELAY_S,
  BOOM_SPRING_TAU, CAM_AUTOFOLLOW_DELAY_S, CAM_AUTOFOLLOW_MAX_DEG_S, CAM_AUTOFOLLOW_MAX_TURN_DEG_S, CAM_AUTOFOLLOW_MIN_SPEED_BU,
  CAM_AUTOFOLLOW_TAU, CAM_FAR_BU, CAM_LOOKAHEAD_MAX_L, CAM_LOOKAHEAD_T, CAM_PIVOT_UP_L, CAM_PUSHOUT_TAU, CAM_RADIUS_L, CAM_RADIUS_MAX_BU,
  CAM_RADIUS_MIN_BU, CAM_RECENTRE_S, CAM_REDUCED_FOV_SPREAD_DEG, CAM_STATE_BLEND_S, CAM_STATE_BLEND_S_REDUCED, CAM_TUNNEL_LOOKAHEAD_BU,
  CAM_UP_TAU, CAM_UP_TAU_REDUCED, CAM_MIN_CLEARANCE_R, CAM_RADIUS_FIELD_CAP_BU, BOOM_CLEAR_R, CAM_SNAP_JUMP_L, PATH_ASSIST_BLEND_S, PATH_ASSIST_OFF, PATH_ASSIST_ON,
} from './constants';
import { boomPoint, fitsAt, solveBoom } from './boomPath';
import { MotionGuard } from './motionGuard';
import type { FieldFn } from './sphereTrace';
import { creviceForcesCutaway, OcclusionTracker, writeFade } from './fade';
import { comfortWeight, leanUp, PinchFallback } from './pinch';
import { clampN, DEG, rotateAboutAxis, signedAngle, slerpUnit, smoothK, tangentDir, transport, wrapPi } from './frameMath';
import { classify, probeSurroundings, StateHold } from './envState';
import { FALLING_UP_TAU, OPEN_AIM_LIFT_L, OPEN_DIST_CAP_BU, STATE_PARAMS, type Framing } from './possessionStates';
import { cameraNear } from './near';
import { makePose, type CameraPose, type CameraTarget, type FadeOutput, type OrbitInput, type PossessionCamState, type TraceFn } from './types';

export interface ThirdPersonOptions {
  /** Millimetres per body unit of the played species. */
  bu: number;
  /** Body length of the target in BU (Lasius worker 1, queen 2). */
  bodyL: number;
  autoFollow?: 'off' | 'gentle' | 'strong';
  reducedMotion?: boolean;
  worldUpLock?: boolean;
  /** Added to every state's FOV (degrees, -10..+20). */
  fovOffset?: number;
  /** Far plane in mm (default CAM_FAR_BU x bu). */
  far?: number;
  /** Ceiling comfort (spike-nest 5.9): on ceilings the picture's up leans toward world up. Default off. */
  ceilingComfort?: boolean;
}

export interface ThirdPersonEnv {
  trace: TraceFn;
  /** The free-space field f(p) (mm): lets the tunnel boom relax its path points away from ledges. Optional. */
  field?: FieldFn;
  /** fSubstrate(p_ant) < 0: the ant is below the original ground (chamber vs open). */
  underground?: boolean;
  /** Ant airborne after let-go. */
  airborne?: boolean;
  /** Alate flight (T2). */
  flying?: boolean;
}

export interface ThirdPersonOutput extends CameraPose {
  state: PossessionCamState;
  fade: FadeOutput;
  /** Camera to thorax distance in mm (depth-of-field focus). */
  focusDistance: number;
  /** Current and desired camera distance from the pivot (mm); in boom states the arc length along the path. */
  distance: number;
  desired: number;
  /** Pinch fallback weight 0..1 (over-the-ant view). */
  pinch: number;
  /** Seconds the ant has been hidden from the camera by >= 2 of 3 body rays without a break (E13). */
  occludedFor: number;
  /** The clearance guard (f >= 0.5 R) had to move the camera this frame; otherwise its motion relative to the
   * pivot base stayed within CAM_MAX_REL_SPEED_L. */
  guarded: boolean;
  /** The pivot base this frame (above the target, clear of solid), mm. */
  base: Vec3;
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };
/** Directions tried when the trail behind the target is rebuilt (degrees from straight back; tilt out of the plane). */
const REBUILD_YAWS = [0, 30, -30, 60, -60, 90, -90];
const REBUILD_TILTS = [0, 30, -30];

export class ThirdPersonRig {
  readonly opts: Required<ThirdPersonOptions>;
  readonly out: ThirdPersonOutput;
  private initialised = false;
  private u = vec3(0, 1, 0);
  private ref = vec3(-1, 0, 0);
  private yaw = 0;
  private elev = 20 * DEG;
  private zoomL: Record<PossessionCamState, number> = { open: 5, chamber: 4, tunnel: 2.5, crevice: 1.2, falling: 5, flight: 6 };
  private dist = 0;
  private hold = new StateHold();
  private prevState: PossessionCamState = 'open';
  private blend = 1;
  private sinceOrbit = 99;
  private boomYaw = 0;
  private boomPitch = 0;
  private reversalFor = 0;
  private recentreT = -1;
  private recentreFrom = { yaw: 0, elev: 0 };
  private speed = 0;
  private turnRate = 0;
  private prevPos = vec3();
  private prevFwd = vec3(1, 0, 0);
  private vel = vec3();
  private crumbs: Breadcrumbs;
  private occl = new OcclusionTracker();
  private pinch = new PinchFallback();
  /** Boom arc length along the breadcrumb path (mm): immediate pull-in, eased push-out. */
  private boomArc = 0;
  /** Path assist (orbit squeezed by a low ceiling -> the boom path): weight 0..1 and its switch. */
  private assist = 0;
  private assistOn = false;
  private guard = new MotionGuard();
  // scratch
  private pivot = vec3(); private base = vec3(); private tmp = vec3(); private tmp2 = vec3(); private h = vec3(); private dir = vec3();
  private posA = vec3(); private posB = vec3(); private goal = vec3(); private bUp = vec3(); private thorax = vec3();

  constructor(opts: ThirdPersonOptions) {
    this.opts = { autoFollow: 'gentle', reducedMotion: false, worldUpLock: false, fovOffset: 0, far: CAM_FAR_BU * opts.bu, ceilingComfort: false, ...opts };
    this.crumbs = new Breadcrumbs(BOOM_ENTRIES, BOOM_SAMPLE_L * this.lengthMm);
    this.out = {
      ...makePose(), state: 'open', focusDistance: 0, distance: 0, desired: 0, pinch: 0, occludedFor: 0, guarded: false, base: vec3(),
      fade: { target: 1, occlusion: 0, capsuleA: vec3(), capsuleB: vec3(), capsuleRadius: 0 },
    };
  }

  get lengthMm(): number { return this.opts.bodyL * this.opts.bu; }
  /** GDD 6.1 camera radius clamp(0.25 L, 0.1, 0.5) BU, mm: the centre always keeps f >= 0.5 x this (clearanceMm). */
  get radiusMm(): number { return clampN(CAM_RADIUS_L * this.opts.bodyL, CAM_RADIUS_MIN_BU, CAM_RADIUS_MAX_BU) * this.opts.bu; }
  /**
   * Sphere used for the collision traces, mm: the GDD radius capped at CAM_RADIUS_FIELD_CAP_BU. The carve field
   * saturates at 0.5 BU inside cavities, so a 0.5 BU sphere (queens) can never travel through a tunnel at all.
   */
  get collisionRadiusMm(): number { return Math.min(this.radiusMm, CAM_RADIUS_FIELD_CAP_BU * this.opts.bu); }
  /** The guaranteed clearance of the camera centre (GDD 6.1), mm. */
  get clearanceMm(): number { return CAM_MIN_CLEARANCE_R * this.radiusMm; }

  setOptions(o: Partial<ThirdPersonOptions>): void {
    Object.assign(this.opts, o);
    this.crumbs.spacing = BOOM_SAMPLE_L * this.lengthMm;
  }

  /** Snap behind the target (after possession or teleport). */
  snap(): void {
    this.initialised = false;
  }

  /** Debug view of the internal state (yaw relative to "behind", degrees). */
  debug(): { state: PossessionCamState; yawDeg: number; elevDeg: number; dist: number; blend: number } {
    return { state: this.hold.state, yawDeg: this.yaw / DEG, elevDeg: this.elev / DEG, dist: this.dist, blend: this.blend };
  }

  /** Yaw of the orbit relative to "behind the target heading", radians (positive = counter-clockwise about up). */
  yawFromBehind(target: CameraTarget): number {
    tangentDir(this.tmp, target.fwd, this.u);
    v3Scale(this.tmp, this.tmp, -1);
    rotateAboutAxis(this.h, this.ref, this.u, this.yaw);
    return signedAngle(this.tmp, this.h, this.u);
  }

  private init(t: CameraTarget, env: ThirdPersonEnv): void {
    v3Copy(this.u, this.opts.worldUpLock ? WORLD_UP : t.up);
    tangentDir(this.ref, t.fwd, this.u);
    v3Scale(this.ref, this.ref, -1);
    this.yaw = 0;
    v3Copy(this.prevPos, t.pos);
    v3Copy(this.prevFwd, t.fwd);
    this.speed = 0;
    this.crumbs.clear();
    this.rebuildBehind(t, env.trace);
    const p = probeSurroundings(env.trace, t.pos, t.up, t.fwd, this.lengthMm);
    const s = classify(p, !!env.underground, !!env.airborne, !!env.flying);
    this.hold.reset(s);
    this.prevState = s;
    this.blend = 1;
    this.elev = STATE_PARAMS[s].pitch[0] * DEG;
    this.dist = Infinity; // first collision result is taken as is
    this.boomArc = Infinity;
    this.occl.reset();
    this.pinch.reset();
    this.guard.reset();
    this.assist = 0; this.assistOn = false;
    this.initialised = true;
  }

  /** Fill the breadcrumb buffer straight behind the target (traced so it stays in free space). */
  private rebuildBehind(t: CameraTarget, trace: TraceFn): void {
    this.crumbs.clear();
    const L = this.lengthMm;
    v3AddScaled(this.tmp, t.pos, t.up, 0.3 * L);
    // straight back unless a wall is there: an ant just possessed in a tunnel faces any way, so the first direction of
    // a fan behind it (in its tangent plane, then tilted +-30 degrees out of it; nearest to straight back first) with
    // room for the tunnel boom becomes the trail, else the freest of them
    tangentDir(this.h, t.fwd, t.up);
    const enough = this.stateDistMm('tunnel');
    let best = -1;
    search: for (const tilt of REBUILD_TILTS) {
      for (const yaw of REBUILD_YAWS) {
        rotateAboutAxis(this.dir, this.h, t.up, Math.PI + yaw * DEG);
        v3Cross(this.posB, this.dir, t.up);
        if (tilt !== 0 && v3Normalize(this.posB, this.posB) > 1e-9) rotateAboutAxis(this.dir, this.dir, this.posB, tilt * DEG);
        const free = trace(this.tmp, this.dir, 6 * L, 0.1 * L);
        if (free > best + 0.05 * L) { best = free; v3Copy(this.tmp2, this.dir); }
        if (free >= enough) break search;
      }
    }
    const n = Math.max(1, Math.floor(best / this.crumbs.spacing));
    for (let i = n; i >= 1; i--) {
      v3AddScaled(this.posA, t.pos, this.tmp2, i * this.crumbs.spacing);
      this.crumbs.push(this.posA, t.up);
    }
  }

  private stateDistMm(s: PossessionCamState): number {
    const p = STATE_PARAMS[s];
    let d = clampN(this.zoomL[s], p.dist[1], p.dist[2]) * this.lengthMm;
    if (s === 'open') d = Math.min(d, OPEN_DIST_CAP_BU * this.opts.bu);
    return d;
  }

  private stateFov(s: PossessionCamState): number {
    const base = STATE_PARAMS.open.fov;
    const f = STATE_PARAMS[s].fov;
    return (this.opts.reducedMotion ? base + clampN(f - base, -CAM_REDUCED_FOV_SPREAD_DEG, CAM_REDUCED_FOV_SPREAD_DEG) : f) + this.opts.fovOffset;
  }

  update(dt: number, t: CameraTarget, input: OrbitInput, env: ThirdPersonEnv): ThirdPersonOutput {
    // a teleport (or a new subject) is not motion: start over behind it (no flight through the world, no stale trail)
    if (this.initialised && v3Distance(t.pos, this.prevPos) > CAM_SNAP_JUMP_L * this.lengthMm) this.initialised = false;
    if (!this.initialised) this.init(t, env);
    const L = this.lengthMm, R = this.collisionRadiusMm, o = this.out, trace = env.trace;
    dt = Math.max(0, Math.min(dt, 0.25));

    // --- motion estimates (speed for look-ahead and auto-follow, turn rate)
    if (dt > 0) {
      v3Sub(this.tmp, t.pos, this.prevPos);
      v3Scale(this.tmp, this.tmp, 1 / dt);
      v3Lerp(this.vel, this.vel, this.tmp, smoothK(dt, 0.1));
      this.speed = v3Length(this.vel);
      this.turnRate = Math.acos(clampN(v3Dot(this.prevFwd, t.fwd), -1, 1)) / dt;
    }
    v3Copy(this.prevPos, t.pos);
    v3Copy(this.prevFwd, t.fwd);

    // --- environment state with hold and blend
    const probe = probeSurroundings(trace, t.pos, t.up, t.fwd, L);
    const before = this.hold.state;
    if (this.hold.update(dt, classify(probe, !!env.underground, !!env.airborne, !!env.flying))) this.onStateChange(before, t);
    const state = this.hold.state;
    const sp = STATE_PARAMS[state];
    const blendS = this.opts.reducedMotion ? CAM_STATE_BLEND_S_REDUCED : CAM_STATE_BLEND_S;
    this.blend = Math.min(1, this.blend + dt / blendS);
    const e = this.blend * this.blend * (3 - 2 * this.blend);

    // --- smoothed camera up, reference heading parallel-transported with it
    const upGoal = this.opts.worldUpLock || sp.framing === 'chase' ? WORLD_UP : t.up;
    const upTau = sp.framing === 'chase' ? FALLING_UP_TAU : this.opts.reducedMotion ? CAM_UP_TAU_REDUCED : CAM_UP_TAU;
    slerpUnit(this.tmp, this.u, upGoal, smoothK(dt, upTau));
    v3Normalize(this.tmp, this.tmp);
    transport(this.ref, this.ref, this.u, this.tmp);
    v3Copy(this.u, this.tmp);
    tangentDir(this.ref, this.ref, this.u, t.fwd);
    const u = this.u;

    this.crumbs.sample(t.pos, t.up);

    // --- player input
    const orbiting = input.yawDeg !== 0 || input.pitchDeg !== 0;
    this.sinceOrbit = orbiting ? 0 : this.sinceOrbit + dt;
    if (orbiting) this.recentreT = -1;
    if (sp.framing === 'boom') {
      this.boomYaw = clampN(this.boomYaw - input.yawDeg * DEG, -BOOM_LOOK_YAW_DEG * DEG, BOOM_LOOK_YAW_DEG * DEG);
      this.boomPitch = clampN(this.boomPitch - input.pitchDeg * DEG, -BOOM_LOOK_PITCH_DEG * DEG, BOOM_LOOK_PITCH_DEG * DEG);
      if (this.sinceOrbit > BOOM_SPRING_DELAY_S) {
        const k = smoothK(dt, BOOM_SPRING_TAU);
        this.boomYaw -= this.boomYaw * k;
        this.boomPitch -= this.boomPitch * k;
      }
    } else {
      this.yaw = wrapPi(this.yaw - input.yawDeg * DEG);
      this.elev -= input.pitchDeg * DEG;
    }
    if (input.zoomLog !== 0 && sp.dist[1] !== sp.dist[2]) this.zoomL[state] = clampN(this.zoomL[state] * Math.exp(input.zoomLog), sp.dist[1], sp.dist[2]);
    if (input.recentre) { this.recentreT = 0; this.recentreFrom = { yaw: this.yaw, elev: this.elev }; this.boomYaw = this.boomPitch = 0; }
    this.applyRecentreAndFollow(dt, t, sp.pitch[0] * DEG, sp.framing);
    const prevP = STATE_PARAMS[this.prevState];
    const lo = (prevP.pitch[1] + (sp.pitch[1] - prevP.pitch[1]) * e) * DEG, hi = (prevP.pitch[2] + (sp.pitch[2] - prevP.pitch[2]) * e) * DEG;
    if (sp.framing !== 'boom') this.elev = clampN(this.elev, lo, hi);

    // --- pivot: above the target (clear of solid by R), plus look-ahead (traced)
    this.placeBase(t, u, R, L, trace);
    v3Copy(this.pivot, this.base);
    const la = sp.framing === 'boom' ? CAM_TUNNEL_LOOKAHEAD_BU * this.opts.bu * Math.min(1, this.speed / (CAM_AUTOFOLLOW_MIN_SPEED_BU * this.opts.bu * 4))
      : Math.min(this.speed * CAM_LOOKAHEAD_T, CAM_LOOKAHEAD_MAX_L * L);
    if (la > 1e-6) {
      if (sp.framing === 'boom' && this.speed > 1e-6) tangentDir(this.dir, this.vel, u, t.fwd); else tangentDir(this.dir, t.fwd, u);
      const free = trace(this.base, this.dir, la + R, R);
      v3AddScaled(this.pivot, this.base, this.dir, Math.max(0, Math.min(la, free - R)));
    }

    // --- camera position: the framing of each state, blended across a state change; the boom resolves its own
    // collision along the path, orbit / chase by a sphere trace from the pivot (immediate pull-in, eased push-out)
    const desired = this.stateDistMm(this.prevState) + (this.stateDistMm(state) - this.stateDistMm(this.prevState)) * e;
    const blending = this.blend < 1 && prevP.framing !== sp.framing;
    const useBoom = sp.framing === 'boom' || (blending && prevP.framing === 'boom');
    const useOrbit = sp.framing !== 'boom' || (blending && prevP.framing !== 'boom');
    const orbitFraming = sp.framing === 'boom' ? prevP.framing : sp.framing;
    if (useOrbit) {
      this.orbitPos(this.posB, dt, orbitFraming, desired, t, trace, R);
      this.updateAssist(dt, orbitFraming, desired);
    } else this.assist = 0;
    if (useBoom || this.assist > 0) this.boomPos(this.posA, dt, useBoom ? desired : Math.min(desired, this.stateDistMm('tunnel')), t, u, env, R, L);
    // an orbit squeezed by a low ceiling leans on the ant's own path behind it (known free space)
    if (useOrbit && this.assist > 0) v3Lerp(this.posB, this.posB, this.posA, this.assist * this.assist * (3 - 2 * this.assist));
    if (!useOrbit) v3Copy(o.pos, this.posA);
    else if (!useBoom) v3Copy(o.pos, this.posB);
    else v3Lerp(o.pos, sp.framing === 'boom' ? this.posB : this.posA, sp.framing === 'boom' ? this.posA : this.posB, e);
    v3Copy(o.up, u);
    // pinch fallback: squeezed against the pivot for a while -> over the ant
    const allowed = v3Distance(o.pos, this.base);
    this.pinch.update(dt, allowed, L);
    this.pinch.apply(o.pos, o.up, this.base, u, t.fwd, L, R, trace);
    // no jumps, and GDD 6.1's f >= 0.5 R on every frame (motionGuard.ts)
    v3Copy(this.goal, o.pos);
    o.guarded = this.guard.apply(o.pos, this.goal, this.base, u, dt, L, this.clearanceMm, trace);
    v3Copy(o.base, this.base);
    const origin = sp.framing === 'boom' ? this.base : this.pivot;
    if (!useOrbit) this.dist = v3Distance(o.pos, origin);

    // --- pose
    v3Copy(o.look, this.pivot);
    const openW = (state === 'open' ? e : 0) + (this.prevState === 'open' && state !== 'open' ? 1 - e : 0);
    if (openW > 0) v3AddScaled(o.look, o.look, u, OPEN_AIM_LIFT_L * L * openW);
    if (v3Distance(o.look, o.pos) < 1e-6) v3AddScaled(o.look, o.pos, t.fwd, L);
    if (this.opts.ceilingComfort && sp.framing !== 'chase') leanUp(o.up, o.pos, o.look, comfortWeight(u.y) * (1 - this.pinch.weight));
    o.fov = this.stateFov(this.prevState) + (this.stateFov(state) - this.stateFov(this.prevState)) * e;
    o.near = cameraNear(v3Distance(o.pos, origin), this.opts.bu, R);
    o.far = this.opts.far;
    o.state = state;
    o.distance = sp.framing === 'boom' ? this.boomArc : this.dist;
    o.desired = desired;
    o.pinch = this.pinch.weight;

    // --- fades (rule 4 only above ground: underground "crevice" is just a queen-sized tunnel)
    v3AddScaled(this.thorax, t.pos, t.up, 0.15 * L);
    const crevice = creviceForcesCutaway(state, !!env.underground);
    const occ = this.occl.update(dt, trace, o.pos, t.pos, t.up, t.fwd, L, crevice);
    writeFade(o.fade, o.pos, this.thorax, L, crevice, occ);
    o.focusDistance = v3Distance(o.pos, this.thorax);
    o.occludedFor = this.occl.occludedFor;

    this.checkBoomReversal(dt, t, trace, sp.framing);
    return o;
  }

  /**
   * Pivot base. First out along the target's true surface normal (not the lagging camera up u) until a camera
   * sphere fits; then along u for whatever remains of CAM_PIVOT_UP_L, traced with the full radius R so the base
   * stays >= R from solid. Stepping back R along an oblique u ray (wrapping round a thin edge) would not.
   */
  private placeBase(t: CameraTarget, u: Vec3, R: number, L: number, trace: TraceFn): void {
    const lift = CAM_PIVOT_UP_L * L;
    const gap = trace(t.pos, t.up, 2 * R, 0); // radius 0: the ant itself may be closer than R to the surface
    const s0 = Math.min(R, lift, gap * 0.5);
    v3AddScaled(this.base, t.pos, t.up, s0);
    const rest = lift - s0;
    if (rest > 0) v3AddScaled(this.base, this.base, u, Math.min(rest, trace(this.base, u, rest, R)));
  }

  private onStateChange(from: PossessionCamState, t: CameraTarget): void {
    this.prevState = from;
    this.blend = 0;
    const toFraming = STATE_PARAMS[this.hold.state].framing;
    // Leaving the boom: start the orbit where the camera is now, so there is no swing (GDD 6.4 chamber exit).
    if (STATE_PARAMS[from].framing === 'boom' && toFraming !== 'boom' && Number.isFinite(this.dist)) {
      v3Sub(this.tmp, this.out.pos, this.pivot);
      if (v3Normalize(this.tmp, this.tmp) > 1e-9) {
        this.elev = Math.asin(clampN(v3Dot(this.tmp, this.u), -1, 1));
        tangentDir(this.h, this.tmp, this.u, t.fwd);
        this.yaw = signedAngle(this.ref, this.h, this.u);
      }
    }
    if (toFraming === 'boom') { this.boomYaw = 0; this.boomPitch = 0; if (STATE_PARAMS[from].framing !== 'boom') this.boomArc = Infinity; }
  }

  private applyRecentreAndFollow(dt: number, t: CameraTarget, defaultElev: number, framing: Framing): void {
    if (framing !== 'orbit') return;
    tangentDir(this.tmp, t.fwd, this.u);
    v3Scale(this.tmp, this.tmp, -1);
    const behindYaw = signedAngle(this.ref, this.tmp, this.u);
    if (this.recentreT >= 0) {
      this.recentreT += dt;
      const k = Math.min(1, this.recentreT / CAM_RECENTRE_S), s = k * k * (3 - 2 * k);
      this.yaw = wrapPi(this.recentreFrom.yaw + wrapPi(behindYaw - this.recentreFrom.yaw) * s);
      this.elev = this.recentreFrom.elev + (defaultElev - this.recentreFrom.elev) * s;
      if (k >= 1) this.recentreT = -1;
      return;
    }
    const mode = this.opts.autoFollow;
    if (mode === 'off' || this.sinceOrbit < CAM_AUTOFOLLOW_DELAY_S) return;
    if (this.speed < CAM_AUTOFOLLOW_MIN_SPEED_BU * this.opts.bu || this.turnRate > CAM_AUTOFOLLOW_MAX_TURN_DEG_S * DEG) return;
    const delta = wrapPi(behindYaw - this.yaw);
    const cap = CAM_AUTOFOLLOW_MAX_DEG_S * DEG * dt;
    this.yaw = wrapPi(this.yaw + clampN(delta * smoothK(dt, CAM_AUTOFOLLOW_TAU[mode]), -cap, cap));
  }

  /**
   * Boom framing: the farthest point along the raised breadcrumb path where the camera sphere fits all the way
   * (boomPath.ts), with the player's look offsets around the pivot base when they keep it clear.
   */
  private boomPos(out: Vec3, dt: number, dist: number, t: CameraTarget, u: Vec3, env: ThirdPersonEnv, R: number, L: number): Vec3 {
    const trace = env.trace;
    tangentDir(this.tmp2, t.fwd, u);
    const check = Math.max(BOOM_CLEAR_R * R, 1.1 * this.clearanceMm);
    v3AddScaled(this.thorax, t.pos, t.up, 0.15 * L);
    const allowed = solveBoom(this.crumbs, trace, t.pos, this.tmp2, t.up, dist, L, check, out, env.field, this.thorax);
    if (!Number.isFinite(this.boomArc) || allowed < this.boomArc) this.boomArc = allowed;
    else this.boomArc += (allowed - this.boomArc) * smoothK(dt, CAM_PUSHOUT_TAU);
    boomPoint(this.crumbs, trace, t.pos, this.tmp2, t.up, this.boomArc, L, out, this.bUp, env.field, env.field ? check * 1.2 : 0);
    if (this.boomYaw !== 0 || this.boomPitch !== 0) {
      v3Sub(this.tmp, out, this.base);
      rotateAboutAxis(this.tmp, this.tmp, u, this.boomYaw);
      v3Cross(this.h, this.tmp, u);
      if (v3Normalize(this.h, this.h) > 1e-9) rotateAboutAxis(this.tmp, this.tmp, this.h, this.boomPitch);
      v3AddScaled(this.dir, this.base, this.tmp, 1);
      if (fitsAt(trace, this.dir, u, check)) v3Copy(out, this.dir);
    }
    return out;
  }

  /** Path assist weight: on while the orbit is pulled in below PATH_ASSIST_ON of its distance, off above PATH_ASSIST_OFF. */
  private updateAssist(dt: number, framing: Framing, desired: number): void {
    if (framing !== 'orbit') { this.assist = 0; return; }
    if (this.dist < PATH_ASSIST_ON * desired) this.assistOn = true;
    else if (this.dist > PATH_ASSIST_OFF * desired) this.assistOn = false;
    const rate = dt / PATH_ASSIST_BLEND_S;
    this.assist += Math.max(-rate, Math.min(rate, (this.assistOn ? 1 : 0) - this.assist));
  }

  /** Orbit / chase framing: desired point traced from the pivot (immediate pull-in, eased push-out). */
  private orbitPos(out: Vec3, dt: number, framing: Framing, dist: number, t: CameraTarget, trace: TraceFn, R: number): Vec3 {
    this.framingPos(out, framing, dist, t);
    v3Sub(this.dir, out, this.pivot);
    const want = v3Normalize(this.dir, this.dir);
    const free = want > 1e-9 ? trace(this.pivot, this.dir, want, R) : 0;
    const allowed = Math.max(0, Math.min(want, free - R * 0.05));
    if (allowed < this.dist) this.dist = allowed;
    else this.dist += (allowed - this.dist) * smoothK(dt, CAM_PUSHOUT_TAU);
    return v3AddScaled(out, this.pivot, this.dir, this.dist);
  }

  /** Where an orbit / chase framing wants the camera (before collision). */
  private framingPos(out: Vec3, framing: Framing, dist: number, t: CameraTarget): Vec3 {
    const u = this.u;
    if (framing === 'chase') {
      // behind the velocity (falling) at a fixed pitch
      if (this.speed > 1e-6) tangentDir(this.h, this.vel, u, t.fwd); else tangentDir(this.h, t.fwd, u);
      v3Scale(this.h, this.h, -1);
      const el = STATE_PARAMS[this.hold.state].pitch[0] * DEG;
      v3Scale(out, this.h, Math.cos(el) * dist);
      v3AddScaled(out, out, u, Math.sin(el) * dist);
      return v3AddScaled(out, out, this.pivot, 1);
    }
    rotateAboutAxis(this.h, this.ref, u, this.yaw);
    v3Scale(out, this.h, Math.cos(this.elev) * dist);
    v3AddScaled(out, out, u, Math.sin(this.elev) * dist);
    return v3AddScaled(out, out, this.pivot, 1);
  }

  /** GDD 6.4 reversal: boom point ahead of the ant for 0.5 s -> rebuild the buffer behind it. */
  private checkBoomReversal(dt: number, t: CameraTarget, trace: TraceFn, framing: Framing): void {
    if (framing !== 'boom') { this.reversalFor = 0; return; }
    v3Sub(this.tmp, this.out.pos, t.pos);
    if (v3Dot(t.fwd, this.tmp) > BOOM_REVERSAL_L * this.lengthMm) this.reversalFor += dt;
    else this.reversalFor = 0;
    if (this.reversalFor >= BOOM_REVERSAL_S) {
      this.rebuildBehind(t, trace);
      this.reversalFor = 0;
    }
  }
}

/** Convenience: unit heading set on a CameraTarget literal. */
export function makeTarget(pos: Vec3, up: Vec3, fwd: Vec3): CameraTarget {
  const t = { pos: vec3(pos.x, pos.y, pos.z), up: vec3(up.x, up.y, up.z), fwd: vec3(fwd.x, fwd.y, fwd.z) };
  v3Normalize(t.up, t.up);
  v3Normalize(t.fwd, t.fwd);
  return t;
}
