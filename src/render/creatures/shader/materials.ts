/**
 * Materials for instanced creatures: three's MeshStandardMaterial (body; transparent for wing membranes) and
 * MeshDepthMaterial (shadow pass), patched with the creature deform. Every kind shares the same two or three
 * programs (customProgramCacheKey); per-kind numbers are uniforms.
 */
import {
  DoubleSide, MeshDepthMaterial, MeshStandardMaterial, RGBADepthPacking, Uniform, Vector3, Vector4, type Material,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import {
  CREATURE_BEGIN_NORMAL, CREATURE_BEGIN_VERTEX, CREATURE_COLOR_VERTEX, CREATURE_DEPTH_BEGIN_VERTEX, CREATURE_VERT_PARS,
} from './creatureChunk';
import { PIT_FRAG_CLIP, PIT_FRAG_PARS, PIT_VERT_INSTANCE, PIT_VERT_MESH, PIT_VERT_MESH_PARS, PIT_VERT_PARS } from './pitDepth';
import { PIT_DEPTH } from '../tuning';

/** The animation numbers of one kind (shader/creatureChunk.ts documents each component). */
export interface MotionUniforms {
  leg: [number, number, number, number];
  wave: [number, number, number, number];
  body: [number, number, number, number];
  misc: [number, number, number, number];
  retract: [number, number, number, number];
}

export interface SharedCreatureUniforms { uTime: Uniform<number> }

export function createSharedUniforms(): SharedCreatureUniforms {
  return { uTime: new Uniform(0) };
}

function uniformsFor(m: MotionUniforms, shared: SharedCreatureUniforms) {
  const v = (a: [number, number, number, number]) => new Uniform(new Vector4(a[0], a[1], a[2], a[3]));
  return { uTime: shared.uTime, uLeg: v(m.leg), uWave: v(m.wave), uBody: v(m.body), uMisc: v(m.misc), uRetract: v(m.retract) };
}

function patch(shader: WebGLProgramParametersWithUniforms, withNormal: boolean): void {
  shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + CREATURE_VERT_PARS);
  if (withNormal) {
    shader.vertexShader = shader.vertexShader
      .replace('#include <beginnormal_vertex>', CREATURE_BEGIN_NORMAL)
      .replace('#include <begin_vertex>', CREATURE_BEGIN_VERTEX)
      .replace('#include <color_vertex>', CREATURE_COLOR_VERTEX);
  } else {
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', CREATURE_DEPTH_BEGIN_VERTEX);
  }
}

export interface CreatureMatOptions {
  roughness: number; transparent?: boolean; opacity?: number; doubleSide?: boolean;
  /** Lies in an antlion pit: pit depth rule of shader/pitDepth.ts (pit from the instance). */
  pit?: boolean;
}

function patchPit(shader: WebGLProgramParametersWithUniforms, vertexChunk: string, vertexPars = ''): void {
  shader.uniforms.uPitBias = { value: PIT_DEPTH.biasMm };
  shader.uniforms.uPitK = { value: PIT_DEPTH.k };
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\n' + vertexPars + PIT_VERT_PARS)
    .replace('#include <project_vertex>', vertexChunk);
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\n' + PIT_FRAG_PARS)
    .replace('#include <clipping_planes_fragment>', PIT_FRAG_CLIP);
}

export function makeCreatureMaterial(m: MotionUniforms, shared: SharedCreatureUniforms, o: CreatureMatOptions): Material {
  const mat = new MeshStandardMaterial({
    vertexColors: true, roughness: o.roughness, metalness: 0, transparent: !!o.transparent, opacity: o.opacity ?? 1,
    depthWrite: !o.transparent,
  });
  // set after construction: passing `side: undefined` to the constructor makes three log a warning
  if (o.doubleSide || o.transparent) mat.side = DoubleSide;
  const u = uniformsFor(m, shared);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    patch(shader, true);
    if (o.pit) patchPit(shader, PIT_VERT_INSTANCE);
  };
  mat.customProgramCacheKey = () => `creature-${o.transparent ? 't' : 's'}${o.doubleSide ? 'd' : ''}${o.pit ? 'p' : ''}`;
  return mat;
}

/** The pit cone material (plain mesh): vertex colours, pit depth rule with per-mesh uniforms uPitC / uPitR. */
export function makePitMaterial(): { material: Material; uniforms: { uPitC: Uniform<Vector3>; uPitR: Uniform<number> } } {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0 });
  const uniforms = { uPitC: new Uniform(new Vector3()), uPitR: new Uniform(1) };
  mat.onBeforeCompile = (shader) => { Object.assign(shader.uniforms, uniforms); patchPit(shader, PIT_VERT_MESH, PIT_VERT_MESH_PARS); };
  mat.customProgramCacheKey = () => 'creature-pit-cone';
  return { material: mat, uniforms };
}

/** Shadow-pass material with the same deformation (otherwise shadows show the rest pose). */
export function makeCreatureDepthMaterial(m: MotionUniforms, shared: SharedCreatureUniforms): MeshDepthMaterial {
  const mat = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
  const u = uniformsFor(m, shared);
  mat.onBeforeCompile = (shader) => { Object.assign(shader.uniforms, u); patch(shader, false); };
  mat.customProgramCacheKey = () => 'creature-depth';
  return mat;
}
