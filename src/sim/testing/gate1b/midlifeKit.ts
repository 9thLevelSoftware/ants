// Test support for the gate 1B robustness tests (never imported by game code): read-outs of a running colony.
import type { Sim } from '@/sim/types';
import { TRAIL_DETECT } from '@/sim/balance/pheromone';

/** Trail cells of colony 0 at or above TRAIL_DETECT. */
export function trailCellsOf(sim: Sim): number {
  const col = sim.state.colonies[0].id;
  let n = 0;
  for (const l of sim.state.phero.layers) {
    if (l.colony !== col || l.channel !== 'trail') continue;
    for (const c of l.chunks) for (let i = 0; i < c.length; i++) if (c[i] >= TRAIL_DETECT) n++;
  }
  return n;
}

/** Workers carrying something, with a loaded crop, outside; live dig plans. */
export function midLifeReadout(sim: Sim): { carrying: number; cropLoaded: number; outside: number; livePlans: number } {
  let carrying = 0, cropLoaded = 0, outside = 0, livePlans = 0;
  for (const a of sim.state.ants) {
    if (!a.alive || a.caste === 'queen') continue;
    if (a.carry.kind !== 'none') carrying++;
    if (a.cropC + a.cropP > 0.2) cropLoaded++;
    if (a.nestId < 0) outside++;
  }
  for (const n of sim.state.nests) for (const p of n.digPlans) if (p.status !== 'complete' && p.status !== 'cancelled') livePlans++;
  return { carrying, cropLoaded, outside, livePlans };
}
