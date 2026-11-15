// Render-only dressing of flower heads (look-pass): near the camera, every flower head of a procedural plant (its
// look finish is a daisy, dandelion, seed clock, clover head or umbel) is drawn from parts (flowerParts.ts) in two
// instanced meshes: straps and discs. The head's own primitive stays (its finish switches to a "core" inside the
// same radius, uWorld.uFlowerMm), so collision, routes and the generation fingerprint are untouched.
// Re-selected when the camera moved FLOWER_REPLACE_MM; heads are taken up to that far beyond the radius so a head
// the shader treats as dressed always has its parts. When the part cap stops the selection early, the shader radius
// shrinks to stay inside the dressed heads (a head treated as dressed without parts would show its bare core), and
// it is 0 until the first selection and while the parts are hidden underground.
import { Group, InstancedBufferAttribute, InstancedMesh, Matrix4, type BufferGeometry, type Vector3 } from 'three';
import type { QualityPreset } from '@/render/app';
import type { Primitive } from '@/sim/types';
import type { WorldUniforms } from '../materials/uniforms';
import { createFlowerMaterials, discGeometry, strapGeometry, type FlowerMaterials } from './flowerMaterial';
import { flowerHead, flowerParts, isFlowerFinish, type FlowerHead, type FlowerPart } from './flowerParts';
import type { PrimLook } from './looks';
import { FLOWER_QUALITY, FLOWER_REPLACE_MM } from './tuning';

/** Rows along a strap (a bent ligule needs a few to stay smooth). */
const STRAP_SEGS = 5;

interface PartMesh {
  mesh: InstancedMesh;
  part: InstancedBufferAttribute;
  base: InstancedBufferAttribute;
  tip: InstancedBufferAttribute;
}

export class FlowerDressing {
  readonly group = new Group();
  private readonly mats: FlowerMaterials;
  private readonly strapGeom: BufferGeometry;
  private readonly discGeom: BufferGeometry;
  private straps!: PartMesh;
  private discs!: PartMesh;
  private heads: FlowerHead[] = [];
  private quality: QualityPreset;
  private bu = 4;
  private last = { x: Number.NaN, y: 0, z: Number.NaN };
  private parts: FlowerPart[] = [];
  /** Shader radius (uFlowerMm) of the current selection, mm: every head nearer the camera than this has its parts. */
  private dressedMm = 0;
  /** Heads and parts drawn (statistics). */
  headCount = 0;
  partCount = 0;

  constructor(private readonly uniforms: WorldUniforms, quality: QualityPreset) {
    this.group.name = 'world:flowers';
    this.quality = quality;
    this.mats = createFlowerMaterials(uniforms);
    this.strapGeom = strapGeometry(STRAP_SEGS);
    this.discGeom = discGeometry();
    this.setQuality(quality);
  }

  /** Radius within which heads are dressed, mm (0 = none). */
  get radiusMm(): number {
    return FLOWER_QUALITY[this.quality.id].radiusMm * (this.bu / 4);
  }

  /** The static primitives of a new world and their looks (null = no world). */
  setPrims(prims: readonly Primitive[] | null, look: ((p: Primitive) => PrimLook) | null, bu = 4): void {
    this.bu = bu;
    this.heads = [];
    if (prims && look) {
      for (const p of prims) {
        const l = look(p);
        if (!isFlowerFinish(l.look[0])) continue;
        this.heads.push(flowerHead(p, l.look[0], l.color ?? [1, 1, 1]));
      }
    }
    this.last.x = Number.NaN;
    this.dressedMm = this.uniforms.uFlowerMm.value = 0; // until update() selects the heads
  }

  setQuality(q: QualityPreset): void {
    this.quality = q;
    const cap = Math.max(16, FLOWER_QUALITY[q.id].maxParts);
    if (!this.straps || this.straps.part.count < cap) {
      for (const m of [this.straps, this.discs]) if (m) { this.group.remove(m.mesh); m.mesh.geometry.dispose(); m.mesh.dispose(); }
      this.straps = this.makeMesh(this.strapGeom, cap, 'world:flowers:straps');
      this.discs = this.makeMesh(this.discGeom, cap, 'world:flowers:discs');
    }
    for (const m of [this.straps, this.discs]) m.mesh.castShadow = q.shadows.enabled;
    this.dressedMm = this.uniforms.uFlowerMm.value = 0; // until update() selects the heads
    this.last.x = Number.NaN;
  }

  private makeMesh(geom: BufferGeometry, cap: number, name: string): PartMesh {
    const g = geom.clone();
    const part = new InstancedBufferAttribute(new Float32Array(cap * 4), 4);
    const base = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    const tip = new InstancedBufferAttribute(new Float32Array(cap * 3), 3);
    g.setAttribute('iPart', part); g.setAttribute('iBase', base); g.setAttribute('iTip', tip);
    const mesh = new InstancedMesh(g, this.mats.material, cap);
    mesh.name = name;
    mesh.count = 0;
    mesh.frustumCulled = false; // re-selected around the camera; bounds change with every selection
    mesh.receiveShadow = true;
    mesh.customDepthMaterial = this.mats.depth;
    this.group.add(mesh);
    return { mesh, part, base, tip };
  }

  /** Re-selects the dressed heads when the camera moved; hidden underground. */
  update(cam: Vector3, underground: number): void {
    this.group.visible = underground < 0.99;
    if (this.radiusMm <= 0 || this.heads.length === 0) {
      this.straps.mesh.count = this.discs.mesh.count = this.headCount = this.partCount = 0;
      this.dressedMm = 0;
    } else if (!(Math.hypot(cam.x - this.last.x, cam.y - this.last.y, cam.z - this.last.z) < FLOWER_REPLACE_MM)) { // NaN: never selected
      this.select(cam);
    }
    // hidden parts: every head keeps its full shader form (seen from a nest entrance)
    this.uniforms.uFlowerMm.value = this.group.visible ? this.dressedMm : 0;
  }

  private select(cam: Vector3): void {
    this.last.x = cam.x; this.last.y = cam.y; this.last.z = cam.z;
    const R = this.radiusMm;
    const reach = R + FLOWER_REPLACE_MM;
    const near = this.heads
      .map((h) => ({ h, d: Math.hypot(h.pos.x - cam.x, h.pos.y - cam.y, h.pos.z - cam.z) }))
      .filter((e) => e.d < reach)
      .sort((a, b) => a.d - b.d);
    const max = FLOWER_QUALITY[this.quality.id].maxParts;
    this.parts.length = 0;
    let heads = 0;
    this.dressedMm = R;
    for (const e of near) {
      const before = this.parts.length;
      flowerParts(e.h, this.parts);
      if (this.parts.length > max) {
        this.parts.length = before;
        // the first head left bare is e.d away; the camera may come FLOWER_REPLACE_MM closer before the next selection
        this.dressedMm = Math.max(0, Math.min(R, e.d - FLOWER_REPLACE_MM));
        break;
      }
      heads++;
    }
    this.headCount = heads;
    this.partCount = this.parts.length;
    let ns = 0, nd = 0;
    for (const p of this.parts) {
      const m = p.disc ? this.discs : this.straps;
      const k = p.disc ? nd++ : ns++;
      writePart(m, k, p);
    }
    this.commit(this.straps, ns);
    this.commit(this.discs, nd);
  }

  private commit(m: PartMesh, n: number): void {
    m.mesh.count = n;
    m.mesh.instanceMatrix.needsUpdate = true;
    m.part.needsUpdate = true; m.base.needsUpdate = true; m.tip.needsUpdate = true;
  }

  /** Triangles drawn (statistics). */
  get triangles(): number {
    return this.straps.mesh.count * STRAP_SEGS * 4 + this.discs.mesh.count * 2;
  }

  dispose(): void {
    for (const m of [this.straps, this.discs]) { m.mesh.geometry.dispose(); m.mesh.dispose(); }
    this.strapGeom.dispose();
    this.discGeom.dispose();
    this.mats.material.dispose();
    this.mats.depth.dispose();
    this.group.clear();
    this.uniforms.uFlowerMm.value = 0;
  }
}

/** Instance k of a part mesh: matrix columns = dir x len, normal x len, side x width, root. */
function writePart(m: PartMesh, k: number, p: FlowerPart): void {
  const d = p.dir, n = p.nrm;
  const s = [d[1] * n[2] - d[2] * n[1], d[2] * n[0] - d[0] * n[2], d[0] * n[1] - d[1] * n[0]];
  const sx = p.len, sy = p.len, sz = p.disc ? p.len : p.width;
  _m.set(
    d[0] * sx, n[0] * sy, s[0] * sz, p.p[0],
    d[1] * sx, n[1] * sy, s[1] * sz, p.p[1],
    d[2] * sx, n[2] * sy, s[2] * sz, p.p[2],
    0, 0, 0, 1,
  );
  m.mesh.setMatrixAt(k, _m);
  (m.part.array as Float32Array).set([p.shape, p.curl, p.transl, p.disc ? 1 : 0], k * 4);
  (m.base.array as Float32Array).set(p.base, k * 3);
  (m.tip.array as Float32Array).set(p.tip, k * 3);
}

const _m = new Matrix4();
