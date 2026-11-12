// Places one catalogue object (Built) and registers its sockets in world space: pre-carve cavities (within the
// outdoor share of the chunk budget), micro-connections, water bodies, terrain holes, compost mound, plant host data
// and tree canopy. Also the small per-context state of the outdoor placers (keep-out rects, object extras).

import type { RngState } from '@/core/rng';
import { rngFloat } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { DecorDecal, PreCarveOp } from '@/sim/types';
import { quatRotateVec3 } from '@/core/math/quat';
import type { GenContext } from '../../kit/context';
import type { PlaceOptions } from '../../kit/template';
import { placeObject, removeObject } from '../../kit/template';
import { addCanopy, addCavity, addMicro, addPlant, addPreCarve, addWaterBody } from '../../kit/records';
import { cutTerrainHole, editHeights, paintGround } from '../../kit/terrainEdit';
import { supportAt, terrainAt } from '../../kit/surface';
import { qvec } from '../../kit/quantize';
import { dcos, dsin } from '../../kit/dmath';
import { BUDGETS } from '../../tuning/pipeline';
import type { Built, Env } from '../../catalog/outdoor/types';
import type { Rect } from '../../layout/types';
import { WALKER_TUNING } from '@/sim/locomotion/walkerParams';
import { SUITABILITY } from '../../tuning/maps';
import { OUTDOOR } from './tuning';
import { objectOverlaps } from './overlap';
import { restOnSupport } from './restOnSupport';
import { opChunkKeys } from './chunks';
import { isSmall, propBlocksRoute, registerForRoutes, routeHitsProp } from './routeClear';
import { PLACE } from '../../tuning/pipeline';

/** x * x (not **: DET-4). */
const sq = (x: number): number => x * x;

/** What an object registered besides its primitives: cavity, micro-connection and water ids, fresh carve chunks. */
export interface ObjectExtras { cavities: number[]; micro: number[]; water: number[]; chunks: number[] }

export interface OutdoorState {
  /** Rects that slab grids must leave free (tree pits). */
  keepOut: Rect[];
  /** Extras registered per object id (to drop them with a removed prop). */
  extras: Map<number, ObjectExtras>;
  /** Budget category each placed object was counted in (given back when it is removed). */
  categories: Map<number, string>;
  counts: Record<string, number>;
  /** Decals for the decor descriptors (painted bay lines, cracks, seams). */
  decals: DecorDecal[];
  /** Ids of the objects the outdoor placers created. */
  objects: Set<number>;
}

const states = new WeakMap<GenContext, OutdoorState>();
export function outdoorState(ctx: GenContext): OutdoorState {
  let s = states.get(ctx);
  if (!s) { s = { keepOut: [], extras: new Map(), categories: new Map(), counts: {}, decals: [], objects: new Set() }; states.set(ctx, s); }
  return s;
}

/** Bump a per-kind counter (caps of OUTDOOR.max*); returns false once `max` is reached. */
export function takeCount(ctx: GenContext, kind: string, max: number): boolean {
  const s = outdoorState(ctx);
  const n = s.counts[kind] ?? 0;
  if (n >= max) return false;
  s.counts[kind] = n + 1;
  return true;
}

export function envFor(ctx: GenContext, ground?: Env['ground']): Env {
  const bu = ctx.dims.bu;
  const e: Env = { bu, foot: WALKER_TUNING.footOffsetBU * bu, woodNester: SUITABILITY[ctx.params.speciesId].woodNester };
  if (ground) e.ground = ground;
  return e;
}

/** Local (x, z) -> world for an object at (x, z) with yaw (kit convention: yawQ(a) turns +X toward -Z). */
export function localToWorld(x: number, z: number, yaw: number, lx: number, lz: number): { x: number; z: number } {
  const c = dcos(yaw), s = dsin(yaw);
  return { x: x + lx * c + lz * s, z: z - lx * s + lz * c };
}

/** Ground sampler relative to the terrain at (x, z), in the object's local frame. */
export function groundLocal(ctx: GenContext, x: number, z: number, yaw: number, support = false): (lx: number, lz: number) => number {
  const h0 = support ? supportAt(ctx, x, z) : terrainAt(ctx, x, z);
  return (lx, lz) => {
    const p = localToWorld(x, z, yaw, lx, lz);
    return (support ? supportAt(ctx, p.x, p.z) : terrainAt(ctx, p.x, p.z)) - h0;
  };
}

export interface CommitOptions extends Omit<PlaceOptions, 'embed' | 'tilt'> {
  /**
   * No snapping. `terrain`: upright, base at the terrain height at (x, z). `support`: tilted to the plane of the
   * support tops (terrain or primitive tops up to `belowY`, default terrain + OUTDOOR.supportLiftMax) fitted over the
   * whole footprint with joints ignored, refused (-1) unless every foot (lowest primitive) stands on a top:
   * furniture and mats on paving, whose joints a fitted rest would sink the legs into (restOnSupport.ts).
   */
  atGround?: 'terrain' | 'support';
  embed?: number;
  tilt?: boolean;
}

/** Places `b`; returns the object id or -1. */
export function commit(ctx: GenContext, b: Built, o: CommitOptions): number {
  const opts: PlaceOptions = { ...o, collide: o.collide ?? true };
  if (o.atGround === 'support') {
    const r = restOnSupport(ctx, b, o.x, o.z, o.yaw ?? 0, o.belowY ?? terrainAt(ctx, o.x, o.z) + OUTDOOR.supportLiftMax);
    if (!r) return -1;
    b = r.b;
    opts.y = r.y;
    opts.snap = false;
    opts.tilt = false;
  } else if (o.atGround) {
    opts.y = terrainAt(ctx, o.x, o.z);
    opts.snap = false;
  } else {
    opts.embed = o.embed ?? b.embed;
    opts.tilt = o.tilt ?? b.tilt;
  }
  const id = placeObject(ctx, b.tpl, opts);
  if (id < 0) return -1;
  const obj = ctx.world.objects[ctx.world.objects.length - 1];
  // the kit's collision lattice is coarse: check again densely and undo an overlapping placement
  if (opts.collide && objectOverlaps(ctx, obj.primStart, obj.primCount, id, PLACE.overlapTolMm, o.ignoreObjects)) {
    removeObject(ctx, id);
    if (o.category) ctx.budget.used[o.category]--;
    return -1;
  }
  // litter off the climb routes (routeClear.ts)
  if ((isSmall(obj) && propBlocksRoute(ctx, obj)) || routeHitsProp(ctx, obj)) {
    removeObject(ctx, id);
    if (o.category) ctx.budget.used[o.category]--;
    return -1;
  }
  registerForRoutes(ctx, obj);
  outdoorState(ctx).objects.add(id);
  if (o.category) outdoorState(ctx).categories.set(id, o.category);
  const T = (p: Vec3): Vec3 => {
    const r = quatRotateVec3({ x: 0, y: 0, z: 0 }, obj.rot, p);
    return { x: obj.pos.x + r.x, y: obj.pos.y + r.y, z: obj.pos.z + r.z };
  };
  registerSockets(ctx, b, T, id, obj.rot);
  if (b.host) addPlant(ctx, { objectId: id, hostFlags: b.host.hostFlags, hostClass: b.host.hostClass });
  if (b.canopy) addCanopy(ctx, { x: obj.pos.x, z: obj.pos.z, y: obj.pos.y + b.canopy.y, r: b.canopy.r, transmittance: 0.3 });
  return id;
}

/**
 * Registers the sockets of `b` transformed by T: terrain holes, mound, cavities (pre-carves within the outdoor chunk
 * share), micro-connections (dropped when their carved cavity was refused) and water bodies. `objectId` -1 for
 * free-standing sockets (asphalt cracks, mat seams).
 */
export function registerSockets(ctx: GenContext, b: Pick<Built, 'holes' | 'mound' | 'cavities' | 'micro' | 'water'>, T: (p: Vec3) => Vec3, objectId: number, q: { x: number; y: number; z: number; w: number } = { x: 0, y: 0, z: 0, w: 1 }): void {
  const st = outdoorState(ctx);
  const ex: ObjectExtras = { cavities: [], micro: [], water: [], chunks: [] };
  const bu = ctx.dims.bu;
  // terrain holes and the compost mound (axis-aligned in world space: yaw is a multiple of 90 deg there)
  for (const h of b.holes ?? []) cutTerrainHole(ctx, worldRect(T, h));
  if (b.mound) {
    const m = b.mound, r = worldRect(T, { x0: -m.w / 2, z0: -m.d / 2, x1: m.w / 2, z1: m.d / 2 });
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, hx = (r.x1 - r.x0) / 2, hz = (r.z1 - r.z0) / 2;
    editHeights(ctx, r, (x, z, old) => {
      const u = (x - cx) / hx, w = (z - cz) / hz, d = 1 - Math.max(u * u, w * w);
      return old + (d > 0 ? m.h * Math.min(1, d * 2) : 0);
    });
    paintGround(ctx, r, { surface: 'humus', crustMm: 255, subsoil: 'loam' });
  }
  // cavities within the outdoor chunk share, each admitted whole (all its carves) or not at all
  const cavIds: number[] = [];
  const share = Math.floor(BUDGETS.precarveChunks * OUTDOOR.precarveShare * (ctx.budget.limit.precarveChunks / BUDGETS.precarveChunks));
  for (const c of b.cavities ?? []) {
    const cid = ctx.ids.cavity;
    const recs: PreCarveOp[] = c.carves.flatMap((op): PreCarveOp[] => {
      const a = T(op.a);
      if (op.shape === 'capsule') return splitCapsule(a, T(op.b), op.r, OUTDOOR.carvePieceBu * bu).map(([p, q]) => ({ shape: 'capsule' as const, a: p, b: q, r: op.r, natural: true, cavityId: cid }));
      return op.shape === 'ellipsoid'
        ? [{ shape: 'ellipsoid' as const, a, b: { ...op.b }, r: 0, natural: true, cavityId: cid }]
        : [{ shape: 'sphere' as const, a, b: { x: 0, y: 0, z: 0 }, r: op.r, natural: true, cavityId: cid }];
    });
    const keys = new Set<number>();
    for (const r of recs) opChunkKeys(bu, r, keys);
    const fresh = [...keys].filter((k) => !ctx.budget.chunks.has(k));
    if (recs.length === 0 || ctx.budget.chunks.size + fresh.length > share) { cavIds.push(-1); continue; }
    const n0 = ctx.world.preCarve.length;
    if (!recs.every((r) => addPreCarve(ctx, r))) {
      // refused by the global limit part-way: roll back (a cavity missing its gallery is no shelter)
      ctx.world.preCarve.length = n0;
      for (const k of fresh) ctx.budget.chunks.delete(k);
      cavIds.push(-1);
      continue;
    }
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const rec of recs) {
      const ext = rec.shape === 'ellipsoid' ? rec.b : { x: rec.r, y: rec.r, z: rec.r };
      for (const p of rec.shape === 'capsule' ? [rec.a, rec.b] : [rec.a]) {
        min.x = Math.min(min.x, p.x - ext.x); min.y = Math.min(min.y, p.y - ext.y); min.z = Math.min(min.z, p.z - ext.z);
        max.x = Math.max(max.x, p.x + ext.x); max.y = Math.max(max.y, p.y + ext.y); max.z = Math.max(max.z, p.z + ext.z);
      }
    }
    const id2 = addCavity(ctx, {
      kind: c.kind, min: qvec(min), max: qvec(max),
      openings: c.openings.map((o) => ({ pos: qvec(T(o.pos)), normal: qvec(rot(q, o.normal)), radius: o.radius })),
    });
    cavIds.push(id2);
    ex.cavities.push(id2);
    ex.chunks.push(...fresh);
  }
  for (const m of b.micro ?? []) {
    // a carved passage whose cavity was refused (chunk budget) does not exist
    if (m.cavity !== undefined && m.cavity >= 0 && cavIds[m.cavity] === -1) continue;
    const a = T(m.a), bb = T(m.b);
    const path = (m.path ?? []).map((p) => qvec(T(p)));
    let lenMm = m.lengthMm ?? 0;
    if (!m.lengthMm) { let q = a; for (const p of [...path, bb]) { lenMm += Math.sqrt(sq(p.x - q.x) + sq(p.y - q.y) + sq(p.z - q.z)); q = p; } }
    const mid = addMicro(ctx, {
      kind: m.kind, posA: a, posB: bb, gapMm: m.gapMm, minClearanceBu: m.clearMm / bu, lengthBu: lenMm / bu,
      useful: false, reason: 'not evaluated', ...(path.length ? { path } : {}),
    });
    ex.micro.push(mid);
  }
  for (const w of b.water ?? []) ex.water.push(addWaterBody(ctx, { kind: w.kind, vesselObjectId: objectId, pos: T(w.pos), radius: w.radius, levelMm: w.levelMm, capMm: w.capMm }));
  if (objectId >= 0 && (ex.cavities.length || ex.micro.length || ex.water.length)) st.extras.set(objectId, ex);
}

/**
 * A capsule cut into pieces no longer than `piece`: the budget counts the chunks of each piece's bounding box, and
 * one box round a long diagonal gallery (an asphalt crack, a root gallery) counts hundreds of empty chunks.
 */
function splitCapsule(a: Vec3, b: Vec3, r: number, piece: number): [Vec3, Vec3][] {
  const l = Math.sqrt(sq(b.x - a.x) + sq(b.y - a.y) + sq(b.z - a.z));
  const n = Math.max(1, Math.ceil(l / Math.max(piece, r)));
  const at = (t: number): Vec3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t });
  return Array.from({ length: n }, (_, i) => [at(i / n), at((i + 1) / n)] as [Vec3, Vec3]);
}

function rot(q: { x: number; y: number; z: number; w: number }, p: Vec3): Vec3 {
  return quatRotateVec3({ x: 0, y: 0, z: 0 }, q, p);
}

function worldRect(T: (p: Vec3) => Vec3, r: { x0: number; z0: number; x1: number; z1: number }): Rect {
  const a = T({ x: r.x0, y: 0, z: r.z0 }), b = T({ x: r.x1, y: 0, z: r.z1 });
  return { x0: Math.min(a.x, b.x), z0: Math.min(a.z, b.z), x1: Math.max(a.x, b.x), z1: Math.max(a.z, b.z) };
}

/**
 * Removes an object together with the cavities, pre-carves, micro-connections and water bodies it registered, and
 * gives back its budget slot and the carve chunks no remaining pre-carve uses.
 */
export function dropObject(ctx: GenContext, id: number): void {
  const st = outdoorState(ctx);
  const ex = st.extras.get(id);
  if (ex) {
    const w = ctx.world;
    w.cavities = w.cavities.filter((c) => !ex.cavities.includes(c.id));
    w.preCarve = w.preCarve.filter((p) => !ex.cavities.includes(p.cavityId));
    w.micro = w.micro.filter((m) => !ex.micro.includes(m.id));
    w.waterBodies = w.waterBodies.filter((b) => !ex.water.includes(b.id));
    if (ex.chunks.length) {
      const still = new Set<number>();
      for (const op of w.preCarve) opChunkKeys(ctx.dims.bu, op, still);
      for (const k of ex.chunks) if (!still.has(k)) ctx.budget.chunks.delete(k);
    }
    st.extras.delete(id);
  }
  const cat = st.categories.get(id) as keyof typeof ctx.budget.used | undefined;
  if (cat !== undefined && ctx.budget.used[cat] > 0) ctx.budget.used[cat]--;
  st.categories.delete(id);
  st.objects.delete(id);
  ctx.world.placements.plants = ctx.world.placements.plants.filter((p) => p.objectId !== id);
  removeObject(ctx, id);
}

/** Uniform in [lo, hi). */
export const range = (rng: RngState, lo: number, hi: number): number => lo + (hi - lo) * rngFloat(rng);
