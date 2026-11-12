// Debug world renderer (slot `world`): sky colour, fog, a hemisphere + sun light, the terrain as a fine height
// patch around the subject plus a coarse whole-world grid, carved breaches discarded from the ground, and every
// static and dynamic primitive in flat material colours. Correct scale, not pretty.
import {
  Color, DirectionalLight, Fog, Group, HemisphereLight, Mesh, type BufferGeometry, type MeshLambertMaterial, type Scene,
} from 'three';
import type { Sim } from '@/sim/types';
import type { FrameInfo, RenderContext, SubRenderer } from '../index';
import { DEBUG_COLORS } from './palette';
import { DebugPrimLayer } from './primMeshes';
import { buildTerrainPatch, type PatchSpec } from './terrainMesh';
import { fillHoles, makeTerrainMaterial, makeTerrainUniforms, type TerrainUniforms } from './terrainMaterial';

/** Fine patch size in terrain cells; it re-centres when the subject moved a quarter of it. */
const PATCH_CELLS = 192;
/** Coarse grid: one vertex every this many terrain cells. */
const COARSE_STRIDE = 8;
/** Fog distances, BU. */
const FOG_NEAR_BU = 120;
const FOG_FAR_BU = 2200;
/** Sun direction (from the target towards the light), unnormalised. */
const SUN_DIR = { x: -0.45, y: 0.8, z: 0.35 };
/** How often mound / primitive changes are checked, frames. */
const SYNC_EVERY = 15;

export class DebugWorldRenderer implements SubRenderer {
  readonly name = 'debug-world';
  private scene: Scene | null = null;
  private readonly root = new Group();
  private readonly uniforms: TerrainUniforms = makeTerrainUniforms();
  private readonly coarseUniforms: TerrainUniforms = makeTerrainUniforms();
  private fineMat: MeshLambertMaterial | null = null;
  private coarseMat: MeshLambertMaterial | null = null;
  private fine: Mesh | null = null;
  private coarse: Mesh | null = null;
  private patch: PatchSpec = { x0: 0, z0: 0, cells: PATCH_CELLS, step: 1 };
  private readonly prims = new DebugPrimLayer();
  private sim: Sim | null = null;
  private frameNo = 0;
  private moundSig = '';
  private readonly sun = new DirectionalLight(DEBUG_COLORS.sunLight, 2.2);
  private readonly hemi = new HemisphereLight(DEBUG_COLORS.skyLight, DEBUG_COLORS.groundLight, 1.4);

  init(ctx: RenderContext): void {
    this.scene = ctx.scene;
    this.root.name = 'debug-world-root';
    ctx.scene.add(this.root);
    ctx.scene.background = new Color(DEBUG_COLORS.sky);
    this.root.add(this.hemi, this.sun, this.sun.target, this.prims.group);
    this.fineMat = makeTerrainMaterial(this.uniforms);
    this.coarseMat = makeTerrainMaterial(this.coarseUniforms, { polygonOffset: true });
  }

  onGameStart(sim: Sim): void {
    this.sim = sim;
    const bu = sim.world.bu;
    if (this.scene) this.scene.fog = new Fog(DEBUG_COLORS.fog, FOG_NEAR_BU * bu, FOG_FAR_BU * bu);
    const t = sim.world.terrain;
    this.patch = { x0: 0, z0: 0, cells: Math.min(PATCH_CELLS, Math.max(1, t.nx - 1)), step: t.cell };
    const coarseCells = Math.max(1, Math.ceil((t.nx - 1) / COARSE_STRIDE));
    const coarseGeo = buildTerrainPatch(sim, { x0: 0, z0: 0, cells: coarseCells, step: (sim.world.size / coarseCells) });
    this.coarse = new Mesh(coarseGeo, this.coarseMat!);
    this.coarse.name = 'debug-terrain-coarse';
    this.root.add(this.coarse);
    this.recentre(sim.world.queenStart.pos.x, sim.world.queenStart.pos.z, true);
    this.prims.sync(sim.world.prims, sim.state.worldDelta.dynPrims);
    this.moundSig = this.moundSignature(sim);
  }

  private moundSignature(sim: Sim): string {
    const m = sim.state.worldDelta.mounds;
    let h = m.length;
    for (const x of m) h = (Math.imul(h, 31) + Math.round(x.volume * 100) + x.lastBatchTick) >>> 0;
    return `${m.length}:${h}`;
  }

  /** Re-centres the fine patch on (x, z) when it moved far enough (or `force`). */
  private recentre(x: number, z: number, force = false): void {
    const sim = this.sim;
    if (!sim) return;
    const p = this.patch, span = p.cells * p.step;
    const cx = p.x0 + span / 2, cz = p.z0 + span / 2;
    if (!force && Math.abs(x - cx) < span / 4 && Math.abs(z - cz) < span / 4) return;
    const size = sim.world.size;
    p.x0 = Math.max(0, Math.min(size - span, Math.round((x - span / 2) / p.step) * p.step));
    p.z0 = Math.max(0, Math.min(size - span, Math.round((z - span / 2) / p.step) * p.step));
    const geo = buildTerrainPatch(sim, p, this.fine?.geometry as BufferGeometry | undefined);
    if (!this.fine) {
      this.fine = new Mesh(geo, this.fineMat!);
      this.fine.name = 'debug-terrain-fine';
      this.root.add(this.fine);
    }
    // the coarse grid hides itself where the fine patch is (half a cell inset avoids a seam gap)
    this.coarseUniforms.uCutRect.value.set(p.x0 + p.step * 0.5, p.z0 + p.step * 0.5, p.x0 + span - p.step * 0.5, p.z0 + span - p.step * 0.5);
  }

  /** Nearest breach spheres to (x, z) into both materials. */
  private updateHoles(sim: Sim, x: number, z: number): void {
    fillHoles([this.uniforms, this.coarseUniforms], sim.state.worldDelta.carve.breaches, x, z);
  }

  update(frame: FrameInfo): void {
    const sim = frame.sim;
    if (!sim || sim !== this.sim) return;
    const focus = frame.subject ?? frame.camera.position;
    this.recentre(focus.x, focus.z);
    this.updateHoles(sim, focus.x, focus.z);
    // the sun follows the subject so its direction is constant in view
    const bu = sim.world.bu;
    this.sun.target.position.set(focus.x, focus.y, focus.z);
    this.sun.position.set(focus.x + SUN_DIR.x * 100 * bu, focus.y + SUN_DIR.y * 100 * bu, focus.z + SUN_DIR.z * 100 * bu);
    if (this.scene?.fog instanceof Fog) {
      this.scene.fog.near = (frame.underground ? 10 : FOG_NEAR_BU) * bu;
      this.scene.fog.far = (frame.underground ? 400 : FOG_FAR_BU) * bu;
    }
    if (++this.frameNo % SYNC_EVERY === 0 || frame.dt === 0) {
      this.prims.sync(sim.world.prims, sim.state.worldDelta.dynPrims);
      const ms = this.moundSignature(sim);
      if (ms !== this.moundSig) { this.moundSig = ms; this.recentre(focus.x, focus.z, true); }
    }
  }

  stats(): Record<string, number> {
    return { primMeshes: this.prims.meshCount, primInstances: this.prims.instanceCount, holes: this.uniforms.uHoleCount.value };
  }

  onGameEnd(): void {
    this.prims.clear();
    for (const m of [this.fine, this.coarse]) {
      if (!m) continue;
      this.root.remove(m);
      m.geometry.dispose();
    }
    this.fine = null;
    this.coarse = null;
    this.sim = null;
  }

  dispose(): void {
    this.onGameEnd();
    this.prims.dispose();
    this.fineMat?.dispose();
    this.coarseMat?.dispose();
    this.scene?.remove(this.root);
    if (this.scene) { this.scene.fog = null; this.scene.background = null; }
    this.scene = null;
  }
}
