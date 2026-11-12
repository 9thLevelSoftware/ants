/**
 * Materials for instanced ants: three's own MeshPhysicalMaterial (LOD0 look), MeshStandardMaterial (LOD1-3, carried
 * items) and MeshDepthMaterial (shadow pass), patched with onBeforeCompile so lights, shadows, fog, tone mapping and
 * colour management keep working. All variants share a handful of programs (customProgramCacheKey); per-variant
 * numbers are uniforms.
 */
import {
  Color, DoubleSide, MeshDepthMaterial, MeshPhysicalMaterial, MeshStandardMaterial, RGBADepthPacking, Uniform, Vector3, Vector4,
  type Material, type WebGLProgramParametersWithUniforms,
} from 'three';
import type { AntRig, V4 } from '../geometry/rig';
import type { V3 } from '../geometry/meshBuilder';
import { ANT_COLOR_VERTEX, ANT_VERT_PARS } from './vertexChunk';
import { ANT_EMISSIVE, ANT_FRAG_PARS, ANT_NORMAL, ANT_ROUGHNESS, ANT_SHEEN, WING_COLOR, WING_FRAG_PARS } from './fragmentChunk';
import { HIGHLIGHT } from '../tuning';

/** Uniforms shared by every ant material (one object each, so updating .value once updates all). */
export interface SharedAntUniforms { uTime: Uniform<number>; uHiWarm: Uniform<Color>; uHiCool: Uniform<Color> }

export function createSharedUniforms(): SharedAntUniforms {
  return {
    uTime: new Uniform(0),
    uHiWarm: new Uniform(new Color(HIGHLIGHT.warm).multiplyScalar(HIGHLIGHT.warmGain)),
    uHiCool: new Uniform(new Color(HIGHLIGHT.cool).multiplyScalar(HIGHLIGHT.coolGain)),
  };
}

function rigUniforms(rig: AntRig, shared: SharedAntUniforms) {
  const v3 = (a: V3) => new Vector3(a[0], a[1], a[2]);
  const v4 = (a: V4) => new Vector4(a[0], a[1], a[2], a[3]);
  return {
    ...shared,
    uLegA: { value: rig.legA.map(v4) }, uFoot: { value: rig.foot.map(v4) }, uLegLen: { value: rig.legLen.map(v4) },
    uGaitP: { value: v4(rig.gait) }, uNeck: { value: v3(rig.neck) }, uHeadUp: { value: v3(rig.headUp) },
    uMand: { value: v3(rig.mand) }, uSocket: { value: v3(rig.socket) }, uElbow: { value: v3(rig.elbow) }, uElbowAxis: { value: v3(rig.elbowAxis) },
    uGasterPivot: { value: v3(rig.gasterPivot) }, uGasterC: { value: v3(rig.gasterC) }, uGasterAxis: { value: v3(rig.gasterAxis) },
    uGasterP: { value: v4(rig.gasterP) }, uPetPivot: { value: v3(rig.petPivot) }, uGrip: { value: v3(rig.grip) },
    uGroom: { value: v3(rig.groom) }, uMembrane: { value: v3(rig.membrane) }, uCallow: { value: v3(rig.callow) }, uFacet: { value: rig.facet },
  };
}

function patchVertex(shader: WebGLProgramParametersWithUniforms, withNormal: boolean): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + ANT_VERT_PARS);
  if (withNormal) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 antP; vec3 antN; antDeform(position, normal, antP, antN);\nvec3 objectNormal = antN;')
      .replace('#include <begin_vertex>', 'vec3 transformed = antP;\nvRest = position;')
      .replace('#include <color_vertex>', ANT_COLOR_VERTEX);
  } else {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', 'vec3 antP; vec3 antN; antDeform(position, normal, antP, antN);\nvec3 transformed = antP;');
  }
}

function patchFragment(shader: WebGLProgramParametersWithUniforms, physical: boolean): void {
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + ANT_FRAG_PARS)
    .replace('#include <roughnessmap_fragment>', ANT_ROUGHNESS)
    .replace('#include <normal_fragment_maps>', ANT_NORMAL)
    .replace('#include <emissivemap_fragment>', ANT_EMISSIVE);
  if (physical) shader.fragmentShader = shader.fragmentShader.replace('#include <lights_physical_fragment>', ANT_SHEEN);
}

export interface AntMatOptions { physical?: boolean; roughness?: number; sheen?: number; clearcoat?: number; transparent?: boolean; opacity?: number }

/** Body (or carried-item) material for one variant. physical = LOD0 look (clearcoat cuticle + pubescence sheen). */
export function makeAntMaterial(rig: AntRig, shared: SharedAntUniforms, o: AntMatOptions = {}): Material {
  const common = { vertexColors: true, roughness: o.roughness ?? 0.42, metalness: 0.0, transparent: o.transparent ?? false, opacity: o.opacity ?? 1 };
  const mat = o.physical
    ? new MeshPhysicalMaterial({ ...common, sheen: o.sheen ?? 0.5, sheenRoughness: 0.6, sheenColor: new Color('#5f5a50'), clearcoat: o.clearcoat ?? 0.3, clearcoatRoughness: 0.38 })
    : new MeshStandardMaterial(common);
  const u = rigUniforms(rig, shared);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    patchVertex(shader, true);
    patchFragment(shader, !!o.physical);
  };
  mat.customProgramCacheKey = () => `ant-body-${o.physical ? 'p' : 's'}${o.transparent ? 't' : ''}`;
  return mat;
}

/** Wing material: hyaline membrane with procedural venation and pterostigma, thin-film iridescence. */
export function makeWingMaterial(rig: AntRig, shared: SharedAntUniforms, membraneHex: string, veinHex: string): Material {
  const mat = new MeshPhysicalMaterial({
    vertexColors: false, color: new Color(membraneHex), roughness: 0.25, metalness: 0, transparent: true, opacity: 1, depthWrite: false,
    side: DoubleSide, iridescence: 0.7, iridescenceIOR: 1.35, iridescenceThicknessRange: [250, 520],
  });
  const u = { ...rigUniforms(rig, shared), uVein: { value: new Color(veinHex) } };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    patchVertex(shader, true);
    shader.vertexShader = shader.vertexShader
      .replace('#include <uv_vertex>', '#include <uv_vertex>\nvWingUv = uv;')
      .replace('#include <common>', '#include <common>\nvarying vec2 vWingUv;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + ANT_FRAG_PARS + WING_FRAG_PARS)
      .replace('#include <color_fragment>', WING_COLOR)
      .replace('#include <emissivemap_fragment>', ANT_EMISSIVE);
  };
  mat.customProgramCacheKey = () => 'ant-wing';
  return mat;
}

/** Shadow-pass material with the same deformation (otherwise shadows show the rest pose). */
export function makeAntDepthMaterial(rig: AntRig, shared: SharedAntUniforms): MeshDepthMaterial {
  const mat = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const u = rigUniforms(rig, shared);
  mat.onBeforeCompile = (shader) => { Object.assign(shader.uniforms, u); patchVertex(shader, false); };
  mat.customProgramCacheKey = () => 'ant-depth';
  return mat;
}
