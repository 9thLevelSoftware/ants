// Debug primitives: one InstancedMesh per (shape, material) with unit geometries scaled per instance (box,
// cylinder, ellipsoid), capsules as cached individual geometries (hemispheres do not scale). Flat material colours.
// True scale and orientation; edge rounding is ignored.
import {
  BoxGeometry, CapsuleGeometry, CylinderGeometry, Group, InstancedMesh, Matrix4, Mesh, MeshLambertMaterial, Quaternion,
  SphereGeometry, Vector3, type BufferGeometry,
} from 'three';
import type { MaterialId, Primitive } from '@/sim/types';
import { MATERIAL_COLORS } from './palette';

const UNIT: Record<'box' | 'cylinder' | 'ellipsoid', () => BufferGeometry> = {
  box: () => new BoxGeometry(2, 2, 2),
  cylinder: () => new CylinderGeometry(1, 1, 2, 20, 1),
  ellipsoid: () => new SphereGeometry(1, 20, 14),
};

const _m = new Matrix4(), _q = new Quaternion(), _p = new Vector3(), _s = new Vector3();

/** Instance scale of a unit geometry for a primitive. */
function unitScale(p: Primitive, out: Vector3): Vector3 {
  if (p.shape === 'box') return out.set(p.size.x, p.size.y, p.size.z);
  if (p.shape === 'cylinder') return out.set(p.size.x, p.size.y, p.size.x);
  return out.set(p.size.x, p.size.y, p.size.z);
}

export class DebugPrimLayer {
  readonly group = new Group();
  private materials = new Map<MaterialId, MeshLambertMaterial>();
  private geometries: BufferGeometry[] = [];
  private signature = '';
  meshCount = 0;
  instanceCount = 0;

  constructor() {
    this.group.name = 'debug-prims';
  }

  private material(id: MaterialId): MeshLambertMaterial {
    let m = this.materials.get(id);
    if (!m) { m = new MeshLambertMaterial({ color: MATERIAL_COLORS[id] ?? 0x888888 }); this.materials.set(id, m); }
    return m;
  }

  /** Cheap change key: count and ids plus the positions of dynamic primitives (they move). */
  static signatureOf(statics: readonly Primitive[], dyn: readonly Primitive[]): string {
    let h = statics.length * 31 + dyn.length;
    for (const p of dyn) h = (Math.imul(h, 16777619) ^ (p.id + Math.round(p.pos.x) * 3 + Math.round(p.pos.y) * 5 + Math.round(p.pos.z) * 7 + Math.round(p.size.y * 10))) >>> 0;
    return `${statics.length}:${dyn.length}:${h}`;
  }

  /** Rebuilds everything when the primitive set changed. */
  sync(statics: readonly Primitive[], dyn: readonly Primitive[]): void {
    const sig = DebugPrimLayer.signatureOf(statics, dyn);
    if (sig === this.signature) return;
    this.signature = sig;
    this.clear();
    const groups = new Map<string, Primitive[]>();
    const capsules: Primitive[] = [];
    for (const list of [statics, dyn]) {
      for (const p of list) {
        if (p.shape === 'capsule') { capsules.push(p); continue; }
        const key = `${p.shape}|${p.material}`;
        let arr = groups.get(key);
        if (!arr) { arr = []; groups.set(key, arr); }
        arr.push(p);
      }
    }
    for (const [key, prims] of groups) {
      const [shape, material] = key.split('|') as ['box' | 'cylinder' | 'ellipsoid', MaterialId];
      const geo = UNIT[shape]();
      this.geometries.push(geo);
      const mesh = new InstancedMesh(geo, this.material(material), prims.length);
      prims.forEach((p, i) => {
        _p.set(p.pos.x, p.pos.y, p.pos.z);
        _q.set(p.rot.x, p.rot.y, p.rot.z, p.rot.w);
        mesh.setMatrixAt(i, _m.compose(_p, _q, unitScale(p, _s)));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.group.add(mesh);
      this.meshCount++;
      this.instanceCount += prims.length;
    }
    const capsuleGeo = new Map<string, BufferGeometry>();
    for (const p of capsules) {
      const k = `${p.size.x.toFixed(3)}|${p.size.y.toFixed(3)}`;
      let geo = capsuleGeo.get(k);
      if (!geo) { geo = new CapsuleGeometry(p.size.x, 2 * p.size.y, 6, 16); capsuleGeo.set(k, geo); this.geometries.push(geo); }
      const mesh = new Mesh(geo, this.material(p.material));
      mesh.position.set(p.pos.x, p.pos.y, p.pos.z);
      mesh.quaternion.set(p.rot.x, p.rot.y, p.rot.z, p.rot.w);
      this.group.add(mesh);
      this.meshCount++;
      this.instanceCount++;
    }
  }

  clear(): void {
    for (const c of [...this.group.children]) {
      this.group.remove(c);
      if (c instanceof InstancedMesh) c.dispose();
    }
    for (const g of this.geometries) g.dispose();
    this.geometries = [];
    this.meshCount = 0;
    this.instanceCount = 0;
  }

  dispose(): void {
    this.clear();
    for (const m of this.materials.values()) m.dispose();
    this.materials.clear();
    this.signature = '';
  }
}
