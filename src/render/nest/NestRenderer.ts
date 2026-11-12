// NestRenderer: the carve-grid sub-renderer. Draws excavated space (marching-cubes chunk meshes rebuilt as ants dig),
// the dim scent-lit underground look, the colony view's cutaway (slice cap / x-ray cast) and offers nest-space
// picking and translucent ghosts for markers. `init(ctx)` once, `setSim(sim)` per game, `update(frame)` every
// frame, `dispose()`. It reads simulation data only through simAdapter.ts and never writes it.
import { Group, Vector3, type PerspectiveCamera, type Scene, type WebGLRenderer, type Material } from 'three';
import type { QualityPreset } from '@/render/app';
import type { AssetLoader } from '@/render/assets';
import { createWorldUniforms, materialDef, MaterialLibrary } from '@/render/world/materials';
import type { Sim } from '@/sim/types';
import type { Vec3 } from '@/core/math/vec3';
import { CapSet } from './cutaway/capSet';
import { computeCutPlane, createCutPlane, cutKey, type NestCutawayParams } from './cutaway/cutPlane';
import { patchSurfaceForCutaway } from './cutaway/surfaceCutPatch';
import { XRayPass } from './cutaway/xray';
import { NestGhosts } from './ghosts';
import { NestLighting } from './lighting/nestLighting';
import { createNestLook, updateNestLook, type NestLook } from './lighting/undergroundLook';
import { NestMaterials, wallLook } from './materials/nestMaterials';
import { createNestUniforms, CUT_OFF, CUT_SLICE, CUT_XRAY, type NestUniforms } from './materials/nestUniforms';
import { ChunkMeshManager, type MeshFrameStats } from './mesh/chunkMeshManager';
import { CUTAWAY, MESH_QUALITY, WALL_LOOKS, type MeshQuality } from './params';
import { pickNest, projectOnCut, snapToWall, type NestPick } from './picking';
import { nestSourceFromSim, type NestSource } from './simAdapter';

export interface NestRenderContext {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  quality: QualityPreset;
  /** The one asset loader (architecture 8); null = procedural textures only. */
  assets: AssetLoader | null;
  /** Share the world renderer's material library (texture sets) when there is one. */
  library?: MaterialLibrary;
}

/** Structurally compatible with the registry's FrameInfo; every field but dt/time is optional. */
export interface NestFrame {
  dt: number;
  time: number;
  sim?: Sim | null;
  /** The possessed ant / followed entity (centre of the sense light); default: the sim's possessed ant, else the camera. */
  subject?: Vec3 | null;
  /** Colony-view cutaway (src/render/camera ColonyRig.cutaway satisfies it); null/undefined = off. */
  cutaway?: NestCutawayParams | null;
  /** The surface exposure (EV) the post chain would use above ground; NestLook.exposureEV blends from it. */
  surfaceExposureEV?: number;
}

export interface NestStats {
  chunks: number; regions: number; triangles: number; vertices: number; pending: number; gpuBytes: number;
  lastFrame: MeshFrameStats; maxFrameMs: number; totalBuilt: number; openings: number; capBusy: boolean; ghosts: number;
}

/** Frames between re-reads of the entrance list (it changes rarely; carve edits also trigger a re-read). */
const OPENINGS_EVERY = 30;

export class NestRenderer {
  readonly group = new Group();
  readonly uniforms: NestUniforms = createNestUniforms();
  readonly look: NestLook = createNestLook();
  readonly ghosts = new NestGhosts();
  meshes!: ChunkMeshManager;
  materials!: NestMaterials;
  private ctx!: NestRenderContext;
  private library!: MaterialLibrary;
  private ownsLibrary = false;
  private lighting = new NestLighting(this.uniforms);
  private quality!: MeshQuality;
  private sim: Sim | null = null;
  private src: NestSource | null = null;
  private plane = createCutPlane();
  private caps!: CapSet;
  private xray!: XRayPass;
  private camPos = new Vector3();
  private camDir = new Vector3();
  private subject = { x: 0, y: 0, z: 0 };
  private frames = 0;
  private lastVersion = -1;

  async init(ctx: NestRenderContext): Promise<void> {
    this.ctx = ctx;
    this.group.name = 'nest';
    this.library = ctx.library ?? new MaterialLibrary(ctx.assets, createWorldUniforms(), { anisotropy: ctx.quality.anisotropy });
    this.ownsLibrary = !ctx.library;
    this.quality = MESH_QUALITY[ctx.quality.id];
    this.materials = new NestMaterials(this.library, this.uniforms, { detail: this.quality.detailNormals });
    this.meshes = new ChunkMeshManager(this.materials);
    const soilLook = wallLook('loam');
    this.caps = new CapSet(this.uniforms, this.library.textureSet(materialDef(soilLook.textureFrom)), soilLook.scaleMm);
    this.xray = new XRayPass(this.materials);
    this.applyQuality();
    this.group.add(this.meshes.group, this.caps.group, this.xray.group, this.ghosts.group);
    ctx.scene.add(this.group);
    const textures = [...new Set(Object.values(WALL_LOOKS).map((l) => l.textureFrom))];
    await this.library.ready(textures);
  }

  /** Follows a simulation (null = none): every stored chunk is meshed again. */
  setSim(sim: Sim | null): void {
    this.sim = sim;
    this.setSource(sim ? nestSourceFromSim(sim) : null);
  }

  /** Lower-level: any NestSource (tests, tools). */
  setSource(src: NestSource | null): void {
    this.src = src;
    this.meshes.setSource(src);
    this.caps.hide();
    this.lastVersion = -1;
    if (src) {
      this.lighting.setBodyUnit(src.bu);
      this.lighting.refreshOpenings(src);
    }
  }

  setQuality(q: QualityPreset): void {
    this.ctx.quality = q;
    const prev = this.quality;
    this.quality = MESH_QUALITY[q.id];
    this.applyQuality();
    if (prev.refine !== this.quality.refine || prev.ao !== this.quality.ao) this.meshes.rebuildAll();
  }

  /** Linear daylight radiance at the surface (sky + sun, 0 at night); drives the daylight falling into tunnels. */
  setDaylight(r: number, g: number, b: number): void {
    this.lighting.setDaylight(r, g, b);
  }

  /** Moisture darkening hook: wetness = clamp(soilMoisture * scale + offset) (rain soaking, flooding). */
  setMoisture(scale: number, offset = 0): void {
    this.uniforms.uMoist.value.set(scale, offset);
  }

  /** Adds the cutaway behaviour (hide above the slice, darken outside R_cut) to another renderer's material. */
  patchSurfaceMaterial(m: Material): void {
    patchSurfaceForCutaway(m, this.uniforms);
  }

  /** Builds everything pending now (load screens, deterministic screenshots). */
  flush(): void {
    this.meshes.flush();
    this.xray.sync(this.meshes);
  }

  update(frame: NestFrame): void {
    if (frame.sim !== undefined && frame.sim !== this.sim) this.setSim(frame.sim ?? null);
    const src = this.src;
    const cam = this.ctx.camera;
    cam.getWorldPosition(this.camPos);
    cam.getWorldDirection(this.camDir);
    this.frames++;
    if (!src) return;

    // underground look (exposure / fog switch for the post chain and the world renderer)
    updateNestLook(this.look, src.substrate(this.camPos.x, this.camPos.y, this.camPos.z), src.bu, frame.dt, frame.surfaceExposureEV ?? 0);

    // lighting: openings near the camera, the sense light on the subject
    const version = src.version();
    if (version !== this.lastVersion || this.frames % OPENINGS_EVERY === 0) this.lighting.refreshOpenings(src);
    let lantern: Vec3 | null = frame.subject ?? null;
    if (!lantern && src.possessedPos(this.subject)) lantern = this.subject;
    this.lighting.update(src, this.camPos, lantern);

    // meshes
    this.meshes.update(this.camPos.x, this.camPos.y, this.camPos.z, this.quality.budgetMs);

    // cutaway
    this.updateCutaway(frame.cutaway ?? null);
    this.lastVersion = version;
  }

  /** Pick ray through normalised device coordinates (-1..1) into nest space. */
  pick(ndcX: number, ndcY: number, maxDist = 1e5): NestPick | null {
    if (!this.src) return null;
    return pickNest(ndcX, ndcY, this.ctx.camera, {
      src: this.src, manager: this.meshes, plane: this.plane, cap: this.caps.main, skinMm: this.uniforms.uSkin.value, maxDist,
    });
  }

  /** Nearest nest wall within maxDist (mm) of p: point into out, normal (into free space) into normal. */
  snapToWall(p: Vec3, maxDist: number, out: Vec3, normal: Vec3): boolean {
    return !!this.src && snapToWall(this.src, p, maxDist, out, normal);
  }

  /** Projection of a point on the current cut plane (marker shadow on the cap). */
  projectOnCut(p: Vec3, out: Vec3): Vec3 {
    return projectOnCut(this.plane, p, out);
  }

  get cutPlane(): Readonly<ReturnType<typeof createCutPlane>> {
    return this.plane;
  }

  stats(): NestStats {
    return {
      ...this.meshes.stats(), lastFrame: { ...this.meshes.last }, maxFrameMs: this.meshes.maxFrameMs, totalBuilt: this.meshes.totalBuilt,
      openings: this.lighting.openingsInUse, capBusy: this.caps.busy, ghosts: this.ghosts.count,
    };
  }

  resetFrameMax(): void {
    this.meshes.maxFrameMs = 0;
  }

  dispose(): void {
    this.ctx?.scene.remove(this.group);
    this.meshes?.dispose();
    this.xray?.dispose();
    this.caps?.dispose();
    this.ghosts.dispose();
    this.materials?.dispose();
    if (this.ownsLibrary) this.library?.dispose();
    this.group.clear();
    this.src = null;
    this.sim = null;
  }

  private applyQuality(): void {
    const q = this.quality;
    this.meshes.build = { refine: q.refine, ao: q.ao };
    this.meshes.setCastShadow(q.castShadow && this.ctx.quality.shadows.enabled);
    this.materials.setDetail(q.detailNormals);
  }

  private updateCutaway(p: NestCutawayParams | null): void {
    const u = this.uniforms, src = this.src!;
    const mode = p?.mode ?? 'off';
    if (!p || mode === 'off') {
      u.uCutMode.value = CUT_OFF;
      this.plane.mode = 'off';
      this.caps.hide();
      this.xray.setActive(false);
      this.meshes.group.visible = true;
      return;
    }
    let params = p;
    if (p.section === 'vertical' && !p.viewDir) params = { ...p, viewDir: { x: this.camDir.x, z: this.camDir.z } };
    const cp = computeCutPlane(params, (x, z) => src.height(x, z), src.bu, this.plane);
    u.uCutMode.value = mode === 'slice' ? CUT_SLICE : CUT_XRAY;
    u.uCutC.value.set(cp.c.x, cp.c.y, cp.c.z);
    u.uCutN.value.set(cp.n.x, cp.n.y, cp.n.z);
    u.uCutR.value = cp.radius;
    u.uCutDark.value = cp.darken;
    this.xray.setActive(mode === 'xray');
    this.meshes.group.visible = mode !== 'xray';
    if (mode === 'xray') {
      this.xray.sync(this.meshes);
      this.caps.hide();
      return;
    }
    const key = `${cutKey(cp)}|${src.version()}`; // digging while cut open redraws the face
    const texel = Math.max(CUTAWAY.capTexelBU * src.bu, (2 * cp.radius) / CUTAWAY.capMaxTexels);
    this.caps.update(cp, src, key, texel, CUTAWAY.capMaxTexels, CUTAWAY.capBudgetMs);
  }

  /** Builds the cap of the current plane completely now (screenshots, tests). */
  flushCutaway(): void {
    if (this.src) this.caps.flush(this.src);
  }
}

