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
varying vec2 vDcUv; varying vec4 vDcInfo; varying vec3 vDcW; varying float vDcFade; varying vec3 vDcN; varying vec2 vDcGround;
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
  if (iA.w >= keep) { P = vec3(iA.x, -1e5, iA.y); N = vec3(0.0, 1.0, 0.0); vDcFade = 0.0; vDcW = P; vDcN = N; vDcGround = vec2(0.0); return; }
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
  vDcGround = vec2(fixedY ? iB.w : -1e9, lift);
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

/**
 * Fragment stage: the depth of a draped fragment is the depth of the ground-hugging point under it (drawn ground +
 * lift at the fragment's xz), biased toward the camera. Whatever the card tessellation, the depth buffer then sees
 * the decor exactly on the drawn ground: an ant standing there is in front of it, a nearer bump of ground hides it.
 * Beyond uDcFix.x mm the interpolated depth (with the vertex bias) is kept (cheaper; errors are sub-pixel there).
 * Needs DRAPE_GLSL; uniforms uDcFix (distance limit mm, -, -, -), uDcBias, uCamPos.
 */
export const DRAPED_DEPTH_GLSL = /* glsl */ `
uniform vec4 uDcFix; uniform mat4 projectionMatrix; // three declares it in the vertex stage only
float drapedFragDepth() {
  float d = length(vDcW - uCamPos);
  if (d > uDcFix.x) return gl_FragCoord.z;
  // the higher of the drawn ground and the walker's (bilinear) surface: ants stand on the latter
  float gy = vDcGround.x > -1e8 ? vDcGround.x : max(drapeY(vDcW.xz), drH(vDcW.xz));
  vec3 wp = vec3(vDcW.x, gy + vDcGround.y, vDcW.z);
  float delta = max(uDcBias.x * d, uDcBias.y * d * d);
  wp += (uCamPos - wp) * (delta / max(d, 1e-4));
  vec4 c = projectionMatrix * (viewMatrix * vec4(wp, 1.0));
  return clamp((c.z / c.w) * 0.5 + 0.5, 0.0, 1.0);
}
`;

/**
 * The point whose depth a draped fragment at world (x, z) writes (twin of drapedFragDepth, without the bias): the
 * higher of the drawn ground and the walker's bilinear surface, plus the lift.
 */
export function drapedDepthPoint(src: Pick<TerrainSource, 'cell' | 'nx' | 'nz' | 'heights'>, layout: ClipmapLayout, x: number, z: number, fixedY: number, lift: number): number {
  return (fixedY > NO_FIXED_Y * 0.5 ? fixedY : Math.max(drapeHeight(src, layout, x, z), sampleHeight(src, x, z))) + lift;
}
