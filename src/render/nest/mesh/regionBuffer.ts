// One draw of a region: the wall triangles of one substrate material for all chunks of a region (REGION_CHUNKS^3
// chunks), in one geometry with a slot per chunk. A rebuilt chunk is written into its own slot in place (with 50 %
// headroom; unused slot indices are degenerate triangles) and only that range is uploaded, so the cost of a commit
// is proportional to the chunk, not to the region. When a chunk outgrows its slot it moves to the end; when the
// arrays are full or mostly holes the region is repacked into a fresh geometry (rare).
import { Box3, BufferAttribute, BufferGeometry, Mesh, Sphere, Vector3, type Material } from 'three';
import { NEST_ATTR } from '../params';

export interface ChunkPart {
  positions: Float32Array;
  normals: Float32Array;
  sub: Float32Array;
  nest: Float32Array;
  vertexCount: number;
  /** Triangle indices into the part's vertices. */
  indices: Uint32Array;
}

interface Slot { v0: number; vCap: number; vN: number; i0: number; iCap: number; iN: number }

/** Slot headroom so a chunk that grows a little after a dig is rewritten in place. */
const HEADROOM = 1.5;
/** Repack when live data falls below this fraction of the used capacity. */
const MIN_LIVE = 0.5;
/** Spare capacity after a repack, so a region that is being dug moves chunks to the end instead of repacking. */
const GROW = 1.75;

/** Region key of a chunk (region coordinates in [-512, 511]). */
export function regionKey(cx: number, cy: number, cz: number, r: number): number {
  const rx = Math.floor(cx / r) + 512, ry = Math.floor(cy / r) + 512, rz = Math.floor(cz / r) + 512;
  return rx + ry * 1024 + rz * 1048576;
}

/** World box of a region key. */
export function regionBox(key: number, sizeMm: number, pad: number, out: Box3): Box3 {
  const rx = (key % 1024) - 512, ry = (Math.floor(key / 1024) % 1024) - 512, rz = Math.floor(key / 1048576) - 512;
  out.min.set(rx * sizeMm - pad, ry * sizeMm - pad, rz * sizeMm - pad);
  out.max.set((rx + 1) * sizeMm + pad, (ry + 1) * sizeMm + pad, (rz + 1) * sizeMm + pad);
  return out;
}

export class RegionBuffer {
  readonly mesh: Mesh;
  private slots = new Map<number, Slot>();
  private vEnd = 0;
  private iEnd = 0;
  private capV = 0;
  private capI = 0;
  private pos = new Float32Array(0);
  private nrm = new Float32Array(0);
  private sub = new Float32Array(0);
  private nest = new Float32Array(0);
  private idx = new Uint32Array(0);
  private liveV = 0;
  private liveI = 0;
  /** Bumped when the geometry object was replaced (mirrors must follow). */
  generation = 0;

  constructor(material: Material, depth: Material, private readonly bounds: Box3) {
    this.mesh = new Mesh(new BufferGeometry(), material);
    this.mesh.matrixAutoUpdate = false;
    this.mesh.customDepthMaterial = depth;
    this.mesh.receiveShadow = false;
  }

  get empty(): boolean {
    return this.slots.size === 0;
  }

  get triangles(): number {
    return this.liveI / 3;
  }

  get vertices(): number {
    return this.liveV;
  }

  /** GPU bytes held (capacity). */
  get bytes(): number {
    return this.capV * (28 + NEST_ATTR * 4) + this.capI * 4;
  }

  /** Writes a chunk's triangles; returns true when only a range was updated (no repack). */
  put(key: number, part: ChunkPart): boolean {
    const old = this.slots.get(key);
    const nv = part.vertexCount, ni = part.indices.length;
    if (old && nv <= old.vCap && ni <= old.iCap) {
      this.liveV += nv - old.vN; this.liveI += ni - old.iN;
      old.vN = nv; old.iN = ni;
      this.write(old, part);
      this.markRange(old);
      return true;
    }
    if (old) this.release(key, old);
    const vCap = Math.ceil(nv * HEADROOM), iCap = Math.ceil((ni * HEADROOM) / 3) * 3;
    if (this.vEnd + vCap > this.capV || this.iEnd + iCap > this.capI) {
      this.repack(key, part, vCap, iCap);
      return false;
    }
    const s: Slot = { v0: this.vEnd, vCap, vN: nv, i0: this.iEnd, iCap, iN: ni };
    this.vEnd += vCap; this.iEnd += iCap;
    this.slots.set(key, s);
    this.liveV += nv; this.liveI += ni;
    this.write(s, part);
    this.markRange(s);
    this.mesh.geometry.setDrawRange(0, this.iEnd);
    return true;
  }

  remove(key: number): void {
    const s = this.slots.get(key);
    if (!s) return;
    this.release(key, s);
    if (this.liveI < this.iEnd * MIN_LIVE && this.slots.size > 0) this.repack(-1, null, 0, 0);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
  }

  private release(key: number, s: Slot): void {
    this.idx.fill(s.v0, s.i0, s.i0 + s.iCap); // degenerate
    this.markIndexRange(s);
    this.liveV -= s.vN; this.liveI -= s.iN;
    this.slots.delete(key);
  }

  private write(s: Slot, p: ChunkPart): void {
    this.pos.set(p.positions.subarray(0, p.vertexCount * 3), s.v0 * 3);
    this.nrm.set(p.normals.subarray(0, p.vertexCount * 3), s.v0 * 3);
    this.sub.set(p.sub.subarray(0, p.vertexCount), s.v0);
    this.nest.set(p.nest.subarray(0, p.vertexCount * NEST_ATTR), s.v0 * NEST_ATTR);
    const src = p.indices, base = s.v0;
    for (let i = 0; i < src.length; i++) this.idx[s.i0 + i] = src[i] + base;
    this.idx.fill(base, s.i0 + src.length, s.i0 + s.iCap);
  }

  private markRange(s: Slot): void {
    const g = this.mesh.geometry;
    const add = (name: string, size: number) => {
      const a = g.getAttribute(name) as BufferAttribute;
      a.addUpdateRange(s.v0 * size, s.vCap * size);
      a.needsUpdate = true;
    };
    add('position', 3); add('normal', 3); add('aSub', 1); add('aNest', NEST_ATTR);
    this.markIndexRange(s);
  }

  private markIndexRange(s: Slot): void {
    const ia = this.mesh.geometry.getIndex();
    if (!ia) return;
    ia.addUpdateRange(s.i0, s.iCap);
    ia.needsUpdate = true;
  }

  /** New arrays (and a new geometry) holding every live slot compactly plus the new part. */
  private repack(newKey: number, part: ChunkPart | null, vCapNew: number, iCapNew: number): void {
    const live = [...this.slots.entries()];
    let needV = vCapNew, needI = iCapNew;
    for (const [, s] of live) { needV += Math.ceil(s.vN * HEADROOM); needI += Math.ceil((s.iN * HEADROOM) / 3) * 3; }
    const capV = Math.max(64, Math.ceil(needV * GROW)), capI = Math.max(192, Math.ceil((needI * GROW) / 3) * 3);
    const pos = new Float32Array(capV * 3), nrm = new Float32Array(capV * 3), sub = new Float32Array(capV), nest = new Float32Array(capV * NEST_ATTR);
    const idx = new Uint32Array(capI);
    let v = 0, i = 0;
    const slots = new Map<number, Slot>();
    for (const [key, s] of live) {
      const vCap = Math.ceil(s.vN * HEADROOM), iCap = Math.ceil((s.iN * HEADROOM) / 3) * 3;
      pos.set(this.pos.subarray(s.v0 * 3, (s.v0 + s.vN) * 3), v * 3);
      nrm.set(this.nrm.subarray(s.v0 * 3, (s.v0 + s.vN) * 3), v * 3);
      sub.set(this.sub.subarray(s.v0, s.v0 + s.vN), v);
      nest.set(this.nest.subarray(s.v0 * NEST_ATTR, (s.v0 + s.vN) * NEST_ATTR), v * NEST_ATTR);
      for (let k = 0; k < s.iN; k++) idx[i + k] = this.idx[s.i0 + k] - s.v0 + v;
      idx.fill(v, i + s.iN, i + iCap);
      slots.set(key, { v0: v, vCap, vN: s.vN, i0: i, iCap, iN: s.iN });
      v += vCap; i += iCap;
    }
    this.pos = pos; this.nrm = nrm; this.sub = sub; this.nest = nest; this.idx = idx;
    this.capV = capV; this.capI = capI; this.slots = slots;
    this.vEnd = v; this.iEnd = i;
    if (part) {
      const s: Slot = { v0: v, vCap: vCapNew, vN: part.vertexCount, i0: i, iCap: iCapNew, iN: part.indices.length };
      this.slots.set(newKey, s);
      this.liveV += part.vertexCount; this.liveI += part.indices.length;
      this.vEnd += vCapNew; this.iEnd += iCapNew;
      this.write(s, part);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(pos, 3));
    g.setAttribute('normal', new BufferAttribute(nrm, 3));
    g.setAttribute('aSub', new BufferAttribute(sub, 1));
    g.setAttribute('aNest', new BufferAttribute(nest, NEST_ATTR));
    g.setIndex(new BufferAttribute(idx, 1));
    g.setDrawRange(0, this.iEnd);
    g.boundingBox = this.bounds.clone();
    g.boundingSphere = this.bounds.getBoundingSphere(new Sphere(new Vector3(), 0));
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    this.generation++;
  }
}
