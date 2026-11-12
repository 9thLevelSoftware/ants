// Cutaway hook for the SURFACE materials owned by other renderers (terrain, primitives, mounds, ants): in slice mode
// fragments above the cut plane within the cut radius are discarded and the surface outside the radius is darkened
// by 30 % (GDD 01 6.7). Works on any MeshStandardMaterial-style material (three's chunks); chains onto existing
// onBeforeCompile patches and extends the program cache key. The nest's own materials do this themselves.
import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import type { NestUniforms } from '../materials/nestUniforms';

const DECL_V = /* glsl */ `
varying vec3 vNestCutW;`;

const MAIN_V = /* glsl */ `
{
  vec4 ncw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  ncw = instanceMatrix * ncw;
  #endif
  vNestCutW = (modelMatrix * ncw).xyz;
}`;

const DECL_F = /* glsl */ `
varying vec3 vNestCutW;
uniform int uCutMode; uniform vec3 uCutC; uniform vec3 uCutN; uniform float uCutR; uniform float uCutDark;
float nestCutState(vec3 p) {
  // 1 = hidden, 2 = outside the radius (darkened), 0 = inside the radius below the plane
  vec3 d = p - uCutC;
  float h = dot(d, uCutN);
  vec2 r = (d - uCutN * h).xz;
  if (dot(r, r) >= uCutR * uCutR) return 2.0;
  return h > 0.0 ? 1.0 : 0.0;
}`;

type Patchable = Material & {
  onBeforeCompile: (s: WebGLProgramParametersWithUniforms, r: unknown) => void;
  customProgramCacheKey: () => string;
};

/** Adds the cutaway behaviour to a surface material (idempotent). */
export function patchSurfaceForCutaway(material: Material, u: NestUniforms): void {
  const m = material as Patchable;
  if ((m.userData as { nestCut?: boolean }).nestCut) return;
  (m.userData as { nestCut?: boolean }).nestCut = true;
  const prev = m.onBeforeCompile.bind(m);
  const prevKey = m.customProgramCacheKey.bind(m);
  m.onBeforeCompile = (s, r) => {
    prev(s, r);
    Object.assign(s.uniforms, { uCutMode: u.uCutMode, uCutC: u.uCutC, uCutN: u.uCutN, uCutR: u.uCutR, uCutDark: u.uCutDark });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>${DECL_V}`)
      .replace('#include <project_vertex>', `#include <project_vertex>${MAIN_V}`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>${DECL_F}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
float nestCut = uCutMode == 1 ? nestCutState(vNestCutW) : 0.0;
if (nestCut == 1.0) discard;`)
      .replace('#include <opaque_fragment>', `if (nestCut == 2.0) outgoingLight *= 1.0 - uCutDark;
#include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => prevKey() + '|nest-cut';
  m.needsUpdate = true;
}
