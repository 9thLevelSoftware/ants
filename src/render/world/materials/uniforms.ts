// Uniforms shared by every world material (terrain, primitives, mounds) and offered to the other world renderers
// (grass, decor, water, weather): update `.value` once per frame and every patched material sees it
// (tech-stack 7: share one Uniform object between materials).
import { Color, Uniform, Vector2, Vector3, Vector4, type Texture } from 'three';

export interface WorldUniforms {
  /** Animation clock, seconds (frozen in deterministic screenshots). */
  uTime: Uniform<number>;
  /** Surface wetness 0 dry .. 1 soaked (WorldRenderer.setWetness). */
  uWet: Uniform<number>;
  /** Unit wind direction in XZ and strength (radians of extra bend for foliage, 0..~0.2). */
  uWindDir: Uniform<Vector2>;
  uWind: Uniform<number>;
  /** Position of the real view camera (cameraPosition is the light camera inside shadow passes). */
  uCamPos: Uniform<Vector3>;
  /** Subject the camera looks at (possessed ant / followed entity), mm. */
  uSubject: Uniform<Vector3>;
  /** 0 on the surface .. 1 fully underground (surface materials dim themselves). */
  uUnder: Uniform<number>;
  /** Linear haze colour (equals the fog colour) for materials that fade by hand. */
  uHaze: Uniform<Color>;
  /** Forest leaf-shadow dapple on the key light (materials/dapple.ts): amount, sway clock s, light slope x, z. */
  uDapple: Uniform<Vector4>;
  /** Dapple fleck size, mm. */
  uDappleMm: Uniform<number>;
  /** Where the canopy is (R: 1 forest .. 0 open sky) over the world, and 1 / its extent in mm (x, z). */
  tDappleMask: Uniform<Texture | null>;
  uDappleMaskInv: Uniform<Vector2>;
}

export function createWorldUniforms(): WorldUniforms {
  return {
    uTime: new Uniform(0),
    uWet: new Uniform(0),
    uWindDir: new Uniform(new Vector2(0.8, -0.6).normalize()),
    uWind: new Uniform(0.08),
    uCamPos: new Uniform(new Vector3()),
    uSubject: new Uniform(new Vector3()),
    uUnder: new Uniform(0),
    uHaze: new Uniform(new Color(0.5, 0.55, 0.6)),
    uDapple: new Uniform(new Vector4(0, 0, 0, 0)),
    uDappleMm: new Uniform(64),
    tDappleMask: new Uniform(null),
    uDappleMaskInv: new Uniform(new Vector2(0, 0)),
  };
}
