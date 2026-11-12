/**
 * Geometry for the kernel demo (adapted from spikes/nest/render/meshes.ts to the production kernel and the shared
 * geom types): terrain from the kernel's heightfield, primitives from the same primitive list as the field (so
 * collision == visuals), carve-chunk meshes from kernel.meshChunk(), and a placeholder ant.
 */
import {
  BufferAttribute, BufferGeometry, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, Group, Matrix4, Mesh,
  Quaternion, SphereGeometry, Vector3, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { MaterialId, Primitive } from '@/sim/types/geom';
import { fbm2, hash2u } from '@/core/math/noise';
import type { Kernel } from '@/sim/kernel';

/** Terrain mesh sampled every `step` mm from the kernel's bilinear heightfield. */
export function terrainGeometry(k: Kernel, step: number, seed: number): BufferGeometry {
  const size = k.world.size;
  const n = Math.round(size / step) + 1;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const c0 = new Color('#7a5c3e'), c1 = new Color('#5b4430'), c2 = new Color('#8d7a55'), asphalt = new Color('#4a4a4c'), c = new Color();
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = ix * step, z = iz * step, i = ix + iz * n;
    pos[i * 3] = x; pos[i * 3 + 1] = k.field.height(x, z); pos[i * 3 + 2] = z;
    const a = fbm2(x / 35, z / 35, seed + 40, 3) * 0.5 + 0.5, b = hash2u(ix, iz, seed + 9) / 4294967296;
    c.copy(c0).lerp(c1, Math.min(1, Math.max(0, a * 1.6 - 0.3))).lerp(c2, Math.max(0, fbm2(x / 120, z / 120, seed + 3, 3) * 0.5) * 1.5);
    if (k.field.materialAt({ x, y: k.field.height(x, z) - 0.5, z }) === 'asphalt') c.copy(asphalt);
    c.multiplyScalar(0.88 + 0.24 * b);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let q = 0;
  for (let iz = 0; iz < n - 1; iz++) for (let ix = 0; ix < n - 1; ix++) {
    const a = ix + iz * n, b = a + 1, d = a + n, e = d + 1;
    idx[q++] = a; idx[q++] = d; idx[q++] = b;
    idx[q++] = b; idx[q++] = d; idx[q++] = e;
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(pos, 3));
  g.setAttribute('color', new BufferAttribute(col, 3));
  g.setIndex(new BufferAttribute(idx, 1));
  g.computeVertexNormals();
  return g;
}

export function primitiveGeometry(p: Primitive): BufferGeometry {
  const s = p.size;
  let g: BufferGeometry;
  switch (p.shape) {
    case 'box': g = new RoundedBoxGeometry(s.x * 2, s.y * 2, s.z * 2, 4, p.round); break;
    case 'ellipsoid': g = new SphereGeometry(1, 48, 32); g.scale(s.x, s.y, s.z); break;
    case 'capsule': g = new CapsuleGeometry(s.x, s.y * 2, 6, 24); break;
    case 'cylinder': g = new CylinderGeometry(s.x, s.x, s.y * 2, 40); break;
  }
  const m = new Matrix4().compose(new Vector3(p.pos.x, p.pos.y, p.pos.z), new Quaternion(p.rot.x, p.rot.y, p.rot.z, p.rot.w), new Vector3(1, 1, 1));
  g.applyMatrix4(m);
  return g;
}

export function primColor(m: MaterialId): string {
  switch (m) {
    case 'stone': return '#8b8c88';
    case 'concrete': return '#a9a59b';
    case 'plant': return '#5f8a3a';
    case 'plaster': return '#d8d2c4';
    case 'wood-sound': case 'wood-decayed': case 'bark': return '#8a5a32';
    default: return '#9a8f80';
  }
}

/** Placeholder ant: local +Z forward, +Y up, origin = body centre (on the walker level set). ~4 mm long. */
export function antGeometry(headColor = '#e8762a'): BufferGeometry {
  const paint = (g: BufferGeometry, hex: string) => {
    const c = new Color(hex), n = g.getAttribute('position').count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new BufferAttribute(a, 3));
    return g.index ? g.toNonIndexed() : g;
  };
  const gaster = new SphereGeometry(1, 16, 12); gaster.scale(0.62, 0.52, 0.95); gaster.translate(0, 0.05, -1.15);
  const thorax = new CapsuleGeometry(0.3, 0.9, 4, 10); thorax.rotateX(Math.PI / 2); thorax.translate(0, 0.08, 0.35);
  const head = new SphereGeometry(0.5, 16, 12); head.scale(1, 0.9, 1.05); head.translate(0, 0.12, 1.45);
  const jaw = new ConeGeometry(0.22, 0.6, 8); jaw.rotateX(Math.PI / 2); jaw.translate(0, 0.05, 2.05);
  const legs: BufferGeometry[] = [];
  for (let s = -1; s <= 1; s += 2) for (let i = 0; i < 3; i++) {
    const l = new CylinderGeometry(0.06, 0.06, 1.5, 5);
    l.rotateZ((s * Math.PI) / 2.6); l.rotateY(s * (i - 1) * 0.5);
    l.translate(s * 0.6, -0.25, 0.1 + (i - 1) * 0.42);
    legs.push(paint(l, '#2a1d14'));
  }
  const parts = [paint(gaster, '#3a2618'), paint(thorax, '#4a3020'), paint(head, headColor), paint(jaw, '#ffd23a'), ...legs];
  return mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }))!;
}

/** Live carve-chunk meshes built from kernel.meshChunk(). */
export class ChunkMeshes {
  readonly group = new Group();
  readonly meshes = new Map<number, Mesh>();
  tris = 0;
  constructor(private k: Kernel, private material: Material) {}

  private build(key: number): void {
    const old = this.meshes.get(key);
    if (old) { this.tris -= old.geometry.index!.count / 3; old.geometry.dispose(); this.group.remove(old); this.meshes.delete(key); }
    const m = this.k.meshChunk(key);
    if (!m) return;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(m.positions, 3));
    g.setAttribute('normal', new BufferAttribute(m.normals, 3));
    g.setAttribute('aSub', new BufferAttribute(m.substrate, 1));
    g.setIndex(new BufferAttribute(m.indices, 1));
    g.computeBoundingSphere();
    const mesh = new Mesh(g, this.material);
    mesh.matrixAutoUpdate = false;
    this.group.add(mesh);
    this.meshes.set(key, mesh);
    this.tris += m.indices.length / 3;
  }

  /** Meshes every chunk that may have a surface. */
  buildAll(): void {
    for (const key of this.k.meshKeys()) this.build(key);
    this.k.carve.takeDirty();
  }

  /** Re-meshes dirty chunks. */
  update(): number {
    const dirty = this.k.carve.takeDirty();
    for (const key of dirty) this.build(key);
    return dirty.length;
  }
}
