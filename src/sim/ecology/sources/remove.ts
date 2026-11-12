// Depletion, exhaustion flags and removal of sources (GDD 05 §1.9).

import type { FoodSource } from '@/sim/types';
import { colonySlotBit, removeSource, type EntityCtx } from '@/sim/entities';

/**
 * Removes a source for good (events food-source-removed, entity-removed) and records its anchor as consumed, so
 * the T1 crumb rule can re-place it.
 */
export function retireSource(ctx: EntityCtx, s: FoodSource, cause: string): boolean {
  if (!removeSource(ctx, s.id, cause)) return false;
  const used = ctx.state.worldDelta.consumedAnchors;
  if (s.anchorId >= 0 && !used.includes(s.anchorId)) used.push(s.anchorId);
  return true;
}

/** Sets the colony's exhausted bit and emits food-source-exhausted the first time (until refilled). */
export function markExhausted(ctx: EntityCtx, s: FoodSource, colonyId: number): void {
  const bit = colonySlotBit(ctx, colonyId);
  if (bit === 0 || (s.exhaustedBy & bit) !== 0) return;
  s.exhaustedBy |= bit;
  ctx.emit({ type: 'food-source-exhausted', sourceId: s.id, colonyId });
}

/** Flags every colony that knows the source as having seen it exhausted (it ran dry with nobody harvesting). */
export function markExhaustedForKnowers(ctx: EntityCtx, s: FoodSource): void {
  const slots = ctx.state.rivals.territory.slotColony;
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] >= 0 && (s.discoveredBy & (1 << i)) !== 0) markExhausted(ctx, s, slots[i]);
  }
}
