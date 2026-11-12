// The surface shader patch on MeshStandardMaterial (onBeforeCompile): triplanar mm-scale mapping with whiteout
// normal blending, dual-scale anti-tiling, macro tint noise, wetness, and two optional extras:
//  - `prim`: vertex expansion of the parametric primitive geometry (primitives/primGeometry.ts) from the
//    per-instance size attribute, so one mesh draws every rounded box / cylinder / capsule (or ellipsoid);
//  - `breaches`: discard inside the nearest breach spheres (holes through diggable objects).
// Mapping happens in primitive-local space for instances (moved objects keep their texture) or world space.
import type { MeshStandardMaterial, Uniform, Vector4, WebGLProgramParametersWithUniforms } from 'three';
import { dappledLightsChunk, GLSL_DAPPLE } from './dapple';
import { GLSL_NOISE, GLSL_TRIPLANAR, GLSL_WET } from './glsl';
import type { MaterialDef } from './materialDefs';
import type { TextureSet } from './materialLibrary';
import type { WorldUniforms } from './uniforms';

/** Shared uniform list of breach spheres (xyz centre mm, w radius mm) and how many are valid. */
export interface BreachList {
  spheres: Uniform<Vector4[]>;
  count: Uniform<number>;
}
/** Capacity of the breach uniform list. */
export const BREACH_UNIFORM_MAX = 16;

/** Extra shader code a caller can inject (mound pile height, hole mask ...). */
export interface SurfaceExtra {
  key: string;
  uniforms: Record<string, Uniform<unknown>>;
  vertDecl?: string;
  /** Runs after the world position is known (vWrW valid). */
  vertMain?: string;
  fragDecl?: string;
  /** Runs at the top of the fragment colour stage: may `discard` or modify `wrAlb` / `wrWet`. */
  fragMain?: string;
}

export interface SurfacePatchOptions {
  def: MaterialDef;
  set: TextureSet;
  uniforms: WorldUniforms;
  /** Mapping space: primitive-local (instanced primitives) or world. */
  space: 'instance' | 'world';
  prim?: 'rounded' | 'ellipsoid' | null;
  breaches?: BreachList;
  /** Macro albedo noise strength (0 = off). */
  macro?: number;
  extra?: SurfaceExtra;
}

type Patch = (s: WebGLProgramParametersWithUniforms) => void;

/** Chains a shader patch onto a material and extends its program cache key. */
export function addPatch(mat: { onBeforeCompile: MeshStandardMaterial['onBeforeCompile']; customProgramCacheKey: () => string }, key: string, patch: Patch): void {
  const prev = mat.onBeforeCompile.bind(mat);
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (s, r) => { prev(s, r); patch(s); };
  mat.customProgramCacheKey = () => prevKey() + '|' + key;
}

/**
 * Vertex expansion of the primitive geometry. Attributes: `normal` = unit direction, `aCorner` = point on the
 * normalised inner box/cylinder; per instance `iSize` = (size.xyz, round). Shared with the shadow depth material.
 */
export function primVertexPatch(s: WebGLProgramParametersWithUniforms, mode: 'rounded' | 'ellipsoid'): void {
  s.vertexShader = s.vertexShader
    .replace('#include <common>', `#include <common>
attribute vec3 aCorner;
attribute vec4 iSize;`)
    .replace('#include <beginnormal_vertex>', mode === 'ellipsoid'
      ? 'vec3 objectNormal = normalize(normal / max(iSize.xyz, vec3(1e-4)));'
      : 'vec3 objectNormal = normal;')
    .replace('#include <begin_vertex>', mode === 'ellipsoid'
      ? 'vec3 transformed = normal * iSize.xyz;'
      : 'vec3 transformed = aCorner * max(iSize.xyz - vec3(iSize.w), vec3(0.0)) + normal * iSize.w;');
}

export function applySurfacePatch(mat: MeshStandardMaterial, o: SurfacePatchOptions): void {
  const d = o.def;
  const key = `surf|${d.id}|${d.roughMin}|${o.space}|${o.prim ?? '-'}|${o.breaches ? 'b' : '-'}|${o.extra?.key ?? '-'}|${d.dualScale}|${o.macro ?? 0}`;
  addPatch(mat, key, (s) => {
    if (o.prim) primVertexPatch(s, o.prim);
    s.uniforms.tWrA = { value: o.set.albedo };
    s.uniforms.tWrN = { value: o.set.normal };
    s.uniforms.tWrR = { value: o.set.rough };
    s.uniforms.uWrScale = { value: d.scaleMm };
    s.uniforms.uWrTint = { value: d.tint };
    s.uniforms.uWrNs = { value: d.normalScale };
    s.uniforms.uWet = o.uniforms.uWet;
    s.uniforms.uWrDapple = o.uniforms.uDapple;
    s.uniforms.uWrDappleMm = o.uniforms.uDappleMm;
    if (o.breaches) { s.uniforms.uWrBreach = o.breaches.spheres; s.uniforms.uWrBreachN = o.breaches.count; }
    if (o.extra) Object.assign(s.uniforms, o.extra.uniforms);
    const defs = [
      o.space === 'instance' ? '#define WR_LOCAL' : '',
      d.dualScale > 0 ? `#define WR_DUAL ${d.dualScale.toFixed(3)}` : '',
      o.macro ? `#define WR_MACRO ${o.macro.toFixed(3)}` : '',
      o.breaches ? `#define WR_BREACH ${o.breaches.spheres.value.length}` : '',
      `#define WR_WETDARK ${d.wetDarken.toFixed(3)}`,
      `#define WR_WETROUGH ${d.wetRough.toFixed(3)}`,
      `#define WR_ROUGHMIN ${d.roughMin.toFixed(3)}`,
    ].join('\n');

    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
${defs}
varying vec3 vWrP; varying vec3 vWrN; varying vec3 vWrW;
#ifdef WR_LOCAL
varying vec3 vWrR0; varying vec3 vWrR1; varying vec3 vWrR2;
#endif
${o.extra?.vertDecl ?? ''}`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 wrW = vec4(transformed, 1.0);
  mat3 wrR = mat3(modelMatrix);
  #ifdef USE_INSTANCING
  wrW = instanceMatrix * wrW; wrR = wrR * mat3(instanceMatrix);
  #endif
  wrW = modelMatrix * wrW;
  vWrW = wrW.xyz;
  #ifdef WR_LOCAL
  vWrP = transformed; vWrN = objectNormal;
  vWrR0 = wrR[0]; vWrR1 = wrR[1]; vWrR2 = wrR[2];
  #else
  vWrP = wrW.xyz; vWrN = normalize(wrR * objectNormal);
  #endif
  ${o.extra?.vertMain ?? ''}
}`);

    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
${defs}
${GLSL_NOISE}
${GLSL_TRIPLANAR}
${GLSL_WET}
varying vec3 vWrP; varying vec3 vWrN; varying vec3 vWrW;
${GLSL_DAPPLE}
#ifdef WR_LOCAL
varying vec3 vWrR0; varying vec3 vWrR1; varying vec3 vWrR2;
#endif
uniform sampler2D tWrA, tWrN, tWrR; uniform float uWrScale, uWrNs; uniform vec3 uWrTint; uniform float uWet;
#ifdef WR_BREACH
uniform vec4 uWrBreach[WR_BREACH]; uniform int uWrBreachN;
#endif
${o.extra?.fragDecl ?? ''}`)
      .replace('#include <map_fragment>', `
#ifdef WR_BREACH
for (int i = 0; i < WR_BREACH; i++) {
  if (i >= uWrBreachN) break;
  vec3 dv = vWrW - uWrBreach[i].xyz;
  if (dot(dv, dv) < uWrBreach[i].w * uWrBreach[i].w) discard;
}
#endif
vec3 wrN0 = normalize(vWrN);
#ifdef WR_LOCAL
mat3 wrRot = mat3(vWrR0, vWrR1, vWrR2);
#else
mat3 wrRot = mat3(1.0);
#endif
float wrDist = length(vWrW - cameraPosition);
vec3 wrAlb; vec3 wrNw; float wrRg;
#ifdef WR_DUAL
{
  float wf = smoothstep(uWrScale * 3.0, uWrScale * 12.0, wrDist);
  vec3 a1 = vec3(0.0), n1 = wrN0, a2 = vec3(0.0), n2 = wrN0; float r1 = 0.0, r2 = 0.0;
  if (wf < 0.999) wrTri(tWrA, tWrN, tWrR, vWrP, wrN0, uWrScale, uWrNs, a1, n1, r1);
  if (wf > 0.001) wrTri(tWrA, tWrN, tWrR, vWrP, wrN0, uWrScale * WR_DUAL, uWrNs, a2, n2, r2);
  wrAlb = mix(a1, a2, wf); wrRg = mix(r1, r2, wf); wrNw = normalize(mix(n1, n2, wf));
}
#else
wrTri(tWrA, tWrN, tWrR, vWrP, wrN0, uWrScale, uWrNs, wrAlb, wrNw, wrRg);
#endif
wrAlb *= uWrTint;
#ifdef WR_MACRO
wrAlb *= mix(1.0 - WR_MACRO, 1.0 + WR_MACRO, wrFbm(vWrW.xz / 340.0));
#endif
vec3 wrNwWorld = normalize(wrRot * wrNw);
// undersides stay drier than tops (rain falls, shelter flags are a sim matter)
float wrWet = uWet * (0.45 + 0.55 * smoothstep(-0.3, 0.7, normalize(wrRot * wrN0).y));
${o.extra?.fragMain ?? ''}
diffuseColor.rgb *= wrWetAlbedo(wrAlb, wrWet, WR_WETDARK);
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = wrWetRough(max(WR_ROUGHMIN, roughness * wrRg), wrWet, WR_WETROUGH);
`)
      .replace('#include <normal_fragment_maps>', `
normal = normalize((viewMatrix * vec4(wrNwWorld, 0.0)).xyz);
`)
      .replace('#include <lights_fragment_begin>', dappledLightsChunk());
  });
}
