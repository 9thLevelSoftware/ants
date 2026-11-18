// DecorRenderer: the visual-only layers of the surface world (GDD 04 §9, §13): grass (vegetation/), draped decor
// (leaves, needles, petals, litter, grit, fine mulch and pebbles, moss in joints), dew on blades, and water
// surfaces (water/). `init(ctx, link?)`, `setWorld(world, sim?)`, `update(frame)`, `dispose()`.
//
// It reuses the world renderer's shared uniforms (time, wind, wetness, camera, subject, dapple), its environment
// sample (season, wind) and its terrain hole mask when a `link` (the WorldRenderer) is given, and never edits it.
// Decor is streamed per block around the camera on a time budget; a block's records are deterministic (hash of
// seed, layer, tile), so a revisited block is identical (blockHashes() / stats().revisitMismatches prove it).
// A change of the dynamic world (deformation, sward height, moved or dynamic primitives: worldWatch.ts) rebuilds
// only the blocks it touches, and the old block stays drawn until its replacement is ready.
//
// Integration: setQuality must be called together with the WorldRenderer's (the drape reproduces the terrain's
// clipmap levels, whose count follows the preset's draw distance); the camera position is read with
// getWorldPosition, as the terrain does, so the order of the two update() calls does not matter.
import { Group, Vector3, type PerspectiveCamera } from 'three';
import type { QualityPreset } from '@/render/app';
import type { Sim, WorldData } from '@/sim/types';
import type { EnvSample } from '../lighting/simAdapter';
import type { WorldFrame, WorldRenderContext } from '../lighting/types';
import { createWorldUniforms, type WorldUniforms } from '../materials/uniforms';
import type { HoleMaskUniforms } from '../terrain/holeMask';
import { bladeGeometry, createGrassMaterials } from '../vegetation/grassMaterial';
import { createDewMaterial, dropletGeometry, DROP_STRIDE } from '../vegetation/dew';
import { grassLodKeep } from '../vegetation/bladeShape';
import { WaterRenderer } from '../water/waterRenderer';
import type { WaterInputs } from '../water/waterSurfaces';
import { cardGeometry } from './cardGeometry';
import { DecorBlock, type BaseGeometry } from './decorBlock';
import { loadDecorTextures, type DecorTextureSet } from './decorTextures';
import { DrapeGpu } from './drapeGpu';
import { createDrapedMaterial } from './drapedMaterial';
import { createMossMaterial } from './mossMaterial';
import { MOSS_PATCH_INDICES } from './primMoss';
import { GroundView } from './ground';
import { BLADE_RANK, BLADE_STRIDE, countBelow, DRAPED_RANK, DRAPED_STRIDE } from './instances';
import { decorSeason, LEAF_MAX_DENSITY, type DecorSeason } from './season';
import { createDecorShared, linkHoleMask, type DecorShared } from './shared';
import { blockKeysOverlapping, blocksAround, rectDistance } from './tiles';
import { WorldWatch, type Rect } from './worldWatch';
import {
  DECOR_BUDGET_MS, DECOR_CHANGE_MARGIN_MM, DECOR_DISPOSE_K, DECOR_QUALITY_FACTOR, DECOR_RADIUS_MM, DECOR_WATCH_FRAMES,
  DECOR_LEAF, DEW, DRAPE, GRASS, NEAR_GROUND, PARTING, WIND,
} from './tuning';
import { QUALITY_PRESETS } from '@/render/app';

/** What DecorRenderer reads from the world renderer (structurally: a WorldRenderer instance fits). */
export interface DecorLink {
  uniforms: WorldUniforms;
  env?: EnvSample;
  terrain?: { holeMask: { uniforms: HoleMaskUniforms } | null };
}

/** Per-frame inputs: a WorldFrame plus optional overrides (demo flags, weather renderer, photo mode). */
export interface DecorFrame extends WorldFrame {
  /** Year fraction 0..1 (season); default: the linked environment's. */
  yearFrac?: number;
  /** Dew level 0..1; default: the simulation's weather.dew.level. */
  dew?: number;
  /** Wind at 2 m, m/s; default: the linked environment's. */
  windMs?: number;
  /** Frost: no sway (GDD 08 11.4). */
  still?: boolean;
  /** 0 by day .. 1 at night (LightingState.nightW): the leaves' albedo follows it (DECOR_LEAF.nightAlbedo). Absent = day. */
  nightW?: number;
}

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class DecorRenderer {
  readonly name = 'decor';
  readonly group = new Group();
  shared!: DecorShared;
  private ctx!: WorldRenderContext;
  private link: DecorLink | null = null;
  private tex: DecorTextureSet | null = null;
  private mats!: { grass: ReturnType<typeof createGrassMaterials>; draped: ReturnType<typeof createDrapedMaterial>; dew: ReturnType<typeof createDewMaterial>; moss: ReturnType<typeof createMossMaterial> };
  private bladeBase: { near: BaseGeometry; far: BaseGeometry } | null = null;
  private cardBase: BaseGeometry[] = [];
  private dropBase!: BaseGeometry;
  private readonly drape = new DrapeGpu();
  private water!: WaterRenderer;
  private ground: GroundView | null = null;
  private sim: Sim | null = null;
  private readonly blocks = new Map<number, DecorBlock>();
  private readonly seenHashes = new Map<number, number>();
  private revisitMismatches = 0;
  private generated = 0;
  private rebuilt = 0;
  /** Live blocks whose world changed: rebuilt (nearest first, on the budget) while the old one stays drawn. */
  private readonly dirty = new Set<number>();
  private watch: WorldWatch | null = null;
  private frameNo = 0;
  private readonly camPos = new Vector3();
  private season: DecorSeason = decorSeason(0.3);
  private waterInputs: WaterInputs = { bodyLevelScale: 1, puddleMm: null };
  private dewOverride: number | null = null;
  private seasonOverride: number | null = null;
  private lastCam = { x: 0, z: 0 };

  async init(ctx: WorldRenderContext, link: DecorLink | null = null): Promise<void> {
    this.ctx = ctx;
    this.link = link;
    this.group.name = 'decor';
    this.shared = createDecorShared(link?.uniforms ?? createWorldUniforms());
    Object.assign(this.shared.drape, this.drape.uniforms);
    this.tex = await loadDecorTextures(ctx.assets);
    this.mats = {
      grass: createGrassMaterials(this.shared, this.tex.grassStrip),
      draped: createDrapedMaterial(this.shared, this.tex.draped),
      dew: createDewMaterial(this.shared),
      moss: createMossMaterial(this.shared, this.tex.draped.moss),
    };
    this.water = new WaterRenderer(this.shared);
    const d = dropletGeometry();
    this.dropBase = { position: d.getAttribute('position') as BaseGeometry['position'], normal: d.getAttribute('normal') as BaseGeometry['position'], index: d.getIndex()!, tris: d.getIndex()!.count / 3 };
    this.buildBases(ctx.quality);
    this.group.add(this.water.group);
    ctx.scene.add(this.group);
  }

  private buildBases(q: QualityPreset): void {
    const rows = GRASS.rows[q.id], folded = GRASS.folded[q.id];
    this.bladeBase = { near: bladeGeometry(rows, folded), far: bladeGeometry(Math.max(2, Math.ceil(rows / 2)), false) };
    this.cardBase = DRAPE.lodGrid.map(([u, v]) => cardGeometry(u, v));
  }

  /** Builds the decor for a world (blocks then stream in as the camera moves). */
  setWorld(world: WorldData, sim: Sim | null = null): void {
    this.clearBlocks();
    this.seenHashes.clear();
    this.revisitMismatches = 0;
    this.sim = sim;
    this.ground = new GroundView(world, sim);
    this.drape.setSource(this.ground.src, this.ctx.quality);
    this.shared.decor.uDcBu.value = world.bu;
    // the ground already holds the sim's heights and sward; primitives are brought up to date here
    this.watch = new WorldWatch(world);
    this.watch.heightTiles(sim);
    this.watch.swardCells(sim);
    this.watch.prims(sim, this.ground.prims);
    this.water.reset();
  }

  /** The game ended (render-integration wiring): drops every block, the ground and the water; nothing is drawn until the next setWorld. */
  clearWorld(): void {
    this.clearBlocks();
    this.seenHashes.clear();
    this.ground = null;
    this.watch = null;
    this.sim = null;
    this.drape.dispose(); // frees the height texture; setSource rebuilds it
    this.water?.reset();
  }

  setQuality(q: QualityPreset): void {
    this.ctx.quality = q;
    this.drape.setQuality(q);
    this.buildBases(q);
  }

  /** Water inputs (weather renderer, demo): level multiplier of every body, uniform puddle depth (null = sim). */
  setWater(inputs: Partial<WaterInputs>): void {
    this.waterInputs = { ...this.waterInputs, ...inputs };
  }

  /** Dew and season overrides (null = follow the simulation / environment). */
  setDew(level: number | null): void { this.dewOverride = level; }
  setSeason(yearFrac: number | null): void { this.seasonOverride = yearFrac; }

  /** Without a linked world renderer the decor owns the shared wetness uniform. */
  setWetness(w: number): void { if (!this.link) this.shared.world.uWet.value = Math.min(1, Math.max(0, w)); }

  // ---------------------------------------------------------------------------------------------------- per frame

  update(frame: DecorFrame): void {
    const g = this.ground;
    if (!g) return;
    this.frameNo++;
    const cam = this.ctx.camera, q = this.ctx.quality;
    const sim = frame.sim ?? this.sim;
    if (sim !== this.sim) { this.sim = sim ?? null; g.setSim(this.sim); }
    const { x: cx, y: cy, z: cz } = cam.getWorldPosition(this.camPos);
    this.lastCam = { x: cx, z: cz };
    this.syncUniforms(frame, cam, cx, cy, cz);
    this.drape.update(cx, cz);
    if (this.link?.terrain) linkHoleMask(this.shared.hole, this.link.terrain.holeMask?.uniforms ?? null);
    this.watchWorldChanges();
    this.stream(cx, cz, q, false);
    this.applyLod(cx, cz, q);
    this.water.update(g, this.sim, this.waterInputs);
  }

  private syncUniforms(frame: DecorFrame, cam: PerspectiveCamera, cx: number, cy: number, cz: number): void {
    const s = this.shared, d = s.decor, w = s.world, bu = this.ground!.bu, q = this.ctx.quality;
    if (!this.link) {
      w.uTime.value = frame.time;
      w.uCamPos.value.set(cx, cy, cz);
      if (frame.subject) w.uSubject.value.set(frame.subject.x, frame.subject.y, frame.subject.z);
    }
    const env = this.link?.env;
    this.season = decorSeason(this.seasonOverride ?? frame.yearFrac ?? env?.yearFrac ?? 0.3);
    const windMs = frame.windMs ?? env?.wind ?? 1.5;
    d.uGrWind.value = frame.still || env?.weather === 'frost' ? 0 : Math.min(WIND.maxRad, Math.max(WIND.minRad, windMs * WIND.radPerMs));
    d.uWindDir.value.copy(w.uWindDir.value);
    d.uGrPart.value = frame.subject ? 1 : 0;
    const qd = this.densityFactor(q, 'grass'), ql = this.densityFactor(q, 'litter');
    d.uGrLod.value.set(GRASS.lodFullMm, GRASS.lodPow, qd, GRASS.lodMaxWiden);
    d.uGrPartP.value.set(PARTING.bendBU * bu, PARTING.bendHeightK, PARTING.rayFadeBU * bu, PARTING.beyondBU * bu);
    d.uGrEye.value.set(PARTING.eyeNearBU * bu, PARTING.eyeFarBU * bu);
    const se = this.season;
    d.uDcKeep.value.set(se.leafDensity / LEAF_MAX_DENSITY, se.petals, 1, ql);
    d.uDcLod.value.set(DRAPE.lodFullMm, DRAPE.lodPow, 0, 0);
    d.uDcFresh.value = se.freshShare;
    // a pale dry leaf under the moon would be the brightest thing in a dark scene (look-pass-3 review): the leaf albedo follows the night weight
    const n = Math.min(1, Math.max(0, frame.nightW ?? 0)), kd = 1 + (DECOR_LEAF.nightAlbedo.dry - 1) * n, kf = 1 + (DECOR_LEAF.nightAlbedo.fresh - 1) * n;
    d.uDcDry.value.set(se.dryTint[0] * kd, se.dryTint[1] * kd, se.dryTint[2] * kd, se.saturation);
    d.uDcFreshTint.value.set(se.freshTint[0] * kf, se.freshTint[1] * kf, se.freshTint[2] * kf);
    d.uDcBias.value.set(DRAPE.viewBiasLinK, DRAPE.viewBiasDepthUnits / (Math.max(cam.near, 1e-3) * 16777216));
    d.uDcFix.value.set(DRAPE.resolveMm, 0, 0, 0);
    const simDew = (this.sim?.state.env as { weather?: { dew?: { level?: number } } } | undefined)?.weather?.dew?.level;
    d.uDew.value = Math.min(1, Math.max(0, this.dewOverride ?? frame.dew ?? simDew ?? 0));
  }

  /** GDD 04 §9 quality factor x the preset's density relative to its default (the Settings slider). */
  private densityFactor(q: QualityPreset, kind: 'grass' | 'litter'): number {
    const base = QUALITY_PRESETS[q.id].density[kind];
    return DECOR_QUALITY_FACTOR[q.id] * (base > 0 ? q.density[kind] / base : 1);
  }

  /** Marks the blocks touched by the dynamic world's changes since the last look (worldWatch.ts). */
  private watchWorldChanges(): void {
    const g = this.ground!, w = this.watch!;
    const tiles = w.heightTiles(this.sim);
    if (tiles.length) {
      for (const t of tiles) g.applyHeightTile(t.tileIndex, t.data);
      this.drape.heightsChanged();
      this.markChanged(tiles.map((t) => w.tileRect(t.tileIndex)), DECOR_CHANGE_MARGIN_MM.ground);
    }
    if (this.frameNo % DECOR_WATCH_FRAMES === 0) {
      this.markChanged(w.swardCells(this.sim), DECOR_CHANGE_MARGIN_MM.ground);
      this.markChanged(w.prims(this.sim, g.prims), DECOR_CHANGE_MARGIN_MM.prims);
    }
  }

  private markChanged(rects: readonly Rect[], m: number): void {
    if (!rects.length) return;
    const g = this.ground!, keys = new Set<number>();
    for (const r of rects) blockKeysOverlapping({ x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m }, g.world.size, g.bu, keys);
    for (const k of keys) {
      this.seenHashes.delete(k); // its records legitimately change: not a revisit mismatch
      if (this.blocks.has(k)) this.dirty.add(k);
    }
  }

  /** Streaming radius, mm: physical (tuning.ts), capped by the preset's draw distance. */
  private radiusMm(q: QualityPreset): number {
    return Math.min(DECOR_RADIUS_MM[q.id], q.drawDistanceBU * this.ground!.bu);
  }

  /**
   * Generates wanted blocks nearest first within the time budget (`all` ignores it), rebuilds changed ones (the old
   * block is drawn until then) and disposes far ones (every block when the radius is 0: the `test` preset).
   */
  private stream(cx: number, cz: number, q: QualityPreset, all: boolean): void {
    const g = this.ground!, r = this.radiusMm(q);
    for (const [key, b] of this.blocks) {
      if (r <= 0 || rectDistance(cx, cz, b.ref) > r * DECOR_DISPOSE_K) { b.dispose(); this.blocks.delete(key); this.dirty.delete(key); }
    }
    if (r <= 0) return;
    const t0 = now();
    for (const { ref } of blocksAround(cx, cz, r, g.world.size, g.bu)) {
      const old = this.blocks.get(ref.key);
      if (old && !this.dirty.has(ref.key)) continue;
      if (!all && this.generated > 0 && now() - t0 > DECOR_BUDGET_MS) break;
      const b = new DecorBlock(ref, g, { grass: this.mats.grass.main, grassDepth: this.mats.grass.depth, draped: this.mats.draped, moss: this.mats.moss });
      this.generated++;
      if (old) { old.dispose(); this.dirty.delete(ref.key); this.rebuilt++; }
      const prev = this.seenHashes.get(ref.key);
      if (prev !== undefined && prev !== b.hash) this.revisitMismatches++;
      this.seenHashes.set(ref.key, b.hash);
      for (const m of b.meshes()) this.group.add(m);
      this.blocks.set(ref.key, b);
    }
  }

  private applyLod(cx: number, cz: number, q: QualityPreset): void {
    const g = this.ground!, d = this.shared.decor;
    const qd = d.uGrLod.value.z, keepSeason = Math.max(d.uDcKeep.value.x, d.uDcKeep.value.y, d.uDcKeep.value.z), keepMax = keepSeason * d.uDcKeep.value.w;
    const qm = this.densityFactor(q, 'litter');
    const dew = d.uDew.value;
    for (const b of this.blocks.values()) {
      const dist = rectDistance(cx, cz, b.ref);
      const near = dist < GRASS.nearBlockMm;
      // within the near-ground floor the block draws the floor's share (the shader fades each blade/card out by its own distance)
      const nearBlock = dist < 2 * NEAR_GROUND.mm;
      const gk = (nearBlock ? Math.max(qd, NEAR_GROUND.grass) : qd) * grassLodKeep(dist);
      b.setGrass(countBelow(b.grass, BLADE_STRIDE, BLADE_RANK, gk), near ? this.bladeBase!.near : this.bladeBase!.far, near && q.shadows.enabled);
      const dk = (nearBlock ? Math.max(keepMax, NEAR_GROUND.litter * keepSeason) : keepMax) * (dist <= DRAPE.lodFullMm ? 1 : Math.pow(DRAPE.lodFullMm / dist, DRAPE.lodPow));
      const lod = dist < DRAPE.lodMm[0] ? 0 : dist < DRAPE.lodMm[1] ? 1 : 2;
      b.setDraped(countBelow(b.draped, DRAPED_STRIDE, DRAPED_RANK, dk), this.cardBase[lod]);
      // baked moss on solids: the quality density only (GDD 04 §9), the patches are few and small
      b.setMoss(Math.round(Math.min(1, qm) * b.mossPatches));
      if (dew > 0 && dist < DEW.blockRadiusMm && qd > 0) {
        const m = b.ensureDew(g.seed, this.mats.dew, this.dropBase);
        if (m && !m.parent) this.group.add(m);
        b.setDew(b.dew ? countBelow(b.dew, DROP_STRIDE, 15, dew) : 0);
      } else b.setDew(0);
    }
  }

  /** Generates every block the camera wants now, ignoring the time budget (deterministic screenshots, tests). */
  flush(): void {
    if (!this.ground) return;
    this.stream(this.lastCam.x, this.lastCam.z, this.ctx.quality, true);
    this.applyLod(this.lastCam.x, this.lastCam.z, this.ctx.quality);
  }

  // ---------------------------------------------------------------------------------------------------- statistics

  /** Hash of every live block's instance records, by block key. */
  blockHashes(): Record<number, number> {
    const out: Record<number, number> = {};
    for (const [k, b] of this.blocks) out[k] = b.hash;
    return out;
  }

  stats(): Record<string, number> {
    let blades = 0, draped = 0, drops = 0, tris = 0, draws = 0, moss = 0;
    for (const b of this.blocks.values()) {
      const gm = b.grassMesh, dm = b.drapedMesh, wm = b.dewMesh;
      if (gm?.visible) { blades += gm.geometry.instanceCount; tris += gm.geometry.instanceCount * (gm.geometry.index!.count / 3); draws++; }
      if (dm?.visible) { draped += dm.geometry.instanceCount; tris += dm.geometry.instanceCount * (dm.geometry.index!.count / 3); draws++; }
      const md = b.mossDrawn;
      if (md > 0) { moss += md; tris += md * (MOSS_PATCH_INDICES / 3); draws++; }
      if (wm?.visible) { drops += wm.geometry.instanceCount; tris += wm.geometry.instanceCount * (wm.geometry.index!.count / 3); draws++; }
    }
    return {
      blocks: this.blocks.size, generated: this.generated, rebuilt: this.rebuilt, pendingRebuilds: this.dirty.size, revisitMismatches: this.revisitMismatches,
      blades, draped, drops, mossPatches: moss, trianglesSubmitted: tris, drawsSubmitted: draws, waterSurfaces: this.water.surfaces.length, grassAtlas: this.tex?.grassStrip ? 1 : 0, waterTriangles: this.water.triangles,
      season: this.season.season, leafDensity: this.season.leafDensity,
    };
  }

  private clearBlocks(): void {
    for (const b of this.blocks.values()) b.dispose();
    this.blocks.clear();
    this.dirty.clear();
  }

  dispose(): void {
    this.clearBlocks();
    this.ctx?.scene.remove(this.group);
    this.water?.dispose();
    this.drape.dispose();
    if (this.mats) { this.mats.grass.main.dispose(); this.mats.grass.depth.dispose(); this.mats.draped.dispose(); this.mats.dew.dispose(); this.mats.moss.dispose(); }
    for (const t of this.tex?.owned ?? []) t.dispose();
    this.tex = null;
    this.ground = null;
  }
}
