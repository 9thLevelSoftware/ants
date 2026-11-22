// The founding queen keeps her clutch out of the water (colony-life round 9, FD2; direction 21b). A cell dug in the
// rain catches water through its open shaft (GDD 03 §11.1) and the seal keeps it in until the soil drains it; eggs
// laid on the wet floor drowned after FLOOD_BROOD_DROWN_S (the browser's first play on seed 2: six eggs lost 700
// ticks into the lapse, the cell 24-26 % flooded). In the sealed cell the queen is the only carer, and GDD 06 §5.11
// names what she does when water enters the chamber: "carry eggs/larvae to the highest alcove". Her care (care.ts)
// does it every care period: brood lying under water is put down on the highest dry floor of her cavity.

import type { Vec3 } from '@/core/math/vec3';
import type { Brood, Nest, Sim } from '@/sim/types';
import { floodCavity, floodStart, isOpenSample, keyPos } from './leak';

/**
 * The floor point of the founding cavity nearest the cell's centre that lies above the water (`level`, mm), or null
 * when none does: an open cavity sample with soil under it, its floor half a voxel below the sample.
 */
export function dryFloorAbove(sim: Sim, nest: Nest, level: number): Vec3 | null {
  const v = sim.carve.voxel, at = { x: 0, y: 0, z: 0 };
  const cell = nest.chambers.find((c) => c.type === 'founding') ?? nest.chambers[0];
  const centre = cell ? cell.center : floodStart(sim, nest);
  let best: Vec3 | null = null, bestD = Infinity;
  for (const k of floodCavity(sim, floodStart(sim, nest)).cavity.keys()) {
    keyPos(sim, k, at);
    const i = Math.round(at.x / v), j = Math.round(at.y / v), kk = Math.round(at.z / v);
    // a floor: soil under the sample (not open carve, not open air)
    if (isOpenSample(sim, i, j - 1, kk) || sim.field.substrateXYZ(at.x, at.y - v, at.z) >= 0) continue;
    const floorY = at.y - 0.5 * v;
    if (floorY <= level) continue;
    const d = (at.x - centre.x) ** 2 + (floorY - centre.y) ** 2 + (at.z - centre.z) ** 2;
    // nearest the cell's centre; ties by position, so the choice is deterministic
    if (d < bestD || (d === bestD && best && (at.x < best.x || (at.x === best.x && (at.z < best.z || (at.z === best.z && floorY < best.y)))))) {
      bestD = d;
      best = { x: at.x, y: floorY, z: at.z };
    }
  }
  return best;
}

/**
 * Moves the founding colony's brood that lies under water (the flood's submersion pass marked it: submergedS > 0)
 * to the highest dry floor of the cavity: the dry floor point nearest the cell's centre. Returns how many moved.
 */
export function keepClutchDry(sim: Sim, nest: Nest, brood: readonly Brood[]): number {
  const level = nest.flood.level;
  if (level <= -1e8) return 0;
  let spot: Vec3 | null | undefined;
  let moved = 0;
  for (const b of brood) {
    if (!b.alive || b.carriedBy !== -1 || (b.submergedS ?? 0) <= 0) continue;
    if (spot === undefined) spot = dryFloorAbove(sim, nest, level);
    if (!spot) return moved;
    b.pos.x = spot.x; b.pos.y = spot.y; b.pos.z = spot.z;
    b.nestId = nest.id;
    delete b.submergedS;
    moved++;
  }
  return moved;
}
