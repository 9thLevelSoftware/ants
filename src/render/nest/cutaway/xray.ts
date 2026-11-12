// X-ray cutaway (GDD 08 4.3): the whole nest as a solid lit cast seen through the ground. Drawn after everything
// else: a sentinel clears the depth buffer, a depth prepass of the nest keeps only its nearest shell, then the cast
// colour is blended at 0.85 over the frame - the same as the ground at alpha 0.15 over the nest, without touching
// the surface materials. Overlays that must show through (ants as dots, markers) draw with a higher render order.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, type WebGLRenderer } from 'three';
import type { ChunkMeshManager } from '../mesh/chunkMeshManager';
import type { NestMaterials } from '../materials/nestMaterials';
import { XRAY } from '../params';

export class XRayPass {
  readonly group = new Group();
  private sentinel: Mesh;
  private meshes = new Map<Mesh, { pre: Mesh; col: Mesh }>();
  private revision = -1;

  constructor(private readonly materials: NestMaterials) {
    this.group.name = 'nest:xray';
    this.group.visible = false;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([0, 0, 0, 0, 0, 0, 0, 0, 0], 3));
    const m = new MeshBasicMaterial({ colorWrite: false, depthWrite: false, depthTest: false, transparent: true });
    this.sentinel = new Mesh(g, m);
    this.sentinel.name = 'nest:xray-clear-depth';
    this.sentinel.frustumCulled = false;
    this.sentinel.renderOrder = XRAY.renderOrder - 1;
    this.sentinel.onBeforeRender = (r: WebGLRenderer) => r.clearDepth();
    this.group.add(this.sentinel);
    materials.xrayPrepass.forceSinglePass = true;
    materials.xrayColor.forceSinglePass = true;
  }

  get active(): boolean {
    return this.group.visible;
  }

  setActive(on: boolean): void {
    this.group.visible = on;
  }

  /** Mirrors the region meshes (shared geometry) when they changed. */
  sync(manager: ChunkMeshManager): void {
    if (manager.revision === this.revision) return;
    this.revision = manager.revision;
    const seen = new Set<Mesh>();
    for (const src of manager.meshes()) {
      seen.add(src);
      let e = this.meshes.get(src);
      if (!e) {
        const pre = new Mesh(src.geometry, this.materials.xrayPrepass);
        const col = new Mesh(src.geometry, this.materials.xrayColor);
        pre.renderOrder = XRAY.renderOrder;
        col.renderOrder = XRAY.renderOrder + 1;
        for (const m of [pre, col]) { m.matrixAutoUpdate = false; this.group.add(m); }
        e = { pre, col };
        this.meshes.set(src, e);
      }
      e.pre.geometry = src.geometry;
      e.col.geometry = src.geometry;
    }
    for (const [k, e] of this.meshes) {
      if (seen.has(k)) continue;
      this.group.remove(e.pre, e.col);
      this.meshes.delete(k);
    }
  }

  dispose(): void {
    this.group.clear();
    this.meshes.clear();
    this.sentinel.geometry.dispose();
    (this.sentinel.material as MeshBasicMaterial).dispose();
  }
}
