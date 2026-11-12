// Terrain: clipmap levels of one shared grid geometry, a splat material over texture arrays, the hole mask that
// opens nest entrances, and the uploads of heights / material codes. Per frame only uniforms change (level
// origins follow the camera), plus budgeted hole-mask tiles while digging.
import { Group, Mesh, type BufferGeometry, type MeshStandardMaterial } from 'three';
import type { QualityPreset } from '@/render/app';
import { MaterialLibrary } from '../materials/materialLibrary';
import { buildTerrainArrays, type TerrainTextureArrays } from '../materials/textureArray';
import type { WorldUniforms } from '../materials/uniforms';
import type { TerrainSource } from '../lighting/simAdapter';
import { layoutClipmap, levelCountFor, type ClipmapLayout } from './clipmap';
import { HoleMask } from './holeMask';
import { buildLayerTable, createTerrainTextures, disposeTerrainTextures, sampleHeight, usedCodes, type TerrainLayerTable, type TerrainTextures } from './terrainData';
import { createGridGeometry } from './terrainGeometry';
import { createTerrainMaterial, type TerrainLevelUniforms } from './terrainMaterial';
import { HOLE_MASK_ATLAS_SLOTS, HOLE_MASK_TEXEL_BU, HOLE_MASK_TILE_TEXELS, TERRAIN_QUALITY } from './terrainQuality';

interface Level {
  mesh: Mesh;
  material: MeshStandardMaterial;
  u: TerrainLevelUniforms;
}

export class TerrainRenderer {
  readonly group = new Group();
  holeMask: HoleMask | null = null;
  private src: TerrainSource | null = null;
  private textures: TerrainTextures | null = null;
  private arrays: TerrainTextureArrays | null = null;
  private table: TerrainLayerTable | null = null;
  private geometry: BufferGeometry | null = null;
  private levels: Level[] = [];
  private layout: ClipmapLayout = { levels: [] };
  private quality: QualityPreset;

  constructor(private readonly lib: MaterialLibrary, private readonly uniforms: WorldUniforms, quality: QualityPreset) {
    this.group.name = 'world:terrain';
    this.quality = quality;
  }

  get source(): TerrainSource | null {
    return this.src;
  }

  /** Terrain height (bilinear, deformation tiles included), mm. */
  height(x: number, z: number): number {
    return this.src ? sampleHeight(this.src, x, z) : 0;
  }

  /** Builds everything for a world. Waits for the ground textures of the materials the world uses. */
  async setSource(src: TerrainSource): Promise<void> {
    this.disposeWorld();
    this.src = src;
    this.textures = createTerrainTextures(src);
    this.table = buildLayerTable(usedCodes(src.matCodes));
    await this.lib.ready(this.table.layerDefs.map((d) => d.id));
    if (this.src !== src) return; // replaced while loading
    this.buildArrays();
    this.holeMask = new HoleMask({
      worldSize: src.worldSize, texelMm: HOLE_MASK_TEXEL_BU * src.bu, tileTexels: HOLE_MASK_TILE_TEXELS, atlasSlots: HOLE_MASK_ATLAS_SLOTS,
    });
    this.buildLevels();
  }

  private buildArrays(): void {
    const tq = TERRAIN_QUALITY[this.quality.id];
    const cap = this.quality.maxTextureSize > 0 ? this.quality.maxTextureSize : tq.layerSize;
    const size = Math.min(tq.layerSize, cap);
    this.arrays?.albedoRough.dispose();
    this.arrays?.normalHeight.dispose();
    this.arrays = buildTerrainArrays(this.table!.layerDefs.map((d) => this.lib.layerSource(d)), size, this.quality.anisotropy);
  }

  private buildLevels(): void {
    for (const l of this.levels) { this.group.remove(l.mesh); l.material.dispose(); }
    this.levels = [];
    this.geometry?.dispose();
    const src = this.src!, tq = TERRAIN_QUALITY[this.quality.id];
    const n = tq.gridQuads;
    this.geometry = createGridGeometry(n);
    const spacing0 = src.cell * tq.spacingCells;
    const reach = Math.max(this.quality.drawDistanceBU * src.bu, src.worldSize * 0.75);
    const count = levelCountFor(spacing0, n, reach);
    for (let i = 0; i < count; i++) {
      const { material, level } = createTerrainMaterial({
        textures: this.textures!, arrays: this.arrays!, table: this.table!, holeMask: this.holeMask!.uniforms, world: this.uniforms,
      });
      const mesh = new Mesh(this.geometry, material);
      mesh.name = `world:terrain:L${i}`;
      mesh.frustumCulled = false;
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.group.add(mesh);
      this.levels.push({ mesh, material, u: level });
    }
    this.layout = { levels: [] };
  }

  setQuality(q: QualityPreset): void {
    const prev = this.quality;
    this.quality = q;
    if (!this.src || !this.textures) return;
    const a = TERRAIN_QUALITY[prev.id], b = TERRAIN_QUALITY[q.id];
    if (a.layerSize !== b.layerSize || prev.maxTextureSize !== q.maxTextureSize || prev.anisotropy !== q.anisotropy) {
      this.buildArrays();
      this.buildLevels();
    } else if (a.gridQuads !== b.gridQuads || a.spacingCells !== b.spacingCells || prev.drawDistanceBU !== q.drawDistanceBU) {
      this.buildLevels();
    }
  }

  /** Re-uploads heights after deformation tiles changed (same grid). */
  updateHeights(heights: Float32Array): void {
    if (!this.src || !this.textures) return;
    this.src.heights.set(heights);
    this.textures.height.needsUpdate = true;
  }

  /** Per frame: level origins follow the camera; budgeted hole-mask rasterisation. */
  update(camX: number, camZ: number): void {
    if (!this.src || !this.levels.length) return;
    const tq = TERRAIN_QUALITY[this.quality.id];
    layoutClipmap(camX, camZ, this.src.cell * tq.spacingCells, tq.gridQuads, this.levels.length, this.layout);
    for (let i = 0; i < this.levels.length; i++) {
      const l = this.levels[i], lv = this.layout.levels[i];
      l.u.uWrLevel.value.set(lv.originX, lv.originZ, lv.spacing, lv.n);
      l.u.uWrInner.value.set(lv.innerX0, lv.innerZ0, lv.innerX1, lv.innerZ1);
    }
    this.holeMask?.update(tq.holeTilesPerFrame, camX, camZ);
  }

  /** Triangles drawn per frame by the terrain (all levels). */
  get triangles(): number {
    const n = TERRAIN_QUALITY[this.quality.id].gridQuads;
    return this.levels.length * n * n * 2;
  }

  get levelCount(): number {
    return this.levels.length;
  }

  private disposeWorld(): void {
    for (const l of this.levels) { this.group.remove(l.mesh); l.material.dispose(); }
    this.levels = [];
    this.geometry?.dispose();
    this.geometry = null;
    if (this.textures) disposeTerrainTextures(this.textures);
    this.textures = null;
    this.arrays?.albedoRough.dispose();
    this.arrays?.normalHeight.dispose();
    this.arrays = null;
    this.holeMask?.dispose();
    this.holeMask = null;
  }

  /** Drops the current world (end of a game): nothing is drawn until the next setSource. */
  clear(): void {
    this.disposeWorld();
    this.src = null;
  }

  dispose(): void {
    this.clear();
  }
}
