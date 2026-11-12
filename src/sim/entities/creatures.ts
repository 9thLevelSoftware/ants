// Creature creation, death and despawning.

import type { Vec3 } from '@/core/math/vec3';
import type { Creature, CreatureKind } from '@/sim/types';
import { DEFAULT_ARRIVE_BU, FOOT_OFFSET_BU } from '@/sim/balance';
import { allocId, worldBu, type EntityCtx } from './context';
import { newWalker } from './walker';
import { applyInit, copyV, v3 } from './util';

export interface SpawnCreatureOptions {
  kind: CreatureKind;
  /** On the surface (or cavity wall), mm. The walker is lifted by its foot offset along `up`, as for ants. */
  pos: Vec3;
  up?: Vec3;
  fwd?: Vec3;
  /** Body radius, mm (collision); creature modules supply the real value. */
  radiusMm?: number;
  maxHp?: number;
  init?: Partial<Creature>;
}

export function spawnCreature(ctx: EntityCtx, o: SpawnCreatureOptions): Creature {
  const up = o.up ?? v3(0, 1, 0);
  const fwd = o.fwd ?? v3(1, 0, 0);
  const bu = worldBu(ctx);
  const foot = FOOT_OFFSET_BU * bu;
  const pos = { x: o.pos.x + up.x * foot, y: o.pos.y + up.y * foot, z: o.pos.z + up.z * foot };
  const w = newWalker(pos, up, fwd, foot, o.radiusMm ?? bu, DEFAULT_ARRIVE_BU * bu);
  const hp = o.maxHp ?? 1;
  const c: Creature = {
    ...w, id: allocId(ctx.state), alive: true, kind: o.kind, variant: null, hp, maxHp: hp, state: 'idle',
    stateTick: ctx.state.tick, stateTimer: 0, target: { kind: 'none', id: -1, pos: copyV(pos) },
    homeCenter: copyV(o.pos), homeRadius: 0, territoryId: -1, deterrence: 0, harass: 0, seizedAntId: -1,
    eaten: 0, lifeEndTick: -1, nestId: -1, thinkTick: ctx.state.tick, flags: 0, bb: {},
  };
  applyInit(c, o.init);
  ctx.stores.creatures.add(c);
  ctx.emit({ type: 'entity-created', entity: 'creature', id: c.id });
  ctx.emit({ type: 'creature-spawned', id: c.id, kind: c.kind, variant: c.variant });
  return c;
}

export function killCreature(ctx: EntityCtx, id: number, cause: string): boolean {
  const c = ctx.stores.creatures.get(id);
  if (!c || !ctx.stores.creatures.markDead(id)) return false;
  ctx.emit({ type: 'creature-died', id, kind: c.kind, cause });
  ctx.emit({ type: 'entity-removed', entity: 'creature', id, cause });
  return true;
}

/** Removes a creature that left the area (not a death). */
export function despawnCreature(ctx: EntityCtx, id: number, cause: string): boolean {
  const c = ctx.stores.creatures.get(id);
  if (!c || !ctx.stores.creatures.markDead(id)) return false;
  ctx.emit({ type: 'creature-despawned', id, kind: c.kind, cause });
  ctx.emit({ type: 'entity-removed', entity: 'creature', id, cause });
  return true;
}
