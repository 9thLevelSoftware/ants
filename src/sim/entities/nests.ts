// Nest creation and removal.

import type { Vec3 } from '@/core/math/vec3';
import type { ArchitectNeed, Material, Nest, NestKind } from '@/sim/types';
import { ARCHITECT_NEEDS } from '@/sim/types';
import { allocId, type EntityCtx } from './context';
import { applyInit, copyV } from './util';

/** Water level of a dry nest (FloodState.level), mm. */
const DRY_LEVEL = -1e9;

function needRecord<T>(v: T): Record<ArchitectNeed, T> {
  const r = {} as Record<ArchitectNeed, T>;
  for (const n of ARCHITECT_NEEDS) r[n] = v;
  return r;
}

export interface CreateNestOptions {
  colony: number;
  origin: Vec3;
  kind?: NestKind;
  substrate?: Material;
  parentNestId?: number;
  /** Start with a founding dig record (founding queens). */
  founding?: boolean;
  init?: Partial<Nest>;
}

export function createNest(ctx: EntityCtx, o: CreateNestOptions): Nest {
  const t = ctx.state.tick;
  const nest: Nest = {
    id: allocId(ctx.state), alive: true, colony: o.colony, kind: o.kind ?? 'main', parentNestId: o.parentNestId ?? -1,
    origin: copyV(o.origin), substrate: o.substrate ?? 'loam', entrances: [], chambers: [], digPlans: [], moundIds: [],
    architect: { mode: 'auto', needToggles: needRecord(true), lastEvalTick: -1, blacklist: [], needCache: needRecord(0) },
    flood: { water: 0, level: DRY_LEVEL, lastTick: t, floodingSinceTick: -1 },
    founding: o.founding
      ? { state: 'site-search', readiness: 0, cavitySeed: copyV(o.origin), abandoned: [], readyTick: -1, sealedTick: -1 }
      : null,
    collapse: [], volumeOpen: 0,
  };
  applyInit(nest, o.init);
  ctx.stores.nests.add(nest);
  const col = ctx.stores.colonies.get(o.colony);
  if (col) col.nestIds.push(nest.id);
  ctx.emit({ type: 'entity-created', entity: 'nest', id: nest.id });
  return nest;
}

export function removeNest(ctx: EntityCtx, id: number, cause: string): boolean {
  const nest = ctx.stores.nests.get(id);
  if (!nest || !ctx.stores.nests.markDead(id)) return false;
  const col = ctx.stores.colonies.get(nest.colony);
  if (col) col.nestIds = col.nestIds.filter((n) => n !== id);
  ctx.emit({ type: 'entity-removed', entity: 'nest', id, cause });
  return true;
}
