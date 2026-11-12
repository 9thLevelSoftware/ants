// Debug terrain material: flat Lambert with vertex colours, plus two fragment discards: inside breach spheres
// (carved entrances open visibly, seed §4) and, for the coarse far mesh, inside the rectangle the fine patch
// covers (no z-fighting between the two grids).
import { MeshLambertMaterial, Vector4, type WebGLProgramParametersWithUniforms } from 'three';

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
uniform vec4 uCutRect;`)
      .replace('void main() {', `void main() {
  if (uCutRect.z > uCutRect.x && vDbgWorld.x > uCutRect.x && vDbgWorld.x < uCutRect.z && vDbgWorld.z > uCutRect.y && vDbgWorld.z < uCutRect.w) discard;
  for (int i = 0; i < ${MAX_HOLES}; i++) {
    if (i >= uHoleCount) break;
    vec3 d = vDbgWorld - uHoles[i].xyz;
    if (dot(d, d) < uHoles[i].w * uHoles[i].w) discard;
  }`);
  };
  m.customProgramCacheKey = () => `dbg-terrain-${opts.polygonOffset ? 1 : 0}`;
  return m;
}
