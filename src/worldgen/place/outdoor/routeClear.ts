// Litter off the climb routes. Props (twigs, leaves, pebbles, mulch) rest on any support, so one could land across
// a bench seat or a stump top on the route, or a plant could grow with a leaf lying over its stem foot or reaching
// across a neighbour's stem: the route's waypoints then sit on the litter's flank and a walker steered along them
// gets stuck. Small things (props and plants) are refused where they would come within OUTDOOR.routeClearBu of a
// route node of an object placed before them, an object with routes where one of its nodes would come that close to
// a small thing placed before it, and a small thing with routes (a plant) where a node would come that close to
// anything.

import type { Vec3 } from '@/core/math/vec3';
import type { WorldObject } from '@/sim/types';
import { primEval } from '@/sim/world/primHash';
import type { GenContext } from '../../kit/context';
import { primIndex } from '../../kit/surface';
import { OUTDOOR } from './tuning';

interface NodeGrid { cell: number; cells: Map<number, Vec3[]>; props: Set<number> }

const grids = new WeakMap<GenContext, NodeGrid>();
const _hits: number[] = [];

function grid(ctx: GenContext): NodeGrid {
  let g = grids.get(ctx);
  if (!g) { g = { cell: OUTDOOR.routeClearCellMm, cells: new Map(), props: new Set() }; grids.set(ctx, g); }
  return g;
}

const key = (i: number, k: number) => i * 65536 + k;

/** Props and plants: the small things that must keep off other objects' routes. */
export const isSmall = (ob: WorldObject): boolean => ob.tags.includes('prop') || ob.tags.includes('plant');

/** Registers a placed object: its route nodes, and the object itself when it is a prop. */
export function registerForRoutes(ctx: GenContext, ob: WorldObject): void {
  const g = grid(ctx);
  if (isSmall(ob)) g.props.add(ob.id);
  for (const rid of ob.routeIds) {
    const r = ctx.world.climbRoutes.find((x) => x.id === rid);
    if (!r) continue;
    for (const p of r.points) {
      const k = key(Math.floor(p.x / g.cell), Math.floor(p.z / g.cell));
      const list = g.cells.get(k);
      if (list) list.push(p); else g.cells.set(k, [p]);
    }
  }
}

/** True when a primitive of the small object `ob` comes within the clearance of a registered route node. */
export function propBlocksRoute(ctx: GenContext, ob: WorldObject): boolean {
  const g = grid(ctx);
  if (g.cells.size === 0) return false;
  const clear = OUTDOOR.routeClearBu * ctx.dims.bu, ix = primIndex(ctx);
  for (let i = ob.primStart; i < ob.primStart + ob.primCount; i++) {
    const e = ix.entries[i];
    for (let ci = Math.floor((e.minX - clear) / g.cell); ci <= Math.floor((e.maxX + clear) / g.cell); ci++)
      for (let ck = Math.floor((e.minZ - clear) / g.cell); ck <= Math.floor((e.maxZ + clear) / g.cell); ck++) {
        for (const p of g.cells.get(key(ci, ck)) ?? []) {
          if (p.y < e.minY - clear || p.y > e.maxY + clear) continue;
          if (primEval(e, p.x, p.y, p.z, null) < clear) return true;
        }
      }
  }
  return false;
}

/**
 * True when a route node of `ob` comes within the clearance of a small object placed before it; for a small object
 * itself (a plant), of any other object (a stem rising a millimetre from a shed floor's edge leaves a slot no walker
 * climbs).
 */
export function routeHitsProp(ctx: GenContext, ob: WorldObject): boolean {
  if (ob.routeIds.length === 0) return false;
  const props = grid(ctx).props;
  const any = isSmall(ob);
  if (props.size === 0 && !any) return false;
  const clear = OUTDOOR.routeClearBu * ctx.dims.bu, ix = primIndex(ctx);
  for (const rid of ob.routeIds) {
    const r = ctx.world.climbRoutes.find((x) => x.id === rid);
    if (!r) continue;
    for (const p of r.points) {
      ix.query(p.x - clear, p.z - clear, p.x + clear, p.z + clear, _hits);
      for (const h of _hits) {
        const e = ix.entries[h];
        const other = e.prim.objectId;
        if (other === ob.id || p.y < e.minY - clear || p.y > e.maxY + clear) continue;
        // a big object counts unless it is the support under the node (a slab under a pot, a floor slab)
        if (!props.has(other) && (!any || ctx.groundPrims.has(e.prim.id) || e.maxY <= p.y)) continue;
        if (primEval(e, p.x, p.y, p.z, null) < clear) return true;
      }
    }
  }
  return false;
}
