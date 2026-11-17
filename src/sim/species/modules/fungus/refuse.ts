// Refuse workers (GDD 07 §6.4.4): any ant that hauls garden waste becomes `refuse` (AntFlag.REFUSE) for life; her
// remaining lifespan is halved and she is never again assigned garden or nurse work. Who may haul garden waste:
// small media and media (GDD 07 §6.4.6 stage 8), and refuse workers of any caste.
//
// Local adapter: the colony allocator (src/sim/colony/allocation/groups.ts `eligible`) knows nothing of the flag, so
// it may still hand a refuse worker `nurse`, `queen-care` or `garden`. The guard below runs twice a tick (after the
// allocation pass and after the behaviours, where task cycles re-evaluate) and moves such an ant to `haul` at once,
// where the leafcutter haul behaviour (behaviourHaul.ts) gives her the garden waste. The proper fix is one line in
// `eligible` (reported as a need).

import type { Ant, Colony, Sim, System, Task } from '@/sim/types';
import { AntFlag } from '@/sim/types';
import { switchTask } from '@/sim/colony/allocation/assign';
import { REFUSE_RESCAN_TICKS } from '@/sim/balance/species-leafcutter';
import type { FungusParams } from './params';
import { atColonies } from './economy';

/** Tasks a refuse worker never takes (GDD 07 §6.4.4: "never again assigned garden or nurse"). */
export const REFUSE_BARRED: ReadonlySet<Task> = new Set<Task>(['nurse', 'queen-care', 'garden']);

export function isRefuse(ant: Pick<Ant, 'flags'>): boolean {
  return (ant.flags & AntFlag.REFUSE) !== 0;
}

/** May this ant carry garden waste: small media, media, or an ant that is already a refuse worker. */
export function mayHaulGardenWaste(ant: Pick<Ant, 'caste' | 'flags'>): boolean {
  return isRefuse(ant) || ant.caste === 'media';
}

// Derived cache of refuse worker ids per sim (never persisted): rebuilt from a full scan every REFUSE_RESCAN_TICKS
// (and after a load, on the first ask), and appended to whenever an ant becomes refuse.
const ids = new WeakMap<Sim, { tick: number; list: number[] }>();

function refuseIds(sim: Sim): number[] {
  let c = ids.get(sim);
  if (!c || sim.state.tick - c.tick >= REFUSE_RESCAN_TICKS || sim.state.tick < c.tick) {
    const list: number[] = [];
    for (const a of sim.stores.ants.list) if (a.alive && isRefuse(a)) list.push(a.id);
    c = { tick: sim.state.tick, list };
    ids.set(sim, c);
  }
  return c.list;
}

/** Flags the ant a refuse worker for life; her remaining lifespan x refuseLifespanMult (once). */
export function becomeRefuse(sim: Sim, ant: Ant, P: FungusParams): void {
  if (isRefuse(ant)) return;
  ant.flags |= AntFlag.REFUSE;
  const left = Math.max(0, ant.lifespanGd - ant.physioAgeGd);
  ant.lifespanGd = ant.physioAgeGd + left * P.refuseLifespanMult;
  refuseIds(sim).push(ant.id);
}

/** Moves the colony's refuse workers off the tasks barred to them (to `haul`). Returns how many moved. */
export function guardRefuse(sim: Sim, col: Colony): number {
  let moved = 0;
  for (const id of refuseIds(sim)) {
    const a = sim.stores.ants.get(id);
    if (!a || !a.alive || a.colony !== col.id || !REFUSE_BARRED.has(a.task)) continue;
    if ((a.flags & AntFlag.POSSESSED) !== 0) continue; // the player decides for a possessed ant
    switchTask(sim, col, a, 'haul', 'job:refuse');
    moved++;
  }
  return moved;
}

function runGuard(sim: Sim): void {
  for (const { col } of atColonies(sim)) guardRefuse(sim, col);
}

/** After the colony allocation pass (same phase, later in module order). */
export const refuseGuardAfterAllocation: System = { name: 'fungus-refuse-guard-alloc', phase: 'colony-allocation', run: runGuard };
/** After the behaviours (task cycles re-evaluate there). */
export const refuseGuardAfterBehaviours: System = { name: 'fungus-refuse-guard', phase: 'colony-economy', run: runGuard };
