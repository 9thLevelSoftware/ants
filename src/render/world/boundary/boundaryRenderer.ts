// BoundaryRenderer: what the player sees beyond the map edge (GDD 04 §14) so the world never ends in a flat line or
// a void: the extrapolated ground skirt, giant backdrop silhouettes continuing the edge treatment, and exponential
// haze from the edge outward. Two meshes, two draw calls, built once per world; nothing is simulated.
// `init(ctx)`, `setWorld(world)`, `clear()`, `update()`, `dispose()`.
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Uniform, type Scene } from 'three';
import type { WorldData } from '@/sim/types';
import { buildBackdrop } from './backdrop';
import { applyEdgeHazeLight, createEdgeHazeUniforms, patchEdgeHaze, type EdgeHazeLight, type EdgeHazeUniforms } from './edgeHaze';
import { buildSkirt } from './skirt';
import { BACKDROP_FUZZ, BACKDROP_KEEP_HAZE, BACKDROP_MIN_HAZE, BACKDROP_MIN_HAZE_NIGHT, BACKDROP_RIM_HAZE, EDGE_HAZE_K_L, EDGE_HAZE_MIN_MM, SKIRT_BLEND_BU, SKIRT_NIGHT_ALBEDO } from './tuning';

export interface BoundaryStats {
  skirtTriangles: number;
  backdropShapes: number;
  backdropTriangles: number;
  drawCalls: number;
}

function geometry(positions: ArrayLike<number>, normals: ArrayLike<number>, colors: ArrayLike<number>, index: ArrayLike<number>, keep?: ArrayLike<number>): BufferGeometry {
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(Float32Array.from(positions), 3));
  g.setAttribute('normal', new BufferAttribute(Float32Array.from(normals), 3));
  g.setAttribute('color', new BufferAttribute(Float32Array.from(colors), 3));
  g.setAttribute('aBdKeep', new BufferAttribute(keep ? Float32Array.from(keep) : new Float32Array(positions.length / 3), 1));
  g.setIndex(new BufferAttribute(Uint32Array.from(index), 1));
  g.computeBoundingSphere();
  return g;
}

export class BoundaryRenderer {
  readonly name = 'boundary';
  readonly group = new Group();
  readonly uniforms: EdgeHazeUniforms = createEdgeHazeUniforms();
  private readonly skirtLook = { rim: new Uniform(0), minHaze: new Uniform(0), fuzz: new Uniform(0), blend: new Uniform(0) };
  private readonly backdropLook = { rim: new Uniform(BACKDROP_RIM_HAZE), minHaze: new Uniform(BACKDROP_MIN_HAZE), fuzz: new Uniform(BACKDROP_FUZZ), blend: new Uniform(0), keepHaze: new Uniform(BACKDROP_KEEP_HAZE) };
  private skirtMat!: MeshStandardMaterial;
  private backdropMat!: MeshStandardMaterial;
  private skirt: Mesh | null = null;
  private backdrop: Mesh | null = null;
  private scene: Scene | null = null;
  private st: BoundaryStats = { skirtTriangles: 0, backdropShapes: 0, backdropTriangles: 0, drawCalls: 0 };

  init(ctx: { scene: Scene }): void {
    this.scene = ctx.scene;
    this.group.name = 'boundary';
    // polygon offset: the skirt wins ties with the terrain's clamped continuation at the edge
    this.skirtMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, alphaHash: true, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    this.skirtMat.name = 'boundary:skirt';
    this.backdropMat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, alphaHash: true });
    this.backdropMat.name = 'boundary:backdrop';
    patchEdgeHaze(this.skirtMat, this.uniforms, this.skirtLook);
    patchEdgeHaze(this.backdropMat, this.uniforms, this.backdropLook);
    ctx.scene.add(this.group);
  }

  /** Builds the skirt and the backdrop of a world (replaces the previous one). */
  setWorld(world: WorldData): void {
    this.clear();
    const S = world.size;
    this.uniforms.uBdBox.value.set(0, 0, S, S);
    this.uniforms.uBdHazeMm.value = Math.max(EDGE_HAZE_K_L * S, EDGE_HAZE_MIN_MM);
    this.skirtLook.blend.value = SKIRT_BLEND_BU * world.bu;
    const sk = buildSkirt(world);
    this.skirt = new Mesh(geometry(sk.positions, sk.normals, sk.colors, sk.index), this.skirtMat);
    this.skirt.name = 'boundary:skirt';
    this.skirt.receiveShadow = false;
    const bd = buildBackdrop(world);
    this.backdrop = new Mesh(geometry(bd.mesh.positions, bd.mesh.normals, bd.mesh.colors, bd.mesh.index, bd.mesh.keep), this.backdropMat);
    this.backdrop.name = 'boundary:backdrop';
    this.group.add(this.skirt, this.backdrop);
    this.st = { skirtTriangles: sk.index.length / 3, backdropShapes: bd.stats.shapes, backdropTriangles: bd.stats.triangles, drawCalls: 2 };
  }

  /** Drops the current world's meshes (game ended). */
  clear(): void {
    for (const m of [this.skirt, this.backdrop]) {
      if (!m) continue;
      this.group.remove(m);
      m.geometry.dispose();
    }
    this.skirt = this.backdrop = null;
    this.st = { skirtTriangles: 0, backdropShapes: 0, backdropTriangles: 0, drawCalls: 0 };
  }

  /**
   * Hidden underground (the surface world is dimmed away there and nothing beyond the edge can be seen). `light` is
   * the world lighting: the edge haze fades toward its sky.
   */
  update(frame: { underground?: boolean }, light?: EdgeHazeLight): void {
    this.group.visible = !frame.underground;
    if (light) {
      applyEdgeHazeLight(this.uniforms, light);
      // at night the far shapes dissolve into the horizon band: a pale fence panel against a dark sky read as a slab
      const n = Math.min(1, Math.max(0, light.nightW ?? 0));
      this.backdropLook.minHaze.value = BACKDROP_MIN_HAZE + (BACKDROP_MIN_HAZE_NIGHT - BACKDROP_MIN_HAZE) * n;
      this.skirtMat?.color.setScalar(1 + (SKIRT_NIGHT_ALBEDO - 1) * n);
    }
  }

  stats(): BoundaryStats {
    return { ...this.st };
  }

  dispose(): void {
    this.clear();
    this.scene?.remove(this.group);
    this.skirtMat?.dispose();
    this.backdropMat?.dispose();
  }
}
