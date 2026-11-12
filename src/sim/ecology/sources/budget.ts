// What the food set offers per game day (registry C13 economy sanity budget; diagnostics `diag-carb-sources`,
// `diag-protein-sources`). Pure read-outs over the live sources and the world's zones.
//
//   dayOffer: what ants could take over the next game day: the stock lying there now, plus one day of renewal
//             (pool refills), plus the expected carrion drops of one day.
//   sustained: the renewable part alone (refill + drops + the T1 crumb rule if every cluster were eaten daily).

import { v3DistanceSq, type Vec3 } from '@/core/math/vec3';
import type { FoodVariant, Season, Sim, ZoneType } from '@/sim/types';
import { ZONE_TYPES } from '@/sim/types';
import {
  CARRION_DROP_VARIANTS, CARRION_MULT, CRUMB_REPLACE_FRACTION, ECOLOGY_TIER, PLOT_BU,
} from '@/sim/balance/ecology';
import { calendarNow } from '@/sim/environment';
import { anchorVariants } from './anchors';
import { sourceDef } from './def';
import { carrionDropsPerGd, zonePlots } from './drops';
import { isInSeason } from './season';

export interface FoodOffer {
  c: number;
  p: number;
  /** C and P per variant. */
  byVariant: Partial<Record<FoodVariant, { c: number; p: number }>>;
}

export interface OfferOptions {
  /** Only count food within this distance of center (default: whole map). */
  center?: Vec3;
  radiusMm?: number;
  /** Season for the drop rates (default: now). */
  season?: Season;
}

function emptyOffer(): FoodOffer {
  return { c: 0, p: 0, byVariant: {} };
}

function add(o: FoodOffer, v: FoodVariant, c: number, p: number): void {
  o.c += c;
  o.p += p;
  const e = (o.byVariant[v] ??= { c: 0, p: 0 });
  e.c += c;
  e.p += p;
}

/** Plots of each zone type inside the circle (zone map cells whose centre lies inside), or the whole map. */
export function zonePlotsWithin(sim: Sim, center?: Vec3, radiusMm?: number): Record<ZoneType, number> {
  if (!center || radiusMm === undefined) return zonePlots(sim.world);
  const m = sim.world.maps.zone;
  const out = Object.fromEntries(ZONE_TYPES.map((z) => [z, 0])) as Record<ZoneType, number>;
  const typeById = new Map(sim.world.zones.map((z) => [z.id, z.type]));
  const plot = PLOT_BU * sim.world.bu;
  const cellPlots = (m.cell * m.cell) / (plot * plot);
  const r2 = radiusMm * radiusMm;
  const i0 = Math.max(0, Math.floor((center.x - radiusMm) / m.cell)), i1 = Math.min(m.nx - 1, Math.floor((center.x + radiusMm) / m.cell));
  const k0 = Math.max(0, Math.floor((center.z - radiusMm) / m.cell)), k1 = Math.min(m.nz - 1, Math.floor((center.z + radiusMm) / m.cell));
  for (let k = k0; k <= k1; k++) {
    for (let i = i0; i <= i1; i++) {
      const dx = (i + 0.5) * m.cell - center.x, dz = (k + 0.5) * m.cell - center.z;
      if (dx * dx + dz * dz > r2) continue;
      const t = typeById.get(m.data[k * m.nx + i]);
      if (t) out[t] += cellPlots;
    }
  }
  return out;
}

function expectedDrops(sim: Sim, o: FoodOffer, opts: OfferOptions): void {
  const plots = zonePlotsWithin(sim, opts.center, opts.radiusMm);
  const season = opts.season ?? calendarNow(sim).season;
  const mult = CARRION_MULT[sim.state.config.difficulty.preset];
  CARRION_DROP_VARIANTS.forEach((v, vi) => {
    const d = sourceDef(v);
    for (const z of ZONE_TYPES) {
      const n = carrionDropsPerGd(vi, z, plots[z], season, mult);
      if (n > 0) add(o, v, n * d.c * d.units[0], n * d.p * d.units[0]);
    }
  });
}

function inRange(pos: Vec3, opts: OfferOptions): boolean {
  return !opts.center || opts.radiusMm === undefined || v3DistanceSq(pos, opts.center) <= opts.radiusMm * opts.radiusMm;
}

/** What the food set offers over the next game day (see file header). */
export function dayOffer(sim: Sim, opts: OfferOptions = {}): FoodOffer {
  const o = emptyOffer();
  for (const s of sim.stores.sources.list) {
    if (!s.alive || !inRange(s.pos, opts) || !s.variant || !isInSeason(sim, s)) continue;
    add(o, s.variant, s.units * s.c + s.refillPerGd * s.c, s.units * s.p + s.refillPerGd * s.p);
  }
  expectedDrops(sim, o, opts);
  return o;
}

/** Renewable daily supply: refills + expected drops + the T1 crumb rule at full consumption. */
export function sustainedOffer(sim: Sim, opts: OfferOptions = {}): FoodOffer {
  const o = emptyOffer();
  for (const s of sim.stores.sources.list) {
    if (!s.alive || !inRange(s.pos, opts) || !s.variant || s.refillPerGd <= 0 || !isInSeason(sim, s)) continue;
    add(o, s.variant, s.refillPerGd * s.c, s.refillPerGd * s.p);
  }
  if (ECOLOGY_TIER === 1) {
    const variants = anchorVariants(sim.world);
    for (const a of sim.world.placements.foodAnchors) {
      const v = variants.get(a.id);
      if ((v !== 'crumb-starch' && v !== 'crumb-protein') || !inRange(a.pos, opts)) continue;
      const d = sourceDef(v);
      const mean = (d.units[0] + d.units[1]) / 2;
      add(o, v, CRUMB_REPLACE_FRACTION * mean * d.c, CRUMB_REPLACE_FRACTION * mean * d.p);
    }
  }
  expectedDrops(sim, o, opts);
  return o;
}
