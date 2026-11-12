// GLSL of the nest materials. Names are prefixed `nest` / `wr` (shared world snippets) to stay clear of three's
// chunks (three already #defines PI: never declare it again, tech-stack 7).
import { GLSL_NOISE, GLSL_TRIPLANAR, GLSL_WET } from '@/render/world/materials';
import { NEST_LIGHT } from '../params';

/** Cheap 3D value noise (world mm in, 0..1 out): soil grain and strata (from the nest spike). */
export const GLSL_NOISE3 = /* glsl */ `
float nestH3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float nestN3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(nestH3(i), nestH3(i + vec3(1,0,0)), f.x), mix(nestH3(i + vec3(0,1,0)), nestH3(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(nestH3(i + vec3(0,0,1)), nestH3(i + vec3(1,0,1)), f.x), mix(nestH3(i + vec3(0,1,1)), nestH3(i + vec3(1,1,1)), f.x), f.y), f.z);
}
`;

/** Shared uniform declarations and the cutaway test (hidden = on the plane's normal side within the radius). */
export const GLSL_NEST_COMMON = /* glsl */ `
#define NEST_MAXO ${NEST_LIGHT.maxOpenings}
uniform float uSkin; uniform float uHoleLip;
uniform vec4 uSky[NEST_MAXO]; uniform int uSkyN; uniform float uSkyLen; uniform vec3 uSkyCol;
uniform vec3 uAmb; uniform vec2 uAmbNear; uniform vec2 uAmbDeep;
uniform vec3 uLanternPos; uniform vec3 uLanternCol; uniform float uLanternR; uniform float uLanternWrap;
uniform vec2 uMoist;
uniform int uCutMode; uniform vec3 uCutC; uniform vec3 uCutN; uniform float uCutR; uniform float uCutDark;
uniform vec3 uCutFill; uniform float uCutFillLen;
uniform vec3 uXNear; uniform vec3 uXDeep; uniform float uXDepth; uniform float uXOpacity;
uniform float uBu;
uniform float uTick; uniform vec3 uFresh;
uniform vec3 uOccA; uniform vec3 uOccB; uniform vec2 uOcc;
// hidden = on the normal side of the plane and within uCutR horizontally along the plane (a cylinder above a
// horizontal slice, a vertical slab in front of a vertical section)
bool nestCutHidden(vec3 p) {
  vec3 d = p - uCutC;
  float h = dot(d, uCutN);
  if (h <= 0.0) return false;
  vec2 r = (d - uCutN * h).xz;
  return dot(r, r) < uCutR * uCutR;
}
`;

export const NEST_VERT = /* glsl */ `
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
attribute float aSub;
attribute vec4 aNest;
varying vec3 vNestW;
varying vec3 vNestN;
varying float vNestSub;
varying vec4 vNestAttr;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vNestW = w.xyz;
  vNestN = normalize(mat3(modelMatrix) * normal);
  vNestSub = aSub;
  vNestAttr = aNest;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}
`;

/**
 * Wall fragment shader. Lighting is the nest's own model (GDD 08 11.5): daylight falling in from the nearest
 * openings, a warm ambient that darkens with depth and away from entrances, the sense light around the possessed
 * ant, and a fill light from the cut side in the cutaway. Three's scene lights are not used: the world renderer
 * switches them to the underground look only when the camera is underground, which would make the daylight shaft
 * vanish exactly when the player stands in it. Detail normals are switched by the NEST_DETAIL define.
 */
export function wallFragment(o: { woody: boolean }): string {
  return /* glsl */ `
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
${o.woody ? '#define NEST_WOODY 1' : ''}
uniform sampler2D tWrA, tWrN, tWrR;
uniform float uWrScale, uWrNs, uStrata, uGrain, uWetDark, uDetailScale, uDetailW;
uniform vec3 uWrTint;
varying vec3 vNestW;
varying vec3 vNestN;
varying float vNestSub;
varying vec4 vNestAttr;
void main() {
  #include <logdepthbuf_fragment>
  // skin band (spike-nest 5.6b): wall fragments just below the soil surface are dropped under intact ground so
  // they cannot poke through the terrain. aNest.w is the terrain hole probe (mm, > 0 where the ground is cut open:
  // the world renderer's own test). Within the terrain lip around a hole the band is kept, or grazing views across
  // the hole see the sky through it under the lip; those wall tops lie flush with the terrain there, so the wall
  // materials carry a polygon offset and the terrain wins wherever both are drawn (no specks next to the hole).
  bool nestBand = vNestAttr.w <= -uHoleLip;
  if (vNestSub > (nestBand ? -uSkin : 0.0)) discard;
  if (uCutMode == 1 && nestCutHidden(vNestW)) discard;
  // openings: daylight and the ambient boost
  float sky = 0.0; float near = 0.0; vec3 skyDir = vec3(0.0, 1.0, 0.0);
  for (int i = 0; i < NEST_MAXO; i++) {
    if (i >= uSkyN) break;
    vec3 d = uSky[i].xyz - vNestW;
    float dc = length(d);
    float dist = max(dc - uSky[i].w, 0.0);
    float s = exp(-dist / uSkyLen);
    if (s > sky) { sky = s; skyDir = normalize(d + vec3(0.0, 0.01, 0.0)); }
    near = max(near, exp(-dist / uAmbNear.y));
  }
  // occlusion cutaway (GDD 01 6.5 rule 3): walls inside the camera-to-ant capsule are dithered to uOcc.y
  if (uOcc.x > 0.0) {
    vec3 ab = uOccB - uOccA;
    float t = clamp(dot(vNestW - uOccA, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    if (length(vNestW - (uOccA + ab * t)) < uOcc.x) {
      vec2 c = mod(floor(gl_FragCoord.xy), 4.0);
      float bayer = mod(c.x * 4.0 + c.y * 9.0 + c.x * c.y * 3.0, 16.0) / 16.0; // ordered 4x4 pattern
      if (bayer >= uOcc.y) discard;
    }
  }
  vec3 n0 = normalize(vNestN);
  if (!gl_FrontFacing) n0 = -n0;
  vec3 alb; vec3 nw; float rg;
  wrTri(tWrA, tWrN, tWrR, vNestW, n0, uWrScale, uWrNs, alb, nw, rg);
#ifdef NEST_DETAIL
  {
    vec3 a2; vec3 n2; float r2;
    wrTri(tWrA, tWrN, tWrR, vNestW, n0, uWrScale * uDetailScale, uWrNs, a2, n2, r2);
    nw = normalize(mix(nw, n2, uDetailW));
    alb = mix(alb, a2, 0.3);
  }
#endif
  alb *= uWrTint;
  {
    vec3 q = vNestW / uBu;
    float g = nestN3(q * 5.0) * 0.55 + nestN3(q * 1.4) * 0.45;
    alb *= 1.0 - uGrain * 0.5 + uGrain * g;
#ifdef NEST_WOODY
    float fib = nestN3(vec3(q.x * 0.6, q.y * 9.0, q.z * 9.0));
    alb *= 0.85 + 0.3 * fib;
#else
    float strata = nestN3(vec3(q.x * 0.15, q.y * 1.6, q.z * 0.15));
    alb = mix(alb, alb * vec3(1.08, 0.97, 0.88), strata * uStrata);
#endif
  }
  // freshly carved walls: darker and damper for one game hour (GDD 08 11.5)
  float fresh = clamp(1.0 - (uTick - vNestAttr.z) / uFresh.x, 0.0, 1.0);
  float wet = clamp(vNestAttr.y * uMoist.x + uMoist.y + fresh * uFresh.z, 0.0, 1.0);
  alb = wrWetAlbedo(alb, wet, uWetDark) * mix(1.0, uFresh.y, fresh);
  float ao = vNestAttr.x;

  float depth = max(-vNestSub, 0.0);
  // sky seen from inside a hole shrinks with depth below the rim (solid angle of the opening, r ~ 1 BU)
  float skyVis = 1.0 / (1.0 + (depth * depth) / (uBu * uBu));
  vec3 L = uSkyCol * sky * skyVis * (0.25 + 0.5 * max(dot(nw, skyDir), 0.0) + 0.25 * max(nw.y, 0.0));
  float deep = mix(1.0, uAmbDeep.x, smoothstep(0.0, uAmbDeep.y, depth));
  L += uAmb * deep * (1.0 + (uAmbNear.x - 1.0) * near);
  vec3 tl = uLanternPos - vNestW;
  float dl = length(tl);
  float fl = clamp(1.0 - dl / uLanternR, 0.0, 1.0);
  fl *= fl;
  L += uLanternCol * fl * mix(max(dot(nw, tl / max(dl, 1e-4)), 0.0), 1.0, uLanternWrap);
  if (uCutMode > 0) {
    float dp = abs(dot(vNestW - uCutC, uCutN));
    L += uCutFill * exp(-dp / uCutFillLen) * (0.45 + 0.55 * max(dot(nw, uCutN), 0.0)); // light enters from the cut side
  }
  gl_FragColor = vec4(alb * L * ao, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;
}

/** X-ray cast: the nest as a solid lit volume tinted by depth, seen through the ground. */
export const XRAY_FRAGMENT = /* glsl */ `
#include <logdepthbuf_pars_fragment>
varying vec3 vNestW;
varying vec3 vNestN;
varying float vNestSub;
varying vec4 vNestAttr;
void main() {
  #include <logdepthbuf_fragment>
  if (vNestSub > -uSkin) discard;
  vec3 n = normalize(vNestN);
  vec3 V = normalize(cameraPosition - vNestW);
  n = dot(n, V) < 0.0 ? -n : n;
  float depth = max(-vNestSub, 0.0);
  vec3 c = mix(uXNear, uXDeep, smoothstep(0.0, uXDepth, depth));
  float lam = 0.35 + 0.45 * max(dot(n, normalize(V + vec3(0.0, 0.8, 0.0))), 0.0) + 0.2 * max(n.y, 0.0);
  gl_FragColor = vec4(c * lam * (0.75 + 0.25 * vNestAttr.x), uXOpacity);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

/** Everything a nest fragment shader starts with: three's common chunk, the shared world snippets, the nest uniforms. */
export function fragmentPrelude(): string {
  return ['#include <common>', GLSL_NOISE, GLSL_TRIPLANAR, GLSL_WET, GLSL_NOISE3, GLSL_NEST_COMMON].join('\n');
}
