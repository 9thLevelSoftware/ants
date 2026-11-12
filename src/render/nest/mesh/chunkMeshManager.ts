// Keeps the carve-grid meshes in step with the simulation: drains the grid's dirty chunks, rebuilds them nearest to
// the camera first within a per-frame time budget, and writes each chunk into its slot of a region buffer (one draw
// per wall material per region; three frustum-culls regions by their bounding spheres; regionBuffer.ts). Emptied
// chunks are dropped and region buffers without chunks are freed.
//
// Dirty chunks of one edit batch are committed together, so a bite that touches two chunks never shows a crack
// between a rebuilt chunk and a stale neighbour. A batch that is still incomplete after BATCH_MAX_FRAMES is
// committed as far as it got (continuous digging must not starve the display).
import { Box3, Group, type Material, type Mesh } from 'three';
import type { NestSource } from '../simAdapter';
import { CHUNK } from '../simAdapter';
import { REGION_CHUNKS } from '../params';
import { buildChunk, type BuildOptions, type BuiltChunk } from './chunkBuild';
import { RegionBuffer, regionBox, regionKey } from './regionBuffer';

/** Materials the manager assigns: one wall material per substrate code, and the shadow depth material. */
export interface WallMaterialSet {
  wall(code: number): Material;
  readonly depth: Material;
}

export interface Region {
  key: number;
  chunks: Set<number>;
  /** One buffer (one draw) per wall material code present in the region. */
  buffers: Map<number, RegionBuffer>;
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
  /** Bumped whenever region meshes were added, removed or got a new geometry (x-ray mirrors compare it). */
  revision = 0;
  castShadow = false;
  build: BuildOptions = { refine: true, ao: true };
  /** Statistics of the last frame and maxima since the last reset. */
  last: MeshFrameStats = { built: 0, ms: 0, commitMs: 0, pending: 0, committed: false };
  maxFrameMs = 0;
  totalBuilt = 0;
  /** Number of batches committed (shown on screen). */
  commits = 0;

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

  /** Queues chunk keys for rebuilding (e.g. from a `carve-chunks-dirty` event). */
  markDirty(keys: readonly number[]): void {
    for (const k of keys) { this.pending.add(k); this.staged.delete(k); }
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
    for (const m of this.meshes()) m.castShadow = on;
  }

  /** Triangles, vertices, chunks, regions and draws currently displayed. */
  stats(): { chunks: number; regions: number; draws: number; triangles: number; vertices: number; pending: number; gpuBytes: number } {
    let t = 0, v = 0, b = 0, d = 0;
    for (const r of this.regions.values()) for (const buf of r.buffers.values()) { t += buf.triangles; v += buf.vertices; b += buf.bytes; d++; }
    return { chunks: this.chunks.size, regions: this.regions.size, draws: d, triangles: t, vertices: v, pending: this.pendingCount, gpuBytes: b };
  }

  /** Every region mesh (x-ray mirrors, picking). */
  *meshes(): IterableIterator<Mesh> {
    for (const r of this.regions.values()) for (const buf of r.buffers.values()) yield buf.mesh;
  }

  /** Built data of a chunk (tests, picking). */
  chunk(key: number): BuiltChunk | undefined {
    return this.chunks.get(key);
  }

  clear(): void {
    for (const r of this.regions.values()) for (const b of r.buffers.values()) this.dropBuffer(b);
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
    for (const [key, built] of this.staged) {
      this.src!.keyToChunk(key, this.c3);
      const rk = regionKey(this.c3.x, this.c3.y, this.c3.z, REGION_CHUNKS);
      let region = this.regions.get(rk);
      const old = this.chunks.get(key);
      if (!built && !old) continue;
      if (!region) { region = { key: rk, chunks: new Set(), buffers: new Map() }; this.regions.set(rk, region); }
      // materials the chunk no longer has
      if (old) for (const g of old.groups) if (!built || !built.groups.some((n) => n.code === g.code)) this.removeFrom(region, g.code, key);
      if (built) {
        this.chunks.set(key, built);
        region.chunks.add(key);
        for (const g of built.groups) {
          const buf = this.bufferFor(region, g.code);
          const gen = buf.generation;
          buf.put(key, { positions: built.positions, normals: built.normals, sub: built.sub, nest: built.nest, vertexCount: built.vertexCount, indices: g.indices });
          if (buf.generation !== gen) this.revision++;
        }
      } else {
        this.chunks.delete(key);
        region.chunks.delete(key);
      }
      if (region.buffers.size === 0) this.regions.delete(rk);
    }
    this.staged.clear();
    this.batchFrames = 0;
    this.commits++;
  }

  private bufferFor(region: Region, code: number): RegionBuffer {
    let b = region.buffers.get(code);
    if (b) return b;
    const size = REGION_CHUNKS * CHUNK * this.src!.voxel;
    // refined midpoints may sit a fraction of a voxel outside the cells: pad the region box by one voxel
    b = new RegionBuffer(this.materials.wall(code), this.materials.depth, regionBox(region.key, size, this.src!.voxel, new Box3()));
    b.mesh.name = `nest:region:${region.key}:${code}`;
    b.mesh.castShadow = this.castShadow;
    region.buffers.set(code, b);
    this.group.add(b.mesh);
    this.revision++;
    return b;
  }

  private removeFrom(region: Region, code: number, key: number): void {
    const b = region.buffers.get(code);
    if (!b) return;
    const gen = b.generation;
    b.remove(key);
    if (b.generation !== gen) this.revision++;
    if (b.empty) { this.dropBuffer(b); region.buffers.delete(code); this.revision++; }
  }

  private dropBuffer(b: RegionBuffer): void {
    this.group.remove(b.mesh);
    b.dispose();
  }
}
