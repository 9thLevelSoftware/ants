// Debug nest renderer (slot `nest`): one mesh per carve chunk from the kernel's marching cubes, a flat soil
// material lit from inside the cavity, fragments in open air discarded through the per-vertex substrate distance
// (so entrance brushes do not poke out of the ground). Dirty chunks are re-meshed each frame (budgeted).
import {
  BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial, type Scene, type WebGLProgramParametersWithUniforms,
} from 'three';
import type { Sim } from '@/sim/types';
import type { FrameInfo, RenderContext, SubRenderer } from '../index';
import { DEBUG_COLORS } from './palette';

/** Chunks re-meshed per frame at most (the rest wait); the first build after game start is unbudgeted. */
const REMESH_PER_FRAME = 24;

function makeCavityMaterial(): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: DEBUG_COLORS.cavity, emissive: DEBUG_COLORS.cavityEmissive });
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float substrate;\nvarying float vSubstrate;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSubstrate = substrate;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSubstrate;')
      .replace('void main() {', 'void main() {\n  if (vSubstrate > 0.0) discard;');
  };
  m.customProgramCacheKey = () => 'dbg-cavity';
  return m;
}

export class DebugNestRenderer implements SubRenderer {
  readonly name = 'debug-nest';
  private scene: Scene | null = null;
  private readonly root = new Group();
  private readonly meshes = new Map<number, Mesh>();
  private readonly pending = new Set<number>();
  private material: MeshLambertMaterial | null = null;
  private sim: Sim | null = null;
  triangles = 0;

  init(ctx: RenderContext): void {
    this.scene = ctx.scene;
    this.root.name = 'debug-nest-root';
    ctx.scene.add(this.root);
    this.material = makeCavityMaterial();
  }

  onGameStart(sim: Sim): void {
    this.sim = sim;
    sim.carve.takeDirty(); // everything is meshed below
    for (const key of sim.kernel.meshKeys()) this.remesh(sim, key);
  }

  private remesh(sim: Sim, key: number): void {
    const old = this.meshes.get(key);
    if (old) {
      this.root.remove(old);
      this.triangles -= (old.geometry.index?.count ?? 0) / 3;
      old.geometry.dispose();
      this.meshes.delete(key);
    }
    const cm = sim.kernel.meshChunk(key);
    if (!cm || cm.indices.length === 0) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(cm.positions, 3));
    g.setAttribute('normal', new BufferAttribute(cm.normals, 3));
    g.setAttribute('substrate', new BufferAttribute(cm.substrate, 1));
    g.setIndex(new BufferAttribute(cm.indices, 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.material!);
    mesh.name = `chunk-${key}`;
    this.root.add(mesh);
    this.meshes.set(key, mesh);
    this.triangles += cm.indices.length / 3;
  }

  update(frame: FrameInfo): void {
    const sim = frame.sim;
    if (!sim || sim !== this.sim) return;
    for (const k of sim.carve.takeDirty()) this.pending.add(k);
    let n = 0;
    // test mode / single renders (dt 0): mesh everything so screenshots show the current state
    const budget = frame.dt === 0 ? Infinity : REMESH_PER_FRAME;
    for (const k of this.pending) {
      if (n++ >= budget) break;
      this.pending.delete(k);
      this.remesh(sim, k);
    }
  }

  stats(): Record<string, number> {
    return { chunks: this.meshes.size, triangles: this.triangles, pending: this.pending.size };
  }

  onGameEnd(): void {
    for (const m of this.meshes.values()) { this.root.remove(m); m.geometry.dispose(); }
    this.meshes.clear();
    this.pending.clear();
    this.triangles = 0;
    this.sim = null;
  }

  dispose(): void {
    this.onGameEnd();
    this.material?.dispose();
    this.scene?.remove(this.root);
    this.scene = null;
  }
}
