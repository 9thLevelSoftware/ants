// The surface shader patch on MeshStandardMaterial (onBeforeCompile): triplanar mm-scale mapping with whiteout
// normal blending, dual-scale anti-tiling, macro tint noise, wetness, and two optional extras:
//  - `prim`: vertex expansion of the parametric primitive geometry (primitives/primGeometry.ts) from the
//    per-instance size attribute, so one mesh draws every rounded box / cylinder / capsule (or ellipsoid);
//  - `breaches`: discard inside the nearest breach spheres (holes through diggable objects).
// Mapping happens in primitive-local space for instances (moved objects keep their texture) or world space.
import type { MeshStandardMaterial, Uniform, Vector4, WebGLProgramParametersWithUniforms } from 'three';
import { dappledLightsChunk, GLSL_DAPPLE } from './dapple';
import { foliageLightsChunk } from '../decor/foliageLight';
import { LOOK_FRAG_DECL, LOOK_VERT_DECL, LOOK_VERT_MAIN, lookFragMain } from '../dressing/finishGlsl';
import { GLSL_NOISE, GLSL_TRIPLANAR, GLSL_WET } from './glsl';
import { LEAF_BEND_GLSL } from './leafBend';
import { GLSL_CONTACT, GLSL_OCCLUSION, occlusionUniforms } from './occlusion';
import type { MaterialDef } from './materialDefs';
import type { TextureSet } from './materialLibrary';
import type { WorldUniforms } from './uniforms';

/** Shared uniform list of breach spheres (xyz centre mm, w radius mm) and how many are valid. */
export interface BreachList {
  spheres: Uniform<Vector4[]>;
  count: Uniform<number>;
}
/**
 * Fence boards (app-seams-2-fix, far blocks): a wooden panel prim (one thin axis, two big ones: a fence panel, 20 mm thick, 1.7 m square)
 * drew as one flat pale slab at 3 to 6 m, the 14 % wood albedo pattern lost in the haze. The shader now draws upright boards across it from the
 * prim's own size: `boardMm` wide, with a darker gap and a per-board tint, fading out where a board is under ~3 pixels (no moire). The haze
 * covered the panel completely at that distance (the exp2 fog is ~100 % at 3.5 m on an ant's scale), so the panel also keeps `fogKeep` of its
 * own colour through the fog (the same exemption the boundary facade has).
 */
export const FENCE_BOARDS = { boardMm: 150, thinMaxMm: 60, bigMinMm: 600, gapDark: 0.55, tintVar: 0.28, fadeFrom: 0.35, fadeTo: 0.9, fogKeep: 0.55 } as const;
export const FENCE_BOARDS_FRAG = /* glsl */ `
#ifdef WR_BOARDS
float wrFogKeep = 0.0;
{
  vec3 bsz = vWrSz * 2.0, bn = abs(vWrN);
  float panZ = step(bsz.z, ${FENCE_BOARDS.thinMaxMm.toFixed(1)}) * step(${FENCE_BOARDS.bigMinMm.toFixed(1)}, bsz.x) * step(${FENCE_BOARDS.bigMinMm.toFixed(1)}, bsz.y) * step(0.7, bn.z);
  float panX = step(bsz.x, ${FENCE_BOARDS.thinMaxMm.toFixed(1)}) * step(${FENCE_BOARDS.bigMinMm.toFixed(1)}, bsz.z) * step(${FENCE_BOARDS.bigMinMm.toFixed(1)}, bsz.y) * step(0.7, bn.x);
  if (panZ + panX > 0.5) {
    float bu = (panZ > 0.5 ? vWrP.x : vWrP.z) / ${FENCE_BOARDS.boardMm.toFixed(1)};
    float bfw = fwidth(bu), bf = fract(bu), be = min(bf, 1.0 - bf);
    float gap = 1.0 - smoothstep(0.02, 0.02 + max(bfw, 0.05), be);
    float keep = 1.0 - smoothstep(${FENCE_BOARDS.fadeFrom.toFixed(2)}, ${FENCE_BOARDS.fadeTo.toFixed(2)}, bfw);
    float tint = 1.0 - ${(FENCE_BOARDS.tintVar / 2).toFixed(3)} + ${FENCE_BOARDS.tintVar.toFixed(3)} * wrHash12(vec2(floor(bu), panZ * 3.0 + panX * 5.0));
    wrAlb *= mix(1.0, (1.0 - ${FENCE_BOARDS.gapDark.toFixed(2)} * gap) * tint, keep);
    wrFogKeep = ${FENCE_BOARDS.fogKeep.toFixed(2)};
  }
}
#endif`;
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
  /**
   * Per-instance finishes (dressing/looks.ts): needs `prim` and the per-instance `iLook` attribute. Replaces the
   * instance colour multiply, roughness, metalness and clear coat, and adds foliage translucency.
   */
  looks?: boolean;
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
 * `leafCurl`: leaf-finish instances (iLook.x == FINISH.leaf; the caller declares `iLook`) are cupped across and
 * bent along the blade, a render-only bend capped in mm (materials/leafBend.ts; collision stays flat).
 */
export function primVertexPatch(s: WebGLProgramParametersWithUniforms, mode: 'rounded' | 'ellipsoid', leafCurl = false): void {
  const pos = mode === 'ellipsoid' ? 'normal * iSize.xyz' : 'aCorner * max(iSize.xyz - vec3(iSize.w), vec3(0.0)) + normal * iSize.w';
  s.vertexShader = s.vertexShader
    .replace('#include <common>', `#include <common>
attribute vec3 aCorner;
attribute vec4 iSize;
${leafCurl ? LEAF_BEND_GLSL : ''}`)
    .replace('#include <beginnormal_vertex>', `${mode === 'ellipsoid'
      ? 'vec3 objectNormal = normalize(normal / max(iSize.xyz, vec3(1e-4)));'
      : 'vec3 objectNormal = normal;'}
${leafCurl ? `objectNormal = wrLeafBendNormal(${pos}, objectNormal);` : ''}`)
    .replace('#include <begin_vertex>', `vec3 transformed = ${pos};
${leafCurl ? 'transformed.y += wrLeafBend(transformed);' : ''}`);
}

export { LEAF_BEND } from './leafBend';

export function applySurfacePatch(mat: MeshStandardMaterial, o: SurfacePatchOptions): void {
  const d = o.def;
  const looks = !!(o.looks && o.prim);
  const rustScan = d.texture === 'metal_painted';
  const key = `surf|${d.id}|${d.texture}|${d.roughMin}|${o.space}|${o.prim ?? '-'}|${o.breaches ? 'b' : '-'}|${o.extra?.key ?? '-'}|${d.dualScale}|${o.macro ?? 0}|${looks ? 'L' : '-'}|v4`;
  addPatch(mat, key, (s) => {
    if (o.prim) primVertexPatch(s, o.prim, looks);
    s.uniforms.tWrA = { value: o.set.albedo };
    s.uniforms.tWrN = { value: o.set.normal };
    s.uniforms.tWrR = { value: o.set.rough };
    s.uniforms.uWrScale = { value: d.scaleMm };
    s.uniforms.uWrTint = { value: d.tint };
    s.uniforms.uWrNs = { value: d.normalScale };
    s.uniforms.uWet = o.uniforms.uWet;
    s.uniforms.uWrDapple = o.uniforms.uDapple;
    s.uniforms.uWrDappleMm = o.uniforms.uDappleMm;
    s.uniforms.tWrCanopy = o.uniforms.tDappleMask;
    s.uniforms.uWrCanopyInv = o.uniforms.uDappleMaskInv;
    if (o.breaches) { s.uniforms.uWrBreach = o.breaches.spheres; s.uniforms.uWrBreachN = o.breaches.count; }
    Object.assign(s.uniforms, occlusionUniforms(o.uniforms));
    if (looks) Object.assign(s.uniforms, { uWrCam: o.uniforms.uCamPos, uWrFlowerMm: o.uniforms.uFlowerMm });
    if (o.extra) Object.assign(s.uniforms, o.extra.uniforms);
    const defs = [
      o.space === 'instance' ? '#define WR_LOCAL' : '',
      d.dualScale > 0 ? `#define WR_DUAL ${d.dualScale.toFixed(3)}` : '',
      o.macro ? `#define WR_MACRO ${o.macro.toFixed(3)}` : '',
      o.breaches ? `#define WR_BREACH ${o.breaches.spheres.value.length}` : '',
      `#define WR_WETDARK ${d.wetDarken.toFixed(3)}`,
      `#define WR_WETROUGH ${d.wetRough.toFixed(3)}`,
      `#define WR_ROUGHMIN ${d.roughMin.toFixed(3)}`,
      looks ? '#define WR_LOOKS' : '',
      o.prim === 'rounded' && o.space === 'instance' && d.id.startsWith('wood') ? '#define WR_BOARDS' : '',
    ].join('\n');

    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
${defs}
varying vec3 vWrP; varying vec3 vWrN; varying vec3 vWrW;
#ifdef WR_LOCAL
varying vec3 vWrR0; varying vec3 vWrR1; varying vec3 vWrR2;
#endif
#ifdef WR_BOARDS
varying vec3 vWrSz;
#endif
${looks ? LOOK_VERT_DECL : ''}
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
  #ifdef WR_BOARDS
  vWrSz = iSize.xyz;
  #endif
  #ifdef WR_LOCAL
  vWrP = transformed; vWrN = objectNormal;
  vWrR0 = wrR[0]; vWrR1 = wrR[1]; vWrR2 = wrR[2];
  #else
  vWrP = wrW.xyz; vWrN = normalize(wrR * objectNormal);
  #endif
  ${looks ? LOOK_VERT_MAIN : ''}
  ${o.extra?.vertMain ?? ''}
}`);

    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
${defs}
${GLSL_NOISE}
${GLSL_TRIPLANAR}
${GLSL_WET}
${GLSL_OCCLUSION}
${GLSL_CONTACT}
varying vec3 vWrP; varying vec3 vWrN; varying vec3 vWrW;
#ifdef WR_BOARDS
varying vec3 vWrSz;
#endif
${GLSL_DAPPLE}
#ifdef WR_LOCAL
varying vec3 vWrR0; varying vec3 vWrR1; varying vec3 vWrR2;
#endif
uniform sampler2D tWrA, tWrN, tWrR; uniform float uWrScale, uWrNs; uniform vec3 uWrTint; uniform float uWet;
#ifdef WR_BREACH
uniform vec4 uWrBreach[WR_BREACH]; uniform int uWrBreachN;
#endif
${looks ? LOOK_FRAG_DECL : ''}
${o.extra?.fragDecl ?? ''}`)
      .replace('#include <map_fragment>', `
wrOccDither(vWrW, 1.0);
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
${FENCE_BOARDS_FRAG}
#ifdef WR_MACRO
wrAlb *= mix(1.0 - WR_MACRO, 1.0 + WR_MACRO, wrFbm(vWrW.xz / 340.0));
#endif
// detail fade where a texel is smaller than a few pixels (far, or grazing views): the normal map and the
// albedo contrast fall toward their mean instead of sparkling, and the lost micro-relief turns into roughness
float wrFootprint = length(fwidth(vWrW)) / (uWrScale / float(textureSize(tWrA, 0).x));
float wrFade = smoothstep(1.5, 7.0, wrFootprint);
wrNw = normalize(mix(wrNw, wrN0, 0.7 * wrFade));
wrAlb = mix(wrAlb, textureLod(tWrA, vec2(0.5), 12.0).rgb * uWrTint, 0.35 * wrFade);
wrRg = min(1.0, wrRg + 0.12 * wrFade);
${looks ? lookFragMain(rustScan) : ''}
vec3 wrNwWorld = normalize(wrRot * wrNw);
// undersides stay drier than tops (rain falls, shelter flags are a sim matter)
float wrWet = uWet * (0.45 + 0.55 * smoothstep(-0.3, 0.7, normalize(wrRot * wrN0).y));
${o.extra?.fragMain ?? ''}
diffuseColor.rgb *= wrWetAlbedo(wrAlb, wrWet, WR_WETDARK) * wrContactAO(vWrW);
`)
      .replace('#include <roughnessmap_fragment>', looks ? `
float roughnessFactor = wrWetRough(wrRoughO >= 0.0 ? wrRoughO : max(WR_ROUGHMIN, roughness * wrRg), wrWet, WR_WETROUGH);
` : `
float roughnessFactor = wrWetRough(max(WR_ROUGHMIN, roughness * wrRg), wrWet, WR_WETROUGH);
`)
      .replace('#include <fog_fragment>', `
#if defined( USE_FOG ) && defined( WR_BOARDS )
  #ifdef FOG_EXP2
  float wrFogF = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
  float wrFogF = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, wrFogF * ( 1.0 - wrFogKeep ) );
#else
#include <fog_fragment>
#endif
`)
      .replace('#include <normal_fragment_maps>', `
normal = normalize((viewMatrix * vec4(wrNwWorld, 0.0)).xyz);
`)
      .replace('#include <lights_fragment_begin>', looks ? foliageLightsChunk('wrTransl', 'vec3(1.0, 1.05, 0.8)') : dappledLightsChunk());
    if (looks) {
      s.fragmentShader = s.fragmentShader
        .replace('#include <color_fragment>', '') // the instance colour is applied by the finish (lookFragMain)
        .replace('#include <metalnessmap_fragment>', 'float metalnessFactor = wrMetal;')
        .replace('#include <lights_physical_fragment>', '#include <lights_physical_fragment>\n#ifdef USE_CLEARCOAT\nmaterial.clearcoat *= wrCoat;\n#endif');
    }
  });
}
