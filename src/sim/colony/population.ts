// Cumulative population and intake accounting (GDD 02 §13.1) kept in Colony.core.pop: deaths and brood deaths by
// cause, hatched and pupated counts, intake by food kind and by source, unload waits, and the daily full recount
// that checks the incrementally kept adult count (livingAnts) against the store. Group headcounts need no check:
// allocation rebuilds them from the census every cycle.

import type { Colony, ColonyPopulation, IntakeTally, Sim } from '@/sim/types';
import { POP_SOURCE_FORGET_GD } from '@/sim/balance';
import { daysToTicks } from '@/sim/time';
import { coreOf } from './core';

export function popOf(col: Colony): ColonyPopulation {
  const core = coreOf(col);
  let p = core.pop;
  if (!p) {
    p = {
      deathsByCause: {}, broodDeathsByCause: {}, eggsHatched: 0, larvaePupated: 0, intakeByKind: {}, intakeBySource: {},
      unloads: 0, unloadWaitTicks: 0, recountFixes: 0, lastRecountTick: -1,
    };
    core.pop = p;
  }
  return p;
}

function tally(rec: Record<string, IntakeTally>, key: string, c: number, p: number, tick: number): void {
  const t = (rec[key] ??= { n: 0, c: 0, p: 0, lastTick: tick });
  t.n++;
  t.c += c;
  t.p += p;
  t.lastTick = tick;
}

/** Books one accepted delivery by kind and (when sourceId >= 0) by source; `waitTicks` < 0 = not measured. */
export function countDelivery(sim: Sim, col: Colony, sourceId: number, kind: string, c: number, p: number, waitTicks: number): void {
  const pop = popOf(col);
  const now = sim.state.tick;
  tally(pop.intakeByKind, kind, c, p, now);
  if (sourceId >= 0) tally(pop.intakeBySource, String(sourceId), c, p, now);
  if (waitTicks >= 0) {
    pop.unloads++;
    pop.unloadWaitTicks += waitTicks;
  }
}

export function countAdultDeath(col: Colony, cause: string): void {
  const pop = popOf(col);
  pop.deathsByCause[cause] = (pop.deathsByCause[cause] ?? 0) + 1;
}

export function countBroodDeath(col: Colony, cause: string): void {
  const pop = popOf(col);
  pop.broodDeathsByCause[cause] = (pop.broodDeathsByCause[cause] ?? 0) + 1;
}

export function countStageChange(col: Colony, from: string, to: string): void {
  const pop = popOf(col);
  if (from === 'egg' && to === 'larva') pop.eggsHatched++;
  else if (from === 'larva' && to === 'pupa') pop.larvaePupated++;
}

/** Mean unload wait, game seconds (0 before the first measured unload). */
export function meanUnloadWaitS(col: Colony, ticksPerSecond: number): number {
  const pop = col.core?.pop;
  return pop && pop.unloads > 0 ? pop.unloadWaitTicks / pop.unloads / ticksPerSecond : 0;
}

/**
 * Daily full recount (GDD 02 §13.1): living adults recomputed from the ant store. A mismatch is corrected and
 * counted in `recountFixes`. Per-source tallies of sources gone for POP_SOURCE_FORGET_GD are dropped.
 */
export function dailyRecount(sim: Sim, col: Colony): void {
  const pop = popOf(col);
  const now = sim.state.tick;
  pop.lastRecountTick = now;
  let living = 0;
  for (const a of sim.stores.ants.list) if (a.alive && a.colony === col.id) living++;
  if (living !== col.livingAnts) { pop.recountFixes++; col.livingAnts = living; }
  const forget = daysToTicks(POP_SOURCE_FORGET_GD);
  for (const key of Object.keys(pop.intakeBySource)) {
    const src = sim.stores.sources.get(Number(key));
    if ((!src || !src.alive) && now - pop.intakeBySource[key].lastTick > forget) delete pop.intakeBySource[key];
  }
}
