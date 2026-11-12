// Debug terrain material: flat Lambert with vertex colours, plus two fragment discards: inside breach spheres
// (carved entrances open visibly, seed §4) and, for the coarse far mesh, inside the rectangle the fine patch
// covers (no z-fighting between the two grids).
import { MeshLambertMaterial, Vector4, type WebGLProgramParametersWithUniforms } from 'three';
import type { Breach } from '@/sim/types';

/**
 * Drawn terrain holes are the breach spheres shrunk by this much (BU). The debug ground is a coarse triangle grid
 * and the cavity a marching-cubes surface, so the full sphere reached past the cavity's mouth at the rim and the
 * background showed through a thin seam; a slightly smaller hole is covered by cavity wall all round.
 */
export const HOLE_INSET_BU = 0.25;

/** Breach spheres passed to the shader (nearest to the camera subject). */
export const MAX_HOLES = 32;

export interface TerrainUniforms {
  uHoles: { value: Vector4[] };
  uHoleCount: { value: number };
  /** x0, z0, x1, z1 of the region to discard; x1 < x0 disables it. */
  uCutRect: { value: Vector4 };
}

export function makeTerrainUniforms(): TerrainUniforms {
  return {
    uHoles: { value: Array.from({ length: MAX_HOLES }, () => new Vector4(0, 0, 0, 0)) },
    uHoleCount: { value: 0 },
    uCutRect: { value: new Vector4(1, 1, 0, 0) },
  };
}

export function makeTerrainMaterial(u: TerrainUniforms, opts: { polygonOffset?: boolean } = {}): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  if (opts.polygonOffset) { m.polygonOffset = true; m.polygonOffsetFactor = 2; m.polygonOffsetUnits = 4; }
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDbgWorld;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDbgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vDbgWorld;
uniform vec4 uHoles[${MAX_HOLES}];
uniform int uHoleCount;
uniform vec4 uCutRect;
${IN_HOLE_GLSL}`)
      .replace('void main() {', `void main() {
  if (uCutRect.z > uCutRect.x && vDbgWorld.x > uCutRect.x && vDbgWorld.x < uCutRect.z && vDbgWorld.z > uCutRect.y && vDbgWorld.z < uCutRect.w) discard;
  if (dbgInHole(vDbgWorld)) discard;`);
  };
  m.customProgramCacheKey = () => `dbg-terrain-${opts.polygonOffset ? 1 : 0}`;
  return m;
}

export type HoleUniforms = Pick<TerrainUniforms, 'uHoles' | 'uHoleCount'>;

/**
 * The breach spheres nearest to (x, z), at most MAX_HOLES, into each uniform set, each shrunk by `inset` mm (the
 * drawn hole then stays inside the cavity's mouth: HOLE_INSET_BU).
 */
export function fillHoles(targets: readonly HoleUniforms[], breaches: readonly Breach[], x: number, z: number, inset = 0): void {
  let list = breaches;
  if (breaches.length > MAX_HOLES) {
    list = [...breaches].sort((a, b) => ((a.pos.x - x) ** 2 + (a.pos.z - z) ** 2) - ((b.pos.x - x) ** 2 + (b.pos.z - z) ** 2)).slice(0, MAX_HOLES);
  }
  for (const u of targets) {
    u.uHoleCount.value = list.length;
    list.forEach((b, i) => u.uHoles.value[i].set(b.pos.x, b.pos.y, b.pos.z, Math.max(0, b.r - inset)));
  }
}

/** GLSL: true when p lies inside one of the uHoles spheres (declare uHoles / uHoleCount first). */
export const IN_HOLE_GLSL = `
bool dbgInHole(vec3 p) {
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    if (i >= uHoleCount) break;
    vec3 d = p - uHoles[i].xyz;
    if (dot(d, d) < uHoles[i].w * uHoles[i].w) return true;
  }
  return false;
}`;
