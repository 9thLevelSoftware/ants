// How herds sit in the world: the herd point on the plant, the herd's own food source (what `tend-aphid` aims at and
// what the colony discovers) and the honeydew film below it.
//
// Representation (decision, reported): the herd's honeydew pool lives in Herd.pool only. Its `aphid-herd` source
// keeps units 0, so foragers never drink it with harvest-liquid (GDD 05 §1.2: honeydew comes by `tend-aphid`) and it
// adds nothing to the colony's forage capacity; it carries the herd's position, odour, slots and discovery bits.
// The film is a normal liquid source (created with herdId -1 so it stays drinkable; Herd.filmSourceId links it).
// Every link is derived from persisted data (herd id on the source, filmSourceId); the caches here are rebuilt.

import { v3Clone, type Vec3 } from '@/core/math/vec3';
import type { FoodSource, Herd, Poi, Sim, WorldData, WorldObject } from '@/sim/types';
import { createSource } from '../sources/spawn';
import { retireSource } from '../sources/remove';
import { surfacePointAt } from '../sources/util';
import { tendSlots } from './herdMath';

const HERD_VARIANTS = new Set(['aphid-herd', 'scale-herd']);

interface WorldIndex {
  objects: Map<number, WorldObject>;
  /** Aphid-site points per object, in WorldData.pois order (the order Herd.segment indexes). */
  aphidSites: Map<number, Poi[]>;
}
const worldIndex = new WeakMap<WorldData, WorldIndex>();

function indexOf(world: WorldData): WorldIndex {
  let ix = worldIndex.get(world);
  if (ix && ix.objects.size === world.objects.length) return ix;
  ix = { objects: new Map(), aphidSites: new Map() };
  for (const o of world.objects) ix.objects.set(o.id, o);
  for (const p of world.pois) {
    if (p.kind !== 'aphid-site') continue;
    const o = ix.objects.get(p.objectId);
    if (!o || !o.poiIds.includes(p.id)) continue;
    let l = ix.aphidSites.get(o.id);
    if (!l) { l = []; ix.aphidSites.set(o.id, l); }
    l.push(p);
  }
  worldIndex.set(world, ix);
  return ix;
}

export function objectOf(world: WorldData, objectId: number): WorldObject | undefined {
  return indexOf(world).objects.get(objectId);
}

/** The object's aphid-site points (empty when it has none). */
export function aphidSitesOf(world: WorldData, objectId: number): readonly Poi[] {
  return indexOf(world).aphidSites.get(objectId) ?? [];
}

/**
 * Where a herd sits: its plant's aphid-site point by segment, else the plant object's base, else its film. Same
 * rule as the creatures module's herdSite (aphid predators walk to the same point).
 */
export function herdPoint(sim: Sim, h: Herd): Vec3 | null {
  const src = herdSourceOf(sim, h);
  if (src) return src.pos;
  return sitePoint(sim, h);
}

function sitePoint(sim: Sim, h: Herd): Vec3 | null {
  const plant = sim.stores.plants.get(h.hostId);
  const obj = plant ? objectOf(sim.world, plant.objectId) : undefined;
  if (obj) {
    const sites = aphidSitesOf(sim.world, obj.id);
    if (sites.length > 0) return v3Clone(sites[Math.abs(h.segment) % sites.length].pos);
    return v3Clone(obj.pos);
  }
  const film = sim.stores.sources.get(h.filmSourceId);
  return film ? v3Clone(film.pos) : null;
}

// ---- herd source ----

const sourceCache = new WeakMap<Sim, Map<number, number>>();

function cacheOf(sim: Sim): Map<number, number> {
  let m = sourceCache.get(sim);
  if (!m) { m = new Map(); sourceCache.set(sim, m); }
  return m;
}

export function isHerdSource(s: FoodSource): boolean {
  return s.variant !== null && HERD_VARIANTS.has(s.variant) && s.herdId >= 0;
}

/** Cache value of a herd known to have no source (ensureLinks is the only creator of herd sources, and it updates
 * the cache; a fresh Sim, e.g. after load, starts with an empty cache). */
const NO_SOURCE = -1;

/** The herd's own source (variant aphid-herd), or undefined. */
export function herdSourceOf(sim: Sim, h: Herd): FoodSource | undefined {
  const m = cacheOf(sim);
  const id = m.get(h.id);
  if (id === NO_SOURCE) return undefined;
  const hit = id !== undefined ? sim.stores.sources.get(id) : undefined;
  if (hit && hit.alive && hit.herdId === h.id && isHerdSource(hit)) return hit;
  for (const s of sim.stores.sources.list) {
    if (s.alive && s.herdId === h.id && isHerdSource(s)) { m.set(h.id, s.id); return s; }
  }
  m.set(h.id, NO_SOURCE);
  return undefined;
}

/** The herd behind a herd source (undefined for any other source). */
export function herdOfSource(sim: Sim, sourceId: number): Herd | undefined {
  const s = sim.stores.sources.get(sourceId);
  if (!s || !isHerdSource(s)) return undefined;
  return sim.stores.herds.get(s.herdId);
}

const tmp: Vec3 = { x: 0, y: 0, z: 0 };

/** Creates the herd's source and film when missing (herds spawned by any code get them on first sight). */
export function ensureLinks(sim: Sim, h: Herd): void {
  const plant = sim.stores.plants.get(h.hostId);
  let src = herdSourceOf(sim, h);
  if (!src) {
    const p = sitePoint(sim, h);
    if (!p) return;
    src = createSource(sim, {
      variant: h.kind === 'scale' ? 'scale-herd' : 'aphid-herd', pos: p, up: normalAt(sim, p), units: 0,
      objectId: plant?.objectId ?? -1, plantId: h.hostId, herdId: h.id, tier: 2,
    });
    src.slots = tendSlots(h.a);
    cacheOf(sim).set(h.id, src.id);
  }
  if (!sim.stores.sources.get(h.filmSourceId)) {
    // the film lies on the ground (or the surface) under the herd
    const ok = surfacePointAt(sim.world, sim.field, src.pos.x, src.pos.z, tmp);
    const film = createSource(sim, {
      variant: 'honeydew-film', pos: ok ? v3Clone(tmp) : v3Clone(src.pos), objectId: plant?.objectId ?? -1,
      plantId: h.hostId, tier: 2, empty: true,
    });
    h.filmSourceId = film.id;
  }
}

function normalAt(sim: Sim, p: Vec3): Vec3 {
  const n = { x: 0, y: 1, z: 0 };
  sim.field.normal(p, n);
  return Number.isFinite(n.x + n.y + n.z) ? n : { x: 0, y: 1, z: 0 };
}

/** Removes the herd's source and film (herd gone). */
export function retireLinks(sim: Sim, h: Herd, cause: string): void {
  const src = herdSourceOf(sim, h);
  if (src) retireSource(sim, src, cause);
  const film = sim.stores.sources.get(h.filmSourceId);
  if (film) retireSource(sim, film, cause);
  cacheOf(sim).delete(h.id);
}
