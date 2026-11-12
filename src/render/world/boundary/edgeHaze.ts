// Exponential haze from the map edge outward (GDD 04 §14), patched into the boundary's own standard materials: a
// point d mm outside the map takes 1 - exp(-d / k) of the scene's fog colour on top of the normal distance fog, and
// grazing silhouettes take a little more (soft, out-of-focus-looking edges against the hazy sky).
import { Uniform, Vector4, type MeshStandardMaterial } from 'three';

export interface EdgeHazeUniforms {
  /** Map square [x0, z0, x1, z1], mm. */
  uBdBox: Uniform<Vector4>;
  /** Haze length scale, mm. */
  uBdHazeMm: Uniform<number>;
  /** Extra haze on grazing silhouettes, 0..1. */
  uBdRim: Uniform<number>;
}

export function createEdgeHazeUniforms(): EdgeHazeUniforms {
  return { uBdBox: new Uniform(new Vector4(0, 0, 1, 1)), uBdHazeMm: new Uniform(1), uBdRim: new Uniform(0) };
}

/** GLSL: the edge haze fraction for a world position (shared with tests as text). */
export const EDGE_HAZE_GLSL = /* glsl */ `
float bdEdgeHaze(vec3 w) {
  vec2 o = max(max(uBdBox.xy - w.xz, w.xz - uBdBox.zw), vec2(0.0));
  return 1.0 - exp(-length(o) / max(uBdHazeMm, 1e-3));
}
`;

/** Per-material look of the haze: extra rim haze, a haze floor, and silhouette fuzz (hashed alpha); all 0 for the skirt. */
export interface EdgeHazeLook {
  rim: Uniform<number>;
  minHaze: Uniform<number>;
  fuzz: Uniform<number>;
}

/** Patches a standard material (its own; the boundary owns these) with the edge haze. */
export function patchEdgeHaze(m: MeshStandardMaterial, u: EdgeHazeUniforms, look: EdgeHazeLook): void {
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, { uBdBox: u.uBdBox, uBdHazeMm: u.uBdHazeMm, uBdRim: look.rim, uBdMin: look.minHaze, uBdFuzz: look.fuzz });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBdW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvBdW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uBdBox; uniform float uBdHazeMm; uniform float uBdRim; uniform float uBdMin; uniform float uBdFuzz;
varying vec3 vBdW;\n${EDGE_HAZE_GLSL}
float bdRimOf(vec3 n, vec3 v) { return 1.0 - abs(dot(normalize(n), normalize(v))); }`)
      .replace('#include <alphahash_fragment>', `diffuseColor.a *= 1.0 - uBdFuzz * pow(bdRimOf(vNormal, vViewPosition), 3.0);
#include <alphahash_fragment>`)
      .replace('#include <fog_fragment>', `#ifdef USE_FOG
  float bdK = max(bdEdgeHaze(vBdW), uBdMin);
  float bdRim = bdRimOf(vNormal, vViewPosition);
  bdK = clamp(bdK + uBdRim * bdRim * bdRim * (1.0 - bdK), 0.0, 1.0);
  gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, bdK);
#endif
#include <fog_fragment>`);
  };
  m.customProgramCacheKey = () => 'boundary-edge-haze-v2';
}
