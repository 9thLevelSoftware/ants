// WorldRenderer: the surface world sub-renderer (terrain, mounds, solid primitives, sky, sun/moon, ambient, haze,
// shadows). `init(ctx)` once, `setWorld(world, sim?)` per game, `update(frame)` every frame, `dispose()`.
// It reads simulation data only through simAdapter.ts and never writes it.
import { ClampToEdgeWrapping, DataTexture, Group, LinearFilter, RedFormat, UnsignedByteType, Vector3 } from 'three';
import type { QualityPreset } from '@/render/app';
import type { Sim, WorldData } from '@/sim/types';
import { FOREST_DAPPLE } from '../materials/dapple';
import { MaterialLibrary } from '../materials/materialLibrary';
import { createWorldUniforms, type WorldUniforms } from '../materials/uniforms';
import { applyOcclusion, CONTACT_RADIUS_BU } from '../materials/occlusion';
import { PrimitiveRenderer } from '../primitives/primitiveRenderer';
import { lookTable } from '../dressing/looks';
import { GroundGrit } from '../dressing/groundGrit';
import { FlowerDressing } from '../dressing/flowerDressing';
import { applySky, createSkyDome, createSkyUniforms, type SkyUniforms } from '../sky/skyDome';
import { SkyEnvironment } from '../sky/skyEnvironment';
import { MoundRenderer } from '../terrain/moundRenderer';
import { TerrainRenderer } from '../terrain/terrainRenderer';
import type { HoleProbe } from '../terrain/holeMask';
import { ENV_REBAKE_DEG, ENV_REBAKE_MIN_S, HAZE_EASE_S, INTERIOR_LOOK, STARS_DOF_GAIN, UNDERGROUND } from './constants';
import { LightingRig } from './lightingRig';
import { HASH_SEED, hashNum, hashStr } from './signature';
import {
  breachHoleProbe, breaches, carveView, createEnvSample, dynamicPrims, fieldHoleProbe, heightDeltaSignature, mounds,
  movedStaticPrims, moonFromSun, objectMoves, objectMovesSignature, readEnvironment, readWeather, staticPrims, sunFromCalendar, terrainSource, zoneMask, zoneTypeAt, type CarveView,
  type EnvSample,
} from './simAdapter';
import { computeLighting, createLightingState, hazeVisBU, type LightingState } from './timeOfDay';
import type { EnvOverride, WorldFrame, WorldRenderContext } from './types';

/** Primitive detail switch distance per preset, BU (from the camera to the primitive's bounding sphere). */
export const PRIM_NEAR_BU: Record<QualityPreset['id'], number> = { test: 40, low: 30, medium: 50, high: 70, ultra: 100 };
/**
 * Primitives farther than this many haze visibilities are not drawn. FogExp2 reaches 99.4 % at 2.26 visibilities;
 * fog uses view depth, so the cull radius allows for objects up to 45 degrees off the view axis.
 */
export const PRIM_FOG_CULL_K = 3.2;
/** Sky dome radius, mm (drawn on the far plane; only needs to exceed the near plane). */
const SKY_RADIUS = 1000;

type Box = { i0: number; j0: number; k0: number; i1: number; j1: number; k1: number };

export class WorldRenderer {
  readonly group = new Group();
  uniforms!: WorldUniforms;
  library!: MaterialLibrary;
  terrain!: TerrainRenderer;
  prims!: PrimitiveRenderer;
  mounds!: MoundRenderer;
  rig!: LightingRig;
  /** Loose grains with volume on the ground near the camera focus (dressing/groundGrit.ts). */
  grit!: GroundGrit;
  /** Flower heads built from petals and florets near the camera (dressing/flowerDressing.ts). */
  flowers!: FlowerDressing;
  readonly lighting: LightingState = createLightingState();
  readonly env: EnvSample = createEnvSample();
  private ctx!: WorldRenderContext;
  private sky!: SkyUniforms;
  private skyMesh!: ReturnType<typeof createSkyDome>;
  private skyEnv!: SkyEnvironment;
  private world: WorldData | null = null;
  private sim: Sim | null = null;
  private carve: CarveView | null = null;
  private carveListener: ((c: { box: Box }) => void) | null = null;
  private heightSig = 0;
  /** Incremented by every setWorld / dispose; a pending setWorld that sees another value was superseded. */
  private worldGen = 0;
  private under = 0;
  private hazeVis = -1;
  private interior = -1;
  private lastExposure = NaN;
  private wet = 0;
  private moved = new Map<number, import('@/sim/types').Primitive>();
  /** objectMovesSignature the `moved` replacements were built for (NaN = rebuild). */
  private movesSig = Number.NaN;
  private canopyTex: DataTexture | null = null;
  private camPos = new Vector3();
  private camDir = new Vector3();
  private subject = new Vector3();

  async init(ctx: WorldRenderContext): Promise<void> {
    this.ctx = ctx;
    this.group.name = 'world';
    this.uniforms = createWorldUniforms();
    this.library = new MaterialLibrary(ctx.assets, this.uniforms, { anisotropy: ctx.quality.anisotropy });
    this.terrain = new TerrainRenderer(this.library, this.uniforms, ctx.quality);
    this.prims = new PrimitiveRenderer(this.library, PRIM_NEAR_BU[ctx.quality.id] * 4);
    this.rig = new LightingRig(ctx.quality, 4);
    this.grit = new GroundGrit(this.uniforms, ctx.quality);
    this.flowers = new FlowerDressing(this.uniforms, ctx.quality);
    this.sky = createSkyUniforms();
    this.skyMesh = createSkyDome(this.sky, SKY_RADIUS);
    this.skyEnv = new SkyEnvironment(ctx.renderer, this.sky);
    this.group.add(this.skyMesh, this.rig.group, this.terrain.group, this.prims.group, this.grit.group, this.flowers.group);
    ctx.scene.add(this.group);
    await this.library.ready();
  }

  /**
   * Builds the renderers for a world. With a sim, dynamic data (prims, mounds, holes) follow it every frame.
   * The caller may keep calling update() while this is pending (the render loop does not wait): the old world is
   * taken down at once and nothing is drawn until the new one is complete. A newer setWorld supersedes this one.
   */
  async setWorld(world: WorldData, sim: Sim | null = null): Promise<void> {
    const gen = ++this.worldGen;
    this.detachWorld();
    this.rig.setQuality(this.ctx.quality, world.bu);
    this.prims.nearMm = PRIM_NEAR_BU[this.ctx.quality.id] * world.bu;
    await this.terrain.setSource(terrainSource(world, sim));
    if (gen !== this.worldGen) return; // a newer setWorld (or dispose) took over while the textures loaded
    this.setCanopy(world);
    this.mounds = new MoundRenderer(this.library, this.terrain.holeMask!.uniforms);
    this.group.add(this.mounds.group);
    this.grit.setSource(this.terrain.source, (x, z) => this.inBreach(x, z));
    const looks = lookTable(world.objects);
    this.prims.setLooks(looks);
    this.prims.setStatic(staticPrims(world));
    this.flowers.setPrims(staticPrims(world), looks, world.bu);
    this.heightSig = heightDeltaSignature(sim);
    this.hazeVis = -1;
    this.interior = -1;
    this.world = world; // last: update() draws only a completely built world
    this.attachSim(sim);
  }

  /** The game ended: drops the world's meshes and textures and lets go of the sim (cancels a pending setWorld). */
  clearWorld(): void {
    this.worldGen++;
    this.detachWorld();
    this.terrain.clear();
  }

  /** Canopy mask for the forest dapple: the forest zones, linearly filtered for soft edges. */
  private setCanopy(world: WorldData): void {
    this.canopyTex?.dispose();
    const m = zoneMask(world, 'forest');
    const t = new DataTexture(m.data, m.nx, m.nz, RedFormat, UnsignedByteType);
    t.magFilter = t.minFilter = LinearFilter;
    t.wrapS = t.wrapT = ClampToEdgeWrapping;
    t.unpackAlignment = 1;
    t.needsUpdate = true;
    this.canopyTex = t;
    this.uniforms.tDappleMask.value = t;
    this.uniforms.uDappleMaskInv.value.set(1 / (m.nx * m.cell), 1 / (m.nz * m.cell));
  }

  /** Takes the current world down (its terrain is about to be replaced): no drawing until the next world is ready. */
  private detachWorld(): void {
    this.world = null;
    if (this.carve && this.carveListener) this.carve.removeListener(this.carveListener);
    this.carve = null;
    this.carveListener = null;
    this.sim = null;
    if (this.mounds) { this.group.remove(this.mounds.group); this.mounds.dispose(); }
    this.prims.clear();
    this.grit.setSource(null);
    this.flowers.setPrims(null, null);
    this.moved.clear();
    this.movesSig = Number.NaN;
  }

  /** Follows a (new) simulation for the same world: hole mask, dynamic primitives, mounds. */
  attachSim(sim: Sim | null): void {
    if (this.carve && this.carveListener) this.carve.removeListener(this.carveListener);
    this.carveListener = null;
    this.sim = sim;
    this.carve = carveView(sim);
    const hm = this.terrain.holeMask;
    if (!hm || !this.world) return;
    hm.clear();
    const probe: HoleProbe = fieldHoleProbe(sim)
      ?? breachHoleProbe(() => breaches(this.sim), (x, z) => this.terrain.height(x, z), this.world.bu);
    hm.setProbe(probe);
    for (const b of breaches(sim)) hm.markCircle(b.pos.x, b.pos.z, b.r);
    hm.update(1e9);
    if (this.carve) {
      const voxel = this.carve.voxel;
      const margin = 4 * this.world.bu;
      this.carveListener = ({ box }) => {
        const x0 = box.i0 * voxel, x1 = box.i1 * voxel, z0 = box.k0 * voxel, z1 = box.k1 * voxel;
        const y0 = box.j0 * voxel, y1 = box.j1 * voxel;
        const h = [this.terrain.height(x0, z0), this.terrain.height(x1, z0), this.terrain.height(x0, z1), this.terrain.height(x1, z1)];
        if (y1 < Math.min(...h) - margin || y0 > Math.max(...h) + margin) return; // deep underground: ground unchanged
        hm.markRect(x0, z0, x1, z1);
      };
      this.carve.addListener(this.carveListener);
    }
  }

  /** Marks the ground around a point for hole re-rasterisation (callers without a carve listener). */
  invalidateHoles(x: number, z: number, r: number): void {
    this.terrain.holeMask?.markCircle(x, z, r);
  }

  /** The sim reported 'mound-changed'. */
  onMoundChanged(id: number): void {
    this.mounds?.invalidate(id);
  }

  /** Surface wetness 0 dry .. 1 soaked (weather renderer / rain). */
  setWetness(w: number): void {
    this.wet = Math.min(1, Math.max(0, w));
    this.uniforms.uWet.value = this.wet;
  }

  setQuality(q: QualityPreset): void {
    this.ctx.quality = q;
    this.terrain.setQuality(q);
    this.library.setAnisotropy(q.anisotropy);
    this.grit.setQuality(q);
    this.flowers.setQuality(q);
    if (this.world) {
      this.rig.setQuality(q, this.world.bu);
      this.prims.nearMm = PRIM_NEAR_BU[q.id] * this.world.bu;
    }
    this.lastExposure = NaN;
  }

  update(frame: WorldFrame): void {
    if (!this.world) return;
    const cam = this.ctx.camera;
    const sim = frame.sim ?? this.sim;
    if (sim !== this.sim) this.attachSim(sim ?? null);
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.camDir);
    const bu = this.world.bu;
    if (frame.subject) this.subject.set(frame.subject.x, frame.subject.y, frame.subject.z);
    else this.subject.copy(this.camPos).addScaledVector(this.camDir, 8 * bu);

    // environment -> lighting
    this.sampleEnvironment(sim, frame.env ?? null);
    // a NaN or negative dt (clock glitch, paused tab) counts as a settle frame instead of poisoning the eased state
    const dt = Number.isFinite(frame.dt) && frame.dt > 0 ? frame.dt : 0;
    const ue = UNDERGROUND.easeS > 0 ? 1 - Math.exp(-dt / UNDERGROUND.easeS) : 1;
    this.under += ((frame.underground ? 1 : 0) - this.under) * (dt === 0 ? 1 : ue);
    const zone = zoneTypeAt(this.world, this.camPos.x, this.camPos.z);
    const zoneVis = hazeVisBU(zone, this.env.weather);
    this.hazeVis = this.hazeVis < 0 || dt === 0 ? zoneVis : this.hazeVis + (zoneVis - this.hazeVis) * (1 - Math.exp(-dt / HAZE_EASE_S));
    const inside = zone === 'interior' ? 1 : 0;
    this.interior = this.interior < 0 || dt === 0 ? inside : this.interior + (inside - this.interior) * (1 - Math.exp(-dt / INTERIOR_LOOK.easeS));
    const camHeightBU = (this.camPos.y - this.terrain.height(this.camPos.x, this.camPos.z)) / bu;
    const q = this.ctx.quality;
    computeLighting({
      sunDir: this.env.sunDir, sunElevDeg: this.env.sunElevDeg, moonDir: this.env.moonDir, moonIllum: this.env.moonIllum,
      weather: this.env.weather, cloud: this.env.cloud, fog: this.env.fog, zone, hazeVisBU: this.hazeVis, bu,
      cameraHeightBU: camHeightBU, interior: this.interior,
      under: this.under, hazeScale: q.fog.enabled ? q.fog.hazeScale : 0,
    }, this.lighting);
    this.rig.apply(this.lighting, this.ctx.scene, q.fog.enabled);
    const dof = q.post.enabled && q.post.dof.enabled && q.post.dof.bokehScale > 0;
    applySky(this.sky, this.lighting, this.env.moonDir, this.env.moonIllum, this.lighting.keyColor, dof ? STARS_DOF_GAIN : 1);
    this.skyMesh.position.copy(this.camPos);
    // real time for the throttle (the animation clock may be frozen); a settle frame (dt 0) bakes at once
    const nowS = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
    let envKey = hashStr(HASH_SEED, this.env.weather);
    envKey = hashNum(hashNum(hashNum(envKey, Math.round(this.under * 4)), Math.round(this.env.cloud * 10)), Math.round(this.interior * 4));
    if (this.skyEnv.update(nowS, envKey, ENV_REBAKE_DEG, ENV_REBAKE_MIN_S, dt === 0)) {
      this.ctx.scene.environment = this.skyEnv.texture;
    }
    this.rig.follow(this.subject, this.camDir, this.lighting.keyDir);
    this.applyExposure(this.lighting.exposureEV);

    // shared uniforms
    const u = this.uniforms;
    u.uTime.value = frame.time;
    u.uCamPos.value.copy(this.camPos);
    u.uSubject.value.copy(this.subject);
    u.uUnder.value = this.under;
    u.uHaze.value.copy(this.lighting.fogColor);
    u.uWindDir.value.set(this.env.windDir.x, this.env.windDir.z);
    applyOcclusion(u, frame.occlusion);
    // contact darkening only under a real subject (no subject: the focus point ahead of the camera is no ant)
    if (frame.subject && this.under < 0.99) u.uContact.value.set(this.subject.x, this.subject.y, this.subject.z, CONTACT_RADIUS_BU * bu);
    else u.uContact.value.w = 0;
    this.applyDapple(frame);

    // dynamic world
    this.terrain.update(this.camPos.x, this.camPos.z);
    const hs = heightDeltaSignature(sim);
    if (hs !== this.heightSig) {
      this.heightSig = hs;
      this.terrain.updateHeights(terrainSource(this.world, sim).heights);
      this.grit.setSource(this.terrain.source, (x, z) => this.inBreach(x, z));
    }
    this.grit.update(this.subject.x, this.subject.z, this.under);
    this.flowers.update(this.camPos, this.under);
    const moves = objectMoves(sim), movesSig = objectMovesSignature(moves);
    if (movesSig !== this.movesSig) { this.movesSig = movesSig; movedStaticPrims(this.world, moves, this.moved); }
    this.prims.syncDynamic(dynamicPrims(sim), this.moved);
    this.prims.setBreaches(breaches(sim), this.camPos);
    this.prims.update(this.camPos, this.primCullMm());
    this.mounds.sync(mounds(sim));
  }

  /**
   * Forest leaf-shadow flecks on the sun (GDD 08 11.3): by day, fading with cloud cover, still in reduced motion;
   * where they fall is the canopy mask (forest zones) built in setWorld.
   */
  private applyDapple(frame: WorldFrame): void {
    const l = this.lighting, d = this.uniforms.uDapple.value;
    const amount = l.moonlit ? 0 : FOREST_DAPPLE.depth * (1 - l.overcast) * (1 - this.under);
    const k = l.keyDir, y = Math.max(0.05, k.y);
    d.set(amount, frame.reducedMotion ? 0 : frame.time, k.x / y, k.z / y);
    this.uniforms.uDappleMm.value = FOREST_DAPPLE.scaleBU * (this.world?.bu ?? 4);
  }

  /** A nest opening (breach sphere) reaches the ground at (x, z): no grit there. */
  private inBreach(x: number, z: number): boolean {
    for (const b of breaches(this.sim)) if (Math.hypot(b.pos.x - x, b.pos.z - z) < b.r) return true;
    return false;
  }

  /** Distance past which primitives are invisible: the haze (when on) or the preset's draw distance, mm. */
  private primCullMm(): number {
    const draw = this.ctx.quality.drawDistanceBU * (this.world?.bu ?? 4);
    const d = this.lighting.fogDensity;
    return d > 0 && this.ctx.quality.fog.enabled ? Math.min(draw, PRIM_FOG_CULL_K / d) : draw;
  }

  private sampleEnvironment(sim: Sim | null, o: EnvOverride | null): void {
    const e = this.env;
    if (sim && !(o && o.hour !== undefined)) {
      readEnvironment(sim, this.camPos, e);
    } else {
      // no sim, or an hour override (photo mode, demo flag): the calendar sun of that hour; the sim's weather stays
      if (sim) readWeather(sim, e);
      e.hour = o?.hour ?? 12;
      e.yearFrac = o?.yearFrac ?? 0.3;
      const L = 12 + 4 * Math.sin(2 * Math.PI * e.yearFrac);
      e.sunElevDeg = sunFromCalendar(e.hour, 12 - L / 2, 12 + L / 2, e.sunDir);
      moonFromSun(e.sunDir, e.moonDir);
      e.moonIllum = 0.8;
      e.light = Math.max(0, Math.min(1, e.sunElevDeg / 10 + 0.5));
      if (!sim) { e.weather = 'clear'; e.cloud = 0.1; e.fog = 0; }
    }
    if (o) {
      if (o.weather !== undefined) e.weather = o.weather;
      if (o.cloud !== undefined) e.cloud = o.cloud;
      if (o.moonIllum !== undefined) e.moonIllum = o.moonIllum;
      if (o.fog !== undefined) e.fog = o.fog;
    }
  }

  private applyExposure(ev: number): void {
    if (Math.abs(ev - this.lastExposure) < 0.01) return;
    this.lastExposure = ev;
    if (this.ctx.setExposure) this.ctx.setExposure(ev);
    else this.ctx.renderer.toneMappingExposure = Math.pow(2, ev);
  }

  /** Counters for budgets and tests. */
  stats(): {
    terrainLevels: number; terrainTriangles: number; prims: ReturnType<PrimitiveRenderer['stats']>; mounds: number; holeSlots: number; holeTilesDropped: number; envBakes: number;
    gritGrains: number; gritTriangles: number; flowerHeads: number; flowerParts: number; flowerTriangles: number;
  } {
    return {
      gritGrains: this.grit.count, gritTriangles: this.grit.triangles,
      flowerHeads: this.flowers.headCount, flowerParts: this.flowers.partCount, flowerTriangles: this.flowers.triangles,
      terrainLevels: this.terrain.levelCount, terrainTriangles: this.terrain.triangles, prims: this.prims.stats(), mounds: this.mounds?.count ?? 0,
      holeSlots: this.terrain.holeMask?.usedSlots ?? 0, holeTilesDropped: this.terrain.holeMask?.droppedTiles ?? 0, envBakes: this.skyEnv.bakes,
    };
  }

  dispose(): void {
    this.worldGen++;
    if (this.carve && this.carveListener) this.carve.removeListener(this.carveListener);
    this.ctx.scene.remove(this.group);
    this.group.clear();
    if (this.ctx.scene.environment === this.skyEnv.texture) this.ctx.scene.environment = null;
    if (this.ctx.scene.fog === this.rig.fog) this.ctx.scene.fog = null;
    this.terrain.dispose();
    this.prims.dispose();
    this.grit.dispose();
    this.flowers.dispose();
    this.mounds?.dispose();
    this.rig.dispose();
    this.skyEnv.dispose();
    this.skyMesh.geometry.dispose();
    (this.skyMesh.material as { dispose(): void }).dispose();
    this.library.dispose();
    this.canopyTex?.dispose();
    this.canopyTex = null;
    this.uniforms.tDappleMask.value = null;
    this.world = null;
    this.sim = null;
  }
}
