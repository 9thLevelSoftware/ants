// Dew droplets on grass blades (GDD 06 §3.8: droplets 0.2-2 mm, dewLevel 0..1 from SR-ish to SR + 5 h; GDD 08
// 11.7 "dew drops are boulders of water"). Each droplet record carries its blade's record, so the vertex shader
// places it on the swaying blade with the same bladeShapeAt as the blade itself; droplets appear in rank order as
// the dew level rises. Material: spike-look 2.7 (specular from the environment plus a bright "sky core").
import { rngFloat, rngSeed } from '@/core';
import { BufferAttribute, IcosahedronGeometry, MeshStandardMaterial, type BufferGeometry } from 'three';
import { GLSL_NOISE } from '../materials/glsl';
import { addPatch } from '../materials/surfacePatch';
import { HOLE_MASK_GLSL } from '../terrain/holeMask';
import { BLADE_STRIDE } from '../decor/instances';
import type { DecorShared } from '../decor/shared';
import { DEW } from '../decor/tuning';
import { BLADE_GLSL, BLADE_SIGHT_GLSL, bladeCutThreshold, bladeFragFade, bladeVertex, type BladeView } from './bladeShape';

/** Droplet: the 12 blade floats + (h along the blade, s across, radius mm, rank). */
export const DROP_STRIDE = 16;

/** Droplets of a block's blades (deterministic from the blade records). */
export function placeDew(blades: Float32Array, seed: number): Float32Array {
  const out: number[] = [];
  const s = rngSeed(seed);
  for (let o = 0; o < blades.length; o += BLADE_STRIDE) {
    const rnd = blades[o + 7];
    if (rnd >= DEW.bladeShare) continue;
    const n = DEW.perBlade[0] + Math.floor(rngFloat(s) * (DEW.perBlade[1] - DEW.perBlade[0] + 1));
    for (let i = 0; i < n; i++) {
      const h = 0.25 + 0.65 * rngFloat(s), side = (rngFloat(s) * 2 - 1) * 0.5;
      const r = DEW.radiusMm[0] + (DEW.radiusMm[1] - DEW.radiusMm[0]) * Math.pow(rngFloat(s), 1.6);
      for (let k = 0; k < BLADE_STRIDE; k++) out.push(blades[o + k]);
      out.push(h, side, r, rnd / DEW.bladeShare);
    }
  }
  return Float32Array.from(out);
}

/**
 * CPU twin of the droplet visibility test in the dew vertex shader (record `o` of placeDew's output, without the
 * terrain-hole test): shown while the dew level covers its rank and its blade is not cut away at that point.
 */
export function dropletVisible(drops: Float32Array, o: number, view: BladeView, dew: number): boolean {
  if (drops[o + 15] >= dew) return false;
  const p = bladeVertex(drops, o, drops[o + 13], drops[o + 12], view);
  return p.fade > 0.5 && bladeFragFade(p.x, p.y, p.z, view) > bladeCutThreshold(drops[o + 7]);
}

/** Low-poly droplet (20 triangles: drops are 0.2-1 mm), indexed so it can be a shared instancing base. */
export function dropletGeometry(): BufferGeometry {
  const g = new IcosahedronGeometry(1, 0);
  const n = g.getAttribute('position').count;
  g.setIndex(new BufferAttribute(Uint16Array.from({ length: n }, (_, i) => i), 1));
  return g;
}

export function createDewMaterial(shared: DecorShared): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0x050607, roughness: 0.04, metalness: 0 });
  m.name = 'decor:dew';
  const w = shared.world, d = shared.decor, h = shared.hole;
  addPatch(m, 'decor-dew', (s) => {
    Object.assign(s.uniforms, {
      uTime: w.uTime, uCamPos: w.uCamPos, uSubject: w.uSubject, uWindDir: d.uWindDir, uHaze: w.uHaze,
      uGrWind: d.uGrWind, uGrPart: d.uGrPart, uGrLod: d.uGrLod, uGrPartP: d.uGrPartP, uGrEye: d.uGrEye, uDew: d.uDew,
      tHoleIdx: h.tHoleIdx, tHoleAtlas: h.tHoleAtlas, uHoleP: h.uHoleP,
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${HOLE_MASK_GLSL}\n${BLADE_GLSL}\nuniform vec2 uGrEye;\n${BLADE_SIGHT_GLSL}\nattribute vec4 iDrop; uniform float uDew; varying float vDrop;`)
      .replace('#include <beginnormal_vertex>', `
vec3 bP; vec3 bN; bladeShapeAt(iDrop.y, iDrop.x, bP, bN);
// hidden with its blade: LOD fade, and the blade's eye / line-of-sight cut at the droplet (see dropletVisible)
bool dropOn = vBFade > 0.5 && iDrop.w < uDew && grSightFade(bP) > grCutThreshold(iShape.w) && wrHoleMask(iRoot.xz) < 0.5;
vDrop = dropOn ? 1.0 : 0.0;
float dr = dropOn ? iDrop.z : 0.0;
vec3 objectNormal = normal;`)
      .replace('#include <begin_vertex>', 'vec3 transformed = bP + bN * dr * 0.7 + position * dr * vec3(1.0, 0.82, 1.0);');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE}\nuniform vec3 uHaze; varying float vDrop;`)
      .replace('#include <map_fragment>', 'if (vDrop < 0.5) discard;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
{ float nv = saturate(dot(normalize(normal), normalize(vViewPosition)));
  totalEmissiveRadiance += uHaze * (0.1 + 0.65 * pow(nv, 1.5)) * 0.6; }`);
  });
  return m;
}
