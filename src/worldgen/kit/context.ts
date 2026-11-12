// The generation context every pipeline step and registered placer receives: params, grid dimensions, the
// layout, the WorldData being built, named RNG streams and the budget/registration bookkeeping.

import type { RngState } from '@/core/rng';
import { rngFork } from '@/core/rng';
import type { ByteMap, Primitive, WorldData, WorldParams } from '@/sim/types';
import type { WorldDims } from '../params';
import type { Layout } from '../layout/types';
import { BUDGETS, SIZE_SCALE, type BudgetCategory } from '../tuning/pipeline';

/** Content a registered placer provides; validation checks about absent content report "not applicable". */
export type ContentKind = 'micro' | 'food' | 'rivals' | 'props' | 'plants' | 'holes' | 'lanes' | 'start';

/** Tree canopy disc: visual only, but it shades and shelters what is beneath (GDD 04 §5.1, §12.3). */
export interface CanopyDisc { x: number; z: number; y: number; r: number; transmittance: number }

/** Derived per-sample data from the maps step (columns over the 4 BU terrain samples), reused by later steps. */
export interface DerivedCache {
  /** Walkable top per terrain cell centre (terrain or a low object standing on it), mm; NaN = blocked. */
  walkTop: Float32Array;
  /** Highest solid per terrain cell, mm (for shade). */
  topAll: Float32Array;
  /** 1 = a ceiling of founding cover over the ground at this cell (fCover 1). */
  coverCeil: Uint8Array;
  /** Bit 0: an overhead primitive (shelter); bit 1: warm (stone/slab) cover. */
  over: Uint8Array;
  /** Primitive index of the wood primitive covering the cell, -1 none. */
  wood: Int32Array;
}

export interface BudgetState {
  limit: Record<BudgetCategory | 'primTotal' | 'precarveChunks' | 'climbRoutes', number>;
  used: Record<BudgetCategory, number>;
  /** Carve chunk keys touched by pre-carve ops (counted for PRECARVE_CHUNK_MAX). */
  chunks: Set<number>;
}

export interface GenContext {
  readonly params: WorldParams;
  readonly dims: WorldDims;
  /** Attempt index 0..7 and its seed `seed_a = hash32(seed, a)`. */
  readonly attempt: number;
  readonly seed: number;
  layout: Layout;
  /** The world under construction (arrays are appended to by the steps). */
  world: WorldData;
  budget: BudgetState;
  canopies: CanopyDisc[];
  /** Primitives that define the walkable ground for the nav grid (floor slabs), by id. */
  groundPrims: Set<number>;
  /** Content kinds provided by the registered placers of this run. */
  provides: Set<ContentKind>;
  /** Next ids for the world's registries. */
  ids: { prim: number; object: number; route: number; poi: number; micro: number; cavity: number; anchor: number; water: number };
  derived: DerivedCache | null;
  /** Non-fatal notes (debug, reports). */
  notes: string[];
  /** Named RNG stream (GDD 04 DET-2): derive(seed_a, label). Same label -> same fresh stream each call. */
  rng(label: string): RngState;
  /** Per-object sub-stream derive(stepStream, index): changing one category never shifts another. */
  rngFor(label: string, index: number): RngState;
}

function byteMap(cell: number, nx: number, nz: number, fill = 0): ByteMap {
  const data = new Uint8Array(nx * nz);
  if (fill) data.fill(fill);
  return { cell, nx, nz, data };
}

/** Empty WorldData shell with correctly sized grids (filled by the steps). */
export function emptyWorld(params: WorldParams, dims: WorldDims): WorldData {
  const { cell, cells, samples, navCell, navN } = dims;
  return {
    params, generatorVersion: params.generatorVersion, size: dims.size, bu: dims.bu,
    terrain: { cell, nx: samples, nz: samples, data: new Float32Array(samples * samples) },
    ground: { surface: byteMap(cell, cells, cells), crustMm: byteMap(cell, cells, cells), subsoil: byteMap(cell, cells, cells) },
    prims: [] as Primitive[],
    zones: [],
    maps: {
      zone: byteMap(cell, cells, cells), moisture: byteMap(navCell, navN, navN), shade: byteMap(navCell, navN, navN),
      shelter: byteMap(navCell, navN, navN), floodRisk: byteMap(navCell, navN, navN), exposure: byteMap(navCell, navN, navN),
      suitability: {},
    },
    nav: { cls: byteMap(navCell, navN, navN), cost: byteMap(navCell, navN, navN, 10) },
    objects: [], climbRoutes: [], pois: [], waterBodies: [], micro: [], cavities: [], preCarve: [],
    placements: { foodAnchors: [], plants: [], territories: [], rivalSites: [] },
    queenStart: { pos: { x: dims.size / 2, y: 0, z: dims.size / 2 }, fwd: { x: 1, y: 0, z: 0 } },
    meta: { fingerprint: 0, attempts: 0, repairs: [], disabledEvents: [] },
  };
}

export function createContext(params: WorldParams, dims: WorldDims, attempt: number, seed: number, layout: Layout): GenContext {
  const scale = SIZE_SCALE[params.sizeClass];
  const lim = (n: number) => Math.round(n * scale);
  return {
    params, dims, attempt, seed, layout,
    world: emptyWorld(params, dims),
    budget: {
      limit: {
        primTotal: lim(BUDGETS.primTotal), props: lim(BUDGETS.props), plants: lim(BUDGETS.plants), trees: lim(BUDGETS.trees),
        structures: lim(BUDGETS.primTotal), precarveChunks: lim(BUDGETS.precarveChunks), climbRoutes: lim(BUDGETS.climbRoutes),
      },
      used: { props: 0, plants: 0, trees: 0, structures: 0 },
      chunks: new Set(),
    },
    canopies: [], groundPrims: new Set(), provides: new Set(),
    ids: { prim: 1, object: 0, route: 0, poi: 0, micro: 0, cavity: 0, anchor: 0, water: 0 },
    derived: null, notes: [],
    rng: (label) => rngFork(seed, label),
    rngFor: (label, index) => rngFork(seed, `${label}#${index}`),
  };
}

/** Placeholder layout before step 1 has run. */
export function emptyLayout(dims: WorldDims): Layout {
  return {
    zones: [], nav: new Uint8Array(dims.navN * dims.navN), cells: new Uint8Array(dims.cells * dims.cells),
    built: [], house: null, facadeSide: null, carPark: null, kerbs: [], humanNodes: [], raisedBeds: [], edges: [],
  };
}
