/**
 * GLSL for creature vertex animation, injected into three's own materials with onBeforeCompile (like the ants), so
 * lights, shadows, fog, tone mapping and colour management are untouched.
 *
 * PER-VERTEX: position/normal (rest pose, body frame), color, aRig, aPivot, aFoot (geometry/builder.ts).
 * PER-INSTANCE (112 bytes with instanceMatrix; the ants use 176):
 *   instanceMatrix body frame -> world (surface frame, uniform scale; dead animals are flipped on the CPU)
 *   aAnim  x gait / wave phase (cycles, advanced by distance)  y moving (speed / walk speed, 0..1.5)
 *          z leg amplitude (comfort "softened" = 0.5)  w seed 0..1
 *   aPose  x curl 0..1 (roll / coil)  y fold 0..1 (legs drawn in: subdued, dead)  z crouch 0..1 (strike wind-up)
 *          w flap 0..1 (wings open and beating)
 *   aTint  rgb colour multiplier  a act 0..1 (jaws open; soft body + tentacles retracted)
 *
 * Per-kind uniforms (one material per kind and detail, one shared program):
 *   uLeg   x swing (rad; legs without a foot offset)  y foot lift (mm)  z idle twitch (rad)
 *          w stride (mm per gait cycle at nominal size; the planted feet sweep stride / 2 in stance)
 *   uWave  x lateral amplitude (mm)  y radial (peristaltic) amplitude (fraction)  z hump amplitude (mm)
 *          w wavelength (mm; the sign sets the travel direction)
 *   uBody  x body length (mm)  y body axis height (mm)  z curl mode (0 none, 1 roll into a ball, 2 flat spiral,
 *          3 lateral C)  w curl angle at curl = 1 (rad)
 *   uMisc  x wing beat (Hz)  y jaw opening (rad)  z body lowering at full crouch (fraction)  w squash at full crouch
 *   uRetract xyz point the soft body retracts toward (mm)  w width of the spiral coil step (mm)
 */

export const CREATURE_VERT_PARS = /* glsl */ `
attribute vec4 aRig;
attribute vec4 aPivot;
attribute vec2 aFoot;
attribute vec4 aAnim;
attribute vec4 aPose;
attribute vec4 aTint;
uniform float uTime;
uniform vec4 uLeg;
uniform vec4 uWave;
uniform vec4 uBody;
uniform vec4 uMisc;
uniform vec4 uRetract;

varying vec3 vCrRest;

const float CR_TAU = 6.28318530718;

mat3 crRotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 crRotX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 crRotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }

void crDeform(in vec3 p0, in vec3 n0, out vec3 p, out vec3 n) {
  p = p0; n = n0;
  int part = int(aRig.x + 0.5);
  float phase = aAnim.x, moving = clamp(aAnim.y, 0.0, 1.5), amp = aAnim.z, seed = aAnim.w;
  float curl = aPose.x, fold = aPose.y, crouch = aPose.z, flap = aPose.w, act = aTint.a;
  vec3 piv = aPivot.xyz; float side = aPivot.w;
  float walk = min(moving, 1.0);

  if (part == 1) {
    // LEG, planted foot (gait.ts): the foot's fore-aft target zt = rest + stride / 4 * w, where w falls linearly
    // from 1 to -1 in stance (cyc 0.25..0.75, foot down) while the body advances half a stride, and returns along a
    // cosine in the swing (foot raised). The leg turns about the vertical through its hip toward (X, zt) and
    // stretches to reach it, so the foot keeps its place on the ground. Idle twitch while standing.
    vec3 q = p - piv;
    float cyc = fract(phase + aRig.y), u = fract(cyc - 0.25);
    float w = u < 0.5 ? 1.0 - 4.0 * u : -cos(CR_TAU * (u - 0.5));
    float twitch = uLeg.z * (1.0 - min(moving * 4.0, 1.0)) * sin(uTime * (1.7 + 2.3 * seed) + aRig.y * 17.0 + side);
    vec2 F = vec2(side * aFoot.x, aFoot.y); // X outward, Z forward
    float rho = length(F), ang = 0.0, sc = 1.0;
    if (uLeg.w > 0.0 && rho > 1e-4) {
      float zt = F.y + 0.25 * uLeg.w * smoothstep(0.0, 0.1, moving) * w;
      ang = atan(zt, F.x) - atan(F.y, F.x);
      sc = length(vec2(F.x, zt)) / rho;
    } else {
      ang = uLeg.x * amp * walk * w;
    }
    mat3 R = crRotY(-side * (ang + twitch * amp));
    q = R * q; n = R * n;
    q.xz *= sc;
    float reach = length(q.xz);
    q.y += uLeg.y * amp * walk * max(0.0, cos(CR_TAU * cyc)) * clamp(reach / max(uBody.x * 0.25, 1e-3), 0.0, 1.0);
    float lift = crouch * aRig.w * 1.1;
    if (lift > 0.0) { mat3 X = crRotX(-lift); q = X * q; n = X * n; }
    if (fold > 0.0) { q.xz *= 1.0 - 0.55 * fold; q.y = mix(q.y, abs(q.y) + reach * 0.45, fold); }
    p = piv + q;
  } else if (part == 2 || part == 8) {
    // WING / elytron: opens up and out about the body axis and beats; hind wings unfold only in flight
    vec3 q = p - piv;
    if (part == 8) q *= flap;
    float beat = flap * (0.6 + 0.4 * sin(CR_TAU * uTime * uMisc.x + seed * 40.0));
    mat3 R = crRotY(side * flap * 0.45) * crRotZ(side * beat * 1.0);
    q = R * q; n = R * n;
    p = piv + q;
  } else if (part == 4) {
    // JAW: opens outward about the vertical through its hinge
    vec3 q = p - piv;
    mat3 R = crRotY(side * act * uMisc.y);
    p = piv + R * q; n = R * n;
  } else if (part == 6 || part == 7) {
    // TENTACLE / ANTENNA: slow searching sway about the socket
    vec3 q = p - piv;
    float a = 0.22 * sin(uTime * (1.3 + seed) + side * 1.7), b = 0.14 * sin(uTime * (2.1 + seed * 1.3) + side);
    mat3 R = crRotY(a * side) * crRotX(b);
    p = piv + R * q; n = R * n;
  } else if (part == 0 && aRig.w > 0.0 && crouch > 0.0) {
    // raised abdomen in the wind-up (rove beetle): lift about the lateral axis through the pivot
    mat3 X = crRotX(crouch * aRig.w * 0.9);
    p = piv + X * (p - piv); n = X * n;
  }
  if (part == 5 || part == 6) {
    // SOFT body and tentacles retract into the shell
    p = mix(p, uRetract.xyz + (p - uRetract.xyz) * 0.12, act);
  }

  // body waves along Z (legs ride on their hip's axial coordinate)
  if (uWave.w != 0.0) {
    float m = 0.3 + 0.7 * walk;
    float ph = CR_TAU * (aRig.z / uWave.w - phase);
    float s = sin(ph);
    if (part == 3 || part == 5) {
      vec2 r = vec2(p.x, p.y - uBody.y) * (1.0 + uWave.y * m * s);
      p.x = r.x; p.y = uBody.y + r.y;
    }
    p.x += uWave.x * m * s;
    p.y += uWave.z * m * pow(max(0.0, s), 2.0);
  }

  // curl (roll / coil); blended by curl so it can open and close
  int mode = int(uBody.z + 0.5);
  if (curl > 0.001 && mode > 0) {
    float L = uBody.x, yc = uBody.y;
    vec3 c = p; vec3 cn = n;
    if (mode == 1) {
      // roll into a ball about the lateral axis (head and tail meet below)
      float T = max(uBody.w * curl, 1e-3), R = L / T, th = p.z / R, dy = p.y - yc;
      float lift = (R - yc) * (1.0 - cos(min(T * 0.5, 3.14159265)));
      c = vec3(p.x, yc - R + (R + dy) * cos(th) + lift, (R + dy) * sin(th));
      cn = crRotX(th) * n;
    } else if (mode == 2) {
      // flat spiral, head in the centre (millipede)
      float stp = max(uRetract.w, 0.1), b = stp / CR_TAU, r0 = stp * 0.9;
      float sArc = max(0.0, L * 0.5 - p.z);
      float th = (-r0 + sqrt(r0 * r0 + 2.0 * b * sArc)) / b;
      float r = r0 + b * th - p.x;
      c = vec3(r * cos(th), p.y, r * sin(th));
      cn = crRotY(3.14159265 - th) * n;
      cn = mix(n, cn, step(0.5, curl));
    } else {
      // lateral C (caterpillar, larvae)
      float T = max(uBody.w * curl, 1e-3), R = L / T, th = p.z / R;
      c = vec3(R - (R - p.x) * cos(th), p.y, (R - p.x) * sin(th));
      cn = crRotY(th) * n;
    }
    p = mode == 2 ? mix(p, c, curl) : c;
    n = normalize(cn);
  }

  // wind-up: body lowers (and abstract bodies squash)
  float low = crouch * uMisc.z, sq = crouch * uMisc.w;
  p.y *= (1.0 - low) * (1.0 - sq);
  p.xz *= 1.0 + 0.5 * sq;
}
`;

/** Replaces <beginnormal_vertex> + <begin_vertex> with the deform; tints the vertex colour. */
export const CREATURE_BEGIN_NORMAL = /* glsl */ `
vec3 crP; vec3 crN; crDeform(position, normal, crP, crN);
vec3 objectNormal = crN;
`;
export const CREATURE_BEGIN_VERTEX = /* glsl */ `vec3 transformed = crP;
vCrRest = position;`;
export const CREATURE_COLOR_VERTEX = /* glsl */ `
#include <color_vertex>
vColor.rgb *= aTint.rgb;
`;
export const CREATURE_DEPTH_BEGIN_VERTEX = /* glsl */ `
vec3 crP; vec3 crN; crDeform(position, normal, crP, crN);
vec3 transformed = crP;
`;

/**
 * Fragment side: the surface of a creature is not one flat colour with a glossy highlight (that read as plastic).
 * Like the ants' cuticle (render/ants/shader/fragmentChunk.ts) it gets micro-variation in the rest frame: the albedo
 * varies by a few per cent in soft patches and fine grain, and the roughness is raised and varied with it, so the
 * specular highlight breaks up. The patch size follows the body length (uBody.x) so a millimetre springtail and a
 * 30 mm millipede get the same look at their own scale.
 */
export const CREATURE_FRAG_PARS = /* glsl */ `
varying vec3 vCrRest;
uniform vec4 uBody;
uniform vec4 uSurface; // x albedo variation, y roughness lift, z roughness variation, w grain cells per body length
float crHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float crNoise(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(crHash(i), crHash(i + vec3(1,0,0)), f.x), mix(crHash(i + vec3(0,1,0)), crHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(crHash(i + vec3(0,0,1)), crHash(i + vec3(1,0,1)), f.x), mix(crHash(i + vec3(0,1,1)), crHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float crSurface() {
  vec3 q = vCrRest / max(uBody.x, 1e-3);
  return 0.6 * crNoise(q * 5.0 + 3.1) + 0.4 * crNoise(q * uSurface.w);
}
`;

export const CREATURE_COLOR_FRAGMENT = /* glsl */ `#include <color_fragment>
  diffuseColor.rgb *= 1.0 + uSurface.x * (2.0 * crSurface() - 1.0);`;

export const CREATURE_ROUGHNESS = /* glsl */ `#include <roughnessmap_fragment>
  roughnessFactor = clamp(roughnessFactor + uSurface.y + uSurface.z * (crSurface() - 0.5), 0.0, 1.0);`;
