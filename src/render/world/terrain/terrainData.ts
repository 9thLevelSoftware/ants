// GPU data of the terrain: height texture (R32F, sampled with texelFetch in the vertex shader), surface material
// codes (R8, one texel per material cell), terrain holes (R8), and the table that maps a material code to a texture
// array layer and its look parameters (uniform arrays indexed by code).
import { DataTexture, FloatType, NearestFilter, RedFormat, UnsignedByteType, Uniform, Vector4 } from 'three';
import { MATERIAL_IDS } from '@/sim/types';
import { materialDef, type MaterialDef } from '../materials/materialDefs';
import type { TerrainSource } from '../lighting/simAdapter';

/** Uniform array length for per-material-code parameters (>= MATERIAL_IDS.length). */
export const MAT_SLOTS = 32;

export interface TerrainLayerTable {
  /** Material defs in layer order (one texture-array layer each, deduplicated by texture set + tint). */
  layerDefs: MaterialDef[];
  /** Per material code: layer, mm per tile, normal scale, roughness multiplier. */
  matA: Vector4[];
  /** Per material code: linear tint rgb, wet darkening. */
  matB: Vector4[];
  /** Per material code: wet roughness floor, dual-scale factor, border jitter, roughness floor. */
  matC: Vector4[];
}

/** Distinct material codes present in a byte map (unknown codes map to loam). */
export function usedCodes(codes: Uint8Array): number[] {
  const seen = new Uint8Array(256);
  for (let i = 0; i < codes.length; i++) seen[codes[i]] = 1;
  const out: number[] = [];
  for (let c = 0; c < 256; c++) if (seen[c]) out.push(c < MATERIAL_IDS.length ? c : 0);
  return [...new Set(out)];
}

/** Layer table for the given material codes: materials sharing a texture set share a layer (tint differs per code). */
export function buildLayerTable(codes: number[]): TerrainLayerTable {
  const layerDefs: MaterialDef[] = [];
  const layerOfKey = new Map<string, number>();
  const matA: Vector4[] = [], matB: Vector4[] = [], matC: Vector4[] = [];
  for (let c = 0; c < MAT_SLOTS; c++) { matA.push(new Vector4(0, 95, 1, 1)); matB.push(new Vector4(1, 1, 1, 0.6)); matC.push(new Vector4(0.5, 0, 1, 0)); }
  const all = codes.length ? codes : [0];
  for (const code of all) {
    const def = materialDef(MATERIAL_IDS[code] ?? 'loam');
    const key = def.texture ?? `proc:${def.id}`;
    let layer = layerOfKey.get(key);
    if (layer === undefined) { layer = layerDefs.length; layerDefs.push(def); layerOfKey.set(key, layer); }
    matA[code].set(layer, def.scaleMm, def.normalScale, def.roughness);
    matB[code].set(def.tint[0], def.tint[1], def.tint[2], def.wetDarken);
    matC[code].set(def.wetRough, def.dualScale, def.edgeJitter, def.roughMin);
  }
  // codes not present in the map still point at a valid layer (layer 0)
  return { layerDefs, matA, matB, matC };
}

export interface TerrainTextures {
  height: DataTexture;
  material: DataTexture;
  holes: DataTexture;
  uniforms: {
    tWrHeight: Uniform<DataTexture>;
    tWrMat: Uniform<DataTexture>;
    tWrHoles: Uniform<DataTexture>;
    /** x height cell mm, y nx, z nz, w world size mm. */
    uWrHf: Uniform<Vector4>;
    /** x material cell mm, y nx, z nz, w terrain-hole cell mm. */
    uWrMatGrid: Uniform<Vector4>;
    /** x, y hole map nx / nz; z = 1 when the world has terrain holes. */
    uWrHoleGrid: Uniform<Vector4>;
  };
}

function nearest(t: DataTexture): DataTexture {
  t.magFilter = t.minFilter = NearestFilter;
  t.generateMipmaps = false;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

export function createTerrainTextures(src: TerrainSource): TerrainTextures {
  const height = nearest(new DataTexture(src.heights, src.nx, src.nz, RedFormat, FloatType));
  const material = nearest(new DataTexture(src.matCodes, src.matNx, src.matNz, RedFormat, UnsignedByteType));
  const holeData = src.holes ? src.holes.data : new Uint8Array(1);
  const holes = nearest(new DataTexture(holeData, src.holes ? src.holes.nx : 1, src.holes ? src.holes.nz : 1, RedFormat, UnsignedByteType));
  return {
    height, material, holes,
    uniforms: {
      tWrHeight: new Uniform(height),
      tWrMat: new Uniform(material),
      tWrHoles: new Uniform(holes),
      uWrHf: new Uniform(new Vector4(src.cell, src.nx, src.nz, src.worldSize)),
      uWrMatGrid: new Uniform(new Vector4(src.matCell, src.matNx, src.matNz, src.holes ? src.holes.cell : 1)),
      uWrHoleGrid: new Uniform(new Vector4(src.holes ? src.holes.nx : 1, src.holes ? src.holes.nz : 1, src.holes ? 1 : 0, 0)),
    },
  };
}

export function disposeTerrainTextures(t: TerrainTextures): void {
  t.height.dispose();
  t.material.dispose();
  t.holes.dispose();
}

/** Bilinear height on the CPU (same as the shader and the kernel's heightAt). */
export function sampleHeight(src: Pick<TerrainSource, 'cell' | 'nx' | 'nz' | 'heights'>, x: number, z: number): number {
  const fx = Math.min(src.nx - 1, Math.max(0, x / src.cell)), fz = Math.min(src.nz - 1, Math.max(0, z / src.cell));
  const ix = Math.min(src.nx - 2, Math.floor(fx)), iz = Math.min(src.nz - 2, Math.floor(fz));
  const tx = fx - ix, tz = fz - iz, h = src.heights, n = src.nx;
  if (src.nx < 2 || src.nz < 2) return h[0] ?? 0;
  const a = h[iz * n + ix], b = h[iz * n + ix + 1], c = h[(iz + 1) * n + ix], d = h[(iz + 1) * n + ix + 1];
  return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz;
}
