// Adult deaths of every cause (including other modules' kills) are counted from `ant-died` events. The listener
// is attached once per Sim (runtime only); it updates plain counters in state at event flush, deterministically.

import type { Sim } from '@/sim/types';
import { coreOf } from './core';

const watched = new WeakSet<Sim>();

export function watchColonyEvents(sim: Sim): void {
  if (watched.has(sim)) return;
  watched.add(sim);
  sim.events.on('ant-died', (ev) => {
    const col = sim.stores.colonies.get(ev.colonyId);
    if (!col) return;
    col.counters.deaths++;
    const core = coreOf(col);
    core.deathsToday[ev.cause] = (core.deathsToday[ev.cause] ?? 0) + 1;
  });
}
