// All cut faces of the current cutaway: computes the faces from the cut plane, rasterises them within a per-frame
// budget (nearest work first: the main face) and keeps their meshes up to date.
import { Group } from 'three';
import type { TextureSet } from '@/render/world/materials';
import type { NestUniforms } from '../materials/nestUniforms';
import type { NestSource } from '../simAdapter';
import { capFaces } from './capFaces';
import { CapMesh } from './capMesh';
import { CapRaster } from './capRaster';
import type { CutPlane } from './cutPlane';

const MAX_FACES = 3;

export class CapSet {
  readonly group = new Group();
  readonly rasters: CapRaster[] = [];
  private meshes: CapMesh[] = [];
  private faceCount = 0;

  constructor(u: NestUniforms, soil: TextureSet, soilScaleMm: number) {
    this.group.name = 'nest:cutaway-caps';
    for (let i = 0; i < MAX_FACES; i++) {
      this.rasters.push(new CapRaster());
      const m = new CapMesh(u, soil, soilScaleMm);
      this.meshes.push(m);
      this.group.add(m.mesh);
    }
  }

  /** The main face (the plane itself): picking reads its solidness. */
  get main(): CapRaster {
    return this.rasters[0];
  }

  get busy(): boolean {
    return this.rasters.some((r) => r.busy);
  }

  /** Starts new rasters when `key` changed, works within budgetMs, and shows whatever is complete. */
  update(cp: CutPlane, src: NestSource, key: string, texelMm: number, maxTexels: number, budgetMs: number): void {
    const faces = capFaces(cp, this.groundMax(cp, src), src.bu);
    this.faceCount = faces.length;
    faces.forEach((f, i) => this.rasters[i].start(f, `${key}|${i}`, texelMm, i === 0 ? maxTexels : maxTexels * 4));
    const deadline = performance.now() + budgetMs;
    for (let i = 0; i < faces.length; i++) {
      if (!this.rasters[i].busy) continue;
      this.rasters[i].step(src, deadline);
      if (performance.now() >= deadline) break;
    }
    this.show();
  }

  /** Completes every face now (screenshots, tests). */
  flush(src: NestSource): void {
    for (let i = 0; i < this.faceCount; i++) while (this.rasters[i].busy) this.rasters[i].step(src, Infinity);
    this.show();
  }

  hide(): void {
    for (const r of this.rasters) r.cancel();
    for (const m of this.meshes) m.hide();
  }

  dispose(): void {
    for (const m of this.meshes) m.dispose();
    this.group.clear();
  }

  private show(): void {
    for (let i = 0; i < MAX_FACES; i++) {
      if (i < this.faceCount) this.meshes[i].show(this.rasters[i].current, this.rasters[i].revision);
      else this.meshes[i].hide();
    }
  }

  /** Highest terrain on the rim of the cut (32 samples), mm. */
  private groundMax(cp: CutPlane, src: NestSource): number {
    let m = -Infinity;
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2;
      m = Math.max(m, src.height(cp.c.x + Math.sin(a) * cp.radius, cp.c.z + Math.cos(a) * cp.radius));
    }
    return Math.max(m, src.height(cp.c.x, cp.c.z));
  }
}
