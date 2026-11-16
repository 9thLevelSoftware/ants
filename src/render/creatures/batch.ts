/**
 * One InstancedMesh per (creature look x detail x sub-mesh) with the per-instance attributes of
 * shader/creatureChunk.ts. Capacity grows by doubling; buffers are rewritten each frame and only the used range is
 * uploaded (same scheme as src/render/ants/batches.ts, with the creature attribute set).
 */
import {
  BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type Material, type Object3D,
} from 'three';

export const CR_ATTRS = ['aAnim', 'aPose', 'aTint'] as const;
export type CrAttr = (typeof CR_ATTRS)[number];
/** Floats per instance: matrix 16 + 3 x vec4. */
export const CR_STRIDE = 28;

function shareGeometry(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  g.setIndex(src.getIndex());
  g.boundingSphere = src.boundingSphere?.clone() ?? null;
  return g;
}

export class CreatureBatch {
  mesh!: InstancedMesh;
  m!: Float32Array;
  a = {} as Record<CrAttr, Float32Array>;
  n = 0;
  cap = 0;
  readonly tris: number;
  /** Casts shadows when the quality allows (near detail only). */
  shadowCaster: boolean;

  constructor(
    private readonly src: BufferGeometry, private readonly material: Material, private readonly parent: Object3D,
    private readonly depth: Material | null, private readonly renderOrder = 0, initialCap = 16,
  ) {
    this.tris = (src.getIndex()?.count ?? src.getAttribute('position').count) / 3;
    this.shadowCaster = !!depth;
    this.alloc(initialCap);
  }

  private alloc(cap: number): void {
    const old = this.mesh;
    const g = shareGeometry(this.src);
    const mesh = new InstancedMesh(g, this.material, cap);
    mesh.frustumCulled = false; // culled per instance on the CPU
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (const k of CR_ATTRS) {
      const arr = new Float32Array(cap * 4);
      g.setAttribute(k, new InstancedBufferAttribute(arr, 4).setUsage(DynamicDrawUsage));
      this.a[k] = arr;
    }
    if (this.depth) mesh.customDepthMaterial = this.depth;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.renderOrder = this.renderOrder;
    mesh.count = 0;
    mesh.visible = false;
    mesh.name = 'creature-batch';
    this.m = mesh.instanceMatrix.array as Float32Array;
    this.mesh = mesh;
    this.cap = cap;
    this.parent.add(mesh);
    if (old) { this.parent.remove(old); old.geometry.dispose(); old.dispose(); }
  }

  setShadows(on: boolean): void { this.mesh.castShadow = on && this.shadowCaster; }

  reset(): void { this.n = 0; }

  /** Reserves the next slot (growing when full) and returns its index. */
  next(): number {
    if (this.n >= this.cap) {
      const keep = this.n, m = this.m, a = { ...this.a }, shadow = this.mesh.castShadow;
      this.alloc(this.cap * 2);
      this.m.set(m);
      for (const k of CR_ATTRS) this.a[k].set(a[k]);
      this.n = keep;
      this.mesh.castShadow = shadow;
    }
    return this.n++;
  }

  /** Copies a staged instance (CR_STRIDE floats at `o`) into the next slot. */
  push(S: Float32Array, o: number): number {
    const j = this.next();
    const m = this.m, mj = j * 16;
    for (let k = 0; k < 16; k++) m[mj + k] = S[o + k]!;
    const aj = j * 4;
    const A = this.a.aAnim, P = this.a.aPose, T = this.a.aTint;
    A[aj] = S[o + 16]!; A[aj + 1] = S[o + 17]!; A[aj + 2] = S[o + 18]!; A[aj + 3] = S[o + 19]!;
    P[aj] = S[o + 20]!; P[aj + 1] = S[o + 21]!; P[aj + 2] = S[o + 22]!; P[aj + 3] = S[o + 23]!;
    T[aj] = S[o + 24]!; T[aj + 1] = S[o + 25]!; T[aj + 2] = S[o + 26]!; T[aj + 3] = S[o + 27]!;
    return j;
  }

  commit(): void {
    const mesh = this.mesh, n = this.n;
    mesh.count = n;
    mesh.visible = n > 0;
    if (n === 0) return;
    const im = mesh.instanceMatrix;
    im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
    for (const k of CR_ATTRS) {
      const at = mesh.geometry.getAttribute(k) as InstancedBufferAttribute;
      at.clearUpdateRanges(); at.addUpdateRange(0, n * 4); at.needsUpdate = true;
    }
  }

  dispose(): void {
    this.parent.remove(this.mesh);
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}
