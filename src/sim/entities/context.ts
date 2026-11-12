// What the entity helpers need: state, stores and an event sink. A full Sim satisfies this structurally;
// createNewGame uses a light context before the Sim exists.

import type { SimEvent, SimState, SimStores } from '@/sim/types';
import { FALLBACK_BU_MM } from '@/sim/balance';
import { getSpecies } from '@/sim/species';

export interface EntityCtx {
  state: SimState;
  stores: SimStores;
  emit(ev: SimEvent): void;
  /** Static world, for its body unit. A Sim always has it; when missing, the player species' BU is used. */
  world?: { bu: number };
}

/** Allocates the next entity id (ids are never reused). */
export function allocId(state: SimState): number {
  return state.nextId++;
}

/** Body unit of this world, mm (world BU = the played species' standard worker length, seed §3). */
export function worldBu(ctx: EntityCtx): number {
  return ctx.world?.bu ?? getSpecies(ctx.state.config.world.speciesId)?.buMm ?? FALLBACK_BU_MM;
}
