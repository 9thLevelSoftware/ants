// GPU side of the drape (drape.ts): the height texture (R32F, texelFetch only, so no float filtering is needed)
// and the clipmap level uniforms, refreshed per frame from the camera exactly as the terrain lays out its levels.
import { DataTexture, FloatType, NearestFilter, RedFormat, Uniform, Vector4 } from 'three';
import type { QualityPreset } from '@/render/app';
import type { ClipmapLayout } from '../terrain/clipmap';
import type { TerrainSource } from '../lighting/simAdapter';
import { clipmapParams, drapeLayout, DRAPE_MAX_LEVELS } from './drape';

export interface DrapeUniforms {
  tDrH: Uniform<DataTexture | null>;
  uDrHf: Uniform<Vector4>;
  uDrLv: Uniform<Vector4[]>;
  uDrCount: Uniform<number>;
}

export function createDrapeUniforms(): DrapeUniforms {
  return {
    tDrH: new Uniform(null),
    uDrHf: new Uniform(new Vector4(16, 2, 2, 0)),
    uDrLv: new Uniform(Array.from({ length: DRAPE_MAX_LEVELS }, () => new Vector4(0, 0, 1, 2))),
    uDrCount: new Uniform(1),
  };
}

export class DrapeGpu {
  readonly uniforms = createDrapeUniforms();
  readonly layout: ClipmapLayout = { levels: [] };
  private tex: DataTexture | null = null;
  private src: TerrainSource | null = null;
  private params = { spacing0: 8, n: 64, levels: 1 };

  setSource(src: TerrainSource, q: QualityPreset): void {
    this.tex?.dispose();
    this.src = src;
    const t = new DataTexture(src.heights, src.nx, src.nz, RedFormat, FloatType);
    t.magFilter = t.minFilter = NearestFilter;
    t.generateMipmaps = false;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    this.tex = t;
    this.uniforms.tDrH.value = t;
    this.uniforms.uDrHf.value.set(src.cell, src.nx, src.nz, src.worldSize);
    this.setQuality(q);
  }

  setQuality(q: QualityPreset): void {
    if (!this.src) return;
    this.params = clipmapParams(this.src, q);
    this.uniforms.uDrCount.value = Math.min(DRAPE_MAX_LEVELS, this.params.levels);
  }

  /** Heights changed in place (deformation tiles): re-upload. */
  heightsChanged(): void {
    if (this.tex) this.tex.needsUpdate = true;
  }

  /** Per frame: the levels follow the camera like the terrain's. */
  update(camX: number, camZ: number): void {
    if (!this.src) return;
    drapeLayout(camX, camZ, this.params, this.layout);
    const lv = this.uniforms.uDrLv.value;
    this.layout.levels.forEach((l, i) => { if (i < DRAPE_MAX_LEVELS) lv[i].set(l.originX, l.originZ, l.spacing, l.n); });
  }

  dispose(): void {
    this.tex?.dispose();
    this.tex = null;
    this.uniforms.tDrH.value = null;
    this.src = null;
  }
}
