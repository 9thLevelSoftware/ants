// One grass blade, as the vertex shader builds it (spike-look 2.8), plus parting and fading around the line of
// sight (GDD 04 §9). BLADE_GLSL and bladeVertex (CPU) are twins: keep them in sync. The CPU twin exists for tests
// ("no blade through the camera", "the subject stays visible") and for dew droplets.
import { GRASS, PARTING, WIND } from '../decor/tuning';

export interface BladeView {
  cam: { x: number; y: number; z: number };
  subject: { x: number; y: number; z: number };
  /** Parting on (a subject is followed). */
  part: boolean;
  bu: number;
  time: number;
  windDir: { x: number; z: number };
  /** Radians of extra tip bend. */
  wind: number;
  /** Density factor of the quality preset (0..~1.25). */
  density: number;
}

/** LOD: fraction of blades kept at distance d (mm) from the camera, before the quality factor. */
export function grassLodKeep(d: number): number {
  const d0 = GRASS.lodFullMm;
  return d <= d0 ? 1 : Math.pow(d0 / d, GRASS.lodPow);
}

const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Distance from p to segment a-b (3D). */
function segDist(px: number, py: number, pz: number, a: BladeView['cam'], bx: number, by: number, bz: number): number {
  const abx = bx - a.x, aby = by - a.y, abz = bz - a.z, l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((px - a.x) * abx + (py - a.y) * aby + (pz - a.z) * abz) / l2)) : 0;
  return Math.hypot(px - a.x - abx * t, py - a.y - aby * t, pz - a.z - abz * t);
}

/** End of the parting segment: the subject pushed a little further along the view direction. */
export function partEnd(v: BladeView): { x: number; y: number; z: number } {
  const dx = v.subject.x - v.cam.x, dy = v.subject.y - v.cam.y, dz = v.subject.z - v.cam.z, l = Math.hypot(dx, dy, dz) || 1;
  const k = (PARTING.beyondBU * v.bu) / l;
  return { x: v.subject.x + dx * k, y: v.subject.y + dy * k, z: v.subject.z + dz * k };
}

/**
 * World position and LOD visibility (0 hidden .. 1 visible) of the blade vertex at (s across -1..1, h along 0..1).
 * `b` is one BLADE_STRIDE record at offset `o`.
 */
export function bladeVertex(b: Float32Array, o: number, s: number, h: number, v: BladeView): { x: number; y: number; z: number; fade: number } {
  const rx = b[o], ry = b[o + 1], rz = b[o + 2], rank = b[o + 3];
  const H = b[o + 4], yaw = b[o + 6], rnd = b[o + 7], a = b[o + 8], k = b[o + 9];
  let W = b[o + 5];
  const dCam = Math.hypot(rx - v.cam.x, rz - v.cam.z);
  const keep = v.density * grassLodKeep(dCam);
  if (rank >= keep) return { x: rx, y: ry, z: rz, fade: 0 };
  W *= Math.min(GRASS.lodMaxWiden, Math.pow(Math.max(keep, 1e-3), -GRASS.lodWidenPow));
  const fx = Math.sin(yaw), fz = Math.cos(yaw), sx = Math.cos(yaw), sz = -Math.sin(yaw);
  let xl: number, yl: number;
  if (Math.abs(k) < 1e-3) { xl = Math.sin(a) * h; yl = Math.cos(a) * h; } else { xl = (Math.cos(a) - Math.cos(a + k * h)) / k; yl = (Math.sin(a + k * h) - Math.sin(a)) / k; }
  const th = a + k * h;
  const nx = fx * Math.cos(th), ny = -Math.sin(th), nz = fz * Math.cos(th);
  const w = 0.5 * W * Math.pow(Math.min(1, Math.max(0, (1 - h) / 0.3)), 0.75) * (0.8 + 0.2 * smooth(0, 0.08, h));
  let px = fx * xl * H + sx * s * w + nx * (1 - Math.abs(s)) * w * 0.35;
  let py = yl * H + ny * (1 - Math.abs(s)) * w * 0.35;
  let pz = fz * xl * H + sz * s * w + nz * (1 - Math.abs(s)) * w * 0.35;
  // wind
  const ph = (rx * v.windDir.x + rz * v.windDir.z) * WIND.waveK - v.time * WIND.waveSpeed;
  const gust = 0.55 + 0.45 * Math.sin(ph) * Math.sin(ph * 0.43 + 1.7);
  const flut = Math.sin(v.time * (5 + rnd * 4) + rnd * 40) * 0.18;
  const ws = v.wind * (gust + flut) * (0.6 + 0.8 * rnd) * Math.min(2, 60 / H);
  let pushX = v.windDir.x * ws, pushZ = v.windDir.z * ws;
  // parting: roots near the camera -> subject segment (XZ) bend away from it
  if (v.part) {
    const e = partEnd(v);
    const abx = e.x - v.cam.x, abz = e.z - v.cam.z, l2 = abx * abx + abz * abz;
    const t = l2 > 1e-9 ? Math.min(1, Math.max(0, ((rx - v.cam.x) * abx + (rz - v.cam.z) * abz) / l2)) : 0;
    const ax = rx - (v.cam.x + abx * t), az = rz - (v.cam.z + abz * t), d = Math.hypot(ax, az);
    const R = PARTING.bendBU * v.bu + PARTING.bendHeightK * H;
    const part = 1 - smooth(R * 0.35, R, d);
    if (d > 1e-3) { pushX += (ax / d) * part * PARTING.bendMaxRad; pushZ += (az / d) * part * PARTING.bendMaxRad; }
  }
  const ang = Math.hypot(pushX, pushZ);
  if (ang > 1e-4) {
    // rotation about axis = up x push (normalised), angle grows along the blade
    const ax = pushZ / ang, az = -pushX / ang, ka = ang * h, c = Math.cos(ka), sn = Math.sin(ka), dot = ax * px + az * pz;
    const cx = -az * py, cy = az * px - ax * pz, cz = ax * py; // axis x p, axis = (ax, 0, az)
    const qx = px * c + cx * sn + ax * dot * (1 - c), qy = py * c + cy * sn, qz = pz * c + cz * sn + az * dot * (1 - c);
    px = qx; py = qy; pz = qz;
  }
  return { x: rx + px, y: ry + py, z: rz + pz, fade: keep >= 1 ? 1 : smooth(keep, keep * 0.85, rank) };
}

/**
 * Per-fragment visibility near the eye and around the line of sight (twin of grFragFade in BLADE_FRAG_GLSL):
 * evaluated per pixel because a long blade triangle can cross the line of sight between vertices that are far away.
 */
export function bladeFragFade(x: number, y: number, z: number, v: BladeView): number {
  let fade = smooth(PARTING.eyeNearBU * v.bu, PARTING.eyeFarBU * v.bu, Math.hypot(x - v.cam.x, y - v.cam.y, z - v.cam.z));
  if (v.part) {
    const e = partEnd(v);
    fade = Math.min(fade, smooth(PARTING.rayFadeBU * v.bu * 0.85, PARTING.rayFadeBU * v.bu, segDist(x, y, z, v.cam, e.x, e.y, e.z)));
  }
  return fade;
}

/** GLSL twin of bladeVertex (vertex shader head). Defines bladeShape(out P, out N); writes vBH, vBS, vBFade, vBInfo. */
export const BLADE_GLSL = /* glsl */ `
attribute vec4 iRoot; attribute vec4 iShape; attribute vec4 iBend;
uniform float uTime; uniform vec2 uWindDir; uniform float uGrWind; uniform vec3 uCamPos; uniform vec3 uSubject;
uniform float uGrPart; uniform vec4 uGrLod; uniform vec4 uGrPartP;
varying float vBH; varying float vBS; varying float vBFade; varying vec3 vBInfo; varying vec3 vBW;
vec3 grRot(vec3 v, vec3 k, float a) { float c = cos(a), s = sin(a); return v * c + cross(k, v) * s + k * dot(k, v) * (1.0 - c); }
// uGrLod: x full-density distance mm, y falloff power, z quality density, w max widening
// uGrPartP: x bend radius mm (+ heightK in y), z ray fade radius mm, w beyond-subject mm
void bladeShapeAt(float s, float h, out vec3 P, out vec3 N) {
  float H = iShape.x, W = iShape.y, yaw = iShape.z, rnd = iShape.w;
  float dCam = length(iRoot.xz - uCamPos.xz);
  float keep = uGrLod.z * (dCam <= uGrLod.x ? 1.0 : pow(uGrLod.x / dCam, uGrLod.y));
  vBH = h; vBS = s; vBInfo = vec3(iBend.z, iBend.w, rnd); vBW = iRoot.xyz;
  if (iRoot.w >= keep) { P = iRoot.xyz; N = vec3(0.0, 1.0, 0.0); vBFade = 0.0; return; }
  W *= min(uGrLod.w, pow(max(keep, 1e-3), -${GRASS.lodWidenPow.toFixed(3)}));
  vec3 fwd = vec3(sin(yaw), 0.0, cos(yaw)), side = vec3(cos(yaw), 0.0, -sin(yaw)), up = vec3(0.0, 1.0, 0.0);
  float a = iBend.x, b = iBend.y, xl, yl;
  if (abs(b) < 1e-3) { xl = sin(a) * h; yl = cos(a) * h; }
  else { xl = (cos(a) - cos(a + b * h)) / b; yl = (sin(a + b * h) - sin(a)) / b; }
  float th = a + b * h;
  vec3 nrm = fwd * cos(th) - up * sin(th);
  float w = 0.5 * W * pow(clamp((1.0 - h) / 0.3, 0.0, 1.0), 0.75) * (0.8 + 0.2 * smoothstep(0.0, 0.08, h));
  vec3 p = (fwd * xl + up * yl) * H + side * s * w + nrm * (1.0 - abs(s)) * w * 0.35;
  vec3 n = normalize(nrm + side * s * 0.45);
  float ph = dot(iRoot.xz, uWindDir) * ${WIND.waveK.toFixed(5)} - uTime * ${WIND.waveSpeed.toFixed(3)};
  float gust = 0.55 + 0.45 * sin(ph) * sin(ph * 0.43 + 1.7);
  float flut = sin(uTime * (5.0 + rnd * 4.0) + rnd * 40.0) * 0.18;
  vec2 push = uWindDir * uGrWind * (gust + flut) * (0.6 + 0.8 * rnd) * min(2.0, 60.0 / H);
  vec3 E = uSubject + normalize(uSubject - uCamPos + vec3(1e-5)) * uGrPartP.w;
  if (uGrPart > 0.5) {
    vec2 A = uCamPos.xz, ab = E.xz - A;
    float t = clamp(dot(iRoot.xz - A, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
    vec2 away = iRoot.xz - (A + ab * t); float d = length(away);
    float R = uGrPartP.x + uGrPartP.y * H;
    float part = 1.0 - smoothstep(R * 0.35, R, d);
    if (d > 1e-3) push += (away / d) * part * ${PARTING.bendMaxRad.toFixed(3)};
  }
  float ang = length(push);
  if (ang > 1e-4) {
    vec3 axis = vec3(push.y, 0.0, -push.x) / ang;
    p = grRot(p, axis, ang * h); n = grRot(n, axis, ang * h);
  }
  P = iRoot.xyz + p; N = n; vBW = P;
  // fade out the last instances before the LOD cut (only while thinning; GLSL smoothstep needs edge0 < edge1)
  vBFade = keep >= 1.0 ? 1.0 : 1.0 - smoothstep(keep * 0.85, keep, iRoot.w);
}
void bladeShape(out vec3 P, out vec3 N) { bladeShapeAt(position.x, position.y, P, N); }
`;

/** Fade below which a blade (random `rnd`) is cut away (PARTING.cutRange, before the per-pixel noise). */
export function bladeCutThreshold(rnd: number): number {
  return PARTING.cutRange[0] + (PARTING.cutRange[1] - PARTING.cutRange[0]) * rnd;
}

/**
 * Twin of bladeFragFade for any world point (blade fragments, and the dew droplets sitting on a blade, so a droplet
 * disappears with its blade), and the blade's cut threshold. Needs uCamPos, uSubject, uGrPart, uGrPartP, uGrEye.
 */
export const BLADE_SIGHT_GLSL = /* glsl */ `
float grSightFade(vec3 w) {
  float fade = smoothstep(uGrEye.x, uGrEye.y, length(w - uCamPos));
  if (uGrPart > 0.5) {
    vec3 E = uSubject + normalize(uSubject - uCamPos + vec3(1e-5)) * uGrPartP.w;
    vec3 ab = E - uCamPos; float t = clamp(dot(w - uCamPos, ab) / max(dot(ab, ab), 1e-9), 0.0, 1.0);
    fade = min(fade, smoothstep(uGrPartP.z * 0.85, uGrPartP.z, length(w - uCamPos - ab * t)));
  }
  return fade;
}
// twin of bladeCutThreshold
float grCutThreshold(float rnd) { return ${PARTING.cutRange[0].toFixed(3)} + ${(PARTING.cutRange[1] - PARTING.cutRange[0]).toFixed(3)} * rnd; }
`;

/** Fragment twin of bladeFragFade (uses the varying world position vBW). */
export const BLADE_FRAG_GLSL = /* glsl */ `
uniform vec3 uCamPos; uniform vec3 uSubject; uniform float uGrPart; uniform vec4 uGrPartP; uniform vec2 uGrEye;
varying vec3 vBW;
${BLADE_SIGHT_GLSL}
float grFragFade() { return grSightFade(vBW); }
`;
