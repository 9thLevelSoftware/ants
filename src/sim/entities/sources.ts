// Food source creation and removal.

import type { Vec3 } from '@/core/math/vec3';
import type { FoodKind, FoodSource } from '@/sim/types';
import { SEASONS } from '@/sim/types';
import { allocId, type EntityCtx } from './context';
import { applyInit, copyV, v3 } from './util';

export interface SpawnSourceOptions {
  kind: FoodKind;
  pos: Vec3;
  up?: Vec3;
  /** Units available (also the capacity unless init.capacity is given). */
  units: number;
  init?: Partial<FoodSource>;
}

export function spawnSource(ctx: EntityCtx, o: SpawnSourceOptions): FoodSource {
  const s: FoodSource = {
    id: allocId(ctx.state), alive: true, kind: o.kind, variant: null, pos: copyV(o.pos), up: o.up ? copyV(o.up) : v3(0, 1, 0),
    objectId: -1, plantId: -1, herdId: -1, anchorId: -1, units: o.units, capacity: o.units, unitBulk: 1,
    c: 0, p: 0, toxin: 0, water: 0, pool: -1, poolCap: 0, refillPerGd: 0, decayPerGd: 0, quality: 1, hardness: 1,
    slots: 1, drinkRateMult: 1, odour: 1, stage: null, stageClock: 0, discoveredBy: 0, avoidBy: 0, exhaustedBy: 0,
    tendedBy: -1, seasonMask: (1 << SEASONS.length) - 1, spawnedTick: ctx.state.tick,
  };
  applyInit(s, o.init);
  ctx.stores.sources.add(s);
  ctx.emit({ type: 'entity-created', entity: 'source', id: s.id });
  ctx.emit({ type: 'food-source-spawned', sourceId: s.id, kind: s.kind, variant: s.variant, pos: copyV(s.pos) });
  return s;
}

/** Bit of a colony in the `discoveredBy` / `avoidBy` / `exhaustedBy` masks: its territory slot (0 = player). */
export function colonySlotBit(ctx: EntityCtx, colonyId: number): number {
  const slot = ctx.state.rivals.territory.slotColony.indexOf(colonyId);
  return slot < 0 ? 0 : 1 << slot;
}

export function removeSource(ctx: EntityCtx, id: number, cause: string): boolean {
  if (!ctx.stores.sources.markDead(id)) return false;
  ctx.emit({ type: 'food-source-removed', sourceId: id, cause });
  ctx.emit({ type: 'entity-removed', entity: 'source', id, cause });
  return true;
}
