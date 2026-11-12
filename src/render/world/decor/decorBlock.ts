// One streamed block: its instance records (grass, draped, dew) and the three meshes that draw them. Records are
// generated once per visit (deterministic); per frame only instance counts, LOD geometry and shadow flags change.
import {
  Box3, InstancedBufferGeometry, InstancedInterleavedBuffer, InterleavedBufferAttribute, Mesh, Sphere, Vector3,
  type BufferAttribute, type Material,
} from 'three';
import { placeDew, DROP_STRIDE } from '../vegetation/dew';
import { placeGrass } from '../vegetation/grassPlacement';
import { blockContext } from './blockContext';
import type { GroundView } from './ground';
import { BLADE_RANK, BLADE_STRIDE, DRAPED_RANK, DRAPED_STRIDE, hashFloats } from './instances';
import { placeDraped } from './placement';
import { mossGeometry } from './mossMaterial';
import { MOSS_PATCH_INDICES, placePrimMoss } from './primMoss';
import type { BlockRef } from './tiles';

export interface BaseGeometry {
  position: BufferAttribute;
  index: BufferAttribute;
  normal?: BufferAttribute;
  tris: number;
}

/** Instanced geometry over an interleaved record buffer; attribute name -> float offset (4 floats each). */
function instanced(records: Float32Array, stride: number, layout: Record<string, number>): InstancedBufferGeometry {
  const g = new InstancedBufferGeometry();
  const buf = new InstancedInterleavedBuffer(records, stride, 1);
  for (const [name, off] of Object.entries(layout)) g.setAttribute(name, new InterleavedBufferAttribute(buf, 4, off));
  g.instanceCount = 0;
  return g;
}

function setBase(g: InstancedBufferGeometry, base: BaseGeometry): void {
  if (g.getAttribute('position') === base.position) return;
  g.setAttribute('position', base.position);
  if (base.normal) g.setAttribute('normal', base.normal);
  g.setIndex(base.index);
}

/** Dispose an instanced geometry without freeing the shared base buffers of other blocks. */
function disposeInstanced(g: InstancedBufferGeometry): void {
  g.deleteAttribute('position');
  g.deleteAttribute('normal');
  g.setIndex(null);
  g.dispose();
}

export class DecorBlock {
  readonly grass: Float32Array;
  readonly draped: Float32Array;
  readonly hash: number;
  readonly grassMesh: Mesh<InstancedBufferGeometry> | null = null;
  readonly drapedMesh: Mesh<InstancedBufferGeometry> | null = null;
  readonly mossMesh: Mesh | null = null;
  readonly mossPatches: number;
  dew: Float32Array | null = null;
  dewMesh: Mesh<InstancedBufferGeometry> | null = null;
  private readonly bounds: Sphere;

  constructor(readonly ref: BlockRef, ground: GroundView, mats: { grass: Material; grassDepth: Material; draped: Material; moss: Material }) {
    const ctx = blockContext(ground, ref);
    this.grass = placeGrass(ctx);
    this.draped = placeDraped(ctx);
    const moss = placePrimMoss(ctx);
    this.mossPatches = moss.patches;
    this.hash = hashFloats(this.grass, this.draped, moss.position);
    const mg = mossGeometry(moss);
    if (mg) {
      this.mossMesh = new Mesh(mg, mats.moss);
      this.mossMesh.name = `decor:moss:${ref.key}`;
      this.mossMesh.receiveShadow = true;
    }
    const box = new Box3(new Vector3(ref.x0, Infinity, ref.z0), new Vector3(ref.x1, -Infinity, ref.z1));
    for (let i = 0; i < 9; i++) {
      const y = ground.height(ref.x0 + ((i % 3) / 2) * (ref.x1 - ref.x0), ref.z0 + (Math.floor(i / 3) / 2) * (ref.z1 - ref.z0));
      box.min.y = Math.min(box.min.y, y); box.max.y = Math.max(box.max.y, y);
    }
    let hmax = 0;
    for (let o = 0; o < this.grass.length; o += BLADE_STRIDE) {
      hmax = Math.max(hmax, this.grass[o + 4]);
      box.min.y = Math.min(box.min.y, this.grass[o + 1]); box.max.y = Math.max(box.max.y, this.grass[o + 1]);
    }
    for (let o = 0; o < this.draped.length; o += DRAPED_STRIDE) if (this.draped[o + 7] > -1e8) box.max.y = Math.max(box.max.y, this.draped[o + 7]);
    box.min.y -= 50; box.max.y += 50 + hmax;
    this.bounds = box.getBoundingSphere(new Sphere());
    this.bounds.radius += 300; // leaves overhang their tile, blades lean and sway
    if (this.grass.length) {
      const g = instanced(this.grass, BLADE_STRIDE, { iRoot: 0, iShape: 4, iBend: 8 });
      g.boundingSphere = this.bounds;
      const m = new Mesh(g, mats.grass);
      m.customDepthMaterial = mats.grassDepth;
      m.name = `decor:grass:${ref.key}`;
      m.receiveShadow = true;
      this.grassMesh = m;
    }
    if (this.draped.length) {
      const g = instanced(this.draped, DRAPED_STRIDE, { iA: 0, iB: 4, iC: 8 });
      g.boundingSphere = this.bounds;
      const m = new Mesh(g, mats.draped);
      m.name = `decor:draped:${ref.key}`;
      m.receiveShadow = true;
      this.drapedMesh = m;
    }
  }

  /** Dew droplet records and mesh (made on first need: only near blocks on dewy mornings). */
  ensureDew(seed: number, material: Material, base: BaseGeometry): Mesh<InstancedBufferGeometry> | null {
    if (this.dewMesh || !this.grass.length) return this.dewMesh;
    const recs = placeDew(this.grass, seed ^ this.ref.key);
    // sort by the droplet rank (field 15) so a dew level draws a prefix
    const n = recs.length / DROP_STRIDE, order = Array.from({ length: n }, (_, i) => i);
    order.sort((a, b) => recs[a * DROP_STRIDE + 15] - recs[b * DROP_STRIDE + 15] || a - b);
    const sorted = new Float32Array(recs.length);
    order.forEach((src, i) => sorted.set(recs.subarray(src * DROP_STRIDE, src * DROP_STRIDE + DROP_STRIDE), i * DROP_STRIDE));
    this.dew = sorted;
    if (!n) return null;
    const g = instanced(sorted, DROP_STRIDE, { iRoot: 0, iShape: 4, iBend: 8, iDrop: 12 });
    setBase(g, base);
    g.boundingSphere = this.bounds;
    this.dewMesh = new Mesh(g, material);
    this.dewMesh.name = `decor:dew:${this.ref.key}`;
    return this.dewMesh;
  }

  setGrass(count: number, base: BaseGeometry, castShadow: boolean): void {
    const m = this.grassMesh;
    if (!m) return;
    setBase(m.geometry, base);
    m.geometry.instanceCount = count;
    m.visible = count > 0;
    m.castShadow = castShadow;
  }

  setDraped(count: number, base: BaseGeometry): void {
    const m = this.drapedMesh;
    if (!m) return;
    setBase(m.geometry, base);
    m.geometry.instanceCount = count;
    m.visible = count > 0;
  }

  /** Draws the first `count` baked moss patches (they are sorted by rank). */
  setMoss(count: number): void {
    const m = this.mossMesh;
    if (!m) return;
    m.geometry.setDrawRange(0, count * MOSS_PATCH_INDICES);
    m.visible = count > 0;
  }

  get mossDrawn(): number {
    const m = this.mossMesh;
    return m?.visible ? Math.min(this.mossPatches, Math.round(m.geometry.drawRange.count / MOSS_PATCH_INDICES)) : 0;
  }

  setDew(count: number): void {
    if (!this.dewMesh) return;
    this.dewMesh.geometry.instanceCount = count;
    this.dewMesh.visible = count > 0;
  }

  get grassCount(): number { return this.grass.length / BLADE_STRIDE; }
  get drapedCount(): number { return this.draped.length / DRAPED_STRIDE; }
  static readonly GRASS_RANK = BLADE_RANK;
  static readonly DRAPED_RANK = DRAPED_RANK;

  meshes(): Mesh[] {
    return [this.grassMesh, this.drapedMesh, this.dewMesh, this.mossMesh].filter((m): m is Mesh => !!m);
  }

  dispose(): void {
    for (const m of [this.grassMesh, this.drapedMesh, this.dewMesh]) if (m) { m.removeFromParent(); disposeInstanced(m.geometry); }
    if (this.mossMesh) { this.mossMesh.removeFromParent(); this.mossMesh.geometry.dispose(); }
  }
}
