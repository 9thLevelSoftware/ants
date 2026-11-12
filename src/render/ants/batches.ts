/**
 * One InstancedMesh per (variant x LOD), wing mesh or carried-item mesh, with the per-instance attributes of
 * shader/vertexChunk.ts. Capacity grows by doubling; buffers are rewritten each frame and uploaded with an update
 * range covering only the used instances.
 */
import {
  BufferGeometry, DynamicDrawUsage, InstancedBufferAttribute, InstancedMesh, type Material, type Object3D,
} from 'three';

const ATTRS = ['aGait', 'aPose', 'aTint', 'aAct', 'aExtra', 'aFootA', 'aFootB'] as const;
export type InstanceAttr = (typeof ATTRS)[number];

/** A geometry that shares the source's vertex buffers (one GPU copy) but owns its instance attributes. */
function shareGeometry(src: BufferGeometry): BufferGeometry {
  const g = new BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) g.setAttribute(name, attr);
  g.setIndex(src.getIndex());
  g.boundingSphere = src.boundingSphere?.clone() ?? null;
  return g;
}

export class InstanceBatch {
  mesh!: InstancedMesh;
  /** instanceMatrix array and the per-instance vec4 arrays (same order as ATTRS). */
  m!: Float32Array;
  a: Record<InstanceAttr, Float32Array> = {} as Record<InstanceAttr, Float32Array>;
  n = 0;
  cap = 0;
  readonly tris: number;

  constructor(
    private readonly src: BufferGeometry, private readonly material: Material, private readonly parent: Object3D,
    private readonly shadow: Material | null, private readonly renderOrder = 0, initialCap = 64,
  ) {
    this.tris = (src.getIndex()?.count ?? src.getAttribute('position').count) / 3;
    this.alloc(initialCap);
  }

  private alloc(cap: number): void {
    const old = this.mesh;
    const g = shareGeometry(this.src);
    const mesh = new InstancedMesh(g, this.material, cap);
    mesh.frustumCulled = false; // culled per instance on the CPU; the shader moves vertices beyond static bounds
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    for (const k of ATTRS) {
      const arr = new Float32Array(cap * 4);
      g.setAttribute(k, new InstancedBufferAttribute(arr, 4).setUsage(DynamicDrawUsage));
      this.a[k] = arr;
    }
    if (this.shadow) { mesh.castShadow = true; mesh.customDepthMaterial = this.shadow; }
    mesh.receiveShadow = true;
    mesh.renderOrder = this.renderOrder;
    mesh.count = 0;
    mesh.visible = false;
    this.m = mesh.instanceMatrix.array as Float32Array;
    this.mesh = mesh;
    this.cap = cap;
    this.parent.add(mesh);
    if (old) {
      this.parent.remove(old);
      old.geometry.dispose(); // frees this wrapper's buffers; shared vertex buffers are re-uploaded on next use
      old.dispose();
    }
  }

  reset(): void { this.n = 0; }

  /** Reserves the next instance slot (growing when full) and returns its index. */
  next(): number {
    if (this.n >= this.cap) {
      const keep = this.n;
      const prev = { m: this.m, a: { ...this.a } };
      this.alloc(this.cap * 2);
      this.m.set(prev.m);
      for (const k of ATTRS) this.a[k].set(prev.a[k]);
      this.n = keep;
    }
    return this.n++;
  }

  /** Copies instance i of another batch into slot j of this one (carried items, wings reuse the carrier's data). */
  copyFrom(other: InstanceBatch, i: number): number {
    const j = this.next();
    const m = this.m, om = other.m;
    for (let k = 0; k < 16; k++) m[j * 16 + k] = om[i * 16 + k]!;
    for (const name of ATTRS) {
      const d = this.a[name], s = other.a[name];
      d[j * 4] = s[i * 4]!; d[j * 4 + 1] = s[i * 4 + 1]!; d[j * 4 + 2] = s[i * 4 + 2]!; d[j * 4 + 3] = s[i * 4 + 3]!;
    }
    return j;
  }

  commit(): void {
    const mesh = this.mesh; const n = this.n;
    mesh.count = n;
    mesh.visible = n > 0;
    if (n === 0) return;
    const im = mesh.instanceMatrix;
    im.clearUpdateRanges(); im.addUpdateRange(0, n * 16); im.needsUpdate = true;
    for (const k of ATTRS) {
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
