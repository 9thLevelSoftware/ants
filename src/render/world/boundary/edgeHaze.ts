// Exponential haze from the map edge outward (GDD 04 §14), patched into the boundary's own standard materials. It
// replaces their fog: a fragment first takes the scene's distance haze exactly as the terrain does (so skirt and
// terrain meet without a seam at the edge), then 1 - exp(-d / k) more for a point d mm outside the map, toward the
// sky colour seen in that direction (aerial perspective: far shapes dissolve into the sky behind them, so they read
// as distance, not as pale cut-outs). Grazing silhouettes take a little more (soft, out-of-focus-looking edges).
//
// The edge haze has its own uniforms and does not depend on scene.fog: with the player's Haze setting off the
// distance haze goes, but the boundary keeps its edge haze and the skirt's end and the backdrop stay hidden.
import { Color, Uniform, Vector3, Vector4, type MeshStandardMaterial } from 'three';

export interface EdgeHazeUniforms {
  /** Map square [x0, z0, x1, z1], mm. */
  uBdBox: Uniform<Vector4>;
  /** Haze length scale, mm. */
  uBdHazeMm: Uniform<number>;
  /** Sky at the horizon (= the scene's haze colour) and at the zenith, linear; overcast flattening 0..1. */
  uBdHorizon: Uniform<Color>;
  uBdZenith: Uniform<Color>;
  uBdOvercast: Uniform<number>;
  /** Forward-scattering glow around the sun (direction, colour x strength). */
  uBdSunDir: Uniform<Vector3>;
  uBdSunGlow: Uniform<Color>;
}

export function createEdgeHazeUniforms(): EdgeHazeUniforms {
  return {
    uBdBox: new Uniform(new Vector4(0, 0, 1, 1)), uBdHazeMm: new Uniform(1),
    uBdHorizon: new Uniform(new Color(0.75, 0.78, 0.8)), uBdZenith: new Uniform(new Color(0.3, 0.45, 0.7)), uBdOvercast: new Uniform(0),
    uBdSunDir: new Uniform(new Vector3(0, 1, 0)), uBdSunGlow: new Uniform(new Color(0, 0, 0)),
  };
}

/** What the edge haze needs from the world lighting (structurally the world renderer's LightingState). */
export interface EdgeHazeLight {
  skyHorizon: Color;
  skyZenith: Color;
  overcast: number;
  sunDir: Vector3;
  sunGlow: number;
  keyColor: Color;
}

/** Copies the current sky into the edge-haze uniforms (every frame; cheap). */
export function applyEdgeHazeLight(u: EdgeHazeUniforms, l: EdgeHazeLight): void {
  u.uBdHorizon.value.copy(l.skyHorizon);
  u.uBdZenith.value.copy(l.skyZenith);
  u.uBdOvercast.value = Number.isFinite(l.overcast) ? Math.min(1, Math.max(0, l.overcast)) : 0;
  u.uBdSunDir.value.copy(l.sunDir);
  u.uBdSunGlow.value.copy(l.keyColor).multiplyScalar(Number.isFinite(l.sunGlow) ? Math.max(0, l.sunGlow) : 0);
}

/**
 * GLSL: the edge haze fraction for a world position, and the sky colour in a view direction. The sky mirrors the
 * dome's gradient and glow (src/render/world/sky/skyDome.ts; discs and stars left out): below the horizon it is the
 * horizon colour, which is the scene's haze colour, so the ground's haze matches the terrain's.
 */
export const EDGE_HAZE_GLSL = /* glsl */ `
float bdEdgeHaze(vec3 w) {
  vec2 o = max(max(uBdBox.xy - w.xz, w.xz - uBdBox.zw), vec2(0.0));
  return 1.0 - exp(-length(o) / max(uBdHazeMm, 1e-3));
}
vec3 bdSky(vec3 d) {
  float t = pow(clamp(d.y, 0.0, 1.0), mix(0.45, 1.0, uBdOvercast));
  vec3 sky = mix(uBdHorizon, uBdZenith, t);
  float mu = max(dot(d, normalize(uBdSunDir)), 0.0);
  sky += uBdSunGlow * (0.25 * pow(mu, 6.0) + 0.6 * pow(mu, 48.0)) * (1.0 - 0.6 * t) * smoothstep(-0.12, 0.02, uBdSunDir.y);
  return mix(uBdHorizon, sky, smoothstep(-0.02, 0.01, d.y));
}
`;

/** Per-material look of the haze: extra rim haze, a haze floor, and silhouette fuzz (hashed alpha); all 0 for the skirt. */
export interface EdgeHazeLook {
  rim: Uniform<number>;
  minHaze: Uniform<number>;
  fuzz: Uniform<number>;
}

/** Fragment code replacing three's <fog_fragment> in the boundary materials. */
export const EDGE_FOG_FRAGMENT = /* glsl */ `
{
  // the scene's distance haze, exactly as three applies it to the terrain (FogExp2 or linear)
  float bdFog = 0.0;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      bdFog = 1.0 - exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      bdFog = smoothstep(fogNear, fogFar, vFogDepth);
    #endif
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, bdFog);
  #endif
  // then the edge haze toward the sky behind the fragment
  float bdK = max(bdEdgeHaze(vBdW), uBdMin);
  float bdRim = bdRimOf(vNormal, vViewPosition);
  bdK = clamp(bdK + uBdRim * bdRim * bdRim * (1.0 - bdK), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, bdSky(normalize(vBdW - cameraPosition)), bdK);
}
`;

/** Patches a standard material (its own; the boundary owns these) with the edge haze. */
export function patchEdgeHaze(m: MeshStandardMaterial, u: EdgeHazeUniforms, look: EdgeHazeLook): void {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, {
      uBdBox: u.uBdBox, uBdHazeMm: u.uBdHazeMm, uBdHorizon: u.uBdHorizon, uBdZenith: u.uBdZenith, uBdOvercast: u.uBdOvercast,
      uBdSunDir: u.uBdSunDir, uBdSunGlow: u.uBdSunGlow, uBdRim: look.rim, uBdMin: look.minHaze, uBdFuzz: look.fuzz,
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBdW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvBdW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
uniform vec4 uBdBox; uniform float uBdHazeMm; uniform vec3 uBdHorizon; uniform vec3 uBdZenith; uniform float uBdOvercast;
uniform vec3 uBdSunDir; uniform vec3 uBdSunGlow; uniform float uBdRim; uniform float uBdMin; uniform float uBdFuzz;
varying vec3 vBdW;\n${EDGE_HAZE_GLSL}
float bdRimOf(vec3 n, vec3 v) { return 1.0 - abs(dot(normalize(n), normalize(v))); }`)
      .replace('#include <alphahash_fragment>', `diffuseColor.a *= 1.0 - uBdFuzz * pow(bdRimOf(vNormal, vViewPosition), 3.0);
#include <alphahash_fragment>`)
      .replace('#include <fog_fragment>', EDGE_FOG_FRAGMENT);
  };
  m.customProgramCacheKey = () => 'boundary-edge-haze-v3';
}
