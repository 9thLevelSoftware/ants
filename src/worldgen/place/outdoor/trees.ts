// Trees (GDD 04 §5.1, §5.3, §5.6; large structures, budget TREE_MAX): forest standing trees by Poisson disk
// (spacing 2500, >= 600 from the zone edge, gentle slope, 1 per 30 m^2, min 1, max 6 per zone), park trees on the
// playground lawn (1-3) and fruit trees in suburban and kitchen-door gardens (0-2). Each tree carries its root
// arches and galleries (root-channel), heart-rot hollow (wood nesters) and canopy disc.

import { rngFloat, rngInt } from '@/core/rng';
import type { GenContext } from '../../kit/context';
import { poissonDisk } from '../../kit/poisson';
import { terrainAt } from '../../kit/surface';
import { standingTree } from '../../catalog/outdoor/forest';
import { fruitTree } from '../../catalog/outdoor/beds';
import { commit, dropObject, envFor, groundLocal, range } from './commit';
import { primIndex } from '../../kit/surface';
import { entryOf } from '../../kit/column';
import { primEval } from '@/sim/world/primHash';
import type { Primitive } from '@/sim/types';
import { edgeDistAt, footprintIn, pointInZone, zoneAreaM2, zoneIdAt, zoneRect, zonesOf } from './zones';
import { OUTDOOR } from './tuning';
import type { Built } from '../../catalog/outdoor/types';

const T = OUTDOOR.trees;

function slopeOk(ctx: GenContext, x: number, z: number): boolean {
  const d = 400;
  const gx = (terrainAt(ctx, x + d, z) - terrainAt(ctx, x - d, z)) / (2 * d), gz = (terrainAt(ctx, x, z + d) - terrainAt(ctx, x, z - d)) / (2 * d);
  return gx * gx + gz * gz <= T.slopeMax * T.slopeMax;
}

/** Places a tree built at (x, z) with the ground sampled under its frame. */
function tree(ctx: GenContext, make: (env: ReturnType<typeof envFor>) => Built, x: number, z: number, yaw: number): boolean {
  const b = make(envFor(ctx, groundLocal(ctx, x, z, yaw)));
  const id = commit(ctx, b, { x, z, yaw, atGround: 'terrain', collide: true, category: 'trees' });
  if (id < 0) return false;
  // trunk and branches keep a few BU clear of other objects (a branch brushing a fence panel would merge
  // with it in the field and lead its climb route astray)
  const ob = ctx.world.objects[ctx.world.objects.length - 1];
  const high = ctx.world.prims.slice(ob.primStart, ob.primStart + ob.primCount).filter((p) => p.pos.y - ob.pos.y > T.clearFromY);
  if (high.some((p) => !axisClear(ctx, p, T.clearBu * ctx.dims.bu, id))) {
    dropObject(ctx, id);
    ctx.canopies.pop();
    return false;
  }
  return true;
}

function forestTrees(ctx: GenContext): void {
  for (const zn of zonesOf(ctx, 'forest')) {
    const label = `wg/structures/outdoor/trees/${zn.id}`;
    const want = Math.min(T.maxPerZone, Math.max(T.min, Math.round(zoneAreaM2(ctx, zn.id) * T.perM2)));
    const ok = (x: number, z: number) => zoneIdAt(ctx, x, z) === zn.id && edgeDistAt(ctx, x, z) >= T.edgeMin && slopeOk(ctx, x, z);
    let pts = poissonDisk(ctx.rng(label), zoneRect(ctx, zn.id), T.spacing, ok);
    // a narrow forest strip may have no point 600 from its edge: relax the edge rule for the minimum
    if (pts.length === 0) pts = poissonDisk(ctx.rng(`${label}/relaxed`), zoneRect(ctx, zn.id), T.spacing, (x, z) => zoneIdAt(ctx, x, z) === zn.id && edgeDistAt(ctx, x, z) >= T.edgeMin / 3);
    let n = 0;
    for (let i = 0; i < pts.length && n < want; i++) {
      const rng = ctx.rngFor(label, i);
      if (tree(ctx, (e) => standingTree(rng, e), pts[i].x, pts[i].z, range(rng, 0, 2 * Math.PI))) n++;
    }
  }
}

function parkTrees(ctx: GenContext): void {
  if (ctx.params.archetype !== 'playground-park') return;
  const lawn = zonesOf(ctx, 'lawn')[0];
  if (!lawn) return;
  const rng = ctx.rng('wg/structures/outdoor/parktrees');
  const n = rngInt(rng, T.parkCount[0], T.parkCount[1]);
  for (let i = 0, t = 0; i < n && t < 40; t++) {
    const p = pointInZone(ctx, rng, lawn.id, (x, z) => edgeDistAt(ctx, x, z) >= T.edgeMin);
    if (!p) continue;
    const r = ctx.rngFor('wg/structures/outdoor/parktrees', t);
    if (tree(ctx, (e) => standingTree(r, e, { id: 'park-tree' }), p.x, p.z, range(r, 0, 2 * Math.PI))) i++;
  }
}

function fruitTrees(ctx: GenContext): void {
  if (!['suburban-garden', 'kitchen-door'].includes(ctx.params.archetype)) return;
  const rng = ctx.rng('wg/structures/outdoor/fruittrees');
  const n = rngInt(rng, T.fruitCount[0], T.fruitCount[1]);
  const soft = ctx.layout.zones.filter((z) => z.type === 'lawn' || z.type === 'garden-bed');
  for (let i = 0, t = 0; i < n && t < 40 && soft.length; t++) {
    const zn = soft[rngInt(rng, 0, soft.length - 1)];
    const p = pointInZone(ctx, rng, zn.id, (x, z) => footprintIn(ctx, x, z, 0, 600, 600, soft.map((s) => s.id)));
    if (!p) continue;
    const r = ctx.rngFor('wg/structures/outdoor/fruittrees', t);
    if (tree(ctx, (e) => fruitTree(r, e), p.x, p.z, rngFloat(r) * 2 * Math.PI)) i++;
  }
}

const _hits: number[] = [];
/** True if no primitive of another object comes within `clear` mm of a capsule or cylinder's surface (axis sampled). */
function axisClear(ctx: GenContext, p: Primitive, clear: number, self: number): boolean {
  const e = entryOf(p), r = p.size.x, half = p.size.y;
  const ax = { x: e.m01, y: e.m11, z: e.m21 }; // local +Y in world space
  const n = Math.max(2, Math.ceil((2 * half) / Math.max(1, r)));
  const ix = primIndex(ctx);
  for (let s = 0; s <= n; s++) {
    const t = -half + (2 * half * s) / n;
    const x = p.pos.x + ax.x * t, y = p.pos.y + ax.y * t, z = p.pos.z + ax.z * t, reach = r + clear;
    ix.query(x - reach, z - reach, x + reach, z + reach, _hits);
    for (const h of _hits) {
      const o = ix.entries[h];
      if (o.prim.objectId === self || o.maxY < y - reach || o.minY > y + reach) continue;
      if (primEval(o, x, y, z, null) < reach) return false;
    }
  }
  return true;
}

export function placeTrees(ctx: GenContext): void {
  forestTrees(ctx);
  parkTrees(ctx);
  fruitTrees(ctx);
}
