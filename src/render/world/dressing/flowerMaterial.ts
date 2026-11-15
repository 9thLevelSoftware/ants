// Shader of the flower parts (flowerParts.ts): one instanced strap mesh (ligules, petals, bracts, florets, seed
// beaks: a thin blade bent toward its face over its length) and one instanced disc mesh (seed parachutes, small
// five-petalled florets). The outline of each part is cut in the fragment shader (opaque pipeline, alpha test by
// discard), the same cut runs in the shadow depth material. Lit by three's lights with the foliage back-light
// (petals glow when the sun is behind them), dithered by the camera occlusion cone like the rest of the world.
import { BufferGeometry, DoubleSide, Float32BufferAttribute, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking } from 'three';
import type { WebGLProgramParametersWithUniforms } from 'three';
import { addPatch } from '../materials/surfacePatch';
import { GLSL_NOISE } from '../materials/glsl';
import { GLSL_DAPPLE } from '../materials/dapple';
import { GLSL_OCCLUSION, occlusionUniforms } from '../materials/occlusion';
import { foliageLightsChunk } from '../decor/foliageLight';
import type { WorldUniforms } from '../materials/uniforms';
import { PART_SHAPE } from './flowerParts';

const S = PART_SHAPE;

/** Strap: `segs` rows along x (0..1), three vertices across z (-0.5, 0, 0.5). */
export function strapGeometry(segs: number): BufferGeometry {
  const pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= segs; i++) for (let k = 0; k < 3; k++) pos.push(i / segs, 0, (k - 1) * 0.5);
  for (let i = 0; i < segs; i++) for (let k = 0; k < 2; k++) {
    const a = i * 3 + k, b = a + 1, c = a + 3, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute(new Array(pos.length).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
  g.setIndex(idx);
  return g;
}

/** Disc: one quad in the xz plane, -1..1. */
export function discGeometry(): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute([-1, 0, -1, 1, 0, -1, -1, 0, 1, 1, 0, 1], 3));
  g.setAttribute('normal', new Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
  g.setIndex([0, 2, 1, 1, 2, 3]);
  return g;
}

const VERT_DECL = /* glsl */ `
attribute vec4 iPart;   // shape, curl rad, translucency, disc flag
attribute vec3 iBase; attribute vec3 iTip;
varying vec2 vFlUv; varying float vFlShape; varying vec3 vFlBase; varying vec3 vFlTip; varying float vFlTransl;
varying vec3 vWrW;
vec3 flBend(vec3 p, out vec3 n) {
  n = vec3(0.0, 1.0, 0.0);
  if (iPart.w > 0.5) return p;
  float c = iPart.y, x = p.x;
  if (abs(c) < 1e-3) return p;
  n = vec3(-sin(c * x), cos(c * x), 0.0);
  return vec3(sin(c * x) / c, (1.0 - cos(c * x)) / c, p.z);
}
`;

const VERT_NORMAL = /* glsl */ `
vec3 flN; vec3 flP = flBend(position, flN);
vec3 objectNormal = flN;
`;
const VERT_POS = /* glsl */ `
vec3 flN2; vec3 transformed = flBend(position, flN2);
vFlUv = iPart.w > 0.5 ? position.xz : vec2(position.x, position.z * 2.0);
vFlShape = iPart.x; vFlBase = iBase; vFlTip = iTip; vFlTransl = iPart.z;
`;

/** Outline cut (true = outside) and the along-part blend for colour. Needs vFlUv / vFlShape. */
const FRAG_SHAPE = /* glsl */ `
varying vec2 vFlUv; varying float vFlShape; varying vec3 vFlBase; varying vec3 vFlTip; varying float vFlTransl;
bool flCut() {
  float u = vFlUv.x, v = abs(vFlUv.y);
  int sh = int(vFlShape + 0.5);
  if (sh == ${S.ligule}) {
    float hw = mix(0.45, 1.0, smoothstep(0.0, 0.25, u));
    float teeth = 0.5 + 0.5 * cos(vFlUv.y * 3.14159 * 2.5);
    return v > hw || u > 0.9 + 0.1 * teeth;
  }
  if (sh == ${S.petal}) {
    float hw = mix(0.35, 1.0, smoothstep(0.0, 0.3, u));
    if (u > 0.78) hw *= sqrt(max(0.0, 1.0 - pow((u - 0.78) / 0.22, 2.0)));
    return v > hw || (u > 0.95 && v < 0.12);
  }
  if (sh == ${S.bract}) return v > pow(sin(3.14159 * pow(clamp(u, 0.0, 1.0), 0.7)), 0.8);
  if (sh == ${S.floret}) return v > mix(0.5, 1.0, u) * (u > 0.85 ? sqrt(max(0.0, 1.0 - pow((u - 0.85) / 0.15, 2.0))) : 1.0);
  if (sh == ${S.beak}) return false;
  float r = length(vFlUv), a = atan(vFlUv.y, vFlUv.x);
  if (sh == ${S.pappus}) {
    // radial hairs of a seed parachute, finer toward the rim, and a tiny hub
    if (r > 1.0) return true;
    float hair = abs(fract(a * 44.0 / 6.2832) - 0.5);
    return r > 0.08 && hair > 0.06 + 0.12 * (1.0 - r);
  }
  // star: five rounded petals
  return r > 0.45 + 0.55 * pow(abs(cos(a * 2.5)), 0.6);
}
`;

const FRAG_COLOR = /* glsl */ `
if (flCut()) discard;
wrOccDither(vWrW, 1.0);
{
  float u = vFlUv.x;
  int sh = int(vFlShape + 0.5);
  vec3 c = mix(vFlBase, vFlTip, sh >= ${S.pappus} ? smoothstep(0.0, 0.6, length(vFlUv)) : smoothstep(0.0, 1.0, u));
  // fine veins along straps, a slightly darker groove down the middle
  if (sh <= ${S.floret}) c *= (0.9 + 0.1 * smoothstep(0.0, 0.25, abs(fract(vFlUv.y * 3.0 + 0.5) - 0.5))) * mix(0.85, 1.0, smoothstep(0.0, 0.2, abs(vFlUv.y)));
  if (sh == ${S.pappus}) c *= 0.85 + 0.15 * length(vFlUv);
  diffuseColor.rgb *= c;
}
`;

export interface FlowerMaterials {
  material: MeshStandardMaterial;
  depth: MeshDepthMaterial;
}

export function createFlowerMaterials(u: WorldUniforms): FlowerMaterials {
  const material = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0, side: DoubleSide });
  material.name = 'world:flower-parts';
  addPatch(material, 'flower-parts-v1', (s: WebGLProgramParametersWithUniforms) => {
    Object.assign(s.uniforms, occlusionUniforms(u), {
      uWrDapple: u.uDapple, uWrDappleMm: u.uDappleMm, tWrCanopy: u.tDappleMask, uWrCanopyInv: u.uDappleMaskInv,
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', VERT_POS)
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWrW = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWrW;\n${GLSL_NOISE}\n${GLSL_OCCLUSION}\n${GLSL_DAPPLE}\n${FRAG_SHAPE}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_COLOR}`)
      .replace('#include <lights_fragment_begin>', foliageLightsChunk('vFlTransl', 'vec3(1.0, 1.0, 0.85)'));
  });
  const depth = new MeshDepthMaterial({ depthPacking: RGBADepthPacking, side: DoubleSide });
  addPatch(depth, 'flower-parts-depth-v1', (s: WebGLProgramParametersWithUniforms) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', VERT_POS);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_SHAPE}`)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nif (flCut()) discard;');
  });
  return { material, depth };
}
