// Draws every solid primitive (static world + dynamic + moved objects) as InstancedMeshes, one per
// (shape geometry, material, diggable, level of detail). Instances carry rotation+translation in instanceMatrix,
// size+rounding in `iSize` and a tint in instanceColor; the shader expands the shared parametric geometry.
// Dynamic primitives are diffed every frame, so adds/removes/moves show in the very next frame.
import {
  BufferGeometry, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshDepthMaterial, Quaternion, RGBADepthPacking, Sphere, Vector3,
  Vector4, Uniform,
} from 'three';
import type { Primitive } from '@/sim/types';
import { MaterialLibrary } from '../materials/materialLibrary';
import { primMaterialDef } from '../materials/materialDefs';
import { addPatch, BREACH_UNIFORM_MAX, primVertexPatch, type BreachList } from '../materials/surfacePatch';
import { isDiggablePrim } from '../lighting/simAdapter';
import { PRIM_DETAIL, roundedBoxData, roundedCylinderData, sphereData, toBufferGeometry } from './primGeometry';
import { bucketKey, instanceShape, lodFor, primSignature, tintColor, type GeomKind, type InstanceShape, type Lod } from './primInstances';

interface Entry {
  prim: Primitive;
  sig: string;
  shape: InstanceShape;
  matrix: Matrix4;
  color: [number, number, number];
  diggable: boolean;
  lod: Lod;
  dynamic: boolean;
}

interface Bucket {
  key: string;
  geom: GeomKind;
  material: string;
  diggable: boolean;
  lod: Lod;
  mesh: InstancedMesh;
  size: InstancedBufferAttribute;
  capacity: number;
}

/** Macro albedo variation on primitives. */
const PRIM_MACRO = 0.08;

export class PrimitiveRenderer {
  readonly group = new Group();
  readonly breaches: BreachList;
  private entries = new Map<number, Entry>();
  private buckets = new Map<string, Bucket>();
  private baseGeoms = new Map<string, BufferGeometry>();
  private depthMats = new Map<string, MeshDepthMaterial>();
  private dirty = true;
  private lastCam = new Vector3(1e12, 0, 0);
  private dynamicIds = new Set<number>();
  private overridden = new Set<number>();
  private statics = new Map<number, Primitive>();
  /** Within this distance (mm, from the bounding sphere) primitives use the detailed geometry. */
  nearMm: number;
  /** Rebuilds so far (statistics / tests). */
  rebuilds = 0;

  constructor(private readonly lib: MaterialLibrary, nearMm: number) {
    this.group.name = 'world:primitives';
    this.nearMm = nearMm;
    const spheres: Vector4[] = [];
    for (let i = 0; i < BREACH_UNIFORM_MAX; i++) spheres.push(new Vector4(0, -1e9, 0, 0));
    this.breaches = { spheres: new Uniform(spheres), count: new Uniform(0) };
  }

  /** Replaces the static primitive set (new world). */
  setStatic(prims: readonly Primitive[]): void {
    for (const id of [...this.entries.keys()]) if (!this.dynamicIds.has(id)) this.entries.delete(id);
    this.statics.clear();
    this.overridden.clear();
    for (const p of prims) { this.statics.set(p.id, p); this.put(p, false); }
    this.dirty = true;
  }

  private put(p: Primitive, dynamic: boolean): void {
    const shape = instanceShape(p);
    const m = new Matrix4().compose(
      new Vector3(p.pos.x, p.pos.y, p.pos.z), new Quaternion(p.rot.x, p.rot.y, p.rot.z, p.rot.w), new Vector3(1, 1, 1),
    );
    this.entries.set(p.id, {
      prim: p, sig: primSignature(p), shape, matrix: m, color: tintColor(p, [1, 1, 1]), diggable: isDiggablePrim(p), lod: 'far', dynamic,
    });
  }

  /**
   * Syncs dynamic primitives and moved static ones. Cheap when nothing changed (one signature per dynamic prim).
   * `moved` maps static primitive id -> replacement (object moved).
   */
  syncDynamic(dynamic: readonly Primitive[], moved: ReadonlyMap<number, Primitive>): void {
    const seen = new Set<number>();
    for (const p of dynamic) {
      seen.add(p.id);
      const e = this.entries.get(p.id);
      if (!e || !e.dynamic || e.sig !== primSignature(p)) { this.put(p, true); this.dirty = true; }
    }
    for (const id of this.dynamicIds) if (!seen.has(id)) { this.entries.delete(id); this.dirty = true; }
    this.dynamicIds = seen;
    // moved static primitives: apply new overrides, restore ones no longer moved
    for (const [id, p] of moved) {
      const e = this.entries.get(id);
      if (!e || e.sig !== primSignature(p)) { this.put(p, false); this.dirty = true; }
    }
    for (const id of this.overridden) {
      if (moved.has(id)) continue;
      const orig = this.statics.get(id);
      if (orig) { this.put(orig, false); this.dirty = true; }
    }
    this.overridden = new Set(moved.keys());
  }

  /** Nearest breach spheres (diggable primitives discard inside them). */
  setBreaches(list: readonly { pos: { x: number; y: number; z: number }; r: number }[], cam: Vector3): void {
    const n = Math.min(list.length, BREACH_UNIFORM_MAX);
    const sorted = list.length > BREACH_UNIFORM_MAX
      ? [...list].sort((a, b) => cam.distanceToSquared(a.pos as Vector3) - cam.distanceToSquared(b.pos as Vector3))
      : list;
    for (let i = 0; i < n; i++) this.breaches.spheres.value[i].set(sorted[i].pos.x, sorted[i].pos.y, sorted[i].pos.z, sorted[i].r);
    this.breaches.count.value = n;
  }

  /** Re-partitions near/far when the camera moved a quarter of the near distance or the set changed. */
  update(cam: Vector3): void {
    if (!this.dirty && cam.distanceTo(this.lastCam) < this.nearMm * 0.25) return;
    this.lastCam.copy(cam);
    let lodChanged = this.dirty;
    for (const e of this.entries.values()) {
      const lod = lodFor(e.prim, e.shape.radius, cam.x, cam.y, cam.z, this.nearMm);
      if (lod !== e.lod) { e.lod = lod; lodChanged = true; }
    }
    if (lodChanged) this.rebuild();
    this.dirty = false;
  }

  private baseGeometry(geom: GeomKind, lod: Lod): BufferGeometry {
    const key = `${geom}|${lod}`;
    let g = this.baseGeoms.get(key);
    if (!g) {
      const d = PRIM_DETAIL[lod];
      g = geom === 'box' ? toBufferGeometry(roundedBoxData(d.arc), false)
        : geom === 'cyl' ? toBufferGeometry(roundedCylinderData(d.arc + 1, d.around), false)
          : toBufferGeometry(sphereData(d.around), true);
      this.baseGeoms.set(key, g);
    }
    return g;
  }

  private depthMaterial(family: 'rounded' | 'ellipsoid'): MeshDepthMaterial {
    let m = this.depthMats.get(family);
    if (!m) {
      m = new MeshDepthMaterial({ depthPacking: RGBADepthPacking });
      addPatch(m, `prim-depth-${family}`, (s) => primVertexPatch(s, family));
      this.depthMats.set(family, m);
    }
    return m;
  }

  private makeBucket(key: string, geom: GeomKind, material: string, diggable: boolean, lod: Lod, capacity: number): Bucket {
    const base = this.baseGeometry(geom, lod);
    const g = new BufferGeometry();
    for (const name of ['position', 'normal', 'aCorner']) g.setAttribute(name, base.getAttribute(name));
    g.setIndex(base.getIndex());
    const size = new InstancedBufferAttribute(new Float32Array(capacity * 4), 4);
    g.setAttribute('iSize', size);
    const family = geom === 'sphere' ? 'ellipsoid' : 'rounded';
    const mat = this.lib.surfaceMaterialFor(primMaterialDef(material), { key: `prim-${family}${diggable ? '-dig' : ''}`, space: 'instance', prim: family, macro: PRIM_MACRO }, diggable ? this.breaches : undefined);
    const mesh = new InstancedMesh(g, mat, capacity);
    mesh.name = `world:prims:${key}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = this.depthMaterial(family);
    mesh.boundingSphere = new Sphere();
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(capacity * 3), 3);
    this.group.add(mesh);
    return { key, geom, material, diggable, lod, mesh, size, capacity };
  }

  private rebuild(): void {
    this.rebuilds++;
    const groups = new Map<string, Entry[]>();
    for (const e of this.entries.values()) {
      const k = bucketKey(e.shape.geom, e.prim.material, e.diggable, e.lod);
      let list = groups.get(k);
      if (!list) groups.set(k, (list = []));
      list.push(e);
    }
    for (const [k, b] of this.buckets) {
      if (!groups.has(k)) { b.mesh.count = 0; b.mesh.visible = false; }
    }
    const lo = new Vector3(), hi = new Vector3();
    for (const [k, list] of groups) {
      const first = list[0];
      let b = this.buckets.get(k);
      if (!b || b.capacity < list.length) {
        if (b) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.dispose(); }
        let cap = 16;
        while (cap < list.length) cap *= 2;
        b = this.makeBucket(k, first.shape.geom, first.prim.material, first.diggable, first.lod, cap);
        this.buckets.set(k, b);
      }
      const colors = b.mesh.instanceColor!.array as Float32Array;
      const sizes = b.size.array as Float32Array;
      lo.set(Infinity, Infinity, Infinity);
      hi.set(-Infinity, -Infinity, -Infinity);
      let maxR = 0;
      list.forEach((e, i) => {
        b!.mesh.setMatrixAt(i, e.matrix);
        colors.set(e.color, i * 3);
        sizes.set(e.shape.size, i * 4);
        const p = e.prim.pos;
        lo.min(tmpV.set(p.x, p.y, p.z));
        hi.max(tmpV);
        maxR = Math.max(maxR, e.shape.radius);
      });
      b.mesh.count = list.length;
      b.mesh.visible = true;
      b.mesh.instanceMatrix.needsUpdate = true;
      b.mesh.instanceColor!.needsUpdate = true;
      b.size.needsUpdate = true;
      b.mesh.boundingSphere!.center.copy(lo).add(hi).multiplyScalar(0.5);
      b.mesh.boundingSphere!.radius = lo.distanceTo(hi) * 0.5 + maxR;
    }
  }

  /** Draw statistics. */
  stats(): { prims: number; buckets: number; instancesNear: number; instancesFar: number } {
    let near = 0, far = 0, buckets = 0;
    for (const b of this.buckets.values()) {
      if (!b.mesh.visible) continue;
      buckets++;
      if (b.lod === 'near') near += b.mesh.count; else far += b.mesh.count;
    }
    return { prims: this.entries.size, buckets, instancesNear: near, instancesFar: far };
  }

  has(id: number): boolean {
    return this.entries.has(id);
  }

  dispose(): void {
    for (const b of this.buckets.values()) { b.mesh.geometry.dispose(); b.mesh.dispose(); }
    for (const g of this.baseGeoms.values()) g.dispose();
    for (const m of this.depthMats.values()) m.dispose();
    this.buckets.clear();
    this.group.clear();
  }
}

const tmpV = new Vector3();
