/**
 * Loose brood and items (on floors, in brood piles, middens): one InstancedMesh per mesh key with a static material
 * (per-vertex roughness, subtle highlight rim). Brood and pile items are laid out by PileLayout so that none passes
 * through another and elongated brood packs side by side.
 */
import {
  DynamicDrawUsage, Frustum, InstancedBufferAttribute, InstancedMesh, Matrix4, MeshStandardMaterial, Sphere, Vector3,
  type Object3D, type PerspectiveCamera,
} from 'three';
import { hash01 } from '../antState';
import type { SharedAntUniforms } from '../shader/materials';
import type { ItemDef } from './itemDef';
import { PILE_JITTER, PileLayout, type Footprint } from './pileLayout';

export interface LooseInstance { key: string; x: number; y: number; z: number; sizeMm: number; id: number; highlight: number; pile: boolean }

function looseMaterial(def: ItemDef, shared: SharedAntUniforms): MeshStandardMaterial {
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, transparent: def.transparent, opacity: def.transparent ? 0.62 : 1 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uHiWarm = shared.uHiWarm; sh.uniforms.uHiCool = shared.uHiCool;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aRig;\nattribute float aHi;\nvarying float vItemRough;\nvarying float vAntHi;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvItemRough = aRig.w; vAntHi = aHi;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vItemRough;\nvarying float vAntHi;\nuniform vec3 uHiWarm;\nuniform vec3 uHiCool;')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = vItemRough;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  if (abs(vAntHi) > 0.001) {
    float fr = pow(1.0 - clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0), 2.0);
    totalEmissiveRadiance += (vAntHi > 0.0 ? uHiWarm : uHiCool) * abs(vAntHi) * (fr + 0.015);
  }`);
  };
  mat.customProgramCacheKey = () => `ant-item-loose${def.transparent ? '-t' : ''}`;
  return mat;
}

class LooseBatch {
  mesh!: InstancedMesh; hi!: Float32Array; cap = 0; n = 0;
  constructor(readonly def: ItemDef, private readonly mat: MeshStandardMaterial, private readonly parent: Object3D, private readonly shadows: boolean) { this.alloc(64); }
  private alloc(cap: number): void {
    const old = this.mesh;
    const g = this.def.ground.clone();
    this.hi = new Float32Array(cap);
    g.setAttribute('aHi', new InstancedBufferAttribute(this.hi, 1).setUsage(DynamicDrawUsage));
    const m = new InstancedMesh(g, this.mat, cap);
    m.instanceMatrix.setUsage(DynamicDrawUsage);
    m.frustumCulled = false; m.castShadow = this.shadows && !this.def.transparent; m.receiveShadow = true; m.count = 0;
    if (this.def.transparent) m.renderOrder = 3;
    if (old) {
      (m.instanceMatrix.array as Float32Array).set(old.instanceMatrix.array as Float32Array);
      this.parent.remove(old); old.geometry.dispose(); old.dispose();
    }
    this.mesh = m; this.cap = cap; this.parent.add(m);
  }
  push(mat: Matrix4, hi: number): void {
    if (this.n >= this.cap) { const oldHi = this.hi; this.alloc(this.cap * 2); this.hi.set(oldHi); }
    mat.toArray(this.mesh.instanceMatrix.array, this.n * 16);
    this.hi[this.n++] = hi;
  }
  commit(): void {
    const m = this.mesh; m.count = this.n; m.visible = this.n > 0;
    if (!this.n) return;
    m.instanceMatrix.clearUpdateRanges(); m.instanceMatrix.addUpdateRange(0, this.n * 16); m.instanceMatrix.needsUpdate = true;
    const a = m.geometry.getAttribute('aHi') as InstancedBufferAttribute;
    a.clearUpdateRanges(); a.addUpdateRange(0, this.n); a.needsUpdate = true;
  }
  dispose(): void { this.parent.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.dispose(); }
}

export class LooseItemRenderer {
  private batches = new Map<string, LooseBatch>();
  private mats = new Map<string, MeshStandardMaterial>();
  private frustum = new Frustum(); private pm = new Matrix4(); private m = new Matrix4(); private sph = new Sphere();
  private layout = new PileLayout();
  private footprints = new Map<ItemDef, Footprint>();
  private fp: Footprint = { x: 0, y: 0, z: 0 };
  private v = new Vector3(); private s = new Vector3();
  drawn = 0; culled = 0;

  constructor(private readonly parent: Object3D, private readonly shared: SharedAntUniforms, private readonly getDef: (key: string) => ItemDef, public shadows: boolean) {}

  /** Draws this frame's loose instances (camera matrices must be current). */
  update(list: readonly LooseInstance[], camera: PerspectiveCamera, viewportH: number, minPx: number, maxItems: number): void {
    for (const b of this.batches.values()) b.n = 0;
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pm);
    const pxPerMm = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    this.drawn = 0; this.culled = 0;
    // pile layout covers every pile item (also off-screen ones), so what is visible does not depend on the camera
    let maxExtent = 0;
    for (const it of list) {
      if (it.pile) { const f = this.footprint(it.key, it.sizeMm); maxExtent = Math.max(maxExtent, f.x, f.z); }
    }
    this.layout.begin(maxExtent);
    for (const it of list) {
      if (this.drawn >= maxItems) { this.culled++; continue; }
      let x = it.x, y = it.y, z = it.z, yaw: number;
      if (it.pile) {
        const f = this.footprint(it.key, it.sizeMm);
        this.layout.place(x, y, z, f);
        x = this.layout.out.x; y = this.layout.out.y; z = this.layout.out.z;
        yaw = (hash01(it.id) * 2 - 1) * PILE_JITTER;
      } else yaw = hash01(it.id) * Math.PI * 2;
      this.sph.center.set(x, y + it.sizeMm * 0.3, z); this.sph.radius = it.sizeMm * 0.8;
      if (!this.frustum.intersectsSphere(this.sph)) { this.culled++; continue; }
      const d = Math.max(1e-3, camera.position.distanceTo(this.sph.center));
      if ((it.sizeMm / d) * pxPerMm < minPx && it.highlight === 0) { this.culled++; continue; }
      const def = this.getDef(it.key);
      const sc = it.sizeMm / def.nominalMm;
      this.m.makeRotationY(yaw).scale(this.s.setScalar(sc)).setPosition(this.v.set(x, y, z));
      this.batch(def).push(this.m, it.highlight);
      this.drawn++;
    }
    for (const b of this.batches.values()) { b.mesh.castShadow = this.shadows && !b.def.transparent; b.commit(); }
  }

  /** Ground footprint of an item drawn at sizeMm (extents of its ground mesh, scaled). Reuses one object. */
  private footprint(key: string, sizeMm: number): Footprint {
    const def = this.getDef(key);
    let f = this.footprints.get(def);
    if (!f) {
      def.ground.computeBoundingBox();
      const bb = def.ground.boundingBox!;
      f = { x: bb.max.x - bb.min.x, y: bb.max.y - bb.min.y, z: bb.max.z - bb.min.z };
      this.footprints.set(def, f);
    }
    const sc = sizeMm / def.nominalMm; const o = this.fp;
    o.x = f.x * sc; o.y = f.y * sc; o.z = f.z * sc;
    return o;
  }

  private batch(def: ItemDef): LooseBatch {
    let b = this.batches.get(def.kind);
    if (!b) {
      const mk = def.transparent ? 't' : 'o';
      let mat = this.mats.get(def.kind + mk);
      if (!mat) { mat = looseMaterial(def, this.shared); this.mats.set(def.kind + mk, mat); }
      b = new LooseBatch(def, mat, this.parent, this.shadows);
      this.batches.set(def.kind, b);
    }
    return b;
  }

  get drawCalls(): number { let n = 0; for (const b of this.batches.values()) if (b.n > 0) n++; return n; }
  get triangles(): number { let t = 0; for (const b of this.batches.values()) t += b.n * b.def.tris; return t; }

  dispose(): void {
    for (const b of this.batches.values()) b.dispose();
    for (const m of this.mats.values()) m.dispose();
    this.batches.clear(); this.mats.clear();
  }
}
