// Climb routes and points of interest (GDD 04 §10): authored waypoint chains on world objects, bottom first,
// walked in either direction. The planner uses them to reach elevated goals (table tops, stems) and to leave them.

import type { Vec3 } from '@/core/math/vec3';
import type { ClimbRoute, WorldData } from '@/sim/types';

export interface RouteHit {
  route: ClimbRoute;
  /** Node index nearest to the query point. */
  idx: number;
  /** Distance to that node, mm. */
  dist: number;
}

/** Nearest route node to p within maxDist (optionally ignoring base nodes), or null. Deterministic (route order). */
export function nearestRouteNode(world: WorldData, p: Vec3, maxDist: number, minIdx = 0): RouteHit | null {
  let best: RouteHit | null = null;
  const m2 = maxDist * maxDist;
  for (const r of world.climbRoutes) {
    const pts = r.points;
    for (let i = minIdx; i < pts.length; i++) {
      const q = pts[i];
      const d2 = (q.x - p.x) ** 2 + (q.y - p.y) ** 2 + (q.z - p.z) ** 2;
      if (d2 <= m2 && (!best || d2 < best.dist * best.dist)) best = { route: r, idx: i, dist: Math.sqrt(d2) };
    }
  }
  return best;
}

export function routeById(world: WorldData, id: number): ClimbRoute | undefined {
  return world.climbRoutes.find((r) => r.id === id);
}

/** Point of interest by id (GDD 04 §10), or undefined. */
export function poiById(world: WorldData, id: number): WorldData['pois'][number] | undefined {
  return world.pois.find((p) => p.id === id);
}
