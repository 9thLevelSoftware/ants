// Forest light (GDD 08 11.3): "dappled: a moving leaf-shadow pattern on the sun light (period 4-8 real s, amplitude
// 0 in reduced motion)". The canopy is far above the ant, so its gaps are projected along the key light onto
// whatever is lit (ground, mounds, objects) as soft sun flecks; the pattern sways with two incommensurate periods
// inside the GDD's 4-8 s. Applied to the key (directional) light only, after its shadow, in every world material,
// and only where a canopy mask (the forest zones) says there are trees overhead.
import { ShaderChunk } from 'three';

export const FOREST_DAPPLE = {
  /** How much of the direct sun the canopy takes away between flecks, 0..1. */
  depth: 0.85,
  /** Pattern values between which shade turns into a fleck: about a third of the floor is in sun. */
  fleck: [0.57, 0.67] as const,
  /** Size of the fleck pattern, BU. */
  scaleBU: 16,
  /** Sway periods, real seconds (GDD 08 11.3: 4-8 s). */
  periodsS: [6.1, 4.4] as const,
  /** Sway amplitude, in pattern cells. */
  sway: 0.3,
} as const;

const f = (n: number) => n.toFixed(4);

/**
 * Declarations: `uWrDapple` = (amount 0..1, sway clock s, key light slope x, slope z), `uWrDappleMm` fleck size,
 * `tWrCanopy` where the canopy is (forest zones; soft edges), so a high camera sees flecks only on the forest floor.
 */
export const GLSL_DAPPLE = /* glsl */ `
uniform vec4 uWrDapple; uniform float uWrDappleMm; uniform sampler2D tWrCanopy; uniform vec2 uWrCanopyInv;
float wrDapple(vec3 w) {
  if (uWrDapple.x <= 0.0) return 1.0;
  float canopy = texture2D(tWrCanopy, w.xz * uWrCanopyInv).r;
  if (canopy <= 0.0) return 1.0;
  vec2 p = (w.xz - uWrDapple.zw * w.y) / uWrDappleMm;
  float t = uWrDapple.y;
  vec2 sway = vec2(sin(t * ${f((2 * Math.PI) / FOREST_DAPPLE.periodsS[0])}), sin(t * ${f((2 * Math.PI) / FOREST_DAPPLE.periodsS[1])} + 1.3)) * ${f(FOREST_DAPPLE.sway)};
  float n = wrFbm(p + sway) + 0.12 * wrNoise(p * 3.1 - sway * 1.7);
  float lit = smoothstep(${f(FOREST_DAPPLE.fleck[0])}, ${f(FOREST_DAPPLE.fleck[1])}, n);
  return 1.0 - uWrDapple.x * canopy * (1.0 - lit);
}
`;

const DIR_LIGHT_INFO = 'getDirectionalLightInfo( directionalLight, directLight );';

/** three's lights_fragment_begin with the dapple applied to the directional (key) light. */
export function dappledLightsChunk(): string {
  const src = ShaderChunk.lights_fragment_begin;
  if (!src.includes(DIR_LIGHT_INFO)) throw new Error('lights_fragment_begin changed: dapple patch point missing');
  return src.replace(DIR_LIGHT_INFO, `${DIR_LIGHT_INFO}\n\t\tdirectLight.color *= wrDapple(vWrW);`);
}
