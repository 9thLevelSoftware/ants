// Marker placement and removal (validation of caps and positions belongs to the colony/markers module).

import type { Vec3 } from '@/core/math/vec3';
import type { Marker, MarkerKind, MarkerParams } from '@/sim/types';
import { allocId, type EntityCtx } from './context';
import { applyInit, copyV } from './util';

export interface PlaceMarkerOptions {
  kind: MarkerKind;
  colony: number;
  pos: Vec3;
  /** mm */
  radius: number;
  params?: Partial<MarkerParams>;
  /** Tick it expires, -1 never. */
  expiresTick?: number;
}

export function placeMarker(ctx: EntityCtx, o: PlaceMarkerOptions): Marker {
  const params: MarkerParams = { mode: null, chamberType: null, targetChamberId: -1, sourceChamberId: -1, planId: -1 };
  applyInit(params, o.params);
  const m: Marker = {
    id: allocId(ctx.state), alive: true, kind: o.kind, pos: copyV(o.pos), radius: o.radius, colony: o.colony,
    params, placedTick: ctx.state.tick, expiresTick: o.expiresTick ?? -1,
  };
  ctx.stores.markers.add(m);
  ctx.emit({ type: 'entity-created', entity: 'marker', id: m.id });
  return m;
}

export function removeMarker(ctx: EntityCtx, id: number, cause: string): boolean {
  if (!ctx.stores.markers.markDead(id)) return false;
  ctx.emit({ type: 'entity-removed', entity: 'marker', id, cause });
  return true;
}
