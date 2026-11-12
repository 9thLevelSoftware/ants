// Coarse 16 BU navigation grid (GDD 04 §11), owned by loco. The implementation lives with locomotion
// (src/sim/locomotion/grid/*); this file is the world-module entry point that createNavGrid (world/index.ts) uses.
// The grid is built from WorldData at once; locomotion attaches the world field on its first tick, which derives
// the cells covered by tall objects and the ground under mounds (createNavGrid only receives WorldData).

import type { WorldData } from '@/sim/types';
import { createLocoNavGrid, type LocoNavGrid } from '@/sim/locomotion/grid/navGridImpl';

export type { LocoNavGrid, FindPathOptions } from '@/sim/locomotion/grid/navGridImpl';
export { isLocoNavGrid } from '@/sim/locomotion/grid/navGridImpl';
export type { CostDisc } from '@/sim/locomotion/grid/search';

export function createNavGridImpl(world: WorldData): LocoNavGrid {
  return createLocoNavGrid(world);
}
