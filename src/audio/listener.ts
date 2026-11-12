// What the audio engine knows about the listener (GDD 08 §13.3), as plain data the game adapter fills each frame.
import type { Vec3 } from '@/core/math/vec3';

export interface Listener {
  /** Listener position: the possessed ant's head, or the camera in observer / colony / photo views (mm). */
  pos: Vec3;
  /** Point that ant-scale distances are measured from: = pos when possessing, the camera focus otherwise. */
  hear: Vec3;
  /** Camera right vector (unit), for stereo panning. */
  right: Vec3;
  /** Body unit, mm. */
  bu: number;
  /** Listener in a cavity / below ground. */
  underground: boolean;
  /** BU below the local ground surface (0 above it). */
  depthBu: number;
  /** Possessed ant position (its own sounds get top priority), null when not possessing. */
  possessedPos: Vec3 | null;
  /** Ground height at (x, z) in mm; null = flat ground at y = 0. */
  groundAt: ((x: number, z: number) => number) | null;
  /** True when solid lies between a and b (line-of-sight occlusion); null = never occluded. */
  solidBetween: ((a: Vec3, b: Vec3) => boolean) | null;
}

export function newListener(bu = 4): Listener {
  return {
    pos: { x: 0, y: 0, z: 0 }, hear: { x: 0, y: 0, z: 0 }, right: { x: 1, y: 0, z: 0 }, bu, underground: false, depthBu: 0,
    possessedPos: null, groundAt: null, solidBetween: null,
  };
}

/** BU below ground of a point (0 at or above the surface). */
export function depthBelowGround(l: Listener, p: Vec3): number {
  const g = l.groundAt ? l.groundAt(p.x, p.z) : 0;
  return Math.max(0, (g - p.y) / l.bu);
}

export function distBu(a: Vec3, b: Vec3, bu: number): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) / bu;
}
