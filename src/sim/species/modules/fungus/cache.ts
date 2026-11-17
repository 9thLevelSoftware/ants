// The leaf cache and the pulp of a garden chamber (GDD 07 §6.4.6 stages 3-5): fragments wait in the chamber and lose
// half their quality after cacheSpoilGd, and become waste after cacheWasteGd (event `leaf-cache-spoiled`); chewed
// pulp that is not planted dries and is lost after pulpDryGd.

import type { Colony, GardenRecord, LeafLot, Sim } from '@/sim/types';
import { TICKS_PER_DAY } from '@/sim/time';
import { removeItem } from '@/sim/entities';
import { LEAF_TRAITS } from '@/sim/balance/species-leafcutter';
import type { FungusParams } from './params';

/** Quality of a cached lot now (halved once it is older than the spoil age). */
export function lotQuality(P: FungusParams, lot: LeafLot, tick: number): number {
  return tick - lot.tick >= P.cacheSpoilGd * TICKS_PER_DAY ? lot.q * P.cacheSpoilQMult : lot.q;
}

/** LU waiting in a list of lots. */
export function lotsLu(lots: readonly LeafLot[] | undefined): number {
  let s = 0;
  for (const l of lots ?? []) s += l.lu;
  return s;
}

/** Adds leaf to the cache of a garden (a fragment put down in its chamber). */
export function addToCache(g: GardenRecord, lot: LeafLot): void {
  (g.cache ??= []).push({ ...lot });
}

/** Takes up to `lu` from the oldest lots of a list (first in, first out); returns what was taken (merged traits). */
export function takeLots(P: FungusParams, lots: LeafLot[], lu: number, tick: number, ageQuality: boolean): LeafLot | null {
  let left = lu, got = 0, q = 0, p = 0, t = 0, plant = -1, plantLu = 0;
  while (left > 1e-9 && lots.length > 0) {
    const l = lots[0];
    const x = Math.min(left, l.lu);
    const lq = ageQuality ? lotQuality(P, l, tick) : l.q;
    got += x; q += lq * x; p += l.p * x; t += l.t * x;
    if (x > plantLu) { plant = l.plantId; plantLu = x; }
    l.lu -= x;
    left -= x;
    if (l.lu <= 1e-9) lots.shift();
  }
  return got > 1e-9 ? { lu: got, q: q / got, p: p / got, t: t / got, plantId: plant, tick } : null;
}

/** Ages a garden's cache and pulp: old fragments to waste, dried pulp lost. */
export function ageCache(sim: Sim, _col: Colony, g: GardenRecord, P: FungusParams): void {
  const tick = sim.state.tick;
  const cache = g.cache ?? [];
  let spoiled = 0;
  while (cache.length > 0 && tick - cache[0].tick >= P.cacheWasteGd * TICKS_PER_DAY) {
    spoiled += cache[0].lu;
    cache.shift();
  }
  if (spoiled > 0) {
    g.waste += spoiled;
    sim.emit({ type: 'leaf-cache-spoiled', chamberId: g.chamberId, loads: spoiled });
  }
  const pulp = g.pulp ?? [];
  while (pulp.length > 0 && tick - pulp[0].tick >= P.pulpDryGd * TICKS_PER_DAY) pulp.shift();
}

/**
 * Leaf fragments lying in a garden's chamber (a possessed cutter put hers down there; the AI delivers straight into
 * the cache) join the cache. The fragment item keeps no plant traits, so the lot takes the garden's recent substrate
 * traits (or the default plant's): an abstraction for the player's own deliveries. Returns LU absorbed.
 */
export function absorbLyingFragments(sim: Sim, col: Colony, g: GardenRecord): number {
  let lu = 0;
  const d = LEAF_TRAITS.default;
  for (const it of sim.stores.items.list) {
    if (!it.alive || it.kind !== 'leaf-fragment' || it.carrierIds.length > 0 || !it.inNest || it.chamberId !== g.chamberId) continue;
    if (it.colony !== col.id) continue;
    addToCache(g, { lu: it.bulk, q: g.subQ ?? d[0], p: g.subP ?? d[1], t: g.subT ?? d[2], plantId: -1, tick: sim.state.tick });
    lu += it.bulk;
    removeItem(sim, it.id, 'delivered');
  }
  return lu;
}
