// Near-camera occlusion fade for the surface world (GDD 01 6.5 rule 3): terrain, primitives, mounds, grass and
// draped decor that rise between the possession camera and the possessed ant are thinned with the same ordered 4x4
// dither the ants and nest walls use (src/render/nest/materials/glsl.ts). The shape comes from the camera's
// FadeOutput: a cone from capsuleA (camera) to capsuleB (short of the ant), radius capsuleRadius at B narrowing to
// coneStart x that at A. Shadows are not dithered (depth materials never include this), and nothing below the
// ant's floor level is: the ground she stands on stays solid.
import type { FadeOutput } from '@/render/camera';
import type { WorldUniforms } from './uniforms';

/** Fraction of fragments kept at full occlusion strength (the nest slot's OCCLUSION_KEEP: one look). */
export const WORLD_OCCLUSION_KEEP = 0.25;
/**
 * Fragments lower than the cone end minus this many cone radii are never dithered (the floor under the ant, the
 * paving slab she walks on).
 */
export const WORLD_OCCLUSION_FLOOR_K = 0.35;
/** Strength of the contact darkening under the subject ant, and its radius in body lengths of the worker (BU). */
export const CONTACT_DARKEN = 0.45;
export const CONTACT_RADIUS_BU = 0.55;
/** The terrain stops dithering this far along the cone (0 camera .. 1 end): only ridges between camera and ant. */
export const WORLD_OCCLUSION_TERRAIN_TMAX = 0.85;

/** GLSL: uniforms + `wrOccDither(worldPos, tMax)` (discards). Fragment only. */
export const GLSL_OCCLUSION = /* glsl */ `
#define WR_OCC_RIM 0.45
#define WR_OCC_END 0.8
uniform vec3 uWrOccA; uniform vec3 uWrOccB; uniform vec4 uWrOcc;
void wrOccDither(vec3 w, float tMax) {
  if (uWrOcc.x <= 0.0) return;
  vec3 ab = uWrOccB - uWrOccA;
  float t = dot(w - uWrOccA, ab) / max(dot(ab, ab), 1e-6);
  if (t <= 0.0 || t >= tMax) return;
  if (w.y < uWrOccB.y - uWrOcc.w * uWrOcc.x) return;
  float coneR = uWrOcc.x * mix(uWrOcc.z, 1.0, t);
  float off = length(w - (uWrOccA + ab * t));
  if (off >= coneR) return;
  // soft rim (look-pass 2): the kept share eases from 1 at the cone's edge to uWrOcc.y over its outer half, and back
  // to 1 over the last stretch before tMax, so a stem or a blade crossing the cone fades out instead of ending in a
  // ragged cut line against the ground
  float keep = mix(uWrOcc.y, 1.0, smoothstep(coneR * WR_OCC_RIM, coneR, off));
  keep = mix(keep, 1.0, smoothstep(tMax * WR_OCC_END, tMax, t));
  vec2 c = mod(floor(gl_FragCoord.xy), 4.0);
  float bayer = mod(c.x * 4.0 + c.y * 9.0 + c.x * c.y * 3.0, 16.0) / 16.0; // ordered 4x4 pattern (as the nest)
  if (bayer >= keep) discard;
}
`;

/** The shared uniforms a material binds for wrOccDither. */
export function occlusionUniforms(u: WorldUniforms): Record<string, unknown> {
  return { uWrOccA: u.uOccA, uWrOccB: u.uOccB, uWrOcc: u.uOcc, uWrContact: u.uContact };
}

/** Writes a FadeOutput (or none) into the shared uniforms. */
export function applyOcclusion(u: WorldUniforms, f: FadeOutput | null | undefined): void {
  if (!f || !(f.occlusion > 0) || !(f.capsuleRadius > 0)) { u.uOcc.value.set(0, 1, 1, WORLD_OCCLUSION_FLOOR_K); return; }
  u.uOccA.value.set(f.capsuleA.x, f.capsuleA.y, f.capsuleA.z);
  u.uOccB.value.set(f.capsuleB.x, f.capsuleB.y, f.capsuleB.z);
  const keep = 1 - Math.min(1, f.occlusion) * (1 - WORLD_OCCLUSION_KEEP);
  u.uOcc.value.set(f.capsuleRadius, keep, f.coneStart ?? 1, WORLD_OCCLUSION_FLOOR_K);
}

/**
 * Contact darkening under the subject ant (the possessed / followed ant): her legs and body are thinner than a
 * shadow-map texel, so a soft occlusion blob under her body grounds her (spike-look 2.4 used a decal; here it is a
 * term in the ground materials). uWrContact = (x, y, z of the ground point, radius mm; 0 = off).
 */
export const GLSL_CONTACT = /* glsl */ `
uniform vec4 uWrContact;
float wrContactAO(vec3 w) {
  if (uWrContact.w <= 0.0) return 1.0;
  vec3 d = w - uWrContact.xyz;
  float k = dot(d.xz, d.xz) / (uWrContact.w * uWrContact.w) + d.y * d.y / (0.16 * uWrContact.w * uWrContact.w);
  return 1.0 - CONTACT_DARK * exp(-2.2 * k);
}
`.replace('CONTACT_DARK', CONTACT_DARKEN.toFixed(3));
