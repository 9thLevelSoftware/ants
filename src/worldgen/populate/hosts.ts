// Plants as hosts (GDD 04 §8.1, §8.3; GDD 05 §1.3): the outdoor placer rolls HOST_FLAGS per herb and shrub;
// here tree branches get aphid colonies (p 0.35 per branch site), the aphid-host count is brought to the GDD 05
// per-plot target (at least 20, at most 90 on a standard map), and each host plant lists the host points whose
// climb route a walker can follow (PlantPlacement.hostPoiIds) for the Tier 2 herds, nectar and seeds.

import { rngChance } from '@/core/rng';
import type { PlantPlacement, Poi, PoiKind, WorldObject } from '@/sim/types';
import { HOST_FLAGS } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { objectById, poiById, roundRandom, routeById, routeWalkable, scaledCap, shuffled, zonePlots, zoneTypeAtXZ } from './common';
import { APHID_HOST_MIN, NODE_DENSITY, TREE_BRANCH_APHID_P } from './tuning';

export const HOST_BIT = Object.fromEntries(HOST_FLAGS.map((f, i) => [f, 1 << i])) as Record<(typeof HOST_FLAGS)[number], number>;

/** POI kinds that a host flag uses. */
const FLAG_POIS: readonly [number, PoiKind][] = [
  [HOST_BIT.aphid, 'aphid-site'], [HOST_BIT.scale, 'aphid-site'], [HOST_BIT.efn, 'aphid-site'],
  [HOST_BIT.nectar, 'nectar-site'], [HOST_BIT.seed, 'seed-site'],
];

export function poisOf(ctx: GenContext, ob: WorldObject, kind?: PoiKind): Poi[] {
  const out: Poi[] = [];
  for (const id of ob.poiIds) {
    const p = poiById(ctx, id)!;
    if (p && (!kind || p.kind === kind)) out.push(p);
  }
  return out;
}

/** The object's climb route whose nodes come closest to the POI (-1 if the object has none). */
export function routeOfPoi(ctx: GenContext, ob: WorldObject, poi: Poi): number {
  let best = -1, bd = Infinity;
  for (const rid of ob.routeIds) {
    const r = routeById(ctx, rid);
    if (!r) continue;
    for (const p of r.points) {
      const d = (p.x - poi.pos.x) ** 2 + (p.y - poi.pos.y) ** 2 + (p.z - poi.pos.z) ** 2;
      if (d < bd) { bd = d; best = rid; }
    }
  }
  return best;
}

/** A POI is usable when its route is walkable (or it lies on the ground beside the object: no route needed). */
export function poiUsable(ctx: GenContext, ob: WorldObject, poi: Poi): boolean {
  const rid = routeOfPoi(ctx, ob, poi);
  return rid >= 0 && routeWalkable(ctx, rid);
}

function hasAphidSite(ctx: GenContext, p: PlantPlacement): boolean {
  const ob = objectById(ctx, p.objectId);
  return !!ob && poisOf(ctx, ob, 'aphid-site').length > 0;
}

/** Tree branches with an aphid colony, by object id (rolled once per context). */
const branchHerds = new WeakMap<GenContext, Map<number, number[]>>();
export function treeHerdPois(ctx: GenContext): Map<number, number[]> {
  return branchHerds.get(ctx) ?? new Map();
}

/** Rolls tree branch colonies and tops up the aphid hosts; marks the usable host points of every host plant. */
export function assignHosts(ctx: GenContext): void {
  const plants = ctx.world.placements.plants;
  const herds = new Map<number, number[]>();
  for (const p of plants) {
    if (p.hostClass !== 'tree') continue;
    const ob = objectById(ctx, p.objectId);
    if (!ob) continue;
    const rng = ctx.rngFor('wg/resources/hosts/tree', p.objectId);
    const sites = poisOf(ctx, ob, 'aphid-site').filter(() => rngChance(rng, TREE_BRANCH_APHID_P)).map((q) => q.id);
    if (sites.length > 0) { p.hostFlags |= HOST_BIT.aphid; herds.set(p.objectId, sites); }
  }
  branchHerds.set(ctx, herds);
  // aphid host count: the per-plot target of GDD 05 §1.3, within [20, 90] on a standard map
  const plots = zonePlots(ctx);
  let target = 0;
  for (const [z, d] of Object.entries(NODE_DENSITY.aphidHost.perPlot)) target += d * (plots[z as keyof typeof plots] ?? 0);
  const rng = ctx.rng('wg/resources/hosts/promote');
  target = Math.min(scaledCap(ctx, NODE_DENSITY.aphidHost.cap), Math.max(scaledCap(ctx, APHID_HOST_MIN), roundRandom(rng, target)));
  let have = plants.filter((p) => p.hostFlags & HOST_BIT.aphid).length;
  if (have < target) {
    const cands = shuffled(rng, plants.filter((p) => !(p.hostFlags & HOST_BIT.aphid) && p.hostClass !== 'tree' && hasAphidSite(ctx, p)));
    for (const p of cands) {
      if (have >= target) break;
      const ob = objectById(ctx, p.objectId)!;
      if (zoneTypeAtXZ(ctx, ob.pos.x, ob.pos.z) === 'interior') continue;
      p.hostFlags |= HOST_BIT.aphid;
      have++;
    }
  }
}

/** Fills hostPoiIds of one plant (routes walked on demand; called for the hosts the food step uses). */
export function usableHostPois(ctx: GenContext, p: PlantPlacement): number[] {
  if (p.hostPoiIds) return p.hostPoiIds;
  const ob = objectById(ctx, p.objectId);
  const out: number[] = [];
  if (ob) {
    const herds = treeHerdPois(ctx).get(p.objectId);
    for (const poi of poisOf(ctx, ob)) {
      const wanted = FLAG_POIS.some(([bit, kind]) => (p.hostFlags & bit) !== 0 && kind === poi.kind);
      if (!wanted || (herds && poi.kind === 'aphid-site' && !herds.includes(poi.id))) continue;
      if (poiUsable(ctx, ob, poi)) out.push(poi.id);
    }
  }
  p.hostPoiIds = out;
  return out;
}

/** Evaluates every host plant's usable points (end of the resources step). */
export function finishHosts(ctx: GenContext): void {
  for (const p of ctx.world.placements.plants) if (p.hostFlags !== 0) usableHostPois(ctx, p);
}
