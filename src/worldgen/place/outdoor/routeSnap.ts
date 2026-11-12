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
import { primIndex } from '../../kit/surface';
import { OUTDOOR } from './tuning';

/** x * x (not **: DET-4). */
const sq = (x: number): number => x * x;

const S = OUTDOOR.snap;

export function snapRoutes(ctx: GenContext, objects: ReadonlySet<number>): { nodes: number; failed: number } {
  const w = ctx.world, bu = ctx.dims.bu;
  if (w.climbRoutes.length === 0) return { nodes: 0, failed: 0 };
  // The field is built from the primitives around the routed objects only: the spatial hash of the whole world
  // (house walls, floor slabs: tens of thousands of 3D cells each) would cost seconds.
  const ix = primIndex(ctx);
  const keep = new Set<number>(), hits: number[] = [];
  for (const ob of w.objects) {
    if (!objects.has(ob.id) || ob.routeIds.length === 0) continue;
    let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
    for (let i = ob.primStart; i < ob.primStart + ob.primCount; i++) {
      const e = ix.entries[i];
      x0 = Math.min(x0, e.minX); z0 = Math.min(z0, e.minZ); x1 = Math.max(x1, e.maxX); z1 = Math.max(z1, e.maxZ);
    }
    ix.query(x0 - S.nearMm, z0 - S.nearMm, x1 + S.nearMm, z1 + S.nearMm, hits);
    for (const h of hits) {
      const e = ix.entries[h];
      if (Math.max(e.maxX - e.minX, e.maxY - e.minY, e.maxZ - e.minZ) <= S.hugeMm) keep.add(h);
    }
  }
  const prims = [...keep].sort((a, b) => a - b).map((i) => w.prims[i]);
  // coarse hash cells: registering tall trunks and long logs in 8 BU cells cost most of this step (about 1 s on a
  // woodland map); the projection only ever evaluates the few primitives around a route node
  const field = createWorldField({ size: w.size, bu: w.bu, terrain: w.terrain, ground: w.ground, prims, terrainHoles: w.terrainHoles }, null, { params: { hashCell: S.hashCellBu * bu } });
  const foot = WALKER_TUNING.footOffsetBU * bu;
  const out: Vec3 = { x: 0, y: 0, z: 0 };
  let nodes = 0, failed = 0;
  for (const r of w.climbRoutes) {
    if (!objects.has(r.objectId)) continue;
    const res: Vec3[] = [], jumped: boolean[] = [];
    const push = (p: Vec3) => {
      const q = field.project(p, foot, out) ? { x: out.x, y: out.y, z: out.z } : (failed++, { ...p });
      const last = res[res.length - 1];
      if (!last || sq(q.x - last.x) + sq(q.y - last.y) + sq(q.z - last.z) >= sq(S.mergeBu * bu)) {
        res.push(qvec(q));
        jumped.push(sq(q.x - p.x) + sq(q.y - p.y) + sq(q.z - p.z) > sq(S.jumpBu * bu));
      }
      nodes++;
    };
    push(r.points[0]);
    for (let i = 1; i < r.points.length; i++) {
      const a = r.points[i - 1], b = r.points[i];
      const d = Math.sqrt(sq(b.x - a.x) + sq(b.y - a.y) + sq(b.z - a.z));
      const n = Math.max(1, Math.ceil(d / (S.stepBu * bu)));
      for (let k = 1; k <= n; k++) push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n, z: a.z + ((b.z - a.z) * k) / n });
    }
    // an end node covered by a neighbouring object (no surface to project to, or one far from where the template
    // put it: it snapped back onto the object) is dropped
    const buried = (i: number) => jumped[i] || field.sampleXYZ(res[i].x, res[i].y, res[i].z) < 0.5 * foot;
    while (res.length > 2 && buried(0)) { res.shift(); jumped.shift(); }
    while (res.length > 2 && buried(res.length - 1)) { res.pop(); jumped.pop(); }
    if (res.length >= 2) r.points = res;
  }
  return { nodes, failed };
}
