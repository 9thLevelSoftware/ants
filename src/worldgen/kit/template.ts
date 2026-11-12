// Object templates made of primitives and their placement into the world (GDD 04 §4.2 steps 3-5): transform,
// terrain snapping (rest on the support surface at 5 footprint points, tilt to the fitted plane <= 20 deg),
// footprint collision against the primitives already placed, quantisation (DET-5) and registration of the
// object's climb routes and points of interest.

import type { Quat } from '@/core/math/quat';
import { quatFromUnitVectors, quatMultiply, quatNormalize, quatRotateVec3 } from '@/core/math/quat';
import type { Vec3 } from '@/core/math/vec3';
import type { ClimbRouteKind, MaterialId, PoiKind, PrimShape, Primitive, WorldObject } from '@/sim/types';
import { primEval } from '@/sim/world/primHash';
import type { GenContext } from './context';
import { dcos, dsin, drad } from './dmath';
import { qangle, qmm } from './quantize';
import { entryOf } from './column';
import { invalidatePrimIndex, primIndex, supportAt } from './surface';
import { addClimbRoute, addPoi } from './records';
import { PLACE, type BudgetCategory } from '../tuning/pipeline';

/** One primitive of a template, in object-local space (Y up, origin at the object's base centre). */
export interface PrimSpec {
  shape: PrimShape;
  pos: Vec3;
  /** Local rotation (default identity). */
  rot?: Quat;
  /** As Primitive.size (box half extents; cylinder x radius y half height; capsule x radius y half length; ellipsoid radii). */
  size: Vec3;
  round?: number;
  material: MaterialId;
  /** PrimFlag bits. */
  flags: number;
  tint?: number;
}

export interface ObjectTemplate {
  /** Catalogue template id (GDD 04 §5 object ids). */
  id: string;
  prims: PrimSpec[];
  /** Climb routes, local points bottom first. */
  routes?: { kind: ClimbRouteKind; points: Vec3[] }[];
  pois?: { kind: PoiKind; pos: Vec3 }[];
  tags?: string[];
}

export interface PlaceOptions {
  x: number;
  z: number;
  /** Yaw about +Y, rad (quantised to 1e-6 rad). */
  yaw?: number;
  /** Fixed base height (no snapping), mm. */
  y?: number;
  /** Rest on the support surface (default true unless y is given). */
  snap?: boolean;
  /** Tilt to the fitted support plane, clamped to PLACE.maxTiltDeg (default true when snapping). */
  tilt?: boolean;
  /** Extra embedding below the resting height, mm (stones embed 0.15-0.5 of their thickness). */
  embed?: number;
  /** Support surfaces above this height are ignored when snapping (place under tables), mm. */
  belowY?: number;
  /** Reject when a primitive of the object intersects an existing one deeper than PLACE.overlapTolMm. */
  collide?: boolean;
  /** Primitives of these object ids are ignored by the collision test (e.g. a rest-on host). */
  ignoreObjects?: number[];
  /** Budget category counted (and enforced) for this object. */
  category?: BudgetCategory;
  /** The object's primitives define the walkable ground of the nav grid (floor slabs). */
  ground?: boolean;
}

const UP: Vec3 = { x: 0, y: 1, z: 0 };
/** Quaternion components quantised like angles (DET-5). */
const q6 = (v: number) => Math.round(v * PLACE.angleQuantum) / PLACE.angleQuantum;
const _v: Vec3 = { x: 0, y: 0, z: 0 };
const _hits: number[] = [];

function yawQuat(yaw: number): Quat {
  const h = qangle(yaw) / 2;
  return { x: 0, y: dsin(h), z: 0, w: dcos(h) };
}

/** Local X/Z bounds and the lowest local Y of a template's primitives (AABB of each primitive's size). */
function localBounds(t: ObjectTemplate): { x0: number; x1: number; z0: number; z1: number; y0: number } {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, y0 = Infinity;
  for (const p of t.prims) {
    const e = entryOf({ id: 0, shape: p.shape, pos: p.pos, rot: p.rot ?? { x: 0, y: 0, z: 0, w: 1 }, size: p.size, round: p.round ?? 0, material: p.material, flags: 0, objectId: -1 });
    x0 = Math.min(x0, e.minX); x1 = Math.max(x1, e.maxX); z0 = Math.min(z0, e.minZ); z1 = Math.max(z1, e.maxZ); y0 = Math.min(y0, e.minY);
  }
  return { x0, x1, z0, z1, y0 };
}

/** Pose (position and rotation) of a template placed with the given options. */
function pose(ctx: GenContext, t: ObjectTemplate, o: PlaceOptions): { pos: Vec3; rot: Quat } {
  const yq = yawQuat(o.yaw ?? 0);
  if (o.y !== undefined && o.snap !== true) return { pos: { x: o.x, y: o.y, z: o.z }, rot: yq };
  const b = localBounds(t);
  const pts: [number, number][] = [[(b.x0 + b.x1) / 2, (b.z0 + b.z1) / 2], [b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]];
  const world: { x: number; z: number; h: number }[] = [];
  for (const [u, w] of pts) {
    quatRotateVec3(_v, yq, { x: u, y: 0, z: w });
    const x = o.x + _v.x, z = o.z + _v.z;
    world.push({ x, z, h: supportAt(ctx, x, z, o.belowY) });
  }
  let rot = yq;
  if (o.tilt !== false) {
    const n = fitNormal(world, o.x, o.z);
    const r: Quat = { x: 0, y: 0, z: 0, w: 1 };
    quatFromUnitVectors(r, UP, n);
    rot = quatMultiply({ x: 0, y: 0, z: 0, w: 1 }, r, yq);
    quatNormalize(rot, rot);
  }
  // rest: the lowest local plane may not float above the support at any footprint point
  let y = Infinity;
  for (let i = 0; i < pts.length; i++) {
    quatRotateVec3(_v, rot, { x: pts[i][0], y: b.y0, z: pts[i][1] });
    y = Math.min(y, world[i].h - _v.y);
  }
  return { pos: { x: o.x, y: y - (o.embed ?? 0), z: o.z }, rot };
}

/** Least-squares plane h = a + b dx + c dz through the samples; unit normal clamped to the tilt limit. */
function fitNormal(s: { x: number; z: number; h: number }[], cx: number, cz: number): Vec3 {
  let sxx = 0, szz = 0, sxz = 0, sxh = 0, szh = 0, sh = 0;
  for (const p of s) sh += p.h;
  const mh = sh / s.length;
  for (const p of s) {
    const dx = p.x - cx, dz = p.z - cz, dh = p.h - mh;
    sxx += dx * dx; szz += dz * dz; sxz += dx * dz; sxh += dx * dh; szh += dz * dh;
  }
  const det = sxx * szz - sxz * sxz;
  let b = 0, c = 0;
  if (Math.abs(det) > 1e-9) { b = (sxh * szz - szh * sxz) / det; c = (szh * sxx - sxh * sxz) / det; }
  let nx = -b, nz = -c;
  const horiz = Math.sqrt(nx * nx + nz * nz);
  const maxH = dsin(drad(PLACE.maxTiltDeg)) / dcos(drad(PLACE.maxTiltDeg)); // tan of the limit
  if (horiz > maxH) { nx *= maxH / horiz; nz *= maxH / horiz; }
  const l = Math.sqrt(nx * nx + 1 + nz * nz);
  return { x: nx / l, y: 1 / l, z: nz / l };
}

/** World primitives of a template at a pose (quantised), not yet added. */
function buildPrims(t: ObjectTemplate, pos: Vec3, rot: Quat, objectId: number): Primitive[] {
  return t.prims.map((p) => {
    quatRotateVec3(_v, rot, p.pos);
    const r = p.rot ? quatMultiply({ x: 0, y: 0, z: 0, w: 1 }, rot, p.rot) : { ...rot };
    quatNormalize(r, r);
    const prim: Primitive = {
      id: 0, shape: p.shape,
      pos: { x: qmm(pos.x + _v.x), y: qmm(pos.y + _v.y), z: qmm(pos.z + _v.z) },
      rot: { x: q6(r.x), y: q6(r.y), z: q6(r.z), w: q6(r.w) },
      size: { x: qmm(p.size.x), y: qmm(p.size.y), z: qmm(p.size.z) },
      round: qmm(p.round ?? 0), material: p.material, flags: p.flags, objectId,
    };
    if (p.tint !== undefined) prim.tint = p.tint;
    return prim;
  });
}

/** True if any of `prims` intersects an existing world primitive deeper than `tol` mm. */
export function intersectsWorld(ctx: GenContext, prims: Primitive[], tol: number, ignoreObjects: number[] = []): boolean {
  const ix = primIndex(ctx);
  for (const p of prims) {
    const e = entryOf(p);
    ix.query(e.minX, e.minZ, e.maxX, e.maxZ, _hits);
    for (const i of _hits) {
      const o = ix.entries[i];
      if (ignoreObjects.includes(o.prim.objectId)) continue;
      if (o.maxY < e.minY || o.minY > e.maxY) continue;
      if (latticeHit(e, o, tol) || latticeHit(o, e, tol)) return true;
    }
  }
  return false;
}

const LATTICE = [0.15, 0.5, 0.85];
function latticeHit(a: ReturnType<typeof entryOf>, b: ReturnType<typeof entryOf>, tol: number): boolean {
  for (const fx of LATTICE) for (const fy of LATTICE) for (const fz of LATTICE) {
    const x = a.minX + (a.maxX - a.minX) * fx, y = a.minY + (a.maxY - a.minY) * fy, z = a.minZ + (a.maxZ - a.minZ) * fz;
    if (primEval(a, x, y, z, null) < -tol && primEval(b, x, y, z, null) < -tol) return true;
  }
  return false;
}

/**
 * Places a template; returns the new object id, or -1 when rejected (collision or budget). Primitives get
 * sequential unique ids; the template's routes and POIs are transformed and registered.
 */
export function placeObject(ctx: GenContext, t: ObjectTemplate, o: PlaceOptions): number {
  const cat = o.category;
  if (cat && ctx.budget.used[cat] >= ctx.budget.limit[cat]) return -1;
  if (ctx.world.prims.length + t.prims.length > ctx.budget.limit.primTotal) return -1;
  const { pos, rot } = pose(ctx, t, o);
  const id = ctx.ids.object;
  const prims = buildPrims(t, pos, rot, id);
  if (o.collide && intersectsWorld(ctx, prims, PLACE.overlapTolMm, o.ignoreObjects)) return -1;
  ctx.ids.object++;
  const obj: WorldObject = {
    id, templateId: t.id, pos: { x: qmm(pos.x), y: qmm(pos.y), z: qmm(pos.z) },
    rot: { x: q6(rot.x), y: q6(rot.y), z: q6(rot.z), w: q6(rot.w) },
    primStart: ctx.world.prims.length, primCount: prims.length, tags: [...(t.tags ?? [])], routeIds: [], poiIds: [],
  };
  for (const p of prims) {
    p.id = ctx.ids.prim++;
    ctx.world.prims.push(p);
    if (o.ground) ctx.groundPrims.add(p.id);
  }
  ctx.world.objects.push(obj);
  for (const r of t.routes ?? []) {
    const pts = r.points.map((lp) => toWorld(lp, pos, rot));
    const rid = addClimbRoute(ctx, id, r.kind, pts);
    if (rid >= 0) obj.routeIds.push(rid);
  }
  for (const p of t.pois ?? []) obj.poiIds.push(addPoi(ctx, p.kind, toWorld(p.pos, pos, rot), id));
  if (cat) ctx.budget.used[cat]++;
  return id;
}

function toWorld(lp: Vec3, pos: Vec3, rot: Quat): Vec3 {
  const v = quatRotateVec3({ x: 0, y: 0, z: 0 }, rot, lp);
  return { x: qmm(pos.x + v.x), y: qmm(pos.y + v.y), z: qmm(pos.z + v.z) };
}

/** Removes an object, its primitives, routes and POIs; later objects' primStart are shifted. */
export function removeObject(ctx: GenContext, objectId: number): boolean {
  const w = ctx.world;
  const k = w.objects.findIndex((ob) => ob.id === objectId);
  if (k < 0) return false;
  const ob = w.objects[k];
  const removed = w.prims.splice(ob.primStart, ob.primCount);
  for (const p of removed) ctx.groundPrims.delete(p.id);
  w.objects.splice(k, 1);
  for (const later of w.objects) if (later.primStart > ob.primStart) later.primStart -= ob.primCount;
  w.climbRoutes = w.climbRoutes.filter((r) => r.objectId !== objectId);
  w.pois = w.pois.filter((p) => p.objectId !== objectId);
  invalidatePrimIndex(ctx);
  return true;
}
