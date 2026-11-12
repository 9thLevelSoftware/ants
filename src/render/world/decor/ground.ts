// Read-only view of the static world (plus the few dynamic maps decor follows) for decor placement. Pure: no three.
// Heights include the sim's deformation tiles; maps are sampled per cell; the zone-edge distance is computed once.
import type { ByteMap, MaterialId, Sim, WorldData, WorldObject, ZoneType, ZoneVariant } from '@/sim/types';
import { materialFromCode } from '@/sim/types';
import { terrainSource, type TerrainSource } from '../lighting/simAdapter';
import { sampleHeight } from '../terrain/terrainData';
import { PrimColumns } from './primColumns';

export interface ZoneInfo {
  type: ZoneType;
  variant: ZoneVariant | null;
}

const byteAt = (m: ByteMap | undefined, x: number, z: number): number => {
  if (!m) return 0;
  const i = Math.floor(x / m.cell), k = Math.floor(z / m.cell);
  if (i < 0 || k < 0 || i >= m.nx || k >= m.nz) return 0;
  return m.data[k * m.nx + i];
};

export class GroundView {
  readonly world: WorldData;
  readonly bu: number;
  readonly seed: number;
  readonly src: TerrainSource;
  readonly prims: PrimColumns;
  private readonly zoneById = new Map<number, ZoneInfo>();
  private edgeDist: Float32Array | null = null;
  private grassMm: Uint16Array | null = null;

  constructor(world: WorldData, sim: Sim | null = null) {
    this.world = world;
    this.bu = world.bu;
    this.seed = (world.params?.seed ?? 0) >>> 0;
    this.src = terrainSource(world, sim);
    this.prims = new PrimColumns(world.prims, world.size);
    for (const z of world.zones) this.zoneById.set(z.id, { type: z.type, variant: z.variant });
    this.setSim(sim);
  }

  /** Follows the dynamic maps of a simulation (sward height). Heights are refreshed with refreshHeights. */
  setSim(sim: Sim | null): void {
    const g = (sim?.state.worldDelta as { grassHeightMm?: Uint16Array } | undefined)?.grassHeightMm;
    this.grassMm = g && g.length ? g : null;
  }

  /** Re-reads the deformation tiles of a simulation. */
  refreshHeights(sim: Sim | null): void {
    this.src.heights.set(terrainSource(this.world, sim).heights);
  }

  height(x: number, z: number): number {
    return sampleHeight(this.src, x, z);
  }

  zone(x: number, z: number): ZoneInfo {
    const id = byteAt(this.world.maps.zone, x, z);
    return this.zoneById.get(id) ?? this.zoneById.get(this.world.zones[0]?.id ?? 0) ?? { type: 'lawn', variant: null };
  }

  surface(x: number, z: number): MaterialId {
    return materialFromCode(byteAt(this.world.ground.surface, x, z));
  }

  /** Map value 0..1 of a byte map at (x, z) (0 outside / missing). */
  map01(name: 'shade' | 'litter' | 'moisture' | 'exposure', x: number, z: number): number {
    return byteAt(this.world.maps[name] as ByteMap | undefined, x, z) / 255;
  }

  /** Terrain hole (drain, gully) at (x, z). */
  hole(x: number, z: number): boolean {
    return byteAt(this.world.terrainHoles, x, z) !== 0;
  }

  /** Dynamic sward height on the nav grid, mm; `fallback` when the sim has none. */
  swardMm(x: number, z: number, fallback: number): number {
    const m = this.world.maps.zone, g = this.grassMm;
    if (!g) return fallback;
    const i = Math.floor(x / m.cell), k = Math.floor(z / m.cell);
    if (i < 0 || k < 0 || i >= m.nx || k >= m.nz) return fallback;
    const v = g[k * m.nx + i];
    return v > 0 ? v : fallback;
  }

  /** Distance from (x, z) to the nearest zone cell of a different zone type, mm (chamfer distance on the zone grid). */
  zoneEdgeMm(x: number, z: number): number {
    const m = this.world.maps.zone;
    if (!this.edgeDist) this.edgeDist = zoneEdgeDistance(m, (id) => this.zoneById.get(id)?.type ?? 'lawn');
    const i = Math.floor(x / m.cell), k = Math.floor(z / m.cell);
    if (i < 0 || k < 0 || i >= m.nx || k >= m.nz) return 1e9;
    return this.edgeDist[k * m.nx + i];
  }

  /** Objects whose template id is in `ids`. */
  objectsOf(ids: readonly string[]): WorldObject[] {
    return this.world.objects.filter((o) => ids.includes(o.templateId));
  }
}

/**
 * Two-pass chamfer distance (mm) from every zone cell to the nearest cell centre of another zone type. Cells next
 * to an edge get half a cell; deep inside a zone the value grows with the distance to the edge.
 */
export function zoneEdgeDistance(m: ByteMap, typeOf: (id: number) => ZoneType): Float32Array {
  const { nx, nz, cell } = m, n = nx * nz, BIG = 1e9;
  const d = new Float32Array(n).fill(BIG);
  const t = (i: number, k: number) => typeOf(m.data[k * nx + i]);
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    const me = t(i, k);
    if ((i > 0 && t(i - 1, k) !== me) || (i < nx - 1 && t(i + 1, k) !== me) || (k > 0 && t(i, k - 1) !== me) || (k < nz - 1 && t(i, k + 1) !== me)) {
      d[k * nx + i] = cell * 0.5;
    }
  }
  const a = cell, b = cell * Math.SQRT2;
  const relax = (i: number, k: number, di: number, dk: number, w: number) => {
    const ii = i + di, kk = k + dk;
    if (ii < 0 || kk < 0 || ii >= nx || kk >= nz) return;
    const v = d[kk * nx + ii] + w;
    if (v < d[k * nx + i]) d[k * nx + i] = v;
  };
  for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
    relax(i, k, -1, 0, a); relax(i, k, 0, -1, a); relax(i, k, -1, -1, b); relax(i, k, 1, -1, b);
  }
  for (let k = nz - 1; k >= 0; k--) for (let i = nx - 1; i >= 0; i--) {
    relax(i, k, 1, 0, a); relax(i, k, 0, 1, a); relax(i, k, 1, 1, b); relax(i, k, -1, 1, b);
  }
  return d;
}
