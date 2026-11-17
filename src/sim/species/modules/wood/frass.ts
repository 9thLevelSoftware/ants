// Frass (GDD 07 §6.2.3): chewed wood leaves the nest as `frass` items (bites in wood make frass, GDD 03 §1.2) that
// the haulers drop from the openings in the wood; dropped from a side opening they fall to the foot of the wood and
// settle into a frass pile (a mound record with material 'frass', the nest module's pile API). This file counts
// pile units, frass visibility, the windows in each wood, and the carved fraction of a nest's wood.

import type { Colony, Sim, WoodState } from '@/sim/types';
import { BULKING, V_BITE_NOMINAL } from '@/sim/balance/nest';
import { keyCx, keyCy, keyCz } from '@/sim/nest/carve/keys';
import { isInteriorAt } from '@/sim/environment/ground';
import type { WoodParams } from './params';
import { primDistance, volumeMm3 } from './primGeom';
import { primOf, woodOf } from './woodState';

/** Pile units of a frass mound: (deposited volume / BULKING) / (FRASS_PER_PILE_UNIT nominal bites). */
export function pileUnits(volumeBu3: number, p: WoodParams): number {
  return volumeBu3 / BULKING / (p.frassPerPileUnit * V_BITE_NOMINAL);
}

/**
 * Frass units of a colony (its nests' frass piles and the frass lying outside, not yet settled), interior and
 * outdoor, and the visibility index `interior x 1.0 + outdoor x 0.2` (GDD 07 §6.2.3).
 */
export function frassTally(sim: Sim, col: Colony, p: WoodParams): { interior: number; outdoor: number; visibility: number } {
  const nests = new Set(col.nestIds);
  let interior = 0, outdoor = 0;
  for (const m of sim.state.worldDelta.mounds) {
    if (m.material !== 'frass' || !nests.has(m.nestId)) continue;
    const u = pileUnits(m.volume, p);
    if (isInteriorAt(sim.world, m.centerX, m.centerZ)) interior += u; else outdoor += u;
  }
  for (const it of sim.stores.items.list) {
    if (!it.alive || it.kind !== 'frass' || it.inNest || it.carrierIds.length > 0 || !nests.has(it.nestId)) continue;
    const u = 1 / p.frassPerPileUnit;
    if (isInteriorAt(sim.world, it.pos.x, it.pos.z)) interior += u; else outdoor += u;
  }
  return { interior, outdoor, visibility: interior * p.frassVisibilityInterior + outdoor * p.frassVisibilityOutdoor };
}

/** Open entrances of the colony's nests whose mouth lies on this wood's surface (within 1.5 BU). */
export function windowsIn(sim: Sim, col: Colony, w: WoodState): number {
  const prim = primOf(sim, w.primId);
  if (!prim) return 0;
  const reach = 1.5 * sim.world.bu;
  let n = 0;
  for (const id of col.nestIds) {
    const nest = sim.stores.nests.get(id);
    if (!nest) continue;
    for (const e of nest.entrances) if (e.status === 'open' && Math.abs(primDistance(prim, e.pos)) <= reach) n++;
  }
  return n;
}

const CHUNK = 16;

/**
 * Carved fraction of a wood primitive: open carve samples inside it (over the carve chunks that overlap it) times
 * the voxel volume, over its volume. Cost: the chunks of the nest only (the carve grid is sparse).
 */
export function carvedFraction(sim: Sim, primId: number): number {
  const prim = primOf(sim, primId);
  if (!prim) return 0;
  const b = { minX: 0, minY: 0, minZ: 0, maxX: 0, maxY: 0, maxZ: 0, diggable: false };
  if (!sim.field.primBounds(primId, b)) return 0;
  const carve = sim.carve, v = carve.voxel;
  const p = { x: 0, y: 0, z: 0 };
  let open = 0;
  for (const key of carve.data.keys) {
    const cx = keyCoord(key, 0) * CHUNK * v, cy = keyCoord(key, 1) * CHUNK * v, cz = keyCoord(key, 2) * CHUNK * v;
    const span = CHUNK * v;
    if (cx > b.maxX || cx + span < b.minX || cy > b.maxY || cy + span < b.minY || cz > b.maxZ || cz + span < b.minZ) continue;
    carve.forEachOpenSample(key, (i, j, k, o) => {
      p.x = i * v; p.y = j * v; p.z = k * v;
      if (primDistance(prim, p) < 0) open += o / 255;
    });
  }
  return Math.max(0, Math.min(1, (open * v * v * v) / Math.max(1e-9, volumeMm3(prim))));
}

function keyCoord(key: number, axis: 0 | 1 | 2): number {
  return axis === 0 ? keyCx(key) : axis === 1 ? keyCy(key) : keyCz(key);
}

/** Refreshes carved fraction and window count of the wood every site of the colony lies in. */
export function refreshSiteWood(sim: Sim, col: Colony): void {
  for (const s of col.wood?.sites ?? []) {
    if (s.primId < 0) continue;
    const w = woodOf(sim, s.primId);
    if (!w) continue;
    w.carvedFrac = carvedFraction(sim, s.primId);
    w.windowCount = windowsIn(sim, col, w);
  }
}

/** Frass items newly lying outside a colony's nests since the last pass (for `frass-ejected` and the cue). */
export function newlyEjected(sim: Sim, col: Colony, seen: Set<number>): { id: number; pos: { x: number; y: number; z: number }; nestId: number }[] {
  const out: { id: number; pos: { x: number; y: number; z: number }; nestId: number }[] = [];
  const nests = new Set(col.nestIds);
  for (const it of sim.stores.items.list) {
    if (!it.alive || it.kind !== 'frass' || it.inNest || it.carrierIds.length > 0 || !nests.has(it.nestId) || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push({ id: it.id, pos: { ...it.pos }, nestId: it.nestId });
  }
  return out;
}
