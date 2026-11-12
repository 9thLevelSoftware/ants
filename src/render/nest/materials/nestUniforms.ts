// Uniforms shared by every nest material (walls of every substrate, x-ray passes, cap). One Uniform object per
// value: update `.value` once per frame and every material sees it (tech-stack 7).
import { Color, Uniform, Vector2, Vector3, Vector4 } from 'three';
import { NEST_LIGHT, XRAY } from '../params';

export const CUT_OFF = 0, CUT_SLICE = 1, CUT_XRAY = 2;

export interface NestUniforms {
  /** Discard band below the soil surface, mm. */
  uSkin: Uniform<number>;
  /** Sky openings near the camera: xyz centre on the surface, w radius (mm), and how many are valid. */
  uSky: Uniform<Vector4[]>;
  uSkyN: Uniform<number>;
  /** Daylight shaft e-folding length, mm. */
  uSkyLen: Uniform<number>;
  /** Daylight radiance at the mouth (linear, already x level). */
  uSkyCol: Uniform<Color>;
  /** Ambient radiance (linear, x level). */
  uAmb: Uniform<Color>;
  /** x boost factor at entrances, y falloff length mm. */
  uAmbNear: Uniform<Vector2>;
  /** x factor at depth, y depth mm where it is reached. */
  uAmbDeep: Uniform<Vector2>;
  /** Sense light ("lantern") position (world mm), colour x level, radius mm, wrap. */
  uLanternPos: Uniform<Vector3>;
  uLanternCol: Uniform<Color>;
  uLanternR: Uniform<number>;
  uLanternWrap: Uniform<number>;
  /** Moisture -> wetness: x scale, y offset (setMoisture hook). */
  uMoist: Uniform<Vector2>;
  /** Cutaway: mode (0 off, 1 slice, 2 x-ray), plane point, plane normal (towards the hidden side), radius. */
  uCutMode: Uniform<number>;
  uCutC: Uniform<Vector3>;
  uCutN: Uniform<Vector3>;
  uCutR: Uniform<number>;
  /** Surface darkening outside the cut radius in slice mode (GDD 30 %). */
  uCutDark: Uniform<number>;
  /** Fill light into the cut nest (linear, x level) and its falloff from the plane, mm. */
  uCutFill: Uniform<Color>;
  uCutFillLen: Uniform<number>;
  /** X-ray cast colours (linear) near the surface and at depth, the depth (mm), opacity. */
  uXNear: Uniform<Color>;
  uXDeep: Uniform<Color>;
  uXDepth: Uniform<number>;
  uXOpacity: Uniform<number>;
  /** Body unit, mm (noise scales). */
  uBu: Uniform<number>;
}

export function createNestUniforms(): NestUniforms {
  return {
    uSkin: new Uniform(0.2),
    uSky: new Uniform(Array.from({ length: NEST_LIGHT.maxOpenings }, () => new Vector4(0, -1e6, 0, 0))),
    uSkyN: new Uniform(0),
    uSkyLen: new Uniform(4.8),
    uSkyCol: new Uniform(new Color(1, 1, 1)),
    uAmb: new Uniform(new Color(0.02, 0.015, 0.01)),
    uAmbNear: new Uniform(new Vector2(1, 40)),
    uAmbDeep: new Uniform(new Vector2(1, 160)),
    uLanternPos: new Uniform(new Vector3(0, -1e6, 0)),
    uLanternCol: new Uniform(new Color(1, 0.7, 0.45)),
    uLanternR: new Uniform(48),
    uLanternWrap: new Uniform(0.35),
    uMoist: new Uniform(new Vector2(NEST_LIGHT.moistScale, NEST_LIGHT.moistOffset)),
    uCutMode: new Uniform(0),
    uCutC: new Uniform(new Vector3()),
    uCutN: new Uniform(new Vector3(0, 1, 0)),
    uCutR: new Uniform(480),
    uCutDark: new Uniform(0.3),
    uCutFill: new Uniform(new Color(1, 1, 1)),
    uCutFillLen: new Uniform(160),
    uXNear: new Uniform(new Color(XRAY.nearHex)),
    uXDeep: new Uniform(new Color(XRAY.deepHex)),
    uXDepth: new Uniform(160),
    uXOpacity: new Uniform(XRAY.opacity),
    uBu: new Uniform(4),
  };
}
