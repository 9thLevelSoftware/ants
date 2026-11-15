// Claim queries on the territory grid (GDD 05 §3.5): cell of a point, a colony's marks, who claims a cell.
// Light (types and balance only): the module index re-exports these for combat, the UI and the debug API.

import type { Vec3 } from '@/core/math/vec3';
import type { Sim, TerritoryGrid } from '@/sim/types';
import { TERR_CLAIM_MIN, TERR_CLAIM_RATIO } from '@/sim/balance/combat';
import { slotOf } from './state';

/** Cell index of a point, -1 outside the grid. */
export function cellAt(t: TerritoryGrid, x: number, z: number): number {
  const cx = Math.floor(x / t.cell), cz = Math.floor(z / t.cell);
  if (cx < 0 || cz < 0 || cx >= t.w || cz >= t.h) return -1;
  return cz * t.w + cx;
}

/** Centre of a cell on the ground, mm. */
export function cellCentre(sim: Sim, cell: number, out: Vec3 = { x: 0, y: 0, z: 0 }): Vec3 {
  const t = sim.state.rivals.territory;
  out.x = ((cell % t.w) + 0.5) * t.cell;
  out.z = (Math.floor(cell / t.w) + 0.5) * t.cell;
  out.y = sim.field.height(out.x, out.z);
  return out;
}

/** Marks of a colony at a point (0 without a slot). */
export function marksAt(sim: Sim, colonyId: number, p: { x: number; z: number }): number {
  const t = sim.state.rivals.territory;
  const s = slotOf(sim.state, colonyId), c = cellAt(t, p.x, p.z);
  if (s < 0 || c < 0 || t.marks.length === 0) return 0;
  return t.marks[c * t.slots + s];
}

export interface CellClaim {
  /** Claiming colony id, -1 none; its mark; contested between two colonies. */
  owner: number;
  mark: number;
  contested: boolean;
}

/** Claim state of the cell under p (claimed: >= 20 and >= 1.5 x the second; contested: two >= 20, ratio < 1.5). */
export function claimAt(sim: Sim, p: { x: number; z: number }): CellClaim {
  const t = sim.state.rivals.territory;
  const c = cellAt(t, p.x, p.z);
  if (c < 0 || t.marks.length === 0) return { owner: -1, mark: 0, contested: false };
  let best = -1, bestV = 0, second = 0;
  const base = c * t.slots;
  for (let s = 0; s < t.slots; s++) {
    const v = t.marks[base + s];
    if (v > bestV) { second = bestV; bestV = v; best = s; } else if (v > second) second = v;
  }
  if (bestV < TERR_CLAIM_MIN) return { owner: -1, mark: bestV, contested: false };
  if (second >= TERR_CLAIM_MIN && bestV < TERR_CLAIM_RATIO * second) return { owner: -1, mark: bestV, contested: true };
  return { owner: t.slotColony[best], mark: bestV, contested: false };
}
