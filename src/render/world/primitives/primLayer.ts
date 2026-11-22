// The meshes of one PrimSet (the static world, or the dynamic primitives): one InstancedMesh per batch and level
// of detail. A partition pass writes the visible instances into the meshes' buffers; a mesh uploads only when its
// visible list actually changed, and then only the used range.
import { InstancedBufferAttribute, InstancedMesh, Sphere, type BufferAttribute, type Group } from 'three';
import type { BatchDef, PartitionView, PrimSet } from './primCells';
import { bucketKey, LODS, type Lod } from './primInstances';

/** Builds the shared geometry + material of a batch mesh (provided by the PrimitiveRenderer). */
export type BatchMeshFactory = (def: BatchDef, lod: Lod, capacity: number, name: string) => { mesh: InstancedMesh; size: InstancedBufferAttribute; look: InstancedBufferAttribute; foot: InstancedBufferAttribute };

interface BatchMesh {
  mesh: InstancedMesh;
  size: InstancedBufferAttribute;
  look: InstancedBufferAttribute;
  foot: InstancedBufferAttribute;
  lod: Lod;
  capacity: number;
  /** Instances written by the running pass, and a hash of their record indices. */
  n: number;
  hash: number;
  lastHash: number;
  maxR: number;
  lo: [number, number, number];
  hi: [number, number, number];
}

/** Far-detail batches cast shadows only if they hold a primitive at least this big (bounding radius, mm). */
const FAR_SHADOW_MIN_RADIUS = 40;

export class PrimLayer {
  set: PrimSet | null = null;
  /** meshes[batch][LODS index] */
  private meshes: BatchMesh[][] = [];
  /** Mesh uploads so far (statistics / tests). */
  uploads = 0;

  /** @param group where the meshes go (the PrimitiveRenderer's group: callers and tests see one flat list) */
  constructor(private readonly prefix: string, private readonly factory: BatchMeshFactory, private readonly group: Group) {}

  /**
   * Replaces the set. Meshes are kept per batch name and reused while their capacity suffices (the dynamic layer
   * gets a new set whenever a dynamic primitive changes); meshes no batch of the new set uses are disposed.
   */
  setSet(set: PrimSet | null): void {
    this.set = set;
    const old = new Map<string, BatchMesh>();
    for (const pair of this.meshes) for (const b of pair) old.set(b.mesh.name, b);
    this.meshes = [];
    if (set) {
      this.meshes = set.batches.map((def) => LODS.map((lod) => {
        const name = `${this.prefix}${bucketKey(def.geom, def.material, def.diggable, lod)}`;
        const prev = old.get(name);
        if (prev && prev.capacity >= def.count) {
          old.delete(name);
          prev.lastHash = -1; // same name, different record indices
          return prev;
        }
        let cap = 16;
        while (cap < def.count) cap *= 2;
        const { mesh, size, look, foot } = this.factory(def, lod, cap, name);
        mesh.count = 0;
        mesh.visible = false;
        this.group.add(mesh);
        return { mesh, size, look, foot, lod, capacity: cap, n: 0, hash: 0, lastHash: -1, maxR: 0, lo: [0, 0, 0], hi: [0, 0, 0] } as BatchMesh;
      }));
    }
    for (const b of old.values()) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.dispose(); }
  }

  /** Writes the visible instances for a view and uploads the meshes whose content changed. */
  partition(v: PartitionView): void {
    const set = this.set;
    if (!set) return;
    for (const pair of this.meshes) for (const b of pair) {
      b.n = 0; b.hash = 0x811c9dc5; b.maxR = 0;
      b.lo[0] = b.lo[1] = b.lo[2] = Infinity;
      b.hi[0] = b.hi[1] = b.hi[2] = -Infinity;
    }
    const { matrices, colors, sizes, looks, foot, pos, radius } = set;
    set.partition(v, (i, batch, lod) => {
      const b = this.meshes[batch][lod === 'near' ? 0 : lod === 'far' ? 1 : 2];
      const k = b.n++;
      (b.mesh.instanceMatrix.array as Float32Array).set(matrices.subarray(i * 16, i * 16 + 16), k * 16);
      (b.mesh.instanceColor!.array as Float32Array).set(colors.subarray(i * 3, i * 3 + 3), k * 3);
      (b.size.array as Float32Array).set(sizes.subarray(i * 4, i * 4 + 4), k * 4);
      (b.look.array as Float32Array).set(looks.subarray(i * 4, i * 4 + 4), k * 4);
      (b.foot.array as Float32Array)[k] = foot[i];
      b.hash = Math.imul(b.hash ^ i, 0x01000193);
      const r = radius[i];
      if (r > b.maxR) b.maxR = r;
      for (let a = 0; a < 3; a++) {
        const p = pos[i * 3 + a];
        if (p < b.lo[a]) b.lo[a] = p;
        if (p > b.hi[a]) b.hi[a] = p;
      }
    });
    for (const pair of this.meshes) for (const b of pair) this.commit(b);
  }

  /** Marks every mesh for upload on the next pass (the set's instance data changed in place). */
  invalidate(): void {
    for (const pair of this.meshes) for (const b of pair) b.lastHash = -1;
  }

  private commit(b: BatchMesh): void {
    const m = b.mesh;
    m.visible = b.n > 0;
    const changed = b.n !== m.count || b.hash !== b.lastHash;
    m.count = b.n;
    if (!changed || b.n === 0) { if (b.n === 0) b.lastHash = b.hash; return; }
    b.lastHash = b.hash;
    this.uploads++;
    upload(m.instanceMatrix, b.n * 16);
    upload(m.instanceColor!, b.n * 3);
    upload(b.size, b.n * 4);
    upload(b.look, b.n * 4);
    upload(b.foot, b.n);
    // distant pebbles' shadows are sub-texel: skip them in the shadow pass
    m.castShadow = b.lod === 'near' || b.maxR >= FAR_SHADOW_MIN_RADIUS;
    const s = m.boundingSphere ?? (m.boundingSphere = new Sphere());
    s.center.set((b.lo[0] + b.hi[0]) / 2, (b.lo[1] + b.hi[1]) / 2, (b.lo[2] + b.hi[2]) / 2);
    s.radius = Math.hypot(b.hi[0] - b.lo[0], b.hi[1] - b.lo[1], b.hi[2] - b.lo[2]) / 2 + b.maxR;
  }

  /** Visible meshes and instances per level of detail. */
  stats(): { meshes: number; near: number; far: number; tiny: number } {
    const out = { meshes: 0, near: 0, far: 0, tiny: 0 };
    for (const pair of this.meshes) for (const b of pair) {
      if (!b.mesh.visible || b.mesh.count === 0) continue;
      out.meshes++;
      out[b.lod] += b.mesh.count;
    }
    return out;
  }

  private disposeMeshes(): void {
    for (const pair of this.meshes) for (const b of pair) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.dispose(); }
    this.meshes = [];
  }

  dispose(): void {
    this.disposeMeshes();
    this.set = null;
  }
}

function upload(attr: BufferAttribute, count: number): void {
  attr.clearUpdateRanges();
  attr.addUpdateRange(0, count);
  attr.needsUpdate = true;
}
