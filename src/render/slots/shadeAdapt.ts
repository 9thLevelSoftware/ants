// Local exposure adaptation in deep shade (gate 1B): the world lighting meters the whole sky, so under a parked car
// or a bench the frame went nearly black and the possessed ant was barely visible. The world's static sky-occlusion
// map (terrain/skyOcclusion.ts) says how much sky the ground under the subject cannot see; a shaded subject on the
// ground opens the exposure by up to SHADE_ADAPT.maxEV, eased like an eye adapting. Open ground (occlusion 0) and a
// subject well above the ground (on the car roof) add nothing, so sunlit scenes are untouched.
import { SHADE_ADAPT } from './params';

/** A sky-occlusion grid as the world uploads it (0 open .. 255 fully occluded). */
export interface OcclusionGrid {
  data: ArrayLike<number>;
  width: number;
  height: number;
  /** 1 / (grid width in mm) per axis (the world's uSkyOccInv). */
  invX: number;
  invZ: number;
}

/** Occlusion 0..1 of the ground cell under (x, z); 0 outside the grid or without one. */
export function occlusionAt(g: OcclusionGrid | null, x: number, z: number): number {
  if (!g || g.width <= 0 || g.height <= 0) return 0;
  const i = Math.floor(x * g.invX * g.width), k = Math.floor(z * g.invZ * g.height);
  if (i < 0 || k < 0 || i >= g.width || k >= g.height) return 0;
  return (g.data[k * g.width + i] ?? 0) / 255;
}

/**
 * Exposure added for a subject at `heightAboveGround` mm over ground whose sky is `occ` hidden: the indirect light
 * left is about (1 - k occ), so open by log2(1 / (1 - k occ)), capped. Fades out over SHADE_ADAPT.liftMm above ground.
 */
export function shadeEV(occ: number, heightAboveGround: number): number {
  if (!(occ > 0)) return 0;
  const lift = Math.max(0, heightAboveGround);
  const near = lift >= SHADE_ADAPT.liftMm ? 0 : 1 - lift / SHADE_ADAPT.liftMm;
  const lit = Math.max(1e-3, 1 - SHADE_ADAPT.k * Math.min(1, occ));
  return Math.min(SHADE_ADAPT.maxEV, Math.log2(1 / lit)) * near;
}

/** Eases `current` toward `target` (dt <= 0 snaps: settled test frames). */
export function easeEV(current: number, target: number, dt: number): number {
  if (!(dt > 0)) return target;
  return current + (target - current) * (1 - Math.exp(-dt / SHADE_ADAPT.easeS));
}
