// How a walker reaches a food anchor: from a walkable nav cell under it (ground anchors), or from the foot of a
// walkable climb route that ends at it (flowers, branches, counter tops). Used to accept anchors when they are
// placed and to prune anchors the final start cannot reach (acceptance 5).

import type { Vec3 } from '@/core/math/vec3';
import type { GenContext } from '../kit/context';
import { cellAt, snapWalkable } from '../validate/graph';
import { walkable } from '../maps/nav';
import { objectById, routeById, routeWalkable } from './common';

export interface AnchorAccess {
  /** Walkable nav cell the walker starts from. */
  cell: number;
  /** Climb from that cell to the anchor, BU (0 on the ground). */
  climbBu: number;
}

/** Height tolerance of a ground anchor against its cell's walkable ground, BU. */
const GROUND_TOL_BU = 4;
/** A route end this close (vertically, horizontally) to an anchor on a top surface reaches it, BU. */
const TOP_DY_BU = 3;
const TOP_DXZ_BU = 40;
/** A route node this close to the anchor reaches it directly, BU. */
const NODE_BU = 3;

export function anchorAccess(ctx: GenContext, pos: Vec3, objectId = -1): AnchorAccess | null {
  const bu = ctx.dims.bu;
  const c = cellAt(ctx, pos.x, pos.z);
  const gy = ctx.world.nav.groundY;
  if (walkable(ctx.world.nav.cls.data[c]) && gy && Math.abs(pos.y - gy[c]) <= GROUND_TOL_BU * bu) return { cell: c, climbBu: 0 };
  // a route of the host object passing the anchor, else any route ending level with it nearby
  let best: AnchorAccess | null = null;
  const consider = (rid: number, nearNode: boolean) => {
    const r = routeById(ctx, rid);
    if (!r || r.points.length < 2) return;
    let len = 0, hit = -1;
    for (let i = 0; i < r.points.length; i++) {
      const p = r.points[i];
      if (i > 0) { const q = r.points[i - 1]; len += Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2 + (p.z - q.z) ** 2); }
      const d2 = (p.x - pos.x) ** 2 + (p.y - pos.y) ** 2 + (p.z - pos.z) ** 2;
      if (nearNode ? d2 <= (NODE_BU * bu) ** 2 : i === r.points.length - 1 && Math.abs(p.y - pos.y) <= TOP_DY_BU * bu
        && (p.x - pos.x) ** 2 + (p.z - pos.z) ** 2 <= (TOP_DXZ_BU * bu) ** 2) { hit = i; break; }
    }
    if (hit < 0 || !routeWalkable(ctx, rid)) return;
    const foot = r.points[0];
    const cell = snapWalkable(ctx, cellAt(ctx, foot.x, foot.z));
    if (cell < 0) return;
    const climb = len / bu;
    if (!best || climb < best.climbBu) best = { cell, climbBu: climb };
  };
  const ob = objectId >= 0 ? objectById(ctx, objectId) : undefined;
  if (ob) for (const rid of ob.routeIds) consider(rid, true);
  if (best) return best;
  for (const r of ctx.world.climbRoutes) {
    const e = r.points[r.points.length - 1];
    if (Math.abs(e.y - pos.y) <= TOP_DY_BU * bu && (e.x - pos.x) ** 2 + (e.z - pos.z) ** 2 <= (TOP_DXZ_BU * bu) ** 2) consider(r.id, false);
  }
  return best;
}
