// Keeps the carve-grid meshes in step with the simulation: drains the grid's dirty chunks, rebuilds them nearest to
// the camera first within a per-frame time budget, and packs chunks into region geometries (one draw per wall
// material per region; three frustum-culls regions by their bounding spheres). Emptied chunks are dropped and
// regions without chunks are freed.
//
// Dirty chunks of one edit batch are committed together, so a bite that touches two chunks never shows a crack
// between a rebuilt chunk and a stale neighbour. A batch that is still incomplete after BATCH_MAX_FRAMES is
// committed as far as it got (continuous digging must not starve the display).
import { Box3, BufferAttribute, BufferGeometry, Group, Mesh, Sphere, Vector3, type Material } from 'three';
import type { NestSource } from '../simAdapter';
import { CHUNK } from '../simAdapter';
import { REGION_CHUNKS } from '../params';
import { buildChunk, type BuildOptions, type BuiltChunk } from './chunkBuild';
import { assembleRegion, regionKey } from './regionAssembly';

/** Materials the manager assigns: one wall material per substrate code, and the shadow depth material. */
export interface WallMaterialSet {
  wall(code: number): Material;
  readonly depth: Material;
}

export interface Region {
  key: number;
  chunks: Set<number>;
  mesh: Mesh | null;
  triangles: number;
  vertices: number;
}

export interface MeshFrameStats {
  /** Chunks rebuilt this frame. */
  built: number;
  /** Time spent this frame (build + commit + assembly), ms. */
  ms: number;
  /** Part of ms spent committing (region assembly, geometry creation), ms. */
  commitMs: number;
  pending: number;
  committed: boolean;
}

export const BATCH_MAX_FRAMES = 8;
/** A finished batch waits one frame when the builds of this frame already used this fraction of the budget. */
export const COMMIT_DEFER_FRACTION = 0.6;

export class ChunkMeshManager {
  readonly group = new Group();
  readonly regions = new Map<number, Region>();
  /** Bumped whenever a region geometry changed (x-ray and picking caches compare it). */
  revision = 0;
  castShadow = false;
  build: BuildOptions = { refine: true, ao: true };
  /** Statistics of the last frame and maxima since the last reset. */
  last: MeshFrameStats = { built: 0, ms: 0, commitMs: 0, pending: 0, committed: false };
  maxFrameMs = 0;
  totalBuilt = 0;

  private src: NestSource | null = null;
  private chunks = new Map<number, BuiltChunk>();
  private pending = new Set<number>();
  private staged = new Map<number, BuiltChunk | null>();
  private batchFrames = 0;
  private c3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly materials: WallMaterialSet) {
    this.group.name = 'nest:chunks';
  }

  /** Switches to a source (null = none): everything is cleared and every stored chunk is queued. */
  setSource(src: NestSource | null): void {
    this.clear();
    this.src = src;
    if (!src) return;
    src.takeDirty();
    for (const k of src.meshKeys()) this.pending.add(k);
  }

  /** Re-queues every chunk (after a load replaced the carve data, or a material change). */
  rebuildAll(): void {
    if (!this.src) return;
    for (const k of this.chunks.keys()) this.pending.add(k);
    for (const k of this.src.meshKeys()) this.pending.add(k);
  }

  get pendingCount(): number {
    return this.pending.size + this.staged.size;
  }

  /** One frame: drain dirties, rebuild nearest-first within budgetMs, commit finished batches. */
  update(camX: number, camY: number, camZ: number, budgetMs: number): MeshFrameStats {
    const t0 = performance.now();
    const st = this.last;
    st.built = 0; st.committed = false; st.commitMs = 0;
    const src = this.src;
    if (src) {
      for (const k of src.takeDirty()) { this.pending.add(k); this.staged.delete(k); }
      if (this.pending.size > 0) {
        const order = this.byDistance(camX, camY, camZ);
        for (const key of order) {
          if (st.built > 0 && performance.now() - t0 >= budgetMs) break;
          this.staged.set(key, buildChunk(src, key, this.build));
          this.pending.delete(key);
          st.built++;
        }
      }
      if (this.staged.size > 0) {
        this.batchFrames++;
        // a finished batch is committed now unless the builds already used most of the budget (then next frame)
        const late = performance.now() - t0 > budgetMs * COMMIT_DEFER_FRACTION && st.built > 0;
        if ((this.pending.size === 0 && !late) || this.batchFrames >= BATCH_MAX_FRAMES) {
          const tc = performance.now();
          this.commit();
          st.committed = true;
          st.commitMs = performance.now() - tc;
        }
      }
    }
    st.ms = performance.now() - t0;
    st.pending = this.pendingCount;
    this.totalBuilt += st.built;
    if (st.ms > this.maxFrameMs) this.maxFrameMs = st.ms;
    return st;
  }

  /** Builds and commits everything pending now (load, tests, screenshots). */
  flush(): void {
    if (!this.src) return;
    for (const k of this.src.takeDirty()) this.pending.add(k);
    for (const key of this.pending) this.staged.set(key, buildChunk(this.src, key, this.build));
    this.pending.clear();
    this.commit();
  }

  setCastShadow(on: boolean): void {
    this.castShadow = on;
    for (const r of this.regions.values()) if (r.mesh) r.mesh.castShadow = on;
  }

  /** Triangles, vertices, chunks and regions currently displayed. */
  stats(): { chunks: number; regions: number; triangles: number; vertices: number; pending: number; gpuBytes: number } {
    let t = 0, v = 0;
    for (const r of this.regions.values()) { t += r.triangles; v += r.vertices; }
    // position 12 + normal 12 + sub 4 + nest 8 bytes per vertex, index 2 or 4 per corner (counted as 4)
    return { chunks: this.chunks.size, regions: this.regions.size, triangles: t, vertices: v, pending: this.pendingCount, gpuBytes: v * 36 + t * 12 };
  }

  /** Built data of a chunk (tests, picking). */
  chunk(key: number): BuiltChunk | undefined {
    return this.chunks.get(key);
  }

  clear(): void {
    for (const r of this.regions.values()) this.dropMesh(r);
    this.regions.clear();
    this.chunks.clear();
    this.pending.clear();
    this.staged.clear();
    this.batchFrames = 0;
    this.revision++;
  }

  dispose(): void {
    this.clear();
    this.src = null;
  }

  private byDistance(x: number, y: number, z: number): number[] {
    const size = CHUNK * this.src!.voxel, half = size / 2;
    const d = new Map<number, number>();
    for (const key of this.pending) {
      this.src!.keyToChunk(key, this.c3);
      const dx = this.c3.x * size + half - x, dy = this.c3.y * size + half - y, dz = this.c3.z * size + half - z;
      d.set(key, dx * dx + dy * dy + dz * dz);
    }
    return [...this.pending].sort((a, b) => d.get(a)! - d.get(b)!);
  }

  private commit(): void {
    const touched = new Set<number>();
    for (const [key, built] of this.staged) {
      this.src!.keyToChunk(key, this.c3);
      const rk = regionKey(this.c3.x, this.c3.y, this.c3.z, REGION_CHUNKS);
      let region = this.regions.get(rk);
      if (built) {
        this.chunks.set(key, built);
        if (!region) { region = { key: rk, chunks: new Set(), mesh: null, triangles: 0, vertices: 0 }; this.regions.set(rk, region); }
        region.chunks.add(key);
        touched.add(rk);
      } else if (this.chunks.delete(key) && region) {
        region.chunks.delete(key);
        touched.add(rk);
      }
    }
    this.staged.clear();
    this.batchFrames = 0;
    for (const rk of touched) this.assemble(this.regions.get(rk)!);
    if (touched.size) this.revision++;
  }

  private assemble(region: Region): void {
    if (region.chunks.size === 0) {
      this.dropMesh(region);
      this.regions.delete(region.key);
      return;
    }
    const list = [...region.chunks].sort((a, b) => a - b).map((k) => this.chunks.get(k)!);
    const a = assembleRegion(list);
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(a.positions, 3));
    g.setAttribute('normal', new BufferAttribute(a.normals, 3));
    g.setAttribute('aSub', new BufferAttribute(a.sub, 1));
    g.setAttribute('aNest', new BufferAttribute(a.nest, 2));
    g.setIndex(new BufferAttribute(a.indices, 1));
    const mats: Material[] = [];
    a.groups.forEach((gr, i) => { g.addGroup(gr.start, gr.count, i); mats.push(this.materials.wall(gr.code)); });
    this.regionBounds(region.key, g);
    if (region.mesh) {
      region.mesh.geometry.dispose();
      region.mesh.geometry = g;
      region.mesh.material = mats;
    } else {
      const m = new Mesh(g, mats);
      m.name = `nest:region:${region.key}`;
      m.matrixAutoUpdate = false;
      m.customDepthMaterial = this.materials.depth;
      m.receiveShadow = false;
      region.mesh = m;
      this.group.add(m);
    }
    region.mesh.castShadow = this.castShadow;
    region.triangles = a.triangleCount;
    region.vertices = a.vertexCount;
  }

  /** Bounding box / sphere of a region from its cube (conservative, O(1); a vertex scan cost ~1 ms per region). */
  private regionBounds(key: number, g: BufferGeometry): void {
    const size = REGION_CHUNKS * CHUNK * this.src!.voxel;
    const rx = (key % 1024) - 512, ry = (Math.floor(key / 1024) % 1024) - 512, rz = Math.floor(key / 1048576) - 512;
    const pad = this.src!.voxel; // refined midpoints may sit a fraction of a voxel outside the cells
    g.boundingBox = new Box3(new Vector3(rx * size - pad, ry * size - pad, rz * size - pad), new Vector3((rx + 1) * size + pad, (ry + 1) * size + pad, (rz + 1) * size + pad));
    g.boundingSphere = g.boundingBox.getBoundingSphere(new Sphere());
  }

  private dropMesh(r: Region): void {
    if (!r.mesh) return;
    this.group.remove(r.mesh);
    r.mesh.geometry.dispose();
    r.mesh = null;
  }
}
