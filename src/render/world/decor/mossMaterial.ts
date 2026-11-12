// Material of moss patches baked onto primitives (primMoss.ts): the moss scan mapped in world XZ, an irregular
// cushion outline from noise, a hair of polygon offset over the solid's surface, wetness and the forest dapple.
import { BufferAttribute, BufferGeometry, DoubleSide, MeshStandardMaterial, Uniform, type Texture } from 'three';
import { GLSL_DAPPLE, dappledLightsChunk } from '../materials/dapple';
import { GLSL_NOISE, GLSL_WET } from '../materials/glsl';
import { addPatch } from '../materials/surfacePatch';
import type { MossPatches } from './primMoss';
import type { DecorShared } from './shared';

export function mossGeometry(m: MossPatches): BufferGeometry | null {
  if (!m.patches) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(m.position, 3));
  g.setAttribute('aUvMask', new BufferAttribute(m.uvMask, 4));
  const nrm = new Float32Array(m.position.length);
  for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new BufferAttribute(nrm, 3));
  g.setIndex(new BufferAttribute(m.index, 1));
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

export function createMossMaterial(shared: DecorShared, moss: Texture): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  m.name = 'decor:prim-moss';
  const w = shared.world;
  addPatch(m, 'decor-prim-moss', (s) => {
    Object.assign(s.uniforms, {
      uWet: w.uWet, uWrDapple: w.uDapple, uWrDappleMm: w.uDappleMm, tWrCanopy: w.tDappleMask, uWrCanopyInv: w.uDappleMaskInv,
      tDcMoss: new Uniform(moss),
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aUvMask; varying vec4 vMoss; varying vec3 vWrW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMoss = aUvMask; vWrW = transformed;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE}\n${GLSL_WET}\n${GLSL_DAPPLE}\nuniform sampler2D tDcMoss; uniform float uWet; varying vec4 vMoss; varying vec3 vWrW;`)
      .replace('#include <map_fragment>', `
float mn = wrFbm(vWrW.xz / 3.0 + vMoss.w * 50.0);
if (vMoss.z < 0.99 || (1.0 - length(vMoss.xy)) * 0.9 + mn * 0.55 < 0.5) discard;
diffuseColor.rgb *= wrWetAlbedo(texture2D(tDcMoss, vWrW.xz / 70.0).rgb * vec3(0.95, 1.05, 0.8) * (0.8 + 0.4 * mn), uWet, 0.7);`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = wrWetRough(roughness, uWet, 0.4);')
      .replace('#include <lights_fragment_begin>', dappledLightsChunk());
  });
  return m;
}
