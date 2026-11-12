// Plant-state and herd creation (the static plant geometry is in WorldData).

import type { Herd, HerdKind, HostClass, PlantState } from '@/sim/types';
import { TERR_COLONY_SLOTS } from '@/sim/balance';
import { allocId, type EntityCtx } from './context';
import { applyInit } from './util';

export function spawnPlant(ctx: EntityCtx, objectId: number, hostClass: HostClass, hostFlags: number, init?: Partial<PlantState>): PlantState {
  const p: PlantState = {
    id: allocId(ctx.state), alive: true, objectId, hostClass, hostFlags, herdIds: [], nectarPool: -1,
    hostQuality: 1, seedHeads: 0, leafDamage: 0, mownUntilTick: -1,
  };
  applyInit(p, init);
  ctx.stores.plants.add(p);
  ctx.emit({ type: 'entity-created', entity: 'plant', id: p.id });
  return p;
}

export function spawnHerd(ctx: EntityCtx, hostId: number, kind: HerdKind, aphids: number, init?: Partial<Herd>): Herd {
  const host = ctx.stores.plants.get(hostId);
  const h: Herd = {
    id: allocId(ctx.state), alive: true, kind, hostId, hostClass: host ? host.hostClass : 'herb', segment: 0,
    a: aphids, e: 0, pool: 0, tend: 0, hostQuality: host ? host.hostQuality : 1, tenderColony: -1,
    tenderSeconds: new Float32Array(TERR_COLONY_SLOTS), predators: [], mownUntilTick: -1, filmSourceId: -1,
    frozen: false, relocations: 0,
  };
  applyInit(h, init);
  ctx.stores.herds.add(h);
  if (host) host.herdIds.push(h.id);
  ctx.emit({ type: 'herd-founded', herdId: h.id, a: h.a });
  return h;
}

export function removeHerd(ctx: EntityCtx, id: number, cause: string): boolean {
  const h = ctx.stores.herds.get(id);
  if (!h || !ctx.stores.herds.markDead(id)) return false;
  const host = ctx.stores.plants.get(h.hostId);
  if (host) host.herdIds = host.herdIds.filter((x) => x !== id);
  ctx.emit({ type: 'herd-collapsed', herdId: id, a: h.a, cause });
  return true;
}
