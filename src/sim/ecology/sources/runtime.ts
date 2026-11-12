// Runtime source creation and removal for other systems (GDD 05 §1.6-§1.9): human food drops and spills, corpses
// left outside becoming carrion, windfalls, bait stations, herd films, area clean-ups and re-projection.

import { rngChance, rngPick } from '@/core/rng';
import { v3Clone, v3DistanceSq, type Vec3 } from '@/core/math/vec3';
import type { FoodSource, FoodVariant, Sim } from '@/sim/types';
import { removeItem } from '@/sim/entities';
import { zoneAt } from '@/sim/world';
import {
  CARRION_BULK_CLASSES, CHILDREN_FOOD, HUMAN_DROP_CRUMBS, HUMAN_DROP_CRUST_SHARE, SOURCE_REPROJECT_MAX_BU,
  SPILL_INDOOR_GRANULE_SHARE, type WindfallFruit,
} from '@/sim/balance/ecology';
import { createSource, rollSpillMm } from './spawn';
import { retireSource } from './remove';
import { ecologyRng } from './util';

/** Human event kinds that bring food (GDD 05 §1.7). */
export type HumanFoodEvent = 'food-drop' | 'spill' | 'children';

/**
 * Food left by a human event at pos (GDD 05 §1.7): food-drop -> a crumb cluster whose variant depends on the zone
 * (or a crust), spill -> a sugary spill (indoors half the time granules), children -> crumbs or sugar granules.
 * Returns the new source ids.
 */
export function spawnHumanFood(sim: Sim, event: HumanFoodEvent, pos: Vec3): number[] {
  const rng = ecologyRng(sim.state);
  const zone = zoneAt(sim.world, pos.x, pos.z);
  const v: FoodVariant[] = [];
  if (event === 'food-drop') v.push(rngChance(rng, HUMAN_DROP_CRUST_SHARE) ? 'crust' : rngPick(rng, HUMAN_DROP_CRUMBS[zone]));
  else if (event === 'spill') v.push(zone === 'interior' && rngChance(rng, SPILL_INDOOR_GRANULE_SHARE) ? 'sugar-granules' : 'sugary-spill');
  else v.push(rngPick(rng, CHILDREN_FOOD), 'sugar-granules');
  return v.map((variant) => createSource(sim, { variant, pos, tier: 2, spillMm: variant === 'sugary-spill' ? rollSpillMm(sim) : undefined }).id);
}

/** Carrion variant for a carcass of this bulk (loads of carry capacity). */
export function carrionVariantForBulk(bulk: number): FoodVariant {
  for (const c of CARRION_BULK_CLASSES) if (bulk <= c.maxBulk) return c.variant;
  return 'large-carcass';
}

/**
 * A corpse or carcass item lying outside becomes a carrion source with the item's nutrients and bulk (the item is
 * removed). Returns the source id, -1 if the item is missing or carried.
 */
export function carrionFromItem(sim: Sim, itemId: number): number {
  const it = sim.stores.items.get(itemId);
  if (!it || it.carrierIds.length > 0) return -1;
  const variant = carrionVariantForBulk(it.bulk);
  const s = createSource(sim, { variant, pos: it.pos, units: 1, stage: it.stage });
  s.unitBulk = it.bulk;
  s.c = it.c;
  s.p = it.p;
  s.stageClock = it.stageClock;
  removeItem(sim, itemId, 'became-carrion');
  return s.id;
}

/** A windfall fruit at pos (T2, GDD 05 §1.2). */
export function spawnWindfall(sim: Sim, pos: Vec3, fruit: WindfallFruit, objectId = -1): FoodSource {
  return createSource(sim, { variant: 'windfall', pos, fruit, objectId, tier: 2 });
}

/** A bait station gel source (T2, GDD 05 §1.8); the human-events module places the station primitive. */
export function spawnBaitStation(sim: Sim, pos: Vec3, objectId = -1): FoodSource {
  return createSource(sim, { variant: 'bait-gel', pos, objectId, tier: 2 });
}

/**
 * The honeydew film under a herd (T2): pool cap 0.5, half-life 0.3 gd, fed by the herd's overflow through
 * addToPool. The plants module stores the id in Herd.filmSourceId.
 */
export function spawnHerdFilm(sim: Sim, pos: Vec3, herdId: number, plantId: number): FoodSource {
  return createSource(sim, { variant: 'honeydew-film', pos, herdId, plantId, tier: 2, empty: true });
}

/** Adds liquid to a pool source up to its cap (herd overflow into a film); returns the loads accepted. */
export function addToPool(sim: Sim, sourceId: number, loads: number): number {
  const s = sim.stores.sources.get(sourceId);
  if (!s || loads <= 0) return 0;
  const add = Math.min(loads, Math.max(0, s.capacity - s.units));
  s.units += add;
  if (s.pool >= 0) s.pool = s.units;
  if (add > 0) s.exhaustedBy = 0;
  return add;
}

/**
 * Removes the sources within radius of center that match (all when no filter): sweeping, vacuum, wiping, mowing
 * (GDD 05 §1.7). Returns the number removed.
 */
export function removeSourcesInArea(
  sim: Sim, center: Vec3, radiusMm: number, cause: string, filter?: (s: FoodSource) => boolean,
): number {
  const r2 = radiusMm * radiusMm;
  let n = 0;
  for (const s of sim.stores.sources.list) {
    if (!s.alive || v3DistanceSq(s.pos, center) > r2 || (filter && !filter(s))) continue;
    if (retireSource(sim, s, cause)) n++;
  }
  return n;
}

/**
 * After a carve op or an object move: sources within radius of center are re-projected onto the nearest surface;
 * one that would move more than SOURCE_REPROJECT_MAX_BU is removed (GDD 05 §1.9). Returns the number removed.
 */
export function reprojectSources(sim: Sim, center: Vec3, radiusMm: number): number {
  const r2 = radiusMm * radiusMm;
  const max = SOURCE_REPROJECT_MAX_BU * sim.world.bu;
  const p = v3Clone(center);
  let removed = 0;
  for (const s of sim.stores.sources.list) {
    if (!s.alive || v3DistanceSq(s.pos, center) > r2) continue;
    const ok = sim.field.project(s.pos, 0, p);
    if (!ok || v3DistanceSq(p, s.pos) > max * max) {
      if (retireSource(sim, s, 'unsupported')) removed++;
      continue;
    }
    s.pos.x = p.x; s.pos.y = p.y; s.pos.z = p.z;
    sim.field.normal(s.pos, s.up);
  }
  return removed;
}
