// Runtime material library keyed by MaterialId: texture sets from the AssetLoader (never fetched here), procedural
// sets for materials without a scan, and cached MeshStandardMaterials for primitives. Other world renderers
// (decor, water, weather) take texture sets and surface materials from here so every surface shares one look.
import {
  DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshStandardMaterial, RepeatWrapping, RGBAFormat, SRGBColorSpace, UnsignedByteType,
  type Texture,
} from 'three';
import type { AssetLoader } from '@/render/assets';
import type { MaterialId } from '@/sim/types';
import { MATERIAL_DEFS, materialDef, type MaterialDef, type ProceduralLook } from './materialDefs';
import { proceduralPixels } from './procedural';
import type { LayerSource } from './textureArray';
import { applySurfacePatch, type BreachList, type SurfacePatchOptions } from './surfacePatch';
import type { WorldUniforms } from './uniforms';

export interface TextureSet {
  albedo: Texture;
  normal: Texture;
  rough: Texture;
  procedural: boolean;
}

const DEFAULT_LOOK: ProceduralLook = { base: '#7a6a58', alt: '#8a7a66', grain: 0.2, bump: 0.3, rough: 0.8 };
const proceduralSeed = (def: MaterialDef) => def.id.length * 131 + def.id.charCodeAt(0);

/** Edge of procedural textures, px. */
export const PROCEDURAL_TEXTURE_SIZE = 256;

/** Mapping variant of a surface material; `key` must name everything that changes the shader. */
export type SurfaceVariant = Omit<SurfacePatchOptions, 'def' | 'set' | 'uniforms' | 'breaches'> & { key: string };

export interface MaterialLibraryOptions {
  anisotropy: number;
}

export class MaterialLibrary {
  private sets = new Map<string, TextureSet>();
  private mats = new Map<string, MeshStandardMaterial>();
  private anisotropy: number;

  constructor(
    private readonly assets: AssetLoader | null,
    readonly uniforms: WorldUniforms,
    opts: MaterialLibraryOptions,
  ) {
    this.anisotropy = opts.anisotropy;
  }

  def(id: MaterialId | string): MaterialDef {
    return materialDef(id);
  }

  /** Manifest texture-set names the given materials need (all materials when omitted). */
  textureNames(ids?: readonly string[]): string[] {
    const list = ids ? ids.map((i) => materialDef(i)) : Object.values(MATERIAL_DEFS);
    return [...new Set(list.map((d) => d.texture).filter((t): t is string => !!t))];
  }

  /** Waits until the scanned textures of these materials are decoded (placeholders on failure, never rejects). */
  async ready(ids?: readonly string[]): Promise<void> {
    if (!this.assets) return;
    await this.assets.init();
    const names = this.textureNames(ids);
    await Promise.all(names.flatMap((n) => ['albedo', 'normal', 'rough'].map((m) => this.assets!.textureAsync(n, m))));
  }

  /** Texture set of a material (cached; scanned set when available, procedural otherwise). */
  textureSet(def: MaterialDef): TextureSet {
    const key = def.texture ?? `proc:${def.id}`;
    let s = this.sets.get(key);
    if (s) return s;
    if (def.texture && this.assets) {
      s = {
        albedo: this.assets.texture(def.texture, 'albedo'), normal: this.assets.texture(def.texture, 'normal'),
        rough: this.assets.texture(def.texture, 'rough'), procedural: false,
      };
    } else {
      s = this.proceduralSet(def);
    }
    this.sets.set(key, s);
    return s;
  }

  private proceduralSet(def: MaterialDef): TextureSet {
    const px = proceduralPixels(def.procedural ?? DEFAULT_LOOK, PROCEDURAL_TEXTURE_SIZE, proceduralSeed(def));
    const mk = (data: Uint8Array, srgb: boolean): Texture => {
      const t = new DataTexture(data, px.size, px.size, RGBAFormat, UnsignedByteType);
      t.wrapS = t.wrapT = RepeatWrapping;
      t.magFilter = LinearFilter;
      t.minFilter = LinearMipmapLinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = this.anisotropy;
      if (srgb) t.colorSpace = SRGBColorSpace;
      t.needsUpdate = true;
      return t;
    };
    return { albedo: mk(px.albedo, true), normal: mk(px.normal, false), rough: mk(px.rough, false), procedural: true };
  }

  /**
   * A cached surface material for a material id and mapping variant. `variant` names the geometry kind that the
   * patch expects (see SurfacePatchOptions), so primitives of different shape families never share a program.
   */
  surfaceMaterial(id: MaterialId | string, variant: SurfaceVariant, breaches?: BreachList): MeshStandardMaterial {
    return this.surfaceMaterialFor(materialDef(id), variant, breaches);
  }

  /** As surfaceMaterial, for a def that is not a library row (mound soil, tuned variants). Cached by id + key. */
  surfaceMaterialFor(def: MaterialDef, variant: SurfaceVariant, breaches?: BreachList): MeshStandardMaterial {
    const key = `${def.id}|${variant.key}`;
    let m = this.mats.get(key);
    if (m) return m;
    m = new MeshStandardMaterial({ color: 0xffffff, roughness: def.roughness, metalness: def.metalness });
    m.name = `world:${key}`;
    applySurfacePatch(m, { ...variant, def, set: this.textureSet(def), uniforms: this.uniforms, breaches });
    this.mats.set(key, m);
    return m;
  }

  /** Source of a terrain texture-array layer (decoded images of the scanned set, or procedural pixels). */
  layerSource(def: MaterialDef): LayerSource {
    if (def.texture && this.assets) {
      const img = (m: string) => (this.assets!.texture(def.texture!, m).image ?? null) as CanvasImageSource | null;
      return { kind: 'images', albedo: img('albedo'), normal: img('normal'), rough: img('rough') };
    }
    const look = def.procedural ?? DEFAULT_LOOK;
    return { kind: 'pixels', set: proceduralPixels(look, PROCEDURAL_TEXTURE_SIZE, proceduralSeed(def)) };
  }

  setAnisotropy(n: number): void {
    this.anisotropy = n;
    for (const s of this.sets.values()) {
      if (!s.procedural) continue; // scanned textures follow AssetLoader.setAnisotropy
      for (const t of [s.albedo, s.normal, s.rough]) { t.anisotropy = n; t.needsUpdate = true; }
    }
  }

  dispose(): void {
    for (const m of this.mats.values()) m.dispose();
    for (const s of this.sets.values()) if (s.procedural) { s.albedo.dispose(); s.normal.dispose(); s.rough.dispose(); }
    this.mats.clear();
    this.sets.clear();
  }
}
