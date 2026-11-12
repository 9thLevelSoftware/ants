// Underground state of the view: is the camera inside the nest (with hysteresis), the eased 0..1 factor the post
// chain and the world renderer follow (exposure and fog switch, GDD 01 6.1: adaptation 1.0 real s), and the nest
// look values for callers that drive exposure/fog themselves. Pure maths (no three).
import { NEST_LOOK } from '../params';

export interface NestLook {
  /** Camera inside the nest (hysteresis applied): pass this as FrameInfo.underground. */
  underground: boolean;
  /** Eased 0 surface .. 1 underground. */
  under: number;
  /** Depth of the camera below the substrate surface, mm (negative above). */
  depthMm: number;
  /** Exposure the post chain should use, EV: lerp(surfaceEV, NEST_LOOK.exposureEV, under). */
  exposureEV: number;
  /** Underground fog colour (sRGB hex x level) and exp2 density (1 / visibility), blend by `under`. */
  fogHex: string;
  fogLevel: number;
  fogDensity: number;
}

export function createNestLook(): NestLook {
  return { underground: false, under: 0, depthMm: 0, exposureEV: 0, fogHex: NEST_LOOK.fogHex, fogLevel: NEST_LOOK.fogLevel, fogDensity: 0 };
}

/**
 * One frame. `substrate` = camera's distance to the substrate surface (mm, > 0 above ground, carve ignored).
 * `dt` = real seconds since the last frame (0 = snap, used for the first frame and deterministic screenshots).
 */
export function updateNestLook(look: NestLook, substrate: number, bu: number, dt: number, surfaceEV: number): NestLook {
  const depth = -substrate;
  look.depthMm = depth;
  if (!look.underground && depth > NEST_LOOK.enterDepthBU * bu) look.underground = true;
  else if (look.underground && depth < NEST_LOOK.exitDepthBU * bu) look.underground = false;
  const target = look.underground ? 1 : 0;
  const tau = NEST_LOOK.adaptS / 3;
  look.under = dt <= 0 ? target : look.under + (target - look.under) * (1 - Math.exp(-dt / tau));
  if (Math.abs(look.under - target) < 1e-4) look.under = target;
  look.exposureEV = surfaceEV + (NEST_LOOK.exposureEV - surfaceEV) * look.under;
  look.fogDensity = 1 / (NEST_LOOK.fogVisBU * bu);
  return look;
}
