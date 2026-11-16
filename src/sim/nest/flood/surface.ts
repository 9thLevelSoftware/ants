// Read-only query for renderers: the open water surface of a flooded nest (GDD 03 App. F12 "water surfaces at
// level L"). Every flooded sample whose upper neighbour is open but dry carries one horizontal cell of the surface at
// the water level. Uses the cache as last built (never rebuilds: renderers must not change sim work).

import type { Sim } from '@/sim/types';
import { OPEN_MIN } from '../carve/keys';
import { spillPeek } from './runtime';
import { floodedCount } from './spill';

export interface FloodSurface {
  nestId: number;
  /** Water level, mm (world y). */
  level: number;
  /** Cell centres x, z (mm), interleaved. */
  cells: number[];
  /** Cell edge, mm. */
  cell: number;
}

/** Water surface cells of a nest, or null when it is dry or has no cache yet. */
export function floodSurface(sim: Sim, nestId: number, maxCells = 20000): FloodSurface | null {
  const nest = sim.stores.nests.get(nestId);
  const c = spillPeek(sim, nestId);
  if (!nest || !c || nest.flood.water <= 0) return null;
  const n = floodedCount(c, nest.flood.water);
  if (n === 0) return null;
  const v = sim.carve.voxel, cells: number[] = [];
  for (let s = 0; s < n && cells.length < maxCells * 2; s++) {
    const i = c.si[s], j = c.sj[s], k = c.sk[s];
    const above = c.index.get(i, j + 1, k);
    if (above >= 0 && above < n) continue; // water above: not the surface
    if (above < 0 && sim.carve.sampleAt(i, j + 1, k) < OPEN_MIN) continue; // ceiling
    cells.push(i * v, k * v);
  }
  return { nestId, level: nest.flood.level, cells, cell: v };
}
