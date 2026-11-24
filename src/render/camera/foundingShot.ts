// The founding chamber shot (look pass 5, constants.ts FSHOT_*): a pure pose and slice for the time-lapse, the outcome card
// and the failure card. Millimetres, Y up. No three, no sim types: the Game hands in the subject's bounding sphere.
import { DEG } from './frameMath';
import {
  CAM_FAR_BU, FSHOT_CUT_REACH, FSHOT_EASE_MOVE_BU_PER_S, FSHOT_EASE_RADIUS_BU_PER_S, FSHOT_EASE_TAU_S, FSHOT_FILL, FSHOT_FOV_DEG,
  FSHOT_MIN_RADIUS_BU, FSHOT_PITCH_DEG,
} from './constants';
import type { CutawayParams } from './colonyRig';
import { makePose, type CameraPose } from './types';

/** What the shot frames: the queen, her brood and workers as one sphere, and the height of the cell's roof. */
export interface FoundingShotSubject {
  x: number;
  y: number;
  z: number;
  /** Bounding radius of everything to be seen, mm. */
  radius: number;
  /** World height of the slice plane, mm: above the animals' backs, below the roof, so the cut cap has the cell as a hole in it. */
  cutY: number;
  /**
   * The subject is shown this far above the middle of the frame (0..1 of the half height) and fills `fill` of it: the outcome and
   * failure cards stand in the middle of the screen, so behind them the cell goes into the upper part. Default 0 and FSHOT_FILL.
   */
  lift?: number;
  fill?: number;
  /** The subject sphere counts as at least this many BU across half (default FSHOT_MIN_RADIUS_BU): a subject that is the whole cell (card shot) may be smaller than a lone queen's frame. */
  minRadiusBu?: number;
  /**
   * The queen's own frame, when she is part of the subject (the cards' shot): where she stands, her surface normal and heading, her length.
   * With it the view director takes the cell camera's choice between the view from above and the side view, so a queen on a steep wall of the
   * throat is not cut by a horizontal slice. Not eased; absent = the slice from above always (tests, the chamber fallback).
   */
  ant?: { pos: { x: number; y: number; z: number }; up: { x: number; y: number; z: number }; fwd: { x: number; y: number; z: number }; lengthMm: number };
  /** Set by the cell camera's subject: false when no height of the slice plane over the ant is open air (a roof lower than her back). */
  open?: boolean;
}

/** Copies the numbers of a subject (no allocation). */
export function copyShotSubject(out: FoundingShotSubject, s: FoundingShotSubject): FoundingShotSubject {
  out.x = s.x; out.y = s.y; out.z = s.z; out.radius = s.radius; out.cutY = s.cutY;
  out.lift = s.lift ?? 0; out.fill = s.fill ?? FSHOT_FILL; out.minRadiusBu = s.minRadiusBu;
  out.ant = s.ant;
  return out;
}

const approach = (v: number, to: number, k: number, maxStep: number): number => {
  const d = (to - v) * k;
  return v + (d > maxStep ? maxStep : d < -maxStep ? -maxStep : d);
};

/**
 * One step of the eased subject: `held` moves toward `target` by an exponential approach (FSHOT_EASE_TAU_S) with a speed cap on the
 * radius and the centre, so no change of the subject (a worker crossing the reach, brood lifted, the card opening) jumps the camera.
 * The slice height is not eased (an animal must never be cut away with the soil; the plane already sits under the roof, shotSubject.ts); `dt` 0 changes nothing. Allocation-free.
 */
export function easeShotSubject(held: FoundingShotSubject, target: FoundingShotSubject, dt: number, bu: number): void {
  if (dt <= 0) return;
  const k = 1 - Math.exp(-dt / FSHOT_EASE_TAU_S);
  const move = FSHOT_EASE_MOVE_BU_PER_S * bu * dt, grow = FSHOT_EASE_RADIUS_BU_PER_S * bu * dt;
  held.x = approach(held.x, target.x, k, move);
  held.y = approach(held.y, target.y, k, move);
  held.z = approach(held.z, target.z, k, move);
  held.radius = approach(held.radius, target.radius, k, grow);
  held.lift = approach(held.lift ?? 0, target.lift ?? 0, k, Infinity);
  held.fill = approach(held.fill ?? FSHOT_FILL, target.fill ?? FSHOT_FILL, k, Infinity);
}

export interface FoundingShot {
  pose: CameraPose;
  cutaway: CutawayParams;
  /** Distance camera to subject, mm (the depth-of-field focus). */
  distance: number;
}

export function makeFoundingShot(): FoundingShot {
  return {
    pose: makePose(),
    cutaway: { mode: 'slice', planeY: 0, radius: 0, center: { x: 0, z: 0 }, outsideDarken: 0.3, minPlaneY: -1e9 },
    distance: 0,
  };
}

/** Camera distance that fits a sphere of `radius` into FSHOT_FILL of the frame height. */
export function foundingShotDistance(radiusMm: number, fill = FSHOT_FILL): number {
  return radiusMm / (fill * Math.sin((FSHOT_FOV_DEG * DEG) / 2));
}

/**
 * Looks lower than the pose's `look` point by the angle that puts it `lift` above the middle of the frame (0..1 of the half height): the view
 * axis tilts down about the camera's right axis, the subject (the old look point) rises in the picture. No change for lift 0.
 */
export function applyLift(o: CameraPose, lift: number): void {
  if (lift === 0) return;
  const tilt = Math.atan(lift * Math.tan((FSHOT_FOV_DEG * DEG) / 2));
  const dx = o.look.x - o.pos.x, dy = o.look.y - o.pos.y, dz = o.look.z - o.pos.z, dl = Math.hypot(dx, dy, dz) || 1;
  // up in the view = world up made perpendicular to the view direction
  const ux0 = 0 - (dy / dl) * (dx / dl), uy0 = 1 - (dy / dl) * (dy / dl), uz0 = 0 - (dy / dl) * (dz / dl), ul = Math.hypot(ux0, uy0, uz0) || 1;
  const c = Math.cos(tilt), sn = Math.sin(tilt);
  o.look.x = o.pos.x + (dx / dl * c - ux0 / ul * sn) * dl;
  o.look.y = o.pos.y + (dy / dl * c - uy0 / ul * sn) * dl;
  o.look.z = o.pos.z + (dz / dl * c - uz0 / ul * sn) * dl;
}

/**
 * Fills `out` for the subject seen from `yawRad` (0 = from +Z). Allocation-free. `minRadiusBu` replaces FSHOT_MIN_RADIUS_BU: the cell camera
 * (cellCam.ts) frames one ant, not a chamber.
 */
export function foundingShotAt(out: FoundingShot, s: FoundingShotSubject, yawRad: number, bu: number, minRadiusBu = FSHOT_MIN_RADIUS_BU): FoundingShot {
  const r = Math.max(s.radius, (s.minRadiusBu ?? minRadiusBu) * bu);
  const d = foundingShotDistance(r, s.fill), p = FSHOT_PITCH_DEG * DEG, cp = Math.cos(p);
  const o = out.pose;
  o.pos.x = s.x + Math.sin(yawRad) * cp * d;
  o.pos.y = s.y + Math.sin(p) * d;
  o.pos.z = s.z + Math.cos(yawRad) * cp * d;
  o.look.x = s.x; o.look.y = s.y; o.look.z = s.z;
  applyLift(o, s.lift ?? 0);
  o.up.x = 0; o.up.y = 1; o.up.z = 0;
  o.fov = FSHOT_FOV_DEG;
  o.near = Math.max(0.02 * d, 0.05 * bu);
  o.far = CAM_FAR_BU * bu;
  out.distance = d;
  const c = out.cutaway;
  c.mode = 'slice';
  c.planeY = s.cutY;
  c.center.x = s.x; c.center.z = s.z;
  c.radius = Math.max(cp * d * FSHOT_CUT_REACH, 8 * bu);
  return out;
}
