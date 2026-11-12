// Delivery booking of the outdoor behaviours. The food itself enters the colony pool through the action primitives
// (trophallaxis-give to a nestmate in the nest, unload-crop into a food chamber, put-down of a food item in a
// chamber), which book it under ledger `in.delivery`; this books only the counting half through the colony's
// count-only API (intake by kind and source, the ecology source ledger, yield per forager, the `delivery` event).

import type { Ant, Sim } from '@/sim/types';
import { recordDeliveryCount } from '@/sim/colony';

export function bookDelivery(sim: Sim, ant: Ant, sourceId: number, kind: string, c: number, p: number, waitTicks: number): void {
  recordDeliveryCount(sim, ant, sourceId, kind, c, p, 0, waitTicks);
}
