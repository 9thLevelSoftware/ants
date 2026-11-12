// Local adapters for what other modules do not export yet (reported in the beh-forage report).
//
// bookDelivery: the food itself enters the colony pool through the action primitives (trophallaxis-give to a
// nestmate in the nest, put-down of a food item in a chamber), which book it under ledger `in.delivery`. The
// colony's public recordDelivery would deposit it a second time, so this adapter does only its counting half:
// intake by kind and source, the ecology source ledger, the yield-per-forager accumulator and the `delivery`
// event. NEED: a count-only colony API (e.g. `colony.countDelivery`) or delivery booking inside the primitives.

import type { Ant, Sim } from '@/sim/types';
import { recordDelivery as recordSourceDelivery } from '@/sim/ecology';
import { accAdd, coreOf } from '@/sim/colony/core';
import { countDelivery } from '@/sim/colony/population';

export function bookDelivery(sim: Sim, ant: Ant, sourceId: number, kind: string, c: number, p: number, waitTicks: number): void {
  const col = sim.stores.colonies.get(ant.colony);
  if (!col || c + p <= 0) return;
  countDelivery(sim, col, sourceId, kind, c, p, waitTicks);
  recordSourceDelivery(sim, col.id, sourceId, c, p);
  if (ant.task === 'forage' || ant.task === 'scout' || ant.task === 'tend') accAdd(coreOf(col), 'yield.loads', c + p);
  sim.emit({ type: 'delivery', antId: ant.id, colonyId: col.id, sourceId, kind, c, p, toxin: 0 });
}
