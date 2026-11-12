/**
 * GLSL for the ant vertex animation, injected into three's own materials with onBeforeCompile.
 *
 * PER-VERTEX (geometry): position/normal (rest, body frame; LEG vertices segment-local), color, aRig = (part id,
 * side or leg index, leg segment or gaster band, aux).
 *
 * PER-INSTANCE (InstancedBufferAttribute, 176 bytes with instanceMatrix). The scheme is meant to be reused by
 * creatures (spiders, aphids ...) with their own deform function (a creature uses as many foot groups as its gait
 * has: an alternating-tetrapod spider needs two, like the ant's tripods):
 *   instanceMatrix  body frame -> world: translation on the surface, rotation = surface frame (+Y up, +Z heading), uniform scale
 *   aGait   x gait phase (cycles)  y moving (speed / cruise, 0..1.5)  z heading change per gait cycle (rad, + left)  w seed 0..1
 *   aPose   x head raise 0..1  y gaster -1 (curled under) .. +1 (raised)  z gaster swell 0..1 (crop)  w mandible gape 0..1
 *   aTint   rgb colour multiplier  a idle fidget 0..1
 *   aAct    x stride translation share 0..1 (1 = pure walking, 0 = turning on the spot)  y extra head pitch (rad, + down)
 *           z forced foreleg grooming 0..1  w chewing / rasping 0..1
 *   aExtra  x ants: leg spread 0..1 (falling) | carried-item batches: item size factor  y highlight (+ possessed, - hovered)
 *           z callow 0..1  w antenna activity (1 normal, 0 calm, 2 searching / alarmed)
 *   aFootA  foot placement of tripod A (L1 R2 L3): x angle (rad), y, z offset (body frame, rig units)  w walking direction +1 / -1
 *   aFootB  the same for tripod B (R1 L2 R3)  w unused
 *
 * Feet do not slide: the CPU (gait.ts) tracks each tripod's placement through its stance with the exact inverse of the
 * body's motion (forward, sideways, turning), so a stance foot here is just R(angle) * restFoot + offset. In swing the
 * placement is the frozen lift-off point and the foot travels to the predicted touchdown point.
 */
import { CUTICLE } from '../tuning';

export const ANT_VERT_PARS = /* glsl */ `
attribute vec4 aRig;
attribute vec4 aGait;
attribute vec4 aPose;
attribute vec4 aTint;
attribute vec4 aAct;
attribute vec4 aExtra;
attribute vec4 aFootA;
attribute vec4 aFootB;
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
uniform vec3 uCallow;
varying vec3 vAntMat;   // x roughness override (<0: none), y sheen gain, z 1 = compound eye
varying vec3 vRest;     // rest-frame position (eye facets, cuticle micro-variation)
varying float vAntHi;   // highlight (+ possessed, - hovered)
varying float vCapIn;   // 1: an ant other than the possessed one inside the camera-to-ant capsule (GDD 01 6.5 rule 2)
uniform vec3 uCapA;     // capsule: camera position (world, mm)
uniform vec3 uCapB;     // capsule: the possessed ant's thorax (world, mm)
uniform float uCapR;    // capsule radius, mm (0 = off)

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
  float chew = aAct.w;
  float act = aExtra.w;

  // ---- body: bob twice per cycle (each tripod), small yaw/roll sway, idle breathing sway
  float yaw  = 0.035 * moving * sin(TAU * phase) + idle * 0.05 * sin(t * 0.61);
  float roll = 0.03 * moving * sin(TAU * phase + 1.3) + idle * 0.02 * sin(t * 0.83);
  // a gaster curled under (spray, sting, lay) stands the ant up on its legs so the gaster clears the ground
  float bob  = uGaitP.w * (moving * cos(2.0 * TAU * phase) + idle * 0.6 * sin(t * 1.7)) + max(-aPose.y, 0.0) * 0.42 * uGaitP.x;
  mat3 bodyR = antRotY(yaw) * antRotZ(roll);
  vec3 bodyT = vec3(0.0, bob, 0.0);

  // ---- legs: analytic IK per vertex, feet planted in the instance frame
  if (part > 4.5 && part < 5.5) {
    int leg = int(aRig.y + 0.5);
    int pair = leg - 3 * (leg / 3);
    float s = leg < 3 ? 1.0 : -1.0;
    vec4 LA = uLegA[pair]; vec4 LF = uFoot[pair]; vec4 LL = uLegLen[pair];
    bool tripodB = (s > 0.0) == (pair == 1);           // A = L1 R2 L3, B = R1 L2 R3
    vec4 FP = tripodB ? aFootB : aFootA;
    float lp = fract(phase + (tripodB ? 0.5 : 0.0));
    float duty = uGaitP.z;
    vec3 R0 = vec3(LF.x * s, 0.0, LF.z);
    vec3 F = antRotY(FP.x) * R0 + vec3(FP.y, 0.0, FP.z); // stance: planted; swing: the lift-off point
    float lift = 0.0;
    if (lp >= duty) {
      // swing to the predicted touchdown (front when walking forward, back when walking backward)
      float dir = aFootA.w < 0.0 ? -1.0 : 1.0; float wt = 0.5 * dir;
      float u = (lp - duty) / (1.0 - duty); float e = u * u * (3.0 - 2.0 * u);
      vec3 T = antRotY(aGait.z * duty * wt) * (R0 + vec3(0.0, 0.0, uGaitP.x * aAct.x * duty * wt));
      F = mix(F, T, dir > 0.0 ? e : 1.0 - e);
      lift = sin(3.14159265 * u) * uGaitP.y * moving;
    }
    F.y = lift;
    // falling: legs splay out and up
    F = mix(F, vec3(LF.x * s * 1.15, uGaitP.x * 0.45, LF.z * 1.1), aExtra.x);
    // grooming: one foreleg lifts to the antenna (idle fidget or a forced grooming pose)
    float gside = seed > 0.5 ? 1.0 : -1.0;
    if (pair == 0 && s == gside) {
      float g = max(idle * smoothstep(0.55, 0.9, sin(t * 0.45 + seed * 6.0)), aAct.z);
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
  float gp = aPose.y;
  float gang = (gp > 0.0 ? gp * 0.95 : gp * 2.3) + 0.03 * moving * sin(2.0 * TAU * phase + 0.7) + idle * 0.03 * sin(t * 1.1);

  if (part > 0.5 && part < 4.5 || part > 7.5 && part < 8.5) {
    // ---- head-attached parts (mandibles, antennae, carried items) are posed in the head frame first
    if (part > 1.5 && part < 4.5) {
      if (side < 0.0) { p.x = -p.x; n.x = -n.x; }                // canonical left
      float sph = side > 0.0 ? 0.0 : 1.7;
      if (part < 2.5) {
        float gape = clamp(aPose.w, 0.0, 1.0) * 0.75 + idle * 0.12 * max(0.0, sin(t * 2.3 + sph)) + chew * 0.3 * (0.5 + 0.5 * sin(t * 13.0));
        mat3 R = antRotAxis(uHeadUp, gape);
        p = uMand + R * (p - uMand); n = R * n;
      } else {
        float rate = 0.6 + 0.8 * act;
        float searching = (0.18 + 0.12 * idle + 0.1 * moving) * (0.6 + 0.4 * act);
        float sweep = searching * sin(t * (2.0 + seed) * rate + sph) + 0.1 * clamp(aGait.z, -1.0, 1.0) * side;
        float pitchA = 0.14 * sin(t * (1.3 + 0.5 * seed) * rate + 1.3 * sph) - 0.12 * aPose.x;
        if (part > 3.5) {
          float flick = 0.2 * sin(t * (3.1 + seed) * rate + sph) - 0.15 * aPose.x;
          mat3 Rf = antRotAxis(uElbowAxis, flick);
          p = uElbow + Rf * (p - uElbow); n = Rf * n;
        }
        mat3 Rs = antRotAxis(uHeadUp, sweep) * antRotX(pitchA);
        p = uSocket + Rs * (p - uSocket); n = Rs * n;
      }
      if (side < 0.0) { p.x = -p.x; n.x = -n.x; }
    }
    if (part > 7.5) {
      // carried item: real item size whatever the carrier's scale (aExtra.x = item size factor)
      float sc = length(instanceMatrix[0].xyz);
      p = uGrip + (p - uGrip) * (aExtra.x / sc);
    }
    float hp = -aPose.x * 0.55 + aAct.y + 0.035 * moving * sin(2.0 * TAU * phase) + idle * 0.08 * sin(t * 0.53)
             + chew * 0.06 * sin(t * 13.0 + 1.0);
    float hy = 0.12 * clamp(aGait.z, -1.0, 1.0) + (0.04 + idle * 0.22) * sin(t * 0.37 + 2.0);
    mat3 headR = antRotY(hy) * antRotX(hp);
    p = uNeck + headR * (p - uNeck); n = headR * n;
  } else if (part > 5.5 && part < 6.5 || part > 8.5) {
    if (part < 6.5) {
      // crop swelling: plates spread along the axis, everything widens; membranes stretch a bit more
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

/**
 * Vertex colour: stretched membranes, callow colour, tint; material overrides per part (eyes, mandibles, wings, the
 * hair rim on legs and scapes, GDD 08 §11.6); highlight varying.
 */
export const ANT_COLOR_VERTEX = /* glsl */ `#include <color_vertex>
#ifdef USE_COLOR
  if (aRig.x > 5.5 && aRig.x < 6.5) vColor.rgb = mix(vColor.rgb, uMembrane, aRig.w * smoothstep(0.05, 0.6, aPose.z));
  bool antEye = aRig.x > 0.5 && aRig.x < 1.5 && aRig.w > 0.5;
  if ((aRig.x < 6.5 || aRig.x > 8.5) && !antEye) vColor.rgb = mix(vColor.rgb, uCallow, clamp(aExtra.z, 0.0, 1.0));
  if (aRig.x < 7.5 || aRig.x > 8.5) vColor.rgb *= aTint.rgb;
#endif
  vAntHi = aExtra.y;
  vCapIn = 0.0;
  if (uCapR > 0.0 && aExtra.y <= 0.0) {
    vec3 antO = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
    vec3 ab = uCapB - uCapA;
    float h = clamp(dot(antO - uCapA, ab) / max(dot(ab, ab), 1e-6), 0.0, 1.0);
    if (length(antO - uCapA - ab * h) < uCapR) vCapIn = 1.0;
  }
  vAntMat = vec3(-1.0, 1.0, 0.0);
  if (aRig.x > 2.5 && aRig.x < 5.5) vAntMat.y = ${CUTICLE.hairRimSheen.toFixed(3)};
  if (aRig.x > 0.5 && aRig.x < 1.5 && aRig.w > 0.5) vAntMat = aRig.w > 1.5 ? vec3(0.08, 0.0, 0.0) : vec3(0.22, 0.15, 1.0);
  if (aRig.x > 7.5 && aRig.x < 8.5) vAntMat = vec3(aRig.w, 0.0, 0.0);
  if (aRig.x > 1.5 && aRig.x < 2.5) vAntMat = vec3(0.5, 0.15, 0.0);
  if (aRig.x > 6.5 && aRig.x < 7.5) vAntMat = vec3(-1.0, 0.0, 0.0);`;
