// Where the free observer camera starts when no ant is followed (game start in observer view, leaving a view
// without a subject): behind and above the point, looking at it.
import type { Vec3 } from '@/core';

/** Offsets of the observer start pose from the point it looks at, BU (presentation constants). */
export const OBS_START_BACK_BU = 45;
export const OBS_START_UP_BU = 28;

export function observerStartPose(p: Vec3, bu: number): { pos: Vec3; look: Vec3 } {
  return {
    pos: { x: p.x - OBS_START_BACK_BU * bu * 0.6, y: p.y + OBS_START_UP_BU * bu, z: p.z + OBS_START_BACK_BU * bu * 0.8 },
    look: { x: p.x, y: p.y, z: p.z },
  };
}
