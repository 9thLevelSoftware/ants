// Host plants: PlantState records from the world's host assignments (WorldData.placements.plants), their herd
// sites, which sites are free (unoccupied hosts for migrants and dispersing aphids), and herd creation / removal.

import type { Vec3 } from '@/core/math/vec3';
import type { Herd, HerdKind, PlantState, Sim, WorldData } from '@/sim/types';
import { HOST_FLAGS } from '@/sim/types';
import { removeHerd, spawnHerd, spawnPlant, type EntityCtx } from '@/sim/entities';
import { TREE_HERDS_MAX } from '@/sim/balance/ecology';
import { aphidSitesOf, objectOf, retireLinks } from './links';
import { removeClaim } from './claims';

export const HOST_APHID = 1 << HOST_FLAGS.indexOf('aphid');

/** New Game: one PlantState per host plant placement (any host flag), in placement order. */
export function initPlantStates(ctx: EntityCtx, world: WorldData): number {
  let n = 0;
  for (const p of world.placements.plants) {
    if (p.hostFlags === 0) continue;
    spawnPlant(ctx, p.objectId, p.hostClass, p.hostFlags);
    n++;
  }
  return n;
}

const byObject = new WeakMap<Sim, { n: number; m: Map<number, number> }>();

/** PlantState of a world object (live), or undefined. */
export function plantOfObject(sim: Sim, objectId: number): PlantState | undefined {
  let c = byObject.get(sim);
  if (!c || c.n !== sim.stores.plants.list.length) {
    c = { n: sim.stores.plants.list.length, m: new Map() };
    for (const p of sim.stores.plants.list) if (p.alive) c.m.set(p.objectId, p.id);
    byObject.set(sim, c);
  }
  const id = c.m.get(objectId);
  return id !== undefined ? sim.stores.plants.get(id) : undefined;
}

const usableCache = new WeakMap<WorldData, Map<number, number[] | undefined>>();

/** Worldgen's walkable host points of a plant object (PlantPlacement.hostPoiIds; undefined = not evaluated). */
function usablePois(world: WorldData, objectId: number): number[] | undefined {
  let m = usableCache.get(world);
  if (!m) {
    m = new Map();
    for (const p of world.placements.plants) m.set(p.objectId, p.hostPoiIds);
    usableCache.set(world, m);
  }
  return m.get(objectId);
}

/** Usable herd sites of an aphid host: indices into its object's aphid-site list (worldgen's walkable host points). */
export function herdSites(sim: Sim, plant: PlantState): number[] {
  const sites = aphidSitesOf(sim.world, plant.objectId);
  if (sites.length === 0) return objectOf(sim.world, plant.objectId) ? [0] : []; // the herd sits at the object
  const usable = usablePois(sim.world, plant.objectId);
  const out: number[] = [];
  for (let i = 0; i < sites.length; i++) if (!usable || usable.includes(sites[i].id)) out.push(i);
  return out.slice(0, plant.hostClass === 'tree' ? TREE_HERDS_MAX : 1);
}

/** Whether the plant carries aphids at all (host flag). */
export function isAphidHost(plant: PlantState): boolean {
  return plant.alive && (plant.hostFlags & HOST_APHID) !== 0;
}

/** A free herd site of the plant (segment), or -1 when every usable site holds a herd or it is mown. */
export function freeSite(sim: Sim, plant: PlantState): number {
  if (!isAphidHost(plant) || (plant.mownUntilTick >= 0 && sim.state.tick < plant.mownUntilTick)) return -1;
  const used = new Set<number>();
  for (const id of plant.herdIds) {
    const h = sim.stores.herds.get(id);
    if (h) used.add(h.segment);
  }
  for (const s of herdSites(sim, plant)) if (!used.has(s)) return s;
  return -1;
}

/** Ground position of a plant (its object), or null. */
export function plantPos(sim: Sim, plant: PlantState): Vec3 | null {
  return objectOf(sim.world, plant.objectId)?.pos ?? null;
}

/** Unoccupied host sites within radiusMm of p (XZ), nearest first: [plant, segment]. */
export function freeSitesNear(sim: Sim, p: Vec3, radiusMm: number, exceptPlant = -1): { plant: PlantState; segment: number; d: number }[] {
  const out: { plant: PlantState; segment: number; d: number }[] = [];
  for (const pl of sim.stores.plants.list) {
    if (pl.id === exceptPlant || !isAphidHost(pl)) continue;
    const q = plantPos(sim, pl);
    if (!q) continue;
    const d = Math.hypot(q.x - p.x, q.z - p.z);
    if (d > radiusMm) continue;
    const seg = freeSite(sim, pl);
    if (seg >= 0) out.push({ plant: pl, segment: seg, d });
  }
  out.sort((a, b) => a.d - b.d || a.plant.id - b.plant.id);
  return out;
}

/** Founds a herd of `aphids` on a plant's site (events: herd-founded). */
export function foundHerd(ctx: EntityCtx, plant: PlantState, segment: number, aphids: number, kind: HerdKind = 'aphid', init?: Partial<Herd>): Herd {
  return spawnHerd(ctx, plant.id, kind, aphids, { segment, hostQuality: plant.hostQuality, peakA: aphids, ...init });
}

/** Removes a herd with its source, film and claim (event: herd-collapsed; the claimant also gets herd-lost). */
export function dropHerd(sim: Sim, h: Herd, cause: string): void {
  if (!h.alive) return;
  if (h.tenderColony >= 0) {
    sim.emit({ type: 'herd-lost', herdId: h.id, colonyId: h.tenderColony, cause });
    removeClaim(sim.stores.colonies.get(h.tenderColony), h.id);
  }
  retireLinks(sim, h, cause);
  removeHerd(sim, h.id, cause);
}
