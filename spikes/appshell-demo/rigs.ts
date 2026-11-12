// Demo rig switcher: feeds the input system into the active rig and blends rig changes with CameraTransition.
// (The Game task owns the real view state machine; this is only enough to exercise the rigs.)
import { vec3 } from '@/core';
import type { InputContext, InputState } from '@/input';
import {
  CameraTransition, ColonyRig, ObserverRig, PhotoRig, ThirdPersonRig, copyPose, makePose, planTransition, type CameraPose, type CameraTarget,
  type TraceFn,
} from '@/render/camera';
import { DEMO_BU, demoGroundHeight } from '@/render/camera/testing/demoField';

export type RigName = 'third' | 'observer' | 'colony' | 'photo';
export const RIG_NAMES: RigName[] = ['third', 'observer', 'colony', 'photo'];
const CONTEXT: Record<RigName, InputContext> = { third: 'P', observer: 'O', colony: 'C', photo: 'Ph' };

export interface RigFrame {
  pose: CameraPose;
  dip: number;
  focus: number;
  focusRange: number | undefined;
  bokeh: number | null;
  antOpacity: number;
  info: Record<string, unknown>;
}

export class DemoRigs {
  readonly third = new ThirdPersonRig({ bu: DEMO_BU, bodyL: 1 });
  readonly observer = new ObserverRig({ bu: DEMO_BU, worldSize: 400 });
  readonly colony = new ColonyRig({ bu: DEMO_BU, worldSize: 400 });
  readonly photo = new PhotoRig(DEMO_BU);
  readonly transition = new CameraTransition();
  active: RigName = 'third';
  private last: CameraPose = makePose();
  private frame: RigFrame = { pose: makePose(), dip: 0, focus: 100, focusRange: undefined, bokeh: null, antOpacity: 1, info: {} };

  constructor(private readonly input: InputState, private readonly trace: TraceFn) {
    input.contexts.setBase('P');
  }

  /** Switch rig; `instant` skips the blend (used for screenshots). */
  set(name: RigName, target: CameraTarget, instant = false): void {
    if (name === this.active) return;
    const from = copyPose(makePose(), this.last);
    if (name === 'observer') {
      this.observer.setFollow(null);
      this.observer.setPose(vec3(target.pos.x - 70, 70, target.pos.z + 140), vec3(target.pos.x + 30, 10, target.pos.z));
      // the observer hold-after-loss timer must not run here: clear any follow state
    }
    if (name === 'colony') this.colony.enter(target.pos, false, demoGroundHeight, 0.5);
    if (name === 'photo') this.photo.enter(this.last);
    if (name === 'third') this.third.snap();
    this.active = name;
    this.input.contexts.setBase(CONTEXT[name]);
    const to = this.poseOnly(name, target, 0);
    this.transition.start(from, instant ? { kind: 'fly', duration: 0 } : planTransition(from, to, DEMO_BU, false));
  }

  private poseOnly(name: RigName, target: CameraTarget, dt: number): CameraPose {
    return this.updateRig(name, target, dt, true).pose;
  }

  private updateRig(name: RigName, target: CameraTarget, dt: number, quiet = false): RigFrame {
    const f = this.frame, inp = this.input, trace = this.trace;
    const look = (axis: string) => (quiet ? { x: 0, y: 0 } : inp.look(axis));
    const zoom = (axis: string) => (quiet ? 0 : inp.zoom(axis));
    f.bokeh = null; f.focusRange = undefined; f.antOpacity = 1;
    if (name === 'third') {
      const l = look('orbit');
      const o = this.third.update(dt, target, { yawDeg: l.x, pitchDeg: l.y, zoomLog: zoom('zoom'), recentre: !quiet && inp.pressed('recentre') }, { trace });
      f.pose = o; f.focus = o.focusDistance; f.antOpacity = o.fade.target;
      f.info = { state: o.state, dist: +o.distance.toFixed(2), desired: +o.desired.toFixed(2), fov: +o.fov.toFixed(1), near: +o.near.toFixed(3), fade: +o.fade.target.toFixed(2), occlusion: +o.fade.occlusion.toFixed(2) };
    } else if (name === 'observer') {
      const l = look('obs-look'), m = quiet ? { x: 0, y: 0 } : inp.axis2('obs-move');
      const vertical = quiet ? 0 : (inp.held('obs-up') ? 1 : 0) - (inp.held('obs-down') ? 1 : 0);
      const o = this.observer.update(dt, { yawDeg: l.x, pitchDeg: l.y, zoomLog: zoom('obs-zoom'), move: m, vertical, fast: !quiet && inp.active('obs-fast') }, { trace, groundHeight: demoGroundHeight });
      f.pose = o; f.focus = o.focusDistance;
      f.info = { mode: o.mode, pos: [o.pos.x, o.pos.y, o.pos.z].map((v) => +v.toFixed(1)) };
    } else if (name === 'colony') {
      const l = look('cv-rotate');
      const steps = quiet ? 0 : (inp.pressedRepeat('cv-slice-up', 8) ? 1 : 0) - (inp.pressedRepeat('cv-slice-down', 8) ? 1 : 0);
      const o = this.colony.update(dt, {
        yawDeg: l.x, pitchDeg: l.y, zoomLog: zoom('cv-zoom'), pan: quiet ? { x: 0, y: 0 } : inp.axis2('cv-pan'), panPx: quiet ? undefined : inp.dragPx('cv-pan'),
        sliceSteps: steps, sliceFast: inp.codeHeld('ShiftLeft'), cycleCutaway: !quiet && inp.pressed('cv-cutaway-mode'),
      }, { groundHeight: demoGroundHeight, trace, viewportHeight: 720 });
      f.pose = o; f.focus = o.focusDistance;
      f.info = { dist: +(this.colony.distance / DEMO_BU).toFixed(1) + ' BU', cutaway: o.cutaway.mode, sliceY: +o.cutaway.planeY.toFixed(1), rCut: o.cutaway.radius / DEMO_BU };
    } else {
      const l = look('ph-look'), m = quiet ? { x: 0, y: 0 } : inp.axis2('ph-move');
      const o = this.photo.update(dt, {
        yawDeg: l.x, pitchDeg: l.y, zoomLog: 0, move: m, vertical: quiet ? 0 : (inp.held('ph-up') ? 1 : 0) - (inp.held('ph-down') ? 1 : 0),
        focalLog: -zoom('ph-focal'), focusLog: zoom('ph-focus-dist'),
        apertureSteps: quiet ? 0 : (inp.pressed('ph-aperture-up') ? -1 : 0) + (inp.pressed('ph-aperture-down') ? 1 : 0),
        exposureSteps: quiet ? 0 : (inp.pressed('ph-exposure-up') ? 1 : 0) - (inp.pressed('ph-exposure-down') ? 1 : 0),
        roll: quiet ? 0 : (inp.held('ph-roll-right') ? 1 : 0) - (inp.held('ph-roll-left') ? 1 : 0),
        fast: !quiet && inp.codeHeld('ShiftLeft'),
      }, trace);
      f.pose = o; f.focus = o.dof.focusDistance; f.focusRange = o.dof.focusRange; f.bokeh = o.dof.bokehScale;
      f.info = { fNumber: +o.fNumber.toFixed(1), focalMm: Math.round(o.focalMm), fov: +o.fov.toFixed(1), focus: +o.dof.focusDistance.toFixed(1), ev: o.exposureEV, roll: o.rollDeg };
    }
    return f;
  }

  update(dt: number, target: CameraTarget): RigFrame {
    const f = this.updateRig(this.active, target, dt);
    const t = this.transition.update(dt, f.pose);
    copyPose(this.last, t.pose);
    f.pose = this.last;
    f.dip = t.dip;
    return f;
  }
}
