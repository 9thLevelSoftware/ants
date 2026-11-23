// What the food set of a generated world supplies per summer game day within a walking radius of the start
// (registry C13 economy sanity budget, a loads-per-game-day budget), computed from the anchors and the
// catalogue's renewal data the source system reads. Mirrors the source module's anchor-to-variant rule and its
// own read-outs (src/sim/ecology/sources/budget.ts), so the numbers are those a new game will have:
//   sustainedOffer: the renewable daily supply the floors are checked against: pool refill per gd, the T1 crumb
//                   rule (30 % of consumed clusters re-placed daily, so at full consumption 0.3 x a cluster's
//                   mean stock per cluster and day; Tier 1 only, as in the sim), the expected carrion drops over the
//                   reachable plots of each zone (GDD 05 §1.3 runtime table, T1 x4), and at Tier 2 the herds'
//                   honeydew and the prey patches (herdOffer). One-time stock (a cluster's first units, a sugar
//                   patch) is not a daily supply.
//   dayOffer:       read-out only: the stock lying there at the start plus one day of renewal.

import type { FoodAnchor, FoodVariant, ZoneType } from '@/sim/types';
import { FOOD_VARIANTS, SEASONS } from '@/sim/types';
import {
  CARRION_DROP_PER_PLOT_GD, CARRION_DROP_TIER, CARRION_DROP_VARIANTS, CARRION_MULT, CARRION_SEASON_MULT, CARRION_ZONE_MULT,
  CRUMB_REPLACE_FRACTION, ECOLOGY_TIER, PLOT_BU, SOURCE_CATALOGUE, T1_CARRION_MULT, type SourceDef,
} from '@/sim/balance';
import { HERD_INITIAL_OCCUPANCY, HERD_K, HONEYDEW_PER_APHID } from '@/sim/balance';
import { HERD_OFFER } from './tuning';
import type { GenContext } from '../kit/context';
import { anchorAccess, type AnchorAccess } from './access';
import { anchorAccessTable } from './food';
import { defAt } from './common';

export interface FoodOffer { c: number; p: number; byVariant: Partial<Record<FoodVariant, { c: number; p: number }>> }

const HERDS: readonly FoodVariant[] = ['aphid-herd', 'scale-herd'];
/** Prey-patch protein is booked under the small-insect carcass its springtails and mites become (byVariant). */
const PREY_VARIANT: FoodVariant = 'insect-small';
const SUMMER = 1 << SEASONS.indexOf('summer');

export { defAt };

/** Variant hint of an anchor (first word naming a variant of its kind), or null. */
export function anchorHint(a: FoodAnchor): FoodVariant | null {
  for (const w of a.initialState.split(/[\s,;:]+/)) {
    if ((FOOD_VARIANTS as readonly string[]).includes(w) && SOURCE_CATALOGUE[w as FoodVariant].kind === a.kind) return w as FoodVariant;
  }
  return null;
}

/** The variant whose source this anchor creates at the tier, or null (herds, prey, areas, later tiers). */
export function sourceVariant(a: FoodAnchor, tier: number = ECOLOGY_TIER): FoodVariant | null {
  if (a.initialState.split(/[\s,;:]+/).includes('area')) return null;
  const v = anchorHint(a);
  if (!v || HERDS.includes(v)) return null;
  if (v === 'honeydew-film' && tier >= 2) return null;
  return defAt(v, tier).tier <= tier ? v : null;
}

/** How a walker reaches the anchor (computed once and kept in the access table), or null. */
export function accessOfAnchor(ctx: GenContext, a: FoodAnchor): AnchorAccess | null {
  const table = anchorAccessTable(ctx);
  let acc = table.get(a.id);
  if (!acc) {
    const found = anchorAccess(ctx, a.pos, a.hostObjectId);
    if (!found) return null;
    acc = found;
    table.set(a.id, acc);
  }
  return acc;
}

/** Walking distance (BU) to an anchor given distances `d` over the nav grid (Infinity if unreachable). */
export function anchorDistance(ctx: GenContext, a: FoodAnchor, d: Float64Array): number {
  const acc = accessOfAnchor(ctx, a);
  return acc ? d[acc.cell] + acc.climbBu : Infinity;
}

function add(o: FoodOffer, v: FoodVariant, c: number, p: number): void {
  o.c += c; o.p += p;
  const e = (o.byVariant[v] ??= { c: 0, p: 0 });
  e.c += c; e.p += p;
}

const meanStock = (def: SourceDef) => (def.units[0] + def.units[1]) / 2;

/** Renewable loads per game day of one anchor's source: pool refill, or the T1 crumb rule at full consumption. */
export function renewalPerGd(v: FoodVariant, tier: number = ECOLOGY_TIER): number {
  const def = defAt(v, tier);
  if (def.refillPerGd > 0) return def.refillPerGd;
  // T1: the crumb rule re-places 30 % of consumed clusters daily. From T2 on the sim re-places no crumbs
  // (ecology/sources/system.ts; the runtime budget counts them at T1 only): human food comes from food-drop events
  // at tables, patios, bins, bays and playgrounds, which are events, not a supply the floors may count on (C13's T2
  // budget is herds, flowers and prey patches)
  const crumb = v === 'crumb-starch' || v === 'crumb-protein';
  return crumb && tier === 1 ? CRUMB_REPLACE_FRACTION * meanStock(def) : 0;
}

/** Renewable summer daily supply within radiusBu of the start along `d` (distances from the start). */
export function sustainedOffer(ctx: GenContext, d: Float64Array, radiusBu: number): FoodOffer {
  return offer(ctx, d, radiusBu, renewalPerGd);
}

/** Read-out only: the stock of every source plus one day of renewal, within radiusBu (see the file header). */
export function dayOffer(ctx: GenContext, d: Float64Array, radiusBu: number): FoodOffer {
  return offer(ctx, d, radiusBu, (v) => meanStock(defAt(v)) + defAt(v).refillPerGd);
}

/** Tier 2: honeydew of the herds on `aphid-herd` anchors and protein of prey patches in reach (HERD_OFFER), per gd. */
function herdOffer(ctx: GenContext, d: Float64Array, radiusBu: number, o: FoodOffer): void {
  const def = SOURCE_CATALOGUE['aphid-herd'];
  const hostOf = new Map(ctx.world.placements.plants.map((p) => [p.objectId, p.hostClass]));
  for (const a of ctx.world.placements.foodAnchors) {
    if (!(a.seasonMask & SUMMER)) continue;
    const herd = a.kind === 'honeydew' && a.initialState.split(/[\s,;:]+/).includes('aphid-herd');
    if (!herd && a.kind !== 'prey') continue;
    if (!(anchorDistance(ctx, a, d) <= radiusBu)) continue;
    if (herd) {
      const loads = HERD_INITIAL_OCCUPANCY * HERD_OFFER.aShare * HERD_K[hostOf.get(a.hostObjectId) ?? 'herb'] * HONEYDEW_PER_APHID;
      add(o, 'aphid-herd', loads * def.c, loads * def.p);
    } else add(o, PREY_VARIANT, 0, HERD_OFFER.preyP);
  }
}

function offer(ctx: GenContext, d: Float64Array, radiusBu: number, loadsPerAnchor: (v: FoodVariant) => number): FoodOffer {
  const o: FoodOffer = { c: 0, p: 0, byVariant: {} };
  for (const a of ctx.world.placements.foodAnchors) {
    const v = sourceVariant(a);
    if (!v || !(a.seasonMask & SUMMER) || !(anchorDistance(ctx, a, d) <= radiusBu)) continue;
    const def = defAt(v), n = loadsPerAnchor(v);
    if (n > 0) add(o, v, n * def.c, n * def.p);
  }
  if (ECOLOGY_TIER >= 2) herdOffer(ctx, d, radiusBu, o);
  // expected carrion drops over the reachable plots of each zone type
  const { navN, navCell, bu } = ctx.dims;
  const cellPlots = (navCell * navCell) / (PLOT_BU * bu) ** 2;
  const plots: Partial<Record<ZoneType, number>> = {};
  for (let c = 0; c < navN * navN; c++) {
    if (!(d[c] <= radiusBu)) continue;
    const z = ctx.layout.zones[ctx.layout.nav[c]].type;
    plots[z] = (plots[z] ?? 0) + cellPlots;
  }
  const mult = CARRION_MULT[ctx.params.difficulty];
  CARRION_DROP_VARIANTS.forEach((v, vi) => {
    if (CARRION_DROP_TIER[vi] > ECOLOGY_TIER) return;
    const t1 = ECOLOGY_TIER === 1 && CARRION_DROP_TIER[vi] === 1 ? T1_CARRION_MULT : 1;
    const def = defAt(v);
    for (const [z, n] of Object.entries(plots) as [ZoneType, number][]) {
      const drops = CARRION_DROP_PER_PLOT_GD[vi] * t1 * CARRION_SEASON_MULT.summer * CARRION_ZONE_MULT[z] * mult * n;
      add(o, v, drops * def.c * def.units[0], drops * def.p * def.units[0]);
    }
  });
  return o;
}

/** Carbohydrate source anchors (renewable or stocked sugar food at this tier). */
export function isCarbSource(a: FoodAnchor): boolean {
  const v = sourceVariant(a);
  return !!v && defAt(v).c >= defAt(v).p && defAt(v).c > 0;
}

/** Protein anchors (GDD 04 v-food): carrion, prey, pet food, and the T1 protein crumbs. */
export function isProteinAnchor(a: FoodAnchor): boolean {
  if (a.kind === 'carrion' || a.kind === 'prey' || a.kind === 'pet-food') return true;
  const v = anchorHint(a);
  return !!v && defAt(v).p > defAt(v).c;
}
