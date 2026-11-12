/**
 * Instanced ant rendering with LOD selection + a throw-away walking sim (spike).
 *
 * One AntRenderer owns, per variant: 3 InstancedMesh (LOD0 physical + shadows, LOD1, LOD2), an optional wing mesh,
 * and lazily created carried-item meshes per (variant, item kind, near|mid). Every frame update() buckets the ants by
 * projected size (CPU frustum culling first) and rewrites the instance buffers of each bucket.
 */
import {
  Color, DynamicDrawUsage, Frustum, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, MeshPhysicalMaterial,
  PerspectiveCamera, Quaternion, Scene, Sphere, Vector3, type BufferGeometry, type Material,
} from 'three';
import type { AntVariant } from './ant-geometry';
import { makeAntDepthMaterial, makeAntMaterial, makeWingMaterial } from './ant-shader';
import { carriedGeometry, type ItemDef, type ItemKind } from './items';

export interface AntPose { raise: number; gaster: number; swell: number; gape: number }
export interface AntState {
  variant: number;
  x: number; y: number; z: number; heading: number;   // heading: radians about +Y, 0 = facing +Z
  speed: number;          // mm/s actual
  cruise: number;         // mm/s nominal (normalises aGait.y)
  targetSpeed: number;
  phase: number;          // gait cycles
  turn: number;           // rad/s
  seed: number; scale: number; tint: [number, number, number];
  idle: number;           // fidget amount when stopped
  pose: AntPose;
  item: ItemKind | null;
  forceLod?: number;
  wander?: boolean;
}

export interface LodConfig { nearPx: number; midPx: number; farPx: number; maxNear: number; debugTint: boolean }

const FLOATS = { m: 16, g: 4, p: 4, t: 4 };

class Batch {
  mesh: InstancedMesh; mat: Float32Array; gait: Float32Array; pose: Float32Array; tint: Float32Array;
  aM: InstancedBufferAttribute; aG: InstancedBufferAttribute; aP: InstancedBufferAttribute; aT: InstancedBufferAttribute;
  n = 0;
  constructor(geo: BufferGeometry, material: Material, public cap: number, shadow: Material | null) {
    this.mesh = new InstancedMesh(geo, material, cap);
    this.mesh.frustumCulled = false; // CPU culls per instance; the shader moves vertices outside static bounds
    this.mat = this.mesh.instanceMatrix.array as Float32Array;
    this.aM = this.mesh.instanceMatrix; this.aM.setUsage(DynamicDrawUsage);
    this.gait = new Float32Array(cap * 4); this.pose = new Float32Array(cap * 4); this.tint = new Float32Array(cap * 4);
    this.aG = new InstancedBufferAttribute(this.gait, 4).setUsage(DynamicDrawUsage);
    this.aP = new InstancedBufferAttribute(this.pose, 4).setUsage(DynamicDrawUsage);
    this.aT = new InstancedBufferAttribute(this.tint, 4).setUsage(DynamicDrawUsage);
    // instance attributes live on the geometry; geometries are per batch (cloned shallowly) so they do not clash
    geo.setAttribute('aGait', this.aG); geo.setAttribute('aPose', this.aP); geo.setAttribute('aTint', this.aT);
    if (shadow) { this.mesh.castShadow = true; this.mesh.customDepthMaterial = shadow; }
    this.mesh.receiveShadow = true;
    this.mesh.count = 0;
  }
  reset() { this.n = 0; }
  push(m: Matrix4, a: AntState, rel: number, tint: [number, number, number], pose?: AntPose) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    m.toArray(this.mat, i * 16);
    const ps = pose ?? a.pose;
    this.gait[i * 4] = a.phase; this.gait[i * 4 + 1] = rel; this.gait[i * 4 + 2] = Math.max(-1, Math.min(1, a.turn / 2)); this.gait[i * 4 + 3] = a.seed;
    this.pose[i * 4] = ps.raise; this.pose[i * 4 + 1] = ps.gaster; this.pose[i * 4 + 2] = ps.swell; this.pose[i * 4 + 3] = ps.gape;
    this.tint[i * 4] = tint[0]; this.tint[i * 4 + 1] = tint[1]; this.tint[i * 4 + 2] = tint[2]; this.tint[i * 4 + 3] = a.idle;
  }
  commit() {
    this.mesh.count = this.n;
    for (const [attr, k] of [[this.aM, FLOATS.m], [this.aG, 4], [this.aP, 4], [this.aT, 4]] as [InstancedBufferAttribute, number][]) {
      attr.clearUpdateRanges(); if (this.n > 0) { attr.addUpdateRange(0, this.n * k); attr.needsUpdate = true; }
    }
  }
}

interface VariantBatches { lod: Batch[]; wings: Batch | null; items: Map<string, Batch> }

export class AntRenderer {
  readonly group: Scene;
  private vb: VariantBatches[] = [];
  private frustum = new Frustum(); private pm = new Matrix4(); private tmpM = new Matrix4(); private q = new Quaternion();
  private v = new Vector3(); private s = new Vector3(); private sph = new Sphere();
  stats = { lod: [0, 0, 0, 0], culled: 0, items: 0, wings: 0 };
  lodCfg: LodConfig = { nearPx: 48, midPx: 22, farPx: 9, maxNear: 160, debugTint: false };

  constructor(scene: Scene, public variants: AntVariant[], public items: Record<ItemKind, ItemDef>, public cap: number, public shadows: boolean) {
    this.group = scene;
    for (const v of variants) {
      const p = v.params;
      const m0 = makeAntMaterial(v.rig, { physical: true, roughness: p.roughness, sheen: p.sheen, clearcoat: p.clearcoat });
      const m1 = makeAntMaterial(v.rig, { roughness: p.roughness + 0.05 });
      const depth = makeAntDepthMaterial(v.rig);
      const lod = [
        new Batch(v.lods[0]!.clone(), m0, cap, shadows ? depth : null),
        new Batch(v.lods[1]!.clone(), m1, cap, null),
        new Batch(v.lods[2]!.clone(), m1, cap, null),
        new Batch(v.lods[3]!.clone(), m1, cap, null),
      ];
      for (const b of lod) scene.add(b.mesh);
      let wings: Batch | null = null;
      if (v.wings) { wings = new Batch(v.wings.clone(), makeWingMaterial(v.rig, p.colors.wingMembrane, p.colors.wingVein), cap, null); wings.mesh.receiveShadow = false; wings.mesh.renderOrder = 2; scene.add(wings.mesh); }
      this.vb.push({ lod, wings, items: new Map() });
    }
  }

  private itemBatch(vi: number, kind: ItemKind, near: boolean): Batch {
    const key = kind + (near ? ':n' : ':m'); const vb = this.vb[vi]!;
    let b = vb.items.get(key);
    if (!b) {
      const v = this.variants[vi]!; const it = this.items[kind];
      const mat = makeAntMaterial(v.rig, { physical: it.transparent, roughness: 0.6, transparent: it.transparent, opacity: it.transparent ? 0.62 : 1 });
      if (it.transparent) { (mat as MeshPhysicalMaterial).clearcoat = 1; (mat as MeshPhysicalMaterial).clearcoatRoughness = 0.02; (mat as MeshPhysicalMaterial).sheen = 0; }
      b = new Batch(carriedGeometry(it, v), mat, near ? 400 : this.cap, near && this.shadows && !it.transparent ? makeAntDepthMaterial(v.rig) : null);
      if (it.transparent) b.mesh.renderOrder = 3;
      this.group.add(b.mesh); vb.items.set(key, b);
    }
    return b;
  }

  update(ants: AntState[], camera: PerspectiveCamera, viewportH: number) {
    this.pm.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse); this.frustum.setFromProjectionMatrix(this.pm);
    for (const vb of this.vb) { for (const b of vb.lod) b.reset(); vb.wings?.reset(); for (const b of vb.items.values()) b.reset(); }
    const pxPerMmAt1 = viewportH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    const cam = camera.position;
    this.stats = { lod: [0, 0, 0, 0], culled: 0, items: 0, wings: 0 };
    // near bucket is capped: pick the nearest ants first
    const cand: { a: AntState; d: number; px: number }[] = [];
    for (const a of ants) {
      const v = this.variants[a.variant]!; const L = v.params.bodyLength * a.scale;
      this.sph.center.set(a.x, a.y + L * 0.1, a.z); this.sph.radius = L * 0.9 * (v.params.wings === 'full' ? 1.4 : 1);
      if (!this.frustum.intersectsSphere(this.sph)) { this.stats.culled++; continue; }
      const d = Math.max(1e-3, cam.distanceTo(this.sph.center));
      cand.push({ a, d, px: (L / d) * pxPerMmAt1 });
    }
    cand.sort((x, y) => x.d - y.d);
    let nearCount = 0;
    const dbg: [number, number, number][] = [[12, 1, 1], [1, 10, 1.5], [1.5, 3, 16], [14, 12, 1]];
    for (const { a, px } of cand) {
      let lod = a.forceLod ?? (px >= this.lodCfg.nearPx ? 0 : px >= this.lodCfg.midPx ? 1 : px >= this.lodCfg.farPx ? 2 : 3);
      if (lod === 0 && a.forceLod === undefined && nearCount >= this.lodCfg.maxNear) lod = 1;
      if (lod === 0) nearCount++;
      this.stats.lod[lod]!++;
      const vb = this.vb[a.variant]!;
      this.q.setFromAxisAngle(this.v.set(0, 1, 0), a.heading); this.s.setScalar(a.scale);
      this.tmpM.compose(this.v.set(a.x, a.y, a.z), this.q, this.s);
      const rel = a.cruise > 0 ? a.speed / a.cruise : 0;
      const tint: [number, number, number] = this.lodCfg.debugTint ? [a.tint[0] * dbg[lod]![0], a.tint[1] * dbg[lod]![1], a.tint[2] * dbg[lod]![2]] : a.tint;
      vb.lod[lod]!.push(this.tmpM, a, rel, tint);
      if (vb.wings && lod < 2) { vb.wings.push(this.tmpM, a, rel, a.tint); this.stats.wings++; }
      if (a.item && lod < 2) { this.itemBatch(a.variant, a.item, lod === 0).push(this.tmpM, a, rel, [1, 1, 1]); this.stats.items++; }
    }
    for (const vb of this.vb) { for (const b of vb.lod) b.commit(); vb.wings?.commit(); for (const b of vb.items.values()) b.commit(); }
  }

  /** debug: count triangles that will be submitted (main pass) */
  submittedTris(): number {
    let t = 0;
    for (const vb of this.vb) {
      for (const b of vb.lod) t += b.n * (b.mesh.geometry.index!.count / 3);
      if (vb.wings) t += vb.wings.n * (vb.wings.mesh.geometry.index!.count / 3);
      for (const b of vb.items.values()) t += b.n * (b.mesh.geometry.index!.count / 3);
    }
    return t;
  }

  dispose() {
    for (const vb of this.vb) {
      for (const b of [...vb.lod, ...(vb.wings ? [vb.wings] : []), ...vb.items.values()]) {
        this.group.remove(b.mesh); b.mesh.geometry.dispose(); (b.mesh.material as Material).dispose(); b.mesh.dispose();
      }
    }
    this.vb = [];
  }
}

// ---------------------------------------------------------------------------------------------- spike walker sim
export function mulberry32(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** advance walkers; feet do not slide because phase advances by distance / (stride * scale) */
export function stepAnts(ants: AntState[], variants: AntVariant[], dt: number, rnd: () => number, bound: number) {
  for (const a of ants) {
    if (a.wander) {
      a.turn += (rnd() - 0.5) * 6 * dt - a.turn * 1.5 * dt;
      const r = Math.hypot(a.x, a.z);
      if (r > bound) { // steer back toward the centre
        const want = Math.atan2(-a.x, -a.z); let dh = want - a.heading; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        a.turn += Math.sign(dh) * 3 * dt;
      }
      if (rnd() < 0.08 * dt) a.targetSpeed = a.targetSpeed > 0 ? 0 : a.cruise * (0.6 + 0.6 * rnd());
    }
    a.speed += (a.targetSpeed - a.speed) * Math.min(1, dt * 6);
    if (a.speed < 0.01 * a.cruise && a.targetSpeed === 0) a.speed = 0;
    a.heading += a.turn * dt * Math.min(1, a.speed / (0.3 * a.cruise + 1e-6));
    const ds = a.speed * dt;
    a.x += Math.sin(a.heading) * ds; a.z += Math.cos(a.heading) * ds;
    const stride = variants[a.variant]!.rig.gait[0] * a.scale;
    a.phase += ds / stride;
    if (a.phase > 1e4) a.phase -= 1e4;
  }
}

export function makeAnt(variant: number, v: AntVariant, o: Partial<AntState> = {}): AntState {
  const cruise = 6 * v.params.bodyLength; // ~6 body lengths / s (L. niger 23.5-26 mm/s at 4 mm)
  return {
    variant, x: 0, y: 0, z: 0, heading: 0, speed: 0, cruise, targetSpeed: 0, phase: 0, turn: 0, seed: 0.37, scale: 1, tint: [1, 1, 1],
    idle: 0, pose: { raise: 0, gaster: 0, swell: 0, gape: 0 }, item: null, ...o,
  };
}

export { Color, Mesh, MeshStandardMaterial };
