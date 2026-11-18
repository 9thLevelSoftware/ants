// Fragment-side GLSL: per-part roughness, cuticle micro-variation, compound-eye facets, and the selection highlight
// (a faint rim term; GDD 08 §11.8 forbids cartoon outlines). The look numbers live in ../tuning.ts.
import { ANT_DAY_LOOK, ANT_NIGHT_LOOK, WING_LOOK } from '../tuning';

export const ANT_FRAG_PARS = /* glsl */ `
varying vec3 vAntMat;
varying vec3 vRest;
varying float vAntHi;
varying float vCapIn;
varying vec2 vAntK;
uniform float uFacet;
uniform vec3 uHiWarm;
uniform float uSubjectOpacity;
uniform float uCapOpacity;
uniform vec3 uHiCool;
uniform float uFillBody;
uniform float uFillRim;
uniform float uFillK;
uniform vec3 uFillCol;
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
  // the possessed ant (the only positive highlight) fades with the third-person camera (GDD 01 6.5 rule 1), and
  // other ants inside the camera-to-ant capsule are dithered to uCapOpacity (rule 2): ordered 4x4 dither
  {
    float keep = vAntHi > 0.0 ? uSubjectOpacity : (vCapIn > 0.5 ? uCapOpacity : 1.0);
    if (keep < 1.0) {
      vec2 dc = mod(floor(gl_FragCoord.xy), 4.0);
      if (mod(dc.x * 4.0 + dc.y * 9.0 + dc.x * dc.y * 3.0, 16.0) / 16.0 >= keep) discard;
    }
  }
  {
    float hiA = abs(vAntHi);
    if (hiA > 0.001) {
      float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 4.0); // a rim: silhouettes only
      totalEmissiveRadiance += (vAntHi > 0.0 ? uHiWarm : uHiCool) * hiA * (fr * vAntK.y + 0.015);
    }
  }`;

/**
 * Form light (tuning.ts ANT_FILL), body materials only: where the scene lights leave the cuticle black (underground,
 * night) a soft key from the viewer's upper left and a sky / ceiling term show the form of the body on a lifted
 * albedo, and a grazing rim separates it from the ground. Zero (and skipped) in daylight.
 */
export const ANT_FILL = /* glsl */ `
  if (uFillBody > 0.0 || uFillRim > 0.0) {
    vec3 fN = normalize(normal);
    vec3 fV = normalize(vViewPosition);
    vec3 fUp = normalize((viewMatrix * vec4(0.0, 1.0, 0.0, 0.0)).xyz);
    float fKey = 0.5 + 0.5 * dot(fN, normalize(vec3(-0.4, 0.6, 0.7)));
    float fSky = 0.5 + 0.5 * dot(fN, fUp);
    float fRim = pow(1.0 - clamp(dot(fN, fV), 0.0, 1.0), 3.0);
    vec3 fBase = diffuseColor.rgb;
    float fLum = dot(fBase, vec3(0.2126, 0.7152, 0.0722));
    vec3 fAlb = fBase * 0.6 + vec3(0.8 * fLum + 0.012);
    totalEmissiveRadiance += uFillCol * (uFillBody * fAlb * (0.9 * fKey * fKey + 0.6 * fSky) + uFillRim * vAntK.y * fRim);
  }`;

export const ANT_SHEEN = /* glsl */ `#include <lights_physical_fragment>
#ifdef USE_SHEEN
  material.sheenColor *= vAntMat.y;
#endif
#ifdef USE_CLEARCOAT
  material.clearcoat *= vAntK.x; // a stretched membrane is dull, not lacquered (white rings on a full gaster)
  material.clearcoat *= 1.0 - ${ANT_NIGHT_LOOK.clearcoatCut.toFixed(2)} * uFillK; // at night the mirror would only show the sky: chrome
  material.clearcoat *= mix(${ANT_DAY_LOOK.clearcoatMul.toFixed(2)}, 1.0, uFillK); // by day it mirrors the overcast sky: glass, not chitin
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
    // hyaline membrane: four folded layers over a dark body must stay clear (0.16 read as milky white)
    diffuseColor.a = mix(${WING_LOOK.alpha.toFixed(3)}, ${WING_LOOK.veinAlpha.toFixed(2)}, m) * mix(${WING_LOOK.edgeBoost.toFixed(2)}, 1.0, edge);
    // night: a clear membrane against a dark ground and sky vanished (faint male wings, look pass 3): it takes a little more body
    diffuseColor.a = min(1.0, diffuseColor.a * (1.0 + ${WING_LOOK.nightAlphaGain.toFixed(2)} * uFillK));
  }`;

/** Wing emissive: the possession highlight and, at night, a faint cool edge light (the form light's rim) so the wings keep their outline. */
export const WING_EMISSIVE = ANT_EMISSIVE.replace('(fr * vAntK.y + 0.015)', `(fr * vAntK.y + 0.015) * ${WING_LOOK.highlightRim.toFixed(2)}`) + /* glsl */ `
  totalEmissiveRadiance += uFillCol * uFillRim * ${WING_LOOK.nightRim.toFixed(2)} * pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), ${WING_LOOK.nightRimPow.toFixed(1)});`;
