// Serialisable sparse pheromone field (GDD 02 §8): 4 BU cells grouped in 16^3 chunks per (colony, channel).
// The runtime PheromoneField service (services.ts) wraps this data; the data alone is the persisted truth.

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
