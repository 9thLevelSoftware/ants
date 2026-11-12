// Water surface material (GDD 08 11.4 "puddles in hollows, flat reflective"; GDD 08 11.6 water): a transparent
// MeshStandardMaterial patched for
//  - depth: vessel depth for bowls, else water level minus the drawn ground under the fragment (drape);
//  - depth darkening (shallow water shows the ground tinted, deep water goes dark), discard where dry;
//  - reflection: the scene environment at roughness ~0.04 with Fresnel driving the opacity, so at an ant's grazing
//    view the water mirrors the sky while from above it is clear;
//  - a bright meniscus line at the waterline (and at a vessel's rim), faint wind ripples.
import { MeshStandardMaterial } from 'three';
import { GLSL_NOISE } from '../materials/glsl';
import { addPatch } from '../materials/surfacePatch';
import { DRAPE_GLSL } from '../decor/drape';
import type { DecorShared } from '../decor/shared';
import { WATER } from '../decor/tuning';

const v3 = (a: readonly number[]) => `vec3(${a.map((x) => x.toFixed(3)).join(', ')})`;

export function createWaterMaterial(shared: DecorShared): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: 0xffffff, roughness: WATER.roughness, metalness: 0, transparent: true, depthWrite: false });
  m.name = 'decor:water';
  const w = shared.world, dr = shared.drape;
  addPatch(m, 'decor-water', (s) => {
    Object.assign(s.uniforms, {
      uTime: w.uTime, uWindDir: shared.decor.uWindDir, uGrWind: shared.decor.uGrWind,
      tDrH: dr.tDrH, uDrHf: dr.uDrHf, uDrLv: dr.uDrLv, uDrCount: dr.uDrCount,
    });
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aWater; varying vec4 vWater; varying vec3 vWaW;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWater = aWater; vWaW = transformed;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${GLSL_NOISE}\n${DRAPE_GLSL}\nuniform float uTime; uniform vec2 uWindDir; uniform float uGrWind;\nvarying vec4 vWater; varying vec3 vWaW;`)
      .replace('#include <map_fragment>', `
float waDepth = vWater.w >= 0.0 ? vWater.w : vWaW.y - drapeY(vWaW.xz);
if (waDepth <= 0.0) discard;
float waEdge = 1.0 - smoothstep(0.0, ${WATER.meniscusMm.toFixed(3)}, waDepth);
if (vWater.w >= 0.0) waEdge = max(waEdge, smoothstep(vWater.z - ${WATER.meniscusMm.toFixed(3)} * 2.0, vWater.z, length(vWaW.xz - vWater.xy)));
// vessels hold clear tap water (slow darkening); puddles are muddy (fast darkening)
float waDeep = vWater.w >= 0.0 ? 0.45 * smoothstep(0.0, ${WATER.clearFullDepthMm.toFixed(1)}, waDepth) : smoothstep(0.0, ${WATER.fullDepthMm.toFixed(2)}, waDepth);
diffuseColor.rgb = mix(${v3(WATER.shallowTint)}, ${v3(WATER.deepTint)}, waDeep) * 0.35;`)
      .replace('#include <normal_fragment_maps>', `
{ vec2 p = vWaW.xz * 0.35 + uWindDir * uTime * 2.0;
  vec2 rp = vec2(wrNoise(p), wrNoise(p + 7.3)) - 0.5;
  vec3 nw = normalize(vec3(rp.x, 1.0, rp.y) * vec3(0.06 + uGrWind * 0.4, 1.0, 0.06 + uGrWind * 0.4));
  normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz); }`)
      .replace('#include <opaque_fragment>', `
{ float nv = saturate(dot(normal, normalize(vViewPosition)));
  float fres = 0.02 + 0.98 * pow(1.0 - nv, 5.0);
  diffuseColor.a = clamp(max(mix(0.2, 0.88, waDeep), fres) + waEdge * 0.25, 0.0, 1.0);
  outgoingLight += waEdge * (reflectedLight.indirectSpecular * 0.4 + reflectedLight.directSpecular * 0.3); }
#include <opaque_fragment>`);
  });
  return m;
}
