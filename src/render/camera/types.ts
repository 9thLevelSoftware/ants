// Camera rig contracts. Structural and in millimetres (seed section 3); no simulation types are imported, so the
// Game task can feed the possessed ant, a followed creature or a scripted path.
import type { Vec3 } from '@/core';

/** What a rig follows: a point on a surface with its surface normal and heading (both unit vectors). */
export interface CameraTarget {
  pos: Vec3;
  up: Vec3;
  fwd: Vec3;
}

/**
 * Collision query: how far a sphere of `radius` (mm) can travel from `origin` along unit `dir` before touching
 * solid (f(p) < radius), capped at `maxDist`. Returns 0 when the sphere already touches solid at the origin.
 * The world service's sphereTrace has this meaning; spheretrace.ts builds one from any analytic field.
 */
export type TraceFn = (origin: Vec3, dir: Vec3, maxDist: number, radius: number) => number;

/** A renderable camera pose. */
export interface CameraPose {
  pos: Vec3;
  /** Point the camera looks at. */
  look: Vec3;
  up: Vec3;
  /** Vertical field of view, degrees. */
  fov: number;
  near: number;
  far: number;
}

export function makePose(): CameraPose {
  return { pos: { x: 0, y: 0, z: 0 }, look: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, fov: 60, near: 0.1, far: 1000 };
}

export function copyPose(out: CameraPose, p: CameraPose): CameraPose {
  out.pos.x = p.pos.x; out.pos.y = p.pos.y; out.pos.z = p.pos.z;
  out.look.x = p.look.x; out.look.y = p.look.y; out.look.z = p.look.z;
  out.up.x = p.up.x; out.up.y = p.up.y; out.up.z = p.up.z;
  out.fov = p.fov; out.near = p.near; out.far = p.far;
  return out;
}

/** Per-frame look input for orbit-style rigs, already converted by the input layer. */
export interface OrbitInput {
  /** View yaw to the right, degrees this frame. */
  yawDeg: number;
  /** View pitch up, degrees this frame. */
  pitchDeg: number;
  /** Natural-log distance step this frame (positive = farther). */
  zoomLog: number;
  /** Recentre requested this frame. */
  recentre?: boolean;
}

export const NO_ORBIT_INPUT: Readonly<OrbitInput> = { yawDeg: 0, pitchDeg: 0, zoomLog: 0 };

/** Visibility outputs for renderers (GDD 01 6.5). */
export interface FadeOutput {
  /** Opacity of the target (possessed ant and its carried item), 0..1. */
  target: number;
  /** Strength 0..1 of the occlusion cutaway: dither terrain/carve/primitive fragments inside the capsule. */
  occlusion: number;
  /**
   * Occlusion shape, for the dithering: a cone from capsuleA (the camera) to capsuleB (a point short of the
   * target's thorax) with radius capsuleRadius (mm) at B, narrowing to coneStart x that at A. Only fragments
   * between A and B are dithered (views-task deviation from GDD 01 6.5 rule 3's capsule; see fade.ts).
   */
  capsuleA: Vec3;
  capsuleB: Vec3;
  capsuleRadius: number;
  /** Cone radius at the camera as a fraction of capsuleRadius (1 = a cylinder); undefined reads as 1. */
  coneStart?: number;
}

export type PossessionCamState = 'open' | 'chamber' | 'tunnel' | 'crevice' | 'falling' | 'flight';
