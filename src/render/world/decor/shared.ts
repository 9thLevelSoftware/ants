// Uniforms shared by the decor materials: the world renderer's uniforms (time, wind, wetness, camera, subject,
// dapple), the drape, the terrain hole mask (copied by value each frame, so nest entrances stay open through
// draped decor and grass), and the decor's own season / density / bias values.
import { DataTexture, RedFormat, RGFormat, Uniform, UnsignedByteType, Vector2, Vector3, Vector4, type Texture } from 'three';
import type { HoleMaskUniforms } from '../terrain/holeMask';
import type { WorldUniforms } from '../materials/uniforms';
import { createDrapeUniforms, type DrapeUniforms } from './drapeGpu';

export interface DecorUniforms {
  /** Keep factor per kind group: x leaves, y petals, z other, w quality density. */
  uDcKeep: Uniform<Vector4>;
  /** Draped LOD: x full-density distance mm, y power. */
  uDcLod: Uniform<Vector4>;
  uDcFresh: Uniform<number>;
  uDcBu: Uniform<number>;
  /** Depth bias: x linear k, y depth-step k (units / (near x 2^24)). */
  uDcBias: Uniform<Vector2>;
  /** Per-fragment depth correction: x max distance mm. */
  uDcFix: Uniform<Vector4>;
  /** Season tints: dry rgb + saturation, fresh rgb. */
  uDcDry: Uniform<Vector4>;
  uDcFreshTint: Uniform<Vector3>;
  /** Grass: wind radians, parting on/off, LOD (full mm, pow, density, max widen), parting params, eye fade. */
  uGrWind: Uniform<number>;
  uGrPart: Uniform<number>;
  uGrLod: Uniform<Vector4>;
  uGrPartP: Uniform<Vector4>;
  uGrEye: Uniform<Vector2>;
  /** Dew level 0..1 and droplet visibility. */
  uDew: Uniform<number>;
  /** Thin-foliage transmission gain. */
  uTransl: Uniform<number>;
  /** Wind direction in XZ (copied from the world uniforms, or set directly without a world renderer). */
  uWindDir: Uniform<Vector2>;
}

export interface HoleUniforms {
  tHoleIdx: Uniform<Texture>;
  tHoleAtlas: Uniform<Texture>;
  uHoleP: Uniform<Vector4>;
}

export interface DecorShared {
  world: WorldUniforms;
  drape: DrapeUniforms;
  hole: HoleUniforms;
  decor: DecorUniforms;
}

function tiny(format: typeof RedFormat | typeof RGFormat, ch: number): DataTexture {
  const t = new DataTexture(new Uint8Array(ch), 1, 1, format, UnsignedByteType);
  t.needsUpdate = true;
  return t;
}

export function createDecorShared(world: WorldUniforms): DecorShared {
  return {
    world,
    drape: createDrapeUniforms(),
    // uHoleP.y = 0 tiles: wrHoleMask returns 0 until a terrain hole mask is linked
    hole: { tHoleIdx: new Uniform(tiny(RGFormat, 2)), tHoleAtlas: new Uniform(tiny(RedFormat, 1)), uHoleP: new Uniform(new Vector4(1, 0, 1, 1)) },
    decor: {
      uDcKeep: new Uniform(new Vector4(1, 0, 1, 1)),
      uDcLod: new Uniform(new Vector4(480, 1.2, 0, 0)),
      uDcFresh: new Uniform(0.1),
      uDcBu: new Uniform(4),
      uDcBias: new Uniform(new Vector2(2.5e-4, 0)),
      uDcFix: new Uniform(new Vector4(600, 0, 0, 0)),
      uDcDry: new Uniform(new Vector4(0.86, 0.8, 0.7, 0.9)),
      uDcFreshTint: new Uniform(new Vector3(0.85, 0.95, 0.75)),
      uGrWind: new Uniform(0.08),
      uGrPart: new Uniform(1),
      uGrLod: new Uniform(new Vector4(280, 1.6, 1, 2.4)),
      uGrPartP: new Uniform(new Vector4(4, 0.25, 6, 6)),
      uGrEye: new Uniform(new Vector2(8, 20)),
      uDew: new Uniform(0),
      uTransl: new Uniform(1),
      uWindDir: new Uniform(new Vector2(0.8, -0.6)),
    },
  };
}

/** Copies the terrain hole mask's current textures into the decor's uniforms (call when it may have changed). */
export function linkHoleMask(h: HoleUniforms, src: HoleMaskUniforms | null): void {
  if (!src) { h.uHoleP.value.set(1, 0, 1, 1); return; }
  h.tHoleIdx.value = src.tHoleIdx.value;
  h.tHoleAtlas.value = src.tHoleAtlas.value;
  h.uHoleP.value.copy(src.uHoleP.value);
}
