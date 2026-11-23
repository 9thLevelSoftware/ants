// Runtime appearance of sources: carrion drops (GDD 05 §1.3 runtime table, §0 T1 protein) and the T1 crumb rule
// (30 % of consumed crumb clusters re-placed daily at 12:00, at most 60 live clusters).

import { rngChance, rngFloat, rngShuffle, type RngState } from '@/core/rng';
import { v3Zero, type Vec3 } from '@/core/math/vec3';
import type { FoodVariant, Sim, WorldData, ZoneDef, ZoneType } from '@/sim/types';
import { ZONE_TYPES } from '@/sim/types';
import { zoneAt } from '@/sim/world';
import { calendarNow } from '@/sim/environment';
import {
  CARRION_DROP_MIN_ANT_BU, CARRION_DROP_PER_PLOT_GD, CARRION_DROP_TIER, CARRION_DROP_TRIES, CARRION_DROP_VARIANTS,
  CARRION_MULT, CARRION_SEASON_MULT, CARRION_ZONE_MULT, CRUMB_CLUSTER_CAP, CRUMB_REPLACE_FRACTION,
  CRUMB_REPLACE_HOUR, ECOLOGY_TIER, LARGE_CARCASS_SLUG_SHARE, PLOT_BU, T1_CARRION_MULT, type LargeCarcassType,
} from '@/sim/balance/ecology';
import { anchorVariants, sourceFromAnchor } from './anchors';
import { createSource } from './spawn';
import { ecologyRng, surfacePointAt } from './util';

/** Expected drops of one variant per game day in one zone type (plots x rate x season x zone x difficulty x T1). */
export function carrionDropsPerGd(
  variantIndex: number, zone: ZoneType, plots: number, season: keyof typeof CARRION_SEASON_MULT,
  carrionMult: number, tier: number = ECOLOGY_TIER,
): number {
  if (CARRION_DROP_TIER[variantIndex] > tier) return 0;
  const t1 = tier === 1 && CARRION_DROP_TIER[variantIndex] === 1 ? T1_CARRION_MULT : 1;
  return CARRION_DROP_PER_PLOT_GD[variantIndex] * t1 * CARRION_SEASON_MULT[season] * CARRION_ZONE_MULT[zone] * carrionMult * plots;
}

/** Plots (100 x 100 BU) of each zone type in the world. */
export function zonePlots(world: WorldData): Record<ZoneType, number> {
  const plot = PLOT_BU * world.bu;
  const out = Object.fromEntries(ZONE_TYPES.map((z) => [z, 0])) as Record<ZoneType, number>;
  for (const z of world.zones) out[z.type] += z.areaMm2 / (plot * plot);
  return out;
}

/** Adds this step's expected carrion drops to the accumulators and places the whole ones. */
export function runCarrionDrops(sim: Sim, dtGd: number, tier: number = ECOLOGY_TIER): number {
  const acc = sim.state.ecology.carrionAcc;
  const season = calendarNow(sim).season;
  const mult = CARRION_MULT[sim.state.config.difficulty.preset];
  const plots = zonePlots(sim.world);
  const rng = ecologyRng(sim.state);
  let placed = 0;
  for (let vi = 0; vi < CARRION_DROP_VARIANTS.length; vi++) {
    for (let zi = 0; zi < ZONE_TYPES.length; zi++) {
      const zone = ZONE_TYPES[zi];
      if (plots[zone] <= 0) continue;
      const k = vi * ZONE_TYPES.length + zi;
      if (k >= acc.length) continue;
      acc[k] += carrionDropsPerGd(vi, zone, plots[zone], season, mult, tier) * dtGd;
      while (acc[k] >= 1) {
        if (!dropCarrion(sim, rng, CARRION_DROP_VARIANTS[vi], zone, tier)) break; // no spot this hour: retry next hour
        acc[k] -= 1;
        placed++;
      }
    }
  }
  return placed;
}

const antScratch: number[] = [];

/** Places one carrion source of the variant at a random surface point of the zone, away from ants. */
function dropCarrion(sim: Sim, rng: RngState, variant: FoodVariant, zone: ZoneType, tier: number): boolean {
  const p = v3Zero();
  for (let t = 0; t < CARRION_DROP_TRIES; t++) {
    if (!randomPointInZone(sim.world, rng, zone, p)) return false;
    if (!surfacePointAt(sim.world, sim.field, p.x, p.z, p)) continue;
    antScratch.length = 0;
    if (sim.index.queryAnts(p, CARRION_DROP_MIN_ANT_BU * sim.world.bu, antScratch).length > 0) continue;
    const up = v3Zero();
    sim.field.normal(p, up);
    createSource(sim, { variant, pos: p, up, carcass: variant === 'large-carcass' ? carcassType(rng) : undefined, tier });
    return true;
  }
  return false;
}

function carcassType(rng: RngState): LargeCarcassType {
  return rngChance(rng, LARGE_CARCASS_SLUG_SHARE) ? 'slug' : 'vertebrate';
}

/** Uniform random point in the zone type (by its rectangles; zone map checked), into out. */
export function randomPointInZone(world: WorldData, rng: RngState, zone: ZoneType, out: Vec3): boolean {
  const defs = world.zones.filter((z) => z.type === zone && z.areaMm2 > 0);
  if (defs.length === 0) return false;
  for (let t = 0; t < CARRION_DROP_TRIES; t++) {
    const zd = pickByArea(defs, rng);
    if (zd.rects.length > 0) {
      const r = pickRect(zd.rects, rng);
      out.x = r[0] + (r[2] - r[0]) * rngFloat(rng);
      out.z = r[1] + (r[3] - r[1]) * rngFloat(rng);
    } else {
      out.x = world.size * rngFloat(rng);
      out.z = world.size * rngFloat(rng);
    }
    out.y = 0;
    if (zoneAt(world, out.x, out.z) === zone) return true;
  }
  return false;
}

function pickByArea(defs: ZoneDef[], rng: RngState): ZoneDef {
  let total = 0;
  for (const d of defs) total += d.areaMm2;
  let u = rngFloat(rng) * total;
  for (const d of defs) {
    u -= d.areaMm2;
    if (u < 0) return d;
  }
  return defs[defs.length - 1];
}

function pickRect(rects: number[][], rng: RngState): number[] {
  const area = (r: number[]): number => Math.max(0, (r[2] - r[0]) * (r[3] - r[1]));
  let total = 0;
  for (const r of rects) total += area(r);
  let u = rngFloat(rng) * total;
  for (const r of rects) {
    u -= area(r);
    if (u < 0) return r;
  }
  return rects[rects.length - 1];
}

// ---- T1 crumb rule ----

/** True in the hourly run that covers CRUMB_REPLACE_HOUR. */
export function isCrumbHour(sim: Sim): boolean {
  return Math.floor(calendarNow(sim).hour) === CRUMB_REPLACE_HOUR;
}

/** Re-places 30 % of the consumed T1 crumb clusters (stochastic rounding), up to the live-cluster cap. */
export function replaceCrumbs(sim: Sim, tier: number = ECOLOGY_TIER): number {
  const consumed = sim.state.worldDelta.consumedAnchors;
  const variants = anchorVariants(sim.world, tier);
  const crumbIds = consumed.filter((id) => {
    const v = variants.get(id);
    return v === 'crumb-starch' || v === 'crumb-protein';
  });
  if (crumbIds.length === 0) return 0;
  const rng = ecologyRng(sim.state);
  const expected = CRUMB_REPLACE_FRACTION * crumbIds.length;
  let k = Math.floor(expected) + (rngFloat(rng) < expected - Math.floor(expected) ? 1 : 0);
  let live = 0;
  for (const s of sim.stores.sources.list) if (s.alive && s.kind === 'crumb') live++;
  k = Math.min(k, Math.max(0, CRUMB_CLUSTER_CAP - live));
  if (k <= 0) return 0;
  const chosen = rngShuffle(rng, crumbIds.slice()).slice(0, k);
  const byId = new Map(sim.world.placements.foodAnchors.map((a) => [a.id, a]));
  for (const id of chosen) {
    const a = byId.get(id);
    const v = variants.get(id);
    if (a && v) sourceFromAnchor(sim, a, v, tier);
    consumed.splice(consumed.indexOf(id), 1);
  }
  return chosen.length;
}
