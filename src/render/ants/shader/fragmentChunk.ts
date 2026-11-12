// Fragment-side GLSL: per-part roughness, cuticle micro-variation, compound-eye facets, and the selection highlight
// (a faint rim term; GDD 08 §11.8 forbids cartoon outlines).
export const ANT_FRAG_PARS = /* glsl */ `
varying vec3 vAntMat;
varying vec3 vRest;
varying float vAntHi;
uniform float uFacet;
uniform vec3 uHiWarm;
uniform vec3 uHiCool;
float antHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 antHash3(vec3 p) { return vec3(antHash(p), antHash(p + 19.19), antHash(p + 47.47)); }
float antNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(antHash(i), antHash(i + vec3(1,0,0)), f.x), mix(antHash(i + vec3(0,1,0)), antHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(antHash(i + vec3(0,0,1)), antHash(i + vec3(1,0,1)), f.x), mix(antHash(i + vec3(0,1,1)), antHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float antFacets(vec3 p) {
  vec3 c = floor(p); float best = 9.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
    vec3 o = c + vec3(float(i), float(j), float(k)); vec3 q = o + 0.2 + 0.6 * antHash3(o);
    vec3 d = p - q; best = min(best, dot(d, d));
  }
  return -best;
}
`;

export const ANT_ROUGHNESS = /* glsl */ `#include <roughnessmap_fragment>
  if (vAntMat.x >= 0.0) roughnessFactor = vAntMat.x;
  else roughnessFactor *= 0.75 + 0.5 * antNoise(vRest * 45.0);`;

export const ANT_NORMAL = /* glsl */ `#include <normal_fragment_maps>
  if (vAntMat.z > 0.5) {
    float h = antFacets(vRest / uFacet) * uFacet * 0.3;
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    vec2 dH = vec2(dFdx(h), dFdy(h));
    vec3 R1 = cross(dpy, normal), R2 = cross(normal, dpx); float det = dot(dpx, R1);
    vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
    normal = normalize(abs(det) * normal - grad);
  }`;

export const ANT_EMISSIVE = /* glsl */ `#include <emissivemap_fragment>
  {
    float hiA = abs(vAntHi);
    if (hiA > 0.001) {
      float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
      totalEmissiveRadiance += (vAntHi > 0.0 ? uHiWarm : uHiCool) * hiA * (fr + 0.015);
    }
  }`;

export const ANT_SHEEN = /* glsl */ `#include <lights_physical_fragment>
#ifdef USE_SHEEN
  material.sheenColor *= vAntMat.y;
#endif`;

export const WING_FRAG_PARS = /* glsl */ `
varying vec2 vWingUv;
uniform vec3 uVein;
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }`;

/** Formicine-style venation: costa, Sc+R, pterostigma, Rs, M, Cu and cross-veins (one cubital cell). */
export const WING_COLOR = /* glsl */ `#include <color_fragment>
  {
    vec2 w = vWingUv; vec2 q = vec2(w.x, w.y * 0.32);
    float d = 1.0;
    d = min(d, segD(q, vec2(0.0, 0.31), vec2(0.62, 0.315)));
    d = min(d, segD(q, vec2(0.0, 0.27), vec2(0.6, 0.29)));
    d = min(d, segD(q, vec2(0.6, 0.29), vec2(0.82, 0.24)));
    d = min(d, segD(q, vec2(0.82, 0.24), vec2(0.97, 0.15)));
    d = min(d, segD(q, vec2(0.02, 0.2), vec2(0.36, 0.17)));
    d = min(d, segD(q, vec2(0.36, 0.17), vec2(0.6, 0.29)));
    d = min(d, segD(q, vec2(0.36, 0.17), vec2(0.56, 0.12)));
    d = min(d, segD(q, vec2(0.56, 0.12), vec2(0.82, 0.24)));
    d = min(d, segD(q, vec2(0.56, 0.12), vec2(0.86, 0.06)));
    d = min(d, segD(q, vec2(0.04, 0.1), vec2(0.34, 0.065)));
    d = min(d, segD(q, vec2(0.34, 0.065), vec2(0.36, 0.17)));
    d = min(d, segD(q, vec2(0.34, 0.065), vec2(0.62, 0.02)));
    float vein = 1.0 - smoothstep(0.0025, 0.006, d);
    float stigma = 1.0 - smoothstep(0.0, 0.03, length((q - vec2(0.62, 0.3)) * vec2(1.0, 2.6)) - 0.02);
    float m = max(vein, stigma);
    float edge = smoothstep(0.0, 0.04, w.y) * smoothstep(1.0, 0.94, w.y);
    diffuseColor.rgb = mix(diffuseColor.rgb, uVein, m);
    diffuseColor.a = mix(0.16, 0.92, m) * mix(1.6, 1.0, edge);
  }`;
