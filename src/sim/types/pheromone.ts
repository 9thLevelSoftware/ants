// Serialisable sparse pheromone field (GDD 02 §8): 4 BU cells grouped in 16^3 chunks per (colony, channel).
// The runtime PheromoneField service (services.ts) wraps this data; the data alone is the persisted truth.

import type { Vec3 } from '@/core/math/vec3';
import type { PheroChannel } from './ids';

/** One (colony, channel) layer: parallel arrays of chunk keys and 16^3 concentrations. */
export interface PheromoneLayer {
  colony: number;
  channel: PheroChannel;
  /** Packed chunk keys: (cx + 512) + (cy + 512) * 1024 + (cz + 512) * 1048576 (see pheroChunkKey). */
  keys: number[];
  /** One Float32Array(4096) per key: concentration in pheromone units (ph). */
  chunks: Float32Array[];
  /**
   * Eviction floors, ph (phero task): after a cap eviction, a new cell / chunk is admitted once the deposits it has
   * accumulated while waiting (pendingCells / pendingChunks) beat the strongest evicted cell / chunk total. Decay
   * with the layer. Absent = 0.
   */
  cellFloor?: number;
  chunkFloor?: number;
  /** Pending admission counters at a cap: flat (cell code, ph) and (chunk key, ph) pairs. Absent = empty. */
  pendingCells?: number[];
  pendingChunks?: number[];
}

export interface PheromoneState {
  /** Cell edge, mm (4 BU). */
  cell: number;
  /** Cells per chunk edge (16). */
  chunkCells: number;
  layers: PheromoneLayer[];
  lastDecayTick: number;
}

// ---- Runtime query shapes of the pheromone service (additive, phero task). Not persisted. ----

/** A volume in world mm. `cylinder` has a vertical (Y) axis; `box` is rotated by `yaw` (rad) about +Y. */
export type PheroRegion =
  | { kind: 'sphere'; center: Vec3; radius: number }
  | { kind: 'cylinder'; center: Vec3; radius: number; halfHeight: number }
  | { kind: 'box'; center: Vec3; halfX: number; halfY: number; halfZ: number; yaw?: number };

/** Multiplier per channel. `alarm` defaults to the `trail` value (GDD 04 §15.4: alarm takes the trail value). */
export interface PheroChannelFactors {
  trail: number;
  home: number;
  alarm?: number;
}

/** Cell-centre predicate, world mm (rain exposure, "covered floor", free space for diffusion). */
export type PheroCellTest = (x: number, y: number, z: number) => boolean;

/** Visitor of one active cell: centre in world mm and its value, ph. */
export type PheroCellVisitor = (x: number, y: number, z: number, value: number) => void;

/**
 * Decay-rate multiplier at a point (1 = the channel's base half-life at 22 C; 2 = twice as fast). Supplied by the
 * environment (temperature, exposure, heat; species trail half-life by colony): see pheroDecayRateMult in
 * src/sim/pheromones. Called once per decay patch (PHERO_DECAY_PATCH_CELLS), not per cell; must be a pure function
 * of its arguments. `colony` is the layer's colony (-1 = the shared alarm layer).
 */
export type PheroDecayModifier = (channel: PheroChannel, x: number, y: number, z: number, colony?: number) => number;

/** Optional runtime hooks the wiring layer installs on the pheromone service. */
export interface PheroHooks {
  /** Per-cell decay-rate multiplier; null/absent = base half-lives everywhere. */
  decayModifier?: PheroDecayModifier | null;
  /** True if a cell centre is in free space (alarm diffuses only into free neighbours); absent = all free. */
  isFree?: PheroCellTest | null;
}

/** Options of a region wipe. */
export interface PheroWipeOptions {
  /** Only this colony's layers (the shared alarm layer counts as every colony's); absent = all colonies. */
  colony?: number;
  /** Extra per-cell condition (e.g. "covered floor only"); absent = every cell in the region. */
  filter?: PheroCellTest | null;
}
