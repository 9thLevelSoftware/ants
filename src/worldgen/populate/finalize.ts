// Food guarantees against the final start (step 10, after the start placer): anchors the start cannot reach are
// dropped (every anchor is reachable, acceptance 5); then the chapter's distances are made good where the
// placement fell short, by adding the cheapest natural food near the start: a flower on an unused nectar host
// (or the honeydew site under an aphid host), else a crumb cluster on open ground (picnic crumbs; GDD 05 §1.2
// allows crumbs on lawn).
//   v-food (GDD 04 §4.3): >= 3 anchors within 600 BU; a renewable carbohydrate and a protein anchor within 900 BU.
//   GDD 05 §1.3: every good-or-better site within the start radius has >= 2 carbohydrate sources within 400 BU.
//   Economy floors (registry C13): the summer day offer within 300 / 900 BU (ECONOMY_FLOORS).
// What still fails is reported by validation and regenerates the world.

import { rngInt } from '@/core/rng';
import type { FoodAnchor, FoodVariant } from '@/sim/types';
import type { GenContext } from '../kit/context';
import { walkable } from '../maps/nav';
import { mapState } from '../maps/state';
import { navDistances } from '../validate/graph';
import { SUIT } from '../tuning/maps';
import { VALID } from '../tuning/pipeline';
import { objectById, poiById, pointInCell, startDistances } from './common';
import { accessOfAnchor, anchorDistance, dayOffer, isCarbSource, isProteinAnchor, sourceVariant, defAt } from './economy';
import { honeydewFilmFeet, placeAnchor, placeFilm } from './food';
import { HOST_BIT, usableHostPois } from './hosts';
import { ECONOMY_FLOORS, SITE_FOOD, T1_HONEYDEW, TOP_UP } from './tuning';

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
  return !!v && isCarbSource(a) && (defAt(v).refillPerGd > 0 || a.kind === 'crumb');
};

/** Adds one carbohydrate source within maxBu of the start: an unused flower, else a starch crumb cluster. */
function addCarb(ctx: GenContext, d: Float64Array, maxBu: number, minBu = 0): boolean {
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
  return addGround(ctx, d, 'crumb-starch', maxBu, minBu);
}

/** A crumb (or other ground) cluster on a walkable natural cell between minBu and maxBu of the start. */
function addGround(ctx: GenContext, d: Float64Array, v: FoodVariant, maxBu: number, minBu = 0): boolean {
  const rng = ctx.rng(`wg/start/topup/${v}/${ctx.world.placements.foodAnchors.length}`);
  const lay = ctx.layout, cls = ctx.world.nav.cls.data;
  const lo = Math.max(minBu, Math.min(TOP_UP.minBu, maxBu / 2)), hi = Math.min(maxBu, TOP_UP.maxBu);
  const cells: number[] = [];
  for (let c = 0; c < d.length; c++) {
    if (d[c] < lo || d[c] > hi || !walkable(cls[c])) continue;
    const z = lay.zones[lay.nav[c]];
    if (z.type !== 'interior') cells.push(c);
  }
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

/** Carbohydrate sources within SITE_FOOD.radiusBu of each good site near the start; the poorest count. */
export function siteFoodMin(ctx: GenContext, dStart: Float64Array): { min: number; sites: number } {
  const q = mapState(ctx).q[ctx.params.speciesId];
  const sites: number[] = [];
  for (let c = 0; c < q.length; c++) if (q[c] >= SUIT.good && dStart[c] <= VALID.startRadiusBu) sites.push(c);
  if (sites.length === 0) return { min: Infinity, sites: 0 };
  const count = new Int32Array(q.length);
  const reach = VALID.startRadiusBu + SITE_FOOD.radiusBu;
  for (const a of ctx.world.placements.foodAnchors) {
    if (!isCarbSource(a) || !(anchorDistance(ctx, a, dStart) <= reach)) continue;
    const acc = accessOfAnchor(ctx, a)!;
    const da = navDistances(ctx, [acc.cell], { maxBu: SITE_FOOD.radiusBu });
    for (const c of sites) if (da[c] + acc.climbBu <= SITE_FOOD.radiusBu) count[c]++;
  }
  let min = Infinity;
  for (const c of sites) min = Math.min(min, count[c]);
  return { min, sites: sites.length };
}

export interface FoodReport { near: number; carb: boolean; protein: boolean; filmsNear: number; films: number; filmSitesNear: number; floors: { radiusBu: number; c: number; p: number; ok: boolean }[]; siteMin: number }

/** Measures the guarantees against the current start (validation and reports). */
export function foodReport(ctx: GenContext): FoodReport {
  const d = startDistances(ctx);
  const floors = ECONOMY_FLOORS.map((f) => {
    const o = dayOffer(ctx, d, f.radiusBu);
    return { radiusBu: f.radiusBu, c: o.c, p: o.p, ok: o.c >= f.c && o.p >= f.p };
  });
  return {
    near: within(ctx, d, VALID.foodRadiusBu, makesSource),
    carb: within(ctx, d, VALID.foodKindRadiusBu, renewableCarb) > 0,
    protein: within(ctx, d, VALID.foodKindRadiusBu, isProteinAnchor) > 0,
    films: ctx.world.placements.foodAnchors.filter((a) => a.initialState.startsWith('honeydew-film')).length,
    filmSitesNear: honeydewFilmFeet(ctx).filter((f) => cellDist(ctx, d, f.foot) <= T1_HONEYDEW.nearBu).length,
    filmsNear: within(ctx, d, T1_HONEYDEW.nearBu, (a) => a.initialState.startsWith('honeydew-film')),
    floors, siteMin: siteFoodMin(ctx, d).min,
  };
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
      if (!(cellDist(ctx, d, f.foot) <= T1_HONEYDEW.nearBu) || !placeFilm(ctx, f)) continue;
      const a = ctx.world.placements.foodAnchors[ctx.world.placements.foodAnchors.length - 1];
      if (anchorDistance(ctx, a, d) <= T1_HONEYDEW.nearBu) { placed = true; break; }
      ctx.world.placements.foodAnchors.pop();
    }
    if (!placed) break;
    const far = films.sort((a, b) => anchorDistance(ctx, b, d) - anchorDistance(ctx, a, d) || a.id - b.id)[0];
    if (far && anchorDistance(ctx, far, d) > T1_HONEYDEW.nearBu) ctx.world.placements.foodAnchors = ctx.world.placements.foodAnchors.filter((x) => x !== far);
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
  // every good site near the start: two carbohydrate sources within 400 BU (one close to the start serves all)
  const closeBu = SITE_FOOD.radiusBu - VALID.startRadiusBu;
  while (added < cap && siteFoodMin(ctx, d).min < SITE_FOOD.carbMin && within(ctx, d, closeBu, isCarbSource) < SITE_FOOD.carbMin && addCarb(ctx, d, closeBu)) added++;
  // economy floors
  for (const f of ECONOMY_FLOORS) {
    for (let guard = 0; guard < cap && added < 2 * cap; guard++) {
      const o = dayOffer(ctx, d, f.radiusBu);
      if (o.c >= f.c && o.p >= f.p) break;
      const ok = o.c < f.c ? addCarb(ctx, d, f.radiusBu) : addGround(ctx, d, 'crumb-protein', f.radiusBu);
      if (!ok) break;
      added++;
    }
  }
  if (added > 0) ctx.notes.push(`food: ${added} anchors added near the start (guarantees)`);
}
