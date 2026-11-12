// Brood creation and removal.

import type { Vec3 } from '@/core/math/vec3';
import type { Brood, BroodDeathCause, BroodStage, Caste } from '@/sim/types';
import { allocId, type EntityCtx } from './context';
import { applyInit, copyV } from './util';

export interface SpawnBroodOptions {
  colony: number;
  stage: BroodStage;
  destined: Caste;
  pos: Vec3;
  nestId?: number;
  chamberId?: number;
  /** Extra fields (progress, flags, destinedLengthBu ...). */
  init?: Partial<Brood>;
}

export function spawnBrood(ctx: EntityCtx, o: SpawnBroodOptions): Brood {
  const t = ctx.state.tick;
  const b: Brood = {
    id: allocId(ctx.state), alive: true, colony: o.colony, stage: o.stage, destined: o.destined, flags: 0,
    progress: 0, gutC: 0, gutP: 0, fedC: 0, fedP: 0, hunger: 0, hungerTicks: 0, pStarveTicks: 0,
    lastTendedTick: t, pos: copyV(o.pos), nestId: o.nestId ?? -1, chamberId: o.chamberId ?? -1, carriedBy: -1,
    laidTick: t, stageTick: t, destinedLengthBu: 1, animalPShare: 0,
  };
  applyInit(b, o.init);
  ctx.stores.brood.add(b);
  ctx.emit({ type: 'entity-created', entity: 'brood', id: b.id });
  return b;
}

/** Brood death; queues `brood-died`. Eclosion uses removeEclosedBrood instead. */
export function killBrood(ctx: EntityCtx, id: number, cause: BroodDeathCause): boolean {
  const b = ctx.stores.brood.get(id);
  if (!b || !ctx.stores.brood.markDead(id)) return false;
  ctx.emit({ type: 'brood-died', broodId: id, stage: b.stage, cause });
  ctx.emit({ type: 'entity-removed', entity: 'brood', id, cause });
  return true;
}

/** Removes a pupa that eclosed into an ant (no death event). */
export function removeEclosedBrood(ctx: EntityCtx, id: number): boolean {
  if (!ctx.stores.brood.markDead(id)) return false;
  ctx.emit({ type: 'entity-removed', entity: 'brood', id, cause: 'eclosed' });
  return true;
}
