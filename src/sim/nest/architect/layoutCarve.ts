// Instant carve of one plan for a whole-nest layout (GDD 03 §15 `instantCarve`): ONE brush pass whose shape is
// the plan volume itself (sdf = -g), clipped by the plan clip and the species' dig predicate, then the plan's
// completion (chamber registration). The nest module's instantCarvePlan carves the plan's sphere lattice one
// sphere at a time and then snaps every half-open target sample with its own brush; each of those brushes pays
// the follow-ups (walker refresh, entrance re-evaluation, cavity joins). For a layout that per-sphere cost was
// most of the carving time (architect review, acceptance 6). One pass opens every target sample (g > 0 gives
// openness >= OPEN_MIN, so the completion snap finds nothing left) and runs the follow-ups once.

import type { Vec3 } from '@/core/math/vec3';
import type { Nest, Sim } from '@/sim/types';
import { PLAN_CLIP_BU } from '@/sim/balance/nest';
import { applyBrush, type BrushShape } from '../carve/brushes';
import { CarveStore } from '../carve/grid';
import { afterBrush } from '../carveOps';
import { removeItem } from '@/sim/entities';
import { isPellet } from '../pellets';
import { planG, type PlanGeometry } from '../plans/geometry';
import { completePlan, planById } from '../plans/plans';
import { planCache } from '../plans/targets';

/** Tight AABB of a plan volume (the geometry's own bounds, tight since sim-fix-colony), mm. */
export function tightBounds(g: PlanGeometry): { min: Vec3; max: Vec3 } {
  return { min: g.min, max: g.max };
}

/** The plan volume as a carve brush shape (openness 0.5 on the plan surface, full inside). */
function planShape(g: PlanGeometry): BrushShape {
  const { min, max } = tightBounds(g);
  const cx = (min.x + max.x) / 2, cy = (min.y + max.y) / 2, cz = (min.z + max.z) / 2;
  return {
    minX: min.x, minY: min.y, minZ: min.z, maxX: max.x, maxY: max.y, maxZ: max.z,
    cx, cy, cz, reach: Math.hypot(max.x - cx, max.y - cy, max.z - cz),
    sdf: (x, y, z) => -planG(g, x, y, z),
    core(x, y, z, out) { // breach records: a sphere at the sample, as deep as the sample lies in the volume
      out.x = x; out.y = y; out.z = z;
      return Math.max(planG(g, x, y, z), 0);
    },
  };
}

/**
 * Carves a plan of the nest at once and completes it. The completion pellets (none in practice) are taken out of
 * the nest: the layout puts all of its spoil onto the mound once, at the end. Returns the removed volume, BU^3.
 */
export function carvePlanAtOnce(sim: Sim, nest: Nest, planId: number): number {
  const found = planById(sim, planId);
  const cache = found ? planCache(sim, nest, found.plan) : null;
  if (!found || !cache) return 0;
  // the kernel offers sphere / capsule / ellipsoid brushes only; a custom shape needs the grid implementation
  // (always a CarveStore, createCarveGrid) - reported as a request for a kernel `carveShape` brush
  const grid = sim.carve;
  if (!(grid instanceof CarveStore)) throw new Error('layoutNest: the carve grid is not a CarveStore');
  const bu = sim.world.bu, g = cache.geometry, clip = PLAN_CLIP_BU * bu, shape = planShape(g);
  const canDig = (x: number, y: number, z: number) => planG(g, x, y, z) > -clip && sim.kernel.canDigAt(x, y, z);
  const res = applyBrush(grid, shape, 'carve', { canDig });
  afterBrush(sim, res, { x: shape.cx, y: shape.cy, z: shape.cz }, shape.reach);
  completePlan(sim, nest, found.plan, cache);
  let vol = res.volume / bu ** 3;
  for (const it of sim.stores.items.list) {
    if (!it.alive || !isPellet(it) || it.nestId !== nest.id || it.carrierIds.length > 0) continue;
    vol += it.volume;
    removeItem(sim, it.id, 'layout');
  }
  return vol;
}
