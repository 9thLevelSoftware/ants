// The soft blob shadow of a human-event actor, laid on the ground by the light of the scene: it leans away from the sun
// (or the moon at night), is longer the lower the sun is, slides away as the thing lifts, and is darker in strong light.
// At ant scale a person is a vast, out-of-focus mass, so the shadow is a wide soft radial blob (the blob texture of
// materials.ts), not the hard edged copy of a tool's outline that the sun's shadow map gives.
export interface SunBlob {
  /** Rotation about +Y that points the blob's local +X along the shadow direction. */
  yaw: number;
  /** Half extents along (major) and across (minor) the shadow direction, mm. */
  major: number;
  minor: number;
  /** Centre offset from the actor's contact point, mm (XZ). */
  dx: number;
  dz: number;
  /** 0..1 multiplier of the blob's darkness. */
  strength: number;
}

/** How far a shadow is allowed to lean (the cotangent of the sun's elevation, capped: a sun on the horizon is not a streak). */
export const SHADOW_MAX_COT = 3;
export const SHADOW_STRETCH_PER_COT = 0.55;
/** Darkness at night / overcast (the share of full) and how strongly the key light's share lifts it. */
export const SHADOW_MIN_STRENGTH = 0.35;

/**
 * `dir`: unit vector from the ground toward the light. `light`: the key light's intensity relative to full sun, 0..1.
 * `radius`: the actor's shadow radius, `minorK` the share across (a long thing is thin), `lift` how high it is, mm.
 */
export function sunBlob(dirX: number, dirY: number, dirZ: number, light: number, radius: number, minorK: number, lift: number, out: SunBlob): SunBlob {
  const hor = Math.hypot(dirX, dirZ);
  const cot = Math.min(SHADOW_MAX_COT, hor / Math.max(0.05, dirY));
  // the shadow falls away from the light
  const sx = hor > 1e-6 ? -dirX / hor : 1, sz = hor > 1e-6 ? -dirZ / hor : 0;
  out.yaw = Math.atan2(-sz, sx);
  const widen = 1 + (lift / 700);
  out.major = radius * widen * (0.8 + SHADOW_STRETCH_PER_COT * cot);
  out.minor = radius * widen * minorK;
  const slide = radius * 0.3 * cot + lift * cot * 0.5;
  out.dx = sx * slide;
  out.dz = sz * slide;
  out.strength = SHADOW_MIN_STRENGTH + (1 - SHADOW_MIN_STRENGTH) * Math.min(1, Math.max(0, light));
  return out;
}

export function newSunBlob(): SunBlob { return { yaw: 0, major: 0, minor: 0, dx: 0, dz: 0, strength: 1 }; }
