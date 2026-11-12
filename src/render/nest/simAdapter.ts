// THE ONE PLACE the nest renderer reads simulation data. The contracts in src/sim/types are still being
// synchronised, so every field name the renderer depends on is read here; a rename costs one edit in this file.
// Read-only: nothing here writes simulation state (takeDirty only drains the carve grid's render queue, which
// exists for this renderer: docs/design/tdd/02-kernel.md 5). Imports from src/sim: types, the carve grid's
// marching-cubes mesher and its chunk-key helpers (the functions the render-nest spec names).
import type { Vec3 } from '@/core/math/vec3';
import type { MaterialId, Sim } from '@/sim/types';
import { CHUNK, keyCx, keyCy, keyCz, meshChunk, type ChunkMesh } from '@/sim/nest/carve';

export { CHUNK, type ChunkMesh };

/** An opening of the nest to the sky (entrance or breach): centre on the surface, radius, mm. */
export interface Opening { x: number; y: number; z: number; r: number }

/** Everything the nest renderer needs, as plain functions. */
export interface NestSource {
  readonly bu: number;
  /** mm per voxel (0.5 BU). */
  readonly voxel: number;
  readonly worldSize: number;
  /** Carve-grid edit counter (render compares it to detect edits / reloads). */
  version(): number;
  /** Chunk keys whose mesh changed since the last call (drains the grid's render queue). */
  takeDirty(): number[];
  /** Every key that may carry a mesh (initial meshing). */
  meshKeys(): number[];
  /** Marching-cubes mesh of a chunk with the soil-distance discard attribute, or null. */
  meshChunk(key: number): ChunkMesh | null;
  keyToChunk(key: number, out: { x: number; y: number; z: number }): void;
  /** True if the chunk stores openness data (else it is all solid). */
  hasChunk(cx: number, cy: number, cz: number): boolean;
  /** Carve pseudo-distance (mm, > 0 inside carved space), trilinear; gradient into g when given. */
  cavity(x: number, y: number, z: number, g: Vec3 | null): number;
  /** Trilinear openness 0..1. */
  openness(x: number, y: number, z: number): number;
  /** Distance to the diggable group (terrain + diggable objects), > 0 in open air. */
  soil(x: number, y: number, z: number): number;
  /** Distance to all solids, carve ignored (> 0 open air, < 0 inside where the substrate would be). */
  substrate(x: number, y: number, z: number): number;
  /** Distance to non-diggable solids (stones, slabs); +Infinity when unknown. */
  hard(x: number, y: number, z: number): number;
  height(x: number, z: number): number;
  materialAt(x: number, y: number, z: number): MaterialId;
  /** Soil moisture 0..1 at a point. */
  moistureAt(x: number, y: number, z: number): number;
  /** Open entrances (or breach spheres when the nest records are not there yet); returns the count. */
  openings(out: Opening[]): number;
  /** Possessed ant position into out; false when nobody is possessed. */
  possessedPos(out: Vec3): boolean;
  /** Sphere trace along unit dir (mm), or maxDist; null when the field cannot trace. */
  trace(o: Vec3, dir: Vec3, maxDist: number, radius: number): number;
  /** Nearest point on the walls (f = 0) into out, unit normal into n; false if it did not converge. */
  project(p: Vec3, out: Vec3, n: Vec3): boolean;
  /** Full field f(p), > 0 free. */
  f(x: number, y: number, z: number): number;
}

type FieldExt = Sim['field'] & {
  soilXYZ?(x: number, y: number, z: number): number;
  substrateXYZ?(x: number, y: number, z: number): number;
  hardXYZ?(x: number, y: number, z: number): number;
  sampleXYZ?(x: number, y: number, z: number): number;
};

/** Builds the source over a simulation (or anything shaped like one: demos pass the kernel's parts). */
export function nestSourceFromSim(sim: Sim): NestSource {
  const field = sim.field as FieldExt;
  const carve = sim.carve;
  const world = sim.world;
  const bu = world.bu;
  const voxel = carve.voxel;
  const p: Vec3 = { x: 0, y: 0, z: 0 };
  const at = (x: number, y: number, z: number): Vec3 => { p.x = x; p.y = y; p.z = z; return p; };
  const soil = typeof field.soilXYZ === 'function'
    ? (x: number, y: number, z: number) => field.soilXYZ!(x, y, z)
    : (x: number, y: number, z: number) => field.substrate(at(x, y, z));
  const substrate = typeof field.substrateXYZ === 'function'
    ? (x: number, y: number, z: number) => field.substrateXYZ!(x, y, z)
    : (x: number, y: number, z: number) => field.substrate(at(x, y, z));
  const hard = typeof field.hardXYZ === 'function'
    ? (x: number, y: number, z: number) => field.hardXYZ!(x, y, z)
    : () => Infinity;
  const fXYZ = typeof field.sampleXYZ === 'function'
    ? (x: number, y: number, z: number) => field.sampleXYZ!(x, y, z)
    : (x: number, y: number, z: number) => field.sample(at(x, y, z));
  const substrateFn = (x: number, y: number, z: number) => soil(x, y, z);
  const moisture = moistureReader(sim);
  const q: Vec3 = { x: 0, y: 0, z: 0 };

  return {
    bu, voxel, worldSize: world.size,
    version: () => carve.version,
    takeDirty: () => carve.takeDirty(),
    meshKeys: () => carve.meshKeys(),
    meshChunk: (key) => meshChunk(carve, keyCx(key), keyCy(key), keyCz(key), { substrate: substrateFn }),
    keyToChunk: (key, out) => { out.x = keyCx(key); out.y = keyCy(key); out.z = keyCz(key); },
    hasChunk: (cx, cy, cz) => carve.chunk(cx, cy, cz) !== undefined,
    cavity: (x, y, z, g) => carve.cavity(x, y, z, g),
    openness: (x, y, z) => carve.openness(x, y, z),
    soil, substrate, hard,
    height: (x, z) => field.height(x, z),
    materialAt: (x, y, z) => field.materialAt(at(x, y, z)),
    moistureAt: moisture,
    openings: (out) => readOpenings(sim, out),
    possessedPos: (out) => {
      const id = sim.state.player?.possessedAntId ?? -1;
      if (id < 0) return false;
      const ant = sim.stores?.ants.get(id);
      if (!ant) return false;
      out.x = ant.pos.x; out.y = ant.pos.y; out.z = ant.pos.z;
      return true;
    },
    trace: (o, dir, maxDist, radius) => field.sphereTrace(o, dir, maxDist, radius),
    project: (pt, out, n) => {
      q.x = pt.x; q.y = pt.y; q.z = pt.z;
      if (!field.project(q, 0, out)) return false;
      field.normal(out, n);
      return true;
    },
    f: fXYZ,
  };
}

/** Entrances that are not sealed; falls back to the carve grid's breach spheres (de-duplicated). */
function readOpenings(sim: Sim, out: Opening[]): number {
  let n = 0;
  const push = (x: number, y: number, z: number, r: number) => {
    for (let i = 0; i < n; i++) {
      const o = out[i];
      if (Math.hypot(o.x - x, o.y - y, o.z - z) < Math.max(o.r, r)) { if (r > o.r) { o.x = x; o.y = y; o.z = z; o.r = r; } return; }
    }
    const o = out[n] ?? (out[n] = { x: 0, y: 0, z: 0, r: 0 });
    o.x = x; o.y = y; o.z = z; o.r = r;
    n++;
  };
  for (const nest of sim.state.nests ?? []) {
    if (!nest.alive) continue;
    for (const e of nest.entrances ?? []) if (e.status !== 'sealed') push(e.pos.x, e.pos.y, e.pos.z, e.radius);
  }
  if (n === 0) for (const b of sim.carve.breaches ?? []) push(b.pos.x, b.pos.y, b.pos.z, b.r);
  return n;
}

/** Soil moisture: the environment's top/deep grids when present, else the world's base map; 0.4 default. */
function moistureReader(sim: Sim): (x: number, y: number, z: number) => number {
  const env = sim.state.env as { moisture?: { cell: number; nx: number; nz: number; theta0: Uint8Array; theta1: Uint8Array } } | undefined;
  const base = sim.world.maps?.moisture;
  const deepBU = 4 * sim.world.bu;
  return (x, y, z) => {
    const m = env?.moisture;
    if (m && m.theta0?.length) {
      const ix = clampI(Math.floor(x / m.cell), m.nx), iz = clampI(Math.floor(z / m.cell), m.nz);
      const i = iz * m.nx + ix;
      const depth = Math.max(0, sim.field.height(x, z) - y);
      const t = Math.min(1, depth / deepBU);
      return ((m.theta0[i] ?? 100) * (1 - t) + (m.theta1[i] ?? 100) * t) / 255;
    }
    if (base && base.data.length) {
      const ix = clampI(Math.floor(x / base.cell), base.nx), iz = clampI(Math.floor(z / base.cell), base.nz);
      return (base.data[iz * base.nx + ix] ?? 100) / 255;
    }
    return 0.4;
  };
}

function clampI(i: number, n: number): number {
  return i < 0 ? 0 : i >= n ? n - 1 : i;
}
