// Camera rig selection per play view (GDD 01 §1.3, §2, §6): possession -> ThirdPersonRig, observer ->
// ObserverRig (free or following), colony -> ColonyRig (cutaway), photo -> PhotoRig, blended by CameraTransition.
// Collision uses the world service's sphere trace. Input comes in as a ViewInput (null = no input, e.g. while
// settling the camera for a deterministic screenshot). The `views` task takes this folder over (task spec).
import { vec3, type Vec3 } from '@/core';
import type { InputState } from '@/input';
import {
  CAM_TO_COLONY_S, CameraTransition, ColonyRig, ObserverRig, PhotoRig, ThirdPersonRig, copyPose, makePose, planTransition, type TransitionPlan,
  type CameraPose, type CameraTarget, type CutawayParams, type FadeOutput, type FieldFn, type PossessionCamState, type TraceFn,
} from '@/render/camera';
import { SLICE_REPEAT_HZ } from '@/input';
import type { ViewId } from '../time/speedRules';
import { observerStartPose } from './startPose';

export interface ViewWorld {
  bu: number;
  worldSize: number;
  trace: TraceFn;
  groundHeight: (x: number, z: number) => number;
  /** The free-space field f(p), mm (optional: lets the tunnel boom relax its path off ledges). */
  field?: FieldFn;
}

/** What the active view looks at this frame (possessed / followed ant), or null. */
export interface ViewSubject extends CameraTarget {
  /** Body length in BU. */
  lengthBu: number;
  underground: boolean;
  airborne: boolean;
  /** Alate in flight (T2 hook: the session sets it once flight exists). */
  flying?: boolean;
}

export interface ViewFrame {
  pose: CameraPose;
  /** Full-screen dip 0..1 during a fade transition. */
  dip: number;
  /** Depth-of-field focus distance, mm. */
  focus: number;
  /** Opacity of the possessed ant (third-person fade, 6.5). */
  subjectOpacity: number;
  possessionState: PossessionCamState | null;
  fade: FadeOutput | null;
  cutaway: CutawayParams | null;
  observerMode: 'free' | 'follow' | 'hold' | null;
}

export interface CameraOptions {
  autoFollow: 'off' | 'gentle' | 'strong';
  fovOffset: number;
  worldUpLock: boolean;
  reducedMotion: boolean;
}

const ZERO2 = { x: 0, y: 0 };

/**
 * GDD 01 §2 hand-overs: into and out of the colony view the camera rises / descends over CAM_TO_COLONY_S (never a
 * dip); every other switch flies clamp(0.4 + d/300, 0.4, 0.9) s, or dip-fades beyond 150 BU; reduced motion
 * cross-fades 0.3 s.
 */
export function handoverPlan(from: ViewId, to: ViewId, a: CameraPose, b: CameraPose, bu: number, reducedMotion: boolean): TransitionPlan {
  if (!reducedMotion && (from === 'colony' || to === 'colony')) return { kind: 'fly', duration: CAM_TO_COLONY_S };
  return planTransition(a, b, bu, reducedMotion);
}

/** The colony rotation from the mouse drag alone (degrees, like InputState.look), without the Q / E keys. */
function dragLook(input: InputState): { x: number; y: number } {
  const d = input.dragPx('cv-rotate'), k = input.settings.orbitSensDrag * input.settings.mouseSensitivity;
  return { x: d.x * k, y: -d.y * k };
}

export class ViewDirector {
  readonly third: ThirdPersonRig;
  readonly observer: ObserverRig;
  readonly colony: ColonyRig;
  readonly photo: PhotoRig;
  readonly transition = new CameraTransition();
  view: ViewId = 'observer';
  /** The view photo mode returns to. */
  photoOrigin: ViewId = 'observer';
  /** The colony view's planner holds a ghost: Q / E and Shift+wheel are not the camera's (set by the views layer). */
  colonyCapture = false;
  private readonly last: CameraPose = makePose();
  private readonly followTarget: CameraTarget = { pos: vec3(), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
  private following = false;
  private subjectUnderground = false;
  private subjectAirborne = false;
  private subjectFlying = false;
  private subjectLengthBu = 1;
  /** Orbit requested by the debug API, added to the next rig update (degrees). */
  private nudgeYaw = 0;
  private nudgePitch = 0;
  private nudgeZoom = 0;
  private readonly frameOut: ViewFrame = {
    pose: makePose(), dip: 0, focus: 100, subjectOpacity: 1, possessionState: null, fade: null, cutaway: null, observerMode: null,
  };

  constructor(readonly world: ViewWorld, cam: CameraOptions) {
    const bu = world.bu;
    this.third = new ThirdPersonRig({ bu, bodyL: 1, autoFollow: cam.autoFollow, fovOffset: cam.fovOffset, worldUpLock: cam.worldUpLock, reducedMotion: cam.reducedMotion });
    this.observer = new ObserverRig({ bu, worldSize: world.worldSize, fovOffset: cam.fovOffset });
    this.colony = new ColonyRig({ bu, worldSize: world.worldSize });
    this.photo = new PhotoRig(bu);
  }

  /** The camera pose of the last frame (transition source, photo entry, debug). */
  get pose(): CameraPose { return this.last; }

  /** Point the camera is centred on (role possession's nearPos, Tab radius centre). */
  focusPoint(out: Vec3): Vec3 {
    if (this.view === 'colony') { out.x = this.colony.target.x; out.y = this.colony.target.y; out.z = this.colony.target.z; return out; }
    if (this.following || this.view === 'possess') { out.x = this.followTarget.pos.x; out.y = this.followTarget.pos.y; out.z = this.followTarget.pos.z; return out; }
    out.x = this.last.look.x; out.y = this.last.look.y; out.z = this.last.look.z;
    return out;
  }

  /** Switch view. `subject` is the possessed / released ant (null when none). `instant` skips the blend. */
  setView(view: ViewId, subject: ViewSubject | null, instant = false): void {
    const from = copyPose(makePose(), this.last);
    const prev = this.view;
    if (prev === 'photo' && view !== 'photo') {
      // leaving photo mode: the origin view's rig was untouched, so its pose and possession come back as they were
      this.view = view;
      if (subject) this.setSubject(subject);
      this.transition.start(from, { kind: 'fly', duration: 0 });
      return;
    }
    if (view === 'photo') { this.photoOrigin = prev === 'photo' ? this.photoOrigin : prev; this.photo.enter(this.last); }
    if (view === 'possess') { this.third.snap(); this.stopFollowing(); }
    if (view === 'observer') {
      if (subject) this.follow(subject);
      else { this.stopFollowing(); this.placeObserverAbove(this.last.look); }
    }
    if (view === 'colony') {
      const f = subject?.pos ?? this.last.look;
      this.colony.enter(f, subject?.underground ?? false, this.world.groundHeight);
    }
    this.view = view;
    if (subject) this.setSubject(subject);
    // possess -> possess is a switch to another ant: it flies (or dips beyond CAM_SWITCH_FADE_DIST_BU) like any
    // other hand-over (GDD 01 §2); re-entering any other view it is already in is a cut
    const cut = instant || (prev === view && view !== 'possess');
    const plan = cut ? { kind: 'fly' as const, duration: 0 } : handoverPlan(prev, view, from, this.peekPose(), this.world.bu, !!this.third.opts.reducedMotion);
    // photo mode keeps the pose: no blend in or out
    this.transition.start(from, view === 'photo' || prev === 'photo' ? { kind: 'fly', duration: 0 } : plan);
  }

  /** Observer camera placed over a point (game start in observer view). */
  placeObserverAbove(p: Vec3): void {
    const s = observerStartPose(p, this.world.bu);
    this.observer.setPose(s.pos, s.look);
  }

  follow(subject: ViewSubject): void {
    this.setSubject(subject);
    this.following = true;
    this.observer.setFollow(this.followTarget);
  }

  unfollow(): void {
    if (this.following) this.observer.setFollow(null);
    this.following = false;
  }

  /** Player-chosen free fly from above a point (no follow-loss hold: that is for an entity that disappeared). */
  freeFlyAbove(p: Vec3): void {
    this.stopFollowing();
    this.placeObserverAbove(p);
  }

  /** Free-fly observer at an explicit pose (debug camera.setPose). */
  freeFlyAt(pos: Vec3, look: Vec3): void {
    this.stopFollowing();
    this.observer.setPose(pos, look);
  }

  private stopFollowing(): void {
    this.observer.stopFollow();
    this.following = false;
  }

  /** Update the followed / possessed subject (each frame; the rigs keep a reference to the copy). */
  setSubject(s: ViewSubject): void {
    const t = this.followTarget;
    t.pos.x = s.pos.x; t.pos.y = s.pos.y; t.pos.z = s.pos.z;
    t.up.x = s.up.x; t.up.y = s.up.y; t.up.z = s.up.z;
    t.fwd.x = s.fwd.x; t.fwd.y = s.fwd.y; t.fwd.z = s.fwd.z;
    if (this.third.opts.bodyL !== s.lengthBu) this.third.setOptions({ bodyL: s.lengthBu });
    this.subjectUnderground = s.underground;
    this.subjectAirborne = s.airborne;
    this.subjectFlying = !!s.flying;
    this.subjectLengthBu = s.lengthBu;
  }

  private peekPose(): CameraPose {
    return this.updateRig(0, null).pose;
  }

  private updateRig(dt: number, input: InputState | null): ViewFrame {
    const f = this.frameOut, w = this.world;
    const ny = this.nudgeYaw, np = this.nudgePitch, nz = this.nudgeZoom;
    this.nudgeYaw = 0; this.nudgePitch = 0; this.nudgeZoom = 0;
    const look = (axis: string) => {
      const l = input ? input.look(axis) : ZERO2;
      return ny === 0 && np === 0 ? l : { x: l.x + ny, y: l.y + np };
    };
    const zoom = (axis: string) => (input ? input.zoom(axis) : 0) + nz;
    f.possessionState = null; f.fade = null; f.cutaway = null; f.observerMode = null; f.subjectOpacity = 1;
    if (this.view === 'possess') {
      const l = look('orbit');
      const o = this.third.update(dt, this.followTarget, { yawDeg: l.x, pitchDeg: l.y, zoomLog: zoom('zoom'), recentre: !!input && input.pressed('recentre') },
        { trace: w.trace, field: w.field, underground: this.subjectUnderground, airborne: this.subjectAirborne, flying: this.subjectFlying });
      f.pose = o; f.focus = o.focusDistance; f.subjectOpacity = o.fade.target; f.possessionState = o.state; f.fade = o.fade;
    } else if (this.view === 'observer') {
      const l = look('obs-look');
      const m = input ? input.axis2('obs-move') : ZERO2;
      const vertical = input ? (input.held('obs-up') ? 1 : 0) - (input.held('obs-down') ? 1 : 0) : 0;
      const o = this.observer.update(dt, { yawDeg: l.x, pitchDeg: l.y, zoomLog: zoom('obs-zoom'), move: m, vertical, fast: !!input && input.active('obs-fast') },
        { trace: w.trace, groundHeight: w.groundHeight, followL: this.subjectLengthBu });
      f.pose = o; f.focus = o.focusDistance; f.observerMode = o.mode;
    } else if (this.view === 'colony') {
      // while the dig planner holds a ghost, Q / E and Shift+wheel belong to the ghost (GDD 01 App. F 16): the camera
      // keeps its drag rotation and R / F for the slice
      const cap = this.colonyCapture && !!input;
      const l = cap && input ? dragLook(input) : look('cv-rotate');
      const steps = !input ? 0 : cap
        ? (input.codePressed('KeyR') ? 1 : 0) - (input.codePressed('KeyF') ? 1 : 0)
        : (input.pressedRepeat('cv-slice-up', SLICE_REPEAT_HZ) ? 1 : 0) - (input.pressedRepeat('cv-slice-down', SLICE_REPEAT_HZ) ? 1 : 0);
      const o = this.colony.update(dt, {
        yawDeg: l.x, pitchDeg: l.y, zoomLog: zoom('cv-zoom'), pan: input ? input.axis2('cv-pan') : ZERO2,
        panPx: input ? input.dragPx('cv-pan') : undefined, sliceSteps: steps, sliceFast: !!input && input.codeHeld('ShiftLeft'),
        cycleCutaway: !!input && input.pressed('cv-cutaway-mode'),
      }, { groundHeight: w.groundHeight, trace: w.trace });
      f.pose = o; f.focus = o.focusDistance; f.cutaway = o.cutaway;
    } else {
      const l = look('ph-look');
      const m = input ? input.axis2('ph-move') : ZERO2;
      const o = this.photo.update(dt, {
        yawDeg: l.x, pitchDeg: l.y, zoomLog: 0, move: m, vertical: input ? (input.held('ph-up') ? 1 : 0) - (input.held('ph-down') ? 1 : 0) : 0,
        focalLog: -zoom('ph-focal'), focusLog: zoom('ph-focus-dist'),
        apertureSteps: input ? (input.pressed('ph-aperture-up') ? -1 : 0) + (input.pressed('ph-aperture-down') ? 1 : 0) : 0,
        exposureSteps: input ? (input.pressed('ph-exposure-up') ? 1 : 0) - (input.pressed('ph-exposure-down') ? 1 : 0) : 0,
        roll: input ? (input.held('ph-roll-right') ? 1 : 0) - (input.held('ph-roll-left') ? 1 : 0) : 0,
        fast: !!input && input.codeHeld('ShiftLeft'),
      }, w.trace);
      f.pose = o; f.focus = o.dof.focusDistance;
    }
    return f;
  }

  /** One frame of the active rig (real dt) blended through any running transition. */
  update(dt: number, input: InputState | null): ViewFrame {
    const f = this.updateRig(dt, input);
    const t = this.transition.update(dt, f.pose);
    copyPose(this.last, t.pose);
    f.pose = this.last;
    f.dip = t.dip;
    return f;
  }

  /** Adds an orbit step (degrees) and a zoom step (natural log of the distance factor) to the next rig update. */
  nudge(yawDeg: number, pitchDeg: number, zoomLog = 0): void {
    this.nudgeYaw += yawDeg;
    this.nudgePitch += pitchDeg;
    this.nudgeZoom += zoomLog;
  }

  /** Runs the rig without input for `seconds` so smoothing has settled (deterministic screenshots). */
  settle(seconds: number, dt: number): ViewFrame {
    let f = this.update(0, null);
    for (let t = 0; t < seconds; t += dt) f = this.update(dt, null);
    return f;
  }
}
