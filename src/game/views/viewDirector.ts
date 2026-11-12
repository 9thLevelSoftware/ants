// Camera rig selection per play view (GDD 01 §1.3, §2, §6): possession -> ThirdPersonRig, observer ->
// ObserverRig (free or following), colony -> ColonyRig (cutaway), photo -> PhotoRig, blended by CameraTransition.
// Collision uses the world service's sphere trace. Input comes in as a ViewInput (null = no input, e.g. while
// settling the camera for a deterministic screenshot). The `views` task takes this folder over (task spec).
import { vec3, type Vec3 } from '@/core';
import type { InputState } from '@/input';
import {
  CameraTransition, ColonyRig, ObserverRig, PhotoRig, ThirdPersonRig, copyPose, makePose, planTransition,
  type CameraPose, type CameraTarget, type CutawayParams, type FadeOutput, type PossessionCamState, type TraceFn,
} from '@/render/camera';
import { SLICE_REPEAT_HZ } from '@/input';
import type { ViewId } from '../time/speedRules';
import { observerStartPose } from './startPose';

export interface ViewWorld {
  bu: number;
  worldSize: number;
  trace: TraceFn;
  groundHeight: (x: number, z: number) => number;
}

/** What the active view looks at this frame (possessed / followed ant), or null. */
export interface ViewSubject extends CameraTarget {
  /** Body length in BU. */
  lengthBu: number;
  underground: boolean;
  airborne: boolean;
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

export class ViewDirector {
  readonly third: ThirdPersonRig;
  readonly observer: ObserverRig;
  readonly colony: ColonyRig;
  readonly photo: PhotoRig;
  readonly transition = new CameraTransition();
  view: ViewId = 'observer';
  /** The view photo mode returns to. */
  photoOrigin: ViewId = 'observer';
  private readonly last: CameraPose = makePose();
  private readonly followTarget: CameraTarget = { pos: vec3(), up: vec3(0, 1, 0), fwd: vec3(1, 0, 0) };
  private following = false;
  private subjectUnderground = false;
  private subjectAirborne = false;
  private subjectLengthBu = 1;
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
    if (view === 'photo') { this.photoOrigin = prev === 'photo' ? this.photoOrigin : prev; this.photo.enter(this.last); }
    if (view === 'possess') this.third.snap();
    if (view === 'observer') {
      if (subject) this.follow(subject);
      else if (prev !== 'photo') { this.unfollow(); this.placeObserverAbove(this.last.look); }
    }
    if (view === 'colony') {
      const f = subject?.pos ?? this.last.look;
      this.colony.enter(f, subject?.underground ?? false, this.world.groundHeight);
    }
    this.view = view;
    if (subject) this.setSubject(subject);
    const plan = instant || prev === view ? { kind: 'fly' as const, duration: 0 } : planTransition(from, this.peekPose(), this.world.bu, false);
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

  /** Update the followed / possessed subject (each frame; the rigs keep a reference to the copy). */
  setSubject(s: ViewSubject): void {
    const t = this.followTarget;
    t.pos.x = s.pos.x; t.pos.y = s.pos.y; t.pos.z = s.pos.z;
    t.up.x = s.up.x; t.up.y = s.up.y; t.up.z = s.up.z;
    t.fwd.x = s.fwd.x; t.fwd.y = s.fwd.y; t.fwd.z = s.fwd.z;
    if (this.third.opts.bodyL !== s.lengthBu) this.third.setOptions({ bodyL: s.lengthBu });
    this.subjectUnderground = s.underground;
    this.subjectAirborne = s.airborne;
    this.subjectLengthBu = s.lengthBu;
  }

  private peekPose(): CameraPose {
    return this.updateRig(0, null).pose;
  }

  private updateRig(dt: number, input: InputState | null): ViewFrame {
    const f = this.frameOut, w = this.world;
    const look = (axis: string) => (input ? input.look(axis) : ZERO2);
    const zoom = (axis: string) => (input ? input.zoom(axis) : 0);
    f.possessionState = null; f.fade = null; f.cutaway = null; f.observerMode = null; f.subjectOpacity = 1;
    if (this.view === 'possess') {
      const l = look('orbit');
      const o = this.third.update(dt, this.followTarget, { yawDeg: l.x, pitchDeg: l.y, zoomLog: zoom('zoom'), recentre: !!input && input.pressed('recentre') },
        { trace: w.trace, underground: this.subjectUnderground, airborne: this.subjectAirborne });
      f.pose = o; f.focus = o.focusDistance; f.subjectOpacity = o.fade.target; f.possessionState = o.state; f.fade = o.fade;
    } else if (this.view === 'observer') {
      const l = look('obs-look');
      const m = input ? input.axis2('obs-move') : ZERO2;
      const vertical = input ? (input.held('obs-up') ? 1 : 0) - (input.held('obs-down') ? 1 : 0) : 0;
      const o = this.observer.update(dt, { yawDeg: l.x, pitchDeg: l.y, zoomLog: zoom('obs-zoom'), move: m, vertical, fast: !!input && input.active('obs-fast') },
        { trace: w.trace, groundHeight: w.groundHeight, followL: this.subjectLengthBu });
      f.pose = o; f.focus = o.focusDistance; f.observerMode = o.mode;
    } else if (this.view === 'colony') {
      const l = look('cv-rotate');
      const steps = input ? (input.pressedRepeat('cv-slice-up', SLICE_REPEAT_HZ) ? 1 : 0) - (input.pressedRepeat('cv-slice-down', SLICE_REPEAT_HZ) ? 1 : 0) : 0;
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

  /** Runs the rig without input for `seconds` so smoothing has settled (deterministic screenshots). */
  settle(seconds: number, dt: number): ViewFrame {
    let f = this.update(0, null);
    for (let t = 0; t < seconds; t += dt) f = this.update(dt, null);
    return f;
  }
}
