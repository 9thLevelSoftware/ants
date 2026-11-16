// Food guarantees against the final start (step 10, after the start placer): anchors the start cannot reach are
// dropped (every anchor is reachable, acceptance 5); then the chapter's distances are made good where the
// placement fell short, by adding the cheapest natural food near the start that the catalogue places there: a
// flower on an unused nectar host, else a crumb cluster on open ground in a zone where GDD 05 §1.2 / §1.3 puts
// crumbs (lawn picnic spots, paving, asphalt, sand, play surfacing; never forest or garden beds).
//   v-food (GDD 04 §4.3): >= 3 anchors within 600 BU; a renewable carbohydrate and a protein anchor within 900 BU.
//   GDD 05 §1.3: every good-or-better site within the start radius has >= 2 carbohydrate sources within 400 BU.
//   Economy floors (registry C13): the renewable summer daily supply within 300 / 900 BU (ECONOMY_FLOORS).
// What still fails is reported by validation and regenerates the world.

import { rngInt } from '@/core/rng';
import { CARRION_ZONE_MULT, ECOLOGY_TIER } from '@/sim/balance';
import type { FoodAnchor, FoodVariant } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { walkable } from '../maps/nav';
import { mapState } from '../maps/state';
import { cellAt, forEachWithin, portals } from '../validate/graph';
import { SUIT } from '../tuning/maps';
import { VALID } from '../tuning/pipeline';
import { objectById, poiById, pointInCell, scaledCap, startDistances, zoneTypeAtXZ } from './common';
import { accessOfAnchor, anchorDistance, defAt, isCarbSource, isProteinAnchor, renewalPerGd, sourceVariant, sustainedOffer } from './economy';
import { honeydewFilmFeet, placeAnchor, placeFilm, removeFilm } from './food';
import { HOST_BIT, poisOf, usableHostPois } from './hosts';
import { preyTerritories } from './territories';
import { ECONOMY_FLOORS, NODE_DENSITY, PREY_PATCH, SITE_FOOD, T1_HONEYDEW, TOP_UP, topUpZones } from './tuning';

/** Drops anchors that no walker from the start can reach. Returns how many. */
export function pruneUnreachable(ctx: GenContext, d: Float64Array): number {
  const keep: FoodAnchor[] = [];
  for (const a of ctx.world.placements.foodAnchors) if (anchorDistance(ctx, a, d) < Infinity) keep.push(a);
  const dropped = ctx.world.placements.foodAnchors.length - keep.length;
  ctx.world.placements.foodAnchors = keep;
  return dropped;
}

const makesSource = (a: FoodAnchor) => sourceVariant(a) !== null;
const renewableCarb = (a: FoodAnchor) => {
  const v = sourceVariant(a);
  return !!v && isCarbSource(a) && renewalPerGd(v) > 0;
};

/**
 * Adds one carbohydrate source within maxBu of the start: an unused flower, else (unless `renewableOnly`: a crumb
 * cluster renews nothing from Tier 2 on) a starch crumb cluster.
 */
function addCarb(ctx: GenContext, d: Float64Array, maxBu: number, spread = false, renewableOnly = false): boolean {
  const used = new Set(ctx.world.placements.foodAnchors.filter((a) => a.kind === 'nectar').map((a) => a.hostObjectId));
  const flowers = ctx.world.placements.plants.filter((p) => p.hostFlags & HOST_BIT.nectar && !used.has(p.objectId))
    .map((p) => ({ p, ob: objectById(ctx, p.objectId) }))
    .filter((x) => x.ob && d[Math.min(ctx.dims.navN - 1, Math.floor(x.ob.pos.z / ctx.dims.navCell)) * ctx.dims.navN + Math.min(ctx.dims.navN - 1, Math.floor(x.ob.pos.x / ctx.dims.navCell))] <= maxBu)
    .sort((x, y) => x.p.objectId - y.p.objectId);
  for (const { p } of flowers) {
    const poi = usableHostPois(ctx, p).map((id) => poiById(ctx, id)!).find((q) => q.kind === 'nectar-site');
    if (!poi) continue;
    const id = placeAnchor(ctx, 'flower', 'nectar', poi.pos, p.objectId, 'full top-up');
    if (id >= 0) {
      const a = ctx.world.placements.foodAnchors[ctx.world.placements.foodAnchors.length - 1];
      if (anchorDistance(ctx, a, d) <= maxBu) return true;
      ctx.world.placements.foodAnchors.pop();
    }
  }
  if (ECOLOGY_TIER >= 2 && addHerd(ctx, d, maxBu)) return true;
  return !renewableOnly && addGround(ctx, d, 'crumb-starch', maxBu, spread);
}

/**
 * Tier 2 carbohydrate top-up: an aphid herd anchor on a plant near the start that has an aphid site but is not yet
 * a host (it becomes one; the plants module founds its herd at the start with HERD_INITIAL_OCCUPANCY).
 * Nearest first, outdoors only.
 */
function addHerd(ctx: GenContext, d: Float64Array, maxBu: number): boolean {
  const anchors = ctx.world.placements.foodAnchors;
  const cands = ctx.world.placements.plants
    .filter((p) => !(p.hostFlags & HOST_BIT.aphid))
    .map((p) => ({ p, ob: objectById(ctx, p.objectId) }))
    .filter((x) => x.ob && zoneTypeAtXZ(ctx, x.ob.pos.x, x.ob.pos.z) !== 'interior' && poisOf(ctx, x.ob, 'aphid-site').length > 0)
    .map((x) => ({ ...x, dist: cellDist(ctx, d, x.ob!.pos) }))
    .filter((x) => x.dist <= maxBu)
    .sort((x, y) => x.dist - y.dist || x.p.objectId - y.p.objectId);
  for (const { p } of cands) {
    const flags = p.hostFlags, pois = p.hostPoiIds;
    p.hostFlags |= HOST_BIT.aphid;
    p.hostPoiIds = undefined;
    const site = usableHostPois(ctx, p).map((id) => poiById(ctx, id)!).find((q) => q.kind === 'aphid-site');
    if (site && placeAnchor(ctx, 'aphid-herd', 'honeydew', site.pos, p.objectId, 'full top-up') >= 0) {
      if (anchorDistance(ctx, anchors[anchors.length - 1], d) <= maxBu) return true;
      anchors.pop();
    }
    p.hostFlags = flags;
    p.hostPoiIds = pois;
  }
  return false;
}

/**
 * Tier 2 protein top-up for the economy floors: a prey patch (C13's T2 protein, GDD 05 §2) on humid walkable ground
 * of a zone the catalogue puts prey patches in, within maxBu of the start (TOP_UP placement as addGround).
 */
function addPreyPatch(ctx: GenContext, d: Float64Array, maxBu: number, spread = false): boolean {
  const anchors = ctx.world.placements.foodAnchors;
  const rng = ctx.rng(`wg/start/topup/prey/${anchors.length}`);
  const lay = ctx.layout, cls = ctx.world.nav.cls.data, theta = mapState(ctx).surface.theta0;
  const zones = Object.keys(NODE_DENSITY.prey.perPlot);
  const cellsIn = (lo: number, hi: number) => {
    const out: number[] = [];
    for (let c = 0; c < d.length; c++) {
      if (d[c] >= lo && d[c] <= hi && walkable(cls[c]) && theta[c] >= PREY_PATCH.thetaMin && zones.includes(lay.zones[lay.nav[c]].type)) out.push(c);
    }
    return out;
  };
  const lo = Math.min(TOP_UP.minBu, maxBu / 2);
  let cells = spread ? [] : cellsIn(lo, Math.min(maxBu, TOP_UP.maxBu));
  if (cells.length === 0 && maxBu > TOP_UP.maxBu) cells = cellsIn(lo, maxBu);
  for (let t = 0; t < TOP_UP.tries && cells.length > 0; t++) {
    const pos = pointInCell(ctx, cells[rngInt(rng, 0, cells.length - 1)], rng);
    if (placeAnchor(ctx, null, 'prey', pos, -1, `patch r=${PREY_PATCH.radiusBu[0]} top-up`, 0b0111) < 0) continue;
    if (anchorDistance(ctx, anchors[anchors.length - 1], d) <= maxBu) { preyTerritories(ctx, anchors[anchors.length - 1]); return true; }
    anchors.pop();
  }
  return false;
}

/** Walkable cells between lo and hi BU of the start in a zone the variant may be topped up in. */
function groundCells(ctx: GenContext, d: Float64Array, v: FoodVariant, lo: number, hi: number): number[] {
  const lay = ctx.layout, cls = ctx.world.nav.cls.data, zones = topUpZones(v);
  const cells: number[] = [];
  for (let c = 0; c < d.length; c++) {
    if (d[c] >= lo && d[c] <= hi && walkable(cls[c]) && zones.includes(lay.zones[lay.nav[c]].type)) cells.push(c);
  }
  return cells;
}

/**
 * A crumb cluster on a walkable cell of a crumb zone within maxBu of the start (not closer than TOP_UP.minBu):
 * within TOP_UP.maxBu when such ground is there (food close to the start), else, or when `spread`, anywhere within
 * maxBu (the far economy floor: clusters spread over the foraging range instead of piling up by the start).
 */
function addGround(ctx: GenContext, d: Float64Array, v: FoodVariant, maxBu: number, spread = false): boolean {
  const rng = ctx.rng(`wg/start/topup/${v}/${ctx.world.placements.foodAnchors.length}`);
  const lo = Math.min(TOP_UP.minBu, maxBu / 2);
  let cells = spread ? [] : groundCells(ctx, d, v, lo, Math.min(maxBu, TOP_UP.maxBu));
  if (cells.length === 0 && maxBu > TOP_UP.maxBu) cells = groundCells(ctx, d, v, lo, maxBu);
  for (let t = 0; t < TOP_UP.tries && cells.length > 0; t++) {
    const c = cells[rngInt(rng, 0, cells.length - 1)];
    if (placeAnchor(ctx, v, defAt(v).kind, pointInCell(ctx, c, rng), -1, 'full top-up') >= 0) {
      const a = ctx.world.placements.foodAnchors[ctx.world.placements.foodAnchors.length - 1];
      if (anchorDistance(ctx, a, d) <= maxBu) return true;
      ctx.world.placements.foodAnchors.pop();
    }
  }
  return false;
}

const within = (ctx: GenContext, d: Float64Array, r: number, f: (a: FoodAnchor) => boolean) =>
  ctx.world.placements.foodAnchors.filter((a) => f(a) && anchorDistance(ctx, a, d) <= r).length;

/**
 * Carbohydrate sources within SITE_FOOD.radiusBu (walking) of each good-or-better cell, for the cells `inScope`
 * accepts (GDD 05 §1.3 site food), counting the sources `anchorNear` lets through (all by default). One bounded
 * search per source; Int32 counts by cell (-1: not a site).
 */
function siteCarbCounts(ctx: GenContext, inScope: (c: number) => boolean, anchorNear: (a: FoodAnchor) => boolean = () => true): Int32Array {
  const q = mapState(ctx).q[ctx.params.speciesId];
  const count = new Int32Array(q.length).fill(-1);
  for (let c = 0; c < q.length; c++) if (q[c] >= SUIT.good && inScope(c)) count[c] = 0;
  const ports = portals(ctx);
  for (const a of ctx.world.placements.foodAnchors) {
    if (!isCarbSource(a) || !anchorNear(a)) continue;
    const acc = accessOfAnchor(ctx, a);
    if (!acc || acc.climbBu > SITE_FOOD.radiusBu) continue;
    forEachWithin(ctx, acc.cell, { maxBu: SITE_FOOD.radiusBu - acc.climbBu }, (c) => { if (count[c] >= 0) count[c]++; }, ports);
  }
  return count;
}

/** Carbohydrate sources within SITE_FOOD.radiusBu of each good site near the start; the poorest count. */
export function siteFoodMin(ctx: GenContext, dStart: Float64Array): { min: number; sites: number } {
  const reach = VALID.startRadiusBu + SITE_FOOD.radiusBu;
  const count = siteCarbCounts(ctx, (c) => dStart[c] <= VALID.startRadiusBu, (a) => anchorDistance(ctx, a, dStart) <= reach);
  let min = Infinity, sites = 0;
  for (const n of count) if (n >= 0) { sites++; min = Math.min(min, n); }
  return { min, sites };
}

/**
 * Map-wide GDD 05 §1.3 site food: the share of good-or-better cells with >= SITE_FOOD.carbMin carbohydrate
 * sources within 400 BU. The rule's second half (a prey patch or a carcass-capable zone within 400 BU) holds for
 * every site by construction: carrion drops in every zone type (CARRION_ZONE_MULT > 0) and a site lies in one.
 */
export function siteFoodShare(ctx: GenContext): { share: number; sites: number; carcassZones: boolean } {
  const count = siteCarbCounts(ctx, () => true);
  let sites = 0, fed = 0;
  for (const n of count) if (n >= 0) { sites++; if (n >= SITE_FOOD.carbMin) fed++; }
  const carcassZones = ctx.world.zones.every((z) => CARRION_ZONE_MULT[z.type] > 0);
  return { share: sites > 0 ? fed / sites : 1, sites, carcassZones };
}

export interface FoodReport {
  near: number; carb: boolean; protein: boolean; filmsNear: number; films: number; filmSitesNear: number;
  floors: { radiusBu: number; c: number; p: number; ok: boolean }[];
  /** Poorest carbohydrate count of the good sites near the start (enforced). */
  siteMin: number;
  /** Map-wide share of good sites with enough carbohydrate sources, and the carcass-zone half of the rule. */
  siteShare: number; carcassZones: boolean;
}

/** Measures the guarantees against the current start (validation and reports). */
export function foodReport(ctx: GenContext): FoodReport {
  const d = startDistances(ctx);
  const floors = ECONOMY_FLOORS.map((f) => {
    const o = sustainedOffer(ctx, d, f.radiusBu);
    return { radiusBu: f.radiusBu, c: o.c, p: o.p, ok: o.c >= f.c && o.p >= f.p };
  });
  return {
    near: within(ctx, d, VALID.foodRadiusBu, makesSource),
    carb: within(ctx, d, VALID.foodKindRadiusBu, renewableCarb) > 0,
    protein: within(ctx, d, VALID.foodKindRadiusBu, isProteinAnchor) > 0,
    films: ctx.world.placements.foodAnchors.filter((a) => a.initialState.startsWith('honeydew-film')).length,
    filmSitesNear: honeydewFilmFeet(ctx).filter((f) => cellDist(ctx, d, f.foot) <= T1_HONEYDEW.nearBu).length,
    filmsNear: within(ctx, d, T1_HONEYDEW.nearBu, (a) => a.initialState.startsWith('honeydew-film')),
    floors, siteMin: siteFoodMin(ctx, d).min, ...siteShareOf(ctx),
  };
}

function siteShareOf(ctx: GenContext): { siteShare: number; carcassZones: boolean } {
  const r = siteFoodShare(ctx);
  return { siteShare: r.share, carcassZones: r.carcassZones };
}

const cellDist = (ctx: GenContext, d: Float64Array, p: { x: number; z: number }) =>
  d[Math.min(ctx.dims.navN - 1, Math.floor(p.z / ctx.dims.navCell)) * ctx.dims.navN + Math.min(ctx.dims.navN - 1, Math.floor(p.x / ctx.dims.navCell))];

/**
 * GDD 05 §0: at least 2 of the static honeydew films within 600 BU of the start. When the start moved away from
 * the provisional one, the farthest films move under aphid hosts near the start (the total stays 1 per 250 plots).
 */
function honeydewNearStart(ctx: GenContext, d: Float64Array): number {
  const isFilm = (a: FoodAnchor) => a.initialState.startsWith('honeydew-film');
  let moved = 0;
  for (let guard = 0; guard < T1_HONEYDEW.nearMin; guard++) {
    const films = ctx.world.placements.foodAnchors.filter(isFilm);
    if (films.filter((f) => anchorDistance(ctx, f, d) <= T1_HONEYDEW.nearBu).length >= T1_HONEYDEW.nearMin) break;
    const used = new Set(films.map((f) => f.hostObjectId));
    const cand = honeydewFilmFeet(ctx).filter((f) => !used.has(f.p.objectId))
      .sort((a, b) => Number(b.host) - Number(a.host) || a.p.objectId - b.p.objectId);
    let placed = false;
    for (const f of cand) {
      if (!(cellDist(ctx, d, f.foot) <= T1_HONEYDEW.nearBu)) continue;
      if (placeFilm(ctx, f, (a) => anchorDistance(ctx, a, d) <= T1_HONEYDEW.nearBu)) { placed = true; break; }
    }
    if (!placed) break;
    const far = films.sort((a, b) => anchorDistance(ctx, b, d) - anchorDistance(ctx, a, d) || a.id - b.id)[0];
    if (far && anchorDistance(ctx, far, d) > T1_HONEYDEW.nearBu) removeFilm(ctx, far);
    moved++;
  }
  return moved;
}

/** Start step, after the start placer: prune, then top up what the chapter's distances need. */
export function finalizeFood(ctx: GenContext): void {
  const d = startDistances(ctx);
  const dropped = pruneUnreachable(ctx, d);
  if (dropped > 0) ctx.notes.push(`food: ${dropped} anchors unreachable from the start dropped`);
  let added = honeydewNearStart(ctx, d);
  const cap = 24;
  while (added < cap && within(ctx, d, VALID.foodRadiusBu, makesSource) < VALID.foodMin && addCarb(ctx, d, VALID.foodRadiusBu)) added++;
  if (within(ctx, d, VALID.foodKindRadiusBu, renewableCarb) === 0 && addCarb(ctx, d, VALID.foodKindRadiusBu)) added++;
  if (within(ctx, d, VALID.foodKindRadiusBu, isProteinAnchor) === 0 && addGround(ctx, d, 'crumb-protein', VALID.foodKindRadiusBu)) added++;
  // every good site near the start: two carbohydrate sources within 400 BU; flowers by the poorly fed sites
  // first, then sources close to the start (one within 150 BU serves every site within 250 BU)
  added += feedGoodSites(ctx, d, (c) => d[c] <= VALID.startRadiusBu);
  added += crumbsForSites(ctx, d);
  const closeBu = SITE_FOOD.radiusBu - VALID.startRadiusBu;
  while (added < cap && siteFoodMin(ctx, d).min < SITE_FOOD.carbMin && within(ctx, d, closeBu, isCarbSource) < SITE_FOOD.carbMin && addCarb(ctx, d, closeBu)) added++;
  // economy floors
  for (const f of ECONOMY_FLOORS) {
    for (let guard = 0; guard < cap && added < 2 * cap; guard++) {
      const o = sustainedOffer(ctx, d, f.radiusBu);
      if (o.c >= f.c && o.p >= f.p) break;
      const spread = f.radiusBu > TOP_UP.maxBu;
      // T1 tops up with crumb clusters (the crumb rule renews them); from T2 on only renewable food counts
      const t2 = ECOLOGY_TIER >= 2;
      const ok = o.c < f.c ? addCarb(ctx, d, f.radiusBu, spread, t2)
        : t2 ? addPreyPatch(ctx, d, f.radiusBu, spread) : addGround(ctx, d, 'crumb-protein', f.radiusBu, spread);
      if (!ok) break;
      added++;
    }
  }
  if (added > 0) ctx.notes.push(`food: ${added} anchors added near the start (guarantees)`);
  const flowers = feedGoodSites(ctx, d);
  if (flowers > 0) ctx.notes.push(`food: ${flowers} flowers opened near poorly fed good sites`);
}

/**
 * Good sites near the start still short of carbohydrate (no unused flower within reach): a starch crumb cluster on
 * crumb ground within 400 BU of the poorest site, until every one has SITE_FOOD.carbMin or no such ground is left.
 */
function crumbsForSites(ctx: GenContext, d: Float64Array): number {
  const lay = ctx.layout, cls = ctx.world.nav.cls.data, zones = topUpZones('crumb-starch');
  const anchors = ctx.world.placements.foodAnchors;
  const moved = new Set<FoodAnchor>();
  let added = 0;
  for (let n = 0; n < TOP_UP.siteCrumbMax; n++) {
    const reach = VALID.startRadiusBu + SITE_FOOD.radiusBu;
    const count = siteCarbCounts(ctx, (c) => d[c] <= VALID.startRadiusBu, (a) => anchorDistance(ctx, a, d) <= reach);
    let worst = -1;
    for (let c = 0; c < count.length; c++) if (count[c] >= 0 && count[c] < SITE_FOOD.carbMin && (worst < 0 || count[c] < count[worst])) worst = c;
    if (worst < 0) break;
    const cells: number[] = [];
    forEachWithin(ctx, worst, { maxBu: SITE_FOOD.radiusBu }, (j) => {
      if (d[j] < Infinity && walkable(cls[j]) && zones.includes(lay.zones[lay.nav[j]].type)) cells.push(j);
    });
    cells.sort((a, b) => a - b);
    const rng = ctx.rng(`wg/start/site-crumbs/${n}`);
    let placed = false;
    for (let t = 0; t < TOP_UP.tries && cells.length > 0 && !placed; t++) {
      if (placeAnchor(ctx, 'crumb-starch', 'crumb', pointInCell(ctx, cells[rngInt(rng, 0, cells.length - 1)], rng), -1, 'full top-up') < 0) continue;
      if (anchorDistance(ctx, anchors[anchors.length - 1], d) < Infinity) placed = true;
      else anchors.pop();
    }
    // no crumb ground by this site (deep in a forest or bed): move a far static film under a plant near it
    if (!placed && !moveFilmToSite(ctx, d, worst, moved)) break;
    added++;
  }
  return added;
}

/**
 * Moves the static honeydew film farthest from the start under an unused plant within 400 BU of `site` (GDD 05 §0
 * places the films "anywhere" beyond the 2 near the start, so the count and the near-start rule still hold).
 */
function moveFilmToSite(ctx: GenContext, d: Float64Array, site: number, moved: Set<FoodAnchor>): boolean {
  const isFilm = (a: FoodAnchor) => a.initialState.startsWith('honeydew-film');
  const films = ctx.world.placements.foodAnchors.filter(isFilm)
    .sort((a, b) => anchorDistance(ctx, b, d) - anchorDistance(ctx, a, d) || a.id - b.id);
  // films already moved to a site stay; so do the nearMin nearest to the start
  const far = films.slice(0, Math.max(0, films.length - T1_HONEYDEW.nearMin)).find((f) => !moved.has(f));
  if (!far || films.filter((f) => f !== far && anchorDistance(ctx, f, d) <= T1_HONEYDEW.nearBu).length < T1_HONEYDEW.nearMin) return false;
  const near = new Map<number, number>();
  forEachWithin(ctx, site, { maxBu: SITE_FOOD.radiusBu }, (c, dist) => near.set(c, dist));
  const used = new Set(films.map((f) => f.hostObjectId));
  const feet = honeydewFilmFeet(ctx).filter((f) => !used.has(f.p.objectId) && near.has(cellAt(ctx, f.foot.x, f.foot.z)))
    .sort((a, b) => Number(b.host) - Number(a.host) || a.p.objectId - b.p.objectId);
  for (const f of feet) {
    const fits = (a: FoodAnchor) => {
      const acc = accessOfAnchor(ctx, a);
      return !!acc && anchorDistance(ctx, a, d) < Infinity && (near.get(acc.cell) ?? Infinity) + acc.climbBu <= SITE_FOOD.radiusBu;
    };
    if (!placeFilm(ctx, f, fits)) continue;
    moved.add(ctx.world.placements.foodAnchors[ctx.world.placements.foodAnchors.length - 1]);
    removeFilm(ctx, far);
    return true;
  }
  return false;
}

/**
 * GDD 05 §1.3 site food (the good sites `inScope` accepts; all by default): good sites with fewer than SITE_FOOD.carbMin carbohydrate sources within
 * 400 BU get flowers on unused nectar hosts near them (the natural carbohydrate of the zones where good sites lie),
 * within the map's flower cap. Hosts are taken in object order, each only if it serves a poorly fed site.
 */
function feedGoodSites(ctx: GenContext, d: Float64Array, inScope: (c: number) => boolean = () => true): number {
  const count = siteCarbCounts(ctx, inScope);
  const isShort = (c: number) => count[c] >= 0 && count[c] < SITE_FOOD.carbMin;
  let short = 0;
  for (let c = 0; c < count.length; c++) if (isShort(c)) short++;
  if (short === 0) return 0;
  const cap = scaledCap(ctx, NODE_DENSITY.flower.cap);
  const anchors = ctx.world.placements.foodAnchors;
  let flowers = anchors.filter((a) => a.initialState.startsWith('flower')).length;
  const used = new Set(anchors.filter((a) => a.kind === 'nectar').map((a) => a.hostObjectId));
  const ports = portals(ctx);
  let added = 0;
  for (const p of ctx.world.placements.plants) {
    if (flowers >= cap || short === 0) break;
    if (!(p.hostFlags & HOST_BIT.nectar) || used.has(p.objectId)) continue;
    const poi = usableHostPois(ctx, p).map((id) => poiById(ctx, id)!).find((q) => q.kind === 'nectar-site');
    if (!poi) continue;
    // cheap pre-test from the plant's ground cell, then the real anchor's access
    const ob = objectById(ctx, p.objectId);
    if (!ob) continue;
    let helps = false;
    forEachWithin(ctx, cellAt(ctx, ob.pos.x, ob.pos.z), { maxBu: SITE_FOOD.radiusBu }, (c) => { if (isShort(c)) helps = true; }, ports);
    if (!helps || placeAnchor(ctx, 'flower', 'nectar', poi.pos, p.objectId, 'full site-food') < 0) continue;
    const a = anchors[anchors.length - 1], acc = accessOfAnchor(ctx, a);
    if (!acc || !(anchorDistance(ctx, a, d) < Infinity) || acc.climbBu > SITE_FOOD.radiusBu) { anchors.pop(); continue; }
    forEachWithin(ctx, acc.cell, { maxBu: SITE_FOOD.radiusBu - acc.climbBu }, (c) => {
      if (count[c] < 0) return;
      count[c]++;
      if (count[c] === SITE_FOOD.carbMin) short--;
    }, ports);
    used.add(p.objectId);
    flowers++;
    added++;
  }
  return added;
}
