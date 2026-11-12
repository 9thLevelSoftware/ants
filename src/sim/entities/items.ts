// Item creation and removal.

import type { Vec3 } from '@/core/math/vec3';
import type { Item, ItemKind } from '@/sim/types';
import { allocId, type EntityCtx } from './context';
import { applyInit, copyV } from './util';

export interface SpawnItemOptions {
  kind: ItemKind;
  pos: Vec3;
  /** Any other field (c, p, bulk, foodKind, volume, material, nestId ...). */
  init?: Partial<Item>;
}

export function spawnItem(ctx: EntityCtx, o: SpawnItemOptions): Item {
  const t = ctx.state.tick;
  const it: Item = {
    id: allocId(ctx.state), alive: true, kind: o.kind, pos: copyV(o.pos), c: 0, p: 0, toxin: 0, water: 0,
    count: 1, bulk: 1, massMg: 0, lengthMm: 0, hardness: 1, carriedBy: -1, carriers: [], nestId: -1,
    chamberId: -1, decay: 0, foodKind: null, variant: null, wasteKind: null, stage: null, stageClock: 0,
    volume: 0, material: null, droppedTick: t, inNest: false, spoilPlanId: -1, reservedBy: -1,
    necroCueTick: -1, species: null, colony: -1, unreachableBy: 0, aliveUntilTick: -1, createdTick: t,
  };
  applyInit(it, o.init);
  ctx.stores.items.add(it);
  ctx.emit({ type: 'entity-created', entity: 'item', id: it.id });
  return it;
}

/** Removes an item (eaten, dumped into a mound, washed away ...). Frees its carrier's mandibles. */
export function removeItem(ctx: EntityCtx, id: number, cause: string): boolean {
  const it = ctx.stores.items.get(id);
  if (!it) return false;
  for (const antId of it.carriers.length > 0 ? it.carriers : [it.carriedBy]) {
    const ant = ctx.stores.ants.get(antId);
    if (ant && ant.carry.kind === 'item' && ant.carry.id === id) ant.carry = { kind: 'none', id: -1 };
  }
  ctx.stores.items.markDead(id);
  ctx.emit({ type: 'entity-removed', entity: 'item', id, cause });
  return true;
}
