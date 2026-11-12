// Discovery, smell and choice of sources (GDD 05 §1.1, §1.8 counterplay; GDD 02 §4 source attributes).

import { v3Clone, v3DistanceSq as dist2, type Vec3 } from '@/core/math/vec3';
import type { FoodKind, FoodSource, FoodVariant, Sim } from '@/sim/types';
import { colonySlotBit } from '@/sim/entities';
import { amountOf, defOf, isEmpty, odourRadiusMm } from './def';
import { forEachSourceNear, maxOdourMm } from './lookup';
import { isInSeason } from './season';

/**
 * Marks a source discovered by a colony and emits `food-source-discovered` the first time; true when newly
 * discovered. Colonies without a territory slot cannot hold discovery bits (false).
 */
export function discoverSource(sim: Sim, colonyId: number, sourceId: number, antId: number): boolean {
  const s = sim.stores.sources.get(sourceId);
  const bit = colonySlotBit(sim, colonyId);
  if (!s || bit === 0 || (s.discoveredBy & bit) !== 0) return false;
  s.discoveredBy |= bit;
  sim.emit({
    type: 'food-source-discovered', sourceId, kind: s.kind, variant: s.variant, pos: v3Clone(s.pos), colonyId, byAntId: antId,
  });
  return true;
}

export function isDiscoveredBy(sim: Sim, s: FoodSource, colonyId: number): boolean {
  const bit = colonySlotBit(sim, colonyId);
  return bit !== 0 && (s.discoveredBy & bit) !== 0;
}

/** An `avoid` marker of the colony overlaps the source (GDD 05 §1.8: quality 0 for that colony). */
export function isAvoidedBy(sim: Sim, s: FoodSource, colonyId: number): boolean {
  for (const m of sim.stores.markers.list) {
    if (!m.alive || m.kind !== 'avoid' || m.colony !== colonyId) continue;
    if (dist2(m.pos, s.pos) <= m.radius * m.radius) return true;
  }
  return false;
}

/** Whether the colony has seen it run dry (until it refills). */
export function isExhaustedFor(sim: Sim, s: FoodSource, colonyId: number): boolean {
  const bit = colonySlotBit(sim, colonyId);
  return bit !== 0 && (s.exhaustedBy & bit) !== 0;
}

/** Something to take now: alive, in season and not empty. */
export function isAvailable(sim: Sim, s: FoodSource): boolean {
  return s.alive && !isEmpty(s) && isInSeason(sim, s);
}

/**
 * Attractiveness of the source for a colony, 0..1.3 (GDD 05 §1.1): the trail-strength multiplier of the foraging
 * chapter. 0 when avoided by the colony, exhausted for it or not available; otherwise the record's quality,
 * which the lifecycle keeps current (carrion stage, windfall stage).
 */
export function sourceQuality(sim: Sim, colonyId: number, sourceId: number): number {
  const s = sim.stores.sources.get(sourceId);
  if (!s || !isAvailable(sim, s) || isAvoidedBy(sim, s, colonyId) || isExhaustedFor(sim, s, colonyId)) return 0;
  return s.quality;
}

/**
 * Sources an ant at p can smell now (alive, in season, not empty, p inside the odour radius), nearest first.
 * Writes ids into out (cleared) and returns it.
 */
export function sourcesSmelledFrom(sim: Sim, p: Vec3, out: number[] = []): number[] {
  out.length = 0;
  const bu = sim.world.bu;
  const found: { id: number; d2: number }[] = [];
  forEachSourceNear(sim, p.x, p.z, maxOdourMm(bu), (s) => {
    if (!isAvailable(sim, s)) return;
    const r = odourRadiusMm(s, bu);
    const d2 = dist2(p, s.pos);
    if (d2 <= r * r) found.push({ id: s.id, d2 });
  });
  found.sort((a, b) => a.d2 - b.d2 || a.id - b.id);
  for (const f of found) out.push(f.id);
  return out;
}

/** Optional constraints of nearestSource / findSources. */
export interface SourceFilter {
  kind?: FoodKind;
  variant?: FoodVariant;
  /** Only sources whose unit carries more of this nutrient than the other ('c') or any P at all ('p'). */
  nutrient?: 'c' | 'p';
  /** Only sources the colony has discovered. */
  discoveredOnly?: boolean;
  /** Minimum quality for the colony. */
  minQuality?: number;
  /** Ignore water-only sources unless asked for (GDD 05 §1.2: AI drinks water only with a water need). */
  water?: boolean;
}

function matches(sim: Sim, s: FoodSource, colonyId: number, f: SourceFilter | undefined): boolean {
  if (!isAvailable(sim, s) || isAvoidedBy(sim, s, colonyId) || isExhaustedFor(sim, s, colonyId)) return false;
  const waterOnly = s.c <= 0 && s.p <= 0 && s.water > 0;
  if (waterOnly !== (f?.water ?? false)) return false;
  if (!f) return s.quality > 0;
  if (f.kind && s.kind !== f.kind) return false;
  if (f.variant && s.variant !== f.variant) return false;
  if (f.nutrient === 'c' && !(s.c > s.p)) return false;
  if (f.nutrient === 'p' && !(s.p > 0)) return false;
  if (f.discoveredOnly && !isDiscoveredBy(sim, s, colonyId)) return false;
  return s.quality > 0 && s.quality >= (f.minQuality ?? 0);
}

/** Usable sources within radiusMm of p for the colony, nearest first (ids into out). */
export function findSources(sim: Sim, colonyId: number, p: Vec3, radiusMm: number, filter?: SourceFilter, out: number[] = []): number[] {
  out.length = 0;
  const found: { id: number; d2: number }[] = [];
  const r2 = radiusMm * radiusMm;
  forEachSourceNear(sim, p.x, p.z, radiusMm, (s) => {
    const d2 = dist2(p, s.pos);
    if (d2 <= r2 && matches(sim, s, colonyId, filter)) found.push({ id: s.id, d2 });
  });
  found.sort((a, b) => a.d2 - b.d2 || a.id - b.id);
  for (const f of found) out.push(f.id);
  return out;
}

/** Nearest usable source within radiusMm (optionally of one kind, or matching a filter); -1 none. */
export function nearestSource(sim: Sim, colonyId: number, p: Vec3, radiusMm: number, kind?: FoodKind, filter?: SourceFilter): number {
  const f = kind ? { ...filter, kind } : filter;
  const ids = findSources(sim, colonyId, p, radiusMm, f);
  return ids.length > 0 ? ids[0] : -1;
}

/** Nutrient content left at the source, loads. */
export function nutrientsLeft(s: FoodSource): { c: number; p: number } {
  const a = amountOf(s);
  return { c: a * s.c, p: a * s.p };
}

/** Whether the variant is carrion (for the inspect card and recruitment). */
export function isCarrion(s: FoodSource): boolean {
  return defOf(s)?.carrion ?? false;
}
