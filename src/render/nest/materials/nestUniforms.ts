// Uniforms shared by every nest material (walls of every substrate, x-ray passes, cap). One Uniform object per
// value: update `.value` once per frame and every material sees it (tech-stack 7).
import { Color, Uniform, Vector2, Vector3, Vector4 } from 'three';
import { FLOOD_VOLUME, FRESH_WALL, NEST_LIGHT, XRAY } from '../params';

export const CUT_OFF = 0, CUT_SLICE = 1, CUT_XRAY = 2;

export interface NestUniforms {
  /** Discard band below the soil surface, mm. */
  uSkin: Uniform<number>;
  /** Width outside a terrain hole's edge where the skin band is not applied, mm (HOLE_LIP_BU). */
  uHoleLip: Uniform<number>;
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
  /** Gain on the cut face's own light (cap colour, cut fill), <= 1: holds it against a brighter surface exposure. */
  uCutGain: Uniform<number>;
  /** X-ray cast colours (linear) near the surface and at depth, the depth (mm), opacity. */
  uXNear: Uniform<Color>;
  uXDeep: Uniform<Color>;
  uXDepth: Uniform<number>;
  uXOpacity: Uniform<number>;
  /** Body unit, mm (noise scales). */
  uBu: Uniform<number>;
  /** Simulation tick now, and the fresh-wall look: x duration (ticks), y albedo factor, z extra wetness. */
  uTick: Uniform<number>;
  uFresh: Uniform<Vector3>;
  /** Standing water (params.ts FLOOD_VOLUME): x level (world y, mm), y e-fold depth (mm), z strength, w on (0 / 1); the tint multiplier and the deep colour added. */
  uFlood: Uniform<Vector4>;
  uFloodTint: Uniform<Color>;
  uFloodDeep: Uniform<Color>;
  /** Occlusion cone (camera -> short of the possessed ant, see glsl.ts): ends, x end radius (0 = off), y fraction kept. */
  uOccA: Uniform<Vector3>;
  uOccB: Uniform<Vector3>;
  uOcc: Uniform<Vector2>;
}

export function createNestUniforms(): NestUniforms {
  return {
    uSkin: new Uniform(0.2),
    uHoleLip: new Uniform(1),
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
    uCutGain: new Uniform(1),
    uXNear: new Uniform(new Color(XRAY.nearHex)),
    uXDeep: new Uniform(new Color(XRAY.deepHex)),
    uXDepth: new Uniform(160),
    uXOpacity: new Uniform(XRAY.opacity),
    uBu: new Uniform(4),
    uTick: new Uniform(0),
    uFresh: new Uniform(new Vector3(FRESH_WALL.ticks, FRESH_WALL.darken, FRESH_WALL.wet)),
    uFlood: new Uniform(new Vector4(0, FLOOD_VOLUME.efoldMm, FLOOD_VOLUME.strength, 0)),
    uFloodTint: new Uniform(new Color(...FLOOD_VOLUME.tint)),
    uFloodDeep: new Uniform(new Color(...FLOOD_VOLUME.deep)),
    uOccA: new Uniform(new Vector3()),
    uOccB: new Uniform(new Vector3()),
    uOcc: new Uniform(new Vector2(0, 0.25)),
  };
}
