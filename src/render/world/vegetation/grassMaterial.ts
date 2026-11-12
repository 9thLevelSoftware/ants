// Grass blade geometry and materials (spike-look 2.8): one procedural blade in InstancedBufferGeometry, shaped and
// swayed in the vertex shader (BLADE_GLSL), coloured from the straightened CC0 blade atlas (or a procedural
// gradient), base darkening, dry tips, hue variety, back-lit transmission and the forest dapple; dither-faded
// around the line of sight per fragment. A matching depth material keeps shadows in step with the sway.
import {
  BufferAttribute, DoubleSide, InstancedBufferGeometry, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, Uniform, type Texture,
} from 'three';
import { GLSL_DAPPLE } from '../materials/dapple';
import { GLSL_NOISE, GLSL_WET } from '../materials/glsl';
import { addPatch } from '../materials/surfacePatch';
import { GLSL_OCCLUSION, occlusionUniforms } from '../materials/occlusion';
import { HOLE_MASK_GLSL } from '../terrain/holeMask';
import { foliageLightsChunk } from '../decor/foliageLight';
import type { DecorShared } from '../decor/shared';
import { GRASS, PARTING } from '../decor/tuning';
import { BLADE_FRAG_GLSL, BLADE_GLSL } from './bladeShape';

/** Blade mesh in parameter space: position.x across (-1..1), position.y along (0..1); rows x cols + tip. */
export function bladeGeometry(rows: number, folded: boolean): { position: BufferAttribute; index: BufferAttribute; tris: number } {
  const cols = folded ? 3 : 2, pos: number[] = [], idx: number[] = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) pos.push(cols === 3 ? c - 1 : c * 2 - 1, r / rows, 0);
  pos.push(0, 1, 0);
  const tip = rows * cols;
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = (r + 1) * cols + c;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  for (let c = 0; c < cols - 1; c++) idx.push((rows - 1) * cols + c, (rows - 1) * cols + c + 1, tip);
  return { position: new BufferAttribute(new Float32Array(pos), 3), index: new BufferAttribute(new Uint16Array(idx), 1), tris: idx.length / 3 };
}

export function emptyInstanced(): InstancedBufferGeometry {
  return new InstancedBufferGeometry();
}

const VERT_HOOKS = (std: boolean) => (s: { vertexShader: string }) => {
  s.vertexShader = s.vertexShader.replace('#include <common>', `#include <common>\n${HOLE_MASK_GLSL}\n${BLADE_GLSL}\nvarying vec3 vWrW;`);
  // blades rooted in an opened nest hole are collapsed (the entrance stays clear)
  const hole = 'if (wrHoleMask(iRoot.xz) > 0.5) { grP = iRoot.xyz; vBFade = 0.0; }';
  s.vertexShader = std
    ? s.vertexShader
      .replace('#include <beginnormal_vertex>', `vec3 grP; vec3 objectNormal; bladeShape(grP, objectNormal); ${hole} vWrW = grP;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = grP;')
    : s.vertexShader.replace('#include <begin_vertex>', `vec3 grP; vec3 grN; bladeShape(grP, grN); ${hole} vec3 transformed = grP;`);
};

function bindBlade(s: { uniforms: Record<string, unknown> }, shared: DecorShared): void {
  const w = shared.world, d = shared.decor, h = shared.hole;
  Object.assign(s.uniforms, {
    uTime: w.uTime, uCamPos: w.uCamPos, uSubject: w.uSubject, uWindDir: d.uWindDir, uWet: w.uWet,
    uGrWind: d.uGrWind, uGrPart: d.uGrPart, uGrLod: d.uGrLod, uGrPartP: d.uGrPartP, uGrEye: d.uGrEye, uTransl: d.uTransl,
    tHoleIdx: h.tHoleIdx, tHoleAtlas: h.tHoleAtlas, uHoleP: h.uHoleP,
    uWrDapple: w.uDapple, uWrDappleMm: w.uDappleMm, tWrCanopy: w.tDappleMask, uWrCanopyInv: w.uDappleMaskInv,
  });
}

const FRAG_COMMON = /* glsl */ `
${GLSL_NOISE}
varying float vBH; varying float vBS; varying float vBFade; varying vec3 vBInfo;
${BLADE_FRAG_GLSL}
// discard (keeps the opaque pipeline): the LOD cross-fade as a screen door over the whole (small, far) blade; the
// eye / line-of-sight fade as a per-blade cut with a slightly noisy edge (PARTING.cutRange)
void grClip() {
  float h = wrHash12(floor(gl_FragCoord.xy));
  if (vBFade < 0.999 && h > vBFade) discard;
  float sight = grFragFade();
  if (sight < 0.999 && grCutThreshold(vBInfo.z) + (h - 0.5) * ${PARTING.cutNoise.toFixed(3)} > sight) discard;
}
`;

export function createGrassMaterials(shared: DecorShared, strip: Texture | null): { main: MeshStandardMaterial; depth: MeshDepthMaterial } {
  const main = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, side: DoubleSide });
  main.name = 'decor:grass';
  addPatch(main, `decor-grass-${strip ? 'atlas' : 'proc'}-occ`, (s) => {
    bindBlade(s, shared);
    Object.assign(s.uniforms, occlusionUniforms(shared.world));
    s.uniforms.tGrStrip = new Uniform(strip);
    VERT_HOOKS(true)(s);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_COMMON}\n${GLSL_WET}\n${GLSL_DAPPLE}\n${GLSL_OCCLUSION}\nuniform sampler2D tGrStrip; uniform float uWet; uniform float uTransl; varying vec3 vWrW;`)
      .replace('#include <map_fragment>', `
grClip();
wrOccDither(vWrW, 1.0);
${strip
    ? `vec3 bc = texture2D(tGrStrip, vec2(0.02 + vBH * 0.96, (vBInfo.y + 0.5 + vBS * 0.4) / ${GRASS.strips.toFixed(1)})).rgb;`
    : 'vec3 bc = mix(vec3(0.05, 0.13, 0.02), vec3(0.16, 0.30, 0.05), vBH) * (0.9 + 0.1 * sin(vBS * 18.0));'}
bc *= vec3(1.0 + vBInfo.x * 0.25, 1.0, 1.0 - vBInfo.x * 0.35);
bc = mix(bc, vec3(0.42, 0.36, 0.17), smoothstep(0.86, 1.0, vBH) * step(0.6, vBInfo.z) * 0.7);
bc *= mix(0.28, 1.0, smoothstep(0.0, 0.55, vBH));
diffuseColor.rgb *= wrWetAlbedo(bc, uWet, 0.8);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wrWetRough(roughness, uWet, 0.2);')
      .replace('#include <lights_fragment_begin>', foliageLightsChunk('uTransl * 0.9', 'vec3(1.25, 1.45, 0.55)'));
  });
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  addPatch(depth, 'decor-grass-depth', (s) => {
    bindBlade(s, shared);
    VERT_HOOKS(false)(s);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_COMMON}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\ngrClip();');
  });
  return { main, depth };
}
