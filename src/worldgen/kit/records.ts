// Registration of everything placers produce besides primitives: climb routes, points of interest, pre-carve
// operations (with the PRECARVE_CHUNK_MAX count), natural cavities, micro-connections, water bodies, canopy
// discs, food anchors, plants, creature territories, rival sites and human nodes. Ids are sequential per kind.

import type { Vec3 } from '@/core/math/vec3';
import type {
  ClimbRouteKind, CreatureTerritorySeed, FoodAnchor, MicroConn, NaturalCavity, PlantPlacement, PoiKind, PreCarveOp,
  RivalSite, WaterBody,
} from '@/sim/types';
import type { CanopyDisc, ContentKind, GenContext } from './context';
import type { HumanNode } from '../layout/types';
import { PLACE } from '../tuning/pipeline';
import { qmm, qvec } from './quantize';

/** Carve chunk edge in BU (16 voxels of 0.5 BU). */
const CHUNK_BU = 8;
const CHUNK_KEY_SPAN = 4096;

/** Declares that this run has content of a kind (makes the matching validation checks applicable). */
export function provide(ctx: GenContext, kind: ContentKind): void {
  ctx.provides.add(kind);
}

/**
 * Climb route on an object (GDD 04 §10): world points bottom first, resampled so nodes are <= 8 BU apart.
 * Returns the route id, or -1 when the CLIMB_ROUTE_MAX budget is used up.
 */
export function addClimbRoute(ctx: GenContext, objectId: number, kind: ClimbRouteKind, points: Vec3[]): number {
  if (ctx.world.climbRoutes.length >= ctx.budget.limit.climbRoutes || points.length < 2) return -1;
  const maxSeg = PLACE.routeNodeBu * ctx.dims.bu;
  const out: Vec3[] = [qvec(points[0])];
  let len = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const d = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2 + (b.z - a.z) ** 2);
    len += d;
    const n = Math.max(1, Math.ceil(d / maxSeg));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      out.push(qvec({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }));
    }
  }
  const id = ctx.ids.route++;
  ctx.world.climbRoutes.push({ id, kind, objectId, points: out, lengthBu: qmm(len / ctx.dims.bu) });
  return id;
}

export function addPoi(ctx: GenContext, kind: PoiKind, pos: Vec3, objectId = -1): number {
  const id = ctx.ids.poi++;
  ctx.world.pois.push({ id, kind, pos: qvec(pos), objectId });
  return id;
}

/** Carve chunks an op's bounding box touches (for the budget). */
function opChunks(ctx: GenContext, op: PreCarveOp, out: Set<number>): void {
  const c = CHUNK_BU * ctx.dims.bu;
  let lo: Vec3, hi: Vec3;
  if (op.shape === 'sphere') { lo = { x: op.a.x - op.r, y: op.a.y - op.r, z: op.a.z - op.r }; hi = { x: op.a.x + op.r, y: op.a.y + op.r, z: op.a.z + op.r }; }
  else if (op.shape === 'ellipsoid') { lo = { x: op.a.x - op.b.x, y: op.a.y - op.b.y, z: op.a.z - op.b.z }; hi = { x: op.a.x + op.b.x, y: op.a.y + op.b.y, z: op.a.z + op.b.z }; }
  else {
    lo = { x: Math.min(op.a.x, op.b.x) - op.r, y: Math.min(op.a.y, op.b.y) - op.r, z: Math.min(op.a.z, op.b.z) - op.r };
    hi = { x: Math.max(op.a.x, op.b.x) + op.r, y: Math.max(op.a.y, op.b.y) + op.r, z: Math.max(op.a.z, op.b.z) + op.r };
  }
  for (let k = Math.floor(lo.z / c); k <= Math.floor(hi.z / c); k++)
    for (let j = Math.floor(lo.y / c); j <= Math.floor(hi.y / c); j++)
      for (let i = Math.floor(lo.x / c); i <= Math.floor(hi.x / c); i++)
        out.add(i + CHUNK_KEY_SPAN * (j + CHUNK_KEY_SPAN * k));
}

/**
 * Records a pre-carve operation (applied by createNewGame with `force`). Returns false (not recorded) when it
 * would exceed PRECARVE_CHUNK_MAX.
 */
export function addPreCarve(ctx: GenContext, op: PreCarveOp): boolean {
  const touched = new Set<number>();
  opChunks(ctx, op, touched);
  let extra = 0;
  for (const k of touched) if (!ctx.budget.chunks.has(k)) extra++;
  if (ctx.budget.chunks.size + extra > ctx.budget.limit.precarveChunks) return false;
  for (const k of touched) ctx.budget.chunks.add(k);
  ctx.world.preCarve.push({ ...op, a: qvec(op.a), b: qvec(op.b), r: qmm(op.r) });
  return true;
}

export function addCavity(ctx: GenContext, c: Omit<NaturalCavity, 'id'>): number {
  const id = ctx.ids.cavity++;
  ctx.world.cavities.push({ id, ...c });
  return id;
}

export function addMicro(ctx: GenContext, m: Omit<MicroConn, 'id'>): number {
  const id = ctx.ids.micro++;
  ctx.world.micro.push({ id, ...m, posA: qvec(m.posA), posB: qvec(m.posB) });
  return id;
}

export function addWaterBody(ctx: GenContext, w: Omit<WaterBody, 'id'>): number {
  const id = ctx.ids.water++;
  ctx.world.waterBodies.push({ id, ...w, pos: qvec(w.pos) });
  return id;
}

export function addCanopy(ctx: GenContext, c: CanopyDisc): void {
  ctx.canopies.push({ x: qmm(c.x), z: qmm(c.z), y: qmm(c.y), r: qmm(c.r), transmittance: c.transmittance });
}

export function addFoodAnchor(ctx: GenContext, a: Omit<FoodAnchor, 'id'>): number {
  const id = ctx.ids.anchor++;
  ctx.world.placements.foodAnchors.push({ id, ...a, pos: qvec(a.pos) });
  return id;
}

export function addPlant(ctx: GenContext, p: PlantPlacement): void {
  ctx.world.placements.plants.push(p);
}

export function addTerritory(ctx: GenContext, t: CreatureTerritorySeed): void {
  ctx.world.placements.territories.push({ ...t, center: qvec(t.center) });
}

export function addRivalSite(ctx: GenContext, r: RivalSite): void {
  ctx.world.placements.rivalSites.push({ ...r, origin: qvec(r.origin) });
}

export function addHumanNode(ctx: GenContext, n: HumanNode): void {
  ctx.layout.humanNodes.push({ kind: n.kind, x: qmm(n.x), z: qmm(n.z) });
}
