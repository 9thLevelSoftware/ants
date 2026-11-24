// The sealed queen keeps herself out of the water during the time-lapse (task opening-fix, seed 2). A cell dug in
// the rain catches water through its open shaft (GDD 03 §11.1) and the seal keeps it in until the soil drains it;
// FD2 (dryPile.ts) keeps the clutch on the dry floor, but the queen herself was held at rest for the whole lapse
// (system.ts: her care is automatic, her intent zero) and the flee-water rule leaves a founding queen to this module
// (ants/behaviours/nest/fleeWater.ts). So a queen the player left standing in the cell's water drowned there in the
// lapse ("Water filled the burrow", the browser's first play on seed 2, Nov 23). GDD 03 §11.3: an ant in a flooded
// nest flees the water until dry; GDD 06 §5.11: in the lapse the queen does her care by herself. Here she walks, by
// her own movement input (she stays possessed, like the seal guide's walk; locomotion when she is not), along the
// cavity to the dry floor the clutch is kept on, and stands still again once her feet are FLEE_DRY_MARGIN clear of the water. The same depth
// rule as the flee rule: she sets off at FLEE_WATER_DEPTH_BU over her feet, before her submersion clock starts.
// State: the walk flag in q.bb (persisted); the target is recomputed from the flood state every tick.

import type { Vec3 } from '@/core/math/vec3';
import type { Ant, Nest, Sim } from '@/sim/types';
import { FLEE_ARRIVE_BU, FLEE_DRY_MARGIN_BU, FLEE_WATER_DEPTH_BU } from '@/sim/balance/weather';
import { SEAL_ROUTE_MAX_SAMPLES, SEAL_WAYPOINT_BU, SEAL_WAYPOINT_TANGENT } from '@/sim/balance/founding';
import { depthOver, waterView } from '@/sim/nest/flood/dryPlace';
import { navStop, navTo } from '@/sim/locomotion';
import { bbGet, bbSet } from './access';
import { dryFloorAbove } from './dryPile';
import { cavityRoute, keyPos } from './leak';

/** q.bb key: 1 while she walks out of the water. */
export const QUEEN_DRY_KEY = 'fd.dryWalk';

function len(x: number, y: number, z: number): number {
  return Math.sqrt(x * x + y * y + z * z);
}

function feetY(q: Ant): number {
  return q.pos.y - q.up.y * q.footOffset;
}

/** Her movement input: toward the first waypoint of the cavity route to `to` that lies along her surface. */
function steerTo(sim: Sim, q: Ant, to: Vec3): void {
  const i = sim.state.player.intent, bu = sim.world.bu, v = sim.carve.voxel, p = { x: 0, y: 0, z: 0 };
  const route = cavityRoute(sim, q.pos, to, SEAL_ROUTE_MAX_SAMPLES);
  let best: Vec3 | null = null, bestT = 0;
  for (const k of route ?? []) {
    keyPos(sim, k, p);
    const dx = p.x - q.pos.x, dy = p.y - q.pos.y, dz = p.z - q.pos.z, d = len(dx, dy, dz);
    if (d < SEAL_WAYPOINT_BU * bu - v) continue;
    const ux = dx / d, uy = dy / d, uz = dz / d, n = ux * q.up.x + uy * q.up.y + uz * q.up.z;
    const tx = ux - n * q.up.x, ty = uy - n * q.up.y, tz = uz - n * q.up.z, tl = len(tx, ty, tz);
    if (tl > bestT) { bestT = tl; best = { x: tx / tl, y: ty / tl, z: tz / tl }; }
    if (tl >= SEAL_WAYPOINT_TANGENT) break;
  }
  if (!best) {
    const dx = to.x - q.pos.x, dy = to.y - q.pos.y, dz = to.z - q.pos.z, d = len(dx, dy, dz) || 1;
    best = { x: dx / d, y: dy / d, z: dz / d };
  }
  i.dir.x = best.x; i.dir.y = best.y; i.dir.z = best.z;
}

/**
 * One lapse tick (after the founding has held her intent at rest): if she stands in the cell's water, or is on her
 * way out of it, her intent walks her to the dry floor. Returns true while she walks.
 */
export function keepQueenDry(sim: Sim, q: Ant, nest: Nest): boolean {
  const w = waterView(sim, nest);
  const walking = bbGet(q, QUEEN_DRY_KEY, 0) === 1;
  const possessed = sim.state.player.possessedAntId === q.id;
  const stop = (): false => {
    if (walking) { bbSet(q, QUEEN_DRY_KEY, 0); if (!possessed) navStop(sim, q); }
    return false;
  };
  if (!w) return stop();
  const bu = sim.world.bu, depth = depthOver(sim, w, q.pos, feetY(q));
  if (!walking && depth < FLEE_WATER_DEPTH_BU * bu) return false;
  if (depth <= -FLEE_DRY_MARGIN_BU * bu) return stop();
  const floor = dryFloorAbove(sim, nest, w.level + FLEE_DRY_MARGIN_BU * bu);
  if (!floor) return stop(); // nowhere dry in the cavity: she stays (her clutch too)
  bbSet(q, QUEEN_DRY_KEY, 1);
  // possessed (the browser's lapse): her own movement input, like the seal guide's walk; else locomotion
  if (possessed) steerTo(sim, q, floor);
  else if (!walking || q.nav.status !== 'moving') navTo(sim, q, floor, FLEE_ARRIVE_BU * bu);
  return true;
}
