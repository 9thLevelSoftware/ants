// Food anchors by zone, season and kind (GDD 04 §8.1; GDD 05 §0, §1.2-§1.3): nectar flowers on host plants,
// static T1 honeydew sites under aphid hosts (and the T2 herd sites on them), extrafloral nectaries, elaiosome
// and seed-head seeds, crumbs and sugar near benches, tables and bins and by zone density, interior food on its
// points of interest, windfalls under fruit trees, prey patches in humid ground and water spots. Every anchor is
// on a surface (never inside a solid) and reachable from a walkable cell, directly or by a walkable climb route.
// Bait is not placed here: stations come from the bait-station human event at run time (GDD 05 §1.8).

import type { RngState } from '@/core/rng';
import { rngFloat, rngInt } from '@/core/rng';
import type { Vec3 } from '@/core/math/vec3';
import type { FoodAnchor, FoodKind, FoodVariant, PlantPlacement, ZoneType } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { supportAt } from '../kit/surface';
import { dcos, dsin } from '../kit/dmath';
import { interiorFoodSpots } from '../place/interior/food';
import { mapState } from '../maps/state';
import { cellAt, snapWalkable } from '../validate/graph';
import { anchorAccess, type AnchorAccess } from './access';
import { addAnchor, mapPlots, navCentre, objectById, poiById, pointInCell, roundRandom, routeById, scaledCap, shuffled, startDistances, toSurface, zoneCells, zonePlots, zoneTypeAtXZ } from './common';
import { HOST_BIT, poisOf, treeHerdPois, usableHostPois } from './hosts';
import {
  CRUMB_PROTEIN_EVERY, CRUMB_SPOT, INTERIOR_VARIANT, NODE_DENSITY, PREY_PATCH, T1_HONEYDEW, WINDFALL,
} from './tuning';

/** Access of every anchor placed here, by anchor id (economy, pruning, validation). */
const accessTables = new WeakMap<GenContext, Map<number, AnchorAccess>>();
export function anchorAccessTable(ctx: GenContext): Map<number, AnchorAccess> {
  let m = accessTables.get(ctx);
  if (!m) { m = new Map(); accessTables.set(ctx, m); }
  return m;
}

/** Places an anchor if it can be put on a surface and reached; returns its id or -1. */
export function placeAnchor(ctx: GenContext, variant: FoodVariant | null, kind: FoodKind, pos: Vec3, objectId = -1, extra = 'full', mask?: number): number {
  const p = toSurface(ctx, pos);
  if (!p) return -1;
  const acc = anchorAccess(ctx, p, objectId);
  if (!acc) return -1;
  const id = addAnchor(ctx, variant, kind, p, objectId, extra, mask);
  anchorAccessTable(ctx).set(id, acc);
  return id;
}

const countOf = (ctx: GenContext, kind: FoodKind, variant?: FoodVariant) =>
  ctx.world.placements.foodAnchors.filter((a) => a.kind === kind && (!variant || a.initialState.startsWith(variant))).length;

/** Expected nodes per zone type of a GDD 05 §1.3 row (stochastic rounding). */
function zoneTargets(ctx: GenContext, rng: RngState, perPlot: Partial<Record<ZoneType, number>>): [ZoneType, number][] {
  const plots = zonePlots(ctx);
  return (Object.keys(perPlot) as ZoneType[]).map((z) => [z, roundRandom(rng, (perPlot[z] ?? 0) * (plots[z] ?? 0))]);
}

function plantZone(ctx: GenContext, p: PlantPlacement): ZoneType | null {
  const ob = objectById(ctx, p.objectId);
  return ob ? zoneTypeAtXZ(ctx, ob.pos.x, ob.pos.z) : null;
}

/** Nectar flowers on plants with the nectar flag, per zone target (GDD 05 §1.3), cap 150. */
function flowers(ctx: GenContext): void {
  const rng = ctx.rng('wg/resources/flowers');
  const cap = scaledCap(ctx, NODE_DENSITY.flower.cap);
  const hosts = ctx.world.placements.plants.filter((p) => p.hostFlags & HOST_BIT.nectar);
  for (const [zone, n] of zoneTargets(ctx, rng, NODE_DENSITY.flower.perPlot)) {
    let placed = 0;
    for (const p of shuffled(rng, hosts.filter((h) => plantZone(ctx, h) === zone))) {
      if (placed >= n || countOf(ctx, 'nectar', 'flower') >= cap) break;
      const poi = usableHostPois(ctx, p).map((id) => poiById(ctx, id)!).find((q) => q.kind === 'nectar-site');
      if (poi && placeAnchor(ctx, 'flower', 'nectar', poi.pos, p.objectId) >= 0) placed++;
    }
  }
}

/** Ground beside the stem of a plant (the foot of its stem route), mm. */
function stemFoot(ctx: GenContext, p: PlantPlacement): Vec3 | null {
  const ob = objectById(ctx, p.objectId);
  const r = ob ? routeById(ctx, ob.routeIds[0]) : undefined;
  // the support at or below the route's first node (not a branch or leaf overhead)
  return r ? { x: r.points[0].x, y: supportAt(ctx, r.points[0].x, r.points[0].z, r.points[0].y + ctx.dims.bu), z: r.points[0].z } : null;
}

/**
 * Where static honeydew films may go: the ground under the stems of aphid hosts with a usable herd site first,
 * then under other outdoor plants (a film placed there makes the plant an aphid host: GDD 05 §0 puts the films
 * "under host stems carrying the aphid host flag").
 */
export interface FilmFoot { p: PlantPlacement; foot: Vec3; host: boolean }
const filmFeet = new WeakMap<GenContext, FilmFoot[]>();
export function honeydewFilmFeet(ctx: GenContext): FilmFoot[] {
  return filmFeet.get(ctx) ?? [];
}

/** Plants that became aphid hosts only because a film was placed under them (undone when the film goes). */
const filmPromoted = new WeakMap<GenContext, Set<number>>();

function aphidHostCount(ctx: GenContext): number {
  return ctx.world.placements.plants.filter((p) => p.hostFlags & HOST_BIT.aphid).length;
}

/**
 * Places a film under a plant's stem; `accept` may still turn the placed anchor down (it is then removed). Only
 * an accepted film makes a plant an aphid host, and only while the map is below its aphid-host cap (GDD 05 §1.3
 * 20-90). True if placed.
 */
export function placeFilm(ctx: GenContext, f: FilmFoot, accept?: (a: FoodAnchor) => boolean): boolean {
  if (!f.host && aphidHostCount(ctx) >= scaledCap(ctx, NODE_DENSITY.aphidHost.cap)) return false;
  if (placeAnchor(ctx, 'honeydew-film', 'honeydew', f.foot, f.p.objectId) < 0) {
    // a trunk or a wide stem base fills its nav cell: the drip falls on the nearest open ground beside it
    const c = snapWalkable(ctx, cellAt(ctx, f.foot.x, f.foot.z), 1);
    if (c < 0) return false;
    const q = navCentre(ctx, c), x = (q.x + f.foot.x) / 2, z = (q.z + f.foot.z) / 2;
    const near = snapWalkable(ctx, cellAt(ctx, x, z), 0) === cellAt(ctx, x, z) ? { x, z } : q;
    if (placeAnchor(ctx, 'honeydew-film', 'honeydew', { x: near.x, y: supportAt(ctx, near.x, near.z, f.foot.y + ctx.dims.bu), z: near.z }, f.p.objectId) < 0) return false;
  }
  const anchors = ctx.world.placements.foodAnchors;
  if (accept && !accept(anchors[anchors.length - 1])) { anchors.pop(); return false; }
  if (!(f.p.hostFlags & HOST_BIT.aphid)) {
    f.p.hostFlags |= HOST_BIT.aphid;
    f.p.hostPoiIds = undefined;
    usableHostPois(ctx, f.p);
    f.host = true;
    let set = filmPromoted.get(ctx);
    if (!set) { set = new Set(); filmPromoted.set(ctx, set); }
    set.add(f.p.objectId);
  }
  return true;
}

/** Removes a film anchor; a plant that was an aphid host only for this film loses the flag again. */
export function removeFilm(ctx: GenContext, film: FoodAnchor): void {
  const list = ctx.world.placements.foodAnchors, i = list.indexOf(film);
  if (i >= 0) list.splice(i, 1); // in place: callers may hold the array
  const set = filmPromoted.get(ctx);
  if (!set?.has(film.hostObjectId)) return;
  set.delete(film.hostObjectId);
  const p = ctx.world.placements.plants.find((x) => x.objectId === film.hostObjectId);
  const foot = honeydewFilmFeet(ctx).find((x) => x.p.objectId === film.hostObjectId);
  if (p) { p.hostFlags &= ~HOST_BIT.aphid; p.hostPoiIds = undefined; usableHostPois(ctx, p); }
  if (foot) foot.host = false;
}

/** Aphid herd sites (T2) on every aphid host, and the T1 static honeydew films under some of their stems. */
function honeydew(ctx: GenContext): void {
  const rng = ctx.rng('wg/resources/honeydew');
  const hosts = ctx.world.placements.plants.filter((p) => p.hostFlags & HOST_BIT.aphid);
  const herds = treeHerdPois(ctx);
  const cap = scaledCap(ctx, NODE_DENSITY.aphidHost.cap);
  const feet: FilmFoot[] = [];
  let herdCount = 0;
  for (const p of hosts) {
    const ob = objectById(ctx, p.objectId);
    if (!ob) continue;
    const usable = new Set(usableHostPois(ctx, p));
    const sites = (herds.get(p.objectId) ?? poisOf(ctx, ob, 'aphid-site').map((q) => q.id)).filter((id) => usable.has(id));
    for (const id of sites.slice(0, p.hostClass === 'tree' ? 3 : 1)) {
      if (herdCount >= cap) break;
      if (placeAnchor(ctx, 'aphid-herd', 'honeydew', poiById(ctx, id)!.pos, p.objectId) >= 0) herdCount++;
    }
    const foot = stemFoot(ctx, p);
    if (foot && sites.length > 0) feet.push({ p, foot, host: true });
  }
  for (const p of ctx.world.placements.plants) {
    if (p.hostFlags & HOST_BIT.aphid) continue;
    const foot = stemFoot(ctx, p);
    if (foot && zoneTypeAtXZ(ctx, foot.x, foot.z) !== 'interior') feet.push({ p, foot, host: false });
  }
  filmFeet.set(ctx, feet);
  // T1 static films: 1 per 250 plots, at least 2 within 600 BU of the start, the rest anywhere; hosts first
  const total = Math.max(T1_HONEYDEW.nearMin, Math.round(mapPlots(ctx) / T1_HONEYDEW.plotsPerSite));
  const d = startDistances(ctx);
  const cell = (v: Vec3) => Math.min(ctx.dims.navN - 1, Math.floor(v.z / ctx.dims.navCell)) * ctx.dims.navN + Math.min(ctx.dims.navN - 1, Math.floor(v.x / ctx.dims.navCell));
  const used = new Set<number>();
  let placed = 0;
  const hostFirst = (list: FilmFoot[]) => [...shuffled(rng, list.filter((f) => f.host)), ...shuffled(rng, list.filter((f) => !f.host))];
  for (const f of hostFirst(feet.filter((f) => d[cell(f.foot)] <= T1_HONEYDEW.nearBu))) {
    if (placed >= T1_HONEYDEW.nearMin) break;
    if (placeFilm(ctx, f)) { placed++; used.add(f.p.objectId); }
  }
  for (const f of hostFirst(feet)) {
    if (placed >= total) break;
    if (used.has(f.p.objectId)) continue;
    if (placeFilm(ctx, f)) { placed++; used.add(f.p.objectId); }
  }
}

/** T2: extrafloral nectaries, elaiosome seeds under their herbs (spring), seed heads. */
function plantSeedsAndEfn(ctx: GenContext): void {
  const efnCap = scaledCap(ctx, NODE_DENSITY.efn.cap), elaCap = scaledCap(ctx, NODE_DENSITY.elaiosome.cap);
  const seedCap = scaledCap(ctx, NODE_DENSITY.flower.cap);
  for (const p of ctx.world.placements.plants) {
    const ob = objectById(ctx, p.objectId);
    if (!ob || p.hostFlags === 0) continue;
    const usable = usableHostPois(ctx, p).map((id) => poiById(ctx, id)!);
    if (p.hostFlags & HOST_BIT.efn && countOf(ctx, 'nectar', 'extrafloral-nectary') < efnCap) {
      const s = usable.find((q) => q.kind === 'aphid-site');
      if (s) placeAnchor(ctx, 'extrafloral-nectary', 'nectar', s.pos, p.objectId);
    }
    if (p.hostFlags & HOST_BIT.elaiosome && countOf(ctx, 'seed', 'elaiosome-seed') < elaCap) {
      const foot = stemFoot(ctx, p);
      if (foot) placeAnchor(ctx, 'elaiosome-seed', 'seed', foot, p.objectId);
    }
    if (p.hostFlags & HOST_BIT.seed && countOf(ctx, 'seed', 'grass-seed') < seedCap) {
      const s = usable.find((q) => q.kind === 'seed-site');
      if (s) placeAnchor(ctx, 'grass-seed', 'seed', s.pos, p.objectId);
    }
  }
}

/** Crumbs: 1-3 clusters within 300 mm of benches, tables and bins, then the zone densities; sugar patches. */
function crumbsAndSugar(ctx: GenContext): void {
  const rng = ctx.rng('wg/resources/crumbs');
  const crumbCap = scaledCap(ctx, NODE_DENSITY.crumb.cap), sugarCap = scaledCap(ctx, NODE_DENSITY.sugar.cap);
  let crumbs = 0;
  const crumb = (pos: Vec3, objectId = -1): boolean => {
    if (crumbs >= crumbCap) return false;
    const v: FoodVariant = crumbs % CRUMB_PROTEIN_EVERY === CRUMB_PROTEIN_EVERY - 1 ? 'crumb-protein' : 'crumb-starch';
    if (placeAnchor(ctx, v, 'crumb', pos, objectId) < 0) return false;
    crumbs++;
    return true;
  };
  // crumb spots on the ground around benches, picnic and patio tables, litter bins
  const SPOT_TEMPLATES = new Set(['bench', 'patio-table', 'picnic-table', 'litter-bin']);
  for (const ob of ctx.world.objects) {
    if (!SPOT_TEMPLATES.has(ob.templateId)) continue;
    const n = rngInt(rng, CRUMB_SPOT.clusters[0], CRUMB_SPOT.clusters[1]);
    for (let i = 0, tries = 0; i < n && tries < 12; tries++) {
      const a = rngFloat(rng) * 6.283185307179586, r = CRUMB_SPOT.radiusMm * Math.sqrt(rngFloat(rng));
      const x = ob.pos.x + r * dcos(a), z = ob.pos.z + r * dsin(a);
      if (crumb({ x, y: supportAt(ctx, x, z, ob.pos.y + 1), z }, ob.id)) i++;
    }
  }
  // interior food on its points of interest
  for (const s of interiorFoodSpots(ctx.world)) {
    const v = INTERIOR_VARIANT[s.label];
    if (!s.food || !v) continue;
    const objectId = poiById(ctx, s.poiId)?.objectId ?? -1;
    if (s.food === 'crumb') { crumb(s.pos, objectId); continue; }
    if (s.food === 'sugar' && countOf(ctx, 'sugar') >= sugarCap) continue;
    placeAnchor(ctx, v, s.food, s.pos, objectId);
  }
  // zone densities on open ground
  for (const [zone, n] of zoneTargets(ctx, rng, NODE_DENSITY.crumb.perPlot)) {
    const cells = zoneCells(ctx, zone);
    for (let i = 0, tries = 0; i < n && tries < 4 * n + 8 && cells.length > 0; tries++) {
      if (crumb(pointInCell(ctx, cells[rngInt(rng, 0, cells.length - 1)], rng))) i++;
    }
  }
  for (const [zone, n] of zoneTargets(ctx, rng, NODE_DENSITY.sugar.perPlot)) {
    const cells = zoneCells(ctx, zone);
    for (let i = 0, tries = 0; i < n && tries < 4 * n + 8 && cells.length > 0 && countOf(ctx, 'sugar') < sugarCap; tries++) {
      if (placeAnchor(ctx, 'sugar-granules', 'sugar', pointInCell(ctx, cells[rngInt(rng, 0, cells.length - 1)], rng)) >= 0) i++;
    }
  }
}

/** T2: windfalls under fruit trees (autumn), prey patches in humid ground, water at water spots. */
function tier2Ground(ctx: GenContext): void {
  const rng = ctx.rng('wg/resources/t2');
  let trees = 0;
  for (const ob of ctx.world.objects) {
    if (ob.templateId !== 'fruit-tree' || trees >= WINDFALL.maxTrees) continue;
    trees++;
    const n = rngInt(rng, WINDFALL.perTree[0], WINDFALL.perTree[1]);
    for (let i = 0; i < n; i++) {
      const a = rngFloat(rng) * 6.283185307179586, r = WINDFALL.radiusMm[0] + (WINDFALL.radiusMm[1] - WINDFALL.radiusMm[0]) * rngFloat(rng);
      const x = ob.pos.x + r * dcos(a), z = ob.pos.z + r * dsin(a);
      placeAnchor(ctx, 'windfall', 'fruit', { x, y: supportAt(ctx, x, z), z }, ob.id);
    }
  }
  const theta = mapState(ctx).surface.theta0;
  const preyCap = scaledCap(ctx, NODE_DENSITY.prey.cap);
  let prey = 0;
  for (const [zone, n] of zoneTargets(ctx, rng, NODE_DENSITY.prey.perPlot)) {
    const cells = zoneCells(ctx, zone).filter((c) => theta[c] >= PREY_PATCH.thetaMin);
    for (let i = 0, tries = 0; i < n && tries < 4 * n + 8 && cells.length > 0 && prey < preyCap; tries++) {
      const r = PREY_PATCH.radiusBu[0] + rngInt(rng, 0, PREY_PATCH.radiusBu[1] - PREY_PATCH.radiusBu[0]);
      if (placeAnchor(ctx, null, 'prey', pointInCell(ctx, cells[rngInt(rng, 0, cells.length - 1)], rng), -1, `patch r=${r}`, 0b0111) >= 0) { i++; prey++; }
    }
  }
  for (const poi of ctx.world.pois) {
    if (poi.kind !== 'water-spot') continue;
    placeAnchor(ctx, 'water', 'dew', poi.pos, poi.objectId);
  }
}

/** Resources step: every anchor kind of GDD 04 §8.1. */
export function placeFood(ctx: GenContext): void {
  flowers(ctx);
  honeydew(ctx);
  plantSeedsAndEfn(ctx);
  crumbsAndSugar(ctx);
  tier2Ground(ctx);
}
