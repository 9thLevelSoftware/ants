// The title backdrop's camera (GDD 08 §3.3): a low macro view of the vignette's ants that drifts sideways at
// 0.5 BU/s (a slow sine sweep, so it never leaves the vignette and never stops abruptly). Pure.
import type { Vec3 } from '@/core';
import type { CameraPose } from '@/render/camera';

export const TITLE_CAMERA = {
  /** Horizontal distance from the subject, BU. */
  distanceBU: 8,
  /** Height above the ground under the camera, BU. */
  heightBU: 3.2,
  /** The camera looks this far above the subject, BU (the ants sit slightly low in the frame). */
  lookUpBU: 1.2,
  /** Direction from the subject to the camera, degrees from +X toward +Z. */
  azimuthDeg: 25,
  /** GDD 08 §3.3 title drift speed, BU/s (peak speed of the sweep). */
  driftBUs: 0.5,
  /** Half-width of the sideways sweep, BU. */
  driftRangeBU: 8,
  /** The subject is framed right of centre (the title menu covers the left): look target shift, BU. */
  frameShiftBU: 3,
  fovDeg: 42,
  nearMm: 0.5,
  farMm: 60000,
} as const;

/** Sideways offset of the sweep at time t (s), BU: peak speed driftBUs, amplitude driftRangeBU. */
export function driftOffsetBU(t: number): number {
  const C = TITLE_CAMERA;
  return C.driftRangeBU * Math.sin((t * C.driftBUs) / C.driftRangeBU);
}

/** Camera pose at drift time `t` for a subject (mm) on ground `groundAt(x, z)` (mm), body unit `bu` (mm). */
export function titlePose(subject: Vec3, groundAt: (x: number, z: number) => number, bu: number, t: number, out: CameraPose): CameraPose {
  const C = TITLE_CAMERA, a = (C.azimuthDeg * Math.PI) / 180;
  const dx = Math.cos(a), dz = Math.sin(a), sx = -dz, sz = dx; // toward the camera, and sideways (to its left)
  const side = driftOffsetBU(t) * bu, shift = C.frameShiftBU * bu;
  const x = subject.x + dx * C.distanceBU * bu + sx * side, z = subject.z + dz * C.distanceBU * bu + sz * side;
  out.pos.x = x; out.pos.z = z;
  out.pos.y = Math.max(groundAt(x, z), subject.y) + C.heightBU * bu;
  // look past the subject toward the camera's left so the ants sit right of centre
  out.look.x = subject.x + sx * (side + shift); out.look.y = subject.y + C.lookUpBU * bu; out.look.z = subject.z + sz * (side + shift);
  out.up.x = 0; out.up.y = 1; out.up.z = 0;
  out.fov = C.fovDeg; out.near = C.nearMm; out.far = C.farMm;
  return out;
}
