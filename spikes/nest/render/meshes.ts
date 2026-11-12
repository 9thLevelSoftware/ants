/**
 * Geometry builders for the nest spike: terrain, primitives (same primitive list as the collision field), carve-chunk
 * meshes, placeholder ant, cutaway slice texture.
 */
import {
  BufferAttribute, BufferGeometry, CapsuleGeometry, Color, ConeGeometry, CylinderGeometry, DataTexture, Group, LinearFilter,
  Matrix4, Mesh, RGBAFormat, SphereGeometry, SRGBColorSpace, UnsignedByteType, type Material,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { World, Primitive } from '../sim/world';
import type { CarveGrid } from '../sim/carve';
import { keyToChunk } from '../sim/carve';
import { meshChunk } from '../sim/mc';
import type { Field } from '../sim/field';
import { fbm2, hash2 } from '../sim/rng';

/** terrain mesh sampled every `step` mm from the bilinear heightfield (vertices coincide with H exactly) */
export function terrainGeometry(world: World, size: number, step: number, seed: number): BufferGeometry {
  const n = Math.round(size / step) + 1;
  const pos = new Float32Array(n * n * 3), col = new Float32Array(n * n * 3);
  const c0 = new Color('#7a5c3e'), c1 = new Color('#5b4430'), c2 = new Color('#8d7a55'), c = new Color();
  for (let iz = 0; iz < n; iz++) for (let ix = 0; ix < n; ix++) {
    const x = ix * step, z = iz * step, i = ix + iz * n;
    pos[i * 3] = x; pos[i * 3 + 1] = world.height(x, z); pos[i * 3 + 2] = z;
    const a = fbm2(x / 35, z / 35, seed + 40), b = hash2(ix, iz, seed + 9);
    c.copy(c0).lerp(c1, Math.min(1, Math.max(0, a * 1.6 - 0.3))).lerp(c2, Math.max(0, fbm2(x / 120, z / 120, seed + 3) - 0.55) * 1.5);
    c.multiplyScalar(0.88 + 0.24 * b);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  const idx = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let iz = 0; iz < n - 1; iz++) for (let ix = 0; ix < n - 1; ix++) {
    const a = ix + iz * n, b = a + 1, d = a + n, e = d + 1;
    // CCW seen from above (+Y): a, d, b  and b, d, e
    idx[k++] = a; idx[k++] = d; idx[k++] = b;
    idx[k++] = b; idx[k++] = d; idx[k++] = e;
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
  switch (p.kind) {
    case 'roundbox': g = new RoundedBoxGeometry(s[0] * 2, s[1] * 2, s[2] * 2, 4, p.round); break;
    case 'ellipsoid': g = new SphereGeometry(1, 48, 32); g.scale(s[0], s[1], s[2]); break;
    case 'capsule': g = new CapsuleGeometry(s[0], s[1] * 2, 6, 24); break;
    case 'cylinder': g = new CylinderGeometry(s[0], s[0], s[1] * 2, 40); break;
  }
  const r = p.rot;
  const m = new Matrix4().set(r[0], r[1], r[2], p.pos[0], r[3], r[4], r[5], p.pos[1], r[6], r[7], r[8], p.pos[2], 0, 0, 0, 1);
  g.applyMatrix4(m);
  return g;
}

export const PRIM_COLORS: Record<Primitive['material'], string> = {
  stone: '#8b8c88', concrete: '#a9a59b', plant: '#5f8a3a', wood: '#8a5a32', plaster: '#d8d2c4',
};

/** placeholder ant: local +Z = forward, +Y = up, origin = body centre (on the walker level set). ~4 mm long. */
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
  const g = mergeGeometries(parts.map((p) => { p.deleteAttribute('uv'); return p; }));
  return g!;
}

/** live carve-chunk meshes */
export class ChunkMeshes {
  readonly group = new Group();
  readonly meshes = new Map<number, Mesh>();
  readonly timings: number[] = [];
  tris = 0;
  constructor(private grid: CarveGrid, private field: Field, private material: Material) {}

  /** re-mesh every dirty chunk; returns {chunks, ms} */
  update(): { chunks: number; ms: number } {
    const t0 = performance.now();
    let n = 0;
    // discard attribute = SOIL distance only: cavity walls exist only where soil was carved; walls running into a
    // hard primitive are hidden by it anyway, while min(soil, hard) let linear interpolation extend slivers of wall
    // out of the slab into open air ("fins" at the slab-edge exit)
    const w = this.field.world;
    const sub = (x: number, y: number, z: number) => w.fSoil(x, y, z);
    for (const key of this.grid.dirty) {
      const [cx, cy, cz] = keyToChunk(key);
      const c0 = performance.now();
      const m = meshChunk(this.grid, cx, cy, cz, sub);
      this.timings.push(performance.now() - c0);
      n++;
      const old = this.meshes.get(key);
      if (old) { this.tris -= (old.geometry.index!.count / 3); old.geometry.dispose(); this.group.remove(old); this.meshes.delete(key); }
      if (!m) continue;
      const g = new BufferGeometry();
      g.setAttribute('position', new BufferAttribute(m.positions, 3));
      g.setAttribute('normal', new BufferAttribute(m.normals, 3));
      g.setAttribute('aSub', new BufferAttribute(m.sub, 1));
      g.setIndex(new BufferAttribute(m.indices, 1));
      g.computeBoundingSphere();
      const mesh = new Mesh(g, this.material);
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
      this.meshes.set(key, mesh);
      this.tris += m.indices.length / 3;
    }
    this.grid.dirty.clear();
    return { chunks: n, ms: performance.now() - t0 };
  }

  gpuBytes(): number {
    let b = 0;
    for (const m of this.meshes.values()) {
      const g = m.geometry;
      for (const name of ['position', 'normal', 'aSub']) b += (g.getAttribute(name).array as Float32Array).byteLength;
      b += (g.index!.array as Uint16Array).byteLength;
    }
    return b;
  }
}

/**
 * Cross-section texture for the cutaway plane z = zc, covering x in [x0, x1], y in [y0, y1] at `res` mm per texel.
 * rgb = soil (depth-banded, noisy) or stone colour; alpha = solidness (0.5 at f = 0, linear over +-1 mm).
 */
export function sliceTexture(field: Field, zc: number, x0: number, x1: number, y0: number, y1: number, res: number,
  seed: number, tex?: DataTexture): DataTexture {
  const w = Math.round((x1 - x0) / res), h = Math.round((y1 - y0) / res);
  const data = tex && tex.image.width === w && tex.image.height === h ? (tex.image.data as Uint8Array) : new Uint8Array(w * h * 4);
  const world = field.world;
  for (let j = 0; j < h; j++) {
    const y = y0 + (j + 0.5) * res;
    for (let i = 0; i < w; i++) {
      const x = x0 + (i + 0.5) * res;
      const f = field.f(x, y, zc);
      const a = Math.max(0, Math.min(1, 0.5 - f / 2));
      const o = (i + j * w) * 4;
      if (a <= 0) { data[o + 3] = 0; continue; }
      const hard = world.fHard(x, y, zc) < 0.3;
      let r: number, g: number, b: number;
      if (hard) { r = 150; g = 148; b = 140; }
      else {
        const depth = world.height(x, zc) - y;
        const band = fbm2(x / 30, y / 6, seed + 77) * 0.5 + fbm2(x / 9, y / 9, seed + 78) * 0.3;
        const t = Math.min(1, depth / 140);
        r = 118 - 40 * t + band * 40; g = 88 - 30 * t + band * 28; b = 60 - 18 * t + band * 18;
        const grit = hash2(i, j, seed) * 14 - 7;
        r += grit; g += grit; b += grit;
      }
      data[o] = r; data[o + 1] = g; data[o + 2] = b; data[o + 3] = Math.round(a * 255);
    }
  }
  const t = tex && tex.image.data === data ? tex : new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  t.colorSpace = SRGBColorSpace;
  t.magFilter = LinearFilter; t.minFilter = LinearFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}
