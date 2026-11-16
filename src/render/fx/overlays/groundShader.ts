// Ground field shaders of the temperature, moisture and threats overlays (GDD 08 §10.1). The field texture holds
// four channels per texel (samplers.ts); every class keeps a pattern of its own so hue is never required:
// isotherms every 5 °C (bolder every 10 °C), moisture contours at 25 / 50 / 75 % with solid wave-hatched standing
// water, predator areas hatched, rival territory outlined, hot surfaces stippled, human forecasts dashed.
//
// Two passes over the same draped grid:
// - stain (temperature, moisture): the ramp colour is applied as a per-channel MULTIPLIER of what is already drawn,
//   normalised to the ramp colour's luminance: the ground keeps its texture and its brightness and takes the
//   ramp's hue. The scene is drawn into a linear HDR target and tone mapped afterwards (render/app DirectGrade or
//   the post chain), where an ordinary translucent fill of a light ramp colour over dark soil reads far more opaque
//   than its alpha and washes the world out (review finding: the moisture field turned the soil flat blue). A
//   multiplier is independent of exposure and of the target.
// - ink (all modes): lines, hatching and outlines, composited in premultiplied alpha so every ink keeps its hue.
import { Color, CustomBlending, DataTexture, DstColorFactor, NormalBlending, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, Vector3, Vector4, ZeroFactor } from 'three';
import {
  FILL_ALPHA, FLOOD_ALPHA, ISOTHERM_STEP_C, LINE_ALPHA, MOISTURE_CONTOUR, MOISTURE_STAIN_MIN, STAIN_LIGHTNESS, TEMP_MAX_C, TEMP_MIN_C,
} from './tuning';

const vertex = /* glsl */ `
varying vec3 vWorld;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const common = /* glsl */ `
uniform sampler2D uField;
uniform vec4 uRegion;
uniform int uMode;
uniform vec3 uRamp0;
uniform vec3 uRamp1;
uniform vec3 uRamp2;
uniform float uMid;
uniform float uMono;
uniform float uBu;
varying vec3 vWorld;

vec3 ramp(float t) {
  vec3 c = t < uMid ? mix(uRamp0, uRamp1, clamp(t / max(uMid, 1e-3), 0.0, 1.0))
                    : mix(uRamp1, uRamp2, clamp((t - uMid) / max(1.0 - uMid, 1e-3), 0.0, 1.0));
  return mix(c, vec3(mix(0.02, 0.85, t)), uMono);
}
/** Field uv of this fragment, and the fade towards the region's edge (0 outside). */
float regionFade(out vec2 uv) {
  uv = (vWorld.xz - uRegion.xy) * uRegion.w;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) return 0.0;
  return smoothstep(0.0, 0.06, min(min(uv.x, uv.y), min(1.0 - uv.x, 1.0 - uv.y)));
}
`;

const stainFragment = /* glsl */ `
${common}
uniform float uFill;
uniform float uMoistMin;
uniform float uLumRef;
uniform float uLightness;

void main() {
  vec2 uv;
  float fade = regionFade(uv);
  if (fade <= 0.0 || uMode == 2) discard;
  vec4 d = texture2D(uField, uv);
  if (d.g < 0.5) discard;
  float strength;
  if (uMode == 0) {
    // departures from the optimum carry the colour; ground near the optimum stays as it is
    float dev = d.r < uMid ? (uMid - d.r) / max(uMid, 1e-3) : (d.r - uMid) / max(1.0 - uMid, 1e-3);
    strength = clamp(dev * 3.0, 0.0, 1.0);
  } else {
    if (d.b > 0.5) discard; // standing water: solid, drawn by the ink pass
    strength = mix(uMoistMin, 1.0, d.r);
  }
  vec3 c = ramp(d.r);
  float L = max(dot(c, vec3(0.2126, 0.7152, 0.0722)), 1e-3);
  // hue at constant luminance, then part of the ramp's own lightness step (wetter / further from optimum = darker)
  vec3 ratio = c / L * pow(clamp(L / uLumRef, 0.05, 1.0), uLightness);
  float a = uFill * strength * fade;
  // blended as dst * (src + 1 - a): dst * mix(1, ratio, a)
  gl_FragColor = vec4(min(ratio * a, vec3(1.0)), a);
}`;

const inkFragment = /* glsl */ `
${common}
uniform vec3 uInk[4];
uniform vec3 uWater;
uniform float uTempMin;
uniform float uTempRange;
uniform float uIso;
uniform float uContour;
uniform float uLine;
uniform float uFlood;
uniform float uExposure;

float bandOf(float ph, float w) {
  float f = fract(ph);
  float aa = clamp(fwidth(ph) * 1.2, 1e-4, 0.5);
  return smoothstep(0.0, aa, f) * (1.0 - smoothstep(w - aa, w, f));
}
/** Anti-aliased line where v crosses a multiple of 1 (w = half width in screen pixels). */
float isoLine(float v, float w) {
  float d = abs(fract(v + 0.5) - 0.5);
  float px = max(fwidth(v), 1e-5);
  return 1.0 - smoothstep(px * w, px * (w + 1.0), d);
}
/** Line where v crosses 0.5. */
float edgeLine(float v, float w) {
  float px = max(fwidth(v), 1e-5);
  return 1.0 - smoothstep(px * w, px * (w + 1.0), abs(v - 0.5));
}
/** Premultiplied "over": ink c at coverage a over acc. */
vec4 over(vec4 acc, vec3 c, float a) {
  return vec4(c * a + acc.rgb * (1.0 - a), a + acc.a * (1.0 - a));
}
/** A contour readable on dark soil and pale paving alike: a light halo under a dark core. */
vec4 contour(vec4 acc, float halo, float core, float k) {
  acc = over(acc, vec3(0.92, 0.9, 0.84), halo * 0.55 * k);
  return over(acc, vec3(0.05, 0.045, 0.04), core * k);
}

void main() {
  vec2 uv;
  float fade = regionFade(uv);
  if (fade <= 0.0) discard;
  vec4 d = texture2D(uField, uv);
  vec4 acc = vec4(0.0);
  if (uMode == 0) {
    if (d.g < 0.5) discard;
    float v = (uTempMin + d.r * uTempRange) / uIso;
    float major = isoLine(v * 0.5, 1.1);
    acc = contour(acc, isoLine(v, 2.2), max(isoLine(v, 0.6) * 0.75, major), uLine);
  } else if (uMode == 1) {
    if (d.g < 0.5) discard;
    float k = d.r / uContour;
    float on = (k > 0.5 && k < 3.5) ? 1.0 : 0.0;
    acc = contour(acc, isoLine(k, 2.2) * on, isoLine(k, 0.8) * on, uLine);
    if (d.b > 0.5) {
      // standing water: solid blue with light wave hatching
      float wave = bandOf((vWorld.z + sin(vWorld.x / (0.9 * uBu)) * 0.35 * uBu) / (1.4 * uBu), 0.25);
      acc = over(acc, uWater, uFlood);
      acc = over(acc, vec3(0.75, 0.88, 1.0), wave * 0.6 * uFlood);
    }
  } else {
    vec2 q = vWorld.xz / uBu;
    if (d.r > 0.02) {
      float h = bandOf((q.x + q.y) / 1.5, 0.3);
      acc = over(acc, uInk[0], (0.12 + 0.68 * h) * min(1.0, d.r * 1.4));
    }
    if (d.b > 0.02) {
      vec2 g = fract(q / 1.2) - 0.5;
      float dot1 = 1.0 - smoothstep(0.16, 0.22, length(g));
      acc = over(acc, uInk[2], (0.1 + 0.75 * dot1) * min(1.0, d.b * 1.4));
    }
    float rival = edgeLine(d.g, 1.4);
    acc = over(acc, uInk[1], max(rival * 0.95, step(0.5, d.g) * 0.08));
    float dash = step(0.5, fract((q.x - q.y) / 2.5));
    float human = edgeLine(d.a, 1.4) * dash;
    acc = over(acc, uInk[3], max(human * 0.95, step(0.5, d.a) * 0.06));
  }
  if (acc.a < 0.004) discard;
  gl_FragColor = vec4(acc.rgb * uExposure, acc.a) * fade;
  #include <colorspace_fragment>
}`;

/** Uniforms shared by the stain and ink materials (one object: updating a value updates both). */
function sharedUniforms(tex: DataTexture, bu: number) {
  return {
    uField: { value: tex },
    uRegion: { value: new Vector4(0, 0, 1, 1) },
    uMode: { value: 0 },
    uRamp0: { value: new Vector3() },
    uRamp1: { value: new Vector3() },
    uRamp2: { value: new Vector3() },
    uMid: { value: 0.5 },
    uMono: { value: 0 },
    uBu: { value: bu },
    // stain
    uFill: { value: FILL_ALPHA },
    uMoistMin: { value: MOISTURE_STAIN_MIN },
    uLumRef: { value: 1 },
    uLightness: { value: STAIN_LIGHTNESS },
    // ink
    uInk: { value: [new Vector3(), new Vector3(), new Vector3(), new Vector3()] },
    uWater: { value: new Vector3() },
    uTempMin: { value: TEMP_MIN_C },
    uTempRange: { value: TEMP_MAX_C - TEMP_MIN_C },
    uIso: { value: ISOTHERM_STEP_C },
    uContour: { value: MOISTURE_CONTOUR },
    uLine: { value: LINE_ALPHA },
    uFlood: { value: FLOOD_ALPHA },
    uExposure: { value: 1 },
  };
}

const drape = { transparent: true, depthWrite: false, depthTest: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -8, toneMapped: false };

export interface GroundMaterials {
  /** Multiplier pass (temperature and moisture fills). */
  stain: ShaderMaterial;
  /** Lines, hatching, outlines (premultiplied alpha). */
  ink: ShaderMaterial;
}

export function createGroundMaterials(tex: DataTexture, bu: number): GroundMaterials {
  const uniforms = sharedUniforms(tex, bu);
  const stain = new ShaderMaterial({
    name: 'fx:overlay-stain', vertexShader: vertex, fragmentShader: stainFragment, uniforms, ...drape,
    blending: CustomBlending,
    blendSrc: DstColorFactor, blendDst: OneMinusSrcAlphaFactor,
    blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor,
  });
  const ink = new ShaderMaterial({
    name: 'fx:overlay-ink', vertexShader: vertex, fragmentShader: inkFragment, uniforms, ...drape,
    blending: NormalBlending, premultipliedAlpha: true,
  });
  return { stain, ink };
}

const tmp = new Color();
export function setVec(v: Vector3, hex: string): void {
  tmp.set(hex);
  v.set(tmp.r, tmp.g, tmp.b);
}

/** Relative luminance of a hex colour in the linear working space. */
export function lumOf(hex: string): number {
  tmp.set(hex);
  return 0.2126 * tmp.r + 0.7152 * tmp.g + 0.0722 * tmp.b;
}
