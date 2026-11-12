/**
 * Shader patches on three's built-in PBR materials (onBeforeCompile), shared uniforms.
 *
 *  - surface(): triplanar / planar-Y mapping with whiteout-blended normal maps, dual-scale anti-tiling, macro tint,
 *    two-layer splat, wetness (darken + gloss) and puddles. Used by terrain, slabs, kerb, pebbles, tunnel walls.
 *  - translucency(): adds back-lit diffuse transmission for thin foliage inside three's directional-light loop,
 *    so it is shadowed by the same shadow map as the regular direct light.
 */
import { ShaderChunk, Uniform, Vector2, Vector3, Color } from 'three';
import type { Material, Texture, WebGLProgramParametersWithUniforms } from 'three';
import { GLSL_NOISE } from './rng';

/** Uniforms shared by every patched material (update .value once per frame). */
export const U = {
  uTime: new Uniform(0),
  uWet: new Uniform(0),            // 0 dry .. 1 soaked (after rain)
  uCamPos: new Uniform(new Vector3()), // real view camera (cameraPosition is the light camera in shadow passes)
  uSubject: new Uniform(new Vector3()), // controlled ant
  uWindDir: new Uniform(new Vector2(0.8, -0.6).normalize()),
  uWind: new Uniform(0.12),        // radians of extra bend at the tip
  uLawn: new Uniform(new Color(0.07, 0.11, 0.035)), // far-field lawn albedo (linear) where blades are no longer drawn
  uTransl: new Uniform(1.0),       // global translucency gain
  uPart: new Uniform(1.0),        // grass parting/fading around the line of sight (1 on, 0 off)
  uDayL: new Uniform(38.0),        // underground: e-folding length (mm) of daylight from the entrance
};

export type Patch = (s: WebGLProgramParametersWithUniforms) => void;
export function addPatch(mat: Material, key: string, patch: Patch) {
  const prev = mat.onBeforeCompile.bind(mat);
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (s, r) => { prev(s, r); patch(s); };
  mat.customProgramCacheKey = () => prevKey() + '|' + key;
}

// ------------------------------------------------------------------------------------------------ translucency
const DIR_LOOP = 'for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {';
const RE_LINE = 'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );';
/**
 * Thin-foliage transmission: light arriving at the back face (and forward-scattered toward the viewer) is added to the
 * diffuse term, filtered by the albedo (tint) -> back-lit grass/leaves glow at golden hour. Shadowed like the sun.
 */
export function translucency(mat: Material, strength: number, tint: [number, number, number] = [1.2, 1.35, 0.6]) {
  addPatch(mat, 'transl', (s) => {
    s.uniforms.uTransl = U.uTransl;
    const [a, b] = ShaderChunk.lights_fragment_begin.split(DIR_LOOP);
    if (!a || !b) throw new Error('lights chunk layout changed');
    const loop = b.replace(RE_LINE, RE_LINE + `
      { float fwd = pow( saturate( dot( geometryViewDir, -directLight.direction ) ), 6.0 );
        float back = saturate( dot( -geometryNormal, directLight.direction ) );
        lkTransl += directLight.color * ( 0.55 * back + 1.6 * fwd * (0.35 + back) ); }`);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTransl;')
      .replace('#include <lights_fragment_begin>', 'vec3 lkTransl = vec3(0.0);\n' + a + DIR_LOOP + loop +
        `\nreflectedLight.directDiffuse += uTransl * ${strength.toFixed(3)} * lkTransl * diffuseColor.rgb * vec3(${tint.map((v) => v.toFixed(3)).join(',')}) * RECIPROCAL_PI;\n`);
  });
}

// ------------------------------------------------------------------------------------------------ surface mapping
export interface Layer { tex: { albedo: Texture; normal: Texture; rough: Texture }; scale: number; tint?: [number, number, number]; normalScale?: number }
export interface SurfaceOpts {
  proj: 'triplanar' | 'planar';
  layerA: Layer;
  layerB?: Layer;          // splat layer, weight from vMask.y (vertex attribute aMask)
  dualScale?: number;      // far-scale multiplier (anti tiling); 0/undefined = single scale
  macro?: number;          // macro tint noise strength
  maskAttr?: boolean;      // geometry has aMask (x grass density, y layer B weight, z puddle, w ao)
  instanced?: boolean;     // InstancedMesh: world position includes instanceMatrix, albedo *= instance colour
  wetDarken?: number;      // albedo multiplier when soaked (porous soil ~0.5, concrete ~0.7, stone ~0.8)
  wetRough?: number;       // lowest roughness when soaked (porous soil ~0.5: glistens, never a mirror; stone ~0.2)
  puddles?: boolean;
  lawnTint?: boolean;      // far field: blend toward U.uLawn where grass density is high
  grimeBelow?: number;     // darken within this height (mm) above ground level 0 (dirt line on slabs/kerb)
  dayDepth?: boolean;      // underground: geometry has aDepth (path length from entrance) and aAO
}

export function surface(mat: Material, o: SurfaceOpts) {
  const key = JSON.stringify({ ...o, layerA: o.layerA.scale, layerB: o.layerB?.scale });
  addPatch(mat, 'surf' + key, (s) => {
    const A = o.layerA, B = o.layerB;
    s.uniforms.tAa = { value: A.tex.albedo }; s.uniforms.tAn = { value: A.tex.normal }; s.uniforms.tAr = { value: A.tex.rough };
    s.uniforms.uAs = { value: A.scale }; s.uniforms.uAt = { value: new Vector3(...(A.tint ?? [1, 1, 1])) }; s.uniforms.uAns = { value: A.normalScale ?? 1 };
    if (B) {
      s.uniforms.tBa = { value: B.tex.albedo }; s.uniforms.tBn = { value: B.tex.normal }; s.uniforms.tBr = { value: B.tex.rough };
      s.uniforms.uBs = { value: B.scale }; s.uniforms.uBt = { value: new Vector3(...(B.tint ?? [1, 1, 1])) }; s.uniforms.uBns = { value: B.normalScale ?? 1 };
    }
    s.uniforms.uWet = U.uWet; s.uniforms.uLawn = U.uLawn; s.uniforms.uDayL = U.uDayL;
    const defs = [
      o.proj === 'triplanar' ? '#define LK_TRI' : '',
      B ? '#define LK_LAYERB' : '',
      o.dualScale ? `#define LK_DUAL ${o.dualScale.toFixed(3)}` : '',
      o.macro ? `#define LK_MACRO ${o.macro.toFixed(3)}` : '',
      o.maskAttr ? '#define LK_MASK' : '',
      o.instanced ? '#define LK_INST' : '',
      o.puddles ? '#define LK_PUDDLES' : '',
      o.lawnTint ? '#define LK_LAWN' : '',
      o.grimeBelow ? `#define LK_GRIME ${o.grimeBelow.toFixed(2)}` : '',
      o.dayDepth ? '#define LK_DAYDEPTH' : '',
      `#define LK_WETDARK ${(o.wetDarken ?? 0.6).toFixed(3)}`,
      `#define LK_WETROUGH ${(o.wetRough ?? 0.4).toFixed(3)}`,
    ].join('\n');

    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>
${defs}
varying vec3 vLkW; varying vec3 vLkN;
#ifdef LK_MASK
attribute vec4 aMask; varying vec4 vLkMask;
#endif
#ifdef LK_DAYDEPTH
attribute vec2 aDepth; varying vec2 vLkDepth;
#endif`)
      .replace('#include <project_vertex>', `#include <project_vertex>
{
  vec4 lkw = vec4(transformed, 1.0); vec3 lkn = objectNormal;
  #ifdef USE_INSTANCING
  lkw = instanceMatrix * lkw; lkn = mat3(instanceMatrix) * lkn;
  #endif
  vLkW = (modelMatrix * lkw).xyz; vLkN = normalize(mat3(modelMatrix) * lkn);
  #ifdef LK_MASK
  vLkMask = aMask;
  #endif
  #ifdef LK_DAYDEPTH
  vLkDepth = aDepth;
  #endif
}`);

    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>
${defs}
${GLSL_NOISE}
varying vec3 vLkW; varying vec3 vLkN;
#ifdef LK_MASK
varying vec4 vLkMask;
#endif
#ifdef LK_DAYDEPTH
varying vec2 vLkDepth; uniform float uDayL;
#endif
uniform sampler2D tAa, tAn, tAr; uniform float uAs, uAns; uniform vec3 uAt;
#ifdef LK_LAYERB
uniform sampler2D tBa, tBn, tBr; uniform float uBs, uBns; uniform vec3 uBt;
#endif
uniform float uWet; uniform vec3 uLawn;

// Triplanar (or planar-Y) sample of albedo / roughness / world normal (whiteout blend, Golus 2017).
void lkSample(sampler2D ta, sampler2D tn, sampler2D tr, vec3 p, vec3 n, float sc, float ns, out vec3 alb, out vec3 nw, out float rg) {
#ifdef LK_TRI
  vec3 w = pow(abs(n), vec3(4.0)); w /= (w.x + w.y + w.z);
  vec3 sg = sign(n + 1e-5);
  vec2 ux = p.zy / sc; ux.x *= sg.x; vec2 uy = p.xz / sc; uy.x *= sg.y; vec2 uz = p.xy / sc; uz.x *= -sg.z;
  alb = texture2D(ta, ux).rgb * w.x + texture2D(ta, uy).rgb * w.y + texture2D(ta, uz).rgb * w.z;
  rg = texture2D(tr, ux).g * w.x + texture2D(tr, uy).g * w.y + texture2D(tr, uz).g * w.z;
  vec3 tx = texture2D(tn, ux).xyz * 2.0 - 1.0, ty = texture2D(tn, uy).xyz * 2.0 - 1.0, tz = texture2D(tn, uz).xyz * 2.0 - 1.0;
  tx.xy *= ns; ty.xy *= ns; tz.xy *= ns;
  tx.x *= sg.x; ty.x *= sg.y; tz.x *= -sg.z;
  tx = vec3(tx.xy + n.zy, abs(tx.z) * n.x); ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); tz = vec3(tz.xy + n.xy, abs(tz.z) * n.z);
  nw = normalize(tx.zyx * w.x + ty.xzy * w.y + tz.xyz * w.z);
#else
  vec2 uy = p.xz / sc;
  alb = texture2D(ta, uy).rgb; rg = texture2D(tr, uy).g;
  vec3 ty = texture2D(tn, uy).xyz * 2.0 - 1.0; ty.xy *= ns;
  ty = vec3(ty.xy + n.xz, abs(ty.z) * n.y); nw = normalize(ty.xzy);
#endif
}
void lkLayer(sampler2D ta, sampler2D tn, sampler2D tr, vec3 p, vec3 n, float sc, float ns, float dist, out vec3 alb, out vec3 nw, out float rg) {
#ifdef LK_DUAL
  // near scale fades out with distance into a coarser scale (anti-tiling + texel density matched to view distance)
  float wf = smoothstep(sc * 3.0, sc * 12.0, dist);
  vec3 a1 = vec3(0.0), n1 = n, a2 = vec3(0.0), n2 = n; float r1 = 0.0, r2 = 0.0;
  if (wf < 0.999) lkSample(ta, tn, tr, p, n, sc, ns, a1, n1, r1);
  if (wf > 0.001) lkSample(ta, tn, tr, p, n, sc * LK_DUAL, ns, a2, n2, r2);
  alb = mix(a1, a2, wf); rg = mix(r1, r2, wf); nw = normalize(mix(n1, n2, wf));
#else
  lkSample(ta, tn, tr, p, n, sc, ns, alb, nw, rg);
#endif
}
`)
      .replace('#include <map_fragment>', `
vec3 lkAlb; vec3 lkNw; float lkRg;
float lkDist = length(vLkW - cameraPosition);
vec3 lkN0 = normalize(vLkN);
lkLayer(tAa, tAn, tAr, vLkW, lkN0, uAs, uAns, lkDist, lkAlb, lkNw, lkRg);
lkAlb *= uAt;
#ifdef LK_LAYERB
{
  vec3 bA; vec3 bN; float bR;
  lkLayer(tBa, tBn, tBr, vLkW, lkN0, uBs, uBns, lkDist, bA, bN, bR);
  bA *= uBt;
  // height-aware splat: the layer weight is sharpened by the albedo luminance (grit sits on top of soil)
  float hb = clamp((vLkMask.y - 0.5) * 3.0 + 0.5 + (dot(bA, vec3(0.33)) - dot(lkAlb, vec3(0.33))) * 2.0, 0.0, 1.0);
  lkAlb = mix(lkAlb, bA, hb); lkNw = normalize(mix(lkNw, bN, hb)); lkRg = mix(lkRg, bR, hb);
}
#endif
#ifdef LK_MACRO
lkAlb *= mix(1.0 - LK_MACRO, 1.0 + LK_MACRO, lkFbm(vLkW.xz / 340.0));
#endif
#ifdef LK_GRIME
lkAlb *= mix(0.55, 1.0, smoothstep(-2.0, LK_GRIME, vLkW.y - lkFbm(vLkW.xz / 20.0) * LK_GRIME * 0.6));
#endif
#ifdef LK_MASK
// ground under dense grass: shaded litter (cheap AO), far field reads as lawn
lkAlb *= mix(1.0, 0.55, vLkMask.x) * mix(0.6, 1.0, vLkMask.w);
#ifdef LK_LAWN
lkAlb = mix(lkAlb, uLawn, vLkMask.x * smoothstep(500.0, 1800.0, lkDist));
#endif
#endif
diffuseColor.rgb *= lkAlb;
#ifdef LK_INST
#ifdef USE_INSTANCING_COLOR
#endif
#endif
float lkWet = uWet;
float lkPud = 0.0;
#ifdef LK_PUDDLES
#ifdef LK_MASK
lkPud = uWet * smoothstep(0.66, 0.72, vLkMask.z + (lkNoise(vLkW.xz / 9.0) - 0.5) * 0.12) * smoothstep(0.8, 0.95, lkN0.y);
#endif
#endif
diffuseColor.rgb *= mix(1.0, LK_WETDARK, lkWet);
{ float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)); diffuseColor.rgb = max(mix(vec3(l), diffuseColor.rgb, 1.0 + 0.35 * lkWet), 0.0); }
diffuseColor.rgb *= mix(1.0, 0.55, lkPud);
`)
      .replace('#include <roughnessmap_fragment>', `
float roughnessFactor = roughness * lkRg;
roughnessFactor = mix(roughnessFactor, max(LK_WETROUGH, roughnessFactor * 0.55), lkWet);
roughnessFactor = mix(roughnessFactor, 0.03, lkPud);
`)
      .replace('#include <normal_fragment_maps>', `
normal = normalize((viewMatrix * vec4(normalize(mix(lkNw, lkN0, lkPud * 0.9)), 0.0)).xyz);
`)
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>
#ifdef LK_DAYDEPTH
{ float day = exp(-vLkDepth.x / uDayL);
  #if defined( RE_IndirectDiffuse ) && defined( USE_ENVMAP )
  iblIrradiance *= day * vLkDepth.y;
  #endif
  #if defined( RE_IndirectSpecular ) && defined( USE_ENVMAP )
  radiance *= day * vLkDepth.y;
  #endif
  irradiance *= vLkDepth.y; }
#endif
`);
  });
}
