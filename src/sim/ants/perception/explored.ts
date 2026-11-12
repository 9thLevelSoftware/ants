// The colony's explored bitmap (GDD 02 App. A `exploredBits`): one bit per coarse cell (EXPLORED_CELL_BU) of
// the map that a forager or scout of the colony has walked through. Scouts prefer unexplored cells (§10.1).
// The array lives in Colony state (plain data, a Uint8Array) and is sized here on first use.

import type { Colony, Sim } from '@/sim/types';
import { EXPLORED_CELL_BU } from '@/sim/balance/foraging';

/** Cells per map edge. */
export function exploredSide(sim: Sim): number {
  return Math.max(1, Math.ceil(sim.world.size / (EXPLORED_CELL_BU * sim.world.bu)));
}

function bits(sim: Sim, col: Colony): Uint8Array {
  const side = exploredSide(sim);
  const bytes = Math.ceil((side * side) / 8);
  if (col.exploredBits.length !== bytes) col.exploredBits = new Uint8Array(bytes);
  return col.exploredBits;
}

/** Cell index of a map point, -1 outside the map. */
export function exploredCell(sim: Sim, x: number, z: number): number {
  const side = exploredSide(sim);
  const cell = EXPLORED_CELL_BU * sim.world.bu;
  const i = Math.floor(x / cell), j = Math.floor(z / cell);
  if (i < 0 || j < 0 || i >= side || j >= side) return -1;
  return j * side + i;
}

/** Marks the cell under (x, z) explored by the colony. */
export function markExplored(sim: Sim, col: Colony, x: number, z: number): void {
  const k = exploredCell(sim, x, z);
  if (k < 0) return;
  const b = bits(sim, col);
  b[k >> 3] |= 1 << (k & 7);
}

/** Whether the colony has explored the cell under (x, z); points off the map count as explored. */
export function isExplored(sim: Sim, col: Colony, x: number, z: number): boolean {
  const k = exploredCell(sim, x, z);
  if (k < 0) return true;
  const b = col.exploredBits;
  if (b.length === 0) return false;
  return (b[k >> 3] & (1 << (k & 7))) !== 0;
}

/** Number of explored cells (diagnostics, tests). */
export function exploredCount(col: Colony): number {
  let n = 0;
  for (let i = 0; i < col.exploredBits.length; i++) {
    let v = col.exploredBits[i];
    while (v) { n += v & 1; v >>= 1; }
  }
  return n;
}
