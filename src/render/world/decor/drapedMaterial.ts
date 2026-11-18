// Material of all draped decor: one MeshStandardMaterial (three's lighting, shadows, fog, IBL) patched so that
//  - the vertex shader lays each instance on the drawn ground (drapedShape + DRAPE_GLSL) with a depth bias,
//  - the fragment shader draws the item by kind: scanned leaf atlases (fresh maple-type / dry oak-type by the
//    season's fresh share), procedural needles, petals, plain wrappers and receipts (no text, no logos: GDD 08 11.8),
//    moss over the moss scan, bark chips and grains; wetness, the forest dapple and back-lit transmission;
//  - the depth written is the ground-hugging point under the fragment (drapedFragDepth), so ants are always on top.
import { DoubleSide, MeshStandardMaterial, Uniform, type Texture } from 'three';
import { GLSL_DAPPLE } from '../materials/dapple';
import { GLSL_NOISE, GLSL_WET } from '../materials/glsl';
import { addPatch } from '../materials/surfacePatch';
import { HOLE_MASK_GLSL } from '../terrain/holeMask';
import { DRAPE_GLSL } from './drape';
import { DRAPED_RESOLVE_GLSL, DRAPED_VERT_GLSL, LEAF_ATLAS } from './drapedShape';
import { foliageLightsChunk } from './foliageLight';
import { GLSL_OCCLUSION, occlusionUniforms, WORLD_OCCLUSION_TERRAIN_TMAX } from '../materials/occlusion';
import { DRAPED_KIND as K } from './instances';
import { DECOR_LEAF } from './tuning';
import type { DecorShared } from './shared';

export interface DrapedTextures {
  freshAlbedo: Texture;
  freshAlpha: Texture;
  dryAlbedo: Texture;
  dryAlpha: Texture;
  moss: Texture;
}

const f = (n: number) => n.toFixed(4);
const crop = (a: { u0: number; v0: number; u1: number; v1: number }) => `vec4(${f(a.u0)}, ${f(a.v0)}, ${f(a.u1)}, ${f(a.v1)})`;

const FRAG_DECL = /* glsl */ `
${GLSL_NOISE}
${GLSL_WET}
${HOLE_MASK_GLSL}
${GLSL_DAPPLE}
uniform sampler2D tDcFresh; uniform sampler2D tDcFreshA; uniform sampler2D tDcDry; uniform sampler2D tDcDryA; uniform sampler2D tDcMoss;
uniform vec4 uDcDry; uniform vec3 uDcFreshTint; uniform float uWet; uniform float uTransl;
varying vec3 vWrW; varying vec3 vDcT;
vec2 dcCell(float rnd, vec4 cr, vec2 uv) {
  float c = floor(rnd * 15.999); vec2 cell = vec2(mod(c, 4.0), floor(c / 4.0));
  return (cell + mix(cr.xy, cr.zw, uv * 0.5 + 0.5)) * 0.25;
}
// alpha of a leaf at card coordinates uv (fresh: maple-type atlas, dry: oak-type atlas)
float dcLeafAlpha(float ra, bool fresh, vec2 uv) {
  vec2 t = fresh ? dcCell(ra, ${crop(LEAF_ATLAS.fresh)}, uv) : dcCell(ra, ${crop(LEAF_ATLAS.dry)}, vec2(-uv.x, uv.y));
  return fresh ? texture2D(tDcFreshA, t).r : texture2D(tDcDryA, t).r;
}
// contact shadow: 0..1 density of the dark fringe a leaf leaves on the ground beside its margin (leaves only), drawn stippled
float dcShade;
vec3 dcSat(vec3 c, float s) { float l = dot(c, vec3(0.2126, 0.7152, 0.0722)); return max(mix(vec3(l), c, s), 0.0); }
// colour (rgb), alpha, roughness, transmission and a tangent-space bump (x along the card, y across)
// the resolved point on the hugging surface (dcResolve) and its card coordinates
vec2 dcUv; vec3 dcWp; bool dcIn; bool dcNear; // dcNear: within the resolve distance (uDcFix.x) of the camera
void dcItem(out vec3 col, out float a, out float rough, out float tr, out vec2 bump) {
  float k = vDcInfo.x, ra = vDcInfo.y, rb = vDcInfo.z; vec2 uv = dcUv;
  bump = vec2(0.0); tr = 0.0; rough = 0.7; dcShade = 0.0;
  if (k < ${K.needle - 0.5}) {
    bool fresh = vDcInfo.w > 0.5;
    vec2 t = fresh ? dcCell(ra, ${crop(LEAF_ATLAS.fresh)}, uv) : dcCell(ra, ${crop(LEAF_ATLAS.dry)}, vec2(-uv.x, uv.y));
    col = fresh ? texture2D(tDcFresh, t).rgb * uDcFreshTint : texture2D(tDcDry, t).rgb * uDcDry.rgb;
    a = fresh ? texture2D(tDcFreshA, t).r : texture2D(tDcDryA, t).r;
    col = dcSat(col, uDcDry.w) * (0.85 + 0.3 * rb);
    // fine detail the atlas cannot hold at an ant's distance: mottling, a pale midrib, a darker dry rim
    vec2 lp = dcWp.xz;
    float mot = wrFbm(lp * 0.35 + ra * 40.0);
    col *= (0.72 + 0.56 * mot) * (0.94 + 0.12 * wrNoise(lp * 3.0));
    float mid = 1.0 - smoothstep(0.0, 0.03, abs(uv.y));
    col *= 1.0 + 0.18 * mid;
    col *= mix(0.75, 1.0, smoothstep(0.35, 0.75, a));
    bump = vec2(wrNoise(lp * 1.3) - 0.5, wrNoise(lp.yx * 1.3 + 5.0) - 0.5) * 0.7 + vec2(0.0, sign(uv.y) * mid * 0.6);
    // thickness and relief (look-pass 2): the cut edge is a thin dark margin that turns up (the leaf is a body, not
    // paper), and secondary veins run from the midrib toward the margin as shallow grooves
    float edgeW = 1.0 - smoothstep(0.52, 0.86, a);
    col *= 1.0 - 0.3 * edgeW;
    float hv = fract((uv.x * 0.5 + 0.5) * 8.0 - abs(uv.y) * 2.6);
    float vein = (1.0 - smoothstep(0.0, 0.09, min(hv, 1.0 - hv))) * smoothstep(0.1, 0.3, abs(uv.y)) * (1.0 - smoothstep(0.7, 0.95, abs(uv.y)));
    col *= 1.0 - 0.1 * vein;
    bump += vec2(0.0, sign(uv.y) * (vein * 0.5 - edgeW * 0.4));
    rough = 0.62; tr = fresh ? 1.0 : 0.45;
    // thickness (look pass 3): the cut margin is a lit edge, and the leaf leaves a soft dark fringe on the ground beside it
    col *= 1.0 + ${DECOR_LEAF.edgeLight.toFixed(2)} * (smoothstep(0.5, 0.56, a) * (1.0 - smoothstep(0.56, 0.7, a)));
    if (a < 0.5 && dcNear) { // near leaves only: far away the fringe is sub-pixel noise that flips pixels with the smallest camera change
      const float SD = ${DECOR_LEAF.shadowReachUv.toFixed(3)};
      dcShade = ${DECOR_LEAF.shadowDensity.toFixed(2)} * 0.25 * (dcLeafAlpha(ra, fresh, uv + vec2(SD, 0.0)) + dcLeafAlpha(ra, fresh, uv - vec2(SD, 0.0))
        + dcLeafAlpha(ra, fresh, uv + vec2(0.0, SD)) + dcLeafAlpha(ra, fresh, uv - vec2(0.0, SD)));
    }
  } else if (k < ${K.needle + 0.5}) {
    a = (1.0 - smoothstep(0.55, 1.0, abs(uv.y))) * (1.0 - smoothstep(0.9, 1.0, abs(uv.x)));
    col = mix(vec3(0.33, 0.17, 0.07), vec3(0.18, 0.11, 0.06), rb) * (0.85 + 0.3 * wrNoise(uv * vec2(30.0, 2.0)));
    rough = 0.55; bump = vec2(0.0, -uv.y * 0.6);
  } else if (k < ${K.petal + 0.5}) {
    vec2 q = uv * vec2(1.0, 1.15);
    float r = length(q) + 0.12 * smoothstep(0.7, 1.0, uv.x) * (1.0 - smoothstep(0.0, 0.2, abs(uv.y)));
    a = 1.0 - smoothstep(0.86, 1.0, r);
    // blossom petal: cream to blush, faint radiating veins, a greener claw at the base, browning when old
    col = mix(vec3(0.93, 0.88, 0.82), vec3(0.92, 0.66, 0.70), smoothstep(0.35, 1.0, rb));
    col *= 0.92 + 0.08 * sin(atan(uv.y, uv.x + 1.2) * 34.0);
    col = mix(col, vec3(0.62, 0.66, 0.42), (1.0 - smoothstep(-1.0, -0.55, uv.x)) * 0.6);
    col = mix(col, vec3(0.55, 0.42, 0.30), smoothstep(0.75, 1.0, ra) * smoothstep(0.5, 1.0, length(uv)) * 0.7);
    rough = 0.5; tr = 1.6; bump = -uv * 0.4;
  } else if (k < ${K.receipt + 0.5}) {
    bool receipt = k > ${K.wrapper + 0.5};
    float edge = max(abs(uv.x), abs(uv.y)) + (wrNoise(uv * 9.0 + ra * 40.0) - 0.5) * (receipt ? 0.05 : 0.14);
    a = step(edge, 0.94);
    vec3 film = rb < 0.25 ? vec3(0.55, 0.12, 0.10) : rb < 0.5 ? vec3(0.12, 0.22, 0.45) : rb < 0.75 ? vec3(0.62, 0.62, 0.6) : vec3(0.75, 0.6, 0.15);
    col = receipt ? vec3(0.86, 0.84, 0.78) : film;
    vec2 cr = vec2(wrNoise(uv * 6.0 + ra * 17.0), wrNoise(uv * 6.0 + ra * 31.0)) - 0.5;
    bump = cr * (receipt ? 0.5 : 1.4) + (receipt ? vec2(sign(uv.x) * 0.25 * (1.0 - smoothstep(0.0, 0.05, abs(uv.x))), 0.0) : vec2(0.0));
    col *= 0.85 + 0.25 * wrNoise(uv * 3.0 + ra * 5.0);
    rough = receipt ? 0.8 : 0.32; tr = receipt ? 0.3 : 0.0;
  } else if (k < ${K.moss + 0.5}) {
    float m = wrFbm(dcWp.xz / 3.0 + ra * 50.0);
    a = smoothstep(0.42, 0.58, (1.0 - length(uv)) * 0.9 + m * 0.55);
    col = texture2D(tDcMoss, dcWp.xz / 70.0).rgb * vec3(0.95, 1.05, 0.8) * (0.8 + 0.4 * m);
    rough = 0.85; tr = 0.5; bump = (vec2(wrNoise(dcWp.xz * 0.9), wrNoise(dcWp.zx * 0.9 + 3.0)) - 0.5) * 1.2;
  } else if (k < ${K.chip + 0.5}) {
    float edge = max(abs(uv.x) * 0.95, abs(uv.y)) + (wrNoise(uv * 7.0 + ra * 20.0) - 0.5) * 0.25;
    a = step(edge, 0.9);
    col = mix(vec3(0.24, 0.14, 0.08), vec3(0.42, 0.28, 0.16), rb) * (0.75 + 0.45 * wrNoise(uv * vec2(3.0, 24.0) + ra * 9.0));
    rough = 0.8; bump = vec2(0.0, (wrNoise(uv * vec2(3.0, 24.0)) - 0.5) * 1.5);
  } else {
    float r = length(uv) + (wrNoise(uv * 4.0 + ra * 30.0) - 0.5) * 0.3;
    a = 1.0 - smoothstep(0.8, 0.95, r);
    col = k < ${K.grit + 0.5} ? mix(vec3(0.16, 0.15, 0.14), vec3(0.42, 0.38, 0.33), rb) : mix(vec3(0.35, 0.33, 0.30), vec3(0.55, 0.50, 0.44), rb);
    rough = 0.75; bump = uv * 1.6; // a dome
  }
}
${DRAPED_RESOLVE_GLSL}
`;

export function createDrapedMaterial(shared: DecorShared, tex: DrapedTextures): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, metalness: 0, side: DoubleSide });
  m.name = 'decor:draped';
  const w = shared.world, d = shared.decor, dr = shared.drape, h = shared.hole;
  addPatch(m, 'decor-draped-occ', (s) => {
    Object.assign(s.uniforms, {
      uTime: w.uTime, uCamPos: w.uCamPos, uWet: w.uWet,
      uWrDapple: w.uDapple, uWrDappleMm: w.uDappleMm, tWrCanopy: w.tDappleMask, uWrCanopyInv: w.uDappleMaskInv,
      tDrH: dr.tDrH, uDrHf: dr.uDrHf, uDrLv: dr.uDrLv, uDrCount: dr.uDrCount,
      tHoleIdx: h.tHoleIdx, tHoleAtlas: h.tHoleAtlas, uHoleP: h.uHoleP,
      uDcKeep: d.uDcKeep, uDcLod: d.uDcLod, uDcFresh: d.uDcFresh, uDcBu: d.uDcBu, uDcBias: d.uDcBias, uDcFix: d.uDcFix,
      uDcDry: d.uDcDry, uDcFreshTint: d.uDcFreshTint, uTransl: d.uTransl,
      tDcFresh: new Uniform(tex.freshAlbedo), tDcFreshA: new Uniform(tex.freshAlpha), tDcDry: new Uniform(tex.dryAlbedo),
      tDcDryA: new Uniform(tex.dryAlpha), tDcMoss: new Uniform(tex.moss),
      ...occlusionUniforms(w),
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${DRAPE_GLSL}\n${DRAPED_VERT_GLSL}\nvarying vec3 vWrW; varying vec3 vDcT;`)
      .replace('#include <beginnormal_vertex>', 'vec3 dcP; vec3 objectNormal; drapedShape(dcP, objectNormal);\nvDcT = vec3(cos(iA.z), 0.0, sin(iA.z)); vWrW = dcP;')
      .replace('#include <begin_vertex>', 'vec3 transformed = dcP;')
      .replace('#include <project_vertex>', '#include <project_vertex>\ngl_Position = drapedBias(gl_Position, mvPosition.xyz, iC.w);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${DRAPE_GLSL}\nvarying vec2 vDcUv; varying vec4 vDcInfo; varying vec3 vDcW; varying float vDcFade; varying vec3 vDcN; varying vec4 vDcC; varying vec4 vDcS;\nuniform vec2 uDcBias; uniform vec3 uCamPos; uniform float uDcBu;\n${GLSL_OCCLUSION}\n${FRAG_DECL}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\ndcIn = dcResolve(dcUv, dcWp);\ndcNear = length(vDcW - uCamPos) <= uDcFix.x;\ngl_FragDepth = length(vDcW - uCamPos) > uDcFix.x ? gl_FragCoord.z : dcDepth(dcWp);')
      .replace('#include <map_fragment>', `
if (!dcIn || vDcFade <= 0.0 || wrHoleMask(dcWp.xz) > 0.5) discard;
wrOccDither(dcWp, ${WORLD_OCCLUSION_TERRAIN_TMAX.toFixed(3)}); // lies on the ground: like the terrain
vec3 dcCol; float dcA, dcRough, dcTr; vec2 dcBump;
dcItem(dcCol, dcA, dcRough, dcTr, dcBump);
if (dcA < 0.5) {
  if (dcShade <= wrHash12(floor(gl_FragCoord.xy) + 17.0)) discard;
  dcCol = vec3(0.012, 0.010, 0.008); dcRough = 1.0; dcTr = 0.0; dcBump = vec2(0.0);
}
if (wrHash12(floor(gl_FragCoord.xy)) > vDcFade) discard;
diffuseColor.rgb *= wrWetAlbedo(dcCol, uWet, 0.7);
vec3 dcNw = normalize(vDcN);
if (length(vDcW - uCamPos) <= uDcFix.x) {
  vec3 ng = vDcC.w > -5e8 ? vec3(0.0, 1.0, 0.0) : drN(dcWp.xz);
  float c = cos(vDcC.z), s = sin(vDcC.z), r2 = min(1.0, dot(dcUv, dcUv));
  vec2 rim = vec2(c * dcUv.x - s * dcUv.y, s * dcUv.x + c * dcUv.y) * vDcS.z * 0.9;
  dcNw = normalize(ng - vec3(rim.x, 0.0, rim.y) * r2);
}
{ vec3 t = normalize(vDcT - dcNw * dot(vDcT, dcNw)); vec3 b = cross(dcNw, t); dcNw = normalize(dcNw - t * dcBump.x * 0.35 - b * dcBump.y * 0.35); }`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wrWetRough(dcRough, uWet, 0.25);')
      .replace('#include <normal_fragment_maps>', 'normal = normalize((viewMatrix * vec4(dcNw, 0.0)).xyz);')
      .replace('#include <lights_fragment_begin>', foliageLightsChunk('uTransl * dcTr * 0.9', 'vec3(1.15, 1.2, 0.75)'));
  });
  return m;
}
