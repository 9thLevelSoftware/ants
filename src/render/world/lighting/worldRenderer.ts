// WorldRenderer: the surface world sub-renderer (terrain, mounds, solid primitives, sky, sun/moon, ambient, haze,
// shadows). `init(ctx)` once, `setWorld(world, sim?)` per game, `update(frame)` every frame, `dispose()`.
// It reads simulation data only through simAdapter.ts and never writes it.
import { Group, Vector3 } from 'three';
import type { QualityPreset } from '@/render/app';
import type { Sim, WorldData } from '@/sim/types';
import { MaterialLibrary } from '../materials/materialLibrary';
import { createWorldUniforms, type WorldUniforms } from '../materials/uniforms';
import { PrimitiveRenderer } from '../primitives/primitiveRenderer';
import { applySky, createSkyDome, createSkyUniforms, type SkyUniforms } from '../sky/skyDome';
import { SkyEnvironment } from '../sky/skyEnvironment';
import { MoundRenderer } from '../terrain/moundRenderer';
import { TerrainRenderer } from '../terrain/terrainRenderer';
import type { HoleProbe } from '../terrain/holeMask';
import { ENV_REBAKE_DEG, ENV_REBAKE_MIN_S, HAZE_EASE_S, HAZE_VIS_BU, INTERIOR_LOOK, UNDERGROUND } from './constants';
import { LightingRig } from './lightingRig';
import {
  breachHoleProbe, breaches, carveView, createEnvSample, dynamicPrims, fieldHoleProbe, heightDeltaSignature, mounds,
  movedStaticPrims, moonFromSun, objectMoves, readEnvironment, staticPrims, sunFromCalendar, terrainSource, zoneTypeAt, type CarveView,
  type EnvSample,
} from './simAdapter';
import { computeLighting, createLightingState, type LightingState } from './timeOfDay';
import type { EnvOverride, WorldFrame, WorldRenderContext } from './types';

/** Primitive detail switch distance per preset, BU (from the camera to the primitive's bounding sphere). */
export const PRIM_NEAR_BU: Record<QualityPreset['id'], number> = { test: 40, low: 30, medium: 50, high: 70, ultra: 100 };
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
  private under = 0;
  private hazeVis = -1;
  private interior = -1;
  private lastExposure = NaN;
  private wet = 0;
  private moved = new Map<number, import('@/sim/types').Primitive>();
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
    this.sky = createSkyUniforms();
    this.skyMesh = createSkyDome(this.sky, SKY_RADIUS);
    this.skyEnv = new SkyEnvironment(ctx.renderer, this.sky);
    this.group.add(this.skyMesh, this.rig.group, this.terrain.group, this.prims.group);
    ctx.scene.add(this.group);
    await this.library.ready();
  }

  /** Builds the renderers for a world. With a sim, dynamic data (prims, mounds, holes) follow it every frame. */
  async setWorld(world: WorldData, sim: Sim | null = null): Promise<void> {
    this.world = world;
    this.rig.setQuality(this.ctx.quality, world.bu);
    this.prims.nearMm = PRIM_NEAR_BU[this.ctx.quality.id] * world.bu;
    await this.terrain.setSource(terrainSource(world, sim));
    this.mounds?.dispose();
    if (this.mounds) this.group.remove(this.mounds.group);
    this.mounds = new MoundRenderer(this.library, this.terrain.holeMask!.uniforms);
    this.group.add(this.mounds.group);
    this.prims.setStatic(staticPrims(world));
    this.heightSig = heightDeltaSignature(sim);
    this.hazeVis = -1;
    this.interior = -1;
    this.attachSim(sim);
  }

  /** Follows a (new) simulation for the same world: hole mask, dynamic primitives, mounds. */
  attachSim(sim: Sim | null): void {
    if (this.carve && this.carveListener) this.carve.removeListener(this.carveListener);
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
    const dt = Math.max(0, frame.dt);
    const ue = UNDERGROUND.easeS > 0 ? 1 - Math.exp(-dt / UNDERGROUND.easeS) : 1;
    this.under += ((frame.underground ? 1 : 0) - this.under) * (dt === 0 ? 1 : ue);
    const zone = zoneTypeAt(this.world, this.camPos.x, this.camPos.z);
    const zoneVis = HAZE_VIS_BU[zone];
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
    applySky(this.sky, this.lighting, this.env.moonDir, this.env.moonIllum, this.lighting.keyColor);
    this.skyMesh.position.copy(this.camPos);
    if (this.skyEnv.update(frame.time, `${this.env.weather}|${Math.round(this.under * 4)}|${Math.round(this.env.cloud * 10)}`, ENV_REBAKE_DEG, ENV_REBAKE_MIN_S)) {
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

    // dynamic world
    this.terrain.update(this.camPos.x, this.camPos.z);
    const hs = heightDeltaSignature(sim);
    if (hs !== this.heightSig) { this.heightSig = hs; this.terrain.updateHeights(terrainSource(this.world, sim).heights); }
    this.prims.syncDynamic(dynamicPrims(sim), movedStaticPrims(this.world, objectMoves(sim), this.moved));
    this.prims.setBreaches(breaches(sim), this.camPos);
    this.prims.update(this.camPos);
    this.mounds.sync(mounds(sim));
  }

  private sampleEnvironment(sim: Sim | null, o: EnvOverride | null): void {
    const e = this.env;
    if (sim && !(o && o.hour !== undefined)) {
      readEnvironment(sim, this.camPos, e);
    } else {
      e.hour = o?.hour ?? 12;
      e.yearFrac = o?.yearFrac ?? 0.3;
      const L = 12 + 4 * Math.sin(2 * Math.PI * e.yearFrac);
      e.sunElevDeg = sunFromCalendar(e.hour, 12 - L / 2, 12 + L / 2, e.sunDir);
      moonFromSun(e.sunDir, e.moonDir);
      e.moonIllum = 0.8;
      if (!sim) { e.weather = 'clear'; e.cloud = 0.1; e.fog = 0; e.light = Math.max(0, Math.min(1, e.sunElevDeg / 10 + 0.5)); }
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
  stats(): { terrainLevels: number; terrainTriangles: number; prims: ReturnType<PrimitiveRenderer['stats']>; mounds: number; holeSlots: number; envBakes: number } {
    return {
      terrainLevels: this.terrain.levelCount, terrainTriangles: this.terrain.triangles, prims: this.prims.stats(), mounds: this.mounds?.count ?? 0,
      holeSlots: this.terrain.holeMask?.usedSlots ?? 0, envBakes: this.skyEnv.bakes,
    };
  }

  dispose(): void {
    if (this.carve && this.carveListener) this.carve.removeListener(this.carveListener);
    this.ctx.scene.remove(this.group);
    this.group.clear();
    if (this.ctx.scene.environment === this.skyEnv.texture) this.ctx.scene.environment = null;
    if (this.ctx.scene.fog === this.rig.fog) this.ctx.scene.fog = null;
    this.terrain.dispose();
    this.prims.dispose();
    this.mounds?.dispose();
    this.rig.dispose();
    this.skyEnv.dispose();
    this.skyMesh.geometry.dispose();
    (this.skyMesh.material as { dispose(): void }).dispose();
    this.library.dispose();
    this.world = null;
    this.sim = null;
  }
}
