// Seed relocation by granary-care workers (GDD 07 §6.3.4): "when a granary's humidity > 0.6 and a drier granary has
// space, care workers move seeds (1 load per trip)". Seeds left in a proto-granary (the chamber they were put down
// in before the colony had a granary chamber) are moved into a granary chamber the same way once one exists.
// The load travels in the worker's blackboard (numbers only), not as an item: a granary's seed is aggregated
// cohorts, and RELOCATE_LOADS is less than one seed item's worth of display.

import type { Ant, Colony, GranaryModule, GranaryState, SeedClass, Sim } from '@/sim/types';
import { SEED_CLASSES } from '@/sim/types';
import { chamberById } from '@/sim/colony/census';
import { RELOCATE_HUMIDITY_MARGIN, RELOCATE_LOADS } from '@/sim/balance/species-harvester';
import type { GranaryParams } from './params';
import { addSeeds, pruneCohorts, cohortStateOf } from './cohorts';
import { ensureGranary, freeOf, granaryChambers, granaryOf, stockOf } from './state';

/** bb keys of a load being relocated: loads, class index, hardness, u, g, degermed (0/1), destination chamber. */
const RL = { loads: 'mb.rl.n', cls: 'mb.rl.c', h: 'mb.rl.h', u: 'mb.rl.u', g: 'mb.rl.g', dg: 'mb.rl.dg', to: 'mb.rl.to' } as const;

function isGranaryChamber(sim: Sim, chamberId: number): boolean {
  return chamberById(sim, chamberId)?.type === 'granary';
}

/**
 * Where seed in granary `from` should go, or null: the driest granary chamber with room that is drier than `from`
 * by RELOCATE_HUMIDITY_MARGIN, when `from` is damper than relocateHumidity or is not a granary chamber at all.
 */
export function relocateTarget(sim: Sim, col: Colony, mod: GranaryModule, g: GranaryParams, from: GranaryState): GranaryState | null {
  if (stockOf(from) <= 0) return null;
  const proto = !isGranaryChamber(sim, from.chamberId);
  const damp = (from.humidity ?? 0) > g.relocateHumidity;
  if (!proto && !damp) return null;
  let best: GranaryState | null = null;
  for (const ch of granaryChambers(sim, col)) {
    if (ch.id === from.chamberId) continue;
    const gr = ensureGranary(sim, mod, g, ch.id);
    if (freeOf(gr) < RELOCATE_LOADS) continue;
    const drier = (gr.humidity ?? 0) < (from.humidity ?? 0) - RELOCATE_HUMIDITY_MARGIN;
    if (!proto && !drier) continue;
    if (!best || (gr.humidity ?? 0) < (best.humidity ?? 0) || ((gr.humidity ?? 0) === (best.humidity ?? 0) && gr.chamberId < best.chamberId)) best = gr;
  }
  return best;
}

/** Whether the ant holds a load being relocated. */
export function carriesRelocated(ant: Ant): boolean {
  return (ant.bb[RL.loads] ?? 0) > 0;
}

/** Destination chamber of the ant's relocated load, -1 none. */
export function relocateDest(ant: Ant): number {
  return carriesRelocated(ant) ? ant.bb[RL.to] : -1;
}

/**
 * Takes up to RELOCATE_LOADS from the dampest cohort of `from` (seed whose radicle is out stays for the gnawers)
 * onto the ant, bound for `to`. Returns the loads taken.
 */
export function takeForRelocation(ant: Ant, g: GranaryParams, from: GranaryState, to: GranaryState): number {
  let pick = null;
  for (const c of from.cohorts) {
    if (c.loads <= 0 || c.state === 'germinating' || c.state === 'sprouted') continue;
    if (!pick || c.u > pick.u) pick = c;
  }
  if (!pick) return 0;
  const n = Math.min(RELOCATE_LOADS, pick.loads);
  pick.loads -= n;
  pick.state = cohortStateOf(g, pick);
  pruneCohorts(from);
  ant.bb[RL.loads] = n;
  ant.bb[RL.cls] = SEED_CLASSES.indexOf(pick.seedClass);
  ant.bb[RL.h] = pick.hardness;
  ant.bb[RL.u] = pick.u;
  ant.bb[RL.g] = pick.g;
  ant.bb[RL.dg] = pick.degermed ? 1 : 0;
  ant.bb[RL.to] = to.chamberId;
  return n;
}

/**
 * Puts the ant's relocated load into the granary of `chamberId` (its destination on arrival); when that record is
 * gone, into the destination or any granary of the colony, so seed is never lost. Clears the load.
 */
export function putRelocated(sim: Sim, ant: Ant, g: GranaryParams, chamberId: number): void {
  const n = ant.bb[RL.loads] ?? 0;
  const mod = sim.stores.colonies.get(ant.colony)?.granary;
  if (n > 0 && mod) {
    const gr = granaryOf(mod, chamberId) ?? granaryOf(mod, ant.bb[RL.to] ?? -1) ?? mod.granaries[0];
    const cls: SeedClass = SEED_CLASSES[ant.bb[RL.cls] ?? 0] ?? 'S';
    if (gr) addSeeds(gr, g, cls, ant.bb[RL.h] ?? 0.5, n, ant.bb[RL.u] ?? 0.3, ant.bb[RL.g] ?? 0, (ant.bb[RL.dg] ?? 0) === 1);
  }
  for (const k of Object.values(RL)) delete ant.bb[k];
}
