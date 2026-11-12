// One draped item (leaf, petal, needle, wrapper, moss patch, grain), as the vertex shader lays it on the ground.
// DRAPED_VERT_GLSL and drapedVertex (CPU) are twins: keep them in sync. The hug rule (GDD 04 §9 / task boundary:
// "ants appear on top of it, never inside it"): every vertex lies between the drawn ground and
// (DRAPE.liftBU + DRAPE.curlBU) BU above it, well below the walker's foot offset (0.15 BU).
import { drapeHeight } from './drape';
import { sampleHeight } from '../terrain/terrainData';
import { DRAPED_KIND, NO_FIXED_Y } from './instances';
import { DRAPE } from './tuning';
import type { ClipmapLayout } from '../terrain/clipmap';
import type { TerrainSource } from '../lighting/simAdapter';

/**
 * Leaf atlas crops (fractions of one of the 4 x 4 cells): fresh = maple-type atlas (stem left, cells 2:1), dry =
 * oak-type atlas (stem right, square cells). `fill` = share of the card length the blade covers, `aspect` = card
 * length / width of the crop.
 */
export const LEAF_ATLAS = {
  fresh: { u0: 0.3, u1: 0.97, v0: 0.06, v1: 0.94, fill: 0.67, aspect: 1.52 },
  dry: { u0: 0.03, u1: 0.97, v0: 0.22, v1: 0.78, fill: 0.83, aspect: 1.68 },
} as const;

const isLeaf = (kind: number) => kind === DRAPED_KIND.leaf || kind === DRAPED_KIND.smallLeaf;

/** Card size (length, width) in mm: leaves use the atlas cell aspect (fresh maple 2:1, dry oak 1:1). */
export function cardSize(kind: number, len: number, wid: number, fresh: boolean): [number, number] {
  if (!isLeaf(kind)) return [len, wid];
  const a = fresh ? LEAF_ATLAS.fresh : LEAF_ATLAS.dry, L = len / a.fill;
  return [L, L / a.aspect];
}

/** Lift above the ground at card coordinates (u, v) in -1..1, mm. */
export function drapeLift(curl: number, u: number, v: number, bu: number): number {
  const r2 = Math.min(1, u * u + v * v);
  return (DRAPE.liftBU + curl * DRAPE.curlBU * r2) * bu;
}

/** World position of the draped vertex (u, v) of record `o` (no screen-space bias), mm. */
export function drapedVertex(rec: Float32Array, o: number, u: number, v: number, freshShare: number, bu: number,
  src: Pick<TerrainSource, 'cell' | 'nx' | 'nz' | 'heights'>, layout: ClipmapLayout): { x: number; y: number; z: number; ground: number } {
  const x0 = rec[o], z0 = rec[o + 1], yaw = rec[o + 2], kind = rec[o + 8], fresh = rec[o + 10] < freshShare;
  const [L, W] = cardSize(kind, rec[o + 4], rec[o + 5], fresh);
  const c = Math.cos(yaw), s = Math.sin(yaw), lx = u * L * 0.5, lz = v * W * 0.5;
  const x = x0 + c * lx - s * lz, z = z0 + s * lx + c * lz;
  const fy = rec[o + 7];
  const ground = fy > NO_FIXED_Y * 0.5 ? fy : drapeHeight(src, layout, x, z);
  return { x, y: ground + drapeLift(rec[o + 6], u, v, bu), z, ground };
}

/**
 * Vertex shader head. Needs DRAPE_GLSL. Uniforms: uDcKeep (keep per kind group: leaves, petals, other, quality),
 * uDcLod (full-density distance mm, power, -, -), uDcFresh (fresh-leaf share), uDcBu, uDcBias (lin k, depth k),
 * uCamPos. Varyings for the fragment stage: vDcUv (card -1..1), vDcInfo (kind, rndA, rndB, fresh), vDcW (world).
 */
export const DRAPED_VERT_GLSL = /* glsl */ `
attribute vec4 iA; attribute vec4 iB; attribute vec4 iC;
uniform vec4 uDcKeep; uniform vec4 uDcLod; uniform float uDcFresh; uniform float uDcBu; uniform vec2 uDcBias; uniform vec3 uCamPos;
varying vec2 vDcUv; varying vec4 vDcInfo; varying vec3 vDcW; varying float vDcFade; varying vec3 vDcN; varying vec4 vDcC; varying vec4 vDcS;
float dcKeep(float kind) {
  float k = kind < ${DRAPED_KIND.needle - 0.5} ? uDcKeep.x : (kind < ${DRAPED_KIND.petal + 0.5} && kind > ${DRAPED_KIND.petal - 0.5} ? uDcKeep.y : uDcKeep.z);
  return k * uDcKeep.w;
}
void drapedShape(out vec3 P, out vec3 N) {
  float kind = iC.x;
  float d = length(iA.xy - uCamPos.xz);
  float keep = dcKeep(kind) * (d <= uDcLod.x ? 1.0 : pow(uDcLod.x / d, uDcLod.y));
  bool fresh = iC.z < uDcFresh;
  vDcInfo = vec4(kind, iC.y, iC.z, fresh ? 1.0 : 0.0);
  vDcUv = position.xy;
  if (iA.w >= keep) { P = vec3(iA.x, -1e5, iA.y); N = vec3(0.0, 1.0, 0.0); vDcFade = 0.0; vDcW = P; vDcN = N; vDcC = vec4(0.0); vDcS = vec4(1.0); return; }
  vDcFade = keep >= 1.0 ? 1.0 : 1.0 - smoothstep(keep * 0.85, keep, iA.w);
  vec2 card = iB.xy;
  if (kind < ${DRAPED_KIND.needle - 0.5}) {
    float L = iB.x / (fresh ? ${LEAF_ATLAS.fresh.fill.toFixed(3)} : ${LEAF_ATLAS.dry.fill.toFixed(3)});
    card = vec2(L, L / (fresh ? ${LEAF_ATLAS.fresh.aspect.toFixed(3)} : ${LEAF_ATLAS.dry.aspect.toFixed(3)}));
  }
  float c = cos(iA.z), s = sin(iA.z);
  vec2 l = position.xy * card * 0.5;
  vec2 xz = iA.xy + vec2(c * l.x - s * l.y, s * l.x + c * l.y);
  bool fixedY = iB.w > ${(NO_FIXED_Y * 0.5).toExponential(1)};
  float g = fixedY ? iB.w : drapeY(xz);
  float r2 = min(1.0, dot(position.xy, position.xy));
  float lift = (${DRAPE.liftBU.toFixed(4)} + iB.z * ${DRAPE.curlBU.toFixed(4)} * r2) * uDcBu;
  P = vec3(xz.x, g + lift, xz.y);
  vDcC = vec4(iA.xy, iA.z, iB.w); vDcS = vec4(card, iB.z, 0.0);
  vec3 ng = fixedY ? vec3(0.0, 1.0, 0.0) : drN(xz);
  // curled rim: the surface tilts up toward the rim (shading only; the lift itself stays tiny)
  vec2 rim = vec2(c * position.x - s * position.y, s * position.x + c * position.y) * iB.z * 0.9;
  N = normalize(ng - vec3(rim.x, 0.0, rim.y) * r2);
  vDcW = P; vDcN = N;
}
// (vertex stage) Moves the clip-space vertex toward the camera by max(lin x d, depth-step x d^2) x (1 + order / 4): wins against
// the coincident terrain and separates stacked leaves without moving anything on screen.
vec4 drapedBias(vec4 clip, vec3 viewPos, float order) {
  float d = length(viewPos);
  float delta = max(uDcBias.x * d, uDcBias.y * d * d) * (1.0 + order * 0.25);
  vec4 c2 = projectionMatrix * vec4(viewPos * (1.0 - delta / max(d, 1e-4)), 1.0);
  return vec4(clip.xy, c2.z / c2.w * clip.w, clip.w);
}
`;

/** Fixed-point steps of the per-pixel resolve and the largest step along the ray, mm. */
export const RESOLVE_STEPS = 4;
export const RESOLVE_MAX_STEP_MM = 8;

/**
 * Fragment stage: decal-style resolve. The pixel's view ray is followed from the card point to the hugging surface
 * (ground + lift, where "ground" is the higher of the drawn terrain and the walker's bilinear surface), the item is
 * shaded at that point (card coordinates recomputed there) and that point's depth is written. Whatever the card
 * tessellation, colour and depth then lie exactly on the surface ants stand on: an ant on a leaf is in front of it, a
 * nearer bump of ground hides it. Beyond uDcFix.x mm the interpolated card (with the vertex bias) is used as is.
 * Needs DRAPE_GLSL; uniforms uDcFix, uDcBias, uDcBu, uCamPos; varyings vDcC (centre x, z, yaw, fixed y),
 * vDcS (card length, width, curl), vDcW, vDcUv.
 */
export const DRAPED_RESOLVE_GLSL = /* glsl */ `
uniform vec4 uDcFix; uniform mat4 projectionMatrix; // three declares it in the vertex stage only
float dcSurf(vec2 xz) { return vDcC.w > ${(NO_FIXED_Y * 0.5).toExponential(1)} ? vDcC.w : max(drapeY(xz), drH(xz)); }
vec2 dcUvOf(vec2 xz) {
  vec2 d = xz - vDcC.xy; float c = cos(vDcC.z), s = sin(vDcC.z);
  return vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / (vDcS.xy * 0.5);
}
float dcLift(vec2 uv) { return (${DRAPE.liftBU.toFixed(4)} + vDcS.z * ${DRAPE.curlBU.toFixed(4)} * min(1.0, dot(uv, uv))) * uDcBu; }
// false when the resolved point lies outside the item's card
bool dcResolve(out vec2 uv, out vec3 wp) {
  wp = vDcW; uv = vDcUv;
  if (length(vDcW - uCamPos) > uDcFix.x) return true;
  vec3 r = normalize(vDcW - uCamPos);
  float ry = abs(r.y) < 0.03 ? (r.y < 0.0 ? -0.03 : 0.03) : r.y;
  for (int i = 0; i < ${RESOLVE_STEPS}; i++) {
    float dy = wp.y - (dcSurf(wp.xz) + dcLift(dcUvOf(wp.xz)));
    wp += r * clamp(-dy / ry, -${RESOLVE_MAX_STEP_MM.toFixed(1)}, ${RESOLVE_MAX_STEP_MM.toFixed(1)});
  }
  uv = dcUvOf(wp.xz);
  return max(abs(uv.x), abs(uv.y)) <= 1.0;
}
float dcDepth(vec3 wp) {
  float d = length(wp - uCamPos);
  float delta = max(uDcBias.x * d, uDcBias.y * d * d);
  vec3 q = wp + (uCamPos - wp) * (delta / max(d, 1e-4));
  vec4 c = projectionMatrix * (viewMatrix * vec4(q, 1.0));
  return clamp((c.z / c.w) * 0.5 + 0.5, 0.0, 1.0);
}
`;

type HSrc = Pick<TerrainSource, 'cell' | 'nx' | 'nz' | 'heights'>;

/** The surface draped items hug (twin of dcSurf): the higher of the drawn terrain and the walker surface. */
export function hugSurface(src: HSrc, layout: ClipmapLayout, x: number, z: number, fixedY: number): number {
  return fixedY > NO_FIXED_Y * 0.5 ? fixedY : Math.max(drapeHeight(src, layout, x, z), sampleHeight(src, x, z));
}

/**
 * CPU twin of dcResolve for record `o`: follows the ray from `cam` through the card point `p` onto the hugging
 * surface. Returns the resolved point, its card coordinates and whether it lies on the item.
 */
export function drapedResolve(rec: Float32Array, o: number, cam: { x: number; y: number; z: number }, p: { x: number; y: number; z: number },
  freshShare: number, bu: number, src: HSrc, layout: ClipmapLayout): { x: number; y: number; z: number; u: number; v: number; inside: boolean } {
  const kind = rec[o + 8], [L, W] = cardSize(kind, rec[o + 4], rec[o + 5], rec[o + 10] < freshShare);
  const cx = rec[o], cz = rec[o + 1], c = Math.cos(rec[o + 2]), s = Math.sin(rec[o + 2]), fy = rec[o + 7], curl = rec[o + 6];
  const uvOf = (x: number, z: number) => { const dx = x - cx, dz = z - cz; return [(c * dx + s * dz) / (L * 0.5), (-s * dx + c * dz) / (W * 0.5)]; };
  let rx = p.x - cam.x, ryv = p.y - cam.y, rz = p.z - cam.z;
  const l = Math.hypot(rx, ryv, rz); rx /= l; ryv /= l; rz /= l;
  const ry = Math.abs(ryv) < 0.03 ? (ryv < 0 ? -0.03 : 0.03) : ryv;
  let x = p.x, y = p.y, z = p.z;
  for (let i = 0; i < RESOLVE_STEPS; i++) {
    const [u, v] = uvOf(x, z);
    const dy = y - (hugSurface(src, layout, x, z, fy) + drapeLift(curl, u, v, bu));
    const t = Math.min(RESOLVE_MAX_STEP_MM, Math.max(-RESOLVE_MAX_STEP_MM, -dy / ry));
    x += rx * t; y += ryv * t; z += rz * t;
  }
  const [u, v] = uvOf(x, z);
  return { x, y, z, u, v, inside: Math.max(Math.abs(u), Math.abs(v)) <= 1 };
}
