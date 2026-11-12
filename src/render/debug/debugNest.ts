// Debug nest renderer (slot `nest`): one mesh per carve chunk from the kernel's marching cubes, a flat soil
// material lit from inside the cavity, fragments in open air discarded through the per-vertex substrate distance
// (so entrance brushes do not poke out of the ground). Dirty chunks are re-meshed each frame (budgeted).
//
// At entrance rims the decision uses the RENDERED ground instead: the debug terrain is a 4 BU triangle grid, so
// near a hole it lies a little above or below the field's true surface. Judged by the true surface, wall pieces
// between the two were discarded although the drawn ground did not cover them (a sky-coloured seam showed through
// the hole), or kept although they stuck out above it. Inside a breach sphere (where the drawn terrain is
// discarded) a fragment is therefore kept exactly when it lies below the drawn ground.
import {
  BufferAttribute, BufferGeometry, Group, Mesh, MeshLambertMaterial, type Scene, type WebGLProgramParametersWithUniforms,
} from 'three';
import type { Sim } from '@/sim/types';
import type { FrameInfo, RenderContext, SubRenderer } from '../index';
import { DEBUG_COLORS } from './palette';
import { fillHoles, HOLE_INSET_BU, IN_HOLE_GLSL, makeTerrainUniforms, MAX_HOLES, type HoleUniforms } from './terrainMaterial';
import { patchSurfaceHeight } from './terrainMesh';

/** Chunks re-meshed per frame at most (the rest wait); the first build after game start is unbudgeted. */
const REMESH_PER_FRAME = 24;

function makeCavityMaterial(u: HoleUniforms): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ color: DEBUG_COLORS.cavity, emissive: DEBUG_COLORS.cavityEmissive });
  m.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
attribute float substrate;
attribute float aboveDrawnGround;
varying float vSubstrate;
varying float vAboveDrawn;
varying vec3 vDbgWorld;`)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSubstrate = substrate;\nvAboveDrawn = aboveDrawnGround;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvDbgWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vSubstrate;
varying float vAboveDrawn;
varying vec3 vDbgWorld;
uniform vec4 uHoles[${MAX_HOLES}];
uniform int uHoleCount;
${IN_HOLE_GLSL}`)
      .replace('void main() {', `void main() {
  if (dbgInHole(vDbgWorld) ? vAboveDrawn > 0.0 : vSubstrate > 0.0) discard;`);
  };
  m.customProgramCacheKey = () => 'dbg-cavity';
  return m;
}

/** Per-vertex height above the drawn debug terrain (mm), for the rim test in the shader. */
function aboveDrawnGround(sim: Sim, positions: Float32Array): Float32Array {
  const out = new Float32Array(positions.length / 3);
  const step = sim.world.terrain.cell;
  for (let v = 0; v < out.length; v++) {
    const x = positions[v * 3], y = positions[v * 3 + 1], z = positions[v * 3 + 2];
    out[v] = y - patchSurfaceHeight(sim, x, z, step);
  }
  return out;
}

function holeUniforms(): HoleUniforms {
  const u = makeTerrainUniforms();
  return { uHoles: u.uHoles, uHoleCount: u.uHoleCount };
}

export class DebugNestRenderer implements SubRenderer {
  readonly name = 'debug-nest';
  private scene: Scene | null = null;
  private readonly root = new Group();
  private readonly meshes = new Map<number, Mesh>();
  private readonly pending = new Set<number>();
  private material: MeshLambertMaterial | null = null;
  private readonly uniforms = holeUniforms();
  private sim: Sim | null = null;
  triangles = 0;

  init(ctx: RenderContext): void {
    this.scene = ctx.scene;
    this.root.name = 'debug-nest-root';
    ctx.scene.add(this.root);
    this.material = makeCavityMaterial(this.uniforms);
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
    g.setAttribute('aboveDrawnGround', new BufferAttribute(aboveDrawnGround(sim, cm.positions), 1));
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
    const focus = frame.subject ?? frame.camera.position;
    fillHoles([this.uniforms], sim.state.worldDelta.carve.breaches, focus.x, focus.z, HOLE_INSET_BU * sim.world.bu); // = the terrain's
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
