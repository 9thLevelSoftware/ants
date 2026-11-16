// Lens maths of photo mode on top of the camera rig (GDD 08 7.9): every setter clamps to the documented range and
// refuses NaN, so a slider, a key, a script or a corrupt value can never leave the rig outside its limits. Pure.
import { v3Normalize, vec3, type Vec3 } from '@/core';
import {
  PHOTO_EXPOSURE_EV, PHOTO_FOCAL_MM, PHOTO_FOCUS_BU, PHOTO_F_STOPS, PHOTO_ROLL_DEG, fNumberAt, focalForFov, fovForFocal, type PhotoRig,
} from '@/render/camera';
import { PHOTO_DEFAULT_F } from './constants';

export interface Lens {
  /** Full-frame equivalent focal length, mm. */
  focalMm: number;
  fNumber: number;
  /** Focus distance, BU. */
  focusBu: number;
  exposureEV: number;
  rollDeg: number;
}

/** The ranges the UI draws its sliders over. */
export interface LensRanges {
  focalMm: readonly [number, number];
  fNumber: readonly [number, number];
  focusBu: readonly [number, number];
  exposureEV: readonly [number, number];
  rollDeg: readonly [number, number];
}

export const LENS_RANGES: LensRanges = {
  focalMm: PHOTO_FOCAL_MM,
  fNumber: [PHOTO_F_STOPS[0], PHOTO_F_STOPS[PHOTO_F_STOPS.length - 1]],
  focusBu: PHOTO_FOCUS_BU,
  exposureEV: PHOTO_EXPOSURE_EV,
  rollDeg: PHOTO_ROLL_DEG,
};

/** Clamp to [lo, hi]; a non-finite value gives `fallback`. */
export function clampTo(v: number, lo: number, hi: number, fallback: number): number {
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

export function readLens(rig: PhotoRig): Lens {
  return {
    focalMm: focalForFov(rig.fov),
    fNumber: fNumberAt(rig.apertureIndex),
    focusBu: rig.focusMm / rig.bu,
    exposureEV: rig.exposureEV,
    rollDeg: rig.roll,
  };
}

export function setFocalMm(rig: PhotoRig, mm: number): void {
  rig.fov = fovForFocal(clampTo(mm, PHOTO_FOCAL_MM[0], PHOTO_FOCAL_MM[1], focalForFov(rig.fov)));
}

export function setFNumber(rig: PhotoRig, n: number): void {
  rig.setFNumber(clampTo(n, LENS_RANGES.fNumber[0], LENS_RANGES.fNumber[1], fNumberAt(rig.apertureIndex)));
}

export function setFocusBu(rig: PhotoRig, bu: number): void {
  rig.focusMm = clampTo(bu, PHOTO_FOCUS_BU[0], PHOTO_FOCUS_BU[1], rig.focusMm / rig.bu) * rig.bu;
}

/** Focus distance in mm (the unit of the world), clamped like the slider. */
export function setFocusMm(rig: PhotoRig, mm: number): void {
  setFocusBu(rig, mm / rig.bu);
}

export function setExposureEV(rig: PhotoRig, ev: number): void {
  rig.exposureEV = clampTo(ev, PHOTO_EXPOSURE_EV[0], PHOTO_EXPOSURE_EV[1], rig.exposureEV);
}

export function setRollDeg(rig: PhotoRig, deg: number): void {
  rig.roll = clampTo(deg, PHOTO_ROLL_DEG[0], PHOTO_ROLL_DEG[1], rig.roll);
}

/** Lens back to its entry state: f/2.8, no exposure compensation, no roll. Focal length and focus are left to the caller. */
export function resetLens(rig: PhotoRig): void {
  setFNumber(rig, PHOTO_DEFAULT_F);
  setExposureEV(rig, 0);
  setRollDeg(rig, 0);
}

const _d = vec3();
/** Points the camera at `p` (yaw and pitch only; roll is kept). False when `p` is at the camera. */
export function aimAt(rig: PhotoRig, p: Vec3): boolean {
  _d.x = p.x - rig.pos.x; _d.y = p.y - rig.pos.y; _d.z = p.z - rig.pos.z;
  if (v3Normalize(_d, _d) < 1e-6) return false;
  rig.yaw = Math.atan2(-_d.x, -_d.z);
  rig.pitch = Math.asin(Math.min(1, Math.max(-1, _d.y)));
  return true;
}

/** Unit view direction of the rig (what update() computes from yaw and pitch). */
export function viewDirection(rig: PhotoRig, out: Vec3): Vec3 {
  const cp = Math.cos(rig.pitch);
  out.x = -Math.sin(rig.yaw) * cp; out.y = Math.sin(rig.pitch); out.z = -Math.cos(rig.yaw) * cp;
  return out;
}
