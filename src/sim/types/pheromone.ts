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
 * Decay-rate multiplier of one cell (1 = the channel's base half-life at 22 C; 2 = twice as fast). Supplied by the
 * environment (temperature, exposure, heat): see pheroDecayRateMult in src/sim/pheromones.
 */
export type PheroDecayModifier = (channel: PheroChannel, x: number, y: number, z: number) => number;

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
