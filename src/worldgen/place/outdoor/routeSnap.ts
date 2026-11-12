// Climb-route nodes onto the surface (GDD 04 §10: "nodes lie on the surface, offset by the walker's foot
// offset"). Templates author routes from their own geometry, but the real surface also has the terrain under the
// object, edge rounding, smooth unions with neighbours and resting tilt; so once every object is placed, each
// route is resampled finely and every node is projected onto the level set f = foot offset of the world field.
// Nodes that do not converge (none expected) keep their authored position.

import type { Vec3 } from '@/core/math/vec3';
import { createWorldField } from '@/sim/world/field';
import { WALKER_TUNING } from '@/sim/locomotion/walkerParams';
import type { GenContext } from '../../kit/context';
import { qvec } from '../../kit/quantize';

/** Resample step along a route before projecting, BU (corners need several nodes). */
const SNAP_STEP_BU = 2;
/** Consecutive projected nodes closer than this are merged, BU. */
const MERGE_BU = 0.5;

export function snapRoutes(ctx: GenContext, objects: ReadonlySet<number>): { nodes: number; failed: number } {
  const w = ctx.world, bu = ctx.dims.bu;
  if (w.climbRoutes.length === 0) return { nodes: 0, failed: 0 };
  const field = createWorldField(w, null);
  const foot = WALKER_TUNING.footOffsetBU * bu;
  const out: Vec3 = { x: 0, y: 0, z: 0 };
  let nodes = 0, failed = 0;
  for (const r of w.climbRoutes) {
    if (!objects.has(r.objectId)) continue;
    const res: Vec3[] = [];
    const push = (p: Vec3) => {
      const q = field.project(p, foot, out) ? { x: out.x, y: out.y, z: out.z } : (failed++, { ...p });
      const last = res[res.length - 1];
      if (!last || (q.x - last.x) ** 2 + (q.y - last.y) ** 2 + (q.z - last.z) ** 2 >= (MERGE_BU * bu) ** 2) res.push(qvec(q));
      nodes++;
    };
    push(r.points[0]);
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      const d = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
      const n = Math.max(1, Math.ceil(d / (SNAP_STEP_BU * bu)));
      for (let k = 1; k <= n; k++) push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    if (res.length >= 2) r.points = res;
  }
  return { nodes, failed };
}
