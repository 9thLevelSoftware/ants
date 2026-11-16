// Scent glyph shader: one instanced quad per drawn cell, laid flat on its surface (ground, wall, tunnel wall) and
// patterned by channel so hue is never required (GDD 08 §10.1): trail = chevrons flowing towards the food, home =
// sparse stipple, alarm = zigzag rings expanding (static double ring in reduced motion), food odour = concentric
// thin rings, rival colonies = the same glyphs with diagonal hatching. Opacity and glyph density follow intensity.
import { Color, DoubleSide, NormalBlending, ShaderMaterial, Vector3 } from 'three';
import {
  ALARM_RING_BU, ALARM_RING_SPEED_BU_S, ALPHA_MAX, ALPHA_MIN, CHEVRON_PERIOD_BU, CHEVRON_SPEED_BU_S, DECAL, FOOD_RING_BU, HATCH_BU,
  STIPPLE_SPACING_BU, WASH,
} from './tuning';

const vertex = /* glsl */ `
attribute vec4 iPosSize;
attribute vec4 iNrmStyle;
attribute vec3 iAxis;
attribute float iVal;
uniform float uLift;
uniform float uAcrossK;
varying vec2 vLocal;
varying vec3 vWorld;
varying vec3 vAxis;
varying vec3 vNrm;
varying float vVal;
varying float vStyle;
varying float vSize;
void main() {
  vVal = iVal;
  vStyle = iNrmStyle.w;
  if (iVal <= 0.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); return; }
  vec3 n = normalize(iNrmStyle.xyz);
  vec3 a = iAxis - n * dot(iAxis, n);
  a = dot(a, a) > 1e-8 ? normalize(a) : normalize(cross(n, abs(n.x) > 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0)));
  vec3 s = cross(n, a);
  float base = vStyle > 3.5 ? vStyle - 4.0 : vStyle;
  float halfA = iPosSize.w;
  float halfS = base < 0.5 ? iPosSize.w * uAcrossK : iPosSize.w;
  vec3 w = iPosSize.xyz + n * uLift + a * (position.x * halfA) + s * (position.y * halfS);
  vLocal = position.xy;
  vWorld = w;
  vAxis = a;
  vNrm = n;
  vSize = iPosSize.w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
}`;

const fragment = /* glsl */ `
uniform float uTime;
uniform float uReduced;
uniform vec3 uInk[5];
uniform float uChevronPeriod;
uniform float uChevronSpeed;
uniform float uStipple;
uniform float uAlarmRing;
uniform float uAlarmSpeed;
uniform float uFoodRing;
uniform float uHatch;
uniform float uAcrossK;
uniform float uAlphaMin;
uniform float uAlphaMax;
uniform float uWash;
uniform float uOpacity;
uniform float uExposure;
varying vec2 vLocal;
varying vec3 vWorld;
varying vec3 vAxis;
varying vec3 vNrm;
varying float vVal;
varying float vStyle;
varying float vSize;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
/** 1 inside [0, w) of a repeating unit phase, anti-aliased. */
float bandOf(float ph, float w) {
  float f = fract(ph);
  float aa = clamp(fwidth(ph) * 1.2, 1e-4, 0.5);
  return smoothstep(0.0, aa, f) * (1.0 - smoothstep(w - aa, w, f));
}
vec2 planar(vec3 p, vec3 n) {
  vec3 an = abs(n);
  return an.y >= max(an.x, an.z) ? p.xz : (an.x >= an.z ? p.zy : p.xy);
}

void main() {
  if (vVal <= 0.0) discard;
  bool rival = vStyle > 3.5;
  float base = rival ? vStyle - 4.0 : vStyle;
  float r = length(vLocal);
  // soft edges so overlapping neighbours merge (food rings keep a crisper rim)
  float edge = base > 2.5 ? 0.8 : base > 0.5 ? 0.25 : 0.35;
  float mask = 1.0 - smoothstep(edge, 1.0, r);
  if (mask <= 0.0) discard;
  float v = clamp(vVal, 0.0, 1.0);
  float glyph = 0.0;
  float wash = uWash;
  int ink = 0;
  vec2 q = planar(vWorld, vNrm);
  if (base < 0.5) {
    // chevrons pointing along +axis (towards the food), flowing that way
    float along = dot(vWorld, vAxis);
    float lateral = vLocal.y * vSize * uAcrossK;
    float t = uReduced > 0.5 ? 0.0 : uTime * uChevronSpeed;
    glyph = bandOf((along + abs(lateral) * 1.1 - t) / uChevronPeriod, mix(0.2, 0.42, v));
    ink = 0;
  } else if (base < 1.5) {
    // sparse stipple on a world-anchored grid: denser and larger dots where stronger
    vec2 g = q / uStipple;
    vec2 cell = floor(g);
    vec2 jit = vec2(hash12(cell + 17.0), hash12(cell + 31.0)) - 0.5;
    float d = length(fract(g) - 0.5 - jit * 0.35);
    float keep = step(hash12(cell), 0.25 + 0.6 * v);
    float rad = mix(0.13, 0.26, v);
    float aa = fwidth(d) * 1.2 + 1e-4;
    glyph = keep * (1.0 - smoothstep(rad - aa, rad, d));
    wash *= 0.4;
    ink = 1;
  } else if (base < 2.5) {
    // zigzag rings expanding from the cell (static double ring in reduced motion)
    float rr = r * vSize;
    float ang = atan(vLocal.y, vLocal.x);
    float zig = abs(fract(ang * 8.0 / 6.2831853) - 0.5) * uAlarmRing * 0.45;
    if (uReduced > 0.5) {
      glyph = max(bandOf((rr + zig) / (vSize * 0.45), 0.16), 0.0) * step(rr, vSize * 0.95);
    } else {
      glyph = bandOf((rr + zig - uTime * uAlarmSpeed) / uAlarmRing, mix(0.18, 0.34, v));
    }
    ink = 2;
  } else {
    // concentric thin rings around a food source
    float rr = r * vSize;
    glyph = bandOf(rr / uFoodRing, 0.14);
    wash *= 0.35;
    ink = 3;
  }
  if (rival) {
    float h = bandOf((q.x + q.y) / uHatch, 0.3);
    glyph = max(glyph * 0.9, h * 0.55);
    ink = 4;
  }
  float alpha = mask * mix(uAlphaMin, uAlphaMax, v) * max(glyph, wash) * uOpacity;
  if (alpha < 0.004) discard;
  vec3 col = ink == 0 ? uInk[0] : ink == 1 ? uInk[1] : ink == 2 ? uInk[2] : ink == 3 ? uInk[3] : uInk[4];
  gl_FragColor = vec4(col * uExposure, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/** Ink order of uInk: trail, home, alarm, food, rival. */
export const INK_ORDER = ['trail', 'home', 'alarm', 'food', 'rival'] as const;

export function createScentMaterial(bu: number, cellMm: number): ShaderMaterial {
  const inks = INK_ORDER.map(() => new Vector3(1, 1, 1));
  return new ShaderMaterial({
    name: 'fx:scent',
    vertexShader: vertex,
    fragmentShader: fragment,
    uniforms: {
      uTime: { value: 0 },
      uReduced: { value: 0 },
      uInk: { value: inks },
      uChevronPeriod: { value: CHEVRON_PERIOD_BU * bu },
      uChevronSpeed: { value: CHEVRON_SPEED_BU_S * bu },
      uStipple: { value: STIPPLE_SPACING_BU * bu },
      uAlarmRing: { value: ALARM_RING_BU * bu },
      uAlarmSpeed: { value: ALARM_RING_SPEED_BU_S * bu },
      uFoodRing: { value: FOOD_RING_BU * bu },
      uHatch: { value: HATCH_BU * bu },
      uAcrossK: { value: DECAL.across / DECAL.along },
      uLift: { value: DECAL.liftMm },
      uAlphaMin: { value: ALPHA_MIN },
      uAlphaMax: { value: ALPHA_MAX },
      uWash: { value: WASH },
      uOpacity: { value: 1 },
      uExposure: { value: 1 },
      uCell: { value: cellMm },
    },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: NormalBlending,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -4,
    toneMapped: false,
  });
}

/** Sets the five inks from sRGB hex strings (converted to the linear working space). */
export function setInks(mat: ShaderMaterial, hex: readonly string[]): void {
  const c = new Color();
  const arr = mat.uniforms.uInk.value as Vector3[];
  for (let i = 0; i < arr.length; i++) {
    c.set(hex[i] ?? '#ffffff');
    arr[i].set(c.r, c.g, c.b);
  }
}
