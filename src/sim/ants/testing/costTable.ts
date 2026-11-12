// Test support (never imported by game code): simulation cost per tick and per system for an in-nest colony of N
// workers with autonomous behaviour (allocation on), measured over several segments; the minimum segment is the
// number to report on a shared, loaded machine (sim-fix-ants item 2).

import type { Sim, System } from '@/sim/types';
import { SYSTEMS } from '@/sim/systems';
import { makeNestColony } from '@/sim/ants/behaviours/nest/testkit';

export interface CostRow {
  workers: number;
  /** Ants in the nest at the end. */
  inNest: number;
  /** Whole tick, ms (minimum over segments). */
  tickMs: number;
  /** Per system, ms per tick, from the segment with the minimum whole tick. */
  systems: Record<string, number>;
}

const clock = (): number => (globalThis as unknown as { performance: { now(): number } }).performance.now();

/** Wraps the systems so that each one's run time is added to `acc`. */
function timed(list: readonly System[], acc: Record<string, number>): System[] {
  return list.map((s) => ({
    ...s,
    run(sim: Sim) {
      const t0 = clock();
      s.run(sim);
      acc[s.name] = (acc[s.name] ?? 0) + clock() - t0;
    },
  }));
}

/** Builds the colony, warms up `warm` ticks, then measures `segments` x `ticks` ticks. */
export function measureCost(workers: number, o: { warm?: number; ticks?: number; segments?: number; seed?: number } = {}): CostRow {
  const acc: Record<string, number> = {};
  const k = makeNestColony({
    workers, seed: o.seed ?? 2, systems: timed(SYSTEMS, acc), stores: { c: 4 * workers, p: 2 * workers },
    brood: [
      { stage: 'egg', n: Math.round(workers / 12), chamber: 'nursery' }, { stage: 'larva', n: Math.round(workers / 12), chamber: 'nursery' },
      { stage: 'pupa', n: Math.round(workers / 12), chamber: 'royal' },
    ],
  });
  const { sim } = k;
  for (let i = 0; i < (o.warm ?? 600); i++) sim.tick();
  let best: CostRow | null = null;
  const n = o.ticks ?? 300;
  for (let s = 0; s < (o.segments ?? 3); s++) {
    for (const key of Object.keys(acc)) acc[key] = 0;
    const t0 = clock();
    for (let i = 0; i < n; i++) sim.tick();
    const tickMs = (clock() - t0) / n;
    if (!best || tickMs < best.tickMs) {
      const systems: Record<string, number> = {};
      for (const [key, v] of Object.entries(acc)) if (v / n >= 0.005) systems[key] = +(v / n).toFixed(3);
      best = { workers, inNest: 0, tickMs: +tickMs.toFixed(3), systems };
    }
  }
  best!.inNest = sim.stores.ants.list.filter((a) => a.alive && a.nestId >= 0).length;
  return best!;
}
