// Keeps the carve-grid meshes in step with the simulation: drains the grid's dirty chunks, rebuilds them within a
// per-frame time budget, and writes each chunk into its slot of a region buffer (one draw per wall material per
// region; three frustum-culls regions by their boxes; regionBuffer.ts). Emptied chunks are dropped and region
// buffers without chunks are freed.
//
// Two queues:
//  - the edit batch: chunks dirtied by digging. They are committed together, so a bite that touches two chunks never
//    shows a crack between a rebuilt chunk and a stale neighbour. A chunk dirtied again after its build is "stale"
//    and is rebuilt before the batch closes; chunks not built yet go first (nearest first), so continuous digging
//    next to the camera cannot starve a far edit. A batch still incomplete after BATCH_MAX_FRAMES is shown as far
//    as it got (stale builds included; they stay queued).
//  - the backlog: every chunk after a load or a quality change. Independent chunks, each shown as soon as it is built
//    (inside the frame's budget), taken nearest first from a bucketed queue (no per-frame sort; nearestQueue.ts).
// Builds run stage by stage (ChunkBuildJob); the frame stops between stages when the budget is used up, judged by
// a running estimate of each stage's cost. At least one stage runs per frame.
import { Box3, Group, type Material, type Mesh } from 'three';
import type { NestSource } from '../simAdapter';
import { CHUNK } from '../simAdapter';
import {
  BACKLOG_BUCKET_CHUNKS, BACKLOG_MAX_WAIT_FRAMES, BACKLOG_REORDER_CHUNKS, BATCH_MAX_FRAMES, BUILD_COST_EMA, BUILD_COST_INITIAL_MS_PER_TRI,
  COMMIT_DEFER_FRACTION, REGION_CHUNKS,
} from '../params';
import { BUILD_STAGES, ChunkBuildJob, buildChunk, type BuildOptions, type BuiltChunk } from './chunkBuild';
import { NearestQueue } from './nearestQueue';
import { RegionBuffer, regionBox, regionKey } from './regionBuffer';

export { BATCH_MAX_FRAMES, COMMIT_DEFER_FRACTION };

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
  /** Chunks whose build finished this frame. */
  built: number;
  /** Build stages run this frame. */
  steps: number;
  /** Longest single build stage this frame (the unit the budget cannot split), ms, and which stage it was. */
  maxStepMs: number;
  maxStep: number;
  /** Time spent this frame (build + commit + assembly), ms. */
  ms: number;
  /** Part of ms spent committing (writing into region buffers), ms. */
  commitMs: number;
  pending: number;
  /** The edit batch was committed this frame. */
  committed: boolean;
}

/** An entry of the edit batch. */
interface BatchEntry {
  /** Frame sequence of the newest edit of the chunk. */
  dirtySeq: number;
  /** Staged build (null = the chunk is empty now; undefined = none yet) and the frame its mesh was taken. */
  built: BuiltChunk | null | undefined;
  builtSeq: number;
}

export class ChunkMeshManager {
  readonly group = new Group();
  readonly regions = new Map<number, Region>();
  /** Bumped whenever region meshes were added, removed or got a new geometry (x-ray mirrors compare it). */
  revision = 0;
  castShadow = false;
  build: BuildOptions = { refine: true, ao: true };
  /** Statistics of the last frame and maxima since the last reset. */
  last: MeshFrameStats = { built: 0, steps: 0, maxStepMs: 0, maxStep: -1, ms: 0, commitMs: 0, pending: 0, committed: false };
  maxFrameMs = 0;
  totalBuilt = 0;
  /** Number of edit batches committed (shown on screen). */
  commits = 0;

  private src: NestSource | null = null;
  private chunks = new Map<number, BuiltChunk>();
  private batch = new Map<number, BatchEntry>();
  private batchFrames = 0;
  private backlog = new NearestQueue(1, 1);
  private framesSinceBacklog = 0;
  private job: ChunkBuildJob | null = null;
  private jobSeq = 0;
  private seq = 0;
  /** Running cost estimate per build stage, ms per marching-cubes triangle. */
  private stageCost = new Float64Array(BUILD_STAGES).fill(BUILD_COST_INITIAL_MS_PER_TRI);
  private meanTris = 400;
  private c3 = { x: 0, y: 0, z: 0 };

  constructor(private readonly materials: WallMaterialSet) {
    this.group.name = 'nest:chunks';
  }

  /** Switches to a source (null = none): everything is cleared and every stored chunk is queued. */
  setSource(src: NestSource | null): void {
    this.clear();
    this.src = src;
    if (!src) return;
    const edge = CHUNK * src.voxel;
    this.backlog = new NearestQueue(BACKLOG_BUCKET_CHUNKS * edge, BACKLOG_REORDER_CHUNKS * edge);
    src.takeDirty();
    for (const k of src.meshKeys()) this.toBacklog(k);
  }

  /** Queues chunk keys for rebuilding (e.g. from a `carve-chunks-dirty` event). */
  markDirty(keys: readonly number[]): void {
    // edits between two frames come after this frame's builds: they belong to the next frame's sequence
    for (const k of keys) this.dirty(k, this.seq + 1);
  }

  /** Re-queues every chunk (after a load replaced the carve data, or a build option changed). */
  rebuildAll(): void {
    if (!this.src) return;
    for (const k of this.chunks.keys()) if (!this.batch.has(k)) this.toBacklog(k);
    for (const k of this.src.meshKeys()) if (!this.batch.has(k)) this.toBacklog(k);
  }

  get pendingCount(): number {
    const job = this.job && !this.batch.has(this.job.key) ? 1 : 0;
    return this.batch.size + this.backlog.size + job;
  }

  /** One frame: drain dirties, build within budgetMs, show finished backlog chunks and a complete edit batch. */
  update(camX: number, camY: number, camZ: number, budgetMs: number): MeshFrameStats {
    const t0 = performance.now();
    const st = this.last;
    st.built = 0; st.steps = 0; st.maxStepMs = 0; st.maxStep = -1; st.committed = false; st.commitMs = 0;
    const src = this.src;
    if (src) {
      this.seq++;
      for (const k of src.takeDirty()) this.dirty(k, this.seq);
      this.buildWithin(t0, budgetMs, camX, camY, camZ, st);
      if (this.batch.size > 0) this.batchFrames++;
      const tc = performance.now();
      // a complete batch is shown now unless the builds already used most of the budget (then next frame)
      const late = st.steps > 0 && tc - t0 > budgetMs * COMMIT_DEFER_FRACTION;
      if ((this.batchComplete() && !late) || (this.batchFrames >= BATCH_MAX_FRAMES && this.batchHasBuilds())) {
        this.commitBatch();
        st.committed = true;
      }
      st.commitMs = performance.now() - tc;
    }
    st.ms = performance.now() - t0;
    st.pending = this.pendingCount;
    this.totalBuilt += st.built;
    if (st.ms > this.maxFrameMs) this.maxFrameMs = st.ms;
    return st;
  }

  /** Builds and commits everything pending now (load, tests, screenshots). */
  flush(): void {
    const src = this.src;
    if (!src) return;
    this.seq++;
    for (const k of src.takeDirty()) this.dirty(k, this.seq);
    if (this.job) { while (!this.job.done) this.job.step(); this.finishJob(this.job); this.job = null; }
    for (const [key, e] of this.batch) {
      if (e.built === undefined || e.builtSeq < e.dirtySeq) { e.built = buildChunk(src, key, this.build); e.builtSeq = this.seq; }
    }
    for (let key = this.backlog.pop(0, 0, 0); key !== undefined; key = this.backlog.pop(0, 0, 0)) {
      this.apply(key, buildChunk(src, key, this.build));
    }
    if (this.batch.size > 0) this.commitBatch();
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

  /** Built data of a displayed chunk (tests, picking). */
  chunk(key: number): BuiltChunk | undefined {
    return this.chunks.get(key);
  }

  clear(): void {
    for (const r of this.regions.values()) for (const b of r.buffers.values()) this.dropBuffer(b);
    this.regions.clear();
    this.chunks.clear();
    this.batch.clear();
    this.backlog.clear();
    this.job = null;
    this.batchFrames = 0;
    this.framesSinceBacklog = 0;
    this.revision++;
  }

  dispose(): void {
    this.clear();
    this.src = null;
  }

  // ------------------------------------------------------------------------------------------- scheduling

  private dirty(key: number, seq: number): void {
    this.backlog.delete(key);
    const e = this.batch.get(key);
    if (e) e.dirtySeq = Math.max(e.dirtySeq, seq);
    else this.batch.set(key, { dirtySeq: seq, built: undefined, builtSeq: -1 });
  }

  private toBacklog(key: number): void {
    const half = (CHUNK * this.src!.voxel) / 2;
    this.src!.keyToChunk(key, this.c3);
    this.backlog.add(key, this.c3.x * half * 2 + half, this.c3.y * half * 2 + half, this.c3.z * half * 2 + half);
  }

  private buildWithin(t0: number, budgetMs: number, x: number, y: number, z: number, st: MeshFrameStats): void {
    let backlogStarted = false;
    for (;;) {
      if (!this.job) {
        const preferBacklog = this.framesSinceBacklog >= BACKLOG_MAX_WAIT_FRAMES && !backlogStarted;
        const key = this.nextKey(x, y, z, preferBacklog);
        if (key === undefined) break;
        if (!this.batch.has(key)) backlogStarted = true;
        this.job = new ChunkBuildJob(this.src!, key, this.build);
      }
      const job = this.job;
      const elapsed = performance.now() - t0;
      if (st.steps > 0 && (elapsed >= budgetMs || elapsed + this.estimate(job) > budgetMs)) break;
      const stage = job.stage, ts = performance.now();
      if (stage === 0) this.jobSeq = this.seq;
      job.step();
      const ms = performance.now() - ts;
      if (ms > st.maxStepMs) { st.maxStepMs = ms; st.maxStep = stage; }
      this.learn(stage, job, ms);
      st.steps++;
      if (job.done) { this.finishJob(job); this.job = null; st.built++; }
    }
    this.framesSinceBacklog = backlogStarted || this.backlog.size === 0 ? 0 : this.framesSinceBacklog + 1;
  }

  /** Next chunk to build: edit-batch chunks without a build (nearest), then stale ones (nearest), then the backlog. */
  private nextKey(x: number, y: number, z: number, preferBacklog: boolean): number | undefined {
    if (preferBacklog && this.backlog.size > 0) return this.backlog.pop(x, y, z);
    const edge = CHUNK * this.src!.voxel, half = edge / 2;
    let best: number | undefined, bestD = Infinity, bestUnbuilt = false;
    for (const [key, e] of this.batch) {
      if (e.built !== undefined && e.builtSeq >= e.dirtySeq) continue;
      const unbuilt = e.built === undefined;
      if (bestUnbuilt && !unbuilt) continue;
      this.src!.keyToChunk(key, this.c3);
      const dx = this.c3.x * edge + half - x, dy = this.c3.y * edge + half - y, dz = this.c3.z * edge + half - z;
      const d = dx * dx + dy * dy + dz * dz;
      if ((unbuilt && !bestUnbuilt) || d < bestD) { best = key; bestD = d; bestUnbuilt = unbuilt; }
    }
    if (best !== undefined) return best;
    return this.backlog.pop(x, y, z);
  }

  /** Estimated cost of the job's next stage, ms. */
  private estimate(job: ChunkBuildJob): number {
    const tris = job.stage === 0 ? (this.chunks.get(job.key)?.sourceTriangles ?? this.meanTris) : job.sourceTriangles;
    return this.stageCost[job.stage] * tris;
  }

  private learn(stage: number, job: ChunkBuildJob, ms: number): void {
    const tris = job.sourceTriangles;
    if (tris <= 0) return; // an empty chunk ends in stage 0 and says nothing about the cost per triangle
    // one sample may raise the estimate at most 3x: a GC pause inside a stage must not stall the next frames
    const c = this.stageCost[stage];
    this.stageCost[stage] += (Math.min(ms / tris, 3 * c) - c) * BUILD_COST_EMA;
    if (stage === 0) this.meanTris += (tris - this.meanTris) * BUILD_COST_EMA;
  }

  /** A finished build joins its batch entry, or (backlog) is shown at once, inside the frame's budget. */
  private finishJob(job: ChunkBuildJob): void {
    const e = this.batch.get(job.key);
    if (e) { e.built = job.result; e.builtSeq = this.jobSeq; } else this.apply(job.key, job.result);
  }

  private batchComplete(): boolean {
    if (this.batch.size === 0) return false;
    if (this.job && this.batch.has(this.job.key)) return false;
    for (const e of this.batch.values()) if (e.built === undefined || e.builtSeq < e.dirtySeq) return false;
    return true;
  }

  private batchHasBuilds(): boolean {
    for (const e of this.batch.values()) if (e.built !== undefined) return true;
    return false;
  }

  // ------------------------------------------------------------------------------------------- commit

  /** Shows every staged build of the batch; fresh chunks leave the batch, stale ones stay queued for a rebuild. */
  private commitBatch(): void {
    const busy = this.job?.key;
    for (const [key, e] of this.batch) {
      if (e.built === undefined) continue;
      this.apply(key, e.built);
      if (e.builtSeq >= e.dirtySeq && key !== busy) this.batch.delete(key);
      else e.built = undefined;
    }
    this.batchFrames = 0;
    this.commits++;
  }

  private apply(key: number, built: BuiltChunk | null): void {
    this.src!.keyToChunk(key, this.c3);
    const rk = regionKey(this.c3.x, this.c3.y, this.c3.z, REGION_CHUNKS);
    let region = this.regions.get(rk);
    const old = this.chunks.get(key);
    if (!built && !old) return;
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
