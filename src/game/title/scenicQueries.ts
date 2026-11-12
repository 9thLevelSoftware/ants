// Debug read-outs for scripted look checks (tests/e2e/dressing.mjs): where in the running game's world to put the
// camera for a lawn-with-leaf-litter view and for a view across the map edge. Registered as `__game.query.lawnSpot()`
// and `__game.query.edgeView()` through the debug API's registerQuery (no edit of the debug API itself).
import { registerQuery } from '@/game/debug/query';
import { DECOR_OBJECTS, LEAF } from '@/render/world/decor/tuning';
import { zoneTypeAt } from '@/render/world/lighting/simAdapter';
import type { Sim, ZoneType } from '@/sim/types';

/**
 * Leaf litter on a lawn falls linearly from the full forest density at a tree to 0 at LEAF.fringeMm (GDD 04 §9; the
 * decor's leafShare). The lawn spot wants at least this share of it, and keeps this far from the trunk itself.
 */
export const LAWN_MIN_LITTER_SHARE = 0.75;
export const LAWN_MIN_TREE_DIST_MM = 500;
/** Free space wanted above a spot (no primitive), BU. */
const CLEAR_ABOVE_BU = 4;

function clearAbove(sim: Sim, x: number, z: number): boolean {
  const bu = sim.world.bu, y = sim.field.height(x, z);
  return sim.field.sampleXYZ(x, y + CLEAR_ABOVE_BU * bu, z) > 0.5 * CLEAR_ABOVE_BU * bu && sim.field.sampleXYZ(x, y + bu, z) > 0.5 * bu;
}

/** Share of the full leaf density on a lawn at `treeDistMm` from the nearest tree (0..1). */
export function lawnLitterShare(treeDistMm: number): number {
  return Math.max(0, Math.min(1, 1 - treeDistMm / LEAF.fringeMm));
}

export interface LawnSpot { x: number; y: number; z: number; treeDistMm: number; litterShare: number }

/**
 * A lawn point near a tree (grass and fallen leaves together): among clear lawn cells with at least
 * LAWN_MIN_LITTER_SHARE of the litter, the one nearest the queen's start; if there is none, the clear lawn cell with
 * the most litter. Null when no lawn cell lies within a tree's litter fringe.
 */
export function lawnSpot(sim: Sim): LawnSpot | null {
  const w = sim.world, cell = w.maps.zone.cell, n = Math.floor(w.size / cell);
  const trees = w.objects.filter((o) => (DECOR_OBJECTS.trees as readonly string[]).includes(o.templateId));
  const start = w.queenStart.pos;
  let near: LawnSpot | null = null, nearD = Infinity, rich: LawnSpot | null = null;
  for (let k = 2; k < n - 2; k++) for (let i = 2; i < n - 2; i++) {
    const x = (i + 0.5) * cell, z = (k + 0.5) * cell;
    if (zoneTypeAt(w, x, z) !== 'lawn') continue;
    let td = Infinity;
    for (const t of trees) td = Math.min(td, Math.hypot(t.pos.x - x, t.pos.z - z));
    const share = lawnLitterShare(td);
    if (td < LAWN_MIN_TREE_DIST_MM || share <= 0) continue;
    const d = Math.hypot(x - start.x, z - start.z);
    const good = share >= LAWN_MIN_LITTER_SHARE;
    if (good ? d >= nearD : rich !== null && share <= rich.litterShare) continue;
    if (!clearAbove(sim, x, z)) continue;
    const spot = { x, y: sim.field.height(x, z), z, treeDistMm: Math.round(td), litterShare: share };
    if (good) { near = spot; nearD = d; } else rich = spot;
  }
  return near ?? rich;
}

/** A camera pose inside the map looking out across an outdoor edge (pos, look in mm), and that edge's zone. */
export function edgeView(sim: Sim): { pos: { x: number; y: number; z: number }; look: { x: number; y: number; z: number }; zone: ZoneType; side: number } | null {
  const w = sim.world, S = w.size, bu = w.bu, inset = 150 * bu;
  const prefer: ZoneType[] = ['forest', 'lawn', 'garden-bed', 'sand', 'pavement', 'asphalt', 'rubber'];
  const cands = [
    { side: 0, x: S / 2, z: inset, ox: 0, oz: -1 }, { side: 1, x: S - inset, z: S / 2, ox: 1, oz: 0 },
    { side: 2, x: S / 2, z: S - inset, ox: 0, oz: 1 }, { side: 3, x: inset, z: S / 2, ox: -1, oz: 0 },
  ].map((c) => ({ ...c, zone: zoneTypeAt(w, c.x + c.ox * (inset - bu), c.z + c.oz * (inset - bu)) }))
    .filter((c) => c.zone !== 'interior')
    .sort((a, b) => prefer.indexOf(a.zone) - prefer.indexOf(b.zone));
  const c = cands[0];
  if (!c) return null;
  const y = sim.field.height(c.x, c.z);
  const ex = c.x + c.ox * (inset + 600 * bu), ez = c.z + c.oz * (inset + 600 * bu);
  // an observer's view: raised above the ground, looking out across the edge and slightly down
  return { pos: { x: c.x, y: y + 120 * bu, z: c.z }, look: { x: ex, y: y + 20 * bu, z: ez }, zone: c.zone, side: c.side };
}

let registered = false;

/** Registers the read-outs once (idempotent). */
export function registerScenicQueries(): void {
  if (registered) return;
  registered = true;
  registerQuery('lawnSpot', (sim) => lawnSpot(sim));
  registerQuery('edgeView', (sim) => edgeView(sim));
}
