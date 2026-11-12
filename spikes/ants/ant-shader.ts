/**
 * Ant animation in the vertex shader (spike). Injected with onBeforeCompile into MeshPhysicalMaterial (LOD0),
 * MeshStandardMaterial (LOD1/2, items, wings) and MeshDepthMaterial (shadow pass), so three's lighting, shadows,
 * fog, tone mapping and colour management all keep working.
 *
 * ATTRIBUTE LAYOUT
 *  per vertex (geometry, see ant-geometry.ts)
 *    position  vec3   rest position, body frame (mm). LEG vertices: segment-local (x along segment from proximal joint)
 *    normal    vec3   rest normal (segment-local for LEG)
 *    color     vec3   linear base colour
 *    aRig      vec4   x part id | y side (+1 L, -1 R) or leg index 0..5 (L1 L2 L3 R1 R2 R3) | z leg segment or gaster band | w aux
 *    uv        vec2   wings only
 *  per instance (InstancedBufferAttribute, 112 bytes / instance)
 *    instanceMatrix mat4  body frame -> world (translation on the walking surface, rotation = surface frame, uniform scale)
 *    aGait     vec4   x gait phase in cycles (CPU: += distance / (stride * scale)), y speed 0..1 (relative to cruise),
 *                     z turn rate (-1..1, + = left), w per-ant random 0..1
 *    aPose     vec4   x head raise 0..1 (carrying), y gaster -1 (curled under, spraying) .. +1 (raised alarm display),
 *                     z gaster swell 0..1 (crop fullness), w mandible gape 0..1
 *    aTint     vec4   rgb colour multiplier, a idle-fidget amount 0..1 (used when speed ~ 0)
 */
import { Color, MeshDepthMaterial, MeshPhysicalMaterial, MeshStandardMaterial, RGBADepthPacking, Uniform, Vector3, Vector4, DoubleSide } from 'three';
import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import type { AntRig, V4 } from './ant-geometry';
import type { V3 } from './mesh-builder';

/** shared clock: one uniform object for every ant material */
export const uTime = new Uniform(0);

const VERT_PARS = /* glsl */`
attribute vec4 aRig;
attribute vec4 aGait;
attribute vec4 aPose;
attribute vec4 aTint;
uniform float uTime;
uniform vec4 uLegA[3];
uniform vec4 uFoot[3];
uniform vec4 uLegLen[3];
uniform vec4 uGaitP;
uniform vec3 uNeck;
uniform vec3 uHeadUp;
uniform vec3 uMand;
uniform vec3 uSocket;
uniform vec3 uElbow;
uniform vec3 uElbowAxis;
uniform vec3 uGasterPivot;
uniform vec3 uGasterC;
uniform vec3 uGasterAxis;
uniform vec4 uGasterP;
uniform vec3 uPetPivot;
uniform vec3 uGrip;
uniform vec3 uGroom;
uniform vec3 uMembrane;
varying vec3 vAntMat;   // x roughness override (<0: none), y sheen gain, z 1 = compound eye
varying vec3 vRest;     // rest-frame position (eye facets, cuticle micro-variation)

mat3 antRotAxis(vec3 k, float a) {
  float c = cos(a), s = sin(a), t = 1.0 - c;
  return mat3(t*k.x*k.x + c,     t*k.x*k.y + s*k.z, t*k.x*k.z - s*k.y,
              t*k.x*k.y - s*k.z, t*k.y*k.y + c,     t*k.y*k.z + s*k.x,
              t*k.x*k.z + s*k.y, t*k.y*k.z - s*k.x, t*k.z*k.z + c);
}
mat3 antRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,s, 0.0,-s,c); }
mat3 antRotY(float a) { float c = cos(a), s = sin(a); return mat3(c,0.0,-s, 0.0,1.0,0.0, s,0.0,c); }
mat3 antRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c,s,0.0, -s,c,0.0, 0.0,0.0,1.0); }

void antDeform(vec3 P, vec3 N, out vec3 oP, out vec3 oN) {
  const float TAU = 6.28318530718;
  float part = aRig.x;
  float phase = aGait.x;
  float v = clamp(aGait.y, 0.0, 1.5);
  float moving = smoothstep(0.02, 0.25, v);
  float seed = aGait.w;
  float t = uTime + seed * 37.0;
  float idle = aTint.a * (1.0 - moving);

  // ---- body: bob twice per cycle (each tripod), small yaw/roll sway, idle breathing sway
  float yaw  = 0.035 * moving * sin(TAU * phase) + idle * 0.05 * sin(t * 0.61);
  float roll = 0.03 * moving * sin(TAU * phase + 1.3) + idle * 0.02 * sin(t * 0.83);
  // spraying (gaster curled under) stands the ant up on its legs so the gaster clears the ground
  float bob  = uGaitP.w * (moving * cos(2.0 * TAU * phase) + idle * 0.6 * sin(t * 1.7)) + max(-aPose.y, 0.0) * 0.42 * uGaitP.x;
  mat3 bodyR = antRotY(yaw) * antRotZ(roll);
  vec3 bodyT = vec3(0.0, bob, 0.0);

  // ---- legs: analytic IK per vertex, feet planted in the instance frame (no sliding)
  if (part > 4.5 && part < 5.5) {
    int leg = int(aRig.y + 0.5);
    int pair = leg - 3 * (leg / 3);
    float s = leg < 3 ? 1.0 : -1.0;
    vec4 LA = uLegA[pair]; vec4 LF = uFoot[pair]; vec4 LL = uLegLen[pair];
    bool tripodB = (s > 0.0) == (pair == 1);           // A = L1 R2 L3, B = R1 L2 R3
    float lp = fract(phase + (tripodB ? 0.5 : 0.0) + float(pair) * 0.03);
    float duty = uGaitP.z; float L = uGaitP.x;
    float dz, lift;
    if (lp < duty) { float u = lp / duty; dz = L * duty * (0.5 - u); lift = 0.0; }
    else { float u = (lp - duty) / (1.0 - duty); float e = u * u * (3.0 - 2.0 * u); dz = L * duty * (e - 0.5); lift = sin(3.14159265 * u) * uGaitP.y * moving; }
    vec3 F = vec3(LF.x * s, lift, LF.z + dz);
    // idle fidget: one foreleg lifts to groom the antenna now and then
    float gside = seed > 0.5 ? 1.0 : -1.0;
    if (pair == 0 && s == gside) {
      float g = idle * smoothstep(0.55, 0.9, sin(t * 0.45 + seed * 6.0));
      vec3 gt = vec3(uGroom.x * s, uGroom.y + 0.15 * uGaitP.y * sin(t * 9.0), uGroom.z);
      F = mix(F, bodyR * gt + bodyT, g);
    }
    vec3 A = bodyR * vec3(LA.x * s, LA.y, LA.z) + bodyT;
    vec3 up = vec3(0.0, 1.0, 0.0);
    vec3 d = F - A; d.y = 0.0; float dl = length(d);
    d = dl > 1e-5 ? d / dl : vec3(s, 0.0, 0.0);
    vec3 H = A + LL.x * normalize(-up * cos(LF.w) + d * sin(LF.w));
    vec3 T = F + LL.w * normalize(-d * cos(LA.w) + up * sin(LA.w));
    vec3 D = T - H; float dist = length(D); vec3 dirD = D / max(dist, 1e-5);
    float Lf = LL.y, Lt = LL.z;
    float dc = clamp(dist, abs(Lf - Lt) + 1e-3, Lf + Lt - 1e-3);
    float cosA = (Lf * Lf + dc * dc - Lt * Lt) / (2.0 * Lf * dc);
    float sinA = sqrt(max(0.0, 1.0 - cosA * cosA));
    vec3 nrm = normalize(cross(d, up));
    vec3 perp = cross(nrm, dirD);                    // in the leg plane, knee goes up/out
    vec3 K = H + Lf * (dirD * cosA + perp * sinA);
    int seg = int(aRig.z + 0.5);
    vec3 P0 = seg == 0 ? A : seg == 1 ? H : seg == 2 ? K : T;
    vec3 P1 = seg == 0 ? H : seg == 1 ? K : seg == 2 ? T : F;
    vec3 x = normalize(P1 - P0); vec3 z = nrm; vec3 y = cross(z, x);
    oP = P0 + x * P.x + y * P.y + z * P.z;
    oN = x * N.x + y * N.y + z * N.z;
    return;
  }

  vec3 p = P; vec3 n = N;
  float side = aRig.y;
  // gaster angle: + raised (alarm display), - curled forward under the body (formicine spray posture)
  float gp = aPose.y;
  float gang = (gp > 0.0 ? gp * 0.95 : gp * 2.3) + 0.03 * moving * sin(2.0 * TAU * phase + 0.7) + idle * 0.03 * sin(t * 1.1);

  if (part > 0.5 && part < 4.5 || part > 7.5 && part < 8.5) {
    // ---- head-attached parts: mandibles, antennae, items are posed in the head frame first
    if (part > 1.5 && part < 4.5) {
      if (side < 0.0) { p.x = -p.x; n.x = -n.x; }                // canonical left
      float sph = side > 0.0 ? 0.0 : 1.7;
      if (part < 2.5) {
        float gape = clamp(aPose.w, 0.0, 1.0) * 0.75 + idle * 0.12 * max(0.0, sin(t * 2.3 + sph));
        mat3 R = antRotAxis(uHeadUp, gape);
        p = uMand + R * (p - uMand); n = R * n;
      } else {
        float searching = 0.18 + 0.12 * idle + 0.1 * moving;
        float sweep = searching * sin(t * (2.0 + seed) + sph) + 0.1 * clamp(aGait.z, -1.0, 1.0) * side;
        float pitchA = 0.14 * sin(t * (1.3 + 0.5 * seed) + 1.3 * sph) - 0.12 * aPose.x;
        if (part > 3.5) {
          float flick = 0.2 * sin(t * (3.1 + seed) + sph) - 0.15 * aPose.x;
          mat3 Rf = antRotAxis(uElbowAxis, flick);
          p = uElbow + Rf * (p - uElbow); n = Rf * n;
        }
        mat3 Rs = antRotAxis(uHeadUp, sweep) * antRotX(pitchA);
        p = uSocket + Rs * (p - uSocket); n = Rs * n;
      }
      if (side < 0.0) { p.x = -p.x; n.x = -n.x; }                // back to the right side
    }
    if (part > 7.5) {
      // carried item: cancel the instance scale around the grip so items keep their real size
      float sc = length(instanceMatrix[0].xyz);
      p = uGrip + (p - uGrip) / sc;
    }
    float hp = -aPose.x * 0.55 + 0.035 * moving * sin(2.0 * TAU * phase) + idle * 0.08 * sin(t * 0.53);
    float hy = 0.12 * clamp(aGait.z, -1.0, 1.0) + (0.04 + idle * 0.22) * sin(t * 0.37 + 2.0);
    mat3 headR = antRotY(hy) * antRotX(hp);
    p = uNeck + headR * (p - uNeck); n = headR * n;
  } else if (part > 5.5 && part < 6.5 || part > 8.5) {
    if (part < 6.5) {
      // ---- crop swelling: plates spread along the axis, everything widens; membranes stretch a bit more
      float sw = clamp(aPose.z, 0.0, 1.0);
      vec3 q = p - uGasterC; float ax = dot(q, uGasterAxis); vec3 r = q - ax * uGasterAxis;
      float gain = 1.0 + sw * uGasterP.x * (1.0 + 0.12 * aRig.w);
      ax = ax * (1.0 + 0.12 * sw) + (aRig.z - 0.5 * (uGasterP.z - 1.0)) * uGasterP.y * sw;
      p = uGasterC + ax * uGasterAxis + r * gain;
      mat3 Rg = antRotX(gang * (1.0 - uGasterP.w));
      p = uGasterPivot + Rg * (p - uGasterPivot); n = Rg * n;
    }
    mat3 Rp = antRotX(gang * uGasterP.w);
    p = uPetPivot + Rp * (p - uPetPivot); n = Rp * n;
  }
  oP = bodyR * p + bodyT;
  oN = bodyR * n;
}
`;

const FRAG_PARS = /* glsl */`
varying vec3 vAntMat;
varying vec3 vRest;
uniform float uFacet;
float antHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
vec3 antHash3(vec3 p) { return vec3(antHash(p), antHash(p + 19.19), antHash(p + 47.47)); }
float antNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(antHash(i), antHash(i + vec3(1,0,0)), f.x), mix(antHash(i + vec3(0,1,0)), antHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(antHash(i + vec3(0,0,1)), antHash(i + vec3(1,0,1)), f.x), mix(antHash(i + vec3(0,1,1)), antHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
// distance to the nearest jittered cell centre (ommatidia); returns a dome height per facet
float antFacets(vec3 p) {
  vec3 c = floor(p); float best = 9.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) for (int k = -1; k <= 1; k++) {
    vec3 o = c + vec3(float(i), float(j), float(k)); vec3 q = o + 0.2 + 0.6 * antHash3(o);
    vec3 d = p - q; best = min(best, dot(d, d));
  }
  return -best;
}
`;

export interface AntMatOptions { physical?: boolean; roughness?: number; sheen?: number; clearcoat?: number; transparent?: boolean; opacity?: number; wings?: boolean }

function rigUniforms(rig: AntRig) {
  const v3 = (a: V3) => new Vector3(a[0], a[1], a[2]);
  const v4 = (a: V4) => new Vector4(a[0], a[1], a[2], a[3]);
  return {
    uTime,
    uLegA: { value: rig.legA.map(v4) }, uFoot: { value: rig.foot.map(v4) }, uLegLen: { value: rig.legLen.map(v4) },
    uGaitP: { value: v4(rig.gait) }, uNeck: { value: v3(rig.neck) }, uHeadUp: { value: v3(rig.headUp) },
    uMand: { value: v3(rig.mand) }, uSocket: { value: v3(rig.socket) }, uElbow: { value: v3(rig.elbow) }, uElbowAxis: { value: v3(rig.elbowAxis) },
    uGasterPivot: { value: v3(rig.gasterPivot) }, uGasterC: { value: v3(rig.gasterC) }, uGasterAxis: { value: v3(rig.gasterAxis) },
    uGasterP: { value: v4(rig.gasterP) }, uPetPivot: { value: v3(rig.petPivot) }, uGrip: { value: v3(rig.grip) },
    uGroom: { value: v3(rig.groom) }, uMembrane: { value: v3(rig.membrane) }, uFacet: { value: rig.facet },
  };
}

function patchVertex(shader: WebGLProgramParametersWithUniforms, withNormal: boolean) {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_PARS);
  if (withNormal) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 antP; vec3 antN; antDeform(position, normal, antP, antN);\nvec3 objectNormal = antN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = antP;\nvRest = position;')
      .replace('#include <color_vertex>', `#include <color_vertex>
#ifdef USE_COLOR
  if (aRig.x > 5.5 && aRig.x < 6.5) vColor.rgb = mix(vColor.rgb, uMembrane, aRig.w * smoothstep(0.05, 0.6, aPose.z));
  if (aRig.x < 7.5 || aRig.x > 8.5) vColor.rgb *= aTint.rgb;
#endif
  vAntMat = vec3(-1.0, 1.0, 0.0);
  if (aRig.x > 0.5 && aRig.x < 1.5 && aRig.w > 0.5) vAntMat = aRig.w > 1.5 ? vec3(0.08, 0.0, 0.0) : vec3(0.22, 0.15, 1.0);
  if (aRig.x > 7.5 && aRig.x < 8.5) vAntMat = vec3(aRig.w, 0.0, 0.0);
  if (aRig.x > 1.5 && aRig.x < 2.5) vAntMat = vec3(0.5, 0.15, 0.0);   // mandibles: thin blades seen at grazing angles, keep sheen low
  if (aRig.x > 6.5 && aRig.x < 7.5) vAntMat = vec3(-1.0, 0.0, 0.0);`);
  } else {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 antP; vec3 antN; antDeform(position, normal, antP, antN);\nvec3 transformed = antP;');
  }
}

function patchFragment(shader: WebGLProgramParametersWithUniforms, physical: boolean) {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + FRAG_PARS)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
  if (vAntMat.x >= 0.0) roughnessFactor = vAntMat.x;
  else roughnessFactor *= 0.75 + 0.5 * antNoise(vRest * 45.0);`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
  if (vAntMat.z > 0.5) {
    // compound-eye facets: derivative bump mapping of a per-ommatidium dome
    float h = antFacets(vRest / uFacet) * uFacet * 0.3;
    vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
    vec2 dH = vec2(dFdx(h), dFdy(h));
    vec3 R1 = cross(dpy, normal), R2 = cross(normal, dpx); float det = dot(dpx, R1);
    vec3 grad = sign(det) * (dH.x * R1 + dH.y * R2);
    normal = normalize(abs(det) * normal - grad);
  }`);
  if (physical) {
    shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
#ifdef USE_SHEEN
  material.sheenColor *= vAntMat.y;
#endif`);
  }
}

/** body material for one variant. physical = LOD0 look (clearcoat cuticle + pubescence sheen) */
export function makeAntMaterial(rig: AntRig, o: AntMatOptions = {}): Material {
  const common = { vertexColors: true, roughness: o.roughness ?? 0.42, metalness: 0.0, transparent: o.transparent ?? false, opacity: o.opacity ?? 1 };
  const mat = o.physical
    ? new MeshPhysicalMaterial({ ...common, sheen: o.sheen ?? 0.5, sheenRoughness: 0.6, sheenColor: new Color('#5f5a50'), clearcoat: o.clearcoat ?? 0.3, clearcoatRoughness: 0.38 })
    : new MeshStandardMaterial(common);
  const u = rigUniforms(rig);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    patchVertex(shader, true);
    patchFragment(shader, !!o.physical);
  };
  mat.customProgramCacheKey = () => `ant-body-${o.physical ? 'p' : 's'}`;
  return mat;
}

/** wing material: hyaline membrane with procedural venation + pterostigma, thin-film iridescence */
export function makeWingMaterial(rig: AntRig, membraneHex: string, veinHex: string): Material {
  const mat = new MeshPhysicalMaterial({
    vertexColors: false, color: new Color(membraneHex), roughness: 0.25, metalness: 0, transparent: true, opacity: 1, depthWrite: false,
    side: DoubleSide, iridescence: 0.7, iridescenceIOR: 1.35, iridescenceThicknessRange: [250, 520],
  });
  const u = { ...rigUniforms(rig), uVein: { value: new Color(veinHex) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    patchVertex(shader, true);
    shader.vertexShader = shader.vertexShader.replace('#include <uv_vertex>', '#include <uv_vertex>\nvWingUv = uv;').replace('#include <common>', '#include <common>\nvarying vec2 vWingUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec2 vWingUv;
uniform vec3 uVein;
float segD(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
  {
    vec2 w = vWingUv; vec2 q = vec2(w.x, w.y * 0.32); // anisotropic: chord is ~0.3 of the span
    float d = 1.0;
    // formicine forewing: costa/subcosta+radius, pterostigma, radial sector, media, cubitus, cross-veins (one cubital cell)
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
  }`);
  };
  mat.customProgramCacheKey = () => 'ant-wing';
  return mat;
}

/** shadow pass material with the same deformation (otherwise shadows show the rest pose) */
export function makeAntDepthMaterial(rig: AntRig): MeshDepthMaterial {
  const mat = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const u = rigUniforms(rig);
  mat.onBeforeCompile = (shader) => { Object.assign(shader.uniforms, u); patchVertex(shader, false); };
  mat.customProgramCacheKey = () => 'ant-depth';
  return mat;
}
